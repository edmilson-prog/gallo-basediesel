# Leads Multi-Funil — Fase 6 (Administração) · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Existir um lugar para **administrar funis** — renomear, trocar ícone e cor, reordenar e editar etapas, definir quem enxerga, arquivar. Hoje criar funil só acontece por um modal na página de Leads, e editar não acontece em lugar nenhum.

**Architecture:** Rota nova `/app/configuracoes/atendimento/funis`, em master-detail clonado do `RolesPage` (rail de 260px + painel + barra de ação persistente + guarda de rascunho sujo). Três abas: Etapas, Acesso e Geral. Toda a camada de dados já existe desde a fase 2 — `replaceStages`, `replaceAccess`, `updateFunnel`, `archiveFunnel`, `listAccess` — e esta fase é consumo mais um recurso RBAC novo. As regras de validação (terminais obrigatórios, nome único, etapa com leads) vivem em engines puros; o componente é projeção.

**Tech Stack:** React 19 · TypeScript strict · TanStack Query/Router · Tailwind v4 + shadcn/ui · `@dnd-kit/core` · Vitest · bun

---

## Global Constraints

- **Worktree:** `.claude/worktrees/leads-multi-funil-fase6`, branch `feat/leads-multi-funil-fase6`, criada de `origin/main` em `f6a2eed4`. Nunca commitar no diretório principal.
- ⚠️ **Esta fase TEM migration** — a primeira desde a fase 2. O recurso RBAC `funnel` precisa de linha em `public.rbac_resources` (colunas reais: `key`, `label`, `group`, `sort_order`). Regra do projeto: **todo `apply_migration` via MCP deve ser exportado para `supabase/migrations/` no mesmo PR, e a aplicação em produção é manual e exige OK explícito do dono.** Mergear o PR **não** aplica.
- **Tokens semânticos apenas.** Os desta base são `severity-critical`, `severity-info`, `severity-success`, `severity-warning` — **não existe `severity-danger`**. Cor de funil e de etapa só via `getAccentClasses(accent)`; classes literais, template string não gera CSS no Tailwind v4.
- **`getAccentClasses(...).dot` e `.bar` são `background`; para borda existe `.border`.** Confundir isso já foi corrigido duas vezes nesta feature.
- **Estado compartilhado entre instâncias irmãs nunca em `useState` por instância** (defeito da v0.159.1): store no módulo + `useSyncExternalStore`.
- **Provider Pattern.** Dados só via `@/providers/data`.
- **Interfaces com prefixo `I`.** `strict: true`, `noUncheckedIndexedAccess`.
- **Texto em pt-BR acentuado**, em `src/features/funnels/i18n/pt-BR.ts`. Vocabulário do mercado brasileiro: **funil**, **etapa**, **motivo de perda**.
- **Engines puros e testados** em `engine/`, `*.test.ts` co-localizado.
- **Gate por task:** `bun run test` + `bunx tsc --noEmit` avaliando **delta**. ⚠️ O baseline do `tsc` é grande e vai além de `features/leads` — há erros pré-existentes em `features/conversations` e `features/customers`. Baseline conhecido em `features/leads`: `LeadsFiltersBar.tsx(321)`, `useLeadsUrlState.ts(206)`, `leadDisplay.ts(153,154)`. **`features/funnels` está em zero — qualquer erro ali é meu.**
- **Nenhuma dependência nova.** `@dnd-kit` já está instalado.
- ⚠️ **O watcher do Vite não dispara nestas worktrees.** Conferência no navegador exige **reiniciar o dev server** e confirmar com `curl http://127.0.0.1:PORTA/src/<caminho> | grep <identificador>` que o módulo servido é o atual. Um processo órfão segurando a porta já custou várias idas em falso.

---

## O que a spec §9 já decidiu (não reabrir)

