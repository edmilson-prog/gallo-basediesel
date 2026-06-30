# PRD-213 — Rodízio / Fila de Atendimento — Design

> **Status:** aprovado em 2026-06-16. Terceiro e último elo do épico "Gestão de Pessoas & Acesso" (211 → 212 → 213). Próximo passo: plano de implementação (`writing-plans`).
>
> **Convenção do projeto:** este spec fica **untracked** (não commitado), como os demais specs/planos do épico.

**Objetivo:** entregar uma **fila de atendimento (rodízio)** como mecanismo próprio e configurável — uma fila por loja, participantes ordenáveis por drag-and-drop, liga/desliga de participação por usuário, e pulo automático de quem está offline / fora do horário. A fila direciona o atendimento ou a um **departamento** (e dele aos membros) ou ao **usuário diretamente**, conforme `targetMode` por loja.

**Arquitetura (resumo):** lógica de seleção **pura** (engine testável, sem efeitos colaterais, sem `Math.random()`), I/O nos **providers** (mock + Supabase drop-in), UI consumindo via **hooks**. A fila integra com o motor de distribuição existente (PRD-013) por um **contrato de fronteira** num ponto de consulta único — sem reescrever o motor e sem atribuição dupla.

**Tech stack:** React 19 + Vite, TanStack Router/Query, Zustand (mock store), Tailwind v4 + shadcn/ui, `@dnd-kit` (aprovado), Vitest, Supabase (schema `public`, RLS).

---

## Decisões de escopo (aprovadas pelo dono — 2026-06-16)

1. **Onde a fila atua:** mecanismo **completo** (modelo + engine + providers + tela + aba) + integração no **ponto de distribuição existente** (`conversations.create()`, onde o PRD-013 já roda). O **webhook real de produção fica INTOCADO**; a ativação da fila no webhook é um passo consciente futuro (espelha o deferimento do enforcement server-side do PRD-212).
2. **Modos:** entregar **ambos** — `direct` (fila de usuários) e `department` (fila de departamentos com rodízio interno de membros, dois níveis com ponteiros independentes).
3. **Tela:** rota **dedicada** `/app/configuracoes/rodizio`, com link cruzado a partir da tela de Distribuição.

### Descobertas da exploração que fundamentam o design

- **O motor de distribuição do PRD-013 NÃO roda no webhook real.** Em `src/providers/whatsapp/webhook/core.ts:507`, a conversa nova recebe `assignedSellerId: customer.sellerId` direto — sem `distributeConversation()`. Em produção, cliente conhecido vai ao seu vendedor; cliente novo fica `aguardando` sem atribuição automática. O motor `distributeConversation` (carteira → especialidade → round_robin → carga → fallback) só roda em `conversations.create()` (simulação/SDR/criação manual). **Por isso a fila se pluga ali, e ativar no webhook fica deferido.**
- **Fundação já existe:** `sellers.rotation jsonb default '{"enabled": true}'` já está em produção (migration `20260616095610` do PRD-211), mas **não está mapeada no provider supabase**. A aba "Rodízio🔒" já está reservada no `SellerFormDialog` (mesmo padrão da aba "Horário" do 212). O engine `isWithinWorkSchedule` (212) é reutilizável. Departamentos (211) têm provider com resolução de membros (`membershipFor`).
- **Presença:** elegibilidade depende de `seller.availability === 'online'`. No `conversations.create()` isso vem do `context.sellers` (drop-in: mock = estado mockado, supabase = coluna `availability`). O Realtime (`useStorePresence`) é UI-only e **não** é necessário para a seleção — só alimenta a visão ao vivo da tela.

---

## Modelo de dados

### Tipos (`src/shared/types/rotation.ts` + barrel `index.ts`)

```ts
export type RotationTargetMode = "direct" | "department";

/** Uma fila por loja (1:1 com IStore). A própria fila é a config por loja. */
export interface IRotationQueue {
  id: ID;
  storeId: ID;
  targetMode: RotationTargetMode;
  /** Ponteiro do topo (justiça temporal). null = começar do início. */
  lastAssignedRefId?: ID | null;
  /** Sempre true (decisão 8-A); exposto para flexibilização futura. */
  skipOffline: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/**
 * Participante de uma fila. Dois escopos:
 *  - TOPO: scopeDepartmentId = null (refType 'seller' no modo direct, 'department' no modo department).
 *  - INTERNO: scopeDepartmentId preenchido → membro do rodízio interno daquele departamento (refType 'seller').
 */
export interface IRotationParticipant {
  id: ID;
  queueId: ID;
  scopeDepartmentId?: ID | null;
  refType: "seller" | "department";
  refId: ID;
  order: number;
  enabled: boolean;
  /** Ponteiro INTERNO do departamento (só quando refType='department'). */
  lastAssignedMemberId?: ID | null;
}
```

