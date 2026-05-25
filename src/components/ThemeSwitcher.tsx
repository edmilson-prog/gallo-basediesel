import { Check, Monitor, Moon, Sun } from "lucide-react";
import { THEMES, THEME_NAMES, type ThemeMode } from "@/config/themes";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "auto", label: "Auto (SO)", icon: Monitor },
];

interface IThemeSwitcherProps {
  className?: string;
  align?: "start" | "center" | "end";
}

export function ThemeSwitcher({ className, align = "end" }: IThemeSwitcherProps) {
  const { theme, mode, resolvedMode, setTheme, setMode } = useTheme();
  const active = THEMES[theme];
  const ModeIcon = MODE_OPTIONS.find((m) => m.value === mode)?.icon ?? Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Tema atual: ${active.uiLabel}, modo ${resolvedMode}`}
          className={cn("gap-2", className)}
        >
          <span
            aria-hidden
            className="size-3 rounded-full border border-border"
            style={{ backgroundColor: active.accentHex }}
          />
          <span className="hidden sm:inline">{active.codename}</span>
          <ModeIcon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        {THEME_NAMES.map((name) => {
          const t = THEMES[name];
          const selected = name === theme;
          return (
            <DropdownMenuItem
              key={name}
              onSelect={() => setTheme(name)}
              role="menuitemradio"
              aria-checked={selected}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: t.accentHex }}
              />
              <span className="flex-1">{t.uiLabel}</span>
              {selected && <Check className="size-4" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Modo</DropdownMenuLabel>
        {MODE_OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = value === mode;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => setMode(value)}
              role="menuitemradio"
              aria-checked={selected}
              className="flex items-center gap-2"
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {selected && <Check className="size-4" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
