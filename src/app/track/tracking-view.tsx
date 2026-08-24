import { CUSTOMER_TIMELINE_STEPS, DELIVERY_CHANNEL_LABELS } from "@/lib/enums";
import { formatBusinessDateTime, formatDateStamp, formatDate } from "@/lib/timezone";
import {
  CheckCircle2,
  Circle,
  Truck,
  CalendarClock,
  CalendarDays,
  Boxes,
  Handshake,
  MapPin,
  AlertTriangle,
  Phone,
  MessageCircle,
  LifeBuoy,
} from "lucide-react";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import type { TrackedShipment } from "./tracked-shipment";
import type { PublicCarrier } from "./tenant";
import { ShareTracking } from "./share-tracking";

/**
 * The customer-facing tracking card — the only screen in this product a customer ever sees.
 *
 * Rendered by both public doors: the WhatsApp link (/track/<token>) and the lookup form (/track).
 * Two renderings of "where is my shipment" would drift within a release, and the one that drifts is
 * always the one nobody on the team looks at.
 *
 * Pure and serializable-props-only, so it renders identically whether the caller is a server
 * component (the token route) or a client component (the lookup result, which arrives as the return
 * value of a Server Action rather than as a page render).
 *
 * ---------------------------------------------------------------------------------------------
 * THE TWO SEAMS, AND WHY THEY ARE SECURITY BOUNDARIES RATHER THAN LAYOUT ONES
 * ---------------------------------------------------------------------------------------------
 * `actions`   — the pickup / home-delivery controls. They physically redirect cartons, and they are
 *               passed in ONLY by the token route, because the token is what authorizes them. The
 *               lookup path renders this same card without them; see src/app/track/actions.ts.
 * `shareUrl`  — the tracking link itself. Also token-only, for the same reason: the lookup path
 *               never holds one, so a share control there would offer an address that grants
 *               nothing and reveals a page the recipient cannot open.
 */
