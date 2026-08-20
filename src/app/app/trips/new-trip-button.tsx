"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function NewTripButton() {
  const router = useRouter();
  return (
    <Button onClick={() => router.push("/app/trips/new")}>
      <Plus className="h-4 w-4" /> رحلة جديدة
    </Button>
  );
}
