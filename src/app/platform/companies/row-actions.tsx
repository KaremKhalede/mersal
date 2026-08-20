"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, PauseCircle, PlayCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toggleCompanyStatusAction } from "./actions";

export function CompanyRowActions({ companyId, status }: { companyId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = status === "ACTIVE";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="إجراءات الشركة" disabled={pending}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => router.push(`/platform/companies/${companyId}`)}>
          <ExternalLink className="h-4 w-4" /> عرض التفاصيل
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            startTransition(async () => {
              try {
                await toggleCompanyStatusAction(companyId, active ? "SUSPENDED" : "ACTIVE");
                toast.success(active ? "تم إيقاف الشركة" : "تم تفعيل الشركة");
              } catch {
                toast.error("تعذّر تغيير حالة الشركة");
              }
            })
          }
        >
          {active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {active ? "إيقاف الشركة" : "تفعيل الشركة"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
