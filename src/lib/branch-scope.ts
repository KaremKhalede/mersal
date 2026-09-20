/**
 * Branch-level data-access scoping — Phase 5 P0.
 *
 * Rule (documented per the Phase 5 branch-scoping decision, do not change without re-reading it):
 *   - PLATFORM_ADMIN and DRIVER are out of scope here entirely (platform-wide / trip-scoped
 *     elsewhere via requirePlatformAdmin / Trip.driverId — untouched by this module).
 *   - COMPANY_USER whose role is the company-wide bypass role ("مدير الشركة" / "company_admin",
 *     the same check `can()` already uses) always sees the whole company — Company Owner /
 *     Company Admin — even in the edge case where such an account happens to have a branchId set.
 *   - A COMPANY_USER's branch identity is their assigned `branchId`, full stop — that field is
 *     what makes someone a "Branch Manager" or "Branch Employee" in this data model (that's
 *     exactly how the seed data tells the two apart: "موظف فرع" and "مدير عمليات" both carry a
 *     branchId, the admin role doesn't). So: branchId set -> restricted to that branch. branchId
 *     unset -> company-wide, same as before this feature existed — this is not a security
 *     regression, it's the pre-existing behavior for any role that was never tied to one branch
 *     (e.g. a company-wide accountant or view-only auditor role). RBAC's own view/edit/create
 *     permission checks are the actual access gate for those roles; branch scoping is an
 *     additional restriction layered on top for roles the company chose to pin to a branch, not
 *     a substitute for RBAC.
 *
 * Per-resource scoping predicate (see prisma/schema.prisma for the referenced fields):
 *   - Shipments   -> loadBranchId OR unloadBranchId OR currentBranchId matches
 *   - Trips       -> at least one TripStop.branchId matches (the trip "touches" the branch);
 *                    once a trip is visible, ALL of its stops render (route needs full context)
 *   - Customers   -> homeBranchId matches OR the customer has a shipment that touches the branch
 *                    (a customer's "home" branch can be unset or different from where they most
 *                    recently transacted — a branch employee needs to find both)
 *   - CustomsCase -> via its Shipment's scoping (no direct branch field on CustomsCase)
 *   - Document    -> via its Shipment's scoping, or its CustomsCase's Shipment's scoping
 *   - DeliveryRequest -> pickupBranchId matches (the branch actually handling the pickup)
 *   - Exceptions  -> same as Shipments (an "exception" is just Shipment.status === "EXCEPTION")
 *
 * Enforcement covers both READ paths (list/detail pages — the original P0 gap) and MUTATION entry
 * points (Server Actions / service functions that accept a foreign entity id — a Branch Employee
 * who knows a shipment/trip/delivery-request id outside their branch must not be able to act on it
 * just because they're authenticated and hold the RBAC permission). The pattern throughout: the
 * action layer resolves `getBranchScope(user)` once into a plain `branchId | null` ("branchScope")
 * and passes *that* down — service/assert functions never need to know about User/Role shapes,
 * they just compare a resolved scope against the entity's own branch field(s), exactly like they
 * already do for `companyId`/`assertSameCompany`. A null branchScope is always a no-op (company-wide
 * user) — every assert* function below is a pure pass-through in that case.
 *
 * ANY-TOUCH vs EXACT — which one a given mutation should use (Phase 6 rule, decided after finding
 * assertAnyBranchMatch was doing double duty for both read-visibility and write-specificity):
 *   - Default to ANY-TOUCH (`assertAnyBranchMatch` / `assertShipmentBranchAccess`) for anything
 *     read-only, and for any mutation that is itself inherently tied to a specific touchpoint the
 *     resource has — loading/unloading a shipment happens at whichever stop is doing the
 *     loading/unloading, receiving/cancelling/exception-handling a shipment is likewise anchored to
 *     the touchpoint the action itself names. "Any touch" is correct there, not a gap: the action's
 *     own semantics already pin it to one place, so a branch matching *any* of load/unload/current
 *     is proof the employee is legitimately involved with that resource somewhere in its journey.
 *   - Use EXACT (`assertBranchMatch` against the resource's *current* location, e.g.
 *     `Shipment.currentBranchId`) for mutations that are generic record edits with no touchpoint of
 *     their own — recording a payment or editing intake details can be triggered from anywhere the
 *     shipment has ever been, so "any touch" would let a Branch Employee at the origin branch edit
 *     or take payment on a shipment that has already moved on to a different branch. See
 *     `assertOwnsShipmentExact` in `src/modules/shipments/service.ts` for the concrete
 *     implementation and its two call sites (`updateShipmentAction`, `recordPaymentAction`).
 */

