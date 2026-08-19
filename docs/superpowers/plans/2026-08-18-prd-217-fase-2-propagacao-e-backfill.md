# PRD-217 `Provenance` — Fase 2: Propagação e backfill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** carimbar `customer_id` nos toques de anúncio quando o lead vira cliente (RN-05) e reconstruir o histórico de toques que já aconteceu, de duas fontes, sem duplicar nada.

**Architecture:** uma migration com três objetos — `convert_lead_mark` recriada com a RN-05 e duas funções `SECURITY DEFINER` de **leitura** que fazem a parte cara dentro do banco (`ad_backfill_delivery_window`, `ad_backfill_orphan_conversations`). Um script `scripts/backfill-ad-touches.ts` com service role varre `webhook_deliveries` **janela a janela**, converte o nó `externalAdReply` guardado usando a MESMA função de produção que o webhook usa (`extractWahaAdReferral`, reaproveitada por um engine puro novo em `src/features/ads/engine/`), e grava por `record_ad_touch` — que já é idempotente pelos índices únicos da Fase 1.

**Tech Stack:** PostgreSQL/Supabase (plpgsql + sql `SECURITY DEFINER`), TypeScript, bun, Vitest, `@supabase/supabase-js` com service role.

**Spec:** `docs/prds/PRD-217-historico-origem-anuncio.md` (seção **Backfill** e **Fase 2**; regras RN-01, RN-04, RN-05, RN-06)

---

## Global Constraints

Valem para **todas** as tasks.

- **Migration via MCP tem de ser exportada para `supabase/migrations/` no mesmo PR.** Mergear o PR **não** aplica a migration: a aplicação em produção é manual e exige OK explícito do dono.
- **O MCP carimba a própria versão** ao aplicar (ignora o timestamp do nome do arquivo). Depois de aplicar, renomear o arquivo para casar com a versão carimbada. Lição da Fase 1: arquivo `20260818120000_…` virou `20260818230121_ad_provenance.sql`.
- **Nada de deploy de Edge Function nesta fase.** Nenhum arquivo sob `src/providers/whatsapp/` ou `supabase/functions/` é alterado — de propósito (ver Decisão D1). Se alguma task se vir tentada a editar o parser WAHA, **pare**: a decisão foi tomada.
- **Nunca commitar dado de cliente.** Fixtures de teste levam só os campos do anúncio (que é conteúdo publicitário público da própria empresa) — nunca telefone, nome, JID ou corpo de mensagem do contato.
- **Segredo nenhum no código.** `VITE_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` vêm de `.env.local` (já copiado para esta worktree, gitignored).
- **Trava de segurança obrigatória em script que escreve em produção**: sem `AD_BACKFILL_DRY_RUN=yes` ou `AD_BACKFILL_CONFIRM_WRITE=yes` o script aborta na primeira linha.
- **TypeScript `strict`.** Interfaces de domínio prefixadas com `I`. Sem `any`.
- **Identificadores em inglês; texto de console/relatório em português do Brasil com acentuação correta.** **Comentários seguem o arquivo:** em `src/` a convenção da casa é inglês; em `scripts/` é português (precedente: os 13 scripts que já existem). Corrigido em 19/08 — a redação anterior mandava comentar `scripts/backfill-ad-touches.ts` em inglês, contra o precedente do próprio diretório.
- Gate local da casa: `bun run test` + `bun run build`. `bunx tsc --noEmit` tem baseline pré-existente (~376 erros) — avaliar **só por delta** nos arquivos criados nesta branch.
- Nada de `git stash`. Commits atômicos, Conventional Commits em inglês.

---

## Fatos de produção medidos nesta sessão (2026-08-18)

Esses números são a base do plano e servem de referência para o gate. Não precisam ser re-medidos durante a implementação.

| Fato | Valor medido |
|---|---|
| Toques já existentes (captura ao vivo da Fase 1) | **6** em `ad_touches`, **3** em `ads`, todos `origin='webhook'` |
| Conversas com `ad_referral` | **975** |
| Conversas com `ad_referral` **sem nenhum toque** | **969** ← tem de virar **0** no gate |
| `ad_referral` sem `sourceId` | **0** (chaves exatas: `body, headline, mediaType, mediaUrl, sourceId, sourceType, sourceUrl` — já é o formato `IAdReferral`) |
| Retenção de `webhook_deliveries` | 19/07/2026 → hoje, **127.397** linhas |
| Custo de varredura de 1 dia (3 caminhos + `event_type='message'`) | Index Scan em `webhook_deliveries_created_at_idx`, 6.702 linhas filtradas, 68 casadas, **1.471 ms** |
| Taxa de casamento `payload.id` → `messages.provider_message_id` | **100 %** (246/246 numa janela de 8 dias) |
| `messages_provider_message_id_key` | índice **UNIQUE** — o join é lookup, não seq scan |
| Caminhos do referral efetivamente vistos | `extendedTextMessage` **277**, `imageMessage` **2**, `videoMessage` 0 → a coalesce de 3 caminhos **não é teórica** |
| `mediaType` real | `2` (numérico) → normaliza para `video`; `sourceType` = `"ad"` |
| Tamanho do nó `externalAdReply` | 5,4 KB com `thumbnail` (base64) / **2,6 KB sem** → a RPC devolve sem thumbnail |
| `ad_touches` | owner `postgres`, `relforcerowsecurity = false` |
| `convert_lead_mark` | owner `postgres`, `prosecdef = true` |

**Por que a RN-05 é legal apesar da policy "escrita só service_role":** `ad_touches` não tem `force row level security` e pertence a `postgres`; `convert_lead_mark` é `SECURITY DEFINER` do mesmo dono, então o `update` dentro dela não passa por RLS. Verificado no catálogo, não presumido.

**Tipo:** `ad_touches.lead_id` é `uuid` e `leads.id` é `uuid` — o `update … where lead_id = p_lead_id` **não** precisa de cast. (A armadilha da Fase 1 era `conversations.lead_id`, que é `text`; essa coluna não aparece aqui.)

---

## Decisões tomadas antes da execução

**D1 — Nada sob `src/providers/whatsapp/` é tocado.** A tentação natural era extrair o mapeamento de `extractWahaAdReferral` para uma função nomeada e reusá-la. Mas `supabase/functions/waha-webhook/index.ts` importa `../_shared/whatsapp/waha/parser.ts`; mexer no parser obrigaria a rodar `scripts/sync-whatsapp-shared.ts` e colocaria em cima da mesa um redeploy da Edge Function que carrega **100 % do tráfego de anúncio** — risco de produção por uma mudança puramente cosmética. Em vez disso, o engine novo **chama** `extractWahaAdReferral` já exportada, montando o payload mínimo que ela espera. Zero drift no mapeamento, zero deploy, zero espelho.

