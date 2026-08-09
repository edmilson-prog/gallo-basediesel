# Leads Multi-Funil — Fase 5 (Ficha da conversa) · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem atende vê, no painel direito da conversa, **em quais funis aquele lead está e em que etapa em cada um** — e move a etapa ou adiciona o lead a outro funil sem sair do atendimento.

**Architecture:** O bloco entra em `LeadProfileFiche.tsx` entre os selos de estado e a `<dl>` de dados, e **substitui** o chip de etapa legado (`lead.stage`, o snapshot do pipeline da loja, que com N funis responde por um só). A leitura passa pela RPC gated `listEntriesViaConversation`, espelhando `ILeadsProvider.getViaConversation`: o atendente do pool precisa ver a ficha sem ser dono do lead. Toda a lógica de decisão — o que é editável, o que fica sob cadeado, quantos funis o usuário não alcança — vive em engines puros; o componente é projeção.

**Tech Stack:** React 19 · TypeScript strict · TanStack Query · Tailwind v4 + shadcn/ui · sonner (toast com desfazer) · Vitest · bun

---

## Global Constraints

Requisitos que valem para **toda** task. Não são repetidos em cada uma.

- **Worktree:** `.claude/worktrees/leads-multi-funil-fase5`, branch `feat/leads-multi-funil-fase5`, criada de `origin/main` em `4a469806` (fase 4 já dentro). Nunca commitar no diretório principal.
- **Tokens semânticos apenas.** Nunca hex, nunca `--gallo-*`, nunca paleta crua (`bg-emerald-500`, `text-red-700`). Os tokens de severidade desta base são **`severity-critical`, `severity-info`, `severity-success`, `severity-warning`** — **não existe `severity-danger`**. Cor de funil só via `getAccentClasses(accent)`; as classes são literais, template string não gera CSS no Tailwind v4.
- **`getAccentClasses(...).dot` e `.bar` são `background`.** Usar como cor de borda já foi corrigido duas vezes nesta feature. Para borda existe `.border`.
- **Estado compartilhado entre instâncias irmãs nunca em `useState` por instância** — foi o defeito da v0.159.1. Padrão: store no módulo + `useSyncExternalStore`.
- **Provider Pattern.** Dados só via `@/providers/data`. Nesta fase: `useLeadFunnelsProvider()`.
- **Interfaces com prefixo `I`.** `strict: true`, `noUncheckedIndexedAccess` — `array[i]` é `T | undefined`.
- **Texto de interface em pt-BR acentuado**, em `src/features/funnels/i18n/pt-BR.ts` (`COPY`) ou `src/features/leads/i18n/pt-BR.ts` (`LEADS_STRINGS`). Nenhuma string literal em componente.
- **Engines puros e testados** em `engine/`, com `*.test.ts` co-localizado. Componentes não são testados nesta base — o engine é a rede.
- **`bun run build` NÃO faz type-check.** Gate por task: `bun run test` + `bunx tsc --noEmit`, avaliando **delta**. Baseline conhecido em `features/leads`: `LeadsFiltersBar.tsx(321)`, `useLeadsUrlState.ts(206)`, `leadDisplay.ts(153,154)`. Qualquer erro fora desses quatro é meu.
- **Nenhuma dependência nova. Nenhuma migration** — a fase 2 já entregou tabelas, RLS e a RPC gated; esta fase é só consumo.
- ⚠️ **O watcher do Vite não dispara nestas worktrees.** Toda conferência no navegador exige **reiniciar o dev server** e confirmar com `curl http://127.0.0.1:PORTA/src/<caminho> | grep <identificador>` que o módulo servido é o atual. Um servidor órfão segurando a porta já custou várias idas em falso na fase 4.

---

## O que a spec §8 já decidiu (não reabrir)

```
Funis                                    [+]
┌──────────────────────────────────────────┐
│ ⚗ Catalisador   [Em negociação   ▾]   ⋮ │
│ ⚙ Filtros       [Novo            ▾]   ⋮ │
│ ▣ Geral         [Triagem         ▾]   ⋮ │
│ 🔒 +2 funis que você não acessa           │
└──────────────────────────────────────────┘
```

