import * as React from "react";
import { cn } from "@renderer/lib/cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[120px] w-full resize-none border border-black bg-white px-3 py-3 text-sm text-black outline-none placeholder:text-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
