import { useState } from "react";
import { cn } from "@/lib/utils";
import { ParticleField, type ParticleMode } from "./brand-backgrounds/ParticleField";

const SUBMARCAS = [
  { label: "Parts", tagline: "Reposição e continuidade", bar: "bg-brand-parts" },
  { label: "Service", tagline: "Diagnóstico e resposta", bar: "bg-brand-service" },
  { label: "Industrial", tagline: "Força para produzir", bar: "bg-brand-industrial" },
] as const;

const MOTION_MODES: Array<{ mode: ParticleMode; label: string }> = [
  { mode: "oil", label: "Óleo" },
  { mode: "mesh", label: "Malha" },
  { mode: "flow", label: "Fluxo" },
  { mode: "off", label: "Off" },
];

/**
 * Poster panel on the left of the login split-screen (md+ only). Expects an
 * ancestor with the `.dark` scope already applied (see LoginPage) — the
 * gateway screen stays dark regardless of the viewer's light/dark preference.
 */
export function BrandPanel({ className }: { className?: string }) {
  const [particleMode, setParticleMode] = useState<ParticleMode>("oil");

  return (
    <aside
      className={cn(
        "relative hidden overflow-hidden border-border bg-card md:flex md:flex-col md:border-r",
        className,
      )}
    >
      <ParticleField mode={particleMode} className="absolute inset-0 h-full w-full" />
      <div
        className="pointer-events-none absolute -bottom-24 -right-40 h-[520px] w-[520px] rounded-full bg-primary/10 blur-[60px]"
        aria-hidden="true"
      />
      <img
        src="/logos/gota-3d.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 bottom-20 w-[420px] opacity-[0.09] mix-blend-screen"
      />

      <div className="relative z-10 flex h-full flex-col p-10 lg:p-14">
        <img
          src="/logos/logo-horizontal-white-tight.png"
          alt="GALLO BASE DIESEL"
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both w-[190px] lg:w-[220px]"
        />

        <div className="flex flex-1 flex-col justify-center py-10">
          <p
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both mb-5 text-[10.5px] font-bold uppercase tracking-[0.22em] text-primary"
            style={{ animationDelay: "120ms" }}
          >
            Plataforma de inteligência comercial
          </p>
          <h1
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both max-w-xl font-display text-4xl font-extrabold uppercase leading-[0.95] text-foreground md:text-5xl lg:text-6xl xl:text-[64px]"
            style={{ animationDelay: "180ms" }}
          >
            O cérebro comercial acima do ERP.
          </h1>
          <div
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both my-7 h-[3px] w-16 bg-primary"
            style={{ animationDelay: "420ms" }}
            aria-hidden="true"
          />
          <p
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both max-w-md text-[17px] leading-relaxed text-muted-foreground"
            style={{ animationDelay: "280ms" }}
          >
            Carteira, atendimento e metas em um só lugar — pensado para distribuição de peças
            pesadas.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px bg-border">
          {SUBMARCAS.map((s, i) => (
            <div
              key={s.label}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both bg-card pt-4"
              style={{ animationDelay: `${480 + i * 80}ms` }}
            >
              <div className={cn("mb-3 h-[3px] w-full", s.bar)} aria-hidden="true" />
              <h3 className="font-display text-lg font-extrabold uppercase tracking-wide text-foreground">
                {s.label}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.tagline}</p>
            </div>
          ))}
        </div>
      </div>

      {import.meta.env.DEV && (
        <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover/90 p-1 text-xs opacity-40 shadow-lg backdrop-blur transition-opacity hover:opacity-100">
          <span className="px-2 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Movimento
          </span>
          {MOTION_MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => setParticleMode(m.mode)}
              aria-pressed={particleMode === m.mode}
              className={cn(
                "rounded-full px-2.5 py-1 font-semibold transition-colors",
                particleMode === m.mode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