| Decisão | Razão registrada |
|---|---|
| Bloco **acima** da `<dl>`, logo abaixo da identidade | É a primeira coisa acionável de quem atende |
| **Máximo 3 participações visíveis** + "ver todas" | Cada uma custa ~35px e empurraria o `ConversationManagementCard` para longe da dobra |
| A `<dl>` de dados vira `Collapsible` **fechada** | Quem atende precisa de funil, etapa e status; "criado em" é consulta ocasional |
| `🔒 +N funis que você não acessa`, **sem nomes** | Sem a linha ninguém entende por que a lista parece incompleta; com os nomes, vazaria a estrutura comercial |
| Trocar etapa → **toast com desfazer (6s)**, nunca modal | Mudar etapa é reversível e frequente |
| Remover participação → **`AlertDialog`** | É destrutivo |
| Sem permissão de mover → etapa vira **texto + cadeado + tooltip** | |
| Mudança em andamento → chevron vira spinner, controles `disabled`, **sem skeleton** | O painel não pode piscar durante um atendimento |
| Layout em 360px | nome `max-w-[110px] truncate`, `Select` `w-[150px]`, `⋮` 24px |

---

## Estrutura de arquivos

**Criar**

| Arquivo | Responsabilidade |
|---|---|
| `src/features/funnels/engine/ficheParticipations.ts` | Puro: junta participações com funis acessíveis, ordena, conta os inacessíveis |
| `src/features/funnels/engine/ficheParticipations.test.ts` | Testes |
| `src/features/funnels/hooks/useLeadFicheFunnels.ts` | Leitura gated pela conversa + funis + etapas, numa estrutura só |
| `src/features/funnels/hooks/useEntryMutations.ts` | Mover, adicionar e remover participação, com invalidação e desfazer |
| `src/features/funnels/components/FicheFunnelsBlock.tsx` | O bloco inteiro: cabeçalho, lista, "ver todas", linha do cadeado |
| `src/features/funnels/components/FicheParticipationRow.tsx` | Uma participação: ponto, nome, `Select` de etapa, `⋮` |
| `src/features/funnels/components/AddToFunnelMenu.tsx` | O `[+]` — o atalho que o dono pediu |

**Modificar**

| Arquivo | Mudança |
|---|---|
| `src/features/leads/components/LeadProfileFiche.tsx` | Insere o bloco; remove o chip de etapa legado; `<dl>` vira `Collapsible` fechada; troca a paleta crua dos selos por tokens |
| `src/features/funnels/i18n/pt-BR.ts` | Textos do bloco |
| `src/features/leads/i18n/pt-BR.ts` | Rótulo do `Collapsible` de dados |
| `CHANGELOG.md` · `package.json` · `CLAUDE.md` · handoff | Versão e registro |

---

## Task 1: O engine que decide o que a ficha mostra

**Files:**
- Create: `src/features/funnels/engine/ficheParticipations.ts`
- Test: `src/features/funnels/engine/ficheParticipations.test.ts`

**Interfaces:**
- Consumes: `ILeadFunnelEntry`, `ILeadFunnel`, `ILeadFunnelStage`.
- Produces:
  - `interface IFicheParticipation { entry: ILeadFunnelEntry; funnel: ILeadFunnel; stage: ILeadFunnelStage | undefined }`
  - `interface IFicheView { visible: IFicheParticipation[]; hiddenCount: number; lockedCount: number }`
  - `resolveFicheParticipations(input: IFicheInput): IFicheView`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { resolveFicheParticipations } from "./ficheParticipations";

const funnel = (id: string, name: string, position: number, isDefault = false): ILeadFunnel =>
  ({ id, name, position, isDefault, accent: 1, icon: "mdi:filter-variant", storeId: "s1",
     openToStore: true, entryAlertThreshold: 50, createdAt: "", updatedAt: "" }) as ILeadFunnel;

const stage = (id: string, funnelId: string, name: string): ILeadFunnelStage =>
  ({ id, funnelId, name, accent: 1, position: 0, kind: "aberta", createdAt: "", updatedAt: "" });