export type BranchScopeUser = {
  userType: string;
  role: { name: string } | null;
  branchId: string | null;
  companyId?: string | null;
  /**
   * The loaded Branch relation, when the caller's query fetched it (every real caller does —
   * `getCurrentUser()` in `src/lib/auth.ts` always includes `branch: true`). Optional purely so
   * hand-constructed test/service user objects that don't need it still satisfy this type; when
   * absent, the cross-company check below is simply skipped rather than false-positive-logging.
   */
  branch?: { companyId: string } | null;
};

/**
 * Returns the branchId a user must be restricted to, or null when they should see the whole
 * company (or aren't a branch-scoped company user at all — platform admin, driver).
 *
 * Production-readiness note: `User.branchId` has an `ON DELETE SET NULL` foreign key to `Branch`
 * (see the init migration) — Postgres itself already prevents the "branch got deleted, branchId
 * left dangling" case by nulling it out automatically, which then just means company-wide scope,
 * the same as any other role never pinned to a branch. The one case the database does NOT prevent
 * is a `branchId` that's valid but belongs to a DIFFERENT company than the user's own — nothing
 * stops that at the FK level, only at the application layer, and today nothing checked it. If it
 * ever happened (a future bug, a bad data import), the failure mode was already safe — every
 * downstream query still filters by companyId first, so a cross-company branchId just produces
 * empty results everywhere — but silently, with no trace of why. Logged here, once, at the single
 * chokepoint every branch-scoped request already passes through, rather than fixing behavior that
 * was never actually unsafe.
 */
export function getBranchScope(user: BranchScopeUser): string | null {
  if (user.userType !== "COMPANY_USER") return null;
  if (!user.branchId) return null;
  if (user.role && (user.role.name === "مدير الشركة" || user.role.name === "company_admin")) return null;

  if (user.branch !== undefined && user.companyId && (!user.branch || user.branch.companyId !== user.companyId)) {
    console.error(
      `[branch-scope] invalid branchId: user's branchId=${user.branchId} does not resolve to a branch in their own company=${user.companyId}. ` +
      `Scoping still applies safely (every query also filters by companyId, so this fails closed to empty results) — but the assignment itself needs manual correction.`
    );
  }

  return user.branchId;
}

/** Prisma where-fragment: true when a Shipment's load/unload/current branch matches. */
export function shipmentTouchesBranch(branchId: string) {
  return {
    OR: [{ loadBranchId: branchId }, { unloadBranchId: branchId }, { currentBranchId: branchId }],
  };
}

/**
 * Mutation-side guard: throws if `branchScope` is set and doesn't equal `branchId` exactly.
 * Use for single-location entities (a TripStop, a DeliveryRequest's pickup branch) where the
 * mutation is physically happening at one specific place, not "anywhere the resource touches."
 * A null `branchScope` (company-wide user) is always a no-op.
 */
export function assertBranchMatch(branchScope: string | null | undefined, branchId: string | null | undefined) {
  if (!branchScope) return;
  if (branchId !== branchScope) throw new Error("FORBIDDEN: outside assigned branch");
}

/**
 * Mutation-side guard: throws if `branchScope` is set and isn't among `branchIds`. Use for
 * multi-location entities (a Shipment's load/unload/current branch, a Trip's stops) where any one
 * matching location is enough to prove the resource is legitimately within the user's reach.
 */
export function assertAnyBranchMatch(branchScope: string | null | undefined, branchIds: (string | null | undefined)[]) {
  if (!branchScope) return;
  if (!branchIds.includes(branchScope)) throw new Error("FORBIDDEN: outside assigned branch");
}

/** Convenience wrapper for the Shipment case (Read/Visibility) — load/unload/current. */
export function assertShipmentBranchAccess(
  branchScope: string | null | undefined,
  shipment: { loadBranchId: string; unloadBranchId: string; currentBranchId: string | null }
) {
  assertAnyBranchMatch(branchScope, [shipment.loadBranchId, shipment.unloadBranchId, shipment.currentBranchId]);
}

