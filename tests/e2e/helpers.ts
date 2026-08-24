import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, type Page } from "@playwright/test";
import { FULL_PERMISSIONS } from "../../src/lib/enums";
import { resolveDatabaseUrl } from "../../src/lib/db-url";
import { newTrackingToken } from "../../src/lib/tracking";

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
  // Role names are now unique per company (Role.@@unique([companyId, name])) — auto-suffix the
  // default so two calls for the same tenant (common when a test compares two employees with
  // different permission sets) don't collide on "موظف فرع".
  const role = await prisma.role.create({
    data: { companyId: params.companyId, name: params.roleName ?? uniq("موظف فرع"), permissions: JSON.stringify(params.permissions) },
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
  // Platform accounts carry a PlatformRole now; without one they hold no permissions at all.
  // The fixture is a super admin so existing platform tests keep exercising full access.
  const superAdmin = await prisma.platformRole.findFirstOrThrow({ where: { isSuperAdmin: true } });
  const admin = await prisma.user.create({
    data: { name: "مدير منصة اختبار", email, passwordHash, userType: "PLATFORM_ADMIN", platformRoleId: superAdmin.id },
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

/**
 * Tears a test tenant down.
 *
 * Deleting the Company alone is NOT enough, even though almost every child carries
 * onDelete: Cascade. TripStop.branchId and Shipment.loadBranchId/unloadBranchId/currentBranchId are
 * required relations with no onDelete, i.e. RESTRICT — so as Postgres cascades into Branch it hits
 * those references and aborts the whole delete. Trips and shipments therefore have to go first, in
 * dependency order, before the company cascade can reach the branches.
 *
 * (The schema is right as it stands: the product never deletes a company, only suspends it — see
 * platform/companies/actions.ts — so RESTRICT is the correct guard there. This is purely a
 * test-teardown concern.)
 *
 * The old version swallowed every error with `.catch(() => {})`, so this failure was invisible and
 * each aborted run leaked a whole tenant into the dev database — 1104 of them had piled up. Failures
 * are warned about now instead of vanishing; teardown still never fails a passing test.
 */
/**
 * Asserts a route refused to show a resource, and leaked nothing while doing it.
 *
 * Replaces `expect(res.status()).toBe(404)`. Since the app gained contextual Arabic not-found
 * screens (P0-3), a route that calls notFound() renders that screen inside the already-streamed
 * layout, and Next.js documents the response as 200 for streamed / 404 for non-streamed. The
 * status code therefore no longer distinguishes "denied" from "rendered".
 *
 * What replaces it is strictly stronger: the not-found screen must be on the page AND none of the
 * protected values may appear anywhere in it. A 404 status with leaked content would have passed
 * the old assertion; it cannot pass this one.
 *
 * (URLs matching no route at all still return a real 404 — that path renders the root not-found
 * outside any layout. Only in-segment notFound() is affected.)
 */
export async function expectNotFound(page: Page, mustNotLeak: string[] = []) {
  await expect(page.locator("text=/لم نجد|غير موجودة|غير موجود/").first()).toBeVisible();
  const body = await page.locator("body").innerText();
  for (const value of mustNotLeak) {
    if (value) expect(body).not.toContain(value);
  }
}
export async function cleanupTenant(companyId: string) {
  try {
    await prisma.trip.deleteMany({ where: { companyId } });
    await prisma.shipment.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  } catch (err) {
    console.warn(`[cleanupTenant] could not remove company ${companyId}:`, err);
  }
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
  /** Who took the money. Mirrors `Shipment.paymentReceivedById` AND the acting user on the
   *  RECORD_PAYMENT audit row below, which is what the daily close attributes takings by. */
  paymentReceivedById?: string;
  /** Defaults to a valid number. Pass "" or a malformed value to exercise the receiver-notification
   * skip path (a receiver the office cannot reach must never break the shipment operation). */
  receiverPhone?: string;
}) {
  const shipmentNumber = uniq("SH");
  const shipment = await prisma.shipment.create({
    data: {
      companyId: params.companyId,
      shipmentNumber,
      trackingToken: newTrackingToken(),
      customerId: params.customerId,
      receiverName: "مستلم اختبار",
      receiverPhone: params.receiverPhone ?? "+967700000000",
      loadBranchId: params.loadBranchId,
      unloadBranchId: params.unloadBranchId,
      currentBranchId: params.loadBranchId,
      totalCartons: params.cartonCount,
      status: params.status ?? "READY_FOR_LOADING",
      shippingPrice: params.shippingPrice,
      amountPaid: params.amountPaid ?? 0,
      paymentDate: params.paymentDate,
      paymentReceivedById: params.paymentReceivedById,
    },
  });

  // The payment EVENT, not just the resulting balance.
  //
  // `Shipment.amountPaid` is a running total, so "what was collected on day X" cannot be read off
  // it — it is derived by differencing consecutive RECORD_PAYMENT audit rows (see
  // src/modules/collections/service.ts). Real payments write one through `recordPayment`, and an
  // intake payment writes one through `createShipment`; a fixture that set the column without the
  // event would produce a shipment whose money exists on the shipment page and nowhere in the daily
  // close — a state the application itself can no longer reach.
  //
  // `createdAt` is set explicitly to `paymentDate` rather than defaulting to now(), so a fixture
  // dated "yesterday" lands in yesterday's close.
  if (params.amountPaid) {
    await prisma.auditLog.create({
      data: {
        companyId: params.companyId,
        userId: params.paymentReceivedById ?? null,
        action: "RECORD_PAYMENT",
        entityType: "Shipment",
        entityId: shipment.id,
        metadata: JSON.stringify({ amountPaid: params.amountPaid, paymentMethod: "CASH" }),
        createdAt: params.paymentDate ?? new Date(),
      },
    });
  }
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
  vehicleId?: string;
  stops: { branchId: string; loadingEnabled: boolean; unloadingEnabled: boolean; plannedArrival?: Date; actualArrival?: Date }[];
}) {
  return prisma.trip.create({
    data: {
      companyId: params.companyId,
      tripNumber: uniq("TR"),
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      stops: { create: params.stops.map((s, i) => ({ ...s, sequence: i + 1 })) },
    },
    include: { stops: { orderBy: { sequence: "asc" } } },
  });
}

/** Links a shipment onto a trip at the given stops, same effect as autoAssignShipmentToTrip. */
export async function linkShipmentToTrip(tripId: string, shipmentId: string, loadStopId: string, unloadStopId: string) {
  return prisma.tripShipmentStop.create({ data: { tripId, shipmentId, loadStopId, unloadStopId } });
}

/**
 * A record number renders twice on the shipments and trips lists — once in the phone card list,
 * once in the desktop table — with CSS choosing which one is shown at the current viewport. A bare
 * `text=` locator matches both and trips Playwright's strict mode.
 *
 * Filtering to what is actually visible, rather than reaching for `.first()`, matters: `.first()`
 * returns whichever comes first in the DOM (the phone list), so a desktop-viewport test could pass
 * while the table it means to check is broken.
 *
 * For "this must not leak" assertions keep using a bare `text=` with toHaveCount(0) — absence from
 * the DOM is the stronger claim, and that is what those tests are for.
 */
export function visibleText(page: Page, text: string) {
  return page.locator(`text=${text}`).filter({ visible: true });
}

/**
 * Picks one of the shipment detail page's secondary actions.
 *
 * تعديل, إلغاء الشحنة, نسخ رابط التتبع and تسجيل استثناء are no longer buttons in the header row —
 * they live behind the "⋯" overflow menu (see ShipmentActions), which keeps a single primary next
 * to طباعة الملصقات instead of five to seven controls at equal weight. The actions themselves are
 * unchanged; only where you click to reach them is.
 *
 * تسجيل دفعة is deliberately NOT always in there: it stays a visible button while money is owed and
 * drops into the menu once the shipment is settled, so callers should reach for it directly first.
 */
export async function shipmentOverflowAction(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name: "إجراءات أخرى" }).click();
  await page.getByRole("menuitem", { name }).click();
}

/**
 * The driver screen's stop card, opened.
 *
 * The driver's trip screen shows one stop expanded — the one the truck is at — and folds every
 * other stop into a `<details>` row, so its manifest and its buttons are in the DOM but not in the
 * accessibility tree until the row is opened. A test asserting on a stop it has not opened would
 * fail on visibility rather than on the thing it means to check, so every driver-side assertion
 * goes through here. Opening a fold the driver would have tapped is not a workaround: it is the
 * tap, done by the test.
 */
export async function driverStopCard(page: Page, stopId: string) {
  const card = page.getByTestId(`stop-${stopId}`);
  await card.waitFor();
  await card.evaluate((el) => {
    if (el instanceof HTMLDetailsElement) el.open = true;
  });
  return card;
}

/**
 * The one big button at the bottom of the driver screen — the next step, whatever it currently is.
 *
 * Its label is derived from the current stop's state (تأكيد الوصول -> تأكيد التفريغ -> تأكيد
 * التحميل -> مغادرة المحطة -> تأكيد نهاية الرحلة), so a test that wants "the action the driver is
 * on" asks for it by position, not by name.
 */
export function driverPrimaryAction(page: Page) {
  return page.getByTestId("driver-primary-action").locator("button");
}