const entry = (id: string, funnelId: string, stageId: string): ILeadFunnelEntry =>
  ({ id, leadId: "l1", funnelId, stageId, storeId: "s1", sellerId: null,
     enteredStageAt: "", createdAt: "", updatedAt: "" }) as ILeadFunnelEntry;

const GERAL = funnel("f-geral", "Geral", 0, true);
const CAT = funnel("f-cat", "Catalisador", 1);
const FIL = funnel("f-fil", "Filtros", 2);

describe("resolveFicheParticipations", () => {
  it("junta cada participação com o funil e a etapa dela", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "s-cat")],
      funnels: [CAT],
      stagesByFunnel: new Map([["f-cat", [stage("s-cat", "f-cat", "Em negociação")]]]),
      maxVisible: 3,
    });
    expect(view.visible).toHaveLength(1);
    expect(view.visible[0]!.funnel.name).toBe("Catalisador");
    expect(view.visible[0]!.stage?.name).toBe("Em negociação");
  });

  it("conta como bloqueada a participação em funil que o usuário não alcança", () => {
    // A RLS devolve a participação (o vendedor cuida do lead), mas não o funil.
    // Sem essa contagem a lista parece incompleta sem explicação; com os nomes,
    // vazaria a estrutura comercial.
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "s-cat"), entry("e2", "f-oculto", "s-x")],
      funnels: [CAT],
      stagesByFunnel: new Map([["f-cat", [stage("s-cat", "f-cat", "Em negociação")]]]),
      maxVisible: 3,
    });
    expect(view.visible).toHaveLength(1);
    expect(view.lockedCount).toBe(1);
  });

  it("põe o funil padrão por último, não primeiro", () => {
    // Geral é triagem: quem atende age nos funis de linha, não no depósito.
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-geral", "sg"), entry("e2", "f-cat", "sc")],
      funnels: [GERAL, CAT],
      stagesByFunnel: new Map(),
      maxVisible: 3,
    });
    expect(view.visible.map((p) => p.funnel.name)).toEqual(["Catalisador", "Geral"]);
  });

  it("ordena os não-padrão pela posição do funil", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e2", "f-fil", "x"), entry("e1", "f-cat", "y")],
      funnels: [CAT, FIL],
      stagesByFunnel: new Map(),
      maxVisible: 3,
    });
    expect(view.visible.map((p) => p.funnel.name)).toEqual(["Catalisador", "Filtros"]);
  });

  it("mostra no máximo `maxVisible` e informa quantas ficaram de fora", () => {
    const view = resolveFicheParticipations({
      entries: [
        entry("e1", "f-cat", "a"),
        entry("e2", "f-fil", "b"),
        entry("e3", "f-geral", "c"),
      ],
      funnels: [CAT, FIL, GERAL],
      stagesByFunnel: new Map(),
      maxVisible: 2,
    });
    expect(view.visible).toHaveLength(2);
    expect(view.hiddenCount).toBe(1);
  });

  it("não esconde nada quando cabe tudo", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "a")],
      funnels: [CAT],
      stagesByFunnel: new Map(),
      maxVisible: 3,
    });
    expect(view.hiddenCount).toBe(0);
  });

  it("devolve a etapa como undefined quando ela não veio, sem quebrar", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "etapa-sumida")],
      funnels: [CAT],
      stagesByFunnel: new Map([["f-cat", [stage("outra", "f-cat", "Outra")]]]),
      maxVisible: 3,
    });
    expect(view.visible[0]!.stage).toBeUndefined();
  });

  it("lida com lead sem nenhuma participação", () => {
    const view = resolveFicheParticipations({
      entries: [], funnels: [CAT], stagesByFunnel: new Map(), maxVisible: 3,
    });
    expect(view).toEqual({ visible: [], hiddenCount: 0, lockedCount: 0 });
  });

  it("não conta a mesma participação duas vezes se a RPC repetir", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "a"), entry("e1", "f-cat", "a")],
      funnels: [CAT],
      stagesByFunnel: new Map(),
      maxVisible: 3,
    });
    expect(view.visible).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bunx vitest run src/features/funnels/engine/ficheParticipations.test.ts
