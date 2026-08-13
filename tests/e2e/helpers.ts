import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, type Page } from "@playwright/test";
import { FULL_PERMISSIONS } from "../../src/lib/enums";
import { resolveDatabaseUrl } from "../../src/lib/db-url";

export const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl(process.env.DATABASE_URL) });
export const TEST_PASSWORD = "Passw0rd!";

let counter = 0;
function uniq(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/** Creates a fully isolated tenant sandbox (company + admin + driver + branches) for one test. */
export async function createTestTenant(branchCities: string[] = ["مدينة أ", "مدينة ب", "مدينة ج"]) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const slug = uniq("test-co");

  const company = await prisma.company.create({ data: { name: `شركة اختبار ${slug}`, slug } });

  const adminRole = await prisma.role.create({
    data: { companyId: company.id, name: "مدير الشركة", permissions: JSON.stringify(FULL_PERMISSIONS), isSystem: true },
  });

  const branches = await Promise.all(
    branchCities.map((city) => prisma.branch.create({ data: { companyId: company.id, name: `فرع ${city}`, city, country: "بلد اختبار" } }))
  );

  const adminEmail = `${uniq("admin")}@test.local`;
  const admin = await prisma.user.create({
    data: { companyId: company.id, name: "مدير اختبار", email: adminEmail, passwordHash, userType: "COMPANY_USER", roleId: adminRole.id },
  });

  const driverEmail = `${uniq("driver")}@test.local`;
  const driver = await prisma.user.create({
    data: { companyId: company.id, name: "سائق اختبار", email: driverEmail, passwordHash, userType: "DRIVER" },
  });

  const customer = await prisma.customer.create({
    data: { companyId: company.id, name: "عميل اختبار", phone: "+96650" + Math.floor(1000000 + Math.random() * 8999999) },
  });

  return { company, branches, adminEmail, driverEmail, adminId: admin.id, driverId: driver.id, customerId: customer.id };
}

/** Creates a COMPANY_USER with a non-admin role pinned to one branch — i.e. a Branch
 * Manager/Branch Employee, per the Phase 5 branch-scoping rule (src/lib/branch-scope.ts): any
 * COMPANY_USER role other than the "مدير الشركة"/"company_admin" bypass is branch-restricted. */
export async function createBranchScopedUser(params: { companyId: string; branchId: string; permissions: Record<string, string[]>; roleName?: string }) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const role = await prisma.role.create({
    data: { companyId: params.companyId, name: params.roleName ?? "موظف فرع", permissions: JSON.stringify(params.permissions) },
  });
  const email = `${uniq("branch-user")}@test.local`;
  const user = await prisma.user.create({
    data: { companyId: params.companyId, branchId: params.branchId, name: "موظف فرع اختبار", email, passwordHash, userType: "COMPANY_USER", roleId: role.id },
  });
  return { email, userId: user.id, roleId: role.id };
}

/** Creates a throwaway PLATFORM_ADMIN user — never assume a fixed global admin account (like
 * the local db:seed's admin@platform.dev) exists or has a known password: staging is bootstrapped
 * via `db:bootstrap` with its own operator-chosen credentials, not the demo seed. */
export async function createTestPlatformAdmin() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const email = `${uniq("platform-admin")}@test.local`;
  const admin = await prisma.user.create({
    data: { name: "مدير منصة اختبار", email, passwordHash, userType: "PLATFORM_ADMIN" },
  });
  return { email, userId: admin.id };
}

export async function login(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // "networkidle" never fires against a real deployment (analytics/telemetry keep a connection
  // open) — wait for the actual post-login redirect instead, which is what we care about anyway.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
}

/**
 * Clicking a button only dispatches the DOM event — it does not wait for the async onClick handler
 * (which awaits a Server Action, then a DB write) to finish. A fixed sleep after the click is tuned
 * for local latency and races ahead of a real deployment's serverless round-trip (cold start + pooled
 * DB write), reading stale data. Poll the actual outcome instead of sleeping a fixed amount.
 */
export async function pollUntil<T>(read: () => Promise<T>, predicate: (value: T) => boolean, timeout = 15000): Promise<T> {
  let value!: T;
  await expect.poll(async () => {
    value = await read();
    return predicate(value);
  }, { timeout }).toBe(true);
  return value;
}

export async function cleanupTenant(companyId: string) {
  // Cascades cover most children (see schema onDelete: Cascade); company delete sweeps the rest.
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
}

/** Fixture setup mirroring modules/shipments/service.createShipment — bypasses the UI so scenario
 * tests can arrange preconditions fast and spend their real assertions on the mechanism under test. */
export async function createTestShipment(params: {
  companyId: string;
  customerId: string;
  loadBranchId: string;
  unloadBranchId: string;
  cartonCount: number;
  status?: string;
  shippingPrice?: number;
  amountPaid?: number;
  paymentDate?: Date;
}) {
  const shipmentNumber = uniq("SH");
  const shipment = await prisma.shipment.create({
    data: {
      companyId: params.companyId,
      shipmentNumber,
      customerId: params.customerId,
      receiverName: "مستلم اختبار",
      receiverPhone: "+967700000000",
      loadBranchId: params.loadBranchId,
      unloadBranchId: params.unloadBranchId,
      currentBranchId: params.loadBranchId,
      totalCartons: params.cartonCount,
      status: params.status ?? "READY_FOR_LOADING",
      shippingPrice: params.shippingPrice,
      amountPaid: params.amountPaid ?? 0,
      paymentDate: params.paymentDate,
    },
  });
  await prisma.carton.createMany({
    data: Array.from({ length: params.cartonCount }, (_, i) => ({ shipmentId: shipment.id, cartonIndex: i + 1, cartonCode: `${shipmentNumber}-C${i + 1}` })),
  });
  await prisma.billingLedgerEntry.create({
    data: { companyId: params.companyId, shipmentId: shipment.id, cartonCount: params.cartonCount, feePerCarton: 5, amount: params.cartonCount * 5 },
  });
  return shipment;
}

export async function createTestTrip(params: {
  companyId: string;
  driverId?: string;
  stops: { branchId: string; loadingEnabled: boolean; unloadingEnabled: boolean; plannedArrival?: Date; actualArrival?: Date }[];
}) {
  return prisma.trip.create({
    data: {
      companyId: params.companyId,
      tripNumber: uniq("TR"),
      driverId: params.driverId,
      stops: { create: params.stops.map((s, i) => ({ ...s, sequence: i + 1 })) },
    },
    include: { stops: { orderBy: { sequence: "asc" } } },
  });
}

/** Links a shipment onto a trip at the given stops, same effect as autoAssignShipmentToTrip. */
export async function linkShipmentToTrip(tripId: string, shipmentId: string, loadStopId: string, unloadStopId: string) {
  return prisma.tripShipmentStop.create({ data: { tripId, shipmentId, loadStopId, unloadStopId } });
}
