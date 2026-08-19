import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export interface IVehicleInviteAction {
  label: string;
  icon?: string;
  onClick: () => void;
}

export interface IVehicleInviteProps {
  icon: string;
  title: string;
  description?: string;
  action?: IVehicleInviteAction;
  secondary?: IVehicleInviteAction;
  /** Tighter padding, for invites that sit inside an already-small card. */
  compact?: boolean;
  className?: string;
}

/**
 * The standard "empty card" treatment for the vehicle module.
 *
 * An empty card that only says "sem dados" is a dead end; every one of them
 * here says what would fill it and offers the action that does — the km
 * reading, the first service entry, the model link.
 */
export function VehicleInvite({
  icon,
  title,
  description,
  action,
  secondary,
  compact = false,
  className,
}: IVehicleInviteProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 text-center",
        compact ? "px-4 py-4" : "px-5 py-7",
        className,
      )}
    >
      <span className="grid h-9 w-9 place-items-center rounded-full border border-border bg-muted/50 text-muted-foreground">
        <Icon icon={icon} size={18} />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-[340px] text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      {(action || secondary) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {action && (
            <Button variant="outline" size="sm" className="text-xs" onClick={action.onClick}>
              {action.icon && <Icon icon={action.icon} size={14} />}
              {action.label}
            </Button>
          )}
          {secondary && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={secondary.onClick}>
              {secondary.icon && <Icon icon={secondary.icon} size={14} />}
              {secondary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
