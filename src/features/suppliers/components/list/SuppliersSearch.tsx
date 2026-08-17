import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.search;

interface ISuppliersSearchProps {
  value: string;
  onChange: (value: string) => void;
}

/** The app-wide list search: dynamic width, `/` focus, `kbd` badge, `Escape` blurs. */
export function SuppliersSearch({ value, onChange }: ISuppliersSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className={cn(
        "relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
        focused ? "max-w-2xl" : "max-w-sm",
      )}
    >
      <Icon
        icon="mdi:magnify"
        size={16}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="search"
        aria-label={COPY.label}
        placeholder={COPY.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        className="pl-8 pr-9"
      />
      <kbd
        className={cn(
          "pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-opacity sm:flex",
          focused && "opacity-0",
        )}
      >
        /
      </kbd>
    </div>
  );
}
