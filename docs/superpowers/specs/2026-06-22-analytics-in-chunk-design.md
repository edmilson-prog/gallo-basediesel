# Spec — Fix Erro 3 (messages-400): chunk do `.in()` em `listForAnalytics` + debounce do refetch realtime

> **Data:** 2026-06-22 · **Tier:** Pequeno · **Branch alvo:** `fix/analytics-in-chunk` · **Entrega:** PR (sem merge)
> **Status:** design aprovado (brainstorming) → próximo passo `writing-plans`

## 1. Contexto e problema (com evidência)

Em produção, ao abrir o **Dashboard do Gestor** (e a **Análise de Atendimento**), o console mostra:

```
GET /rest/v1/messages?select=...&conversation_id=in.(<centenas de UUIDs>)&sent_at=gte...&sent_at=lte... 400 (Bad Request)
```

**Causa raiz (confirmada empiricamente):** `IMessagesProvider.listForAnalytics`
([`messages.ts:185-197`](../../../src/providers/data/impl/supabase/messages.ts)) monta um único
`query.in("conversation_id", params.conversationIds)` com **todos** os IDs de conversa da loja
(loja `00000000-…-001` = **837 conversas**). A lista `in.()` codificada ≈ **32,6 KB**, URL ≈ **33 KB**,
**rejeitada no edge (Cloudflare/Kong) ANTES da RLS** — RLS nunca gera 400 (gera set vazio / 401 / 403 /
500 / timeout). Não é dado inválido nem coluna inexistente; é **comprimento de URL**.

**Amplificação:** `managerDashboard.snapshot`
([`managerDashboard.ts:118-126`](../../../src/providers/data/impl/supabase/managerDashboard.ts)) chama
`listForAnalytics` **2×** (janela atual `fromIso/toIso` + janela anterior `prevFromIso/prevToIso`) com o
**mesmo** conjunto completo de IDs, e o `useDashboardSnapshot` re-busca **a cada tick do realtime**
([`useDashboardSnapshot.ts:114-119`](../../../src/features/manager-dashboard/hooks/useDashboardSnapshot.ts) ←
`refreshKey: realtime.tick`, [`ManagerDashboardPage.tsx:68`](../../../src/features/manager-dashboard/pages/ManagerDashboardPage.tsx)).
O `tick` incrementa em **toda** mudança de `messages` E `conversations`
([`useRealtimeConversations.ts:164`](../../../src/features/conversations/hooks/useRealtimeConversations.ts)) →
tempestade de 400.

**Severidade:** `managerDashboard.snapshot` re-lança no `catch` → o `Promise.all([listForAnalytics×2])`
rejeita → o **Dashboard do Gestor inteiro quebra** (não só os KPIs de mensagem). Aparece **só para
Owner/Gestor** porque o snapshot é gated a esses papéis
([`ManagerDashboardPage.tsx:67`](../../../src/features/manager-dashboard/pages/ManagerDashboardPage.tsx)).

**Não é regressão da Turnstile/atendimento** nem de trabalho recente: o `.in()` sem chunk nasceu em
`413834f` e `conversationIds = scoped.map` sem filtro de data em `d8d9217`, ambos **2026-06-08**
(12 dias antes da Turnstile). Caminho de código distinto do modelo "2 portões".

## 2. Decisões travadas (brainstorming)

- **Escopo:** núcleo (chunk do `.in()`) **+** debounce do refetch realtime. **Sem** filtro de data na
  origem do `managerDashboard` (YAGNI).
- **Falha parcial:** **fail-fast** (`Promise.all`). Números completos **ou** erro claro — nunca KPIs
  parciais silenciosos. O `useDashboardSnapshot` já degrada com graça (mantém último snapshot, seta `error`).
- **Chunk util:** genérico e reusável em `src/shared/utils/chunk.ts` (não existe nenhum helper de chunk
  hoje — confirmado), testado isoladamente.

## 3. Solução — Frente 1: chunking em `listForAnalytics` (núcleo)

