# PRD-214 — Fundação Supabase do Painel de Atendimento (read-only) — Design

> 2ª entrega do Painel de Atendimento. Liga os números reais em produção
> substituindo o placeholder vazio do provider `atendimentoMetrics` por
> agregações server-side. Pré-requisito entregue: PRD-215 (UI + contrato +
> mock), mergeado em #169, release `v0.119.0 Cadence`.

## 1. Contexto

O PRD-215 entregou o Painel de Atendimento (aba "Atendimento" em `/app/inicio`
+ cartão na Caixa) sobre **mock determinístico**. A impl Supabase do 38º
provider (`atendimentoMetrics`) ficou como **placeholder que retorna vazio**
(`src/providers/data/impl/supabase/atendimentoMetrics.ts`), e em produção o
painel mostra empty states + faixa "métricas em implantação".

O PRD-214 troca esse placeholder pela leitura real. O contrato
`IAtendimentoMetricsProvider` (6 métodos) **não muda** — é a fronteira estável
desenhada no 215 justamente para esta segunda entrega.

### Decisão de escopo (aprovada): **A — só leitura, sem trigger**

A definição de "novo atendimento" do 215 é *1º contato + reabertura*. O 1º
contato é derivável do `created_at` (histórico rico). As **reaberturas**
(`resolvida`/`arquivada` → ativa) exigem histórico de transição de status que
**não existe** (`audit_logs` tem 1 linha de conversa; sem event log). Capturar
reaberturas exigiria um **trigger na tabela quente `conversations`**, com
benefício só *forward-only* (nada no dia 1) e risco na camada de atendimento.

Decisão: **v1 só-leitura** — "novo atendimento" = **primeiro contato**.
O event log + trigger (modo *forward-only* de reaberturas) fica como
**fast-follow B**, isolado e aditivo; o contrato já reserva `historyStartsAt`
para ele.

## 2. Fatos do schema real (produção, medidos em 2026-06-24)

- `conversations`: **1.218** linhas (**91 `demo-seed`** + **1.127 reais**),
  span real `created_at` **2025-01-30 → 2026-06-23**. Colunas-chave:
  `id, store_id, customer_id, lead_id (text), assigned_seller_id, channel,
  whatsapp_account_id, status (text), tags (text[]), last_message_at,
  created_at, updated_at`. **Sem** `resolved_at`/`archived_at`.
- `status` presentes: `aguardando, em_andamento, aguardando_cliente, resolvida,
  arquivada` (union inalterada; snake_case mantido).
- `messages`: **66.683** linhas. `direction` ∈ `{in, out}`. `author_type` ∈
  `{customer, seller, sdr}` **+ anomalia**: algumas linhas têm um **UUID de
  vendedor** gravado em `author_type` (resíduo de echo/import). **Sem
  `store_id`** (escopo de loja sai via join em `conversations`).
- **Atribuição por mensagem é inviável:** de **32.208** envios `seller`, só
  **266** têm `author_id` que casa com `sellers.id`. ⇒ "Mensagens por atendente"
  **não** sai do `author_id`; sai do **responsável da conversa**
  (`assigned_seller_id`).
- `audit_logs`: `(id, store_id, actor_id, action, resource, resource_id,
  before jsonb, after jsonb, timestamp)` — sem histórico de status utilizável.

## 3. Decisões travadas

1. **Read-only, sem tabela nova nem trigger.** 6 RPCs de agregação
   `SECURITY DEFINER`. Zero escrita na `conversations`.
2. **"Novo atendimento" = primeiro contato** (`created_at`). Reabertura fora
   (escopo B). Rótulo da UI ganha "(primeiro contato)".
3. **Mensagens por atendente = por `assigned_seller_id`**, não por autor da
   mensagem. Outbound humano sem responsável → linha "Sem responsável".
4. **Bucket em `America/Sao_Paulo` (−03:00, sem DST desde 2019)**, com **formato
   de chave idêntico** ao `bucketKey` do engine: dia/semana = `YYYY-MM-DD`
   (semana = segunda-feira ISO), mês = `YYYY-MM`, ordenado asc. Mais correto que
   o UTC do mock; formato compatível com os gráficos prontos.
5. **`deltaPct`** = período anterior **half-open** `[prevFrom, from)`, calculado
   **dentro do RPC** (1 round-trip). Paridade com o mock.
