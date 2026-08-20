import { prisma } from "@/lib/db";

export async function listVehiclesPaged(params: { companyId: string; search?: string; status?: string; page?: number; pageSize?: number }) {
  const { companyId, search, status, page = 1, pageSize = 10 } = params;
  const where = {
    companyId,
    AND: [
      search ? { plateNumber: { contains: search } } : {},
      status ? { isActive: status === "ACTIVE" } : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: { _count: { select: { trips: true } } },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return { items, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getVehicleDetail(companyId: string, vehicleId: string) {
  return prisma.vehicle.findFirst({
    where: { id: vehicleId, companyId },
    include: {
      _count: { select: { trips: true } },
      // "آخر الرحلات" — a short recent list, not a report: capped, no filters/sorting UI of its own.
      trips: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          driver: { select: { name: true } },
          stops: { orderBy: { sequence: "asc" }, select: { branch: { select: { name: true } } } },
        },
      },
    },
  });
}

export async function createVehicle(params: { companyId: string; plateNumber: string; type?: string; notes?: string }) {
  return prisma.vehicle.create({ data: params });
}

/** Same shape as customers/service.ts's findOrCreateCustomer — trip creation just types a plate
 * number (no separate "add a vehicle first" step required), and it's recognized again next time. */
export async function findOrCreateVehicle(params: { companyId: string; plateNumber: string }) {
  const existing = await prisma.vehicle.findFirst({ where: { companyId: params.companyId, plateNumber: params.plateNumber } });
  if (existing) return existing;
  return prisma.vehicle.create({ data: params });
}

export async function updateVehicle(companyId: string, vehicleId: string, data: { plateNumber?: string; type?: string | null; notes?: string | null }) {
  const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: vehicleId, companyId } });
  return prisma.vehicle.update({ where: { id: vehicle.id }, data });
}

export async function toggleVehicleActive(companyId: string, vehicleId: string, isActive: boolean) {
  const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: vehicleId, companyId } });
  return prisma.vehicle.update({ where: { id: vehicle.id }, data: { isActive } });
}
