"use client"

// shadcn/ui-style Tabs, backed by Radix primitives. Shared interface layer
// only: YAT?STATS owns the typography and brand-specific presentation.
import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

function Tabs({ className = "", ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={`yat-ui-tabs ${className}`} {...props} />
}

function TabsList({ className = "", ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" className={`yat-ui-tabs-list ${className}`} {...props} />
}

function TabsTrigger({ className = "", ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger data-slot="tabs-trigger" className={`yat-ui-tabs-trigger ${className}`} {...props} />
}

function TabsContent({ className = "", ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={`yat-ui-tabs-content ${className}`} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
