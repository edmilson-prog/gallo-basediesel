import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PwaButtonVariant = "gold" | "dark" | "ghost" | "plain" | "danger";
type PwaButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<PwaButtonVariant, string> = {
  gold: "bg-primary text-primary-foreground",
  dark: "bg-foreground/[0.07] text-foreground ring-1 ring-inset ring-border",
  ghost: "bg-transparent text-muted-foreground ring-1 ring-inset ring-border",
  plain: "bg-transparent text-muted-foreground",
  danger: "bg-transparent text-severity-critical ring-1 ring-inset ring-severity-critical/40",
};

const SIZE_CLASS: Record<PwaButtonSize, string> = {
  // 44px is the smallest comfortable touch target; the primary action gets 48.
  sm: "min-h-[44px] px-3 text-[13px]",
  md: "min-h-[48px] px-[18px] text-[14.5px]",
};

interface IPwaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PwaButtonVariant;
  size?: PwaButtonSize;
  full?: boolean;
  children: ReactNode;
}

export function PwaButton({
  variant = "dark",
  size = "md",
  full = false,
  className,
  children,
  ...rest
}: IPwaButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-bold leading-none tracking-[0.01em]",
        "transition-transform duration-150 ease-out active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        full && "w-full",
        className,
      )}
    >
      {children}
    </button>
  );
}
