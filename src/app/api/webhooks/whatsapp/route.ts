import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Meta's one-time subscription handshake: it calls this with hub.mode/hub.verify_token/
 * hub.challenge and expects the raw challenge string echoed back, but only if verify_token
 * matches what we configured in the Meta App dashboard's webhook subscription settings.
 * See https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  // Equal-length check first — timingSafeEqual throws on mismatched buffer lengths rather than
  // returning false, and the length check itself leaks nothing an attacker doesn't already know
  // (hex-encoded SHA-256 is always 64 chars).
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

type MetaStatusEntry = {
  id: string; // wamid — matches NotificationLog.providerMessageId
  status: "sent" | "delivered" | "read" | "failed";
  errors?: { title?: string; message?: string }[];
};

/**
 * Delivery-status callbacks (sent/delivered/read/failed) for messages this platform already sent.
 * Deliberately does NOT handle inbound customer messages — this platform doesn't run a WhatsApp
 * chatbot, only outbound shipment notifications (see section 13: don't add unneeded webhook scope).
 *
 * Never trusts any tenant/company identifier from the payload — every update is scoped by looking
 * up the NotificationLog row we ourselves created for this providerMessageId, so a forged payload
 * can at most report a bogus status for a message id, never touch a company it doesn't already
 * legitimately own the log row for. Naturally idempotent: Meta may deliver the same event more than
 * once (their own documented behavior), and re-applying the same status update is a no-op.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!isValidSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const entries = (payload as { entry?: { changes?: { value?: { statuses?: MetaStatusEntry[] } }[] }[] })?.entry ?? [];
  const statuses = entries.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.statuses ?? []);

  for (const s of statuses) {
    if (s.status !== "failed") continue; // "sent"/"delivered"/"read" don't change our own SENT status
    const errorDetail = s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? "delivery failed";
    await prisma.notificationLog
      .updateMany({ where: { providerMessageId: s.id }, data: { status: "FAILED", providerError: errorDetail } })
      .catch((err) => console.error("[whatsapp webhook] failed to record status update:", err));
  }

  // Meta requires a fast 200 regardless of whether any status matched a known message, or it will
  // back off and eventually disable the subscription.
  return NextResponse.json({ ok: true });
}
