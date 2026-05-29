import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

const SUBMARCAS = [
  { label: "PARTS", dot: "bg-emerald-500" },
  { label: "SERVICE", dot: "bg-red-500" },
  { label: "INDUSTRIAL", dot: "bg-amber-500" },
] as const;

/**
 * Brand panel shown on the left of the login split-screen (md+ only).
 * Pure presentation — no props. Uses semantic tokens + Tailwind palette dots.
 */
export function BrandPanel({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "relative hidden overflow-hidden border-r border-border bg-card md:flex md:flex-col md:justify-between md:p-10 lg:p-12",
        className,
      )}
    >
      {/* industrial watermark */}
      <Icon
        icon="mdi:truck-cargo"
        className="pointer-events-none absolute -right-10 bottom-0 text-foreground opacity-[0.04]"
        size={420}
      />
      <div
        className="absolute inset-0 bg-gradient-to-br from-card to-background opacity-60"
        aria-hidden
      />

      <div className="relative">
        <Logo variant="horizontal" className="h-10" />
      </div>

      <div className="relative max-w-sm space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Plataforma de inteligência comercial
        </p>
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
          O cérebro comercial acima do ERP.
        </h2>
        <p className="text-sm text-muted-foreground">
          Carteira, atendimento e metas em um só lugar — pensado para distribuição de peças pesadas.
        </p>
      </div>

      <div className="relative flex items-center gap-4">
        {SUBMARCAS.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden />
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
