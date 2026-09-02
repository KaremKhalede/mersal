import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/db";
import { getTripDetail, cancelTrip, assignTripCrew } from "@/modules/trips/service";
import { getBranchScope } from "@/lib/branch-scope";
import { assertCan } from "@/lib/rbac";
import { nextTripNumber, nextShipmentNumber } from "@/lib/ids";

test.describe("Target Access Policy - Trip Scope Redaction & Administration", () => {
  let companyId: string;
  let riyadhId: string;
  let jeddahId: string;
  let seiyunId: string;
  let tripId: string;
  let adminUserId: string;

  let mockRiyadhUser: any;
  let mockJeddahUser: any;
  let mockSeiyunUser: any;
  let mockAdmin: any;

  test.beforeAll(async () => {
    // 1. Setup Company and Branches
    const company = await prisma.company.create({ data: { name: "Test Company Trip Scope", slug: `test-company-${Date.now()}` } });
    companyId = company.id;

    const [riyadh, jeddah, seiyun] = await Promise.all([
      prisma.branch.create({ data: { companyId, name: "الرياض (أصل)", status: "ACTIVE", city: "الرياض", country: "SA" } }),
      prisma.branch.create({ data: { companyId, name: "جدة (وسيط)", status: "ACTIVE", city: "جدة", country: "SA" } }),
      prisma.branch.create({ data: { companyId, name: "سيئون (وجهة)", status: "ACTIVE", city: "سيئون", country: "YE" } }),
    ]);
    riyadhId = riyadh.id;
    jeddahId = jeddah.id;
    seiyunId = seiyun.id;

    // 2. Setup Role
    const role = await prisma.role.create({
      data: {
        companyId,
        name: "Branch Ops",
        permissions: JSON.stringify({ trips: ["view", "create", "edit", "assignDriver"] }),
      },
    });

    // 3. Setup Users
    mockRiyadhUser = { id: "u-riyadh", userType: "COMPANY_USER", companyId, branchId: riyadhId, role };
    mockJeddahUser = { id: "u-jeddah", userType: "COMPANY_USER", companyId, branchId: jeddahId, role };
    mockSeiyunUser = { id: "u-seiyun", userType: "COMPANY_USER", companyId, branchId: seiyunId, role };
    mockAdmin = { id: "u-admin", userType: "COMPANY_USER", companyId, branchId: null, role: { name: "company_admin" } };
    adminUserId = "admin-123"; // just a placeholder string

    // 4. Setup Customer
    const customer = await prisma.customer.create({
      data: { companyId, name: "عميل حساس الرياض", phone: "0500000001", status: "ACTIVE" },
    });

    // 5. Setup Shipment (Riyadh -> Seiyun)
    const shipment = await prisma.shipment.create({
      data: {
        companyId,
        shipmentNumber: await nextShipmentNumber(),
        trackingToken: `trk-${Date.now()}`,
        customerId: customer.id,
        receiverName: "مستلم حساس سيئون",
        receiverPhone: "0500000002",
        loadBranchId: riyadhId,
        unloadBranchId: seiyunId,
        currentBranchId: riyadhId,
        totalCartons: 5,
        weightKg: 100,
        amountPaid: 500,
        notes: "ملاحظات سرية",
      },
    });

    // 6. Setup Trip (Riyadh -> Jeddah -> Seiyun)
    const trip = await prisma.trip.create({
      data: {
        companyId,
        tripNumber: await nextTripNumber(),
        status: "PLANNED",
        stops: {
          create: [
            { branchId: riyadhId, sequence: 1, loadingEnabled: true, unloadingEnabled: false },
            { branchId: jeddahId, sequence: 2, loadingEnabled: true, unloadingEnabled: true },
            { branchId: seiyunId, sequence: 3, loadingEnabled: false, unloadingEnabled: true },
          ],
        },
      },
      include: { stops: { orderBy: { sequence: "asc" } } },
    });
    tripId = trip.id;

    // 7. Link Shipment to Trip (Load at Riyadh, Unload at Seiyun)
    await prisma.tripShipmentStop.create({
      data: {
        tripId,
        shipmentId: shipment.id,
        loadStopId: trip.stops[0].id,
        unloadStopId: trip.stops[2].id,
      },
    });
  });

  test.afterAll(async () => {
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
  });

  test("Riyadh employee (ORIGIN) sees full PII and can assign crew / cancel trip", async () => {
    const detail = await getTripDetail(companyId, tripId, mockRiyadhUser.branchId);
    const shipmentLoads = detail!.stops[0].shipmentLoads;
    
    // PII should be intact
    expect(shipmentLoads[0].shipment.customer.name).toBe("عميل حساس الرياض");
    expect(shipmentLoads[0].shipment.receiverName).toBe("مستلم حساس سيئون");
    expect(shipmentLoads[0].shipment.weightKg).toBe(100);

    // Should NOT throw
    await assignTripCrew({
      companyId,
      tripId,
      driverId: null,
      vehicleId: null,
      userId: mockRiyadhUser.id,
      branchScope: mockRiyadhUser.branchId,
    });
  });

  test("Jeddah employee (INTERMEDIATE) sees REDACTED PII and CANNOT assign crew / cancel", async () => {
    const detail = await getTripDetail(companyId, tripId, mockJeddahUser.branchId);
    
    // Find the Riyadh load stop in the returned trip
    const riyadhStop = detail!.stops.find(s => s.branchId === riyadhId);
    const shipmentLink = riyadhStop!.shipmentLoads[0];
    
    // PII should be redacted
    expect(shipmentLink.shipment.customer.name).toBe("شحنة عابرة (Transit)");
    expect(shipmentLink.shipment.customer.phone).toBe("---");
    expect(shipmentLink.shipment.receiverName).toBe("بيانات المستلم غير متاحة لهذه المحطة");
    expect(shipmentLink.shipment.receiverPhone).toBe("---");
    expect(shipmentLink.shipment.weightKg).toBeNull();
    expect(shipmentLink.shipment.amountPaid).toBeNull();
    expect(shipmentLink.shipment.notes).toBeNull();

    // Admin action should throw
    await expect(cancelTrip(companyId, tripId, mockJeddahUser.id, mockJeddahUser.branchId))
      .rejects.toThrow("FORBIDDEN: outside assigned branch");
      
    await expect(assignTripCrew({
      companyId,
      tripId,
      driverId: null,
      vehicleId: null,
      userId: mockJeddahUser.id,
      branchScope: mockJeddahUser.branchId,
    })).rejects.toThrow("FORBIDDEN: outside assigned branch");
  });

  test("Seiyun employee (DESTINATION) sees full PII because they unload it, but CANNOT cancel trip", async () => {
    const detail = await getTripDetail(companyId, tripId, mockSeiyunUser.branchId);
    
    const riyadhStop = detail!.stops.find(s => s.branchId === riyadhId);
    const shipmentLink = riyadhStop!.shipmentLoads[0];
    
    // PII should be intact since Seiyun is the unload branch for this shipment!
    expect(shipmentLink.shipment.customer.name).toBe("عميل حساس الرياض");
    
    // But they still can't cancel the trip (origin only)
    await expect(cancelTrip(companyId, tripId, mockSeiyunUser.id, mockSeiyunUser.branchId))
      .rejects.toThrow("FORBIDDEN: outside assigned branch");
  });

  test("Company Admin sees full PII and can cancel", async () => {
    const detail = await getTripDetail(companyId, tripId, mockAdmin.branchId);
    const riyadhStop = detail!.stops.find(s => s.branchId === riyadhId);
    expect(riyadhStop!.shipmentLoads[0].shipment.customer.name).toBe("عميل حساس الرياض");

    // Can cancel
    const result = await cancelTrip(companyId, tripId, mockAdmin.id, mockAdmin.branchId);
    expect(result.releasedShipments).toBe(1);
  });
});
