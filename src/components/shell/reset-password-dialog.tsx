"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ResetResult = { url: string; expiresAt: string; name: string } | { error: string } | undefined;

/**
 * The one UI for every admin-issued password reset — company employees, platform staff, and a
 * tenant's own owner account all route through this, differing only in which server action they
 * hand it. Three copies of a dialog whose whole job is "show a link once" would be three places to
 * get the wording of a security-sensitive step slightly differently wrong.
 *
 * Two deliberate properties:
 *  - The link is shown, never sent. This product has no outbound mail channel, and the office
 *    already has the person's WhatsApp — or is standing next to them.
 *  - No password is ever displayed, typed by the admin, or returned by the server. The person
 *    chooses their own on the reset page, so "the manager knows everyone's password" stays false.
 */
export function ResetPasswordDialog({
  triggerLabel = "إعادة تعيين كلمة المرور",
  asMenuItem,
  personName,
  action,
}: {
  triggerLabel?: string;
  /** Render as a plain full-width row, for use inside a DropdownMenuItem's slot. */
  asMenuItem?: boolean;
  personName: string;
  action: () => Promise<ResetResult>;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function issue() {
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      if (!result?.url) {
        toast.error("تعذّر إصدار الرابط");
        return;
      }
      setLink(result.url);
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("تم نسخ الرابط");
    } catch {
      toast.error("تعذّر النسخ — حدد الرابط وانسخه يدوياً");
    }
  }

  function close(next: boolean) {
    setOpen(next);
    if (!next) setLink(null);
  }

  return (
    <>
      <Button
        variant={asMenuItem ? "ghost" : "outline"}
        size="sm"
        className={asMenuItem ? "h-auto w-full justify-start gap-2 px-2 py-1.5 font-normal" : undefined}
        onClick={() => close(true)}
      >
        <KeyRound className="h-4 w-4" /> {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
            <DialogDescription>
              {link
                ? `أرسل هذا الرابط إلى ${personName}. يفتحه ويختار كلمة مروره بنفسه. الرابط صالح لمدة ساعة واحدة ولمرة واحدة فقط.`
                : `سيتم إنشاء رابط لمرة واحدة يختار من خلاله ${personName} كلمة مرور جديدة. لن تظهر لك كلمة المرور.`}
            </DialogDescription>
          </DialogHeader>

          {link && (
            <div className="flex items-center gap-2">
              <Input readOnly value={link} dir="ltr" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="نسخ الرابط">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}

          <DialogFooter>
            {link ? (
              <Button type="button" onClick={() => close(false)}>تم</Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => close(false)}>إلغاء</Button>
                <Button type="button" onClick={issue} disabled={pending}>
                  {pending ? "جارٍ الإصدار..." : "إصدار الرابط"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
