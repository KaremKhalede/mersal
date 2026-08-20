"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LucideIcon } from "lucide-react";

export function ActionButton({
  action,
  children,
  icon: Icon,
  variant = "outline",
  size = "sm",
  confirmMessage,
  successMessage = "تم تنفيذ الإجراء",
}: {
  /** May either throw or return { error } — hardened actions return it, so the real Arabic reason
   *  survives a production build (see src/lib/action-result.ts). Both paths land on the toast. */
  action: () => Promise<void | { error?: string }>;
  children: React.ReactNode;
  icon?: LucideIcon;
  variant?: "outline" | "default" | "destructive" | "secondary" | "ghost";
  size?: "sm" | "default" | "lg";
  confirmMessage?: string;
  successMessage?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();

  function run() {
    startTransition(async () => {
      try {
        const result = await action();
        if (result && "error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        router.refresh();
        toast.success(successMessage);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() => (confirmMessage ? setConfirmOpen(true) : run())}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {children}
      </Button>
      {confirmMessage && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد الإجراء</DialogTitle>
              <DialogDescription>{confirmMessage}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>تراجع</Button>
              <Button
                type="button"
                variant={variant === "destructive" ? "destructive" : "default"}
                disabled={pending}
                onClick={() => {
                  setConfirmOpen(false);
                  run();
                }}
              >
                تأكيد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