Conserta **ambos** os callers de uma vez (confirmado que só existem dois):
1. `managerDashboard.ts:121` / `:126` (`scoped.map(c => c.id)`, com guarda `conversationIds.length === 0` em `:118`).
2. `customer-service-analytics/useCustomerServiceMetrics.ts:151` (`conversationsCurrent.map(c => c.id)`, com guarda `enabled: conversationsCurrent.length > 0` em `:157`).

### 3.1 Novo util puro `src/shared/utils/chunk.ts`

```ts
/** Splits `items` into consecutive sub-arrays of at most `size`. Pure, transport-agnostic. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk: size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
```

### 3.2 `listForAnalytics` chunkado

- **Preserva exatamente** a semântica atual do caminho "sem filtro": se `conversationIds` ausente/vazio →
  **query única sem `.in()`** (como hoje, [`messages.ts:188`](../../../src/providers/data/impl/supabase/messages.ts)).
  (Na prática ambos os callers já guardam contra vazio, mas mantemos o fallback idêntico para não
  introduzir regressão em callers futuros.)
- Se `conversationIds.length > 0`:
  1. `chunk(conversationIds, ANALYTICS_IN_CHUNK_SIZE)` com `ANALYTICS_IN_CHUNK_SIZE = 120` (constante
     nomeada). Cada UUID ~39 chars encoded → lista `in.()` ~4,7 KB por chunk, folga enorme sob qualquer
     limite de URL. 837 IDs → 7 chunks.
  2. Para cada chunk, monta uma query **idêntica** (mesmo `select`, `.in("conversation_id", chunk)`,
     `.gte("sent_at", since)`, `.lte("sent_at", until)`, `.order("sent_at", { ascending: true })`).
  3. `Promise.all` (**fail-fast** — qualquer rejeição propaga, mantendo o prefixo de erro
     `[supabase] messages.listForAnalytics failed: …`).
  4. **Achata + re-ordena por `sent_at` ascendente** o resultado combinado, depois mapeia para `IMessage`.
- **Corretude (exactly-once):** o chunking é por `conversation_id`, então os chunks são **disjuntos** —
  cada conversa cai em exatamente um chunk → **sem duplicatas e sem perda**. O sort final restaura a
  ordenação ascendente global que cada caller espera (ver §5).

## 4. Solução — Frente 2: debounce do refetch realtime

Em [`useDashboardSnapshot.ts`](../../../src/features/manager-dashboard/hooks/useDashboardSnapshot.ts), o
efeito do `refreshKey` (`:114-119`) ganha **trailing debounce ~1500 ms**. O debounce mora **no consumidor
(dashboard)**, não no `useRealtimeConversations` (compartilhado com a Inbox — não deve mudar por causa do
dashboard).

### 4.1 Armadilha confirmada (stale-closure) e mitigação

Um `setTimeout` ingênuo capturaria o `fetchSnapshot` do render em que o efeito rodou. Como `fetchSnapshot`
é `useCallback([provider, paramsKey])` (`:87-104`), se o **filtro mudar dentro da janela do debounce**, o
timeout pendente dispararia com **params velhos** → flash de dados do filtro errado.

**Mitigação:** `fetchRef` sempre-fresca + `clearTimeout` no cleanup.

```ts
const REFRESH_DEBOUNCE_MS = 1500;

const fetchRef = useRef(fetchSnapshot);
fetchRef.current = fetchSnapshot;               // atualizado a cada render → sempre a closure fresca

const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  if (!enabled) return;
  if (refreshKey === 0) return;                 // mantém o skip do tick inicial
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    void fetchRef.current("refresh");           // chama a versão FRESCA (params atuais)
  }, REFRESH_DEBOUNCE_MS);
  return () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [refreshKey, enabled]);
```

Propriedades:
- **Rajada de ticks → 1 refetch:** cada novo `refreshKey` roda o cleanup (limpa o timeout anterior) e
  reagenda = debounce trailing.
- **Filtro muda na janela:** `paramsKey` muda → o efeito de "initial" (`:107-111`) já busca com params
  frescos; o timeout pendente, ao disparar, chama `fetchRef.current` (também fresca) → **dados corretos**
  (no pior caso um refetch redundante correto, nunca dados errados).
