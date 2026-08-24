"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * `required` is a prop, not a character someone remembers to type.
 *
 * The product marked required fields three different ways: a "*" hand-written into the label text
 * (eleven labels), nothing at all (most of them), and — in one dialog — seven asterisks for five
 * genuinely required fields, because the text and the constraint were maintained separately and
 * had drifted apart.
 *
 * Expressing it as a prop means the marker is generated, so it cannot disagree with itself. It is
 * deliberately independent of the input's HTML `required` attribute: several fields in this product
 * are required by the server while carrying no HTML constraint, because they are Radix Selects
 * whose native proxy Chrome cannot focus (see the shipments/employees/vehicles dialogs). Those
 * fields are still required — the prop is what says so to the person filling the form.
 *
 * aria-hidden on the glyph: assistive tech reads requiredness from the control, and a screen reader
 * announcing "star" after every label is noise.
 */
function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-1 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {required && <span aria-hidden="true" className="text-destructive">*</span>}
    </LabelPrimitive.Root>
  )
}

export { Label }
