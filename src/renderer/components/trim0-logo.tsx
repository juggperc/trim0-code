import { cn } from "@renderer/lib/cn";

export const Trim0Logo = ({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) => (
  <div className={cn("flex items-center gap-3", className)}>
    <svg
      width={compact ? "20" : "24"}
      height={compact ? "20" : "24"}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-black"
    >
      <rect x="0" y="12" width="12" height="12" fill="currentColor" />
      <rect x="12" y="0" width="12" height="12" fill="currentColor" />
    </svg>
    <span
      className={cn(
        "lowercase tracking-tight text-black",
        compact ? "text-xl" : "text-2xl sm:text-3xl",
      )}
      style={{ fontFamily: '"Silkscreen", monospace' }}
    >
      trim0.code
    </span>
  </div>
);
