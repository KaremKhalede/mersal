"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Building2, Upload, Save, Contact, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateCompanySettingsAction, type CompanySettingsState } from "../actions";

type Company = {
  name: string;
  nameEn: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  logoColor: string;
  hasLogo: boolean;
};

/** Marks a field visually as required, mirroring the red asterisks in the design. */
function Req() {
  return <span className="text-destructive"> *</span>;
}

function SectionCard({
  title,
  icon: Icon,
  children,
  className = "",
  delay = 0,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className={`animate-in rounded-xl border bg-card p-5 shadow-sm fade-in slide-in-from-bottom-3 duration-500 [animation-fill-mode:backwards] motion-reduce:animate-none ${className}`}
    >
      <h2 className="mb-5 flex items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export function CompanySettingsForm({ company }: { company: Company }) {
  const [state, formAction, pending] = useActionState<CompanySettingsState, FormData>(
    updateCompanySettingsAction,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) toast.success("تم حفظ التغييرات");
    else if (state.error) toast.error(state.error);
  }, [state]);

  // Object URLs must be revoked or the blob leaks for the life of the page.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  }

  const logoSrc = preview ?? (company.hasLogo ? "/api/company/logo" : null);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="معلومات الشركة" icon={Building2} className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">اسم الشركة (بالعربية)<Req /></Label>
              <Input id="name" name="name" defaultValue={company.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameEn">اسم الشركة (بالإنجليزية)<Req /></Label>
              <Input id="nameEn" name="nameEn" defaultValue={company.nameEn ?? ""} dir="ltr" required />
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="description">وصف الشركة</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={company.description ?? ""}
              className="flex w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </SectionCard>

        <SectionCard title="الشعار" icon={ImageIcon} delay={60}>
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
              {logoSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element --
                   blob: preview + an authenticated API route; next/image buys nothing for a
                   2MB-capped logo and can't optimize either source. */
                <img src={logoSrc} alt="شعار الشركة" className="max-h-28 max-w-full object-contain" />
              ) : (
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: company.logoColor }}
                >
                  <Building2 className="h-8 w-8" />
                </span>
              )}
            </div>

            <input
              ref={fileRef}
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onPickLogo}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-center"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              تغيير الشعار
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              PNG أو JPG أو WEBP — الحد الأقصى 2 ميجابايت
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="معلومات التواصل" icon={Contact} delay={120}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone">رقم الهاتف</Label>
            <Input id="phone" name="phone" defaultValue={company.phone ?? ""} dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">البريد الإلكتروني<Req /></Label>
            <Input id="email" name="email" type="email" defaultValue={company.email ?? ""} dir="ltr" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="website">الموقع الإلكتروني</Label>
            <Input id="website" name="website" defaultValue={company.website ?? ""} dir="ltr" placeholder="https://example.com" />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="address">العنوان</Label>
          <Input id="address" name="address" defaultValue={company.address ?? ""} />
        </div>
      </SectionCard>

      {/* row-reverse lays the pair out left-to-right and packs it at the physical left, matching the
          design, while keeping Save first in the DOM so it still leads the tab order. */}
      <div className="flex flex-row-reverse flex-wrap items-center justify-start gap-2 rounded-xl border bg-card p-4 shadow-sm">
        <Button type="submit" className="h-9" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9"
          disabled={pending}
          onClick={() => {
            formRef.current?.reset();
            setPreview((old) => {
              if (old) URL.revokeObjectURL(old);
              return null;
            });
          }}
        >
          إلغاء
        </Button>
      </div>
    </form>
  );
}
