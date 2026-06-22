# Tour guiado (Compass)

Onboarding client-side que dispara na primeira visita de cada tela. Tour rico
(holofote) no Atendimento; card de boas-vindas nas demais. Sem dependência nova.

## Como funciona
- `TourProvider` (montado no `AppLayout`) resolve a rota atual em um tour via
  `resolveTourForPath(pathname, TOURS)` e auto-inicia se `shouldAutoStart`
  (não visto e sem opt-out).
- Persistência por usuário em `localStorage`, isolada em
  `src/features/tour/storage/tourStorage.ts` (chaves `gallo-tour-seen:<userId>`
  e `gallo-tour-optout:<userId>`).
- Estado de runtime (tour ativo / passo) no Zustand `useTourStore`.

## Adicionar/editar um tour
- Edite `src/features/tour/config/tours.ts`.
- Welcome card: use `welcome(key, label, route, icon, body)`.
- Tour rico: defina passos com `target` (id `data-tour`) e `placement`.
- Para um passo apontar um elemento, adicione `data-tour="<id>"` no componente
  alvo (ver os exemplos no Atendimento).

## Controles
- Pular: botão + `Esc`. Setas/Enter navegam.
- "?" no TopBar (`TourHelpButton`) reabre o tour da tela atual.
- Central em `Configurações → Tours & Ajuda`: rever, resetar tudo, opt-out global.

## Limitações conhecidas
- Persistência é local (não sincroniza entre dispositivos). Promover a Supabase
  = reimplementar apenas `tourStorage.ts` (ver o spec, §15).
- Holofote é desktop-first; passos sem alvo caem para card centralizado.
- Navegar para outra rota durante um tour o marca como visto.

## Testes
`bun run test` cobre os engines puros (`tourNavigation`, `tourResolution`,
`popoverPlacement`), o `tourStorage` e o `useTourStore`. Componentes de UI são
verificados por `bun run build` + smoke manual (Vitest roda em env `node`).
