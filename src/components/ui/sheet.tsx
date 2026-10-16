"use client"

// shadcn/ui-style Sheet with Radix Dialog primitives. Focus trapping,
// Escape/backdrop dismissal, ARIA, and focus restoration are owned by Radix.
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

function Sheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className = "", ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="sheet-overlay" className={`yat-ui-sheet-overlay ${className}`} {...props} />
}

type SheetContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
}

function SheetContent({ side = "left", className = "", children, ...props }: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content data-slot="sheet-content" data-side={side}
        className={`yat-ui-sheet-content ${className}`} {...props}>
        {children}
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className = "", ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={`yat-ui-sheet-header ${className}`} {...props} />
}

function SheetTitle({ className = "", ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="sheet-title" className={`yat-ui-sheet-title ${className}`} {...props} />
}

function SheetDescription({ className = "", ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="sheet-description" className={`yat-ui-sheet-description ${className}`} {...props} />
}

export { Sheet, SheetTrigger, SheetClose, SheetPortal, SheetOverlay, SheetContent, SheetHeader, SheetTitle, SheetDescription }
