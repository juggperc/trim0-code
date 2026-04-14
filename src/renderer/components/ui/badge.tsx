import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        default: "border-black bg-black text-white",
        outline: "border-zinc-300 bg-white text-zinc-700",
        accent: "border-black bg-cyan-100 text-black",
        subtle: "border-zinc-300 bg-zinc-100 text-zinc-800",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);
