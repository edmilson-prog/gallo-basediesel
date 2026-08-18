# Leads Multi-Funil — Fase 7 (Triagem) · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar saída ao funil de triagem. Quando a etapa de entrada passa do limite, a coluna troca de modo e oferece um caminho — e a Lista ganha seleção múltipla com **Adicionar ao funil**, **Atribuir vendedor** e **Marcar perdido**, para esvaziar em lote o que hoje só sai de um em um.

**Architecture:** Duas frentes que se encontram. No board, a coluna de entrada acima de `lead_funnels.entry_alert_threshold` substitui a pilha de cards por um painel de triagem — que **continua sendo alvo de soltura**. Na Lista, um `Checkbox` por linha, uma barra de ação que aparece com a seleção, e três operações em lote que reaproveitam o que já existe: `addEntry` dos funis e `update` dos leads. A decisão de quando trocar de modo vive num engine puro; as operações em lote vivem num hook que reporta progresso, porque cem `update` sequenciais precisam dizer onde estão.

**Tech Stack:** React 19 · TypeScript strict · TanStack Query/Router · Tailwind v4 + shadcn/ui · sonner · Vitest · bun

---

## Global Constraints

- **Worktree:** `.claude/worktrees/leads-multi-funil-fase7`, branch `feat/leads-multi-funil-fase7`, criada de `origin/main` em `175b2746`. Nunca commitar no diretório principal.
- **Tokens semânticos apenas.** Os desta base são `severity-critical`, `severity-info`, `severity-success`, `severity-warning` — **não existe `severity-danger`**. Cor de funil só via `getAccentClasses(accent)`; classes literais.
- **`.dot` e `.bar` são `background`; para borda existe `.border`.**
- **Estado compartilhado entre instâncias irmãs nunca em `useState` por instância** (defeito da v0.159.1).
- **Provider Pattern.** Dados só via `@/providers/data`.
- **Interfaces com prefixo `I`.** `strict: true`, `noUncheckedIndexedAccess`.
- **Texto em pt-BR acentuado**, em `src/features/leads/i18n/pt-BR.ts` ou `src/features/funnels/i18n/pt-BR.ts`.
- **Engines puros e testados** em `engine/`, `*.test.ts` co-localizado.
- **Gate por task:** `bun run test` + `bunx tsc --noEmit` por **delta**. ⚠️ O baseline do `tsc` é grande e vai além de `features/leads` — há erros pré-existentes em `conversations`, `customers`, `admin-settings` e `rbac/pages`. Baseline conhecido em `features/leads`: `LeadsFiltersBar.tsx(321)`, `useLeadsUrlState.ts(206)`, `leadDisplay.ts(153,154)`. **`features/funnels` está em zero — qualquer erro ali é meu.**
- **Nenhuma dependência nova.**
- ⚠️ **Nenhuma migration nesta fase.** `entry_alert_threshold` já existe desde a fase 2 e ficou editável na fase 6.
- ⚠️ **Armadilha do RBAC (handoff §3.0):** se esta fase precisar de recurso novo, registrar em `rbac_resources` **não concede nada** — `role_permissions` é que decide. Ela não deve precisar: as ações em lote são as mesmas de `lead` (`edit`), que todo papel comercial já tem.
- ⚠️ **O watcher do Vite não dispara nestas worktrees.** Conferência exige reiniciar o dev server e confirmar com `curl … | grep <identificador>` que o módulo servido é o atual. Um processo órfão segurando a porta já custou várias idas em falso.

---

## O que a spec §7.7 já decidiu (não reabrir)

| Decisão | Razão registrada |
|---|---|
| Modo triagem acima de `entry_alert_threshold` (padrão 50) | Sem saída, o `Geral` vira depósito permanente e o problema volta com outro nome |
| O cabeçalho **troca de modo**: contagem real, idade do mais antigo, dois CTAs | A pilha de cards não é acionável quando são novecentos |
| **`Triar em lista`** abre a Lista filtrada por essa etapa, com seleção múltipla | Triagem é trabalho de lista, não de quadro |
| **O painel de triagem continua alvo de soltura**, com `Solte para devolver à triagem` | Devolver um lead à entrada é movimento legítimo — colocaram no funil errado, o cliente sumiu — e o modo triagem não pode bloqueá-lo |
| Ações em lote: `Adicionar ao funil…` · `Atribuir vendedor` · `Marcar perdido` | |
| No `Geral` a ação canônica é **adicionar**, não mover | Coerente com N:N: o lead entra noutro funil e **continua** na triagem até alguém tirá-lo |

