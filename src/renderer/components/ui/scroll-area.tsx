import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@renderer/lib/cn";

export const ScrollArea = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>) => (
  <ScrollAreaPrimitive.Root className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="size-full">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar
      orientation="vertical"
      className="flex w-2.5 touch-none border-l border-black/10 bg-zinc-100 p-[1px]"
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 bg-black/50" />
    </ScrollAreaPrimitive.Scrollbar>
  </ScrollAreaPrimitive.Root>
);
