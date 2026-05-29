import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IMockUserProfile } from "./mock-users";

/** Side accent color per role (Tailwind palette — decorative only). */
const ROLE_ACCENT: Record<string, string> = {
  Owner: "bg-primary",
  Gestor: "bg-sky-500",
  Vendedor: "bg-emerald-500",
  VendedorExterno: "bg-amber-500",
  SDR: "bg-cyan-500",
  Financeiro: "bg-rose-500",
  Cliente: "bg-violet-500",
};

interface IProfileCardProps {
  profile: IMockUserProfile;
  index: number;
  pending: boolean;
  onSelect: (id: string) => void;
}

export function ProfileCard({ profile, index, pending, onSelect }: IProfileCardProps) {
  const accent = ROLE_ACCENT[profile.role] ?? "bg-border";
  const roleLabel = profile.displayRole ?? profile.role;
  const isOwner = profile.role === "Owner" && profile.group === "team";

  return (
    <button
      type="button"
      onClick={() => onSelect(profile.id)}
      disabled={pending}
      aria-label={`Entrar como ${profile.displayName}, ${roleLabel}`}
      style={{ animationDelay: `${index * 40}ms` }}
      className={cn(
        "group relative flex w-full min-h-[44px] items-center gap-4 overflow-hidden rounded-lg border border-border bg-card p-4 text-left",
        "transition-colors duration-200 hover:border-primary/60 hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", accent)} aria-hidden="true" />

      <Avatar className="h-12 w-12 ring-2 ring-border">
        <AvatarFallback
          className={cn(
            "text-sm font-semibold",
            isOwner
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {profile.avatarInitials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{profile.displayName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {roleLabel}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">{profile.storeLabel}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{profile.description}</p>
      </div>

      <Icon
        icon={pending ? "lucide:loader-2" : "lucide:arrow-right"}
        size={18}
        className={cn(
          "shrink-0 text-muted-foreground transition-transform duration-200",
          pending ? "animate-spin" : "group-hover:translate-x-1 group-hover:text-primary",
        )}
      />
    </button>
  );
}
