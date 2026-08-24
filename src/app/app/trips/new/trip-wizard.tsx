"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Sparkles, X, Package, Boxes } from "lucide-react";
import { createTripAction, suggestShipmentsAction } from "../actions";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/shell/page-header";
import { routeLabel } from "@/lib/utils";

type Branch = { id: string; name: string };
type Driver = { id: string; name: string };
type Suggestion = {
  id: string;
  shipmentNumber: string;
  totalCartons: number;
  loadBranchId: string;
  unloadBranchId: string;
  customer: { name: string };
  loadBranch: { name: string };
  unloadBranch: { name: string };
};
type Stop = { branchId: string; loading: boolean; unloading: boolean; plannedArrival: string };

const DEFAULT_STOPS: Stop[] = [
  { branchId: "", loading: true, unloading: false, plannedArrival: "" },
  { branchId: "", loading: false, unloading: true, plannedArrival: "" },
];

export function TripWizard({ branches, drivers }: { branches: Branch[]; drivers: Driver[] }) {
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [driverId, setDriverId] = useState("");
  const [stops, setStops] = useState<Stop[]>(DEFAULT_STOPS);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loadingSuggestions, startFetchSuggestions] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const router = useRouter();

  const routeKey = JSON.stringify(stops.map((s) => ({ b: s.branchId, l: s.loading, u: s.unloading })));

  useEffect(() => {
    // suggestShipmentsAction itself resolves to [] when the staged stops don't yet form a valid
    // route (fewer than 2 branches, or no loading/unloading leg) — no client-side gating needed.
    // Fetched inside startTransition (not a plain setState-in-effect) so loadingSuggestions and the
    // result both land as one non-blocking update, same async-submit pattern used elsewhere here.
    let cancelled = false;
    startFetchSuggestions(async () => {
      const result = await suggestShipmentsAction(stops.map((s) => ({ branchId: s.branchId, loadingEnabled: s.loading, unloadingEnabled: s.unloading })));
      if (cancelled) return;
      setSuggestions(result);
      // Drop any prior selection that's no longer offered (route changed under it).
      setSelected((prev) => prev.filter((id) => result.some((r) => r.id === id)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.shipmentNumber.toLowerCase().includes(q) || s.customer.name.toLowerCase().includes(q));
  }, [suggestions, search]);

  const totalCartons = suggestions.reduce((sum, s) => sum + s.totalCartons, 0);
  const selectedShipments = suggestions.filter((s) => selected.includes(s.id));
  const selectedCartons = selectedShipments.reduce((sum, s) => sum + s.totalCartons, 0);
  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.includes(s.id));

  function updateStop(i: number, patch: Partial<Stop>) {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function handleSubmit(formData: FormData) {
    startSubmit(async () => {
      const result = await createTripAction(formData);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (result && "tripId" in result) {
        const assignedCount = result.assignedCount ?? 0;
        toast.success(assignedCount > 0 ? `تم إنشاء الرحلة وربط ${assignedCount} شحنة` : "تم إنشاء الرحلة");
        router.push(`/app/trips/${result.tripId}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader title="رحلة جديدة" />

      <form action={handleSubmit} className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
        {/* Suggested shipments — renders first in DOM, lands at the visual start (right) in RTL */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" /> الشحنات المتاحة للإضافة ({suggestions.length} شحنة)
            </CardTitle>
            {suggestions.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected(allFilteredSelected ? [] : [...new Set([...selected, ...filtered.map((s) => s.id)])])}
                className="text-xs text-primary hover:underline"
              >
                {allFilteredSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
              </button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="ابحث برقم الشحنة أو اسم العميل..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

            <div className="max-h-96 overflow-y-auto space-y-1">
              {filtered.map((s) => (
                <label key={s.id} className="flex items-center gap-3 rounded-lg border p-2 text-sm cursor-pointer hover:bg-accent">
                  <Checkbox
                    name="shipmentIds"
                    value={s.id}
                    checked={selected.includes(s.id)}
                    onCheckedChange={(v) => setSelected((prev) => (v ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                  />
                  <span className="font-medium text-primary">{s.shipmentNumber}</span>
                  <span className="text-muted-foreground">{s.customer.name}</span>
                  <span className="text-muted-foreground text-xs">{routeLabel(s.loadBranch.name, s.unloadBranch.name)}</span>
                  <span className="ms-auto text-muted-foreground">{s.totalCartons} كرتون</span>
                </label>
              ))}
              {!loadingSuggestions && suggestions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {stops.every((s) => s.branchId) ? "لا توجد شحنات مطابقة لهذا المسار حالياً" : "حدّد فروع المسار لعرض الشحنات المطابقة"}
                </p>
              )}
              {loadingSuggestions && <p className="text-sm text-muted-foreground text-center py-8">جارٍ البحث عن الشحنات المطابقة...</p>}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <StatCard label="شحنات مطابقة للمسار" value={suggestions.length} unit="شحنة" icon={Package} />
              <StatCard label="إجمالي الكراتين المطابقة" value={totalCartons} unit="كرتون" icon={Boxes} />
            </div>
          </CardContent>
        </Card>

        {/* Trip info + selected-shipments cart — renders second, lands at the visual end (left) */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">معلومات الرحلة</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="vehiclePlate">رقم المركبة</Label>
                <Input id="vehiclePlate" name="vehiclePlate" dir="ltr" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>السائق</Label>
                <Select name="driverId" value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="اختر السائق" /></SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>محطات الرحلة (بالترتيب)</Label>
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => setStops((s) => [...s, { branchId: "", loading: false, unloading: false, plannedArrival: "" }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> إضافة محطة
                  </Button>
                </div>
                <div className="space-y-2">
                  {stops.map((stop, i) => (
                    <div key={i} data-testid={`new-trip-stop-${i}`} className="flex items-center gap-2 rounded-lg border p-2 flex-wrap">
                      <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                      <Select name="stopBranchId" value={stop.branchId} onValueChange={(v) => updateStop(i, { branchId: v })}>
                        <SelectTrigger className="flex-1 min-w-28"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1 text-xs shrink-0">
                        <Checkbox name="stopLoading" value={String(i)} checked={stop.loading} onCheckedChange={(v) => updateStop(i, { loading: !!v })} /> تحميل
                      </label>
                      <label className="flex items-center gap-1 text-xs shrink-0">
                        <Checkbox name="stopUnloading" value={String(i)} checked={stop.unloading} onCheckedChange={(v) => updateStop(i, { unloading: !!v })} /> تفريغ
                      </label>
                      <Input
                        type="datetime-local"
                        name="stopPlannedArrival"
                        aria-label="الوصول المتوقع"
                        title="الوصول المتوقع (اختياري)"
                        value={stop.plannedArrival}
                        onChange={(e) => updateStop(i, { plannedArrival: e.target.value })}
                        className="h-8 w-40 text-xs shrink-0"
                      />
                      {stops.length > 2 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setStops((s) => s.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">الشحنات المختارة للرحلة ({selectedShipments.length} شحنة)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {selectedShipments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">لم يتم اختيار شحنات بعد — يمكن إضافتها لاحقاً من صفحة الرحلة أيضاً</p>
              )}
              {selectedShipments.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-sm border-b pb-1.5 last:border-0">
                  <button type="button" onClick={() => setSelected((prev) => prev.filter((x) => x !== s.id))} className="text-destructive shrink-0" title="إزالة">
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-medium text-primary flex-1 min-w-0 truncate">{s.shipmentNumber}</span>
                  <span className="text-muted-foreground truncate">{s.customer.name}</span>
                  <span className="text-muted-foreground shrink-0">{s.totalCartons} كرتون</span>
                </div>
              ))}
              {selectedShipments.length > 0 && (
                <p className="text-xs text-muted-foreground pt-1">الإجمالي: {selectedShipments.length} شحنات — {selectedCartons} كرتون</p>
              )}
            </CardContent>
          </Card>

          <Button type="submit" disabled={submitting} className="w-full h-10">
            {submitting ? "جارٍ الإنشاء..." : "إنشاء الرحلة"}
          </Button>
        </div>
      </form>
    </div>
  );
}

