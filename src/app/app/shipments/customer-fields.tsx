"use client";

import { useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchCustomersAction } from "@/app/app/customers/actions";

type Match = { id: string; name: string; phone: string };

/**
 * Customer half of the shipment intake form.
 *
 * Deliberately NOT a combobox. The name and phone inputs stay visible, editable and required at all
 * times — exactly as before — and the search box above them is pure convenience: type two letters,
 * click a result, the two fields fill in. A new customer is still just typing into them, with no
 * mode to switch and no state to get stuck in.
 *
 * The reason this matters beyond keystrokes: findOrCreateCustomer matches on *phone*, so a repeat
 * customer whose number is retyped with a stray space or a different prefix used to land as a
 * near-duplicate row — and when it did match, the freshly typed name was silently discarded in
 * favour of whatever was on file months ago, with nothing on screen saying so. Picking a result
 * submits the stored, already-normalized phone, so the match is exact by construction.
 */
export function CustomerFields() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Match | null>(null);
  const [searching, startSearch] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runSearch(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    // The action already returns [] below two characters; this only avoids the round trip.
    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }
    timer.current = setTimeout(() => {
      startSearch(async () => setMatches(await searchCustomersAction(value)));
    }, 250);
  }

  function pick(match: Match) {
    setName(match.name);
    setPhone(match.phone);
    setPicked(match);
    setQuery("");
    setMatches([]);
  }

  function clearPick() {
    setPicked(null);
    setName("");
    setPhone("");
  }

  return (
    <div className="space-y-3">
      {picked ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            عميل مسجّل: <span className="font-medium">{picked.name}</span>
          </span>
          <button type="button" onClick={clearPick} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="إلغاء اختيار العميل">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="customerSearch">البحث عن عميل مسجّل (اختياري)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            {/* No `name` attribute: this box is a lookup, never part of what the form submits. */}
            <Input
              id="customerSearch"
              autoComplete="off"
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="اكتب اسم العميل أو رقم جواله..."
              className="pe-8"
            />
          </div>
          {query.trim().length >= 2 && (
            <div className="rounded-lg border">
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m)}
                  className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-start text-sm last:border-0 hover:bg-accent"
                >
                  <span className="min-w-0 truncate font-medium">{m.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">{m.phone}</span>
                </button>
              ))}
              {matches.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {searching ? "جارٍ البحث..." : "لا يوجد عميل مطابق — أدخل بياناته أدناه"}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="customerName">اسم العميل</Label>
          <Input id="customerName" name="customerName" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customerPhone">جوال العميل</Label>
          <Input id="customerPhone" name="customerPhone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
      </div>
    </div>
  );
}
