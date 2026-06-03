import { Icon } from "@/components/Icon";
import type { KitUxMode } from "../types";

const OPTIONS: { mode: KitUxMode; icon: string; label: string }[] = [
  { mode: "page", icon: "mdi:page-layout-body", label: "Página" },
  { mode: "dialog", icon: "mdi:dock-window", label: "Dialog" },
  { mode: "drawer", icon: "mdi:dock-right", label: "Drawer" },
];

export interface IKitUxToggleProps {
  value: KitUxMode;
  onChange: (mode: KitUxMode) => void;
}

/** Segmented control selecting which UX hosts the kit form. */
export function KitUxToggle({ value, onChange }: IKitUxToggleProps) {
  return (
    <div
      className="inline-flex rounded-md border border-border p-0.5"
      role="group"
      aria-label="Modo do formulário"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          onClick={() => onChange(o.mode)}
          aria-pressed={value === o.mode}
          title={o.label}
          className={`grid h-7 w-7 place-items-center rounded ${
            value === o.mode
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon icon={o.icon} size={16} />
        </button>
      ))}
    </div>
  );
}
