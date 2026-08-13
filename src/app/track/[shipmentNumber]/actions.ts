"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createDeliveryRequest } from "@/modules/delivery/service";

export async function publicRequestDeliveryAction(shipmentNumber: string, formData: FormData) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { shipmentNumber } });
  if (!["ARRIVED", "READY_FOR_PICKUP"].includes(shipment.status)) {
    return { error: "لا يمكن طلب التوصيل في هذه المرحلة" };
  }

  await createDeliveryRequest({
    companyId: shipment.companyId,
    shipmentId: shipment.id,
    destinationAddress: String(formData.get("destinationAddress")),
    notes: String(formData.get("notes") || ""),
  });

  revalidatePath(`/track/${shipmentNumber}`);
}

export async function publicChoosePickupAction(shipmentNumber: string) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { shipmentNumber } });
  if (!["ARRIVED", "READY_FOR_PICKUP"].includes(shipment.status)) {
    return { error: "لا يمكن اختيار الاستلام في هذه المرحلة" };
  }
  await prisma.shipment.update({ where: { id: shipment.id }, data: { deliveryMethod: "PICKUP" } });
  revalidatePath(`/track/${shipmentNumber}`);
}
