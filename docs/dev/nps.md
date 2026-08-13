# NPS — Pesquisa de Satisfação

> Implementação do PRD-148B, redesenhada em
> `docs/superpowers/specs/2026-08-12-nps-pesquisa-satisfacao-design.md`.
> Estado: **implementado, desligado**. Nada dispara até o dono ligar.

## O que é

NPS transacional: depois que uma conversa é resolvida, o cliente recebe pelo
WhatsApp uma pergunta única — *"De 0 a 10, qual a chance de você nos recomendar
para um colega ou amigo?"* — e responde numa página pública.

Classes derivadas do score, **nunca** armazenadas: **0–6 detrator · 7–8 neutro
· 9–10 promotor**. Score = `round(%promotores − %detratores)`.

## Onde o PRD-148B foi contrariado, e por quê

O PRD é de 10/06/2026 e pressupõe a Onda 8 (PRD-141/142/143), que nunca foi
implementada: `notification-dispatch` não existe e os canais de e-mail e
WhatsApp do bus de notificações são stubs que lançam `NotImplementedError`.

| PRD manda | Implementado | Motivo |
|---|---|---|
| Envio pelo dispatch 141, via HSM da Meta | Mensagem de texto na própria thread | O motor de produção é WAHA: sem janela de 24h, sem template |
| Canal e-mail como fallback | Fora do MVP | Resend inerte; só 22% dos clientes têm e-mail |
| Gatilho `order_delivered` ligado | Modelado e dormente | `orders` está vazia em produção |
| Gatilho de conversa resolvida desligado | **Gatilho primário** | 348 resolvidas em 30 dias — o único com volume |
| `customer_id NOT NULL` | Nullable | 293 das 348 pertencem a leads, não a clientes |
| Schema `crm.` | `public.` | O schema `crm` não existe neste projeto |

## Anti-fadiga e as duas travas

Avaliadas **antes** de criar qualquer pesquisa, em `nps-scheduler/eligibility.ts`:

1. `enabled` da loja;
2. **janela retroativa** (`max_backfill_days`, padrão 3) — conversas resolvidas
   há mais tempo nunca recebem pesquisa;
3. delay após `closed_at`;
4. **cooldown** por `phone_digits` (padrão 30 dias), atravessando lead e cliente;
5. sem pesquisa ativa para o telefone;
6. `contacts.opt_out` veta;
7. amostragem determinística (hash do `conversation_id`, nunca `random()`);
8. conversa sem mensagem humana não gera pesquisa;
9. **teto diário** por loja (padrão 50);
10. janela de envio (padrão 9h–20h **UTC**).

> **As travas 2 e 9 não estão no PRD.** Sem elas, ligar a chave dispararia para
> as 682 conversas resolvidas do histórico de uma vez — o incidente de disparo
> em massa do SDR, repetido.

⚠️ **Fuso:** `send_window_start_hour` / `send_window_end_hour` são comparados
com `getUTCHours()`. Frederico Westphalen é UTC−3, então **9h locais = 12 em
UTC**. A tela de configuração diz isso ao lado do campo.

## Honestidade estatística

`computeNps` devolve `state: 'collecting'` e `score: null` abaixo de
`min_responses_for_score` (padrão 5). Como o score vem nulo, nenhuma tela
consegue exibir um número que não existe — o card do Cockpit mostra
"Coletando (N/5)". Um "NPS 100" tirado de duas respostas é desinformação
executiva, e essa regra tem **uma** implementação, no engine.

## Fluxo

```
conversa marcada 'resolvida'
      ↓ (delay, cooldown, amostragem, travas)
nps-scheduler (pg_cron, de hora em hora, minuto 5)
      ↓ cria nps_surveys + token de 64 chars
envio pela thread de WhatsApp (mesmo pipeline do scheduled-send-worker)
      ↓ cliente toca o link
/pesquisa/<token>  →  nps-submit (público, rate limit 10/min/IP)
      ↓ nota ≤ 6
notificação de detrator ao Gestor e ao Owner (inApp + toast)
      ↓
/app/nps  ·  card #12 do Cockpit
```

## Como ligar em produção

Nesta ordem — cada passo exige OK explícito do dono:

1. **Aplicar as migrations** (manual, via MCP):
   `20260812140000_nps_schema` → `20260812140050_nps_survey_candidates`.
2. **Cadastrar o segredo `NPS_WORKER_SECRET`** (Configurações → Integrações &
   Chaves, resolução Vault-first).