**DELTA em `ISeller`:** o campo `rotation?: { enabled: boolean }` **já existe** (placeholder do 211). O liga/desliga rápido na ficha edita esse campo; a participação detalhada (ordem, escopo) vive nos `rotation_participants`. A `rotation.enabled` é a fonte do toggle da aba; o participante correspondente espelha `enabled` (sincronizados na escrita).

**Decisão (resolve redundância RF-001/RF-003 do PRD):** o `targetMode` vive **só em `rotation_queues`** — não é duplicado em `IPlatformSettings`. A fila é 1:1 com a loja, então ela já é a config por loja. Fonte única, sem divergência.

### Tabelas (snake_case plural, schema `public`, migration espelhada em `supabase/migrations/`)

```sql
-- rotation_queues: uma por loja
create table if not exists public.rotation_queues (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  target_mode text not null default 'direct' check (target_mode in ('direct','department')),
  last_assigned_ref_id text,
  skip_offline boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id)
);

-- rotation_participants: topo (scope_department_id null) ou membro interno (preenchido)
create table if not exists public.rotation_participants (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.rotation_queues(id) on delete cascade,
  scope_department_id text references public.departments(id) on delete cascade,
  ref_type text not null check (ref_type in ('seller','department')),
  ref_id text not null,
  "order" integer not null default 0,
  enabled boolean not null default true,
  last_assigned_member_id text
);
create index if not exists idx_rotation_participants_queue on public.rotation_participants(queue_id);
create index if not exists idx_rotation_participants_scope on public.rotation_participants(scope_department_id);
```

**RLS** (padrão do projeto): SELECT store-scoped (`store_id = current_store_id()` na fila; participantes via join na fila); INSERT/UPDATE/DELETE para `is_staff()` da loja. Migration **aplicada em prod só sob OK explícito do dono** (mock-first valida antes).

---

## Engine puro — seleção

### `src/features/rotation/engine/eligibility.ts`

```ts
/** Um seller é elegível para receber pela fila AGORA. Reusa isWithinWorkSchedule (PRD-212). */
export function isSellerEligible(
  seller: ISeller,
  participant: { enabled: boolean },
  now: Date,
): { eligible: boolean; reason: RotationSkipReason | "selected" }

export type RotationSkipReason =
  | "skipped_disabled"     // participant.enabled === false
  | "skipped_offline"      // availability !== 'online'
  | "skipped_inactive"     // active === false
  | "skipped_off_hours";   // !isWithinWorkSchedule(seller, now)
```

Ordem de verificação: `enabled` → `active` → `availability==='online'` → `isWithinWorkSchedule(seller, now)`. Sem `workSchedule` = sempre dentro (consistente com 212).

### `src/features/rotation/engine/selectNextFromRotation.ts`

```ts
export interface IRotationSelectionInput {
  queue: IRotationQueue;
  participants: IRotationParticipant[];                  // escopo topo (scopeDepartmentId null)
  membersByDepartment: Record<ID, IRotationParticipant[]>; // rodízio interno por dept
  sellersById: Record<ID, ISeller>;                      // availability, workSchedule, active
  now: Date;
}

export interface IRotationCandidate {
  refId: ID;
  refType: "seller" | "department";
  reason: RotationSkipReason | "selected";
  selected: boolean;
}

export interface IRotationSelectionResult {
  selectedSellerId: ID | null;          // null = ninguém elegível → fallback do 013
  selectedDepartmentId: ID | null;      // só no modo department
  candidates: IRotationCandidate[];     // topo + (no modo dept) membros do dept vencedor
  nextTopPointer: ID | null;            // novo last_assigned_ref_id
  nextMemberPointerByDept: Record<ID, ID>; // novos last_assigned_member_id (modo dept)
}

export function selectNextFromRotation(input: IRotationSelectionInput): IRotationSelectionResult;
```

