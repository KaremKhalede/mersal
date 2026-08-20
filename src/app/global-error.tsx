"use client";

/**
 * Last resort: an error thrown by the root layout itself, before any of the section boundaries
 * exist. This file REPLACES the root layout when active, which has two consequences the docs are
 * explicit about and that shape everything below:
 *
 *   1. It must render its own <html> and <body>.
 *   2. Global styles are not loaded, so Tailwind classes and the app's design tokens do nothing
 *      here. Every style is therefore inline, and the Arabic font falls back to the system stack.
 *
 * It also means `dir="rtl"` and `lang="ar"` have to be set here by hand — otherwise the one screen
 * shown when everything else has failed would be the only left-to-right page in the product.
 *
 * Kept deliberately plain: this renders when the application is at its most broken, so it depends
 * on nothing — no components, no icons, no fonts, no data.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem 1rem",
          textAlign: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif",
        }}
      >
        <title>حدث خطأ — منصة الشحن البري</title>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "3.5rem",
            height: "3.5rem",
            borderRadius: "1rem",
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: "1.75rem",
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          !
        </div>

        <h1 style={{ margin: "0.5rem 0 0", fontSize: "1.125rem", fontWeight: 700 }}>حدث خطأ غير متوقع</h1>
        <p style={{ margin: 0, maxWidth: "24rem", fontSize: "0.875rem", lineHeight: 1.7, color: "#64748b" }}>
          تعذّر تحميل التطبيق. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم.
        </p>

        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: "0.75rem",
            height: "2.25rem",
            padding: "0 1rem",
            border: "none",
            borderRadius: "0.5rem",
            background: "#1e3a8a",
            color: "#ffffff",
            fontSize: "0.875rem",
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          حاول مرة أخرى
        </button>

        {error.digest && (
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.6875rem", color: "#94a3b8" }} dir="ltr">
            {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
