import { prisma } from "@/lib/db";

export async function logAudit(params: {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId ?? null,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