Regras:
- **Justiça temporal (RF-009):** ordena participantes por `order`; inicia a varredura **após** `lastAssignedRefId` (índice do último + 1, com wrap-around). Se o ponteiro está obsoleto/ausente, começa do índice 0.
- **Pulo (RF-008, 8-A):** participante não elegível entra em `candidates` com seu `reason` e é **pulado**; o ponteiro avança além dele.
- **Modo `direct`:** o primeiro `seller` elegível na varredura é selecionado; `nextTopPointer = refId` selecionado.
- **Modo `department` (RF-010):** varre departamentos pela ordem/ponteiro; um departamento é elegível se tem **≥1 membro elegível** (avalia `membersByDepartment[deptId]` com a mesma lógica, iniciando após `last_assigned_member_id` daquele dept). Seleciona o departamento e o membro; avança **ambos** os ponteiros (`nextTopPointer` = dept; `nextMemberPointerByDept[dept]` = membro). Ponteiros independentes.
- **Ninguém elegível (RF-011):** `selectedSellerId = null`, ponteiros inalterados → o provider mantém a decisão de fallback do 013 (SDR/fila).
- **Determinístico (RNF-002):** sem sorteio. Puro (RNF-004).

### Testes (TDD, `*.test.ts` co-localizados)

Cobrir todos os Gherkins do PRD: pulo de offline + avanço de ponteiro com revezamento (`[Carlos, Marina(offline), Rafael]`, último=Carlos → pula Marina, seleciona Rafael); modo department dois níveis com ponteiros independentes; carteira tem precedência (testado na camada de integração); ninguém elegível → vazio; estabilidade do ponteiro ao reordenar (RF-018: reordenar não zera injustamente).

---

## Integração com a distribuição (contrato de fronteira)

**Ponto único, em `conversations.create()`** (mock `src/mocks/api/conversations.ts` e supabase `src/providers/data/impl/supabase/conversations.ts`), **após** `distributeConversation()`:

```
decision = distributeConversation(input, context)

if (decision.criterionMatched in {carteira, especialidade}):
    # precedência a montante (RF-013) — fila NÃO é consultada
    use decision

elif (decision.criterionMatched in {round_robin, carga, fallback_fila}):
    rot = selectNextFromRotation(<estado da fila da loja>, now)
    if (rot.selectedSellerId):
        decision.selectedSellerId = rot.selectedSellerId
        decision.status = 'em_andamento'
        decision.isSdrActive = false
        decision.criterionMatched = 'round_robin'   # a fila É o revezamento (sem novo enum)
        decision.candidatesEvaluated = <candidatos da fila c/ reason detalhado>
        # provider persiste os ponteiros avançados (como já faz com lastAssignedSellerId)
    else:
        use decision   # fila vazia → fallback do 013 (SDR/fila)
```

- **Uma atribuição por conversa (RF-014):** a fila só atua quando o 013 NÃO casou carteira/especialidade.
- **Helper puro compartilhado** (`applyRotationOverride`) evita duplicar a lógica de decisão entre mock e supabase; a **busca do estado** da fila (participantes, sellers) fica em cada provider (mock lê do store; supabase do banco).
- **Trace (RF-023) sem nova tabela nem novo enum:** reaproveita `IDistributionTrace` com `criterionMatched: 'round_robin'` e os pulados detalhados em `candidatesEvaluated[].reason` ("rodízio: pulado — offline" etc.). Respeita o "ponto de consulta único".
- **Avanço de ponteiro:** o provider persiste `rotation_queues.last_assigned_ref_id` e os `last_assigned_member_id` (modo dept), análogo ao avanço de `lastAssignedSellerId` já existente.

> O webhook real (`webhook/core.ts`) **não muda**. Ativar a fila no webhook (distribuir clientes novos em produção) exige presença online/offline confiável server-side — documentado como passo futuro.

---

## Tela de gestão `/app/configuracoes/rodizio` (Owner/Gestor)

- Rota file-based com `beforeLoad: requireAuth(..., { resource: "seller", action: "edit", scope: "store" })`; `SettingsLayout`; container `max-w-[1600px]` (padrão Configurações).
- **Seletor de `targetMode`** (RadioGroup `direct` | `department`, padrão visual do `EcommerceAssignmentMode`), persiste na fila (auditado).
- **Lista ordenável** por **drag-and-drop** (`@dnd-kit/core` + `@dnd-kit/sortable`) com **alternativa por teclado** (RNF-006, `KeyboardSensor` do dnd-kit) + toggle `enabled` por participante. Reordenar grava `order`; auditado.
- **Modo `department`:** dois níveis — fila de departamentos e, ao abrir um departamento, seu rodízio interno de membros (mesma lista DnD + toggle).
- **Visão ao vivo (`RotationLiveView`, RF-016):** `useRotationLivePreview` roda `selectNextFromRotation` em runtime com o estado atual → mostra "próximo elegível", o estado de cada participante (online / offline / desabilitado / fora-de-horário, via `eligibility`) e os pulados com motivo. Reage a mudanças de disponibilidade.
- **Acessibilidade (RNF-006):** `aria-label` nos estados; DnD por teclado; tema light/dark com tokens semânticos; segue `docs/dev/ux-guidelines.md` (glass header, ScrollProgressBar onde couber).
- Link cruzado a partir da tela de Distribuição.

