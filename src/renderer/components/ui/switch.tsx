import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@renderer/lib/cn";

export const Switch = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root
    className={cn(
      "peer inline-flex h-6 w-11 items-center border border-black bg-white transition-colors data-[state=checked]:bg-black",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block size-4 translate-x-1 bg-black transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-white" />
  </SwitchPrimitive.Root>
);
