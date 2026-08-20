"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

/** The topbar search field — focuses on "/" from anywhere on the page (skipped while already
 * typing in a field) and shows the shortcut as a hint pill, same convention as GitHub/Linear. */
export function SearchInput({ defaultValue, placeholder }: { defaultValue?: string; placeholder: string }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      e.preventDefault();
      ref.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative w-full">
      <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        ref={ref}
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-lg border bg-muted/40 py-2 ps-9 pe-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <kbd className="absolute start-2.5 top-1/2 -translate-y-1/2 hidden sm:flex h-5 items-center rounded border bg-background px-1.5 text-[0.7rem] text-muted-foreground">
        /
      </kbd>
    </div>
  );
}
