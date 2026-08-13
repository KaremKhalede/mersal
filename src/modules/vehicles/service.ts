import { prisma } from "@/lib/db";

export async function listVehicles(companyId: string) {
  return prisma.vehicle.findMany({ where: { companyId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { trips: true } } } });
}

export async function createVehicle(params: { companyId: string; plateNumber: string; type?: string }) {
  return prisma.vehicle.create({ data: params });
}

/** Same shape as customers/service.ts's findOrCreateCustomer — trip creation just types a plate
 * number (no separate "add a vehicle first" step required), and it's recognized again next time. */
export async function findOrCreateVehicle(params: { companyId: string; plateNumber: string }) {
  const existing = await prisma.vehicle.findFirst({ where: { companyId: params.companyId, plateNumber: params.plateNumber } });
  if (existing) return existing;
  return prisma.vehicle.create({ data: params });
}

export async function toggleVehicleActive(companyId: string, vehicleId: string, isActive: boolean) {
  const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: vehicleId, companyId } });
  return prisma.vehicle.update({ where: { id: vehicle.id }, data: { isActive } });
}
