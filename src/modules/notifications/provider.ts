/**
 * WhatsApp channel abstraction. `send` takes a pre-approved template reference (name + language +
 * ordered parameters) rather than free-form text, because the real WhatsApp Business Platform only
 * allows business-initiated messages through Meta-approved templates — arbitrary body text is
 * rejected outside an active 24h customer-service window. `previewText` is a rendered, human-
 * readable copy of the same message, used only for the mock provider's log and the NotificationLog
 * row operators see on the "الإشعارات" screen; it is never sent to Meta.
 *
 * One central platform sender today (see notifications/service.ts) — this interface doesn't assume
 * that, so a future CompanyWhatsAppProvider (per-company Business Account) only needs to satisfy the
 * same contract, selected per company instead of once globally.
 */
export type WhatsAppTemplateMessage = {
  to: string; // E.164, e.g. "+967771234567" — already normalized by the caller
  templateName: string;
  languageCode: string; // Meta template language code, e.g. "ar"
  params: string[]; // ordered, positional — must match the approved template's {{1}} {{2}} ... placeholders
  previewText: string;
};

export type WhatsAppSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

export interface WhatsAppProvider {
  send(msg: WhatsAppTemplateMessage): Promise<WhatsAppSendResult>;
}

/** Default — logs instead of calling a real API. Used by every automated test and local dev. */
export class LogOnlyProvider implements WhatsAppProvider {
  async send(msg: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    console.log(`[WhatsApp mock -> ${msg.to}]`, msg.previewText);
    return { ok: true, providerMessageId: `mock-${Date.now()}` };
  }
}

/**
 * Real WhatsApp Business Platform (Meta Cloud API) sender for the platform's single central
 * number. See https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages.
 */
export class PlatformWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string
  ) {}

  async send(msg: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    const url = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: msg.templateName,
            language: { code: msg.languageCode },
            components: [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text })) }],
          },
        }),
      });
    } catch (err) {
      // Network-level failure (DNS, timeout, connection reset) — always worth a later retry.
      return { ok: false, error: err instanceof Error ? err.message : "network error", retryable: true };
    }

    const body = await res.json().catch(() => null);

    if (res.ok && body?.messages?.[0]?.id) {
      return { ok: true, providerMessageId: body.messages[0].id as string };
    }

    const metaError = body?.error;
    const message = metaError?.message ?? `HTTP ${res.status}`;
    // Meta's error taxonomy: rate limiting and 5xx are transient; auth/param/template errors are a
    // configuration problem that retrying the same request will not fix. See
    // https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes.
    const retryable = res.status === 429 || res.status >= 500 || metaError?.code === 80007;
    return { ok: false, error: message, retryable };
  }
}

function buildProvider(): WhatsAppProvider {
  if (process.env.WHATSAPP_PROVIDER === "meta") {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
      throw new Error("WHATSAPP_PROVIDER=meta requires WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to be set.");
    }
    return new PlatformWhatsAppProvider(phoneNumberId, accessToken);
  }
  return new LogOnlyProvider();
}

export const notificationProvider: WhatsAppProvider = buildProvider();
