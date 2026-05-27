interface ISellerAvatarProps {
  fullName: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** Optional accent ring (used by the podium). */
  ring?: "gold" | "silver" | "bronze" | "none";
}

const SIZE_CLASS: Record<NonNullable<ISellerAvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-20 w-20 text-2xl",
};

const RING_CLASS: Record<NonNullable<ISellerAvatarProps["ring"]>, string> = {
  gold: "ring-4 ring-amber-400/60",
  silver: "ring-4 ring-slate-300/70 dark:ring-slate-200/40",
  bronze: "ring-4 ring-orange-400/60",
  none: "",
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Circular avatar built from the seller's initials — no photo on the MVP. */
export function SellerAvatar({ fullName, size = "md", ring = "none" }: ISellerAvatarProps) {
  const initials = initialsFromName(fullName);
  return (
    <span
      aria-label={fullName}
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-accent/15 font-semibold text-foreground ${SIZE_CLASS[size]} ${RING_CLASS[ring]}`}
    >
      {initials}
    </span>
  );
}
