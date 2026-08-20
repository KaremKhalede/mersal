"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton({ children }: { children?: React.ReactNode }) {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> {children ?? "طباعة"}
    </Button>
  );
}