| Decisão | Razão registrada |
|---|---|
| Rota `…/funis` **substitui** `…/pipeline` | A tela antiga é somente-leitura desde sempre, com um aviso de "Fase 2" que se refere ao PRD-017, não a esta feature |
| Master-detail clonado do `RolesPage` | Padrão já validado nesta base, com guarda de rascunho sujo |
| Arraste com **handle `⠿` dedicado** | Linha inteira arrastável inutiliza o campo de nome |
| Cor por **grade de 9 swatches**, sem color picker | Cor é slot enumerado, não hex (decisão 7 do dono) |
| Exatamente **um terminal de cada tipo**, obrigatórios e não excluíveis | Imposto pela constraint trigger de §3.1, não só pela UI |
| Excluir etapa com leads é **bloqueado** | `AlertDialog` com `Select` de destino |
| **"Todos da loja"** (`open_to_store`) é atalho legítimo | A decisão 2 descartou acesso por *departamento*, não a liberação para a loja inteira. Sem ele, admitir um vendedor exigiria editar todos os funis à mão |
| Conjunto de acesso vazio → aviso + botão `Salvar sem acesso` | |
| Owner/Gestor como **linha informativa**, não checkbox travado | O acesso vem do papel |
| **O funil padrão não tem aba Acesso** | Ele recebe todo lead novo, é destino de `removeEntry` e é onde a triagem acontece — restringi-lo trancaria a operação |
| **Não há interruptor "funil padrão"** | Mover o padrão criaria divergência com §5.4, §7.7 e §11.5 |
| **Arquivar, nunca excluir** | Funil com histórico não some; relatórios dependem dele. O `Geral` não pode ser arquivado |
| Matriz usuários × funis **somente-leitura** | Um lugar para editar, outro para conferir. Matriz editável foi descartada: célula ambígua, save parcial, inviável em mobile |

---

## O destino da tela legada — decisão necessária antes da Task 8

`PipelineSettingsPage` **não é resto morto.** O pipeline legado ainda alimenta quatro consumidores:

| Consumidor | Uso |
|---|---|
| `ConvertLeadModal` | etapas para a conversão |
| `MarkAsLostModal` | etapas para marcar perdido |
| `ConversationMenu` | etapas no menu da conversa |
| `LeadsPage` | opções do filtro "Estágio" na visão "Todos os funis" |

Mais o campo `lead.stage`, gravado como snapshot em cada lead.

**Esta fase NÃO migra esses quatro.** Substituir a *rota* de configuração é o escopo; reescrever os modais de conversão para falarem participação é trabalho de outra fase e mexe em `§11.4 — consumidores de lead.stage`. A Task 8 mantém a tela antiga acessível por link direto, com um aviso apontando para a nova, e deixa o corte anotado no handoff.

---

## Estrutura de arquivos

**Criar**

| Arquivo | Responsabilidade |
|---|---|
| `src/features/funnels/engine/stageRules.ts` | Puro: valida o conjunto de etapas (terminais, nomes, limites) |
| `src/features/funnels/engine/stageRules.test.ts` | Testes |
| `src/features/funnels/engine/accessPreview.ts` | Puro: quem enxerga o funil, somando `open_to_store` e nominais |
| `src/features/funnels/engine/accessPreview.test.ts` | Testes |
| `src/features/funnels/hooks/useFunnelAdmin.ts` | Carrega funis + etapas + acesso; expõe salvar/arquivar |
| `src/features/funnels/pages/FunnelsSettingsPage.tsx` | Master-detail: rail + painel + barra de ação + guarda de sujo |
| `src/features/funnels/components/admin/FunnelRail.tsx` | Rail de 260px (`Select` abaixo de 1024px) |
| `src/features/funnels/components/admin/StagesTab.tsx` | Aba Etapas, com arraste |
| `src/features/funnels/components/admin/StageRow.tsx` | Uma etapa: handle, nome, cor, tipo, excluir |
| `src/features/funnels/components/admin/AccessTab.tsx` | Aba Acesso, com prévia reativa |
| `src/features/funnels/components/admin/GeneralTab.tsx` | Aba Geral: nome, ícone, cor, descrição, limite, arquivar |
| `src/features/funnels/components/admin/AccessMatrixDialog.tsx` | Matriz usuários × funis, somente-leitura |
| `src/routes/app.configuracoes.atendimento.funis.tsx` | A rota |
| `supabase/migrations/<ts>_rbac_funnel_resource.sql` | Recurso `funnel` em `rbac_resources` |