**D2 — O engine vive em `src/features/ads/engine/`.** É onde as Fases 3 e 4 vão morar (provider `adTouches`, tela `app.gestao.anuncios`), é a convenção da casa para lógica pura testada, e fica **fora** do espelho do WhatsApp. Precedente de script importando engine: `scripts/funnel/migrate-orphans-to-leads.ts` importa `../../src/features/leads/engine/orphanClassification`.

**D3 — Duas RPCs de leitura, não SQL solto no script.** PostgREST não expressa coalesce de caminho jsonb nem `not exists`. Puxar 127 mil payloads crus para o cliente é inviável. As RPCs ficam permanentes (comentadas como ferramenta de backfill), com `grant execute` só para `service_role`, espelhando `record_ad_touch`.

**D4 — Escrita sequencial, sem pool de concorrência.** `record_ad_touch` faz `insert … on conflict do update` em `ads`, e só existem 5 `source_id` distintos: paralelizar concentraria contenção de lock na mesma linha. ~1.900 chamadas × ~60 ms ≈ 2 min — tempo aceitável para um script que roda uma vez.

**D5 — A passada aproximada não filtra por data.** A regra é "conversa com `ad_referral` e **sem nenhum toque**", exatamente como o PRD manda. Filtrar por `created_at < 19/07` deixaria de fora conversas dentro da janela cuja mensagem não casou, e o gate ("nenhuma conversa com `ad_referral` sem toque") ficaria impossível de fechar. Como a passada precisa roda antes, uma conversa antiga que recebeu clique novo já terá o toque preciso e será pulada — que é o comportamento certo: sem isso, o anúncio **mais recente** seria carimbado com a data **mais antiga**.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<ts>_ad_provenance_phase2.sql` (criar) | `convert_lead_mark` + RN-05; `ad_backfill_delivery_window`; `ad_backfill_orphan_conversations` |
| `src/features/ads/engine/storedAdPayload.ts` (criar) | função pura: nó `externalAdReply` guardado → `IAdReferral`, delegando ao parser de produção |
| `src/features/ads/engine/storedAdPayload.test.ts` (criar) | testes com fixtures reais de `webhook_deliveries` |
| `src/features/ads/index.ts` (criar) | barrel da feature |
| `scripts/backfill-ad-touches.ts` (criar) | varredura em duas passadas, idempotente, com trava de segurança e relatório |

---

## Task 1: Migration — RN-05 e as duas RPCs de leitura

**Files:**
- Create: `supabase/migrations/20260819000000_ad_provenance_phase2.sql`

**Interfaces:**
- Consumes: `public.ad_touches`, `public.ads`, `public.record_ad_touch` (Fase 1, migration `20260818230121_ad_provenance.sql`, já aplicada em produção)
- Produces:
  - `public.convert_lead_mark(p_lead_id uuid, p_customer_id uuid, p_stage jsonb) returns void` — comportamento anterior **idêntico**, mais o `update` da RN-05
  - `public.ad_backfill_delivery_window(p_from timestamptz, p_to timestamptz) returns table (message_id uuid, conversation_id uuid, occurred_at timestamptz, external_ad_reply jsonb)`
  - `public.ad_backfill_orphan_conversations() returns table (conversation_id uuid, occurred_at timestamptz, referral jsonb)`

> ⚠️ O corpo de `convert_lead_mark` abaixo foi extraído **verbatim** da definição em produção (`pg_get_functiondef`) e só ganhou o bloco final. Não reescreva, não "melhore", não reordene as guardas: elas são o controle de acesso da conversão de lead.

- [ ] **Step 1: Criar o arquivo da migration**

Criar `supabase/migrations/20260819000000_ad_provenance_phase2.sql` com exatamente este conteúdo:

```sql
-- PRD-217 (Provenance) Fase 2 — propagação do customer_id e leitura do backfill.
--
-- Três objetos:
--   1. convert_lead_mark recriada com a RN-05 (carimba customer_id nos toques);
--   2. ad_backfill_delivery_window — fonte PRECISA do backfill;
--   3. ad_backfill_orphan_conversations — fonte APROXIMADA do backfill.
--
-- As duas últimas só LEEM. A escrita continua sendo exclusividade de
-- record_ad_touch (Fase 1), que é idempotente pelos índices únicos.

