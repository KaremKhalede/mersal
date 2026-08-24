import type { MetadataRoute } from "next";

/**
 * What turns this from a website into something a driver can keep on their home screen.
 *
 * `display: "standalone"` is the whole point: installed, the app opens with no address bar and no
 * browser chrome — which is also why the driver header carries its own refresh button, since there
 * is no reload button left to press (see driver/connection-status.tsx).
 *
 * Deliberately no service worker and no offline caching. The driver's taps drive a state machine
 * that messages customers over WhatsApp; a cached page or a replayed queue would show, and send,
 * facts that are no longer true. Installability is a shell decision, not an offline one.
 *
 * `start_url: "/"` rather than "/driver": the same install serves an office user, and "/" already
 * routes each session to where it belongs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chargee — منصة الشحن البري",
    short_name: "Chargee",
    description: "إدارة الشحنات والرحلات لشركات الشحن البري",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2f5bd0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
