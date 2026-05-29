import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Global search field for the TopBar.
 *
 * UX notes:
 * - Dynamic width: the field is compact at rest and expands on focus
 *   (max-w-sm → max-w-2xl) so it does not crowd the header until in use.
 * - "/" keyboard activation (Linear/GitHub pattern): pressing "/" anywhere
 *   focuses the field, unless the user is already typing in another field.
 * - "Escape" blurs the field.
 * - A "/" kbd hint is shown at rest and fades out on focus.
 */
export function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.defaultPrevented) return;

      // Don't hijack "/" while the user is typing somewhere else.
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable === true;
      if (isTyping) return;

      event.preventDefault();
      inputRef.current?.focus();
    }

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <div
      className={cn(
        "relative hidden flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none md:block",
        focused ? "max-w-2xl" : "max-w-sm",
      )}
    >
      <Icon
        icon="mdi:magnify"
        size={18}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={inputRef}
        type="search"
        placeholder="Buscar clientes, peças, pedidos…"
        aria-label="Busca global"
        className="bg-muted/40 pl-9 pr-10 transition-colors focus-visible:bg-background"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
        }}
      />
      <kbd
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground transition-opacity duration-200",
          focused ? "opacity-0" : "opacity-100",
        )}
      >
        /
      </kbd>
    </div>
  );
}