-- ── RN-05: propagação na conversão ─────────────────────────────────────────
-- Corpo idêntico ao que roda em produção (pg_get_functiondef, 2026-08-18) mais
-- o update final. As guardas de loja e autorização são o controle de acesso da
-- conversão: não alterar.
--
-- O update passa por cima da RLS de ad_touches de propósito e por construção:
-- a tabela não tem `force row level security` e pertence a postgres, e esta
-- função é SECURITY DEFINER do mesmo dono. Verificado no catálogo.
create or replace function public.convert_lead_mark(
  p_lead_id     uuid,
  p_customer_id uuid,
  p_stage       jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_seller uuid;
  v_store  uuid;
begin
  select seller_id, store_id into v_seller, v_store from leads where id = p_lead_id;
  if not found then
    raise exception 'lead % not found', p_lead_id using errcode = 'P0002';
  end if;

  -- Same-store guard (mirror of the RLS store predicate).
  if v_store is distinct from current_store_id() then
    raise exception 'cross-store conversion blocked' using errcode = '42501';
  end if;

  -- Authorization: staff, the lead owner, or the assigned attendant of a
  -- conversation anchored on this lead.
  if not (is_staff() or v_seller = current_seller_id() or seller_handles_lead(p_lead_id)) then
    raise exception 'not authorized to convert lead %', p_lead_id using errcode = '42501';
  end if;

  -- Target customer must exist in the same store (guards "link" mode and a
  -- freshly-inserted customer alike).
  if not exists (select 1 from customers c where c.id = p_customer_id and c.store_id = v_store) then
    raise exception 'customer % not found in store', p_customer_id using errcode = 'P0002';
  end if;

  update leads
     set stage = p_stage, converted_to_customer_id = p_customer_id, updated_at = now()
   where id = p_lead_id;

  -- PRD-217 RN-05: the ad touches collected while this was still a lead now
  -- belong to the customer. `customer_id is null` is not an optimization: a
  -- touch already stamped must never be rewritten, so a second conversion
  -- pointing the same lead at a different customer cannot rewrite history.
  -- ad_touches.lead_id and leads.id are both uuid — no cast needed here (the
  -- text column is conversations.lead_id, which this statement never touches).
  update public.ad_touches
     set customer_id = p_customer_id
   where lead_id = p_lead_id
     and customer_id is null;
end;
$function$;

-- ── Backfill, fonte precisa ────────────────────────────────────────────────
-- webhook_deliveries guarda o payload cru do WAHA desde 19/07/2026. Cada nó
-- externalAdReply carrega uma thumbnail base64 (~2,8 KB) que ninguém lê: a
-- função a descarta antes de devolver.
--
-- Por que existe em vez de a query viver no script: PostgREST não expressa
-- coalesce de caminho jsonb, e trazer 127 mil payloads crus para o cliente é
-- inviável. Por que é por janela: varrer a tabela inteira de uma vez estoura o
-- statement_timeout (medido — 1 dia custa ~1,5 s; o script janela por dia).
--
-- Os três caminhos NÃO são hipotéticos: extendedTextMessage (277) e
-- imageMessage (2) foram ambos observados em produção numa amostra de 8 dias.
create or replace function public.ad_backfill_delivery_window(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  message_id        uuid,
  conversation_id   uuid,
  occurred_at       timestamptz,
  external_ad_reply jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with hits as (
    select distinct on (wd.request_payload #>> '{payload,id}')
      wd.request_payload #>> '{payload,id}' as provider_message_id,
      -- The provider timestamp is the click's real moment. It has never been
      -- absent in the observed sample, but a null here would violate
      -- ad_touches.occurred_at NOT NULL, so fall back to the delivery time.
      coalesce(
        to_timestamp(nullif(wd.request_payload #>> '{payload,timestamp}', '')::bigint),
        wd.created_at
      ) as occurred_at,
      coalesce(
        wd.request_payload #> '{payload,_data,Message,extendedTextMessage,contextInfo,externalAdReply}',
        wd.request_payload #> '{payload,_data,Message,imageMessage,contextInfo,externalAdReply}',
        wd.request_payload #> '{payload,_data,Message,videoMessage,contextInfo,externalAdReply}'
      ) as ad
    from public.webhook_deliveries wd
    where wd.created_at >= p_from
      and wd.created_at <  p_to
      -- 'message' is the inbound-only event. 'message.any' repeats it with the
      -- outbound echo and 'message.ack' is noise: filtering here cuts the scan
      -- ~3x and removes the double delivery before the distinct on.
      and wd.event_type = 'message'
      and coalesce(
        wd.request_payload #> '{payload,_data,Message,extendedTextMessage,contextInfo,externalAdReply}',
        wd.request_payload #> '{payload,_data,Message,imageMessage,contextInfo,externalAdReply}',
        wd.request_payload #> '{payload,_data,Message,videoMessage,contextInfo,externalAdReply}'
      ) is not null
    -- The webhook redelivers the same event ~1.8x: keep the earliest.
    order by wd.request_payload #>> '{payload,id}', wd.created_at
  )
  select m.id, m.conversation_id, h.occurred_at, h.ad - 'thumbnail'
    from hits h
    join public.messages m on m.provider_message_id = h.provider_message_id;
$$;

comment on function public.ad_backfill_delivery_window(timestamptz, timestamptz) is
  'PRD-217 Fase 2: backfill tooling. Reads one short window of webhook_deliveries and returns the ad referral node of each distinct inbound message that carried one, already joined to messages. Read-only, service_role only.';

revoke all on function public.ad_backfill_delivery_window(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ad_backfill_delivery_window(timestamptz, timestamptz)
  to service_role;

-- ── Backfill, fonte aproximada ─────────────────────────────────────────────
-- conversations.ad_referral guarda apenas o ÚLTIMO anúncio (o webhook
-- sobrescreve), e a data do clique se perdeu: reconstruímos um toque por
-- conversa datado pela criação da conversa. Daí origin='backfill_conversation'
-- na chamada e o aviso da RN-06 em qualquer série temporal.
--
-- "sem nenhum toque" é a guarda que impede datar o anúncio mais RECENTE com a
-- data mais ANTIGA numa conversa que já recebeu um toque preciso.
--
-- Sem limite de propósito: o conjunto é limitado pelas conversas com
-- ad_referral (975 em 2026-08-18) e encolhe a cada execução.
create or replace function public.ad_backfill_orphan_conversations()
returns table (
  conversation_id uuid,
  occurred_at     timestamptz,
  referral        jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.created_at, c.ad_referral
    from public.conversations c
   where c.ad_referral is not null
     and not exists (
       select 1 from public.ad_touches t where t.conversation_id = c.id
     )
   order by c.created_at;
$$;

comment on function public.ad_backfill_orphan_conversations() is
  'PRD-217 Fase 2: backfill tooling. Conversations that carry an ad_referral but no ad_touch yet — the approximate source, dated by the conversation. Read-only, service_role only.';

revoke all on function public.ad_backfill_orphan_conversations()
  from public, anon, authenticated;
grant execute on function public.ad_backfill_orphan_conversations()
  to service_role;
```

- [ ] **Step 2: Conferir que o arquivo está sintaticamente coerente**

Não há linter de SQL no repo. A conferência é por leitura, contra esta lista:

- três `create or replace function`, cada uma fechada com `$function$;` ou `$$;`
- `convert_lead_mark` tem exatamente **quatro** `raise exception` e **dois** `update`
- as duas funções novas têm `revoke all … from public, anon, authenticated` e `grant execute … to service_role`
- os três caminhos jsonb aparecem **duas vezes** em `ad_backfill_delivery_window` (no `select` e no `where`) e são idênticos entre si

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260819000000_ad_provenance_phase2.sql
git commit -m "feat(ads): propagate customer_id on lead conversion and add backfill read RPCs"
```

- [ ] **Step 4 (GATED — só com OK explícito do dono): aplicar a migration**

Aplicar via MCP Supabase `apply_migration`, name `ad_provenance_phase2`, com o conteúdo do arquivo. Depois:

- ler a versão que o MCP carimbou (`list_migrations`) e **renomear o arquivo** para casar, com commit separado
- conferir os três objetos:

```sql
select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('convert_lead_mark','ad_backfill_delivery_window','ad_backfill_orphan_conversations');
```

Esperado: as três com `owner = postgres` e `prosecdef = true`; as duas novas com `service_role_exec = true` e `authenticated_exec = false`; `convert_lead_mark` mantém os grants que já tinha (não mexemos neles).

- conferir que a RN-05 entrou no corpo:

```sql
select position('ad_touches' in pg_get_functiondef(p.oid)) > 0 as has_rn05
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'convert_lead_mark';
```

- conferir que a janela devolve linha (dia com tráfego conhecido):

```sql
select count(*) as rows, count(distinct message_id) as msgs
from public.ad_backfill_delivery_window('2026-08-17'::timestamptz, '2026-08-18'::timestamptz);
```

Esperado: algumas dezenas de linhas, com `rows = msgs` (uma linha por mensagem, sem duplicata). Duas medições no mesmo dia deram 38 e 36 — o número exato deriva com a retenção; o que o gate confere é a igualdade das duas contagens.

- conferir a fonte aproximada:

```sql
select count(*) from public.ad_backfill_orphan_conversations();
```

Esperado: **969** antes de qualquer backfill.

---

## Task 2: Engine puro do payload guardado (TDD)

**Files:**
- Create: `src/features/ads/engine/storedAdPayload.ts`
- Create: `src/features/ads/engine/storedAdPayload.test.ts`
- Create: `src/features/ads/index.ts`

**Interfaces:**
- Consumes: `extractWahaAdReferral` e `IWahaMessagePayload` de `@/providers/whatsapp/waha/parser`; `IAdReferral` de `@/providers/whatsapp/types`
- Produces: `adReferralFromStoredNode(node: unknown): IAdReferral | undefined` — consumida pela Task 3

> ⚠️ **Não edite `src/providers/whatsapp/waha/parser.ts`.** Ver Decisão D1 no cabeçalho. A função nova **envolve** a de produção; não a reescreve, não a copia.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/features/ads/engine/storedAdPayload.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { adReferralFromStoredNode } from "./storedAdPayload";

// Fixtures capturadas de webhook_deliveries.request_payload em produção
// (2026-08-10 a 2026-08-17). Só os campos do anúncio — que é conteúdo
// publicitário público — mais alguns vizinhos de ruído, para provar que o
// parser os ignora. A thumbnail base64 foi removida, como a RPC também faz.

/** Caminho extendedTextMessage, nó completo — 276 de 277 na amostra. */
const FIXTURE_COMPLETE = {
  title: "Filtro UFI: original de fábrica para sua caminhonete ou van diesel",
  body: "CATALISADORES COM FILTRO ORIGINAL E ENVIO PARA TODO O BRASIL!\nEstá procurando catalisadores?",
  sourceID: "120238998853430275",
  sourceURL: "https://fb.me/43Wa37bv8",
  sourceType: "ad",
  sourceApp: "facebook",
  mediaType: 2,
  mediaURL: "https://www.facebook.com/reel/1013737501044454/",
  thumbnailURL: "https://scontent.fcgh11-1.fna.fbcdn.net/v/t15.5256-10/737758495.jpg",
  showAdAttribution: true,
  containsAutoReply: true,
};

/** Caminho extendedTextMessage sem sourceURL — 1 caso real na amostra. */
const FIXTURE_NO_SOURCE_URL = {
  title: "Turbo Diesel RS",
  body: "Precisando de um módulo diesel original? A Turbo Diesel envia para todo o Brasil!",
  sourceID: "120249570427830275",
  sourceType: "ad",
  sourceApp: "facebook",
  mediaType: 2,
  mediaURL: "https://www.facebook.com/story.php?story_fbid=895802372913697&id=100047162754835",
};

describe("adReferralFromStoredNode", () => {
  it("mapeia o nó completo para IAdReferral com os nomes de campo do domínio", () => {
    expect(adReferralFromStoredNode(FIXTURE_COMPLETE)).toEqual({
      sourceId: "120238998853430275",
      sourceUrl: "https://fb.me/43Wa37bv8",
      sourceType: "ad",
      headline: "Filtro UFI: original de fábrica para sua caminhonete ou van diesel",
      body: "CATALISADORES COM FILTRO ORIGINAL E ENVIO PARA TODO O BRASIL!\nEstá procurando catalisadores?",
      mediaType: "video",
      mediaUrl: "https://www.facebook.com/reel/1013737501044454/",
    });
  });

  it("normaliza o mediaType numérico do WAHA (2 = vídeo)", () => {
    expect(adReferralFromStoredNode(FIXTURE_COMPLETE)?.mediaType).toBe("video");
    expect(adReferralFromStoredNode({ ...FIXTURE_COMPLETE, mediaType: 1 })?.mediaType).toBe("image");
    expect(adReferralFromStoredNode({ ...FIXTURE_COMPLETE, mediaType: 99 })?.mediaType).toBeUndefined();
  });

  it("aceita o nó sem sourceURL — sourceUrl fica indefinido, o resto sobrevive", () => {
    const result = adReferralFromStoredNode(FIXTURE_NO_SOURCE_URL);
    expect(result?.sourceId).toBe("120249570427830275");
    expect(result?.sourceUrl).toBeUndefined();
    expect(result?.headline).toBe("Turbo Diesel RS");
  });

  it("devolve undefined para nó ausente ou não-objeto", () => {
    expect(adReferralFromStoredNode(undefined)).toBeUndefined();
    expect(adReferralFromStoredNode(null)).toBeUndefined();
    expect(adReferralFromStoredNode("externalAdReply")).toBeUndefined();
    expect(adReferralFromStoredNode(42)).toBeUndefined();
  });

  it("devolve undefined quando o nó não tem sourceID — sem chave natural não há toque", () => {
    const { sourceID: _dropped, ...withoutSourceId } = FIXTURE_COMPLETE;
    expect(adReferralFromStoredNode(withoutSourceId)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
bun run test src/features/ads/engine/storedAdPayload.test.ts
```

Esperado: FAIL — não resolve o módulo `./storedAdPayload`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/features/ads/engine/storedAdPayload.ts`:

```ts
import type { IAdReferral } from "@/providers/whatsapp/types";
import { extractWahaAdReferral, type IWahaMessagePayload } from "@/providers/whatsapp/waha/parser";

/**
 * Turns an `externalAdReply` node read back out of `webhook_deliveries` into
 * the domain referral, using the SAME mapping the live webhook uses.
 *
 * Why it wraps instead of mapping the fields itself: `extractWahaAdReferral`
 * owns the field renames (`sourceID` → `sourceId`, `title` → `headline`, …) and
 * the `mediaType` normalization (`1`/`"IMAGE"` → image, `2`/`"VIDEO"` → video).
 * Re-implementing that here would let the backfill drift away from live capture
 * the first time either side changes — and the two must agree, because they
 * write into the same table. Editing the parser to export a smaller helper was
 * the alternative and was rejected: the parser is mirrored into the WAHA Edge
 * Function, so touching it would put a redeploy of the function that carries
 * all ad traffic on the table for a purely cosmetic refactor.
 *
 * Only the `extendedTextMessage` branch is built here: the wrapper exists to
 * reach the mapping, and the three real branches all converge on it.
 *
 * Returns undefined for anything unusable — including a node with no
 * `sourceID`, which has no natural key and could never be catalogued in `ads`
 * (PRD-217 RN-01).
 */
export function adReferralFromStoredNode(node: unknown): IAdReferral | undefined {
  if (typeof node !== "object" || node === null) return undefined;

  const payload = {
    _data: { Message: { extendedTextMessage: { contextInfo: { externalAdReply: node } } } },
  } as unknown as IWahaMessagePayload;

  const referral = extractWahaAdReferral(payload);
  if (!referral?.sourceId?.trim()) return undefined;
  return referral;
}
```

Criar `src/features/ads/index.ts`:

```ts
export { adReferralFromStoredNode } from "./engine/storedAdPayload";
```

- [ ] **Step 4: Rodar e ver passar**

```bash
bun run test src/features/ads/engine/storedAdPayload.test.ts
```

Esperado: PASS, 5/5.

Se `IWahaMessagePayload` não estiver exportado de `parser.ts`, **não** edite o parser: importe o tipo de onde ele já estiver exportado, ou tipe o payload local como `Parameters<typeof extractWahaAdReferral>[0]`. Anote qual saída usou no relatório.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
bun run test
```

Esperado: verde, com 5 testes a mais que a baseline (3.899 → 3.904).

- [ ] **Step 6: Commit**

```bash
git add src/features/ads
git commit -m "feat(ads): parse stored externalAdReply nodes through the production WAHA mapping"
```

---

## Task 3: `scripts/backfill-ad-touches.ts`

**Files:**
- Create: `scripts/backfill-ad-touches.ts`

**Interfaces:**
- Consumes: `adReferralFromStoredNode` de `../src/features/ads/engine/storedAdPayload`; as RPCs `ad_backfill_delivery_window`, `ad_backfill_orphan_conversations` e `record_ad_touch` da Task 1 e da Fase 1
- Produces: nada consumido por outra task; é o executável do gate

Padrão da casa a espelhar: `scripts/funnel/migrate-orphans-to-leads.ts` — trava por env, cliente service role de `.env.local`, escrita em lote, relatório em `scratchpad/`, `audit_logs` por fase.

- [ ] **Step 1: Escrever o script**

Criar `scripts/backfill-ad-touches.ts`:

```ts
// scripts/backfill-ad-touches.ts
// PRD-217 (Provenance) Fase 2 — reconstrução do histórico de toques de anúncio.
//
// Duas passadas, nesta ordem (a segunda depende da primeira):
//   A. PRECISA      — webhook_deliveries (retenção desde 19/07/2026). Data real
//                     do clique, mensagem casada. origin='backfill_delivery'.
//   B. APROXIMADA   — conversations.ad_referral, só para conversas que ficaram
//                     SEM nenhum toque. Data da conversa, não do clique.
//                     origin='backfill_conversation' (aviso da RN-06).
//
// Idempotente: record_ad_touch grava com `on conflict do nothing` sobre os dois
// índices únicos da Fase 1 (message_id; conversation_id+ad_id+occurred_at).
// Rodar de novo não duplica — devolve null e o script conta como "já existia".
//
// Simulação (ZERO escrita):
//   AD_BACKFILL_DRY_RUN=yes bun run scripts/backfill-ad-touches.ts
// Escrita real (atrás do gate do dono):
//   AD_BACKFILL_CONFIRM_WRITE=yes bun run scripts/backfill-ad-touches.ts
//
// Flags: --from ISO  --to ISO  --window-hours N  --phase delivery|conversation|all
//
// Gate: a migration 20260819000000_ad_provenance_phase2.sql TEM de estar
// aplicada antes da escrita real — as duas RPCs de leitura nascem lá.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { adReferralFromStoredNode } from "../src/features/ads/engine/storedAdPayload";

// ===== Safety latch ==========================================================

const DRY_RUN = process.env.AD_BACKFILL_DRY_RUN === "yes";
const CONFIRM_WRITE = process.env.AD_BACKFILL_CONFIRM_WRITE === "yes";
if (!DRY_RUN && !CONFIRM_WRITE) {
  throw new Error(
    "Trava de segurança: rode com AD_BACKFILL_DRY_RUN=yes (simulação) ou AD_BACKFILL_CONFIRM_WRITE=yes (escrita real).",
  );
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
}
const sb = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ROOT = join(import.meta.dir, "..");
const SCRATCHPAD = join(ROOT, "scratchpad");
const STORE_MATRIZ = "00000000-0000-0000-0000-000000000001";
const AUDIT_ACTOR = "622d1d2c-0223-4133-91cd-0264c1fc29aa"; // Edmilson (operador)

// ===== Args ==================================================================

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const WINDOW_HOURS = Number(flag("window-hours") ?? 24);
if (!Number.isFinite(WINDOW_HOURS) || WINDOW_HOURS <= 0) {
  throw new Error("--window-hours precisa ser um número positivo.");
}
const PHASE = flag("phase") ?? "all";
if (!["all", "delivery", "conversation"].includes(PHASE)) {
  throw new Error("--phase aceita: all | delivery | conversation");
}

// ===== Row shapes ============================================================

interface DeliveryRow {
  message_id: string;
  conversation_id: string;
  occurred_at: string;
  external_ad_reply: unknown;
}

interface OrphanRow {
  conversation_id: string;
  occurred_at: string;
  referral: unknown;
}

interface PassCounters {
  scanned: number;
  unparseable: number;
  inserted: number;
  alreadyThere: number;
  failed: number;
}

const emptyCounters = (): PassCounters => ({
  scanned: 0,
  unparseable: 0,
  inserted: 0,
  alreadyThere: 0,
  failed: 0,
});

const failures: string[] = [];

// ===== Escrita ===============================================================

/**
 * record_ad_touch devolve o uuid do toque criado, ou null quando o toque já
 * existia (redelivery ou re-execução do backfill) — null é sucesso, não erro.
 */
async function recordTouch(
  counters: PassCounters,
  args: {
    conversationId: string;
    messageId: string | null;
    occurredAt: string;
    referral: unknown;
    origin: "backfill_delivery" | "backfill_conversation";
  },
): Promise<void> {
  if (DRY_RUN) {
    counters.inserted += 1;
    return;
  }
  const { data, error } = await sb.rpc("record_ad_touch", {
    p_conversation_id: args.conversationId,
    p_message_id: args.messageId,
    p_occurred_at: args.occurredAt,
    p_referral: args.referral,
    p_origin: args.origin,
  });
  if (error) {
    counters.failed += 1;
    failures.push(`${args.origin} ${args.conversationId}: ${error.message}`);
    return;
  }
  if (data) counters.inserted += 1;
  else counters.alreadyThere += 1;
}

// ===== Passada A — fonte precisa ============================================

async function runDeliveryPass(from: Date, to: Date): Promise<PassCounters> {
  const counters = emptyCounters();
  const stepMs = WINDOW_HOURS * 3600 * 1000;

  for (let cursor = from.getTime(); cursor < to.getTime(); cursor += stepMs) {
    const windowFrom = new Date(cursor);
    const windowTo = new Date(Math.min(cursor + stepMs, to.getTime()));

    const { data, error } = await sb.rpc("ad_backfill_delivery_window", {
      p_from: windowFrom.toISOString(),
      p_to: windowTo.toISOString(),
    });
    if (error) {
      throw new Error(
        `Janela ${windowFrom.toISOString()} → ${windowTo.toISOString()} falhou: ${error.message}. ` +
          `Se for statement_timeout, reduza --window-hours e rode de novo (é idempotente).`,
      );
    }

    const rows = (data ?? []) as DeliveryRow[];
    counters.scanned += rows.length;

    for (const row of rows) {
      const referral = adReferralFromStoredNode(row.external_ad_reply);
      if (!referral) {
        counters.unparseable += 1;
        continue;
      }
      await recordTouch(counters, {
        conversationId: row.conversation_id,
        messageId: row.message_id,
        occurredAt: row.occurred_at,
        referral,
        origin: "backfill_delivery",
      });
    }

    console.log(
      `  [precisa] ${windowFrom.toISOString().slice(0, 10)} — ` +
        `${rows.length} mensagens, ${counters.inserted} toques novos até aqui`,
    );
  }

  return counters;
}

// ===== Passada B — fonte aproximada =========================================

async function runConversationPass(): Promise<PassCounters> {
  const counters = emptyCounters();

  const { data, error } = await sb.rpc("ad_backfill_orphan_conversations");
  if (error) throw new Error(`Fonte aproximada falhou: ${error.message}`);

  const rows = (data ?? []) as OrphanRow[];
  counters.scanned = rows.length;

  for (const [index, row] of rows.entries()) {
    // conversations.ad_referral JÁ é um IAdReferral (o webhook grava o objeto
    // do domínio, não o nó cru do provider): passa direto, sem parser.
    const referral = row.referral as { sourceId?: string } | null;
    if (!referral?.sourceId?.trim()) {
      counters.unparseable += 1;
      continue;
    }
    await recordTouch(counters, {
      conversationId: row.conversation_id,
      messageId: null,
      occurredAt: row.occurred_at,
      referral,
      origin: "backfill_conversation",
    });
    if ((index + 1) % 100 === 0) {
      console.log(`  [aproximada] ${index + 1}/${rows.length}…`);
    }
  }

  return counters;
}

// ===== Contagens de conferência =============================================

async function countTable(table: string): Promise<number> {
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countOrphanConversations(): Promise<number> {
  const { data, error } = await sb.rpc("ad_backfill_orphan_conversations");
  if (error) throw error;
  return ((data ?? []) as OrphanRow[]).length;
}

// ===== Main ==================================================================

async function main(): Promise<void> {
  console.log(
    `\nBackfill de toques de anúncio — modo ${DRY_RUN ? "SIMULAÇÃO (nada é gravado)" : "ESCRITA REAL"}\n`,
  );

  const before = {
    touches: await countTable("ad_touches"),
    ads: await countTable("ads"),
    orphanConversations: await countOrphanConversations(),
  };
  console.log(
    `Antes: ${before.touches} toques, ${before.ads} anúncios, ` +
      `${before.orphanConversations} conversas com anúncio e sem toque.\n`,
  );

  let delivery = emptyCounters();
  if (PHASE === "all" || PHASE === "delivery") {
    // A retenção real de webhook_deliveries manda: sem --from/--to, varre da
    // entrega mais antiga até agora.
    const { data: bounds, error: boundsErr } = await sb
      .from("webhook_deliveries")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1);
    if (boundsErr) throw boundsErr;

    const from = new Date(flag("from") ?? bounds?.[0]?.created_at ?? new Date().toISOString());
    const to = new Date(flag("to") ?? new Date().toISOString());
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new Error("--from/--to inválidos: precisam ser ISO e --from anterior a --to.");
    }

    console.log(
      `Passada PRECISA: ${from.toISOString()} → ${to.toISOString()}, ` +
        `janelas de ${WINDOW_HOURS}h`,
    );
    delivery = await runDeliveryPass(from, to);
    console.log("");
  }

  let conversation = emptyCounters();
  if (PHASE === "all" || PHASE === "conversation") {
    console.log("Passada APROXIMADA (data da conversa, não do clique — RN-06)");
    conversation = await runConversationPass();
    console.log("");
  }

  const after = {
    touches: await countTable("ad_touches"),
    ads: await countTable("ads"),
    orphanConversations: await countOrphanConversations(),
  };

  // ----- Relatório -----------------------------------------------------------
  mkdirSync(SCRATCHPAD, { recursive: true });
  const md = [
    `# Backfill de toques de anúncio (PRD-217 Fase 2)`,
    ``,
    `Execução: ${new Date().toISOString()} — modo **${DRY_RUN ? "simulação" : "escrita real"}**`,
    ``,
    `| Contagem | Antes | Depois |`,
    `|---|---:|---:|`,
    `| Toques (\`ad_touches\`) | ${before.touches} | ${after.touches} |`,
    `| Anúncios (\`ads\`) | ${before.ads} | ${after.ads} |`,
    `| Conversas com anúncio **sem toque** | ${before.orphanConversations} | ${after.orphanConversations} |`,
    ``,
    `## Passada precisa (\`backfill_delivery\`)`,
    ``,
    `- mensagens varridas: ${delivery.scanned}`,
    `- toques novos: ${delivery.inserted}`,
    `- já existiam: ${delivery.alreadyThere}`,
    `- nó ilegível / sem sourceId: ${delivery.unparseable}`,
    `- falhas: ${delivery.failed}`,
    ``,
    `## Passada aproximada (\`backfill_conversation\`)`,
    ``,
    `> ⚠️ RN-06: a data destes toques é a da **conversa**, não a do clique.`,
    ``,
    `- conversas varridas: ${conversation.scanned}`,
    `- toques novos: ${conversation.inserted}`,
    `- já existiam: ${conversation.alreadyThere}`,
    `- \`ad_referral\` sem sourceId: ${conversation.unparseable}`,
    `- falhas: ${conversation.failed}`,
    ``,
    ...(failures.length ? [`## Falhas`, ``, ...failures.map((f) => `- ${f}`), ``] : []),
  ].join("\n");
  writeFileSync(join(SCRATCHPAD, "ad-touches-backfill-report.md"), md + "\n", "utf8");
  console.log(md);
  console.log(`\nRelatório: scratchpad/ad-touches-backfill-report.md`);

  if (DRY_RUN) {
    console.log("\nSimulação: nada foi gravado. Para valer, use AD_BACKFILL_CONFIRM_WRITE=yes.");
    return;
  }

  // ----- Audit ---------------------------------------------------------------
  const auditRows = [
    {
      id: crypto.randomUUID(),
      store_id: STORE_MATRIZ,
      actor_id: AUDIT_ACTOR,
      action: "ad_touches_backfill",
      resource: "ad_touches",
      resource_id: STORE_MATRIZ,
      timestamp: new Date().toISOString(),
      before,
      after: { ...after, delivery, conversation, phase: PHASE, window_hours: WINDOW_HOURS },
    },
  ];
  const { error: auditErr } = await sb.from("audit_logs").insert(auditRows);
  if (auditErr) {
    console.error("FALHA NO AUDIT — replay manual:", JSON.stringify(auditRows));
    throw auditErr;
  }

  if (after.orphanConversations > 0) {
    console.warn(
      `\n⚠️ Ainda restam ${after.orphanConversations} conversas com anúncio e sem toque — ` +
        `o gate da Fase 2 pede ZERO. Investigue antes de fechar.`,
    );
  }
  if (failures.length) {
    console.warn(`\n⚠️ ${failures.length} falhas — o script é idempotente, pode rodar de novo.`);
  }
}

await main();
```

- [ ] **Step 2: Verificar a trava de segurança**

```bash
bun run scripts/backfill-ad-touches.ts
```

Esperado: aborta com "Trava de segurança: rode com AD_BACKFILL_DRY_RUN=yes…". **Nenhuma** conexão ao banco antes disso.

- [ ] **Step 3: Verificar que o script type-checka**

```bash
bunx tsc --noEmit 2>&1 | grep "backfill-ad-touches\|features/ads"
```

Esperado: nenhuma linha. (A baseline global de ~376 erros pré-existentes é irrelevante aqui — só interessa o delta dos arquivos desta branch.)

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-ad-touches.ts
git commit -m "feat(ads): add two-source idempotent ad touch backfill script"
```

- [ ] **Step 5 (GATED — depende da migration aplicada): simulação contra produção**

```bash
AD_BACKFILL_DRY_RUN=yes bun run scripts/backfill-ad-touches.ts
```

Confere sem gravar nada: as janelas passam sem `statement_timeout`, o número de mensagens varridas fica na casa das centenas, `unparseable` fica em 0 ou perto disso, e as contagens "antes" batem com 6 toques / 3 anúncios / 969 conversas órfãs.

---

## Task 4: Gates

**Files:** nenhum — é verificação.

- [ ] **Step 1: Suíte completa**

```bash
bun run test
```

Esperado: verde; 5 testes a mais que a baseline de 3.899.

- [ ] **Step 2: Build**

```bash
bun run build
```

Esperado: sucesso. (É o gate real de CI; `bun run build` não faz type-check.)

- [ ] **Step 3: Type-check por delta**

```bash
bunx tsc --noEmit 2>&1 | grep "src/features/ads" ; echo "delta de src/ acima (vazio = ok)"
```

⚠️ **`scripts/` está FORA do `include` do `tsconfig.json`** (`["src/**/*.ts", "src/**/*.tsx", "vite.config.ts", "eslint.config.js"]`). Filtrar a saída do `tsc` por `scripts/` devolve zero **por exclusão, não por aprovação** — o arquivo nunca entrou no programa. Type-checar o script à parte, com a severidade do projeto:

```bash
bunx tsc --noEmit --strict --noUncheckedIndexedAccess --target es2022 --module esnext --moduleResolution bundler --skipLibCheck scripts/backfill-ad-touches.ts
```

Esperado: **só** `TS2339` em `import.meta.dir` (Bun-ism que outros 13 scripts do repo já usam; não há `@types/bun` instalado, e por isso `--types bun` aborta com `TS2688`).

- [ ] **Step 4: Lint**

```bash
bunx eslint scripts/backfill-ad-touches.ts src/features/ads
```

Esperado: limpo. **Não** usar `bun run lint` aqui: no Windows, com `autocrlf`, ele devolve ~429k avisos de `Delete ␍` no repo inteiro e afoga qualquer sinal real.

- [ ] **Step 5 (GATED — OK explícito do dono): rodar o backfill em produção**

**5a. Simulação primeiro.** Escreve zero — nem toque, nem `audit_logs` — e devolve o mesmo relatório que a execução real devolveria:

```bash
AD_BACKFILL_DRY_RUN=yes bun run scripts/backfill-ad-touches.ts
```

**5b. Execução real**, só depois de conferir o relatório da simulação:

```bash
AD_BACKFILL_CONFIRM_WRITE=yes bun run scripts/backfill-ad-touches.ts
```

Três coisas a saber antes de rodar:

- **Sem flags de data.** O backfill completo é `--phase all` (o default) **sem** `--from`/`--to`. A combinação `--phase all --from/--to` é **bloqueada pelo script**: a passada aproximada não recebe recorte de data, então ela varreria todas as órfãs e carimbaria data aproximada — de forma irreversível — em conversas que a passada precisa ainda não mediu. Para uma rodada com janela recortada, use `--phase delivery --from ... --to ...`.
- **O relatório é datado.** O arquivo é `scratchpad/ad-touches-backfill-report-<timestamp ISO da execução>.md` — a simulação e a execução real geram arquivos distintos, e uma segunda rodada não apaga o registro da primeira.
- **Rodar duas vezes não duplica** (RN-01): `record_ad_touch` faz `on conflict do nothing`. Mas no **dry-run** o contador de "toques" conta tentativas, não inserções — o rótulo no relatório diz isso.

**5c. Reconciliar as datas de `ads` (obrigatório depois da execução real).** `record_ad_touch` mantém `ads.first_seen_at`/`last_seen_at`, mas ao criar uma linha nova ela usa `now()` — então os anúncios criados pelo backfill nascem com a data **de hoje**, não a do primeiro toque histórico. Um passo de SQL corrige:

```sql
update public.ads a
   set first_seen_at = t.first_occ,
       last_seen_at  = greatest(t.last_occ, a.last_seen_at)
  from (select ad_id, min(occurred_at) as first_occ, max(occurred_at) as last_occ
          from public.ad_touches group by ad_id) t
 where t.ad_id = a.id and t.first_occ < a.first_seen_at;
```

- [ ] **Step 6 (GATED): fechar o gate da Fase 2**

Três conferências, todas exigidas pelo PRD:

1. **Contagem antes/depois** — do relatório datado em `scratchpad/ad-touches-backfill-report-<timestamp>.md`.

   **Números esperados**, medidos em produção na revisão de 18/08 (se a realidade divergir muito, pare e investigue antes de seguir):

   | O quê | Esperado |
   |---|---|
   | conversas com `ad_referral` e sem toque, **antes** | 969 |
   | cobertas pela passada **precisa** (`backfill_delivery`) | 871 |
   | cobertas pela passada **aproximada** (`backfill_conversation`) | 98 |
   | chamadas de `record_ad_touch` na passada precisa | ~926 (mais que 871: há conversa com mais de uma entrega) |
   | linhas em `public.ads`, antes → depois | 3 → 5 |
   | conversas com `ad_referral` **sem** `sourceId` | 0 |

2. **Nenhuma conversa com `ad_referral` ficou sem toque:**

```sql
select count(*) as orfas_restantes
from public.conversations c
where c.ad_referral is not null
  and not exists (select 1 from public.ad_touches t where t.conversation_id = c.id);
```

Esperado: **0**.

Conferir também a distribuição por origem e a honestidade da data (RN-06):

```sql
select origin, count(*), min(occurred_at)::date as mais_antigo, max(occurred_at)::date as mais_novo
from public.ad_touches group by origin order by 2 desc;
```

Esperado: as três origens presentes, `webhook` com os 6 originais mais o que chegou desde então, `backfill_delivery` na casa das centenas dentro da retenção (a partir de 19/07/2026), `backfill_conversation` cobrindo o resto e chegando até 15/04/2026.

3. **Converter um lead de teste e ver o `customer_id` carimbado** (RN-05). Escolher um lead que tenha toque:

```sql
select t.lead_id, count(*) as toques, min(l.name) as lead
from public.ad_touches t join public.leads l on l.id = t.lead_id
where t.lead_id is not null and t.customer_id is null
group by t.lead_id order by 2 desc limit 5;
```

Converter esse lead pela UI (Leads → converter em cliente) e conferir:

```sql
select id, lead_id, customer_id, origin from public.ad_touches where lead_id = '<uuid do lead>';
```

Esperado: `customer_id` preenchido em **todos** os toques daquele lead.

E conferir que a RN-05 **não** sobrescreve: rodar `convert_lead_mark` de novo para o mesmo lead apontando outro cliente **não pode** mudar o `customer_id` já gravado.

**Duas observações a registrar no relatório do gate** (não são pendências, são limites conhecidos):

- **RN-04 / cobertura retroativa.** Os toques reconstruídos copiam os vínculos **atuais** da conversa (`lead_id`, `customer_id`). Um lead que já virou cliente **antes** do backfill não passa por `convert_lead_mark` de novo, então o `customer_id` do toque vem do que a conversa carrega hoje. Medição de 18/08: **0** conversas com `ad_referral` cujo lead já foi convertido e cuja conversa continua sem `customer_id` — ou seja, hoje esse buraco é vazio. Vale re-medir na hora de rodar.
- **Corrida com o webhook ao vivo.** Uma mensagem com `externalAdReply` que chegue enquanto o backfill roda pode ser gravada pelos dois caminhos. `record_ad_touch` faz `on conflict do nothing` no `message_id`, então o pior caso é a segunda gravação virar no-op. Não exige janela de manutenção.

- [ ] **Step 7: Abrir o PR**

```bash
gh pr create --base main --title "feat(ads): PRD-217 Fase 2 — propagação do customer_id e backfill de toques" --body-file <arquivo>
```

O corpo do PR precisa dizer, em destaque: **a migration não é aplicada pelo merge** — a aplicação em produção é manual e já foi (ou ainda será) feita sob OK do dono; e que **nenhuma Edge Function é redeployada nesta fase**.

---

## Auto-revisão do plano

**Cobertura da spec (Fase 2):**

| Item da Fase 2 | Onde |
|---|---|
| `convert_lead_mark` recriada com a RN-05 | Task 1, Step 1 |
| `scripts/backfill-ad-touches.ts` | Task 3 |
| Testes do parser de payload guardado, fixtures reais | Task 2 |
| Backfill em produção com contagem antes/depois | Task 4, Steps 5–6 (item 1) |
| Nenhuma conversa com `ad_referral` sem toque | Task 4, Step 6 (item 2) |
| Converter lead de teste e ver `customer_id` carimbado | Task 4, Step 6 (item 3) |
| Ordem precisa → aproximada, "só insere para conversas sem toque" | Task 1 (`ad_backfill_orphan_conversations`) + Task 3 (`main` roda A antes de B) |
| Varredura por janela curta, nunca de uma vez | Task 1 (RPC recebe `p_from`/`p_to`) + Task 3 (`WINDOW_HOURS`, default 24 h) |
| Idempotência (RN-01) | `record_ad_touch` com `on conflict do nothing`; o script conta `alreadyThere` em vez de tratar como erro |
| Honestidade da data (RN-06) | `origin='backfill_conversation'` + aviso no relatório e na conferência do Step 6 |

**Consistência de tipos entre tasks:** `adReferralFromStoredNode(node: unknown): IAdReferral | undefined` — mesmo nome e mesma assinatura na Task 2 (produz) e na Task 3 (consome). Os quatro campos de `DeliveryRow` batem com as quatro colunas de `ad_backfill_delivery_window`; os três de `OrphanRow` batem com `ad_backfill_orphan_conversations`. Os cinco parâmetros passados a `record_ad_touch` batem com a assinatura da Fase 1 (`p_conversation_id, p_message_id, p_occurred_at, p_referral, p_origin`).

**Fora de escopo desta fase** (e de propósito): provider `adTouches` em `src/providers/data/`, rodapé "+N anúncios anteriores" no cartão do thread, bloco na ficha do cliente, RPC `ad_funnel_metrics`, tela `app.gestao.anuncios`, seed RBAC `ad_analytics`. Tudo isso é Fase 3/4. Bump de versão e CHANGELOG também não entram aqui.
