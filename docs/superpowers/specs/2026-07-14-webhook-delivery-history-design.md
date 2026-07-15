# Histórico de entregas de webhook (Webhook Delivery History) — Design

> **Data:** 2026-07-14
> **Motivação:** durante uma investigação de mensagens vazias (sem texto nem
> mídia) numa conversa WAHA, ficou claro que a plataforma não tem como
> recuperar o payload bruto de um webhook já processado — `integration_logs`
> só guarda eventos ignorados/duplicados/com erro, e os logs de Edge Function
> do Supabase só mostram método/status/latência, nunca o corpo da requisição.
> O dono pediu algo equivalente à tela de "Executions" do n8n (lista de
> chamadas recebidas, com o payload de entrada navegável).

## 1. Escopo

**Cobertura:** todo webhook **recebido** pela plataforma hoje — os dois
endpoints públicos que aceitam POST de fora:

- `supabase/functions/whatsapp-webhook/index.ts` — multiplexado por rota
  (`/whatsapp-webhook/evolution`, `/whatsapp-webhook/openwa`, path Meta),
  cobre Meta Cloud API, Evolution v2, Evolution-Go e OpenWA.
- `supabase/functions/waha-webhook/index.ts` — isolado (não compartilha o
  core `_shared/whatsapp/webhook/`), cobre WAHA.

**Fora de escopo (decisão, não esquecimento):**

- Chamadas de **saída** (`whatsapp-send`, `waha-send`) — já têm trilha
  própria em `integration_logs`; não duplicar aqui.
- Outros webhooks da plataforma (ex.: callback OAuth do Melhor Envio) —
  volume irrisório, não é o problema que motivou esta entrega.
- Busca full-text dentro do payload — filtros estruturados (conta, evento,
  resultado, período) cobrem o caso de uso conhecido; full-text fica para
  se a necessidade aparecer.
- Correlação automática com a mensagem/reação específica que motivou a
  investigação original — esse histórico é a ferramenta de apoio; a
  investigação em si (ex.: confirmar o formato exato de uma reação do
  WhatsApp) continua sendo um passo manual, feito **depois** que o log
  existir e capturar uma ocorrência real.

## 2. Modelo de dados

Tabela nova e dedicada, **separada** de `integration_logs` — que continua
existindo do jeito que é hoje (trilha de eventos ignorados/duplicados/erros
+ auditoria de envio, sem expiração automática). Misturar as duas
significaria ou (a) fazer todo webhook recebido expirar em 30 dias
(mudança de comportamento em cima de dados que hoje não expiram), ou (b)
deixar o histórico completo crescer para sempre — nenhuma das duas serve.

```sql
create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  integration_name text not null,   -- 'whatsapp_meta' | 'whatsapp_evolution'
                                     -- | 'whatsapp_evolution_go' | 'whatsapp_openwa'
                                     -- | 'whatsapp_waha' (mesmo vocabulário de integration_logs)
  account_id uuid references public.whatsapp_accounts(id) on delete set null,
  event_type text,                  -- nome cru do evento do payload
                                     -- (messages.upsert / Message / message / message.any / session.status)
  endpoint text not null,           -- rota exata que recebeu a chamada
  http_status integer not null,
  outcome text not null,            -- 'processed' | 'ignored' | 'duplicate' | 'error' | 'rejected'
  error_message text,
  latency_ms integer,
  request_payload jsonb,            -- o payload bruto — o motivo desta entrega existir
  trace_id text,
  created_at timestamptz not null default now()
);

alter table public.webhook_deliveries enable row level security;

create policy webhook_deliveries_owner_read
  on public.webhook_deliveries for select
  using (current_app_role() = 'owner');

-- INSERT só via service_role (as próprias Edge Functions) — sem policy de
-- INSERT para authenticated/anon, mesmo padrão de integration_logs.
```

- `account_id` fica `null` numa rejeição de assinatura antes de resolver a
  conta (não dá pra saber de qual conta é um HMAC inválido).
- `outcome = 'rejected'` grava o payload bruto mesmo assim — é justamente
  tráfego suspeito que vale registrar; a rejeição em si (fail-closed) não
  muda em nada.
- **Retenção: 30 dias, rotação automática.** Um job `pg_cron` diário
  (mesmo padrão já usado por `whatsapp_health_tick` e pelo refresh das MVs
  de BI) apaga linhas com `created_at` mais antigo que 30 dias:

