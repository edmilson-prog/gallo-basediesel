# Design — Paginação por `.range()` no `listForAnalytics` (truncamento silencioso a 1000 linhas)

**Data:** 2026-06-23
**Branch:** `fix/analytics-row-pagination`
**Origem:** achado "F2" da 3ª rodada de code-review do PR #154 (memória `project_analytics_in_url_overflow_bug`).

---

## 1. Problema

`supabaseMessagesProvider.listForAnalytics` (`src/providers/data/impl/supabase/messages.ts`) busca mensagens por lotes de `conversation_id` (`chunk()` em `ANALYTICS_IN_CHUNK_SIZE = 120`) com `Promise.all`. Cada query de lote (`fetchRows`) faz `select(COLUMNS)` com `.in("conversation_id", batch)` + `.gte/.lte("sent_at", …)` **sem `.limit()` nem `.range()`**.

O PostgREST do Supabase corta o resultado no `db-max-rows` (default da plataforma = **1000 linhas**) **sem retornar erro**. Quando um lote tem mais de 1000 mensagens na janela, ele é truncado em silêncio → os KPIs (TMA, TMR, taxa de resolução, volume) exibidos ao Gestor/Owner saem **subcontados, sem aviso**.

### Severidade (medida em produção, projeto `njizaasajkdqptlxddqn`)

Loja real com **1211 conversas** (11 lotes de 120). Sem override de `max-rows` no banco (default 1000 se aplica):

| Janela | Total de mensagens | Média/lote |
|---|---|---|
| 30 dias | 6.052 | **550** (sob o teto, mas com skew alguns lotes passam de 1000 — o review observou 1207 e 2079) |
| 90 dias | 17.341 | **1.576** (acima de 1000 → truncamento **sistemático**) |

- O **Dashboard do Gestor** usa janelas curtas (~7 dias) → exposição baixa hoje.
- A **Análise de Atendimento**, com períodos longos (mês/trimestre), é onde o truncamento morde de verdade.

### Não é regressão do PR #154

O `.in()` único antigo também não tinha `.limit()` (cortava a 1000 **no total**). O PR #154 melhorou (1000 **por lote** = mais dados) e removeu o 400 de URL longa. A correção completa ficou de fora por escopo.

---

## 2. Decisão de abordagem

Avaliadas três abordagens; escolhida a **paginação por `.range()`** (decisão do dono, 2026-06-23):

1. **Paginação por `.range()` (ESCOLHIDA)** — drena cada lote em páginas até esgotar. Mínima, sem migration, sem aprovação de prod, cap-agnóstica, engines intocados. Custo: ainda trafega linhas cruas (90d ≈ 17k linhas, paginadas). Risco baixíssimo. Proporcional ao bug (correção de corretude).
2. **Paginação + SELECT enxuto (4 colunas)** — descartada por ora: ganho de banda, mas exige tipo de retorno mais estreito tocando o contrato e os 2 consumidores.
3. **RPC de agregação SQL** — **deferida como épico próprio**: ~95% menos banda e foge do teto, mas reimplementa TMA/TMR/resolução/conversão/heatmap em SQL, e os engines JS **não têm testes** → sem oráculo de paridade (risco de divergência sutil) + migration + aprovação de prod. Só compensa depois de testar os engines.

**Achado que sustenta a decisão:** o mapeamento do fluxo mostrou que só **4 campos** de `IMessage` entram nos KPIs (`sentAt`, `direction`, `authorType`, `conversationId`), e só o **TMR** precisa de linhas cruas por conversa — todo o resto é conversation-level. Os engines de KPI são puros mas **sem testes**, o que pesa contra reescrevê-los em SQL agora.

---

## 3. Arquitetura

A mudança é contida na função interna `fetchRows` do `listForAnalytics`, mais um util puro novo.

