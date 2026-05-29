import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { EmbersBackground } from "./brand-backgrounds/EmbersBackground";
import { GradientBackground } from "./brand-backgrounds/GradientBackground";

const MeshWaveBackground = lazy(() => import("./brand-backgrounds/MeshWaveBackground"));

export type BrandPanelVariant = "embers" | "gradient" | "mesh";

const SUBMARCAS = [
  { label: "PARTS", dot: "bg-emerald-500" },
  { label: "SERVICE", dot: "bg-red-500" },
  { label: "INDUSTRIAL", dot: "bg-amber-500" },
] as const;

/**
 * Brand panel shown on the left of the login split-screen (md+ only).
 * `variant` selects the animated background. Foreground content is shared.
 */
export function BrandPanel({
  variant = "embers",
  className,
}: {
  variant?: BrandPanelVariant;
  className?: string;
}) {
  const { resolvedMode } = useTheme();
  const logoSrc =
    resolvedMode === "dark"
      ? "/logos/logo-horizontal-white.png"
      : "/logos/logo-horizontal-black.png";

  return (
    <aside
      className={cn(
        "relative hidden overflow-hidden border-r border-border bg-card md:flex md:flex-col md:justify-between md:p-10 lg:p-12",
        className,
      )}
    >
      <div className="absolute inset-0" aria-hidden="true">
        {variant === "embers" && <EmbersBackground />}
        {variant === "gradient" && <GradientBackground />}
        {variant === "mesh" && (
          <Suspense fallback={null}>
            <MeshWaveBackground />
          </Suspense>
        )}
      </div>
      {/* keep text legible over the animation */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-card/85 via-card/20 to-transparent"
        aria-hidden="true"
      />

      <div className="relative">
        <img src={logoSrc} alt="GALLO BASE DIESEL" className="h-10 w-auto" />
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
            <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