```
Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
import type { ID, ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";

export interface IFicheParticipation {
  entry: ILeadFunnelEntry;
  funnel: ILeadFunnel;
  /** Ausente enquanto as etapas do funil não chegaram, ou se a etapa sumiu. */
  stage: ILeadFunnelStage | undefined;
}

export interface IFicheInput {
  entries: ILeadFunnelEntry[];
  /** Só os funis que este usuário alcança. */
  funnels: ILeadFunnel[];
  stagesByFunnel: Map<ID, ILeadFunnelStage[]>;
  maxVisible: number;
}

export interface IFicheView {
  visible: IFicheParticipation[];
  /** Cabem na lista, mas passaram de `maxVisible`. */
  hiddenCount: number;
  /** Participações em funis que o usuário não alcança — contadas, nunca nomeadas. */
  lockedCount: number;
}

/**
 * O que a ficha da conversa mostra sobre os funis de um lead.
 *
 * A RPC gated devolve participações que o usuário pode ver por cuidar do lead,
 * inclusive em funis aos quais ele não tem acesso (é o ramo `seller_handles_lead`
 * da policy, e a decisão de que o funil filtra o board, nunca a existência do
 * lead). Essas viram contagem sob cadeado: sem a linha a lista parece
 * incompleta sem explicação, e com os nomes vazaria a estrutura comercial.
 *
 * O funil padrão vai para o fim. Ele é a triagem por onde todo lead entra —
 * quem está atendendo age nos funis de linha, não no depósito.
 */
export function resolveFicheParticipations({
  entries,
  funnels,
  stagesByFunnel,
  maxVisible,
}: IFicheInput): IFicheView {
  const funnelById = new Map(funnels.map((f) => [f.id, f]));

  const seen = new Set<ID>();
  const reachable: IFicheParticipation[] = [];
  let lockedCount = 0;

  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);

    const funnel = funnelById.get(entry.funnelId);
    if (!funnel) {
      lockedCount += 1;
      continue;
    }
    reachable.push({
      entry,
      funnel,
      stage: stagesByFunnel.get(funnel.id)?.find((s) => s.id === entry.stageId),
    });
  }

  reachable.sort((a, b) => {
    if (a.funnel.isDefault !== b.funnel.isDefault) return a.funnel.isDefault ? 1 : -1;
    return a.funnel.position - b.funnel.position;
  });

  return {
    visible: reachable.slice(0, maxVisible),
    hiddenCount: Math.max(0, reachable.length - maxVisible),
    lockedCount,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bunx vitest run src/features/funnels/engine/ficheParticipations.test.ts
```
Esperado: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/funnels/engine/ficheParticipations.ts src/features/funnels/engine/ficheParticipations.test.ts
git commit -m "feat(funnels): engine deciding what the conversation fiche shows"
```

---

## Task 2: A leitura, gated pela conversa

**Files:**
- Create: `src/features/funnels/hooks/useLeadFicheFunnels.ts`

**Interfaces:**
- Consumes: `resolveFicheParticipations` (Task 1), `useLeadFunnelsProvider`, `useCurrentStore`.
- Produces: `useLeadFicheFunnels({ conversationId, storeId, expanded }): { view, funnels, isLoading, addableFunnels }`

- [ ] **Step 1: Escrever o hook**

```ts
const MAX_VISIBLE = 3;