---

## Estrutura de arquivos

**Criar**

| Arquivo | Responsabilidade |
|---|---|
| `src/features/funnels/engine/triageMode.ts` | Puro: quando a coluna troca de modo, e o que ela mostra |
| `src/features/funnels/engine/triageMode.test.ts` | Testes |
| `src/features/leads/components/kanban/TriagePanel.tsx` | O painel que substitui a pilha, e aceita soltura |
| `src/features/leads/hooks/useLeadSelection.ts` | Seleção da Lista: alternar, faixa com Shift, limpar |
| `src/features/leads/hooks/useBulkLeadActions.ts` | As três operações em lote, com progresso e relatório parcial |
| `src/features/leads/components/BulkActionBar.tsx` | A barra que aparece com a seleção |
| `src/features/leads/components/BulkAddToFunnelDialog.tsx` | Escolher o funil de destino |
| `src/features/leads/components/BulkAssignSellerDialog.tsx` | Escolher o vendedor |
| `src/features/leads/components/BulkMarkLostDialog.tsx` | Escolher o motivo de perda |

**Modificar**

| Arquivo | Mudança |
|---|---|
| `src/features/leads/components/kanban/KanbanColumn.tsx` | Renderiza `TriagePanel` quando o modo pede |
| `src/features/leads/components/LeadsList.tsx` | Coluna de seleção; linha selecionada destacada |
| `src/features/leads/pages/LeadsPage.tsx` | Liga seleção, barra e diálogos; recebe `?etapa=` de "Triar em lista" |
| `src/features/leads/hooks/useLeadsUrlState.ts` | Nada novo — `stages` já existe e a fase 4 já o faz seguir o funil |
| `src/features/leads/i18n/pt-BR.ts` | Textos |
| `CHANGELOG.md` · `package.json` · `CLAUDE.md` · handoff | Versão e registro |

---

## Task 1: Quando a coluna de entrada troca de modo

**Files:** Create `engine/triageMode.ts` + `.test.ts`

**Interfaces:**
- Produces:
  - `interface ITriageInput { kind: LeadFunnelStageKind; count: number; threshold: number; oldestEnteredAt: string | undefined; now: Date }`
  - `interface ITriageView { active: boolean; count: number; oldestDays: number | null }`
  - `resolveTriageMode(input: ITriageInput): ITriageView`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { resolveTriageMode } from "./triageMode";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const base = { kind: "entrada" as const, threshold: 50, oldestEnteredAt: undefined, now: NOW };

