"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * The one form dialog in the product. Every dialog that submits a form goes through this — not as a
 * style preference, but because of the submit behaviour below, which six hand-rolled dialogs got
 * wrong independently before they were migrated here.
 *
 * Open state is uncontrolled by default (pass `trigger`, the dialog owns its own state). Pass
 * `open`/`onOpenChange` instead when the thing that opens it is not a trigger button — a
 * DropdownMenuItem, for instance, where Radix would unmount the menu (and with it a nested trigger)
 * at the moment of selection.
 */
export function FormDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  action,
  size = "sm",
  submitLabel = "حفظ",
  submitVariant = "default",
  successMessage = "تم الحفظ بنجاح",
  children,
  onSuccess,
}: {
  /** Omit when the dialog is opened externally via `open`/`onOpenChange`. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** "lg" for forms that genuinely need two or three columns — the default 384px turns a 3-up row
   *  into three ~110px fields, which is narrower than the values people type into them. */
  size?: "sm" | "lg";
  action: (formData: FormData) => Promise<{ error?: string; [key: string]: unknown } | void>;
  submitLabel?: string;
  /** "destructive" for a dialog whose confirm actually destroys or refuses something. */
  submitVariant?: "default" | "destructive";
  successMessage?: string;
  children: React.ReactNode;
  onSuccess?: (result: Record<string, unknown> | void) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  function setOpen(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

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
        toast.success(successMessage);
        onSuccess?.(result);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={size === "lg" ? "sm:max-w-lg" : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* onSubmit, not <form action={...}>: React resets an uncontrolled form once a form action
            settles, including when it *failed*. That turned every rejected submit into a blank
            form — fix the one field the error named, and everything else you typed is gone. Owning
            the submit ourselves keeps the values there to correct. Radix unmounts the dialog on
            close, so a successful save still starts clean the next time it opens. */}
        {/* The form is the flex item DialogContent has to be able to shrink, because the footer
            lives inside it (it must, or the submit button leaves the form and stops submitting it).
            `min-h-0` is what lets it: a flex item's automatic minimum size is its content, so
            without it the form refuses to go below its natural height and the whole dialog
            overflows the viewport again with `max-h` doing nothing. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(new FormData(e.currentTarget));
          }}
          className="flex min-h-0 flex-col gap-4"
        >
          {/* space-y-4 moved off the form and onto the body: the form's own children are now the
              scroll area and the footer, and those are spaced by the flex gap above. */}
          <DialogBody className="space-y-4">{children}</DialogBody>
          <DialogFooter>
            {/* An explicit way out, not just the corner X: a dialog that confirms something
                irreversible should offer backing out as plainly as it offers going ahead. */}
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>إلغاء</Button>
            </DialogClose>
            <Button type="submit" variant={submitVariant} disabled={pending}>
              {pending ? "جارٍ الحفظ..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