**Permanecem intactos:** o contrato `IMessage[]`, `rowToMessage`, a dedup `[...new Set(ids)]`, o `sortBySentAt` (merge cross-lote), o caminho de ids vazio, os dois consumidores (`managerDashboard.snapshot`, `useCustomerServiceMetrics`) e **todos os engines de KPI**. **Sem migration, sem aprovação de prod.**

### 3.1 Componente novo — helper puro `drainPaged`

O repo testa **helpers puros**, não o cliente supabase. A lógica de paginação é extraída para um util puro, espelhando `chunk`:

```ts
// src/shared/utils/paginate.ts
/**
 * Drains a paginated read into a flat array by calling `fetchPage(offset, limit)`
 * repeatedly until a page returns fewer than `pageSize` rows (a short page = the
 * source is exhausted). Pure and transport-agnostic — it knows nothing about any
 * backend; the caller supplies `fetchPage`.
 *
 * @throws {Error} if `pageSize` is not a positive integer.
 * @throws {Error} if the iteration cap is exceeded (defensive anti-runaway guard
 *   for a `fetchPage` that never returns a short page).
 */
export async function drainPaged<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize: number,
): Promise<T[]>
```

**Algoritmo:**
- Valida `pageSize` inteiro positivo (`Number.isInteger(pageSize) && pageSize > 0`), igual ao `chunk`.
- `offset = 0`; laço: `page = await fetchPage(offset, pageSize)`; acumula `page`; se `page.length < pageSize` → **para** (página curta = esgotou); senão `offset += pageSize`.
- **Teto de iterações defensivo** (ex.: `MAX_PAGES = 10_000` → 10M linhas a pageSize=1000): se exceder, lança erro — evita loop infinito se `fetchPage` sempre devolver página cheia.

**Reutilizável:** serve depois para os irmãos `.in()` unbounded (`scheduledSend.ts`, `vehicles.ts`).

### 3.2 `fetchRows` passa a drenar páginas

```ts
const ANALYTICS_PAGE_SIZE = 1000; // ≤ PostgREST Max rows (default 1000)

const fetchRows = (batch: string[] | null): Promise<MessageRow[]> =>
  drainPaged<MessageRow>(async (offset, limit) => {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);
    if (batch) query = query.in("conversation_id", batch);
    if (params.since) query = query.gte("sent_at", params.since);
    if (params.until) query = query.lte("sent_at", params.until);
    const { data, error } = await query
      .order("sent_at", { ascending: true })
      .order("id", { ascending: true }) // tiebreak → ordem TOTAL estável
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`[supabase] messages.listForAnalytics failed: ${error.message}`);
    return (data ?? []) as unknown as MessageRow[];
  }, ANALYTICS_PAGE_SIZE);
```

Cobre **também o caminho de ids vazio** (`fetchRows(null)` — scan da janela inteira sem filtro de conversa, o mais propenso a estourar 1000), porque ele também passa pelo `fetchRows`.

### 3.3 O que fica inalterado no `listForAnalytics`

- `const ids = params.conversationIds ?? []`.
- Dedup `chunk([...new Set(ids)], ANALYTICS_IN_CHUNK_SIZE)`.
- `Promise.all(batches.map(fetchRows))` (fan-out por lote inalterado).
- `sortBySentAt(results.flat()).map(rowToMessage)` — o merge cross-lote continua necessário (cada lote vem ordenado do banco, mas a união de listas ordenadas não é ordenada).
- Caminho de ids vazio: `sortBySentAt(await fetchRows(null)).map(rowToMessage)`.

Há agora **dois limites distintos**, ambos documentados em constante:
- `ANALYTICS_IN_CHUNK_SIZE = 120` → ids por `.in()` (comprimento da URL).
- `ANALYTICS_PAGE_SIZE = 1000` → linhas por `.range()` (Max rows do PostgREST).

---

## 4. Corretude — pontos críticos

1. **Ordem total estável é obrigatória para `.range()`.** Sem um `ORDER BY` único, a ordem das linhas entre páginas é indefinida no PostgREST → linhas podem trocar de página e **duplicar/pular** nas fronteiras. `(sent_at, id)` é uma ordem total (id é único), eliminando o risco.