```sql
create or replace function public.webhook_deliveries_retention_tick()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.webhook_deliveries
  where created_at < now() - interval '30 days';
$$;

select cron.schedule(
  'webhook-deliveries-retention',
  '0 4 * * *',  -- diário, 04:00 UTC (01:00 BRT)
  $$select public.webhook_deliveries_retention_tick()$$
);
```

## 3. Gravação (Edge Functions)

Um helper genérico e novo em `supabase/functions/_shared/webhookDeliveryLog.ts`
— **não** faz parte do core `_shared/whatsapp/webhook/` (que é
runtime-agnostic e espelhado de `src/providers/whatsapp/`); é só um insert
utilitário, no mesmo espírito de `_shared/secrets.ts`, que já é importado
por várias functions sem relação direta entre si.

```ts
export async function logWebhookDelivery(
  admin: SupabaseClient,
  entry: {
    integrationName: string;
    accountId?: string | null;
    eventType?: string | null;
    endpoint: string;
    httpStatus: number;
    outcome: "processed" | "ignored" | "duplicate" | "error" | "rejected";
    errorMessage?: string | null;
    latencyMs?: number | null;
    requestPayload: unknown;
    traceId?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("webhook_deliveries").insert({
      integration_name: entry.integrationName,
      account_id: entry.accountId ?? null,
      event_type: entry.eventType ?? null,
      endpoint: entry.endpoint,
      http_status: entry.httpStatus,
      outcome: entry.outcome,
      error_message: entry.errorMessage ?? null,
      latency_ms: entry.latencyMs ?? null,
      request_payload: entry.requestPayload as Json,
      trace_id: entry.traceId ?? null,
    });
  } catch {
    // Fail-open, mesmo princípio da observabilidade (Sentry): registrar a
    // entrega nunca pode derrubar o processamento real do webhook.
  }
}
```

**Pontos de chamada** — cada webhook chama isso em **todo** ponto de saída,
para cobrir todos os `outcome` possíveis:

- Falha de verificação de assinatura → `outcome: 'rejected'` (payload bruto
  gravado do mesmo jeito).
- Evento reconhecido mas ignorado (grupo/broadcast/tipo não suportado) →
  `outcome: 'ignored'`.
- Evento já processado antes (idempotência) → `outcome: 'duplicate'`.
- Processado com sucesso → `outcome: 'processed'`.
- Qualquer exceção não tratada no meio do processamento → `outcome: 'error'`
  (`error_message` com a mensagem).

Isso não muda nenhum comportamento existente de verificação de assinatura,
idempotência ou processamento — é só uma chamada adicional em cada branch
que já existe hoje.

## 4. Tela (área de saúde, Owner)

Nova aba **"Webhooks"** em `/app/gestao/saude` (rota já gated `["Owner"]`
via `requireAuth`), ao lado das seções existentes (Provedores & Failover,
etc.):

- **Lista** (mais recente primeiro): timestamp, conta/engine, evento,
  badge de resultado (processado/ignorado/duplicado/erro/rejeitado),
  status HTTP, latência.
- **Filtros:** conta, resultado, período.
- **Clique na linha → painel de detalhe:** payload bruto em JSON
  formatado/navegável, mensagem de erro quando houver.
- Provider novo `webhookDeliveries` (mock-first + supabase), seguindo o
  Provider Pattern já estabelecido (`src/providers/data/`); leitura direta
  da tabela — a RLS já resolve o gate, sem precisar de RPC
  `SECURITY DEFINER` (diferente do modelo de "2 portões" de conversas, que
  não se aplica aqui — é uma tabela de administração, não uma tabela
  operacional escopada por vendedor).

## 5. Testes

- Engine puro de mapeamento de linha → item de UI (`rowToWebhookDelivery`
  ou equivalente), testado com Vitest.
- `logWebhookDelivery`: teste garantindo que uma falha no insert (client
  mockado retornando erro) não lança e não derruba o chamador.
- Snapshot/unit da lista e do painel de detalhe com os 5 valores de
  `outcome`.

## 6. Riscos e itens em aberto

1. Volume: contas muito ativas podem gerar bastante linha por dia; a
   rotação de 30 dias contém o crescimento, mas não há índice/paginação
   detalhados neste spec — ficam para o plano de implementação (índice em
   `created_at`/`account_id`, paginação na lista).
2. `event_type` é lido de campos com nomes diferentes por engine
   (`event`/`data.Info.Type`/etc.) — a extração exata fica para o plano,
   olhando cada parser existente.
