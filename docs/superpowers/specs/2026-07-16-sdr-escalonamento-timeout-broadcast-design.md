# SDR — Escalonamento real: timeout + broadcast urgente — Design (Parte D)

> **Status:** design em revisão. Depende da Parte B (PR #301, mergeada — infra real do piloto) e complementa a Parte C (`docs/superpowers/specs/2026-07-16-sdr-painel-consolidacao-instancia-design.md`), que reserva o bloco "Escalonamento" em `/app/sdr` como placeholder até esta entrega existir. Execução recomendada **depois** da Parte C (a UI onde isso vai aparecer já existe estabilizada).

**Objetivo:** hoje o handoff do SDR pra um humano é "dispara e esquece" — escolhe um vendedor (ou nenhum) e para. Se o vendedor escolhido não responde, ou se ninguém estava disponível no momento, a conversa fica presa sem que ninguém seja avisado. Esta entrega fecha esse ciclo: monitora o tempo de resposta, alerta outros vendedores quando necessário, e corrige o estado da conversa nos dois cenários.

---

## Contexto — dois gaps reais, achados nesta sessão

**Gap 1 — vendedor atribuído não responde.** O painel legado `/app/sdr` já tinha essa ideia modelada (PRD-023: timeout urgente/normal + broadcast), mas 100% client-side — um hook (`useUrgentBroadcastTimer`) faz polling a cada 4s e monta um painel flutuante local, sem nenhuma trava de servidor (`useUrgentBroadcastQueue`'s `claim()` é um patch otimista direto no navegador — dois vendedores clicando ao mesmo tempo colidem sem detecção). Não serve para produção como está.

**Gap 2 — ninguém disponível no momento do handoff.** Achado ao investigar o `chooseHumanSeller` real (mirrorado de `src/features/sdr-escalation/engine/choose-seller.ts`): a função **já retorna `selectedSellerId: null`** quando não há vendedor elegível, e seu próprio comentário original diz *"the caller is responsible for putting the escalation in the queue + scheduling the timeout notification"* — uma promessa nunca cumprida. Hoje, `sdr-respond/index.ts` (passo do handoff) grava a escalação com `status: 'pending'`, `assigned_seller_id: null`, mas **não** desliga `conversations.is_sdr_active` (esse update só roda dentro do `if (selection.selectedSellerId)`). Resultado: a conversa fica com o SDR "ativo" numa escalação órfã, sem ninguém monitorando.

Por decisão desta sessão, **os dois gaps são fechados pelo mesmo mecanismo** — o tick novo trata `status='pending'` (sem esperar timeout, já que não há ninguém pra esperar responder) e `status='assigned'` vencido pelo mesmo caminho de notificação.

## Estado real da tabela (verificado em produção)

`sdr_escalations` já tem todas as colunas necessárias, nenhuma nunca escrita ainda:

```
id uuid, session_id text, conversation_id uuid, customer_id uuid, lead_id uuid,
store_id uuid, reason text, reason_details text, mode text, context_summary jsonb,
assigned_seller_id uuid, assigned_at timestamptz,
first_human_response_at timestamptz,       -- nunca escrita: sinal "ainda esperando"
status text,                                -- 'pending' | 'assigned' | 'answered' | 'abandoned'
specialty_matched boolean,
urgent_broadcast_at timestamptz,            -- nunca escrita
urgent_broadcast_claimed_by_seller_id uuid, -- nunca escrita
urgent_broadcast_claimed_at timestamptz,    -- nunca escrita
created_at timestamptz
```

Nenhuma migration de coluna nova precisa nesta tabela — só os dois novos campos de configuração (abaixo) e o uso real das colunas que já existem.

---

## Componentes

### 1. Migration — thresholds de timeout

Duas colunas novas em `sdr_settings` (mesma tabela operacional per-loja da Parte B/C):

```sql
alter table public.sdr_settings
  add column escalation_timeout_urgent_minutes integer not null default 5,
  add column escalation_timeout_normal_minutes integer not null default 30;
```

Valores default reaproveitam os mesmos números que já apareciam no painel legado (5min/30min).

### 2. Trigger — detectar a primeira resposta humana

Novo trigger em `messages`, mesmo ponto de gatilho e mesma filosofia do `sdr_pause_on_human_message` (Parte A): **qualquer** vendedor respondendo na conversa conta como "está sendo atendida", não só o especificamente atribuído — evita depender de casar `author_id` (text) com `assigned_seller_id` (uuid). Um `::uuid` que falhasse ali derrubaria o INSERT da mensagem inteiro (trigger `AFTER INSERT` bloqueante) — risco real demais pra um sinal que não precisa dessa precisão.

```sql
create or replace function public.sdr_escalation_first_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'out' and new.author_type = 'seller' then
    update public.sdr_escalations
    set first_human_response_at = now(),
        status = 'answered'
    where conversation_id = new.conversation_id
      and status = 'assigned'
      and first_human_response_at is null;
  end if;
  return new;
end;
$$;

create trigger sdr_escalation_first_response_trigger
  after insert on public.messages
  for each row
  when (new.direction = 'out' and new.author_type = 'seller')
  execute function public.sdr_escalation_first_response();
```

Escopo cirúrgico: só toca linhas `status='assigned'` ainda sem resposta, da própria conversa. Não interfere com o trigger da Parte A (gatilhos independentes na mesma tabela/evento, sem conflito de coluna — ambos podem coexistir no mesmo INSERT).

### 3. Tick novo — `sdr-escalation-timeout-tick`

Mesma forma de `sdr-backstop-tick` (worker-secret, `pg_cron` a cada 1 minuto) e do `reconcile_derived_notifications()` já em produção (mesmo padrão idempotente de tick+reconciliação). Roda em duas frentes:

**Frente A — pendentes sem ninguém atribuído** (Gap 2): `sdr_escalations where status='pending' and urgent_broadcast_at is null` → dispara o broadcast **imediatamente**, sem esperar timeout algum (não há vendedor esperando responder). Corrige também o `conversations.is_sdr_active` órfão: `update conversations set is_sdr_active=false where id = escalation.conversation_id and is_sdr_active=true` — só agora a conversa efetivamente sai do controle do SDR.

**Frente B — atribuídas sem resposta a tempo** (Gap 1): `sdr_escalations where status='assigned' and first_human_response_at is null and urgent_broadcast_at is null and assigned_at < now() - (threshold)`, onde `threshold` vem de `sdr_settings.escalation_timeout_urgent_minutes` ou `_normal_minutes` conforme `sdr_escalations.mode`.

Ambas as frentes convergem no mesmo passo final: `urgent_broadcast_at = now()` + inserir notificações.

### 4. Notificações — elegibilidade e entrega

- **Elegibilidade**: qualquer vendedor com acesso à instância WhatsApp daquela conversa (mesma regra dos "2 portões" que já governa quem vê a conversa — `can_access_conversation`), excluindo o vendedor originalmente atribuído (se houver).
- **Entrega**: insert direto em `public.notifications` (sem helper compartilhado — mesmo padrão usado por `whatsapp_health_tick()` e `notify_conversation_participant_added()`, cada caller monta sua própria linha). `type`/`category` novos (`sdr_escalation_urgent`), `entity_ref` apontando pra conversa, `dedupe_key` incluindo o `escalation_id` (evita duplicar se o tick rodar de novo antes de alguém reagir).
- **UI**: painel flutuante dedicado (não a central de notificações genérica) — versão real do `UrgentBroadcastClaim.tsx` que já existia no mock, agora orientado por Realtime na tabela `notifications` (reaproveita a infra Realtime já habilitada em outras telas) em vez de polling client-side. Botão único "Atender agora".

### 5. RPC atômica — reivindicar a escalação

```sql
create or replace function public.claim_sdr_escalation(p_escalation_id uuid)
returns public.sdr_escalations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_id uuid := (select id from public.sellers where user_id = auth.uid());
  v_row public.sdr_escalations;
begin
  update public.sdr_escalations
  set assigned_seller_id = v_seller_id,
      assigned_at = now(),
      first_human_response_at = null,
      status = 'assigned',
      urgent_broadcast_claimed_by_seller_id = v_seller_id,
      urgent_broadcast_claimed_at = now()
  where id = p_escalation_id
    and urgent_broadcast_claimed_by_seller_id is null
    and status in ('pending', 'assigned')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'escalation_already_claimed';
  end if;

  update public.conversations
  set assigned_seller_id = v_seller_id
  where id = v_row.conversation_id;

  return v_row;
end;
$$;
```

`UPDATE ... WHERE urgent_broadcast_claimed_by_seller_id IS NULL RETURNING` é a trava atômica — mesma técnica de handoff já usada em outras RPCs do projeto (transferência de conversa entre vendedores). `first_human_response_at` reseta para `null`: o relógio de resposta recomeça para o novo vendedor, mesmo tratamento nas duas frentes (pending e assigned).

**Erro `escalation_already_claimed`**: o segundo vendedor a clicar recebe esse erro — UI trata como "outro vendedor já assumiu" e fecha o painel flutuante sem reassinalar nada.

---

## Testes

- Sem trigger/tick/RPC cobertos por Vitest (SQL puro + Deno, mesma ressalva de sempre neste projeto) — validação por revisão + smoke manual pós-deploy.
- Se houver lógica de elegibilidade extraída para TypeScript (ex. "quais vendedores são elegíveis pro broadcast desta conversa", caso isso vire um passo client-side antes de uma RPC), essa parte ganha teste Vitest.
- Smoke sugerido pro dono: (1) desligar todos os vendedores de uma instância piloto, forçar um handoff → checar que a escalação "pending" dispara broadcast imediato e `is_sdr_active` volta a `false`; (2) atribuir a um vendedor e não responder → checar que o broadcast dispara após o timeout configurado; (3) dois vendedores clicando "Atender agora" ao mesmo tempo → só um assume.

## Rollout

Sem kill-switch dedicado — o mecanismo só age sobre escalações que **já existem** (`sdr_escalations` só ganha linhas quando o piloto está ativo em alguma loja/instância, que hoje é zero). Enquanto nenhuma loja estiver com o piloto ligado (Parte C), este tick roda e não encontra nada pra fazer — comportamento real só começa a valer junto com a primeira ativação de loja piloto.

## Não-objetivos (fora desta entrega)

- Fila de rodízio como fonte de elegibilidade (decisão desta sessão: usar a regra de acesso à instância, não o rodízio PRD-213).
- Qualquer mudança na lógica de escolha do primeiro vendedor (`chooseHumanSeller`) — esta entrega só cobre o que acontece **depois** que ele decide.
- Notificação por WhatsApp/push externo — só notificação in-app (tabela `notifications` + painel flutuante).
