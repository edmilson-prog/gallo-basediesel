import type { ReleaseKind } from "@/shared/types/about";

/** User-facing copy for the what's-new modal (Brazilian Portuguese). */
export const WHATS_NEW_I18N = {
  title: "Novidades da plataforma",
  /** {{count}} replaced at render time. */
  subtitleTemplate: "{{count}} novidade(s) desde sua última visita",
  badge: {
    minor: "Novidades",
    major: "Grande atualização",
  } satisfies Record<Exclude<ReleaseKind, "patch">, string>,
  /** {{count}} replaced at render time. */
  overflowTemplate: "e mais {{count}} versão(ões) — toque em \"Ver tudo\" para o histórico completo",
  escHint: "Esc também fecha",
  seeAll: "Ver tudo",
  dismiss: "Entendi",
} as const;
