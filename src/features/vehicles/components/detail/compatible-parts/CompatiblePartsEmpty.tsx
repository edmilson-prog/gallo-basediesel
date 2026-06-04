import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";

export interface ICompatiblePartsEmptyProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function CompatiblePartsEmpty({
  icon,
  title,
  description,
  action,
}: ICompatiblePartsEmptyProps) {
  return (
    <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
      <Icon
        icon={icon ?? "mdi:package-variant"}
        size={22}
        className="mx-auto text-muted-foreground"
      />
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {action ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
