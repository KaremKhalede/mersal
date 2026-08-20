import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { FULL_PERMISSIONS } from "../src/lib/enums";
import { resolveDatabaseUrl } from "../src/lib/db-url";
import { newTrackingToken } from "../src/lib/tracking";
import { nextShipmentNumber } from "../src/lib/ids";

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl(process.env.DATABASE_URL) });
const PASSWORD = "Passw0rd!";

/**
 * The demo tenants this script owns, end to end. Nothing outside this list is ever touched — in
 * particular the platform row, the platform admin accounts, the migration-seeded PlatformRoles, and
 * every other company in the database (e.g. Playwright's throwaway `test-co-*` tenants) are left
 * exactly as they are.
 */
const companiesData = [
  { name: "مؤسسة النور للشحن", slug: "alnoor", cities: ["الرياض", "جدة", "المكلا", "سيئون"] },
  { name: "شركة الأمان للشحن", slug: "alaman", cities: ["الرياض", "عدن"] },
  { name: "شركة المسار للشحن", slug: "almasar", cities: ["جدة", "تعز"] },
  { name: "الشركة اليمنية للنقل", slug: "yemenia-transport", cities: ["الرياض", "صنعاء"] },
  { name: "مؤسسة الخليج للشحن", slug: "algulf", cities: ["الدمام", "المكلا"] },
];
const DEMO_SLUGS = companiesData.map((c) => c.slug);

/**
 * Makes re-running the seed idempotent.
 *
 * Most rows here have no natural unique key to upsert on — a Branch is only (companyId, name), a
 * Customer only (companyId, phone), and a demo Shipment/Trip has nothing but its generated number.
 * So every re-run appended a second set of branches and customers, and then died outright on
 * `Trip.tripNumber` / `Shipment.shipmentNumber`, both of which are globally @unique — leaving the
 * database in a half-seeded state that got worse with each attempt.
 *
 * Rather than inventing unique constraints purely to serve demo data, the seed simply owns its five
 * demo tenants: drop them, rebuild them. Company has onDelete: Cascade to branches, users, roles,
 * customers, shipments, trips, ledger entries, invoices and the rest, so one delete per slug clears
 * the whole subtree with no manual ordering.
 */
async function resetDemoCompanies() {
  const demo = await prisma.company.findMany({ where: { slug: { in: DEMO_SLUGS } }, select: { id: true } });
  if (demo.length === 0) return;
  const companyId = { in: demo.map((c) => c.id) };

  // Trips and shipments first, then the companies. Company -> Branch is onDelete: Cascade, but
  // TripStop.branchId and Shipment.loadBranchId/unloadBranchId/currentBranchId are required
  // relations with no onDelete, i.e. RESTRICT — Postgres aborts the whole cascade when it reaches
  // a Branch those rows still point at. Clearing them up front lets the cascade run to completion.
  await prisma.trip.deleteMany({ where: { companyId } });
  await prisma.shipment.deleteMany({ where: { companyId } });
  const { count } = await prisma.company.deleteMany({ where: { id: companyId } });
  console.log(`Reset ${count} existing demo company/companies (cascade).`);
}

/** The super-admin PlatformRole, created if a fresh database somehow lacks it. Every platform
 *  account needs a role now — without one, canPlatform() correctly grants nothing. */
async function ensureSuperAdminRole() {
  const existing = await prisma.platformRole.findFirst({ where: { isSuperAdmin: true } });
  if (existing) return existing;
  return prisma.platformRole.create({
    data: {
      name: "مدير المنصة",
      description: "صلاحية كاملة على لوحة إدارة المنصة",
      permissions: "{}",
      isSuperAdmin: true,
      isSystem: true,
    },
  });
}

