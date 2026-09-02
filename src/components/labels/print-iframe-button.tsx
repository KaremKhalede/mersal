"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintIframeButton({ url }: { url: string }) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = () => {
    setPrinting(true);
    
    let iframe = document.getElementById("print-iframe") as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "print-iframe";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
    }

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error("Print failed", e);
        } finally {
          setPrinting(false);
        }
      }, 500);
    };

    // Use a cache-buster to ensure onload fires every time even if the URL hasn't changed
    const finalUrl = url.includes("?") ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
    iframe.src = finalUrl;
  };

  return (
    <Button variant="outline" onClick={handlePrint} disabled={printing}>
      <Printer className="h-4 w-4" /> {printing ? "تجهيز للطباعة..." : "طباعة"}
    </Button>
  );
}
