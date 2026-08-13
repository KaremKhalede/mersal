"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "حفظ",
  children,
  onSuccess,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: (formData: FormData) => Promise<{ error?: string; [key: string]: unknown } | void>;
  submitLabel?: string;
  children: React.ReactNode;
  onSuccess?: (result: Record<string, unknown> | void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result && "error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
        toast.success("تم الحفظ بنجاح");
        onSuccess?.(result);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {children}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
