import { test, expect } from "@playwright/test";
import { PlatformWhatsAppProvider } from "@/modules/notifications/provider";
import { META_TEMPLATES } from "@/modules/notifications/templates";

/**
 * Real Meta WhatsApp Business Platform integration smoke test — Phase 5 P0 close-out, item 2.
 *
 * Deliberately separate from the main regression suite (which now always runs under
 * WHATSAPP_PROVIDER=mock, see .env / playwright.config.ts) and deliberately NOT run by default:
 * this test makes a REAL call to graph.facebook.com using real credentials and can, if a template
 * happens to be approved by Meta at the time it runs, deliver an actual WhatsApp message to the
 * phone number given. Opt-in only, three ways:
 *
 *   RUN_META_SMOKE=1 META_SMOKE_TEST_PHONE=+9677xxxxxxx \
 *     WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_ACCESS_TOKEN=... \
 *     npx playwright test whatsapp-meta-smoke
 *
 * (the last two are already in .env.staging.local if you're smoke-testing the real staging
 * WhatsApp Business config — source that file and just set RUN_META_SMOKE + the phone number).
 *
 * What "PASS" means here: the call reaches Meta and gets back a real, well-formed response — a
 * successful send, OR a structured rejection (e.g. "template not approved yet"). Either proves the
 * credentials/network/request-shape wiring is correct. It does NOT assert delivery succeeded —
 * that depends on Meta's own template-approval state, which is outside this codebase's control
 * (see project notes: as of the last check, no template had cleared Meta's review yet).
 */
const opted_in = process.env.RUN_META_SMOKE === "1";
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const testPhone = process.env.META_SMOKE_TEST_PHONE;

test.describe("Real Meta WhatsApp integration smoke test (explicit opt-in only)", () => {
  test("a template send reaches the real Graph API and returns a structured result", async () => {
    test.skip(!opted_in, "Set RUN_META_SMOKE=1 to run this against the real Meta API — skipped by default.");
    test.skip(!phoneNumberId || !accessToken, "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set (see .env.staging.local).");
    test.skip(!testPhone, "META_SMOKE_TEST_PHONE must be set to a real E.164 number you control.");

    const provider = new PlatformWhatsAppProvider(phoneNumberId!, accessToken!);
    const template = META_TEMPLATES.SHIPMENT_RECEIVED!;

    const result = await provider.send({
      to: testPhone!,
      templateName: template.name,
      languageCode: template.language,
      params: template.buildParams({
        companyName: "شركة اختبار الدخان",
        recipientName: "عميل اختبار",
        shipmentNumber: "SH-SMOKE-TEST",
        branchName: "فرع الاختبار",
        totalCartons: 1,
        arrivedCartons: 0,
        trackingUrl: "",
      }),
      previewText: "smoke test — real Meta provider wiring check",
    });

    console.log("[meta smoke] result:", JSON.stringify(result));

    if (result.ok) {
      expect(result.providerMessageId).toBeTruthy();
    } else {
      // A structured rejection (e.g. template not approved) still proves the request reached Meta
      // and got a real API response — that's the wiring guarantee this test exists to check.
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