**Modificar**

| Arquivo | Mudança |
|---|---|
| `src/features/rbac/permissions/resources.ts` | `"funnel"` em `RESOURCES` |
| `src/features/rbac/permissions/matrix.ts` | `funnel` para Owner (`CRUD`/`all`) e Gestor (`CRUD`/`store`) |
| `src/features/admin-settings/pages/PipelineSettingsPage.tsx` | Aviso apontando para a tela nova |
| navegação de Configurações | Item "Funis" ao lado de "Pipeline de leads" |
| `src/features/funnels/i18n/pt-BR.ts` | Textos da administração |
| `CHANGELOG.md` · `package.json` · `CLAUDE.md` · handoff | Versão e registro |

---

## Task 1: As regras de um conjunto de etapas

**Files:** Create `engine/stageRules.ts` + `.test.ts`

**Interfaces:**
- Produces:
  - `type StageIssue = "missing_entrada" | "missing_ganho" | "missing_perda" | "duplicate_name" | "empty_name" | "name_too_long" | "too_many_terminals"`
  - `validateStageSet(stages: IStageDraft[]): StageIssue[]`
  - `canDeleteStage(input: { stage, leadCount, all }): { allowed: boolean; reason?: "terminal" | "has_leads" | "last_open" }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { canDeleteStage, validateStageSet, type IStageDraft } from "./stageRules";

const s = (name: string, kind: IStageDraft["kind"], id = name): IStageDraft => ({
  id, name, kind, accent: 1, position: 0,
});

const VALID = [s("Novo", "entrada"), s("Andamento", "aberta"), s("Ganho", "ganho"), s("Perdido", "perda")];

describe("validateStageSet", () => {
  it("aceita o conjunto mínimo válido", () => {
    expect(validateStageSet(VALID)).toEqual([]);
  });

  it("exige uma etapa de entrada", () => {
    expect(validateStageSet(VALID.filter((x) => x.kind !== "entrada"))).toContain("missing_entrada");
  });

  it("exige uma etapa de ganho e uma de perda", () => {
    // A constraint trigger no banco rejeita isso de qualquer forma; a UI avisa
    // antes de o usuário perder o trabalho.
    expect(validateStageSet(VALID.filter((x) => x.kind !== "ganho"))).toContain("missing_ganho");
    expect(validateStageSet(VALID.filter((x) => x.kind !== "perda"))).toContain("missing_perda");
  });

  it("recusa mais de uma etapa do mesmo tipo terminal", () => {
    expect(validateStageSet([...VALID, s("Ganho 2", "ganho")])).toContain("too_many_terminals");
  });

  it("aceita várias etapas abertas", () => {
    expect(validateStageSet([...VALID, s("Outra", "aberta")])).toEqual([]);
  });

  it("recusa nome repetido, ignorando caixa e espaços", () => {
    expect(validateStageSet([...VALID, s("  novo  ", "aberta", "x")])).toContain("duplicate_name");
  });

  it("recusa nome vazio", () => {
    expect(validateStageSet([...VALID, s("   ", "aberta", "x")])).toContain("empty_name");
  });

  it("recusa nome acima de 24 caracteres — o limite da coluna", () => {
    expect(validateStageSet([...VALID, s("a".repeat(25), "aberta", "x")])).toContain("name_too_long");
  });

  it("aceita exatamente 24 caracteres", () => {
    expect(validateStageSet([...VALID, s("a".repeat(24), "aberta", "x")])).toEqual([]);
  });
});

describe("canDeleteStage", () => {
  it("bloqueia excluir etapa terminal", () => {
    const r = canDeleteStage({ stage: VALID[2]!, leadCount: 0, all: VALID });
    expect(r).toEqual({ allowed: false, reason: "terminal" });
  });

  it("bloqueia excluir a etapa de entrada", () => {
    expect(canDeleteStage({ stage: VALID[0]!, leadCount: 0, all: VALID }).reason).toBe("terminal");
  });

  it("bloqueia excluir etapa com leads", () => {
    // O FK de stage_id não tem cascade: excluir levantaria 23503. A UI pede o
    // destino antes, em vez de deixar o Postgres recusar.
    const r = canDeleteStage({ stage: VALID[1]!, leadCount: 12, all: VALID });
    expect(r).toEqual({ allowed: false, reason: "has_leads" });
  });

  it("bloqueia excluir a última etapa aberta", () => {
    expect(canDeleteStage({ stage: VALID[1]!, leadCount: 0, all: VALID }).reason).toBe("last_open");
  });

  it("permite excluir uma aberta vazia quando há outra", () => {
    const all = [...VALID, s("Outra", "aberta", "o")];
    expect(canDeleteStage({ stage: all[4]!, leadCount: 0, all })).toEqual({ allowed: true });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bunx vitest run src/features/funnels/engine/stageRules.test.ts
```