export function useLeadFicheFunnels({ conversationId, storeId, expanded }: IInput) {
  const provider = useLeadFunnelsProvider();

  // A RPC gated, não `listEntriesByLead`: o atendente do pool precisa ver a
  // ficha sem ser dono do lead, e é a conversa que lhe dá esse direito.
  const entriesQuery = useQuery({
    queryKey: ["lead-funnel-entries-via-conversation", conversationId] as const,
    queryFn: () => provider.listEntriesViaConversation(conversationId),
    enabled: Boolean(conversationId),
    staleTime: 30_000,
  });

  const funnelsQuery = useQuery({
    queryKey: ["lead-funnels", storeId] as const,   // mesma chave da navegação
    queryFn: async () => { /* listFunnels + listAccessibleFunnelIds, como useFunnelNavigation */ },
    enabled: Boolean(storeId),
    staleTime: 60_000,
  });

  // Etapas por funil, uma query por funil e a MESMA chave que o board usa
  // (`["lead-funnel-stages", id]`) — chave distinta dobraria o fetch numa tela
  // que já divide cache com a de Leads.
  const stageQueries = useQueries({ queries: funnels.map((f) => ({ … })) });

  const view = useMemo(
    () => resolveFicheParticipations({
      entries, funnels, stagesByFunnel,
      maxVisible: expanded ? Number.POSITIVE_INFINITY : MAX_VISIBLE,
    }),
    [entries, funnels, stagesByFunnel, expanded],
  );

  // Funis em que o lead AINDA não está — a lista do `[+]`.
  const addableFunnels = useMemo(
    () => funnels.filter((f) => !entries.some((e) => e.funnelId === f.id)),
    [funnels, entries],
  );

  return { view, funnels, addableFunnels, isLoading: entriesQuery.isLoading };
}
```

- [ ] **Step 2: Verificar tipos**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/funnels"
```
Esperado: vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/funnels/hooks/useLeadFicheFunnels.ts
git commit -m "feat(funnels): read a lead's participations through the conversation gate"
```

---

## Task 3: Mover, adicionar e remover — com desfazer

**Files:**
- Create: `src/features/funnels/hooks/useEntryMutations.ts`
- Modify: `src/features/funnels/i18n/pt-BR.ts`

**Interfaces:**
- Produces: `useEntryMutations({ conversationId, storeId }): { moveStage, addToFunnel, removeFrom, pendingEntryId }`

- [ ] **Step 1: Textos**

```ts
  fiche: {
    title: "Funis",
    add: "Adicionar a um funil",
    addEmpty: "Este lead já está em todos os funis que você acessa.",
    empty: "Este lead não está em nenhum funil.",
    emptyAction: "Adicionar a um funil",
    locked: (n: number) =>
      n === 1 ? "+1 funil que você não acessa" : `+${n} funis que você não acessa`,
    lockedHint: "Você não tem acesso a esse funil, então ele não aparece pelo nome.",
    seeAll: (n: number) => `Ver todas (+${n})`,
    seeLess: "Ver menos",
    noStagePermission: "Você não pode mover este lead de etapa.",
    moved: (funil: string, etapa: string) => `${funil}: movido para ${etapa}.`,
    moveError: "Não foi possível mudar a etapa.",
    undo: "Desfazer",
    added: (funil: string) => `Lead adicionado ao funil ${funil}.`,
    addError: "Não foi possível adicionar o lead ao funil.",
    removeTitle: (funil: string) => `Tirar o lead do funil ${funil}?`,
    removeBody:
      "A etapa, o valor estimado e o histórico dessa participação são perdidos. As outras não mudam.",
    removeBodyLast:
      "Esta é a única participação do lead. Ele volta para o funil de triagem, e não fica sem nenhum.",
    removeConfirm: "Tirar do funil",
    removed: (funil: string) => `Lead tirado do funil ${funil}.`,
    removedToDefault: (funil: string, padrao: string) =>
      `Lead tirado do funil ${funil} e devolvido para ${padrao}.`,
    removeError: "Não foi possível tirar o lead do funil.",
  },
