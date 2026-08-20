import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listBranches } from "@/modules/branches/service";
import { listDrivers } from "@/modules/users/service";
import { TripWizard } from "./trip-wizard";

export default async function NewTripPage() {
  const user = await requireCompanyUser();
  requireCan(user, "trips", "create");
  const [branches, drivers] = await Promise.all([
    listBranches(user.companyId!),
    listDrivers(user.companyId!),
  ]);

  return <TripWizard branches={branches} drivers={drivers} />;
}