- [ ] **Step 3: Implementar**

`validateStageSet` percorre uma vez contando por `kind` e acumulando nomes normalizados (`trim().toLowerCase()`). `canDeleteStage` checa, nesta ordem: terminal ou entrada → `has_leads` → última aberta. A ordem importa: dizer "tem leads" sobre uma etapa que também é terminal daria ao usuário um caminho que não existe.

- [ ] **Step 4: Rodar e confirmar que passa** — 14 testes.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(funnels): rules for a valid set of stages"
```

---

## Task 2: A prévia de quem enxerga o funil

**Files:** Create `engine/accessPreview.ts` + `.test.ts`

**Interfaces:**
- Produces: `resolveAccessPreview(input: { sellers, grantedIds, openToStore, staffIds }): { reachCount: number; viaRole: ISeller[]; viaStore: ISeller[]; viaGrant: ISeller[]; isEmpty: boolean }`

- [ ] **Step 1: Testes que falham** — cobrindo:

1. ninguém marcado e `openToStore` desligado → `isEmpty`, contagem só de staff;
2. `openToStore` ligado → todos os vendedores da loja entram;
3. as duas dimensões **somam (OU)** e ninguém é contado duas vezes;
4. Owner/Gestor entram por papel e **não** aparecem em `viaGrant` mesmo se marcados;
5. um vendedor marcado que também é staff conta uma vez;
6. contagem recalcula ao alternar `openToStore` sem perder os nominais.

- [ ] **Step 2: Implementar** — `Set` por id, staff primeiro, depois loja, depois nominais; cada lista só recebe quem ainda não entrou por um caminho anterior. A ordem define a explicação que o usuário lê ("entra por papel" ganha de "entra por marcação").

- [ ] **Step 3: Verificar e commitar**

```bash
git commit -m "feat(funnels): reactive preview of who reaches a funnel"
```

---

## Task 3: O recurso RBAC `funnel`

⚠️ Esta task cria a **migration** desta fase.

**Files:**
- Modify: `src/features/rbac/permissions/resources.ts`, `matrix.ts`
- Create: `supabase/migrations/<timestamp>_rbac_funnel_resource.sql`

- [ ] **Step 1: O literal e a matriz**

`"funnel"` entra em `RESOURCES` junto do bloco comercial. Em `matrix.ts`: `p("funnel", CRUD, "all")` para Owner e `p("funnel", CRUD, "store")` para Gestor. Vendedor **não** recebe — administrar funil é decisão de estrutura comercial, e o vendedor já é governado pelo acesso ao funil, que é outra coisa.

- [ ] **Step 2: A migration**

`rbac_resources` tem colunas `key`, `label`, `group`, `sort_order`. O grupo "Comercial" hoje vai de 0 a 10, em ordem alfabética por rótulo — `Funis` cai entre `Clientes`(0)… e `Indicadores`(2). Reordenar os existentes seria mexer em linhas que não são desta fase; **inserir com `sort_order = 11`** e deixar a ordenação alfabética para quem a exibe é o corte menor.

```sql
insert into public.rbac_resources (key, label, "group", sort_order)
values ('funnel', 'Funis', 'Comercial', 11)
on conflict (key) do update
   set label = excluded.label,
       "group" = excluded."group";