3. **Deployar as Edge Functions** — **ambas** com `--no-verify-jwt`:
   ```
   npx supabase functions deploy nps-scheduler --project-ref njizaasajkdqptlxddqn --no-verify-jwt --use-api
   npx supabase functions deploy nps-submit    --project-ref njizaasajkdqptlxddqn --no-verify-jwt --use-api
   ```
   ⚠️ A flag é obrigatória nas duas, por motivos diferentes:
   - `nps-submit` é a landing anônima — não há sessão para verificar;
   - `nps-scheduler` é chamada pelo **pg_cron via pg_net**, que envia apenas
     `x-worker-secret` e **nenhum `Authorization`**. Com `verify_jwt=true` o
     gateway devolveria 401 antes de a função rodar, e o cron falharia de hora
     em hora em silêncio. A autenticação real é o `verifyWorkerSecret` dentro
     da função — mesmo padrão de `sdr-backstop-tick` e `scheduled-send-worker`,
     ambos `verify_jwt=false`.

   Conferir depois do deploy: `nps-scheduler` sem o segredo deve responder
   `{"error":"unauthorized"}` com **401 vindo da função**, não do gateway.
4. **Aplicar o cron** `20260812140100_nps_scheduler_cron` — só depois do deploy,
   para o primeiro tick encontrar o endpoint vivo.
5. **Revisar o texto da pesquisa** em `nps-scheduler/message.ts`.
6. **Ligar a chave** em Configurações → NPS, loja por loja.

Nada dispara antes do passo 6: `enabled` nasce `false` e nenhuma loja tem linha
de configuração.

### Como desligar rápido

Desmarcar "Pesquisa ativa" na tela de configuração. Para parar tudo de uma vez:
`select cron.unschedule('nps-scheduler');`

## Guia do Gestor — tratando um detrator

Uma nota ≤ 6 chega como notificação em segundos, não no fechamento do mês.

1. Abra a conversa pelo CTA da notificação ou pela seção **Detratores** em
   `/app/nps` — o histórico inteiro está lá.
2. Ligue ou responda no mesmo dia. O cliente acabou de dizer que não recomenda;
   a janela em que isso é recuperável é curta.
3. O comentário costuma nomear a causa (peça errada, demora, preço divergente).
   Trate a causa, não a nota.
4. Não peça para o cliente mudar a nota. A pesquisa é uma medida, não uma
   negociação — e a resposta é de uso único por desenho.

## Efeito colateral conhecido

O adaptador de envio compartilhado grava `author_type: 'seller'`, o que dispara
`sdr_escalation_first_response` e `sdr_pause_on_human_message`. Numa conversa
resolvida com escalação de SDR pendente, a pesquisa seria contada como primeira
resposta humana. O `scheduled-send-worker` se comporta assim desde sempre;
corrigir exige ensinar um tipo de autor "sistema" ao adaptador, o que mexe num
caminho de envio compartilhado e merece PR próprio.

Verificado e **não** problemático: enviar numa conversa resolvida não a reabre
(nenhum trigger de `messages` toca `conversations.status`) e o eco do provedor
não cria conversa nova (persist-before-send casa pelo `provider_message_id`).

## O que fica para a Onda 8

Canal de e-mail (com a grade 0–10 linkando `?score=N`), submissão do template
HSM à Meta e roteamento pelo `notification-dispatch`. O envio já está isolado
atrás de `INpsSurveySender` — trocar é implementar a interface, sem tocar no
scheduler.

## Arquivos

| Papel | Caminho |
|---|---|
| Schema e RLS | `supabase/migrations/20260812140000_nps_schema.sql` |
| Candidatos (RPC) | `supabase/migrations/20260812140050_nps_survey_candidates.sql` |
| Cron | `supabase/migrations/20260812140100_nps_scheduler_cron.sql` |
| Elegibilidade (puro) | `supabase/functions/nps-scheduler/eligibility.ts` |
| Envio | `supabase/functions/nps-scheduler/sender.ts` |
| Texto da pesquisa | `supabase/functions/nps-scheduler/message.ts` |
| Submissão pública | `supabase/functions/nps-submit/` |
| Cálculo (puro) | `src/features/nps/engine/` |
| Landing | `src/features/nps/pages/NpsSurveyPublicPage.tsx` |
| Página analítica | `src/features/nps/pages/NpsAnalyticsPage.tsx` |
| Configuração | `src/features/nps/pages/NpsSettingsPage.tsx` |
