# Design — Modal de novidades por versão ("What's New")

> **Data:** 2026-06-21
> **Status:** Aprovado (design) — pronto para plano de implementação
> **Feature:** `src/features/whats-new/`
> **Origem:** brainstorming `/superpowers:brainstorming`

## 1. Objetivo

Exibir automaticamente, **uma vez por versão nova**, um modal informando as mudanças e
novidades da plataforma. Deve disparar tanto para quem **já tem sessão ativa**
(retorna ao app autenticado) quanto para quem **acabou de fazer login** — ambos
convergem no shell do app interno (`AppLayout`), então um único ponto de montagem
cobre os dois fluxos.

A feature reaproveita integralmente a camada de dados de changelog já existente
(`useChangelog` → `IRelease[]`); não há nova fonte de dados nem migration.

## 2. Decisões fechadas (brainstorming)

| # | Aspecto | Decisão |
|---|---------|---------|
| 1 | **Gatilho** | Apenas versões `minor`/`major` novas desde a última vista. Patches passam silenciosos. |
| 2 | **Persistência** | `localStorage`, chave `gallo-last-seen-version` (por navegador). Sem banco/migration. |
| 3 | **Escopo** | Somente o app interno (`/app/*`). Portal B2B, loja B2C e PWA externo ficam de fora. |
| 4 | **Conteúdo** | Por versão nova: parágrafo-resumo + bullets da seção `Added`. Botão "Ver tudo" → página Sobre. |
| 5 | **Intensidade** | Semi-bloqueante: fecha por botão ("Entendi"/"Ver tudo") ou `Esc`; clicar fora **não** fecha; sem botão "X". |
| 6 | **1º acesso** | Baseline silencioso: grava a versão atual sem abrir o modal; a feature vale a partir da próxima versão. |

## 3. Arquitetura

Nova feature feature-driven, seguindo o padrão do projeto (lógica de negócio em
`engine/`, testada com Vitest; UI em `components/`; barrel em `index.ts`).

```
src/features/whats-new/
├── engine/
│   ├── versionGate.ts          # lógica PURA (sem React/DOM)
│   └── versionGate.test.ts     # Vitest
├── hooks/
│   └── useWhatsNew.ts          # orquestra changelog + localStorage + estado open
├── components/
│   ├── WhatsNewModal.tsx       # Dialog (shadcn) — montado no AppLayout
│   └── WhatsNewReleaseCard.tsx # card por versão (atual em destaque)
├── i18n/
│   └── pt-BR.ts                # textos de UI
└── index.ts                    # barrel → exporta <WhatsNewModal/>
```

**Reaproveitamento** (sem duplicar):

- `@/features/about/hooks/useChangelog` — fetch + parse do `CHANGELOG.md` (cache infinito na sessão).
- `IRelease` (`@/shared/types/about`) — já traz `version`, `codename`, `date`, `kind` (`major`/`minor`/`patch`), `summary`, `categories`, `totalItems`.
- `@/features/about/parser/renderInlineMarkdown` — render do markdown inline dos bullets.
- `@/components/ui/dialog` — `Dialog` shadcn (focus-trap, `aria`, `Esc` nativos).
- `ROUTES.CONFIG_SOBRE` (`@/features/shell/config/routes`) — destino do "Ver tudo".
- `LOCALSTORAGE_KEYS` (`@/config/themes`) — adicionar `lastSeenVersion: "gallo-last-seen-version"`.

**Montagem:** `<WhatsNewModal/>` em `src/features/shell/layouts/AppLayout.tsx`,
junto aos banners globais (`DemoModeBanner`, `DataSourceBanner`, etc.). Import
cross-feature (`@/features/whats-new`) é permitido (mesmo padrão de
`AppFooter` importando de `@/features/about`).

## 4. Lógica pura — `engine/versionGate.ts`

Funções sem dependência de React/DOM, 100% testáveis:

