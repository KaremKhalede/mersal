/**
 * Tenant isolation guard. Every service function that loads a row by id must call this
 * with the row's companyId before returning/mutating it — never rely on the UI hiding links.
 */
export function assertSameCompany(user: { userType: string; companyId: string | null }, resourceCompanyId: string | null | undefined) {
  if (user.userType === "PLATFORM_ADMIN") return;
  if (!user.companyId || user.companyId !== resourceCompanyId) {
    throw new Error("FORBIDDEN: cross-tenant access denied");
  }
}
