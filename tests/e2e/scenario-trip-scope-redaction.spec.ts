import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getTripDetail, cancelTrip, assignTripCrew } from "@/modules/trips/service";
import { nextTripNumber, nextShipmentNumber } from "@/lib/ids";

/** Only `.id` and `.branchId` are ever read off these in this file. They must be real `User` rows,
 * not hand-built objects with made-up ids: `assignTripCrew`/`cancelTrip` write an AuditLog row
 * stamped with this id, and `AuditLog.userId` carries a foreign key to `User.id`. */
type MockUser = { id: string; branchId: string | null };

test.describe("Target Access Policy - Trip Scope Redaction & Administration", () => {
  let companyId: string;
  let riyadhId: string;
  let jeddahId: string;
  let seiyunId: string;
  let tripId: string;

  let mockRiyadhUser: MockUser;
  let mockJeddahUser: MockUser;
  let mockSeiyunUser: MockUser;
  let mockAdmin: MockUser;

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

    // 3. Setup Users — real User rows, not hand-built objects: assignTripCrew/cancelTrip write an
    // AuditLog row carrying this id as a foreign key, so it must resolve to an actual user.
    const passwordHash = await bcrypt.hash("Passw0rd!", 10);
    const [riyadhUser, jeddahUser, seiyunUser, adminUser] = await Promise.all([
      prisma.user.create({ data: { companyId, branchId: riyadhId, roleId: role.id, name: "موظف الرياض", email: `riyadh-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER" } }),
      prisma.user.create({ data: { companyId, branchId: jeddahId, roleId: role.id, name: "موظف جدة", email: `jeddah-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER" } }),
      prisma.user.create({ data: { companyId, branchId: seiyunId, roleId: role.id, name: "موظف سيئون", email: `seiyun-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER" } }),
      prisma.user.create({ data: { companyId, branchId: null, roleId: role.id, name: "مدير الشركة", email: `admin-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER" } }),
    ]);
    mockRiyadhUser = { id: riyadhUser.id, branchId: riyadhUser.branchId };
    mockJeddahUser = { id: jeddahUser.id, branchId: jeddahUser.branchId };
    mockSeiyunUser = { id: seiyunUser.id, branchId: seiyunUser.branchId };
    mockAdmin = { id: adminUser.id, branchId: adminUser.branchId };

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
    if (!companyId) return;
    // Trip -> TripStop/TripShipmentStop cascade on Trip's own id, but TripStop.branchId has no
    // cascade back to Branch (deleting a branch must not silently wipe historical trip-stop
    // records in production) — so the trip has to go first, or Company's cascade to Branch hits a
    // TripStop row still pointing at it and the whole delete fails with a foreign key violation.
    await prisma.trip.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
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