export function TrackingView({
  shipment,
  carrier,
  actions,
  footnote,
  shareUrl,
  showCarrier,
}: {
  shipment: TrackedShipment;
  /** The carrier, resolved by whichever route rendered this — from the slug on the branded lookup,
   *  from the shipment on the token link. Same shape either way, so the card cannot look different
   *  depending on which door the customer came through. */
  carrier: PublicCarrier;
  actions?: React.ReactNode;
  /** Shown in place of `actions` — how to act when this render cannot offer the controls. */
  footnote?: React.ReactNode;
  /** The absolute tracking URL. Token route only. */
  shareUrl?: string;
  /**
   * Name the carrier on the card itself.
   *
   * Needed by exactly one caller: the UNBRANDED fallback at /track. Its shell is rendered before
   * anyone knows whose shipment this is, so the brand bar above is generic and the card is the only
   * place the carrier can appear — without it a customer is shown a status and never told which
   * office is holding their goods.
   *
   * Off everywhere else, because the branded lookup and the token link already carry the carrier in
   * the bar and the footer; repeating it here would state the same thing three times on one screen.
   */
  showCarrier?: boolean;
}) {
  const currentStepIndex = CUSTOMER_TIMELINE_STEPS.findIndex((step) => step.statuses.includes(shipment.status as never));
  // Mirrors CHOOSABLE_STATUSES in the token route's actions — the page must offer exactly what the
  // server will accept, or the customer taps a choice that comes back refused.
  const isArrivedStage = ["ARRIVED", "PARTIALLY_ARRIVED", "READY_FOR_PICKUP"].includes(shipment.status);
  const isDelivered = shipment.status === "DELIVERED";
  const isException = shipment.status === "EXCEPTION" || shipment.status === "CANCELLED";
  // "متى تصل شحنتي؟" is the question this page exists to answer. Shown only while the shipment is
  // genuinely still travelling and the planned arrival is still ahead — a stale past estimate is
  // worse than none.
  const eta =
    shipment.plannedArrival && !isDelivered && !isArrivedStage && shipment.plannedArrival > new Date()
      ? shipment.plannedArrival
      : null;

  const tone = isDelivered ? "done" : isException ? "warn" : "moving";
  const headline = isDelivered
    ? "تم تسليم شحنتك بنجاح"
    : isException
      ? "شحنتك تحتاج متابعة"
      : (CUSTOMER_TIMELINE_STEPS[currentStepIndex]?.label ?? "قيد المعالجة");

  // The collecting branch first, the carrier's head office as fallback — a customer asking
  // "is it on the shelf" needs the shelf's phone.
  const supportPhone = normalizePhone(shipment.unloadBranch.phone ?? carrier.phone ?? "");

  /*
   * How far along the route, as a percentage — read off the customer-facing stage, not off a
   * location. CUSTOMER_TIMELINE_STEPS is the same six-step ladder the headline uses, so the strip
   * and the words above it can never disagree.
   *
   * Clamped to 12% at the bottom so the origin marker never sits exactly on the origin dot, and to
   * 100% only for a genuine handover. An exception parks it wherever the shipment actually got to
   * rather than resetting it — the goods did not travel backwards.
   */
  const stageCount = CUSTOMER_TIMELINE_STEPS.length - 1;
  const stage = isDelivered ? stageCount : Math.max(0, currentStepIndex);
  const progress = isDelivered ? 100 : Math.min(96, Math.max(12, Math.round((stage / stageCount) * 100)));
  const progressLabel = isDelivered
    ? `وصلت إلى ${shipment.unloadBranch.city}`
    : isException
      ? "متوقفة مؤقتاً — سيتواصل معك الفرع"
      : `${shipment.loadBranch.city} ← ${shipment.unloadBranch.city}`;

  // The recorded channel wins; the intention is only a fallback for a shipment still in flight.
  const handover =
    (shipment.deliveryChannel === "BRANCH_PICKUP" && DELIVERY_CHANNEL_LABELS.BRANCH_PICKUP) ||
    (shipment.deliveryChannel === "HOME_DELIVERY" && DELIVERY_CHANNEL_LABELS.HOME_DELIVERY) ||
    (shipment.deliveryMethod === "PICKUP" && DELIVERY_CHANNEL_LABELS.BRANCH_PICKUP) ||
    (shipment.deliveryMethod === "HOME_DELIVERY" && DELIVERY_CHANNEL_LABELS.HOME_DELIVERY) ||
    null;

  return (
    <div className="space-y-4">
      {/* ---- the answer, in one card ------------------------------------------------------ */}
      <article className={`track-card track-rise track-result track-result--${tone} overflow-hidden`}>
        {showCarrier && (
          <div className="flex items-center gap-2.5 border-b px-5 py-3 sm:px-6" style={{ borderColor: "var(--hairline)" }}>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: carrier.logoColor }}
            >
              {carrier.name.trim().slice(0, 1)}
            </span>
            <span className="min-w-0">
              <span className="block text-2xs" style={{ color: "var(--ink-soft)" }}>
                الناقل
              </span>
              <span className="block truncate text-sm font-bold" style={{ color: "var(--navy-900)" }}>
                {carrier.name}
              </span>
            </span>
          </div>
        )}

        {/*
          The strip above is conditional, not permanent.

          On the branded lookup and the token link the office owns the whole page — brand bar,
          footer and all — so naming it here too would say the same thing three times. The one door
          that needs it is the unbranded fallback, whose shell was rendered before the carrier was
          knowable. See `showCarrier`.
        */}
        {/* Side by side at every width. Stacking on a phone pushed the route strip below the fold
            on the one screen whose whole job is answering a question at a glance. */}
        <div className="flex items-center justify-between gap-4 p-5 sm:gap-5 sm:p-6">
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                رقم الشحنة
              </p>
              <p className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]" dir="ltr" style={{ color: "var(--navy-900)" }}>
                {shipment.shipmentNumber}
              </p>
            </div>

            {/*
              The one thing the customer opened this page to read, said in words and carried by a
              colour that means the same thing everywhere in this product. The wording for a
              shipment in motion is CUSTOMER_TIMELINE_STEPS' own label, not a second vocabulary, so
              the headline and the step highlighted below can never disagree.
            */}
            <p className="track-result__status flex items-center gap-2 text-lg font-bold">
              {isDelivered ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              ) : isException ? (
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
              ) : (
                <Truck className="h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              {headline}
            </p>

            <p className="flex flex-wrap items-center gap-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
              <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
              {isDelivered && shipment.deliveredAt ? (
                <>تم التسليم في {formatDateStamp(shipment.deliveredAt)}</>
              ) : eta ? (
                <>
                  الوصول المتوقع إلى {shipment.unloadBranch.city}:{" "}
                  <span className="font-semibold" style={{ color: "var(--navy-800)" }}>
                    {formatBusinessDateTime(eta, { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                </>
              ) : (
                <>آخر تحديث {formatDateStamp(shipment.updatedAt)}</>
              )}
            </p>

            {shareUrl && <ShareTracking url={shareUrl} shipmentNumber={shipment.shipmentNumber} />}
          </div>

          <ParcelMark tone={tone} />
        </div>

        {/*
          ---- the route -------------------------------------------------------------------
          How far along, derived from the stage the office has actually recorded — never from a
          position nobody knows. There is no GPS in this product, and a vehicle parked halfway down
          the line was claiming otherwise.

          The previous version was worse than imprecise: the marker sat in the middle at every
          status, so a delivered shipment still showed a truck between two cities. Now the traversed
          portion fills to the stage, and a delivered shipment reads as arrived — a check at the
          destination, no vehicle, nothing left implying the goods are still moving.
        */}
        <div className="mx-5 mb-5 rounded-2xl border p-4 sm:mx-6 sm:mb-6" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex items-center gap-3">
            <Endpoint label="من" city={shipment.loadBranch.city} done />
            <span className="track-route" data-arrived={progress === 100 ? "true" : undefined} aria-hidden="true">
              <span className="track-route__line" />
              <span className="track-route__line track-route__line--done" style={{ inlineSize: `${progress}%` }} />
              {/* The marker travels the track's INNER width, so its far edge lands on the line's end
                  rather than its centre — centring it on 100% pushed half the marker past the rail
                  and straight over the destination label. */}
              <span className="track-route__vehicle" style={{ "--p": progress } as React.CSSProperties}>
                {progress === 100 ? <CheckCircle2 className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
              </span>
            </span>
            <Endpoint label="إلى" city={shipment.unloadBranch.city} align="end" done={progress === 100} />
          </div>
          <p className="mt-2 text-center text-2xs" style={{ color: "var(--ink-soft)" }}>
            {progressLabel}
          </p>
        </div>

        {/* ---- three facts, and not a fourth ---------------------------------------------- */}
        <dl className={`grid grid-cols-1 divide-y border-t sm:divide-x sm:divide-x-reverse sm:divide-y-0 ${handover ? "sm:grid-cols-3" : "sm:grid-cols-2"}`} style={{ borderColor: "var(--hairline)" }}>
          <Fact icon={<CalendarDays className="h-4 w-4" />} label="تاريخ الشحن" value={formatDate(shipment.createdAt)} />
          {/*
            "طريقة الاستلام", not the mockup's "نوع الشحنة" — goods type describes what is INSIDE
            the box, and the lookup door means a guessed sequential number plus a 10,000-space digit
            guess would read it, so it stays out of the public view model.

            And the RECORDED channel, not the customer's earlier intention. `deliveryChannel` is
            written at handover in the same transaction as the DELIVERED transition; `deliveryMethod`
            is a choice the customer may have made on this very page and nobody ever acted on. Using
            the latter printed "لم تُحدَّد بعد" on shipments that had already been collected, with
            the real answer sitting one column away.

            When neither is known the cell is omitted entirely. "لم تُحدَّد بعد" is not a fact about
            a shipment — it is a fact about our data, and this page is read by a customer.
          */}
          {handover && <Fact icon={<Handshake className="h-4 w-4" />} label="طريقة الاستلام" value={handover} />}
          <Fact
            icon={<Boxes className="h-4 w-4" />}
            label="عدد الكراتين"
            // Both numbers, always: "6" alone hides a shipment that arrived five cartons short, and
            // the shortfall is the single most important thing such a customer can be told.
            value={`${shipment.arrivedCartons} من ${shipment.totalCartons}`}
          />
        </dl>
      </article>

      {/* ---- state notices, unchanged in meaning ----------------------------------------- */}
      {shipment.status === "PARTIALLY_ARRIVED" && (
        <p className="track-notice track-notice--warn">
          وصل {shipment.arrivedCartons} من أصل {shipment.totalCartons} كراتين إلى فرع {shipment.unloadBranch.city}.
          <br />
          يمكنك استلام ما وصل من الفرع أو طلب توصيله، وسنوافيك بشأن الباقي.
        </p>
      )}

      {isException && (
        <p className="track-notice track-notice--danger">
          هناك ملاحظة على شحنتك — يرجى التواصل مع {carrier.name}.
        </p>
      )}

      {/*
        "Ready" is only half an answer — the other half is where, and who to ask. The branch's own
        line comes first; head office is the fallback for a branch created before Branch.phone
        existed, which is every branch on day one.
      */}
      {isArrivedStage && !isDelivered && !shipment.deliveryRequestStatus && (
        <div className="track-notice track-notice--success text-start">
          <p className="flex items-center gap-1.5 font-semibold">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /> الاستلام من: {shipment.unloadBranch.name}
          </p>
          <p className="mt-0.5 ps-6" style={{ color: "var(--ink-soft)" }}>
            {shipment.unloadBranch.address ?? shipment.unloadBranch.city}
          </p>
        </div>
      )}

      {isDelivered && shipment.deliveredAt && shipment.deliveredToName && (
        <p className="track-notice track-notice--success">استلمها: {shipment.deliveredToName}</p>
      )}

      {/* ---- the journey ----------------------------------------------------------------- */}
      <section className="track-card track-reveal p-5 sm:p-6" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-base font-bold" style={{ color: "var(--navy-900)" }}>
          تتبع الشحنة
        </h2>
        <Timeline shipment={shipment} currentStepIndex={currentStepIndex} isDelivered={isDelivered} />
      </section>

      {actions}
      {footnote}

      {shipment.deliveryRequestStatus && !isDelivered && (
        <div className="track-notice track-notice--success">
          {shipment.deliveryRequestStatus === "OUT_FOR_DELIVERY" ? (
            <p className="font-medium">شحنتك قيد التوصيل الآن</p>
          ) : shipment.deliveryRequestStatus === "PENDING" ? (
            <>
              {/* A customer request is a request, not a dispatch — the branch reviews it first. */}
              <p className="font-medium">تم استلام طلب التوصيل</p>
              <p>سيراجعه الفرع ويتواصل معك لتأكيد العنوان والموعد.</p>
            </>
          ) : (
            <>
              <p className="font-medium">تم تأكيد طلب التوصيل</p>
              <p>سيتم التواصل معك عند بدء التوصيل.</p>
            </>
          )}
        </div>
      )}

      {/* ---- help ------------------------------------------------------------------------ */}
      {supportPhone && (
        <section className="track-card track-reveal flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:text-start">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: "var(--navy-100)", color: "var(--navy-800)" }}
            >
              <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-bold" style={{ color: "var(--navy-900)" }}>
                تحتاج مساعدة؟
              </p>
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                فريق {carrier.name} جاهز لخدمتك
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto">
            {/*
              A real button, in WhatsApp's own green.

              It was a white field with a hollow glyph sitting next to a filled navy call button, so
              it read as a disabled twin rather than a second way to get help — the one control on
              this card most likely to be used, styled like the least.

              The message is pre-filled with the shipment number the customer is looking at. Both
              sides win: the customer does not retype a 9-character reference they may have just
              found, and the office opens a conversation that already says which shipment it is
              about, instead of "السلام عليكم".
            */}
            <a
              className="track-support-btn track-support-btn--whatsapp"
              href={`https://wa.me/${supportPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                `مرحباً ${carrier.name}، أستفسر عن شحنتي رقم ${shipment.shipmentNumber}`
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> واتساب
            </a>
            <a className="track-support-btn track-support-btn--solid" href={`tel:${supportPhone}`}>
              <Phone className="h-4 w-4" aria-hidden="true" />
              <span dir="ltr">{formatPhoneDisplay(supportPhone)}</span>
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The journey, built from the shipment's OWN customer-visible events.
 *
 * Real events carry a title, a place and a timestamp — "غادرت الرحلة من فرع الرياض", at 08:15 —
 * which is exactly the three lines this design asks each node for. The alternative, a fixed list of
 * six labels, would have to invent a time for every step that has not happened, and print one for
 * steps that never will.
 *
 * The curated CUSTOMER_TIMELINE_STEPS are the fallback, not the default: a shipment registered
 * moments ago has no events yet, and an empty card is not an answer. They render without times,
 * because there are none.
 *
 * Newest first — the reason this page was opened is the most recent line, and a customer should not
 * have to read a parcel's whole life to reach it.
 */
function Timeline({
  shipment,
  currentStepIndex,
  isDelivered,
}: {
  shipment: TrackedShipment;
  currentStepIndex: number;
  isDelivered: boolean;
}) {
  const events = [...shipment.events].reverse();
  const VISIBLE = 4;

  if (events.length === 0) {
    return (
      <ol className="track-timeline mt-4">
        {CUSTOMER_TIMELINE_STEPS.map((step, i) => {
          const done = i < currentStepIndex || isDelivered;
          const current = i === currentStepIndex && !isDelivered;
          return (
            <li key={step.key} className="track-timeline__item" data-state={done ? "done" : current ? "current" : "todo"}>
              <span className="track-timeline__node" aria-hidden="true">
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : current ? <Truck className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
              </span>
              <span className="track-timeline__title">{step.label}</span>
            </li>
          );
        })}
      </ol>
    );
  }

  const head = events.slice(0, VISIBLE);
  const rest = events.slice(VISIBLE);

  return (
    <>
      <ol className="track-timeline mt-4">
        {head.map((event, i) => (
          <TimelineRow key={event.id} event={event} latest={i === 0} />
        ))}
      </ol>

      {/*
        A native <details>: disclosure is the platform's own control, keyboard- and
        screen-reader-correct with no ARIA written by hand, and it works before hydration — which on
        this page is the first paint, on a weak connection, for someone who is already lost.
      */}
      {rest.length > 0 && (
        <details className="track-help mt-1">
          <summary className="flex items-center justify-center gap-1.5 py-2 text-sm font-medium" style={{ color: "var(--navy-800)" }}>
            <span className="track-help__more">عرض كل التحديثات ({rest.length})</span>
            <span className="track-help__less">عرض أقل</span>
            <svg viewBox="0 0 24 24" className="track-help__chevron h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ol className="track-timeline track-help__body">
            {rest.map((event) => (
              <TimelineRow key={event.id} event={event} />
            ))}
          </ol>
        </details>
      )}
    </>
  );
}

/**
 * One recorded event.
 *
 * `data-state` distinguishes the LATEST from the earlier ones — never "done" from "pending". Every
 * row in this list is something that already happened; the previous version rendered the older ones
 * in the pale tone the fallback uses for steps that have not occurred, so a delivered shipment read
 * as though its journey had barely started. The newest row is filled because it is the answer the
 * customer opened the page for; the rest are complete, and look it.
 */
function TimelineRow({
  event,
  latest,
}: {
  event: TrackedShipment["events"][number];
  latest?: boolean;
}) {
  return (
    <li className="track-timeline__item" data-state={latest ? "latest" : "done"}>
      <span className="track-timeline__node" aria-hidden="true">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
      <span className="track-timeline__title">{event.title}</span>
      {event.description && <span className="track-timeline__desc">{event.description}</span>}
      {/* The stamp is an LTR island: a time in an Arabic paragraph reorders without it. */}
      <time className="track-timeline__time" dir="ltr" dateTime={event.createdAt.toISOString()}>
        {formatBusinessDateTime(event.createdAt, { day: "numeric", month: "short" })} ·{" "}
        {formatBusinessDateTime(event.createdAt, { hour: "2-digit", minute: "2-digit" })}
      </time>
    </li>
  );
}

function Endpoint({
  label,
  city,
  align,
  done,
}: {
  label: string;
  city: string;
  align?: "end";
  /** Reached. The destination only earns this on a real handover, so the strip cannot claim an
   *  arrival the office has not recorded. */
  done?: boolean;
}) {
  return (
    <span
      className={`flex min-w-0 flex-col ${align === "end" ? "items-end text-end" : "items-start text-start"}`}
      data-done={done ? "true" : undefined}
    >
      <span className="text-2xs" style={{ color: "var(--ink-soft)" }}>
        {label}
      </span>
      <span className="truncate text-sm font-bold" style={{ color: "var(--navy-900)" }}>
        {city}
      </span>
    </span>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-4" style={{ borderColor: "var(--hairline)" }}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "var(--navy-100)", color: "var(--navy-800)" }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <dt className="text-2xs" style={{ color: "var(--ink-soft)" }}>
          {label}
        </dt>
        {/* Wraps rather than truncates: every value here is a fact the row exists to state,
            and "استلام من ال…" states nothing. */}
        <dd className="text-sm font-semibold leading-tight" style={{ color: "var(--navy-900)" }}>
          {value}
        </dd>
      </span>
    </div>
  );
}

/**
 * The parcel mark — drawn, not photographed, and drawn in ONE piece.
 *
 * The design this card was rebuilt from used a rendered 3D carton. An inline SVG carries the same
 * idea at a fraction of the weight on the page most likely to be opened on mobile data, scales to
 * any density without a second asset, and — the reason it is here rather than a stock glyph — takes
 * the status colour, so the illustration states the same thing as the headline instead of
 * decorating it.
 *
 * The status badge is part of the drawing rather than an absolutely-positioned element on top of
 * it. As HTML it needed `inset-inline-*`, which resolves against whichever direction wins, and a
 * white `box-shadow` ring that crossed the halo's edge and left the badge looking bitten out of.
 * Inside the viewBox there is no direction to resolve and no ring to misalign: the badge is at the
 * coordinates it is at, at every width, in either writing direction.
 */
function ParcelMark({ tone }: { tone: "done" | "warn" | "moving" }) {
  return (
    <div className="track-parcel" aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" className="track-parcel__halo" />
        {/* box body */}
        <path d="M28 48 60 34l32 14v34L60 96 28 82Z" className="track-parcel__body" />
        {/* lid seam + tape */}
        <path d="M28 48 60 62l32-14M60 62v34" className="track-parcel__seam" />
        <path d="M46 41 78 55v10L46 51Z" className="track-parcel__tape" />

        {/* status badge — same coordinates whatever the writing direction */}
        <circle cx="90" cy="88" r="16" className="track-parcel__ring" />
        <circle cx="90" cy="88" r="13" className="track-parcel__badge" />
        <g className="track-parcel__glyph">
          {tone === "done" && <path d="m84 88 4 4 8-8" />}
          {tone === "warn" && <path d="M90 82v7M90 94h.01" />}
          {tone === "moving" && <path d="M84 88h12m-4-4 4 4-4 4" />}
        </g>
      </svg>
    </div>
  );
}
