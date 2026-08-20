"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const formRef = useRef<HTMLFormElement>(null);

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
        {/* onSubmit, not <form action={...}>: React resets an uncontrolled form once a form action
            settles, including when it *failed*. That turned every rejected submit into a blank
            form — fix the one field the error named, and everything else you typed is gone. Owning
            the submit ourselves keeps the values there to correct. Radix unmounts the dialog on
            close, so a successful save still starts clean the next time it opens. */}
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(new FormData(e.currentTarget));
          }}
          className="space-y-4"
        >
          {children}
          <DialogFooter>
            {/* An explicit way out, not just the corner X: a dialog that confirms something
                irreversible should offer backing out as plainly as it offers going ahead. */}
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>إلغاء</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