```

- [ ] **Step 2: As mutações**

`moveStage(entry, stageId, funnelName, stageName)`:

```ts
const previousStageId = entry.stageId;
await provider.moveEntry(entry.id, stageId);
await invalidate();
toast.success(COPY.fiche.moved(funnelName, stageName), {
  duration: 6000,
  // Desfazer, não diálogo: mudar de etapa é reversível e frequente, e um modal
  // a cada troca faria quem atende parar de trocar.
  action: {
    label: COPY.fiche.undo,
    onClick: () => void provider.moveEntry(entry.id, previousStageId).then(invalidate),
  },
});
```

`pendingEntryId` é o id da participação em curso — a linha usa para trocar o chevron por `mdi:loading` com `animate-spin motion-reduce:animate-none` e desabilitar os controles. **Sem skeleton:** o painel não pode piscar durante um atendimento.

`addToFunnel(leadId, funnelId, funnelName)` chama `provider.addEntry`. O contrato diz que re-adicionar é **noop silencioso** (o guard `planAddToFunnel` já está nas duas implementações), então um duplo clique não vira erro de constraint.

`removeFrom(entry, funnelName)` chama `provider.removeEntry` e usa o `{ movedToDefault }` que ele devolve para escolher entre `removed` e `removedToDefault` — o usuário precisa saber que o lead **não** ficou sem funil nenhum.

**Invalidação:** `["lead-funnel-entries-via-conversation", conversationId]` e `["lead-funnel-counts", storeId]`. A página de Leads compartilha a segunda.

- [ ] **Step 3: Verificar e commitar**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/funnels"
bun run test
git add src/features/funnels/hooks/useEntryMutations.ts src/features/funnels/i18n/pt-BR.ts
git commit -m "feat(funnels): move, add and remove a participation, with undo"
```

---

## Task 4: A linha de uma participação

**Files:**
- Create: `src/features/funnels/components/FicheParticipationRow.tsx`

- [ ] **Step 1: Layout em 360px**

```tsx
<li className="flex items-center gap-1.5">
  <span aria-hidden className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(funnel.accent).dot)} />
  <span className="max-w-[110px] shrink-0 truncate text-xs text-foreground" title={funnel.name}>
    {funnel.name}
  </span>

  {canMove ? (
    <Select value={entry.stageId} onValueChange={onMove} disabled={isPending}>
      <SelectTrigger className="h-7 w-[150px] text-xs">
        {isPending ? (
          <Icon icon="mdi:loading" size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {stages.map((s) => (
          <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Icon icon="mdi:lock-outline" size={12} aria-hidden />
          {stage?.name ?? "—"}
        </span>
      </TooltipTrigger>
      <TooltipContent>{COPY.fiche.noStagePermission}</TooltipContent>
    </Tooltip>
  )}

  {won && <span className="…bg-severity-success/15 text-severity-success…">{COPY.stateConverted}</span>}

  <DropdownMenu>…{COPY.fiche.removeConfirm}…</DropdownMenu>
</li>
```

**O selo de ganho lê `stage.kind === "ganho"`**, não `lead.convertedToCustomerId` — é a mesma correção que a fase 4 fez no card, e pelo mesmo motivo: com N:N um lead ganho num funil aparecia como convertido em todos. As outras participações seguem editáveis.

- [ ] **Step 2: Permissão de mover**

`canMove` vem do host: `usePermission("lead", "edit", "store") || (usePermission("lead", "edit") && (isLeadOwner || isAssignee))` — a mesma composição que `canConvertLead` já usa em `LeadProfileFiche`, para não inventar uma segunda regra de acesso.

- [ ] **Step 3: Verificar e commitar**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/funnels"
git add src/features/funnels/components/FicheParticipationRow.tsx
git commit -m "feat(funnels): one row per participation in the conversation fiche"
```

---

## Task 5: O bloco e o `[+]`

Este é o atalho que o dono pediu: adicionar o lead a um funil **sem sair do atendimento**.

**Files:**
- Create: `src/features/funnels/components/AddToFunnelMenu.tsx`
- Create: `src/features/funnels/components/FicheFunnelsBlock.tsx`

- [ ] **Step 1: O menu do `[+]`**

`DropdownMenu` listando `addableFunnels` — os funis acessíveis em que o lead **ainda não está**. Cada item com ponto de accent, ícone e nome. Quando a lista está vazia, um item desabilitado com `COPY.fiche.addEmpty`, não um menu vazio.

Sem `stageId`: `addEntry(leadId, funnelId)` deixa o servidor escolher a etapa de entrada do funil. Escolher etapa na hora de adicionar é decisão da fase 7 (triagem), não desta.

- [ ] **Step 2: O bloco**

```tsx
<section aria-labelledby="fiche-funnels-title" className="mb-3">
  <div className="mb-1.5 flex items-center justify-between">
    <h3 id="fiche-funnels-title" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {COPY.fiche.title}
    </h3>
    {canAdd && <AddToFunnelMenu funnels={addableFunnels} onAdd={addToFunnel} />}
  </div>

  {view.visible.length === 0 && view.lockedCount === 0 ? (
    <p className="text-xs text-muted-foreground">
      {COPY.fiche.empty}{" "}
      {canAdd && <AddToFunnelMenu … asButton label={COPY.fiche.emptyAction} />}
    </p>
  ) : (
    <ul className="space-y-1">{/* FicheParticipationRow */}</ul>
  )}

  {view.lockedCount > 0 && (
    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
       title={COPY.fiche.lockedHint}>
      <Icon icon="mdi:lock-outline" size={11} aria-hidden />
      {COPY.fiche.locked(view.lockedCount)}
    </p>
  )}

  {view.hiddenCount > 0 && (
    <Button variant="link" size="sm" className="h-auto p-0 text-[11px]" onClick={() => setExpanded(true)}>
      {COPY.fiche.seeAll(view.hiddenCount)}
    </Button>
  )}
