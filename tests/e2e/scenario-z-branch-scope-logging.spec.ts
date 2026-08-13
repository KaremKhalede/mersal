import { test, expect } from "@playwright/test";
import { getBranchScope } from "../../src/lib/branch-scope";

/**
 * Production-readiness cleanup — the "orphaned branchId" finding from the Go-Live audit, re-scoped
 * after checking the actual FK: `User.branchId -> Branch` is `ON DELETE SET NULL` (see the init
 * migration), so Postgres itself already prevents true dangling-reference orphaning — a deleted
 * branch just nulls the field out, which is already the documented "company-wide" case. The one gap
 * the database does NOT close is a branchId that's valid but belongs to a DIFFERENT company than the
 * user's own. That failure mode was already safe (every downstream query also filters by companyId,
 * so it fails closed to empty results) but silent — this proves it's no longer silent.
 */
test.describe("Scenario Z — invalid/cross-company branchId is logged, not silent", () => {
  test("a branchId whose branch belongs to a different company logs a clear diagnostic and still scopes safely", async () => {
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    try {
      const user = {
        userType: "COMPANY_USER",
        companyId: "company-real",
        role: { name: "موظف فرع" },
        branchId: "branch-from-another-company",
        branch: { companyId: "company-DIFFERENT" },
      };

      const scope = getBranchScope(user);

      // Still returns the branchId — scoping stays safe (every query ANDs with companyId too, so
      // this can never leak cross-tenant data), the point is only that it's now observable.
      expect(scope).toBe("branch-from-another-company");
      expect(errors.length).toBe(1);
      expect(String(errors[0][0])).toContain("[branch-scope]");
      expect(String(errors[0][0])).toContain("branch-from-another-company");
    } finally {
      console.error = originalError;
    }
  });

  test("a branchId whose branch relation is null (e.g. never loaded, or genuinely missing) does not false-positive when the relation was never fetched", async () => {
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    try {
      // No `branch` key at all — the shape every hand-constructed test/service user object across
      // this codebase already uses (see scenario-r, scenario-w, etc). Must not log, since there's
      // nothing to validate against.
      const user = { userType: "COMPANY_USER", companyId: "company-real", role: { name: "موظف فرع" }, branchId: "branch-x" };
      expect(getBranchScope(user)).toBe("branch-x");
      expect(errors.length).toBe(0);
    } finally {
      console.error = originalError;
    }
  });

  test("a normal, correctly-scoped branchId never logs anything", async () => {
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    try {
      const user = {
        userType: "COMPANY_USER",
        companyId: "company-real",
        role: { name: "موظف فرع" },
        branchId: "branch-real",
        branch: { companyId: "company-real" },
      };
      expect(getBranchScope(user)).toBe("branch-real");
      expect(errors.length).toBe(0);
    } finally {
      console.error = originalError;
    }
  });
});
