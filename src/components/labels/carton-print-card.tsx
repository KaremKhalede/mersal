/**
 * Deterministic decorative bar pattern from the carton code — purely visual, matching the printed
 * design's barcode strip. The QR code below it (data-qr-value) stays the one real machine-readable
 * identifier this app scans (see carton-label.tsx) — no barcode symbology/checksum is implemented,
 * so this never claims to be scannable. Four bars per character keep the strip dense enough to read.
 *
 * Bars use proportional weights, not fixed pixel widths: real carton codes carry the full timestamp-
 * based shipment number (e.g. "SH-1786899964037-4-C1", 20+ chars), so a per-bar width wide enough to
 * look bold on a short code overflowed past the card's own border on long ones. Proportional widths
 * always sum to exactly the viewBox — maximally wide, never clipped, at any code length.
 *
 * Rendered as real <svg><rect> content with a hardcoded #000000 fill rather than CSS
 * background-color bars: background-color is a "background graphic" and print engines (Chrome's
 * print preview has "Background graphics" OFF by default; many thermal/POS drivers ignore CSS
 * backgrounds entirely) drop it, so the whole barcode silently vanished on paper while looking fine
 * on screen. SVG fill is vector page content, not a background — it always prints.
 */
function barcodeBars(value: string): number[] {
  return Array.from(value).flatMap((ch) => {
    const c = ch.charCodeAt(0);
    return [2 + (c % 3), 2 + ((c >> 2) % 3), 2 + ((c >> 4) % 3), 2 + ((c >> 6) % 3)];
  });
}

function DecorativeBarcode({ value }: { value: string }) {
  const gap = 1;
  const bars = barcodeBars(value).reduce<{ x: number; width: number }[]>((acc, width) => {
    const x = acc.length === 0 ? 0 : acc[acc.length - 1].x + acc[acc.length - 1].width + gap;
    return [...acc, { x, width }];
  }, []);
  const last = bars[bars.length - 1];
  const totalWidth = last.x + last.width;

  return (
    <svg
      data-testid="carton-barcode"
      className="h-24 w-full"
      viewBox={`0 0 ${totalWidth} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x} y={0} width={bar.width} height={100} fill="#000000" />
      ))}
    </svg>
  );
}

/**
 * Deliberately exempt from the app's type scale. Every `text-[Npx]` below is a physical size on a
 * 100×150mm thermal label read at arm's length off a stacked carton — not a step on a screen scale
 * shared with tables and dialogs. Mapping these onto text-2xs/xs/sm would resize printed output to
 * match an on-screen rhythm this surface does not have. Change them against a printed proof.
 */
export function CartonPrintCard({
  companyName,
  shipmentNumber,
  cartonIndex,
  totalCartons,
  loadBranchName,
  unloadBranchName,
  receiverName,
  receiverPhone,
  cartonCode,
  qrSvg,
  showBarcode,
  showQR,
  onCopy,
  hidden,
}: {
  companyName: string;
  shipmentNumber: string;
  cartonIndex: number;
  totalCartons: number;
  loadBranchName: string;
  unloadBranchName: string;
  receiverName: string;
  receiverPhone: string;
  cartonCode: string;
  qrSvg: string;
  showBarcode: boolean;
  showQR: boolean;
  onCopy: () => void;
  hidden?: boolean;
}) {
  return (
    <article
      dir="rtl"
      className="carton-print-card group relative rounded-lg border border-border bg-card p-3 transition-colors duration-200 hover:border-primary/50"
      style={hidden ? { display: "none" } : undefined}
    >
      <button
        type="button"
        title="نسخ الكود"
        aria-label="نسخ الكود"
        onClick={onCopy}
        className="print:hidden absolute left-3 top-3 z-10 text-muted-foreground/50 transition-colors hover:text-primary"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 9h10v10H9z" />
          <path d="M5 15V5h10" />
        </svg>
      </button>

      <div className="flex h-full flex-col rounded-md border border-dashed border-border px-4 py-4">
        {/* Cut guide sits on the card's own top edge, fully inside its bounds — previously it
            overflowed above the card (negative top offset) into the gray page background and, in
            print, got clipped by the card's fixed-size overflow:hidden. Kept in print now that
            it's contained: nothing to clip. */}
        <div className="absolute top-1.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1">
          <span className="h-0 w-5 border-t-2 border-dashed border-muted-foreground/50" />
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 -rotate-90 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" />
            <line x1="14.47" y1="14.48" x2="20" y2="20" />
            <line x1="8.12" y1="8.12" x2="12" y2="12" />
          </svg>
          <span className="h-0 w-5 border-t-2 border-dashed border-muted-foreground/50" />
        </div>

        <header className="flex items-center justify-end gap-2 pb-3">
          <p className="text-right text-[13px] font-bold leading-tight text-foreground">{companyName}</p>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor">
              <path d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Zm0 2.3 6.4 3.2L12 10.7 5.6 7.5 12 4.3ZM5 9.2l6 3v7.2l-6-3V9.2Zm8 10.2v-7.2l6-3v7.2l-6 3Z" />
            </svg>
          </span>
        </header>

        <div className="border-t border-foreground/80" />

        <div className="py-4 text-center">
          <p className="font-mono text-[34px] font-extrabold leading-none tracking-tight text-foreground" dir="ltr">
            {shipmentNumber}
          </p>
        </div>

        <div className="flex justify-center pb-4">
          <div className="rounded-md bg-foreground px-6 py-2 text-center text-background">
            {/* dir=ltr — in an RTL context bidi reorders "1 / 3" around the neutral slash and it
                renders as "3 / 1". The index must always read index-then-total. */}
            <p className="text-[17px] font-bold leading-tight" dir="ltr">
              {cartonIndex} / {totalCartons}
            </p>
            <p className="text-[11px] font-medium text-background/80">كرتون</p>
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="py-4 text-center text-[17px] font-black text-foreground">
          {loadBranchName} <span className="text-muted-foreground mx-1">←</span> <span className="text-[19px]">{unloadBranchName}</span>
        </div>

        <div className="border-t border-border" />

        <dl className="space-y-2 py-4 text-[14px]">
          <div className="flex w-full items-center justify-between">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="3.2" />
                <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
              </svg>
              المستلم :
            </dt>
            <dd className="text-[18px] font-black text-foreground">{receiverName}</dd>
          </div>
          <div className="flex w-full items-center justify-between">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z" />
              </svg>
              الجوال :
            </dt>
            <dd dir="ltr" className="font-mono text-[17px] font-bold text-foreground">
              {receiverPhone}
            </dd>
          </div>
        </dl>

        {showBarcode && (
          <>
            <div className="border-t border-border" />
            <div className="flex flex-col items-center gap-1 py-2">
              <DecorativeBarcode value={cartonCode} />
              <p className="font-mono text-[15px] font-bold tracking-wide text-foreground" dir="ltr">
                {cartonCode}
              </p>
            </div>
          </>
        )}

        {showQR && (
          <>
            <div className="border-t border-border" />
            <div className="mt-auto flex items-end justify-between pt-2">
              <div
                data-testid="carton-qr"
                data-qr-value={cartonCode}
                className="[&>svg]:h-[88px] [&>svg]:w-[88px]"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <div className="text-left">
                <span className="mb-1 inline-block text-[11px] font-semibold text-muted-foreground">
                  كود الكرتون
                </span>
                <p className="font-mono text-[14px] font-bold text-foreground" dir="ltr">
                  {cartonCode}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