</section>
```

O estado "sem participação nenhuma" não deveria ocorrer (§5.4: todo lead entra no funil padrão por trigger), mas é tratado — a alternativa é um bloco em branco que ninguém sabe interpretar.

- [ ] **Step 3: Verificar e commitar**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/funnels"
bun run test
git add src/features/funnels/components/AddToFunnelMenu.tsx src/features/funnels/components/FicheFunnelsBlock.tsx
git commit -m "feat(funnels): the fiche block, with the shortcut to add a lead to a funnel"
```

---

## Task 6: Encaixar na ficha e recuperar o espaço vertical

**Files:**
- Modify: `src/features/leads/components/LeadProfileFiche.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

- [ ] **Step 1: Remover o chip de etapa legado**

Apagar o primeiro `<span>` do bloco de selos (`:263-270`), que mostra `lead.stage.name` com `getAccentClasses(hexToAccentSlot(lead.stage.color)).border`. Com N funis esse chip nomeia a etapa de **um** pipeline que não é necessariamente o que interessa a quem atende — e o bloco novo diz a etapa de cada funil. Remover também o import de `hexToAccentSlot` se ficar órfão.

- [ ] **Step 2: Inserir o bloco**

Entre os selos e a `<dl>`, exatamente onde a spec pediu — é a primeira coisa acionável.

- [ ] **Step 3: Trocar a paleta crua dos selos**

`:294` e `:301` usam `bg-emerald-500/15 text-emerald-700 dark:text-emerald-300` e `bg-red-500/15 text-red-700 dark:text-red-300` — paleta crua do Tailwind, proibida pela regra de temas. Passam a `bg-severity-success/15 text-severity-success` e `bg-severity-critical/15 text-severity-critical`. É dívida que estava neste bloco antes desta fase; corrigir agora porque estou editando estas linhas.

- [ ] **Step 4: `<dl>` vira `Collapsible` fechada**

Rótulo `LEADS_STRINGS.fiche.dataToggle = "Dados do lead"`. Quem atende precisa de funil, etapa e status; "criado em" é consulta ocasional, e o bloco novo custa ~35px por participação que precisam vir de algum lugar.

- [ ] **Step 5: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/leads" | grep -vE "LeadsFiltersBar.tsx\(321|useLeadsUrlState.ts\(206|leadDisplay.ts\(15[34]"
bun run test
bun run build
```

- [ ] **Step 6: Commit**

```bash
git add src/features/leads/components/LeadProfileFiche.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): the conversation fiche shows the lead's funnels"
```

---

## Task 7: Conferência no navegador — parte da task, não epílogo

As fases anteriores entregaram três defeitos com build, `tsc` e a suíte inteira verdes. Esta conferência é obrigatória **antes** do bump.

- [ ] **Step 1: Subir o dev server e confirmar que ele serve o código atual**

```bash
# O watcher NÃO dispara nestas worktrees — só um start novo serve o arquivo atual.
curl -s "http://127.0.0.1:PORTA/src/features/funnels/components/FicheFunnelsBlock.tsx" | grep -c fiche
```
Se vier `0`, matar o processo que escuta a porta (pode ser um órfão de uma tentativa anterior) e subir de novo.

