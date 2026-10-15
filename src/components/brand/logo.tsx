import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";

const SIZES = {
  sm: { mark: "size-7 text-sm", text: "text-lg" },
  md: { mark: "size-9 text-base", text: "text-xl" },
  lg: { mark: "size-14 text-2xl", text: "text-3xl" },
} as const;

type LogoProps = {
  variant?: "full" | "mark";
  size?: keyof typeof SIZES;
  className?: string;
};

// Text mark until the brand is decided; swap in the real logo here only.
export function Logo({ variant = "full", size = "md", className }: LogoProps) {
  const { mark, text } = SIZES[size];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-label={variant === "mark" ? BRAND.name : undefined}
        className={cn("inline-flex items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground", mark)}
      >
        {BRAND.name.charAt(0)}
      </span>
      {variant === "full" && <span className={cn("font-semibold tracking-tight", text)}>{BRAND.name}</span>}
    </span>
  );
}
