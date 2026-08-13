"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  action: () => Promise<void>;
  children: React.ReactNode;
  icon?: LucideIcon;
  variant?: "outline" | "default" | "destructive" | "secondary" | "ghost";
  size?: "sm" | "default" | "lg";
  confirmMessage?: string;
  successMessage?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() => {
        if (confirmMessage && !confirm(confirmMessage)) return;
        startTransition(async () => {
          try {
            await action();
            router.refresh();
            toast.success(successMessage);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
          }
        });
      }}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </Button>
  );
}
