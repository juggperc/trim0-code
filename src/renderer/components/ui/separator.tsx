import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@renderer/lib/cn";

export const Separator = ({
  className,
  orientation = "horizontal",
  decorative = true,
}: React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>) => (
  <SeparatorPrimitive.Root
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "shrink-0 bg-black/10",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      className,
    )}
  />
);
