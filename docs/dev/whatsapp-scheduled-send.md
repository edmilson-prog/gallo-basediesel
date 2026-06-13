# Agendamento de mensagens — execução em produção (PRD-027 RNF-007)

Como uma mensagem agendada (o split-button **"Enviar ▼"** do composer: _Hoje 18:00 / Amanhã 09:00 / Segunda 08:00 / Data e hora_) sai de verdade na hora marcada — **sem depender do navegador aberto**.

## Antes vs. depois

A Fase 1 entregou a fila (`scheduled_sends`) e um **executor client-side** (`useScheduledSendRunner`) que fazia polling de 10 s **só enquanto o navegador estava aberto e aquela conversa montada**. Fechou a aba → nada saía. A persistência sempre foi real; faltava o disparador server-side.

Agora, em `supabase`, um **worker server-side** é a autoridade do disparo. O runner client-side passou a ser **mock-only** (a fonte mock não tem servidor para disparar) — evitando duplo envio.

## Arquitetura

```
pg_cron (*/1 min)
   └─ net.http_post → POST /functions/v1/scheduled-send-worker   (header x-worker-secret)
        1. valida o segredo (Vault: SCHEDULED_WORKER_SECRET)
        2. claim_due_scheduled_sends(50)   ← UPDATE ... FOR UPDATE SKIP LOCKED
        3. para cada linha vencida:
             buildScheduledSendRequest(payload)  → { kind:"text", text }
             processSendRequest(sender=sistema)  ← MESMO pipeline do envio manual
                 (permissão · janela 24h · failover · persist-before-send · status · auditoria)
             update scheduled_sends.status = 'sent' | 'failed'
```

Nada de envio é duplicado: o worker reusa `processSendRequest` (núcleo `_shared/whatsapp/send/core.ts`) pelo adapter compartilhado `_shared/whatsappSendAdapter.ts` — o mesmo que o `whatsapp-send` usa.

## Componentes

| Peça | Arquivo | Papel |
|---|---|---|
| Coluna de claim | migration `…_scheduled_sends_dispatch_claim.sql` | `scheduled_sends.dispatch_started_at timestamptz` — carimbo de reserva, **sem** tocar no enum de status |
| RPC de claim | mesma migration | `claim_due_scheduled_sends(p_limit)` — reserva atômica (`FOR UPDATE SKIP LOCKED`), service_role-only |
| Núcleo puro | `src/providers/whatsapp/scheduled/core.ts` (+ teste) → espelhado em `_shared/` | `buildScheduledSendRequest` (snippet→texto) + `buildSystemSender` |
| Adapter compartilhado | `_shared/whatsappSendAdapter.ts` | `makeSendDb`/`makeEngineDeps` — extraídos do `whatsapp-send` para reuso |
| Worker | `supabase/functions/scheduled-send-worker/index.ts` | claim → dispatch → mark; público + segredo |
| Gatilho | migration `…_scheduled_send_cron_trigger.sql` | habilita `pg_net`, gera o segredo no Vault, agenda o cron `scheduled-send-tick` */1 min |
| Gate client | `src/features/quick-send/hooks/useScheduledSendRunner.ts` | no-op em `supabase` (servidor é autoridade); mock mantém o poller |
| Atualização da lista | `src/features/quick-send/hooks/useConversationScheduled.ts` | poll brando de 30 s em `supabase` enquanto houver pendentes |

## Decisões e limitações

- **Só texto (`snippet`).** É o único tipo que o composer agenda hoje. Asset/combo/produto dependem da biblioteca + checagem de sensibilidade que vivem no frontend; o worker os rejeita com `NOT_SUPPORTED` (a linha falha com motivo, nunca é descartada em silêncio).
- **Janela de 24h.** Um agendamento de texto para uma conta **Meta** fora da janela de 24h falha (`TEMPLATE_REQUIRED`) — comportamento correto: não há como pedir um template HSM no disparo automático. Contas **Evolution** não têm essa restrição. A falha aparece como `failed` na barra "Agendados".
- **Conversa encerrada / número inválido.** Tratados pelo próprio `processSendRequest` → viram `failed` com motivo. Não há override de número inválido para o sistema.
- **Identidade de sistema.** O sender é `{ sellerId: null, role: "owner", storeId }`: passa a permissão como staff (o worker é confiável, independentemente de quem a conversa está atribuída) e grava `author_id` nulo, igual a uma mensagem enviada por Owner (sem risco de FK).
- **Entrega ao-menos-uma-vez.** Um crash *depois* do disparo no provedor e *antes* de marcar a linha deixa-a `pending`; ela só é reivindicável de novo após a janela de 5 min do claim, então um reenvio acidental é raro e limitado.

## Segurança

- O worker é **público** (`verify_jwt` off) — o header `x-worker-secret` é o único portão. Comparação em tempo constante.
- O segredo `SCHEDULED_WORKER_SECRET` é **gerado no servidor** dentro do Vault (nunca em git/console) e lido por ambos os lados a partir do Vault: o cron via `integration_secret_get`, o worker via o resolver `_shared/secrets.ts` (Vault-first, fallback env). Rotacionar pela tela **Integrações & Chaves** vale para os dois sem redeploy.
- RLS: o worker usa `service_role` (exento de RLS) para varrer todas as lojas; as policies store-scoped da `scheduled_sends` seguem protegendo as sessões de navegador. **Nenhuma policy foi aberta.**

## Operação

- **Ver o cron:** `select * from cron.job where jobname = 'scheduled-send-tick';`
- **Ver execuções:** `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname='scheduled-send-tick') order by start_time desc limit 20;`
- **Pausar o disparo:** `select cron.unschedule('scheduled-send-tick');` (os agendamentos ficam `pending` até religar).
- **Rotacionar o segredo:** atualizar `SCHEDULED_WORKER_SECRET` em Integrações & Chaves (ou `vault.update_secret`). Cron e worker passam a usar o novo valor no próximo tick.
- **Logs do worker:** `integration_logs` (envios) + logs da função (`scheduled batch processed`).

## Rollback

1. `select cron.unschedule('scheduled-send-tick');` — para o disparo server-side.
2. Reverter o gate em `useScheduledSendRunner.ts` (remover o `return` em supabase) devolve o disparo ao navegador.

A coluna `dispatch_started_at`, a RPC e o worker podem permanecer sem efeito (inertes) sem o cron.