```

`on conflict do update` porque a migration precisa ser idempotente: ela vai rodar em ensaio antes de rodar valendo.

- [ ] **Step 3: Ensaio antes de aplicar**

```sql
-- Insere, confere, e aborta. Nada persiste.
do $$
declare v int;
begin
  insert into public.rbac_resources (key, label, "group", sort_order)
  values ('funnel','Funis','Comercial',11)
  on conflict (key) do update set label = excluded.label;
  select count(*) into v from public.rbac_resources where key='funnel';
  raise exception 'ENSAIO OK -- % linha(s) para funnel; revertido', v;
end $$;
```

- [ ] **Step 4: NÃO aplicar em produção**

A regra do projeto é explícita: aplicar exige **OK do dono**, e mergear o PR não aplica. A migration vai no PR, exportada, e a aplicação é pedida no corpo dele.

- [ ] **Step 5: Verificar e commitar**

```bash
bun run test
git commit -m "feat(rbac): funnel resource, gating funnel administration"
```

---

## Task 4: O esqueleto master-detail

**Files:** Create `pages/FunnelsSettingsPage.tsx`, `components/admin/FunnelRail.tsx`, `hooks/useFunnelAdmin.ts`, `routes/app.configuracoes.atendimento.funis.tsx`

- [ ] **Step 1: Ler o `RolesPage` antes de escrever**

Este layout é clone, não invenção. O que precisa vir junto:

- rail de 260px; abaixo de 1024px vira `Select` no topo (`useIsMobile`, como o `RoleRail` faz);
- barra de ação **persistente** no rodapé do painel, não botão solto;
- **guarda de rascunho sujo**: `dirtyRef` + `pendingSwitchId` + `AlertDialog`. Trocar item no rail é **estado React, não navegação** — por isso `useBlocker` do router **não pega**, e a guarda precisa ser explícita. Errar isso é perder o trabalho do usuário em silêncio.

- [ ] **Step 2: O gate**

A rota exige `usePermission("funnel", "view")`. Sem permissão, a página não monta — e o item de menu não aparece.

- [ ] **Step 3: Estado vazio**

Sem funil além do padrão, o rail mostra três templates no vocabulário do cliente — **Catalisador**, **Filtros**, **Módulos** — cada um criando o funil já com etapas sugeridas, pelo `createFunnelWithStages` que a v0.159.2 introduziu.

- [ ] **Step 4: Verificar e commitar**

---

## Task 5: Aba Etapas

**Files:** Create `components/admin/StagesTab.tsx`, `StageRow.tsx`

- [ ] **Step 1: Arraste**

`@dnd-kit` com os mesmos sensores de `RotationQueueManager.tsx:141-144`. Aqui **`SortableContext` é apropriado** — é uma lista ordenável de verdade, ao contrário do board da fase 4, onde `sortableKeyboardCoordinates` travou o arraste por não haver contexto sortable. Use `sortableKeyboardCoordinates` **nesta** tela.

Handle `⠿` dedicado: `cursor-grab`, `touch-none`, `aria-label="Reordenar etapa"`. A linha inteira **não** é arrastável — senão o campo de nome fica inutilizável.

- [ ] **Step 2: Os campos**

Nome (`Input` inline, obrigatório, único, ≤24), cor (grade de 9 swatches `funnel-0..8`, sem color picker), tipo (`Entrada` · `Aberta` · `Ganho` · `Perda`).

Os erros vêm de `validateStageSet` (Task 1) e desabilitam o salvar, com a razão dita ao lado do campo — não um toast genérico depois do clique.

- [ ] **Step 3: Excluir**

`canDeleteStage` decide. Bloqueado por leads → `AlertDialog` com `Select` de destino, e a movimentação acontece antes da exclusão, num só salvar.

- [ ] **Step 4: Salvar**

`replaceStages(funnelId, next)` — que já faz upsert por id e apaga só os órfãos, porque `stage_id` tem FK sem cascade. **Não** trocar por delete-all + insert.

- [ ] **Step 5: Verificar e commitar**

---

## Task 6: Aba Acesso

**Files:** Create `components/admin/AccessTab.tsx`

- [ ] **Step 1: Prévia reativa**

No padrão do `InstanceAccessSheet.tsx:110-180`. Contador no topo recalcula a cada clique, alimentado por `resolveAccessPreview` (Task 2).

- [ ] **Step 2: As três faixas**

Linha informativa fixa para Owner/Gestor (não checkbox travado — o acesso vem do papel), interruptor "Todos da loja" (`open_to_store`), e a grade de vendedores.

- [ ] **Step 3: Conjunto vazio**

`border-severity-warning/40 bg-severity-warning/10` + "Ninguém enxerga este funil", e o salvar vira `variant="destructive"` com rótulo **`Salvar sem acesso`**. Não bloquear: pode ser intencional durante a montagem de um funil.

- [ ] **Step 4: O funil padrão não tem esta aba**

Substituída por uma nota explicando por quê: ele recebe todo lead novo, é destino de `removeEntry` e é onde a triagem acontece. Restringi-lo trancaria a operação.

- [ ] **Step 5: Verificar e commitar**

---

## Task 7: Aba Geral, arquivamento e matriz

**Files:** Create `components/admin/GeneralTab.tsx`, `AccessMatrixDialog.tsx`

- [ ] **Step 1: Campos** — nome, ícone (grade de ~24 `mdi:` curados, os mesmos do `NewFunnelModal`), accent (9 swatches), descrição, limite de acúmulo.

**Sem interruptor "funil padrão"**: na v1 o `Geral` é imutável, e mover o padrão criaria divergência com §5.4, §7.7 e §11.5.

- [ ] **Step 2: Arquivar, nunca excluir**

Funil com histórico não some — os relatórios dependem dele. Arquivado sai do seletor, permanece em auditoria, e os leads **ficam onde estão**. O rail avisa ("3 funis arquivados contêm 47 leads ativos") com CTA de migração em lote. O `Geral` não pode ser arquivado.

- [ ] **Step 3: Matriz somente-leitura**

Botão `Visão geral de acesso` → `Table` com primeira coluna sticky, `mdi:check` ou `—`, célula clicável levando à aba Acesso daquele funil. Um lugar para editar, outro para conferir.

- [ ] **Step 4: Verificar e commitar**

---

## Task 8: A tela legada e a navegação

**Files:** Modify `PipelineSettingsPage.tsx`, navegação de Configurações

- [ ] **Step 1: Item de menu**

"Funis" entra em Configurações → Atendimento, **acima** de "Pipeline de leads", gated por `usePermission("funnel", "view")`.

- [ ] **Step 2: O aviso na tela antiga**

O texto atual promete *"A edição visual estará disponível na Fase 2"* — promessa do PRD-017, de um faseamento diferente, parada há muito tempo. Substituir por um aviso que diz a verdade: este é o pipeline legado da loja, ainda usado pelos modais de conversão e perda e pelo filtro da visão consolidada; a administração dos funis fica em **Funis**, com link.

**Não remover a rota.** Os quatro consumidores listados no topo deste plano continuam nela, e migrá-los é outra fase.

- [ ] **Step 3: Verificar e commitar**

---

## Task 9: Conferência no navegador — parte da task, não epílogo

Três entregas seguidas passaram por build, `tsc` e a suíte inteira verdes e quebraram na tela.

- [ ] **Step 1: Confirmar que o servidor serve o código atual**

```bash
curl -s "http://127.0.0.1:PORTA/src/features/funnels/pages/FunnelsSettingsPage.tsx" | grep -c StagesTab
```
`0` → matar quem escuta a porta (pode ser órfão) e subir de novo.

- [ ] **Step 2: Exercitar**

1. o item "Funis" aparece para Dono/Gestor e **não** para Vendedor;
2. reordenar etapas por arraste **e por teclado** (`Espaço`, setas, `Espaço`);
3. tentar excluir uma terminal → bloqueado com a razão certa;
4. tentar excluir uma com leads → diálogo pede destino, e os leads chegam lá;
5. desmarcar todo mundo na aba Acesso → aviso e `Salvar sem acesso`;
6. o funil padrão **não** tem aba Acesso, e não pode ser arquivado;
7. trocar de funil no rail com rascunho sujo → diálogo, e cancelar preserva o rascunho;
8. arquivar um funil → some do seletor da página de Leads, e os leads dele continuam existindo.

- [ ] **Step 3: Prova cruzada**

Renomear uma etapa aqui e abrir Leads naquele funil: a coluna tem de mudar de nome. É o que prova que as duas telas falam da mesma tabela.

---

## Task 10: Documentação, changelog e versão

- [ ] **Step 1: Handoff** — fase 6 ✅; anotar que os quatro consumidores do `lead.stage` seguem no pipeline legado, e que isso é corte deliberado.

- [ ] **Step 2: Gate completo**

```bash
bun run test && bun run build && bunx tsc --noEmit 2>&1 | grep -E "features/funnels"
```
`features/funnels` tem de continuar em zero.

- [ ] **Step 3: Versão** — MINOR. **Extrair os codinomes usados antes de escolher:**

```bash
grep -oE "^## \[[0-9.]+\] — [A-Za-z]+" CHANGELOG.md | awk '{print $NF}' | sort -u
```
"Compass" e "Almanac" já foram queimados por não rodar esta checagem.

- [ ] **Step 4: Changelog em linguagem de usuário.**

- [ ] **Step 5: PR — e pedir a aplicação da migration**

O corpo do PR precisa dizer, com destaque, que **há uma migration e que mergear não a aplica**. A aplicação em produção é manual e depende do OK do dono.

---

## Auto-revisão

**Cobertura da spec §9**

| Item | Task |
|---|---|
| Rota `…/funis` substituindo `…/pipeline` | 4, 8 |
| Gate RBAC `funnel`, grupo Comercial | 3 |
| Master-detail + guarda de rascunho sujo + rail responsivo | 4 |
| 9.1 arraste com handle, cor por swatches, nome ≤24 único, tipos, terminais obrigatórios, excluir com destino | 1, 5 |
| 9.2 prévia reativa, "Todos da loja", vazio com `Salvar sem acesso`, staff informativo, padrão sem aba | 2, 6 |
| 9.2 matriz somente-leitura | 7 |
| 9.3 campos, sem interruptor de padrão, arquivar nunca excluir, estado vazio com templates | 4, 7 |

**Consistência de tipos** — `IStageDraft` (Task 1) é o que `StagesTab` e `StageRow` (5) manipulam e o que vira `ILeadFunnelStage[]` no `replaceStages`. `resolveAccessPreview` (2) alimenta o contador de `AccessTab` (6). `validateStageSet` e `canDeleteStage` (1) são as duas únicas fontes de "pode ou não pode" na aba Etapas.

**Riscos anotados**

1. **A migration é o único item que não fica pronto no merge.** Se o dono não aplicar, o recurso `funnel` não existe em `rbac_resources` e o editor de papéis não mostra a linha "Funis" — a tela funciona para Owner/Gestor pela matriz do cliente, mas a permissão não é editável. Dizer isso no PR.
2. **`sortableKeyboardCoordinates` é o import certo aqui** e foi o errado na fase 4. A diferença é `SortableContext`: esta tela tem, o board não tinha. Quem copiar de um para o outro erra.
3. **Arquivar um funil com leads ativos** deixa esses leads sem board visível — eles continuam na Lista e na visão consolidada. O aviso no rail existe por isso, e a migração em lote é o caminho de saída.
