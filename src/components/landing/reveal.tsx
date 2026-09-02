import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function Reveal({
  children,
  index = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: "div" | "li";
}) {
  return (
    <Tag className={cn("reveal", className)} data-reveal-index={index}>
      {children}
    </Tag>
  );
}