2. **Invariante `ANALYTICS_PAGE_SIZE ≤ Max rows`.** Com 1000 (default da plataforma, sem override no banco — confirmado por `pg_db_role_setting` vazio) está coberto. Evidência adicional: outros providers já fazem `.range(0, 999)` com sucesso neste projeto (= Max rows ≥ 1000). **Risco se um dia baixarem o Max rows abaixo de 1000:** uma página "cheia" viria capada abaixo de `pageSize` e o laço pararia cedo (under-fetch). Mitigação: manter `ANALYTICS_PAGE_SIZE ≤ Max rows` do projeto. O valor exato do Max rows **não foi verificado ao vivo via REST** (config de serviço do PostgREST, não visível por SQL); a correção é, de qualquer forma, **cap-agnóstica para qualquer Max rows ≥ 1000**.

3. **Terminação.** Página curta (`< pageSize`) = fim. Se o total for múltiplo exato de `pageSize`, a última página real vem cheia → uma requisição extra devolve `[]` (curta) → para. Uma requisição extra na fronteira exata é aceitável e padrão.

4. **Fail-fast preservado.** Qualquer erro de página lança → `Promise.all` rejeita a chamada inteira (comportamento intencional, igual ao atual).

5. **Ordenação final preservada.** O array retornado segue ordenado por `sent_at` (via `sortBySentAt`), como hoje. O tiebreak por `id` vive só no `ORDER BY` do banco (para estabilizar a paginação); o `sortBySentAt` em memória continua por `sent_at` apenas — empates de `sent_at` entre lotes são irrelevantes para os consumidores (agrupam por conversa e os engines reordenam internamente).

---

## 5. Testes (TDD)

Cobertura no helper puro `src/shared/utils/paginate.test.ts` (sem cliente supabase):

- **Página curta única** (`total < pageSize`): retorna a página, **uma** chamada a `fetchPage`.
- **Primeira página vazia**: retorna `[]`, uma chamada.
- **Múltiplo exato** (ex.: `pageSize=2`, total 4): páginas `[2][2]` então `[]` → para; verifica offsets `0, 2, 4` e a parada na página vazia.
- **Multi-página irregular** (`pageSize=2`, total 5): `[2][2][1]` → para na página curta; verifica acumulação + offsets `0, 2, 4`.
- **Propaga rejeição** do `fetchPage` (lança).
- **`pageSize` inválido lança** (0, negativo, não-inteiro, `NaN`, `Infinity`) — espelha `chunk`.
- **Teto de iterações**: `fetchPage` que sempre devolve página cheia → lança após o cap.

O `listForAnalytics`/`fetchRows` em si **não** ganha teste unitário (o repo não mocka o cliente supabase — convenção atual); a cobertura de lógica mora no helper puro.

**Gate:** `bun run test` (todos verdes) + `bun run build` (verde) + `bunx tsc --noEmit` delta 0 nos arquivos tocados.

---

## 6. Custos e fronteiras

- Mais round-trips no caso 90d (~2 páginas/lote × 11 lotes ≈ 22 reqs), fan-out por lote inalterado.
- Memória cliente no pior caso (~17k linhas) é a **mesma de antes** — só que agora completa, não truncada.
- **Não tocado / deferido (épico próprio):** RPC de agregação server-side (corta ~95% de banda) — precisa dos engines testados primeiro como oráculo de paridade. Os irmãos `.in()` unbounded (`scheduledSend.ts`, `vehicles.ts`) também ficam fora, mas o `drainPaged` reusável passa a existir para resolvê-los.

---

## 7. Entrega

- Sem migration. Sem deploy de edge function. Só TS de provider + util + teste.
- PR contra a `main` (nunca merge direto). Smoke do dono: abrir a Análise de Atendimento com período longo (90d/trimestre) e confirmar que os KPIs deixam de subcontar (sanity: comparar o volume exibido com um `count(*)` da janela no banco).