- **Unmount:** cleanup limpa o timeout → sem `setState` em componente desmontado.
- **Não** adicionar `refreshKey` ao efeito de `paramsKey` (evita clears em cascata). Resto da API pública
  do hook (`isLoading`/`isRefreshing`/`error`/`refetch`) **intacto**.

## 5. Ordenação e corretude (confirmado por verificação)

Os engines têm **re-sort defensivo** (`kpiMath.ts:24-25`, `calculateCustomerServiceMetrics.ts:79-80`),
então a agregação **não** assume entrada ordenada — **mas** quebra se houver mensagem **faltando ou
duplicada** (ex.: `calculateTmaMinutes` acha o 1º cliente por mínimo de tempo; `useVolumeHeatmap` conta
cada mensagem 1×). Como o chunk por `conversation_id` é disjunto, garantimos exactly-once. O sort final
ascendente preserva o **contrato** que o provider sempre devolveu (`messages.ts:194`).

## 6. Irmãos conhecidos — FORA DE ESCOPO (mas registrados)

A verificação achou outros `.in()` array-unbounded. **Não são corrigidos aqui**; documentados para não
fingir cobertura total. O util `chunk` reusável torna o conserto futuro trivial:

| Local | Tipo | Risco 400 (URL) | Observação |
|---|---|---|---|
| `scheduledSend.ts:201` e `:216` | `.in` (URL) | **Sim** | `convIds`/`custIds` de `scheduled_send` store-wide sem paginação |
| `vehicles.ts:132` | `.in` (URL) | **Sim** (potencialmente pior) | `scopedCustomerIds` de resolução store/seller-wide (10k+ possível) |
| `messages.ts:298` (`listLastMessages`) | `.rpc` `p_ids` (body) | **Não** | array vai no corpo do POST, não na URL — não estoura URL; outro vetor |

## 7. Testes

- **`src/shared/utils/chunk.test.ts`** (Vitest, espelhando `avatar.test.ts`/`format.test.ts`/`mediaRef.test.ts` —
  `import { describe, it, expect } from "vitest"`, asserts simples, sem setup): tamanho exato, com resto,
  lista vazia → `[]`, `size ≥ length` → 1 chunk, `size <= 0` → lança, preserva ordem e identidade dos itens.
- **Verificação manual do usuário** no Dashboard do Gestor + Análise de Atendimento (sem 400 no console;
  KPIs corretos; um único refetch após rajada) — conforme preferência de testar UI manualmente.
- **Gate:** `bun run build` + `bun run test` verdes. `bunx tsc --noEmit` avaliado **por delta** nos arquivos
  novos (baseline pré-existente de erros no `tsc`).

## 8. Arquivos tocados

1. `src/shared/utils/chunk.ts` **(A)** — util puro genérico.
2. `src/shared/utils/chunk.test.ts` **(A)** — teste do util.
3. `src/providers/data/impl/supabase/messages.ts` **(M)** — `listForAnalytics` chunkado + constante + sort final.
4. `src/features/manager-dashboard/hooks/useDashboardSnapshot.ts` **(M)** — debounce do refetch (fetchRef + clearTimeout).

## 9. Fora de escopo / não-regressão

- **Não** tocar `can_access_conversation` / `messages_select` / RPCs do modelo 2-portões (Turnstile) — caminho distinto.
- **Sem** migration, **sem** RLS, **sem** mudança no webhook.
- **Sem** filtro de data na origem do `managerDashboard` (YAGNI).
- **Sem** mexer nos irmãos da §6 (registrados, não corrigidos).
- Evolution/`whatsapp-connect 404` — outra sessão (decisão do dono).
- **Não regredir:** Dashboard do Gestor, Análise de Atendimento, Inbox em tempo real (o `tick` continua
  igual; só o consumidor do dashboard passa a coalescer).

## 10. Verificação antes de concluir

- [ ] `bun run test` verde (inclui `chunk.test.ts`).
- [ ] `bun run build` verde.
- [ ] `bunx tsc --noEmit` sem **novos** erros nos 4 arquivos (delta vs baseline).
- [ ] Smoke manual do dono: Dashboard do Gestor abre sem 400; KPIs batem; rajada de realtime = 1 refetch.
- [ ] Diff não toca nenhum arquivo fora dos 4 listados.