describe("resolveTriageMode", () => {
  it("não liga em etapa que não é a de entrada, por maior que seja", () => {
    // Uma coluna "Em negociação" com mil leads é um problema de vendas, não de
    // triagem, e trocar o modo dela esconderia o trabalho de alguém.
    expect(resolveTriageMode({ ...base, kind: "aberta", count: 5000 }).active).toBe(false);
    expect(resolveTriageMode({ ...base, kind: "ganho", count: 5000 }).active).toBe(false);
  });

  it("liga acima do limite", () => {
    expect(resolveTriageMode({ ...base, count: 51 }).active).toBe(true);
  });

  it("não liga exatamente no limite", () => {
    // "passa de 50" é passar, não alcançar.
    expect(resolveTriageMode({ ...base, count: 50 }).active).toBe(false);
  });

  it("não liga abaixo do limite", () => {
    expect(resolveTriageMode({ ...base, count: 49 }).active).toBe(false);
  });

  it("respeita um limite configurado diferente do padrão", () => {
    expect(resolveTriageMode({ ...base, count: 11, threshold: 10 }).active).toBe(true);
    expect(resolveTriageMode({ ...base, count: 11, threshold: 200 }).active).toBe(false);
  });

  it("devolve a contagem recebida, que é a do servidor", () => {
    expect(resolveTriageMode({ ...base, count: 903 }).count).toBe(903);
  });

  it("calcula há quantos dias o mais antigo está parado", () => {
    const view = resolveTriageMode({
      ...base,
      count: 903,
      oldestEnteredAt: "2026-07-07T12:00:00.000Z",
    });
    expect(view.oldestDays).toBe(30);
  });

  it("devolve null quando não sabe qual é o mais antigo", () => {
    expect(resolveTriageMode({ ...base, count: 903 }).oldestDays).toBeNull();
  });

  it("nunca devolve idade negativa para data no futuro", () => {
    const view = resolveTriageMode({
      ...base,
      count: 903,
      oldestEnteredAt: "2026-09-01T00:00:00.000Z",
    });
    expect(view.oldestDays).toBe(0);
  });

  it("um limite zero ou negativo não liga o modo em coluna vazia", () => {
    // Configuração inválida não deve transformar uma coluna vazia em alarme.
    expect(resolveTriageMode({ ...base, count: 0, threshold: 0 }).active).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bunx vitest run src/features/funnels/engine/triageMode.test.ts
```

- [ ] **Step 3: Implementar**

```ts
export function resolveTriageMode({
  kind, count, threshold, oldestEnteredAt, now,
}: ITriageInput): ITriageView {
  const active = kind === "entrada" && count > 0 && count > threshold;
  const oldestDays = oldestEnteredAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(oldestEnteredAt).getTime()) / 86_400_000))
    : null;
  return { active, count, oldestDays };
}
```

Comentar por que só `entrada`: uma coluna "Em negociação" com mil leads é um problema de vendas, não de triagem, e trocar o modo dela esconderia o trabalho de alguém.

- [ ] **Step 4: Rodar e confirmar que passa** — 10 testes.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(funnels): decide when the entry column switches to triage mode"
```

---

## Task 2: O painel de triagem

**Files:** Create `components/kanban/TriagePanel.tsx`; Modify `KanbanColumn.tsx`, `i18n/pt-BR.ts`

- [ ] **Step 1: Textos**

```ts
    triage: {
      title: "Virou depósito",
      body: (n: number) =>
        `${n.toLocaleString("pt-BR")} leads parados na entrada. Triar em lista é mais rápido que arrastar um a um.`,
      oldest: (days: number) =>
        days === 0 ? "O mais antigo chegou hoje." : `O mais antigo está aqui há ${days} ${days === 1 ? "dia" : "dias"}.`,
      toList: "Triar em lista",
      distribute: "Distribuir",
      dropHint: "Solte para devolver à triagem",
    },
```

- [ ] **Step 2: O painel**

Substitui a pilha de cards — **não** o cabeçalho, que continua com soma e atrasados. Traz a contagem real (do agregado do servidor, não do que está carregado), a idade do mais antigo, e dois botões: `Triar em lista` e `Distribuir`.

- [ ] **Step 3: Continua alvo de soltura**

```tsx
// O painel de triagem NÃO desativa a coluna. Devolver um lead à entrada é
// movimento legítimo — puseram no funil errado, o cliente sumiu — e um modo
// que bloqueasse isso deixaria a pessoa sem caminho de volta.
{isOver && (
  <p className="…border-primary bg-accent/40…">{LEADS_STRINGS.kanban.triage.dropHint}</p>
)}
```

O `useDroppable` já está em `KanbanColumn` e envolve os dois modos — nada a acrescentar além do texto de hover.

- [ ] **Step 4: `Triar em lista`**

`url.setView("list")` **e** `url.patchFilters({ stageIds: [stage.id] })` numa só navegação. A fase 4 já fez o filtro de estágio seguir o funil, então o filtro casa com a etapa de entrada sem tradução.

- [ ] **Step 5: `Distribuir`**

⚠️ **Fora de escopo nesta fase.** Distribuir usa a fila de rodízio (`rotation_queues`, `assign_next_from_rotation`), que é outro subsistema com regras próprias de horário e departamento. O botão fica **desabilitado com tooltip** dizendo que a distribuição em lote vem depois — melhor um botão honesto que promete depois do que um que some e some com a ideia junto.

- [ ] **Step 6: Verificar e commitar**

---

## Task 3: Seleção na Lista

**Files:** Create `hooks/useLeadSelection.ts`; Modify `LeadsList.tsx`

**Interfaces:**
- Produces: `useLeadSelection(visibleIds: ID[]): { selected: Set<ID>; toggle, toggleRange, selectAllVisible, clear, allVisibleSelected }`

- [ ] **Step 1: O hook**

Estado local da página (não de módulo — a Lista é uma instância só, e a seleção não deve sobreviver a nada).

`toggleRange` guarda o último índice clicado para o `Shift+clique` — triagem é clicar em vinte linhas seguidas, e sem faixa isso são vinte cliques.

- [ ] **Step 2: A coluna**

`Checkbox` como primeira coluna, e no cabeçalho um que seleciona **o que está visível** — nunca "todos os 903", que prometeria uma operação em lote sobre um conjunto que a pessoa não viu.

Linha selecionada com `bg-accent/40`. O clique na linha continua abrindo o lead; o clique no checkbox **não propaga**.

- [ ] **Step 3: A seleção some quando o conjunto muda**

Trocar de funil, de filtro ou de busca limpa a seleção. Manter ids selecionados que saíram da vista é como se aplica uma ação em lote a alguém que não se pretendia.

- [ ] **Step 4: Verificar e commitar**

---

## Task 4: As três operações em lote

**Files:** Create `hooks/useBulkLeadActions.ts`, `BulkActionBar.tsx` e os três diálogos

- [ ] **Step 1: Textos**

```ts
    bulk: {
      selected: (n: number) => (n === 1 ? "1 lead selecionado" : `${n} leads selecionados`),
      clear: "Limpar seleção",
      addToFunnel: "Adicionar ao funil…",
      assignSeller: "Atribuir vendedor",
      markLost: "Marcar perdido",
      running: (done: number, total: number) => `${done} de ${total}…`,
      addedAll: (n: number, funil: string) =>
        `${n} ${n === 1 ? "lead adicionado" : "leads adicionados"} ao funil ${funil}.`,
      partial: (ok: number, fail: number) =>
        `${ok} ${ok === 1 ? "concluído" : "concluídos"}, ${fail} ${fail === 1 ? "falhou" : "falharam"}.`,
      allFailed: "Nenhum lead pôde ser alterado.",
    },
```

- [ ] **Step 2: O hook**

Cada operação percorre a seleção e conta sucessos e falhas **separadamente**:

```ts
// Cem updates sequenciais falham no meio às vezes. Um catch que engolisse
// tudo diria "pronto" sobre um lote parcial; um que abortasse no primeiro
// erro deixaria metade feita e a outra metade sem explicação. O relatório
// parcial é o único desfecho honesto.
for (const id of ids) {
  try { await run(id); ok += 1; } catch { fail += 1; }
  setProgress({ done: ok + fail, total: ids.length });
}
```

- **Adicionar ao funil** → `funnels.addEntry(leadId, funnelId)`. Re-adicionar é noop silencioso por contrato, então um lead que já esteja no destino não conta como falha.
- **Atribuir vendedor** → `leads.update(id, { sellerId })`.
- **Marcar perdido** → `leads.update(id, { lossReason, stage })`, espelhando o `MarkAsLostModal` — inclusive o `lossReasons` de `usePipelineSettings`.

- [ ] **Step 3: A barra**

Aparece com a seleção, fixa no rodapé da Lista (`sticky bottom-0`, com o mesmo fundo translúcido da fase 6 — a barra que ficava abaixo da dobra foi defeito lá). Mostra a contagem, as três ações e `Limpar seleção`.

- [ ] **Step 4: No `Geral`, adicionar é a ação canônica**

Coerente com N:N: o lead **entra** noutro funil e **continua** na triagem até alguém tirá-lo. A barra diz isso numa linha quando o funil aberto é o padrão, para que ninguém espere que o lead saia da lista sozinho.

- [ ] **Step 5: Invalidação**

`["leads-list"]`, `["lead-funnel-entries"]`, `["lead-funnel-counts"]` e `["lead-funnel-board-summary"]`. Uma operação em lote mexe no board de dois funis ao mesmo tempo.

- [ ] **Step 6: Verificar e commitar**

---

## Task 5: Conferência no navegador — parte da task, não epílogo

As fases 4, 5 e 6 entregaram, cada uma, defeitos com build, `tsc` e a suíte inteira verdes. A fase 6 teve um que **dizia "salvo" e não salvava**.

- [ ] **Step 1: Confirmar que o servidor serve o código atual**

```bash
curl -s "http://127.0.0.1:PORTA/src/features/leads/components/BulkActionBar.tsx" | grep -c bulk
```
`0` → matar quem escuta a porta (pode ser órfão) e subir de novo.

- [ ] **Step 2: Exercitar**

1. no `Geral` (3.386 participações em produção, 27 no mock) a coluna de entrada entra em modo triagem;
2. abaixar o limite na tela de Funis liga o modo noutra coluna de entrada — os dois lados falam da mesma coluna;
3. o painel **aceita soltura** e mostra `Solte para devolver à triagem`;
4. `Triar em lista` abre a Lista já filtrada por aquela etapa;
5. `Shift+clique` seleciona a faixa;
6. trocar de filtro **limpa** a seleção;
7. adicionar dez leads a um funil → aparecem no board daquele funil, e **continuam** no `Geral`;
8. atribuir vendedor e marcar perdido em lote, conferindo a contagem no relatório.

- [ ] **Step 3: Prova de lote parcial**

Selecionar leads e disparar uma operação; conferir que o relatório diz quantos foram e quantos falharam, em vez de um "pronto" genérico.

---

## Task 6: Documentação, changelog e versão

- [ ] **Step 1: Handoff** — fase 7 ✅, e a feature completa. Anotar o que ficou de fora: `Distribuir` em lote, e os quatro consumidores do `lead.stage` (spec §11.4) que seguem no pipeline legado.

- [ ] **Step 2: Gate completo**

```bash
bun run test && bun run build && bunx tsc --noEmit 2>&1 | grep -E "features/funnels"
```
`features/funnels` tem de continuar em zero.

- [ ] **Step 3: Versão** — MINOR. **Extrair os codinomes usados antes de escolher:**

```bash
grep -oE "^## \[[0-9.]+\] — [A-Za-z]+" CHANGELOG.md | awk '{print $NF}' | sort -u
```

- [ ] **Step 4: Changelog em linguagem de usuário.**

- [ ] **Step 5: PR.** Sem migration nesta fase — dizer isso explicitamente, porque as duas anteriores tinham.

---

## Auto-revisão

**Cobertura da spec §7.7 e da fase 7**

| Item | Task |
|---|---|
| Modo triagem acima do limite, com contagem real e idade do mais antigo | 1, 2 |
| Painel continua alvo de soltura, com `Solte para devolver à triagem` | 2 |
| `Triar em lista` abre a Lista filtrada por aquela etapa | 2 |
| `Distribuir` | 2 — **fora de escopo, botão honesto** |
| Seleção múltipla na Lista | 3 |
| `Adicionar ao funil…` · `Atribuir vendedor` · `Marcar perdido` | 4 |
| No `Geral`, adicionar é a ação canônica | 4 |

**Consistência de tipos** — `ITriageView` (Task 1) é consumido por `TriagePanel` (2). `useLeadSelection` (3) devolve `Set<ID>`, que `useBulkLeadActions` (4) recebe como `ID[]` via `[...selected]`. Os três diálogos (4) devolvem o argumento da operação, nunca executam.

**Riscos anotados**

1. **Lote grande é lento por construção.** Não há endpoint em lote; são N chamadas sequenciais. Para 903 leads isso é inviável, e é por isso que a seleção do cabeçalho marca **o que está visível**, não tudo. Se virar dor, o caminho é uma RPC, não paralelismo no cliente.
2. **`Distribuir` fica prometido.** Um botão desabilitado com tooltip é dívida visível; some da tela e some da memória. Anotar no handoff.
3. **A contagem do modo triagem vem de `getBoardSummary`**, que é o total real da etapa — não do que está carregado. É o que faz o painel dizer "903" enquanto a coluna tinha 40. Consistente com a fase 4.