6. **Tempo de atendimento** = proxy `last_message_at − created_at` (>0) por
   conversa com `created_at` na janela. *True-cycle* fica no escopo B.
7. **`demo-seed` sempre excluído** (`('demo-seed' = any(c.tags)) is not true`),
   espelhando `whatsapp_delivery_health`.
8. **1 RPC por método** (não combinão) — casa 1:1 com o contrato e com as 6
   queries do React Query (loading states independentes).

## 4. Escopo

### Incluído (PRD-214 / read-only)

- 6 RPCs `SECURITY DEFINER` de agregação (§5), gated Owner/Gestor, store-scoped,
  demo-seed excluído, bucket SP.
- Migration versionada com os 6 `create or replace function` + grants.
- Swap de `impl/supabase/atendimentoMetrics.ts` (placeholder → `.rpc()` reais).
- Desligar o aviso "métricas em implantação"; copy "(primeiro contato)".
- Teste de mapping do provider (Vitest) + verificação SQL no deploy.

### Excluído (escopo B / deferido)

- Event log `conversation_status_events` + trigger + reaberturas *forward-only*.
- `atendimento_cycles` (handle-time por ciclo resolvido) — mantém-se o proxy.
- Normalização da anomalia `author_type=<uuid>` na origem (tratada na leitura).
- Análise histórica profunda (TMA/TMR 12m, por canal, health por vendedor) →
  permanece no PRD-051.

## 5. Os 6 RPCs

Assinaturas consistentes (prefixo comum `p_store_id, p_from, p_to`;
`p_granularity`/`p_seller_id`/`p_audience` entram conforme a necessidade de cada
método — ver a coluna de assinatura na tabela). Onde presente, `p_granularity` é
validado/clampeado a `{day,week,month}` (default `day`). Todos retornam **jsonb
já no shape do contrato** (`src/shared/types/service-volume.ts`). Helpers de
bucket em SQL:

```
-- chave de bucket (formato == bucketKey do engine), em America/Sao_Paulo
day   : to_char((ts at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
week  : to_char(date_trunc('week', ts at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') -- segunda
month : to_char(date_trunc('month', ts at time zone 'America/Sao_Paulo'), 'YYYY-MM')
```

Escopo aplicado em todos (§6): gate de papel, loja, `demo-seed`, `p_seller_id`
opcional.

| RPC | Método | Lógica |
|---|---|---|
| `service_volume_novos_atendimentos(p_store_id, p_from, p_to, p_granularity, p_seller_id)` | `getNovosAtendimentos` | Bucketiza `created_at ∈ [from,to]` (1º contato). Retorna `{series, total, deltaPct, historyStartsAt:null}`. `deltaPct` vs `[from-span, from)`. `averagePerDay` **não** vem do RPC — provider calcula de `total`+janela. |
| `service_volume_message_volume(p_store_id, p_from, p_to, p_granularity, p_seller_id)` | `getMessageVolume` | Join `messages→conversations`. Por bucket de `sent_at`: `sent = count filter(direction='out')`, `received = count filter(direction='in')`. `{series:[{bucket,sent,received}], totalSent, totalReceived}`. |
| `service_volume_messages_by_user(p_store_id, p_from, p_to, p_seller_id, p_audience)` | `getMessagesByUser` | `direction='out'`, `sent_at ∈ [from,to]`. **Humano** (`author_type ∉ {sdr,customer}`) agrupado por `c.assigned_seller_id` (nome de `sellers.full_name`; null → "Sem responsável"). **Automação** (`author_type='sdr'`) numa linha única `{sellerId:null, name:"SDR (automação)", authorType:"sdr"}`. `p_audience` ∈ `{human,automation,all}` filtra. Ordena por `count` desc. |
| `service_volume_status_distribution(p_store_id, p_seller_id)` | `getStatusDistribution` | Snapshot atual (ignora janela): `count group by status`. `{slices:[{status,count}], total}`. |
| `service_volume_accumulated_chats(p_store_id, p_from, p_to, p_granularity, p_seller_id)` | `getAccumulatedChats` | Cumulativo de `created_at ∈ [from,to]` (running sum começando em 0 — paridade com o mock). `total` = todas as convs escopadas (sem filtro de janela). |
| `service_volume_handle_time(p_store_id, p_from, p_to, p_seller_id)` | `getHandleTimeStats` | Convs com `created_at ∈ [from,to]`: `dur = (last_message_at − created_at)` em ms, só `>0`. `averageMs = round(avg)`, `medianMs = percentile_cont(0.5)`, `cycleCount`. `deltaPct:null`. Vazio → `{0,null,0,null}`. |

