/**
 * Delivery provider boundary. The shipping platform is only responsible for the shipment
 * until it hands it off through this interface — Arshi is the first (mock) implementation.
 * A future real integration only needs to satisfy this contract.
 */
export interface DeliveryProvider {
  createDelivery(input: {
    externalRef: string;
    customerName: string;
    customerPhone: string;
    pickupAddress: string;
    destinationAddress: string;
    cartonCount: number;
  }): Promise<{ providerRef: string; status: string }>;
  getDeliveryStatus(providerRef: string): Promise<{ status: string }>;
  cancelDelivery(providerRef: string): Promise<{ status: string }>;
}

/** Simulates Arshi accepting the handoff instantly and progressing on its own timeline. */
export class ArshiMockProvider implements DeliveryProvider {
  async createDelivery(input: { externalRef: string }) {
    return { providerRef: `ARSHI-${input.externalRef}`, status: "ASSIGNED" };
  }
  async getDeliveryStatus(providerRef: string) {
    return { status: "ASSIGNED", providerRef } as { status: string };
  }
  async cancelDelivery() {
    return { status: "CANCELLED" };
  }
}

export const deliveryProvider: DeliveryProvider = new ArshiMockProvider();