---

## Aba "Rodízio" na ficha do usuário

Destravar `TabsTrigger value="rodizio"` no `SellerFormDialog` (hoje `disabled` + `LockedTabPlaceholder`), seguindo **exatamente** o padrão da aba "Horário":
- `RotationTab` **controlada** pelo form: estado no pai, salva no botão único "Salvar alterações" (consistente com a unificação do save feita no 212).
- Conteúdo: switch "Participa do rodízio" (`rotation.enabled`) + indicador do estado atual (elegível agora? por que está pulado, se for o caso — via `eligibility`).
- Só habilitada em modo edição (`isEdit && seller`); em criação, placeholder "cadastre e salve primeiro".
- A ordenação fina permanece na tela da fila (RF-019/020). Ao salvar, sincroniza `rotation.enabled` e o `enabled` do participante correspondente.

---

## Camada de dados (mock-first, drop-in)

Dois providers novos — `rotationQueues` (37º) e `rotationParticipants` (38º):
- **Contratos** `src/providers/data/contracts/rotationQueues.ts` + `rotationParticipants.ts` (`IRotationQueuesProvider`, `IRotationParticipantsProvider`); registrar tipos em `contracts/index.ts` (`IDataProviders`).
- **Mock** `impl/mock/*` delegando a APIs em `src/mocks/api/*`, sobre o Zustand store; seed determinístico (`src/mocks/data/` + `generators/bootstrap.ts`): fila da loja-matriz com os vendedores atuais em ordem, `enabled: true`, `targetMode: 'direct'`.
- **Supabase** `impl/supabase/*` (mapper snake_case ↔ camelCase + RLS). **Mapear `sellers.rotation`** no `supabaseSellersProvider` (hoje ausente em `SellerRow`/`COLUMNS`/`rowToSeller`/`sellerPatchToRow`).
- **Hooks** `hooks/useRotationQueuesProvider.ts` + `useRotationParticipantsProvider.ts` via `_useDataProviderSlice`.
- **Factory** registra ambos em `mockProviders` e `supabaseProviders`.
- **Contratos da fila** expõem: `getByStore(storeId)`, `setTargetMode`, `setPointer`; participantes: `listByQueue`, `listByDepartment`, `setOrder` (reordenação), `setEnabled`, `add`, `remove`. Reordenação idealmente atômica (follow-up: RPC `SECURITY DEFINER` se necessário, como em `setPermissions` do 211).

**Mock-first:** valida tudo em mock; **migration versionada**; **aplica em prod só sob OK explícito** (padrão 212).

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Mexer no caminho crítico de atribuição | A fila só atua em `conversations.create()` (já existente); o **webhook real não muda** |
| Atribuição dupla | Ponto de consulta único; carteira/especialidade a montante; fila só quando o 013 não casou; uma atribuição por conversa |
| Reordenação não-atômica (concorrência) | Mock-first OK; supabase via update por linha; follow-up RPC se necessário (RNF-001) |
| Presença não confiável no webhook | Ativação no webhook explicitamente **deferida** (fora do escopo desta entrega) |
| Supply-chain guard 24h (`@dnd-kit`) | Lib madura (releases > 24h); aprovado no roteiro do épico; sem `minimumReleaseAgeExcludes` |

---

## Fora de escopo (YAGNI)

- Reescrita do motor do PRD-013 (apenas consulta).
- Ativação da fila no **webhook real** de produção (passo futuro, exige presença server-side).
- Múltiplas filas por loja (uma por loja — decisão 7-A).
- Pesos por participante; carga como critério primário do rodízio.
- Distribuição de leads de campanha / outbound.

---

## Versionamento

Release **MINOR**, codinome **inédito** (não "Relay" = v0.83.0). Fecha o épico "Gestão de Pessoas & Acesso" (211 → 212 → 213). CHANGELOG (Keep a Changelog, linguagem acessível ao usuário), CLAUDE.md (parágrafo de estado + codinome + tag), PRD renomeado `_DONE`.

---

**AILA — Sistemas Inteligentes**