```ts
/** Compara "major.minor.patch" numericamente. >0 se a>b, 0 se igual, <0 se a<b. */
export function compareSemver(a: string, b: string): number

/** Tipo de gate: quais releases mostrar dado o estado atual. */
export interface VersionGateResult {
  shouldOpen: boolean;
  newReleases: IRelease[];   // já limitadas ao teto
  overflowCount: number;     // quantas ficaram além do teto (para "e mais N")
}

/**
 * Seleciona as releases novas que merecem o modal.
 * - lastSeen === null  → baseline silencioso: { shouldOpen:false, newReleases:[] }
 * - filtra version > lastSeen  E  kind !== 'patch'
 * - se version atual <= lastSeen (rollback) → não abre
 * - aplica teto MAX_RELEASES_IN_MODAL (5); excedente vira overflowCount
 */
export function selectNewReleases(
  releases: IRelease[],
  lastSeen: string | null,
  maxReleases?: number,
): VersionGateResult

/** Versão a gravar como "vista" = a mais recente ABSOLUTA (inclui patch). */
export function latestVersionToMark(releases: IRelease[]): string | null
```

Constante: `MAX_RELEASES_IN_MODAL = 5`.

**Por que marcar a versão absoluta (inclui patch):** se gravássemos só a maior
`minor`, um patch posterior (ex. `0.110.1`) teria `version > lastSeen` e, embora
filtrado da exibição, criaria inconsistência de estado. Marcar `releases[0].version`
(o topo do changelog) é simples e correto.

## 5. Hook — `hooks/useWhatsNew.ts`

Orquestra os efeitos colaterais (localStorage, estado, navegação):

```ts
export function useWhatsNew(): {
  open: boolean;
  releases: IRelease[];
  overflowCount: number;
  dismiss: () => void;      // grava lastSeen + fecha
  seeAll: () => void;       // grava lastSeen + navega p/ Sobre + fecha
}
```

Comportamento:

1. `const { data: releases } = useChangelog()`. Enquanto `undefined` (carregando) ou
   em erro → `open: false` (nunca trava o app).
2. Lê `gallo-last-seen-version` do localStorage (1x, via `useState` lazy init).
3. Calcula `selectNewReleases(releases, lastSeen)`.
4. **Baseline silencioso:** se `lastSeen === null` e há releases → grava
   `latestVersionToMark(releases)` imediatamente (efeito) e **não** abre.
5. Se `shouldOpen` → agenda abertura com atraso de ~500ms (deixa o app "assentar"
   após o login antes do modal surgir). Cancela o timer no unmount.
6. `dismiss`/`seeAll` → gravam `latestVersionToMark(releases)` no localStorage e
   atualizam o estado para `open:false`. `seeAll` também faz `navigate({ to: ROUTES.CONFIG_SOBRE })`.

Persistência encapsulada em helpers locais (`readLastSeen()`/`writeLastSeen(v)`) com
`try/catch` (localStorage pode lançar em modo privativo) — falha → trata como `null`
na leitura e no-op na escrita.

## 6. UI — `components/WhatsNewModal.tsx`

`Dialog` do shadcn. `DialogContent` com:

- `onPointerDownOutside={(e) => e.preventDefault()}` e
  `onInteractOutside={(e) => e.preventDefault()}` — clicar fora não fecha.
- `Esc` mantido (comportamento nativo do Dialog → chama `onOpenChange(false)` =
  `dismiss`), por acessibilidade.
- Sem o botão "X" de canto (o `DialogContent` padrão do projeto inclui um close;
  usar variante sem close ou ocultá-lo) — fecha só pelo footer/Esc.
- `DialogTitle` ("Novidades da plataforma") e `DialogDescription` (subtítulo
  "{N} novidades desde sua última visita") presentes para leitor de tela.

Layout (3 zonas; header e footer fixos, centro rolável):

- **Header (glass):** tokens semânticos (`bg-background/90 backdrop-blur`,
  `border-b border-border`); ícone em quadrado arredondado (`bg-success/10`,
  `text-success`, Iconify `mdi:party-popper` ou `mdi:sparkles`); título + subtítulo.
- **Corpo (rolável):** `max-h-[60vh] overflow-y-auto`. `ScrollProgressBar` na divisa
  do header conforme `docs/dev/ux-guidelines.md`. Lista de `WhatsNewReleaseCard`,
  a atual em destaque. Se `overflowCount > 0`, linha final "e mais {N} versões — ver tudo".
