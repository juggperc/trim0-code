/* eslint-disable react-refresh/only-export-components */
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@renderer/lib/cn";

export const Tabs = TabsPrimitive.Root;

export const TabsList = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn("inline-flex flex-wrap gap-2 border-b border-black/10 pb-3", className)}
    {...props}
  />
);

export const TabsTrigger = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "border border-zinc-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600 transition-colors hover:border-black hover:text-black data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white",
      className,
    )}
    {...props}
  />
);

export const TabsContent = TabsPrimitive.Content;
