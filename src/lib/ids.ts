import { prisma } from "@/lib/db";

async function uniqueNumber(prefix: string, check: (value: string) => Promise<boolean>) {
  for (let i = 0; i < 20; i++) {
    const n = Math.floor(10000 + Math.random() * 89999);
    const value = `${prefix}-${n}`;
    if (!(await check(value))) return value;
  }
  throw new Error("تعذّر توليد رقم فريد، حاول مرة أخرى");
}

export const nextShipmentNumber = () =>
  uniqueNumber("SH", async (v) => Boolean(await prisma.shipment.findUnique({ where: { shipmentNumber: v } })));

export const nextTripNumber = () =>
  uniqueNumber("TR", async (v) => Boolean(await prisma.trip.findUnique({ where: { tripNumber: v } })));

export const nextInvoiceNumber = () =>
  uniqueNumber("INV", async (v) => Boolean(await prisma.invoice.findUnique({ where: { invoiceNumber: v } })));