- **Footer (fixo):** dica "Esc também fecha" (esquerda) + `Button variant="outline"`
  "Ver tudo" + `Button` (primário) "Entendi".

### `WhatsNewReleaseCard.tsx`

Props: `{ release: IRelease; highlighted?: boolean }`.

- **Destaque** (`highlighted`, a atual): `border-2 border-info` (badge `minor`) ou
  `border-2 border-primary` (badge `major`); mostra resumo + todos os bullets `Added`.
- **Compacto** (anteriores): `border border-border`; badge + versão + codinome inline +
  resumo (1–2 linhas). Bullets `Added` opcionais/reduzidos.
- Badge de tipo: `minor` → `bg-info/10 text-info` ("Novidades"); `major` →
  `bg-primary/10 text-primary` ("Grande atualização"). Reusa o vocabulário de
  `RELEASE_KIND_LABEL` de `about/i18n`.
- Versão em `font-mono`; codinome em destaque (`text-success`, peso semibold).
- Bullets `Added` com ícone `+`/check (`text-success`), texto via `renderInlineMarkdown`.

## 7. Acessibilidade & animação

- Focus-trap, foco inicial e `aria-modal` → delegados ao `Dialog` shadcn (não fazer
  foco manual).
- Animação de entrada contida (fade + leve scale, `ease-out`, ~200ms) — a própria do
  `DialogContent`. **`prefers-reduced-motion`**: desabilitar a animação (classe/condição),
  severidade alta na UX-guideline.
- Anti-patterns evitados: nada de "excessive animation", sem dark-mode forçado, sem
  emoji como ícone (Iconify), `cursor-pointer` nos clicáveis, contraste ≥ 4.5:1 com
  tokens semânticos (glass em light mode com opacidade alta).
- `z-index`: portal/overlay do Dialog (z-50) já fica acima dos banners do `AppLayout`.

## 8. Edge cases

| Caso | Comportamento |
|------|---------------|
| 1º acesso (chave ausente) | Baseline silencioso: grava versão atual, não abre. |
| Falha no fetch do changelog | Modal não abre (silencioso). Nunca trava o login/app. |
| Rollback (versão atual < última vista) | Não abre. |
| Só patches novos desde a última vista | Não abre (filtro `kind !== 'patch'`). A `lastSeen` permanece inalterada — correto, pois não há nada `minor`/`major` para marcar. |
| Pulou > 5 versões minor/major | Mostra 5 (atual + 4), com "e mais N versões — ver tudo". |
| localStorage indisponível (modo privativo) | Leitura → `null`; escrita → no-op. Pior caso: modal reaparece (degradação aceitável). |

> Nota sobre patches: a marcação de "visto" só ocorre quando o usuário **dispensa um
> modal aberto** (`dismiss`/`seeAll`) ou no **baseline silencioso** do 1º acesso.
> Se entre duas visitas só houve patches, o modal não abre e a `lastSeen` não muda —
> o que é correto, pois nada novo (minor/major) há para marcar.

## 9. Testes (`engine/versionGate.test.ts`)

- `compareSemver`: ordenação de `0.9.0` vs `0.10.0`, igualdade, patch.
- `selectNewReleases`: filtra patch; respeita `lastSeen`; rollback → vazio;
  `lastSeen===null` → baseline (vazio, shouldOpen false); teto de 5 + `overflowCount`.
- `latestVersionToMark`: retorna o topo absoluto (inclui patch); `[]` → `null`.

Gate prático de CI: `bun run build` + `bun run test`. Checar `bunx tsc --noEmit`
por delta nos arquivos novos.

## 10. Fora de escopo (YAGNI)

- Persistência cross-device (banco). Decidido: localStorage basta.
- Modal em portal B2B / loja B2C / PWA externo.
- Disparo em runtime sem reload (SPA estática só vê nova versão ao recarregar).
- Configuração por usuário para desligar o modal (pode virar follow-up se pedido).

## 11. Plano de rollout

Sem migration, sem Edge Function, sem deploy de backend — é **só frontend**. Entra
junto com a publicação normal do app. O baseline silencioso garante que o primeiro
deploy da feature não dispare um modal retroativo para ninguém.