- [ ] **Step 2: Exercitar em Atendimento → conversa com lead**

1. o bloco aparece **acima** dos dados, com uma linha por funil e a etapa em cada;
2. trocar a etapa pelo `Select` → toast com **Desfazer**; clicar em Desfazer devolve a etapa;
3. o `[+]` lista só os funis em que o lead **não** está; adicionar acrescenta uma linha na hora;
4. adicionar duas vezes seguidas no mesmo funil **não** produz erro (noop silencioso);
5. tirar de um funil pede confirmação; se for a única participação, o texto avisa que o lead volta para a triagem;
6. "Dados do lead" abre e fecha, e o `ConversationManagementCard` continua alcançável sem rolar demais;
7. abrir a mesma conversa como um usuário sem permissão de editar lead → etapa vira texto com cadeado.

- [ ] **Step 3: Conferir o efeito cruzado**

Adicionar o lead a um funil pela ficha e abrir a página de Leads naquele funil: o lead tem de estar lá. É a prova de que a escrita foi na participação e não numa cópia local.

---

## Task 8: Documentação, changelog e versão

- [ ] **Step 1: Handoff** — marcar a fase 5 como ✅ na tabela das 7 fases; atualizar cabeçalho e worktrees.

- [ ] **Step 2: Verificação completa**

```bash
bun run test && bun run build && bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"
```

- [ ] **Step 3: Versão** — MINOR (feature visível). **Extrair os codinomes usados antes de escolher:**

```bash
grep -oE "^## \[[0-9.]+\] — [A-Za-z]+" CHANGELOG.md | awk '{print $NF}' | sort -u
```
"Compass" e "Almanac" já foram queimados numa tentativa que não rodou esta checagem.

- [ ] **Step 4: Changelog em linguagem de usuário** — quem lê é o vendedor. O que mudou na tela: dá para ver e mexer nos funis do lead sem sair da conversa.

- [ ] **Step 5: PR**

```bash
git push -u origin feat/leads-multi-funil-fase5
gh pr create --base main --title "feat(leads): the conversation fiche shows and edits the lead's funnels — phase 5 — vX.Y.0"
```

---

## Auto-revisão

**Cobertura da spec §8**

| Item | Task |
|---|---|
| Bloco entre selos e `<dl>`, substituindo o chip de etapa | 6 |
| Lista de participações, uma linha por funil | 1, 4 |
| Layout 360px (110px / 150px / 24px) | 4 |
| Máximo 3 + "ver todas" | 1, 5 |
| `<dl>` vira `Collapsible` fechada | 6 |
| Sem participação → mensagem + "adicionar a um funil" | 5 |
| Sem permissão → texto + cadeado + tooltip | 4 |
| Mudança em andamento → spinner, `disabled`, sem skeleton | 3, 4 |
| Já convertido naquele funil → selo, outras editáveis | 4 |
| `🔒 +N funis que você não acessa`, sem nomes | 1, 5 |
| Toast com desfazer (6s) para etapa | 3 |
| `AlertDialog` para remover | 3, 4 |
| Leitura por `listEntriesViaConversation` | 2 |
| **`[+]` para adicionar a um funil** (pedido do dono) | 5 |

**Consistência de tipos** — `IFicheParticipation` (Task 1) é consumido por `useLeadFicheFunnels` (2), `FicheParticipationRow` (4) e `FicheFunnelsBlock` (5) com a mesma forma `{ entry, funnel, stage }`. `pendingEntryId` (3) é comparado com `participation.entry.id` (4). `addableFunnels` (2) alimenta `AddToFunnelMenu` (5).

**Riscos anotados** — a contagem sob cadeado depende de a RPC devolver participações de funis inacessíveis. Se em produção ela filtrar por acesso ao funil, `lockedCount` será sempre 0 e a linha nunca aparece: o bloco continua correto, só perde a explicação. Conferir na Task 7 com um vendedor que cuide de um lead num funil restrito — e, se filtrar, é ajuste de RPC na fase 6, não aqui.
