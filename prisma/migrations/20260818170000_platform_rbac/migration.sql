-- CreateTable
CREATE TABLE "PlatformRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRole_name_key" ON "PlatformRole"("name");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "platformRoleId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_platformRoleId_fkey" FOREIGN KEY ("platformRoleId") REFERENCES "PlatformRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the system roles. Permission keys mirror PLATFORM_PERMISSION_RESOURCES in src/lib/enums.ts.
-- The super-admin role carries an empty set on purpose: isSuperAdmin grants everything, including
-- permissions that do not exist yet, so listing today's keys would go stale.
INSERT INTO "PlatformRole" ("id", "name", "description", "permissions", "isSuperAdmin", "isSystem", "isActive", "createdAt", "updatedAt") VALUES
  ('pr_super_admin', 'مدير المنصة', 'صلاحية كاملة على لوحة إدارة المنصة', '{}', true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pr_support',     'الدعم',       'متابعة الشركات والاطلاع على فواتيرها دون تعديل',
     '{"dashboard":["view"],"companies":["view"],"billing":["view"]}', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pr_finance',     'المحاسبة',    'إدارة الفوترة ومراجعة إثباتات الدفع',
     '{"dashboard":["view"],"companies":["view"],"billing":["view","manage","reviewPayment"]}', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pr_operations',  'العمليات',    'إدارة الشركات المشتركة في المنصة',
     '{"dashboard":["view"],"companies":["view","manage"],"billing":["view"]}', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pr_auditor',     'مراقب',       'اطلاع فقط دون أي تعديل',
     '{"dashboard":["view"],"companies":["view"],"billing":["view"]}', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Backfill BEFORE dropping the old column so no existing account loses access.
-- A null legacy role meant "full access" under the old rules, so it maps to super admin.
UPDATE "User" SET "platformRoleId" = CASE "platformRole"
    WHEN 'SUPPORT'    THEN 'pr_support'
    WHEN 'FINANCE'    THEN 'pr_finance'
    WHEN 'OPERATIONS' THEN 'pr_operations'
    WHEN 'AUDITOR'    THEN 'pr_auditor'
    ELSE 'pr_super_admin'
  END
WHERE "userType" = 'PLATFORM_ADMIN';

-- DropColumn (superseded by platformRoleId)
ALTER TABLE "User" DROP COLUMN "platformRole";
