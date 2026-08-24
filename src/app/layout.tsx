import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";

const cairo = Cairo({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
});

export const metadata: Metadata = {
  title: "منصة الشحن البري",
  description: "منصة SaaS متعددة المستأجرين لشركات الشحن البري",
  // Installed on a driver's phone the app opens without browser chrome; these are what iOS reads
  // to do that, since it ignores the web manifest's display mode. See src/app/manifest.ts.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Chargee" },
  icons: { apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#2f5bd0",
  // The one line that makes env(safe-area-inset-*) real. Without it those values are 0 and the
  // driver's fixed action bar sits under the home indicator on every notched phone — the button the
  // whole screen is built around, half-covered by the OS.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <QueryProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="top-left" richColors dir="rtl" />
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