async function main() {
  // This script creates demo companies and demo accounts that all share one hard-coded password.
  // prisma/bootstrap.ts is the only thing meant to touch a production database (see its docstring);
  // this guard makes running the wrong one an error rather than a data-loss incident, now that the
  // seed resets its own demo tenants.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV=production. Use prisma/bootstrap.ts instead.");
  }

  console.log("Seeding...");
  await resetDemoCompanies();
  await prisma.platform.upsert({
    where: { id: "platform-1" },
    update: {},
    create: { id: "platform-1", name: "منصة الشحن البري" },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const platformAdmin = await prisma.user.upsert({
    where: { email: "admin@platform.dev" },
    update: {},
    create: {
      name: "أحمد المدير",
      email: "admin@platform.dev",
      passwordHash,
      userType: "PLATFORM_ADMIN",
      platformRoleId: (await ensureSuperAdminRole()).id,
    },
  });
  console.log("Platform admin:", platformAdmin.email);

  const branchCityMeta: Record<string, { country: string }> = {
    الرياض: { country: "السعودية" },
    جدة: { country: "السعودية" },
    الدمام: { country: "السعودية" },
    الطائف: { country: "السعودية" },
    المكلا: { country: "اليمن" },
    سيئون: { country: "اليمن" },
    عدن: { country: "اليمن" },
    تعز: { country: "اليمن" },
    صنعاء: { country: "اليمن" },
  };

  let demoCompanyId = "";
  let demoBranches: Record<string, string> = {};
  let demoTripId = "";
  let demoShipmentNumber = "";

  for (const c of companiesData) {
    const company = await prisma.company.upsert({
      where: { slug: c.slug },
      update: {},
      create: { name: c.name, slug: c.slug, phone: "0500000000", email: `info@${c.slug}.example` },
    });

    // Roles are upserted on (companyId, name) — seed.ts is re-run against the same demo companies
    // routinely (`npm run db:seed`), and `prisma.role.create` here used to insert a fresh duplicate
    // row every single run. Keyed upsert makes re-running idempotent instead.
    const adminRole = await prisma.role.upsert({
      where: { companyId_name: { companyId: company.id, name: "مدير الشركة" } },
      update: {},
      create: {
        companyId: company.id,
        name: "مدير الشركة",
        description: "صلاحية كاملة على الشركة",
        permissions: JSON.stringify(FULL_PERMISSIONS),
        isSystem: true,
      },
    });

    const opsRole = await prisma.role.upsert({
      where: { companyId_name: { companyId: company.id, name: "مدير عمليات" } },
      update: {},
      create: {
        companyId: company.id,
        name: "مدير عمليات",
        description: "الشحنات والرحلات والفروع",
        permissions: JSON.stringify({
          shipments: ["view", "create", "edit", "updateStatus"],
          trips: ["view", "create", "edit", "assignDriver", "start", "complete"],
          branches: ["view", "create", "edit"],
          customers: ["view", "create", "edit"],
          reports: ["view"],
        }),
      },
    });

    const branchRole = await prisma.role.upsert({
      where: { companyId_name: { companyId: company.id, name: "موظف فرع" } },
      update: {},
      create: {
        companyId: company.id,
        name: "موظف فرع",
        description: "استلام وتحميل وتفريغ واستلام العملاء",
        permissions: JSON.stringify({
          shipments: ["view", "create", "updateStatus"],
          customers: ["view", "create"],
          trips: ["view"],
          documents: ["view", "upload"],
        }),
      },
    });

    await prisma.user.upsert({
      where: { email: `owner@${c.slug}.example` },
      update: {},
      create: {
        companyId: company.id,
        name: `مدير ${c.name}`,
        email: `owner@${c.slug}.example`,
        passwordHash,
        userType: "COMPANY_USER",
        roleId: adminRole.id,
      },
    });

    const branchIds: Record<string, string> = {};
    for (const city of c.cities) {
      const branch = await prisma.branch.create({
        data: { companyId: company.id, name: `فرع ${city}`, city, country: branchCityMeta[city]?.country ?? "" },
      });
      branchIds[city] = branch.id;
    }

    const opsUser = await prisma.user.upsert({
      where: { email: `ops@${c.slug}.example` },
      update: {},
      create: {
        companyId: company.id,
        name: `مشرف عمليات ${c.name}`,
        email: `ops@${c.slug}.example`,
        passwordHash,
        userType: "COMPANY_USER",
        roleId: opsRole.id,
        branchId: Object.values(branchIds)[0],
      },
    });
    void opsUser;

    const branchEmployee = await prisma.user.upsert({
      where: { email: `branch@${c.slug}.example` },
      update: {},
      create: {
        companyId: company.id,
        name: `موظف فرع ${c.name}`,
        email: `branch@${c.slug}.example`,
        passwordHash,
        userType: "COMPANY_USER",
        roleId: branchRole.id,
        branchId: Object.values(branchIds)[0],
      },
    });
    void branchEmployee;

    const driver = await prisma.user.upsert({
      where: { email: `driver@${c.slug}.example` },
      update: {},
      create: {
        companyId: company.id,
        name: `أحمد السائق`,
        email: `driver@${c.slug}.example`,
        passwordHash,
        userType: "DRIVER",
        employeeCode: "DRV-001",
      },
    });

    // Demo customers
    const customers = await Promise.all(
      [
        { name: "أحمد علي", phone: "+966501234567" },
        { name: "محمد الشهري", phone: "+967777123456" },
        { name: "سالم الدوسري", phone: "+966551112233" },
      ].map((cu) => prisma.customer.create({ data: { companyId: company.id, ...cu, homeBranchId: Object.values(branchIds)[0] } }))
    );

    if (c.slug === "alnoor") {
      demoCompanyId = company.id;
      demoBranches = branchIds;

      // Realistic multi-stop demo trip: Riyadh -> Seiyun -> Mukalla (TR-2045 style)
      const demoVehicle = await prisma.vehicle.upsert({
        where: { companyId_plateNumber: { companyId: company.id, plateNumber: "ب ج د 1234" } },
        update: {},
        create: { companyId: company.id, plateNumber: "ب ج د 1234", type: "TRUCK" },
      });
      const trip = await prisma.trip.create({
        data: {
          companyId: company.id,
          tripNumber: "TR-2045",
          vehicleId: demoVehicle.id,
          driverId: driver.id,
          distanceKm: 1250,
          stops: {
            create: [
              { branchId: branchIds["الرياض"], sequence: 1, loadingEnabled: true, unloadingEnabled: false, status: "DONE", actualDeparture: new Date() },
              { branchId: branchIds["سيئون"], sequence: 2, loadingEnabled: true, unloadingEnabled: true, status: "PENDING" },
              { branchId: branchIds["المكلا"], sequence: 3, loadingEnabled: false, unloadingEnabled: true, status: "PENDING" },
            ],
          },
        },
        include: { stops: true },
      });
      demoTripId = trip.id;
      const riyadhStop = trip.stops.find((s) => s.sequence === 1)!;
      const seiyunStop = trip.stops.find((s) => s.sequence === 2)!;
      const mukallaStop = trip.stops.find((s) => s.sequence === 3)!;

      // Demo shipment SH-10482 (matches the UI mockups): Riyadh -> Mukalla, 3 cartons, already in transit past Seiyun
      const shipment1 = await prisma.shipment.create({
        data: {
          companyId: company.id,
          shipmentNumber: "SH-10482",
          trackingToken: newTrackingToken(),
          customerId: customers[0].id,
          receiverName: "علي محمد",
          receiverPhone: "+967777123456",
          loadBranchId: branchIds["الرياض"],
          unloadBranchId: branchIds["المكلا"],
          currentBranchId: branchIds["الرياض"],
          goodsType: "بضاعة عامة",
          weightKg: 125,
          totalCartons: 3,
          status: "RECEIVED",
        },
      });
      await prisma.carton.createMany({
        data: Array.from({ length: 3 }, (_, i) => ({ shipmentId: shipment1.id, cartonIndex: i + 1, cartonCode: `SH-10482-C${i + 1}` })),
      });
      await prisma.billingLedgerEntry.create({
        data: { companyId: company.id, shipmentId: shipment1.id, cartonCount: 3, feePerCarton: 5, amount: 15 },
      });
      demoShipmentNumber = shipment1.shipmentNumber;

      await prisma.tripShipmentStop.create({
        data: {
          tripId: trip.id,
          shipmentId: shipment1.id,
          loadStopId: riyadhStop.id,
          unloadStopId: mukallaStop.id,
          loadedAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
          cartonsLoaded: 3,
        },
      });
      await prisma.carton.updateMany({ where: { shipmentId: shipment1.id }, data: { status: "IN_TRANSIT" } });
      await prisma.shipment.update({ where: { id: shipment1.id }, data: { status: "IN_TRANSIT", currentBranchId: null } });
      await addEvent(prisma, shipment1.id, "REGISTERED", "تم تسجيل الشحنة", "عدد الكراتين: 3");
      await addEvent(prisma, shipment1.id, "RECEIVED", "تم الاستلام", null, "فرع الرياض");
      await addEvent(prisma, shipment1.id, "LOADED", "تم التحميل على الرحلة TR-2045", null, "فرع الرياض");
      await addEvent(prisma, shipment1.id, "IN_TRANSIT", "غادرت الرحلة من فرع الرياض", null);
      await addEvent(prisma, shipment1.id, "AT_INTERMEDIATE_STOP", "مرّت الشحنة بمحطة سيئون", null);

      // Another 51 shipments loaded at Riyadh for realism (52 total on the trip out of Riyadh)
      for (let i = 0; i < 51; i++) {
        const dest = i < 17 ? branchIds["سيئون"] : branchIds["المكلا"];
        const s = await createShipmentSeed(prisma, {
          companyId: company.id,
          customerId: customers[i % customers.length].id,
          receiverName: "مستلم تجريبي",
          receiverPhone: "+967700000000",
          loadBranchId: branchIds["الرياض"],
          unloadBranchId: dest,
          cartons: 1 + (i % 4),
        });
        const unloadStop = dest === branchIds["سيئون"] ? seiyunStop : mukallaStop;
        await prisma.tripShipmentStop.create({
          data: { tripId: trip.id, shipmentId: s.id, loadStopId: riyadhStop.id, unloadStopId: unloadStop.id, loadedAt: new Date(), cartonsLoaded: s.totalCartons },
        });
        await prisma.carton.updateMany({ where: { shipmentId: s.id }, data: { status: "IN_TRANSIT" } });
        await prisma.shipment.update({ where: { id: s.id }, data: { status: "IN_TRANSIT" } });
      }

      // 5 shipments waiting to be loaded at Seiyun (next leg to Mukalla)
      for (let i = 0; i < 5; i++) {
        const s = await createShipmentSeed(prisma, {
          companyId: company.id,
          customerId: customers[i % customers.length].id,
          receiverName: "مستلم من سيئون",
          receiverPhone: "+967711111111",
          loadBranchId: branchIds["سيئون"],
          unloadBranchId: branchIds["المكلا"],
          cartons: 1 + (i % 3),
        });
        await prisma.shipment.update({ where: { id: s.id }, data: { status: "READY_FOR_LOADING" } });
        await prisma.tripShipmentStop.create({
          data: { tripId: trip.id, shipmentId: s.id, loadStopId: seiyunStop.id, unloadStopId: mukallaStop.id },
        });
      }

      // Extra example shipments across the lifecycle for dashboard variety
      const arrivedShipment = await createShipmentSeed(prisma, {
        companyId: company.id,
        customerId: customers[1].id,
        receiverName: "فيصل الغطاني",
        receiverPhone: "+967733322211",
        loadBranchId: branchIds["الرياض"],
        unloadBranchId: branchIds["المكلا"],
        cartons: 4,
      });
      await prisma.shipment.update({ where: { id: arrivedShipment.id }, data: { status: "READY_FOR_PICKUP", currentBranchId: branchIds["المكلا"], arrivedCartons: 4 } });
      await prisma.carton.updateMany({ where: { shipmentId: arrivedShipment.id }, data: { status: "ARRIVED" } });
      await addEvent(prisma, arrivedShipment.id, "ARRIVED", "وصلت الوجهة", null, "فرع المكلا");
      await addEvent(prisma, arrivedShipment.id, "READY_FOR_PICKUP", "جاهزة للاستلام", null, "فرع المكلا");

      const partialShipment = await createShipmentSeed(prisma, {
        companyId: company.id,
        customerId: customers[2].id,
        receiverName: "ناصر العتيبي",
        receiverPhone: "+967744433322",
        loadBranchId: branchIds["جدة"],
        unloadBranchId: branchIds["المكلا"],
        cartons: 7,
      });
      await prisma.shipment.update({ where: { id: partialShipment.id }, data: { status: "PARTIALLY_ARRIVED", currentBranchId: branchIds["المكلا"], arrivedCartons: 5 } });
      await addEvent(prisma, partialShipment.id, "PARTIALLY_ARRIVED", "وصول جزئي", "وصل 5 من أصل 7 كراتين");

      const customsShipment = await createShipmentSeed(prisma, {
        companyId: company.id,
        customerId: customers[0].id,
        receiverName: "عبدالله باوزير",
        receiverPhone: "+967755566677",
        loadBranchId: branchIds["الرياض"],
        unloadBranchId: branchIds["المكلا"],
        cartons: 2,
      });
      await prisma.shipment.update({ where: { id: customsShipment.id }, data: { status: "EXCEPTION" } });
      await prisma.customsCase.create({ data: { companyId: company.id, shipmentId: customsShipment.id, status: "ON_HOLD", notes: "مطلوب فاتورة رسمية للبضاعة" } });

      const deliveredShipment = await createShipmentSeed(prisma, {
        companyId: company.id,
        customerId: customers[1].id,
        receiverName: "خالد الحضرمي",
        receiverPhone: "+967766677788",
        loadBranchId: branchIds["الرياض"],
        unloadBranchId: branchIds["المكلا"],
        cartons: 2,
      });
      await prisma.shipment.update({ where: { id: deliveredShipment.id }, data: { status: "DELIVERED", currentBranchId: branchIds["المكلا"], arrivedCartons: 2 } });
      await prisma.deliveryRequest.create({
        data: {
          companyId: company.id,
          shipmentId: deliveredShipment.id,
          customerName: "خالد الحضرمي",
          customerPhone: "+967766677788",
          pickupBranchId: branchIds["المكلا"],
          destinationAddress: "المكلا - حي الديس - شارع 14",
          cartonCount: 2,
          deliveryFee: 20,
          status: "DELIVERED",
          providerRef: "ARSHI-DEMO-1",
        },
      });
    } else {
      // Lighter data for the other companies so platform admin views show real aggregation.
      for (let i = 0; i < 6; i++) {
        const cities = Object.keys(branchIds);
        const load = branchIds[cities[0]];
        const unload = branchIds[cities[cities.length - 1]];
        const s = await createShipmentSeed(prisma, {
          companyId: company.id,
          customerId: customers[i % customers.length].id,
          receiverName: "مستلم",
          receiverPhone: "+967700000001",
          loadBranchId: load,
          unloadBranchId: unload,
          cartons: 1 + (i % 3),
        });
        const statuses = ["REGISTERED", "RECEIVED", "IN_TRANSIT", "ARRIVED", "READY_FOR_PICKUP", "DELIVERED"] as const;
        await prisma.shipment.update({ where: { id: s.id }, data: { status: statuses[i] } });
      }
    }
  }

  console.log("Seed complete.");
  console.log("Platform admin login: admin@platform.dev / " + PASSWORD);
  console.log("Company (النور) admin login: owner@alnoor.example / " + PASSWORD);
  console.log("Company (النور) branch employee: branch@alnoor.example / " + PASSWORD);
  console.log("Company (النور) driver: driver@alnoor.example / " + PASSWORD);
  console.log("Demo trip:", demoTripId, "in company", demoCompanyId, Object.keys(demoBranches));
  console.log("Demo public tracking shipment number:", demoShipmentNumber);
}

/** Demo shipments draw from the same database sequence the application uses (src/lib/ids.ts),
 *  so there is exactly one allocator and seeded rows can never collide with real ones. The seed's
 *  own PrismaClient is passed in rather than the app's shared singleton, to avoid opening a second
 *  connection from a script. */
async function createShipmentSeed(
  db: PrismaClient,
  params: { companyId: string; customerId: string; receiverName: string; receiverPhone: string; loadBranchId: string; unloadBranchId: string; cartons: number; goodsType?: string; weightKg?: number }
) {
  const shipmentNumber = await nextShipmentNumber(db);
  const shipment = await db.shipment.create({
    data: {
      companyId: params.companyId,
      shipmentNumber,
      trackingToken: newTrackingToken(),
      customerId: params.customerId,
      receiverName: params.receiverName,
      receiverPhone: params.receiverPhone,
      loadBranchId: params.loadBranchId,
      unloadBranchId: params.unloadBranchId,
      currentBranchId: params.loadBranchId,
      goodsType: params.goodsType,
      weightKg: params.weightKg,
      totalCartons: params.cartons,
      status: "RECEIVED",
    },
  });
  await db.carton.createMany({
    data: Array.from({ length: params.cartons }, (_, i) => ({ shipmentId: shipment.id, cartonIndex: i + 1, cartonCode: `${shipmentNumber}-C${i + 1}` })),
  });
  await db.billingLedgerEntry.create({
    data: { companyId: params.companyId, shipmentId: shipment.id, cartonCount: params.cartons, feePerCarton: 5, amount: params.cartons * 5 },
  });
  return shipment;
}

async function addEvent(db: PrismaClient, shipmentId: string, eventType: string, title: string, description?: string | null, branchName?: string) {
  await db.trackingEvent.create({ data: { shipmentId, eventType, title, description: description ?? undefined, branchName } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