/** 
 * Target Access Policy: Physical Operations
 * Must be at the exact current branch location.
 */
export function assertShipmentPhysicalAccess(
  branchScope: string | null | undefined,
  shipment: { currentBranchId: string | null }
) {
  assertBranchMatch(branchScope, shipment.currentBranchId);
}

/**
 * Target Access Policy: Draft Cancellation (Administrative)
 * Allowed for the ORIGIN branch ONLY — narrow and deliberate for `cancelDraftShipment`, which only
 * ever applies to a shipment still in DRAFT/REGISTERED, i.e. one that in practice has not left its
 * origin yet. NOT a general-purpose "can this branch edit this shipment" check — see
 * `assertShipmentDetailsAccess` below for that. (This function used to be reused for both, which is
 * exactly how a Branch Employee at the origin kept editing a shipment's receiver/PII forever, long
 * after it had physically moved to another branch's care — the origin branch stays "allowed" under
 * this rule even once the shipment is nowhere near it.)
 */
export function assertShipmentEditAccess(
  branchScope: string | null | undefined,
  shipment: { loadBranchId: string }
) {
  assertBranchMatch(branchScope, shipment.loadBranchId);
}

/**
 * Target Access Policy: Generic Record Edits (intake details)
 * A record edit has no touchpoint of its own the way loading/unloading/receiving do — it can be
 * triggered from wherever staff happen to be, so it must be pinned to the shipment's CURRENT
 * location, not wherever it started. Used by `updateShipmentDetails` in
 * src/modules/shipments/service.ts.
 */
export function assertShipmentDetailsAccess(
  branchScope: string | null | undefined,
  shipment: { currentBranchId: string | null }
) {
  assertBranchMatch(branchScope, shipment.currentBranchId);
}

/** 
 * Target Access Policy: Payment Operations
 * Allowed for the ORIGIN branch or the CURRENT branch.
 */
export function assertShipmentPaymentAccess(
  branchScope: string | null | undefined,
  shipment: { loadBranchId: string; currentBranchId: string | null }
) {
  assertAnyBranchMatch(branchScope, [shipment.loadBranchId, shipment.currentBranchId]);
}

/**
 * Target Access Policy: Redaction for Trip Details
 * If the employee's branch is an intermediate stop (neither origin nor destination for this shipment),
 * scrub sensitive PII and financial information.
 */
export function redactShipmentForBranch<
  T extends {
    loadBranchId: string;
    unloadBranchId: string;
    customer?: Record<string, unknown> | null;
    receiverName?: string;
    receiverPhone?: string;
    // `unknown`, not `number | null`: callers pass this both before and after the Decimal->number
    // conversion documented in prisma/schema.prisma (some read paths in modules/trips/service.ts
    // redact a raw Prisma result, Decimal fields and all, ahead of that conversion). `unknown`
    // keeps every caller's real shape intact through this generic (same as the `any` it replaces,
    // for inference purposes) without re-opening the no-explicit-any lint error.
    weightKg?: unknown;
    declaredValue?: unknown;
    shippingPrice?: unknown;
    amountPaid?: unknown;
    notes?: string | null;
  },
>(branchScope: string | null | undefined, shipment: T): T {
  if (!branchScope) return shipment; // Company admins and drivers see everything

  // If the shipment was loaded or unloaded at the user's branch, they need full context.
  if (shipment.loadBranchId === branchScope || shipment.unloadBranchId === branchScope) {
    return shipment;
  }

  // Otherwise, they are an intermediate stop and should only see that a shipment is on the truck,
  // without PII or financials.
  return {
    ...shipment,
    receiverName: "بيانات المستلم غير متاحة لهذه المحطة",
    receiverPhone: "---",
    weightKg: null,
    declaredValue: null,
    shippingPrice: null,
    amountPaid: null,
    notes: null,
    ...(shipment.customer ? {
      customer: {
        ...shipment.customer,
        name: "شحنة عابرة (Transit)",
        phone: "---",
        email: null,
        altPhone: null,
        address: null,
      }
    } : {})
  };
}
