import type { Metadata } from "next";
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