## 6. Permissão & escopo (dentro de cada RPC)

- **Gate de papel:** se `current_app_role() not in ('owner','manager')` →
  retorna jsonb vazio/zerado (a UI já é gated por `service_volume.view`; isto é
  defesa em profundidade).
- **Loja:**
  - **owner:** usa `p_store_id` se informado; senão **cross-store** (todas).
  - **manager:** **força `current_store_id()`**, ignorando `p_store_id`.
- **`p_seller_id`:** filtro opcional (`assigned_seller_id = p_seller_id`),
  aplicado quando não-nulo.
- **`demo-seed`:** sempre excluído.
- `SECURITY DEFINER` + `set search_path to ''` + refs `public.` qualificadas.
  `grant execute ... to authenticated`. A função **substitui a RLS por gate +
  escopo internos** — é o que dá performance (sem RLS por-linha sobre 66k msgs),
  espelhando `whatsapp_delivery_health`.

## 7. Swap do frontend

- `src/providers/data/impl/supabase/atendimentoMetrics.ts`: placeholder → 6
  `await supabase.rpc('service_volume_…', {...})`. Como o RPC devolve o shape do
  contrato, o mapeamento é quase identidade. O provider calcula `averagePerDay`
  a partir de `total` + janela (contagem inclusiva de dias, igual ao engine).
- **Desligar o aviso "métricas em implantação"** (introduzido na Task 12 do
  215) — agora flui dado real. Localizar o ponto (página/componente da feature
  `service-volume`) e remover/suprimir.
- **Copy** "(primeiro contato)" no KPI/gráfico de novos atendimentos.
- `historyStartsAt` segue `null` → sem faixa forward-only. Plumbing de
  granularidade/período/loja **já pronto** (PRD-215), inalterado.

## 8. Migration, ordem de deploy & testes

- **Migration** `supabase/migrations/<ts>_service_volume_metrics.sql`: os 6
  `create or replace function` + grants. Idempotente e não-destrutiva (só
  funções; sem schema/dado). **Regra do espelho:** vai pro git no mesmo PR.
- **Ordem de deploy:**
  1. **Aplicar os RPCs em prod via MCP** (`execute_sql` begin/commit; registrar
     `version` = nome do arquivo), **com confirmação explícita do dono**. Seguro
     antes do front: o placeholder ignora os RPCs.
  2. **PR do swap do frontend → o dono merga** (nunca merge sem ok).
  3. **Version bump** à parte, depois.
- **Testes:**
  - **Vitest (mapping do provider):** mocka `supabase.rpc` devolvendo jsonb
    canônico → assert do shape tipado + `averagePerDay` + null handling.
  - **Engines** seguem testados (continuam servindo o mock).
  - **Verificação SQL no deploy:** query manual via MCP comparando cada RPC a um
    agregado escrito à mão na mesma janela (sanidade pré-liberação; não comitada).
  - **Smoke manual do dono** na UI (prod).

## 9. Segurança da camada congelada

O PRD-214 é **puramente aditivo**: RPCs de leitura + swap do provider. **Não
toca** no cache de mensagens/mídia (signing em lote #137), Realtime, query keys
nem nos RPCs *gated-once* de acesso a conversa. As novas funções leem
`conversations`/`messages` como `SECURITY DEFINER` (sem RLS por-linha), em
caminho separado do fluxo de atendimento.

## 10. Referências

- Contrato: `src/providers/data/contracts/atendimentoMetrics.ts`
- Tipos: `src/shared/types/service-volume.ts`
- Mock (paridade de semântica): `src/providers/data/impl/mock/atendimentoMetrics.ts`
- Engine de bucket: `src/features/service-volume/engine/bucketing.ts`
- Padrão de RPC gated: `whatsapp_delivery_health` (em prod)
- Spec do 215: `docs/superpowers/specs/2026-06-24-painel-atendimento-volume-design.md`
