import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@renderer/lib/cn";

export const BrandDither = ({ className }: { className?: string }) => {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-black bg-white",
        className,
      )}
    >
      <img
        src="/trim0-brand.gif"
        alt=""
        className="absolute inset-0 size-full object-cover opacity-90"
      />
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.48),transparent_36%),radial-gradient(circle_at_70%_38%,rgba(192,132,252,0.42),transparent_30%),radial-gradient(circle_at_54%_72%,rgba(244,114,182,0.26),transparent_34%)] mix-blend-screen"
        animate={
          reduceMotion
            ? { opacity: 0.5 }
            : {
                opacity: [0.35, 0.65, 0.45, 0.35],
                backgroundPosition: ["0% 0%", "100% 0%", "55% 100%", "0% 0%"],
              }
        }
        transition={
          reduceMotion ? { duration: 0 } : { duration: 10, repeat: Infinity, ease: "easeInOut" }
        }
      />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(255,255,255,0.78),rgba(255,255,255,0.2))]" />
    </div>
  );
};
