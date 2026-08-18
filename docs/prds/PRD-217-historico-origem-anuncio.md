# PRD-217: Histórico de Origem de Anúncio (`Provenance`)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | (mesmo da Fase 1/2) |
| **Codinome** | `Provenance` — a procedência que acompanha o item e não se perde no caminho |
| **Objetivo** | Parar de destruir a origem do anúncio a cada nova entrada, registrar **cada** clique que virou conversa, fazer essa procedência acompanhar o contato até ele virar cliente, e medir o funil por campanha |
| **Tipo** | Feature (subsistema novo, pequeno) |
| **Complexidade** | Média |
| **Total de Fases** | 4 (uma PR por fase) |
| **Prioridade** | Alta (P1) — há perda de dado irreversível em produção **hoje** |
| **Épico** | Atendimento / Inteligência comercial |
| **Nº do PRD** | 217 — próximo livre após 216 |
| **PRDs Relacionados** | PRD-005 (Provider Pattern), PRD-006 (RBAC — recurso novo exige seed), PRD-007 (multi-loja), PRD-211 (Pessoas & Acesso — modelo de 2 portões), PRD-215 (Painel de Atendimento — vizinho da tela nova) |
| **Precedente direto** | PR #530 — cartão de origem do anúncio no thread (entregue 2026-08-18); esta PRD é a continuação pedida pelo dono |
| **Padrão de código** | Feature-based; `src/features/ad-analytics/`; lógica em `engine/` com Vitest |
| **Implementação** | 🔵 Claude Code CLI |

### Critérios de Complexidade Utilizados

> **Justificativa de Média:** duas tabelas novas com RLS, alteração no webhook de WhatsApp (que roda em dois runtimes e exige `sync-whatsapp-shared` + redeploy), alteração de uma RPC `SECURITY DEFINER` existente, um backfill de duas fontes com precisão desigual, e uma tela de gestão nova com RPC agregada e seed de RBAC. Não é Alta porque o dado de entrada já é capturado e normalizado hoje: os parsers de todas as cinco engines já produzem `IAdReferral`, e o webhook já grava — só grava por cima.

---

## Contexto do Problema

Desde que a captação por Click-to-WhatsApp entrou no ar, **953 das 4.882 conversas** (≈20%) chegaram por anúncio, distribuídas em **5 criativos**. Cada uma dessas conversas carrega o anúncio inteiro em `conversations.ad_referral`: título, texto (247 a 999 caracteres), tipo de mídia, dois permalinks e o ID da campanha no Meta. Todos os sete campos vêm preenchidos em 100% dos casos — não é dado sujo, é dado bom.

O problema é uma linha do webhook. Em `src/providers/whatsapp/webhook/core.ts`, ao detectar um referral:

```ts
// overwrite with the LATEST referral seen — a customer can
// return via a different ad months later
await db.setConversationAdReferral(conversation.id, parsed.adReferral);
```

A decisão de sobrescrever é defensável para responder "de onde ele veio **agora**", e é o que o cartão do thread mostra. Mas ela **destrói** a resposta para "por quantos anúncios ele já passou". Não há histórico, não há log, não há como recuperar depois: cada retorno por uma campanha diferente apaga a anterior em definitivo.

### O problema por trás do problema

A GALLO está gastando dinheiro em cinco campanhas e **não tem como saber qual delas traz cliente**. Hoje é possível dizer "esta conversa veio de um anúncio de filtro UFI". Não é possível dizer "o anúncio de filtro UFI trouxe 412 conversas, virou 118 leads mornos e 3 clientes". A primeira frase serve ao atendente na conversa; a segunda serve à decisão de onde colocar verba — e é essa que não existe.

Há ainda um vazamento silencioso na ponta oposta: quando o lead vira cliente, a conversa continua ligada a ele, mas nada na ficha do cliente diz que aquele relacionamento **começou num anúncio**. A informação existe, está a dois joins de distância, e nenhuma tela a mostra.

### O que NÃO é o problema

Receita por campanha. O banco tem **0 pedidos** — as vendas vivem no ERP DINTEC. Qualquer métrica de retorno financeiro por anúncio renderia zero hoje, e prometer isso seria vender fumaça. Esta PRD mede **funil**, não faturamento; a atribuição de receita depende de trazer os pedidos do DINTEC, que é escopo próprio e maior.

---

## Conceito da Solução

### Situação Atual (As-Is)

| Pergunta | Hoje |
|---|---|
| De onde esta conversa veio? | ✅ `conversations.ad_referral`, exibido no thread (PR #530) e no painel lateral |
| Por quantos anúncios este contato já passou? | ❌ apagado a cada novo toque |
| Este cliente começou num anúncio? | ❌ nenhuma tela mostra |
| Qual anúncio traz mais lead? | ❌ nenhuma superfície |
| Quanto cada anúncio faturou? | ❌ e continuará ❌ (não há pedidos) |

### Situação Desejada (To-Be)

Um **catálogo de anúncios** (5 linhas hoje) e um **log de toques**: cada clique que virou mensagem gera um registro imutável, com data, conversa, mensagem e a quem pertencia naquele momento. Quando o lead vira cliente, os toques dele são carimbados com o `customer_id` — a procedência passa a ser um campo, não uma dedução. Sobre esse log, três superfícies: o histórico no cartão do thread, um bloco na ficha do cliente, e uma tela de gestão com o funil por campanha.

### O fluxo em uma linha

Cliente clica no anúncio → webhook detecta `externalAdReply` → faz upsert do criativo em `ads` e insere um toque em `ad_touches` → (segue gravando `conversations.ad_referral` como atalho do "último") → lead converte → toques recebem `customer_id` → tela de Gestão agrega por anúncio.

### Decisões de produto tomadas com o dono (2026-08-18)

| # | Decisão | Alternativa recusada |
|---|---|---|
| D1 | Catálogo + log de toques (duas tabelas) | Tabela única com criativo repetido em cada linha; array `jsonb` na conversa |
| D2 | `conversations.ad_referral` **permanece** e continua sendo sobrescrita, como atalho do último anúncio | Migrar o cartão do thread para ler da tabela nova já na Fase 1 |
| D3 | Toques anteriores a 19/07 entram marcados como **aproximados** | Entrar sem distinção (gráfico mentiria); descartar (perderia ~800 origens) |
| D4 | Tela em página própria de Gestão (`app.gestao.anuncios`) | Aba dentro de Análise de Atendimento; as duas |
| D5 | Vendedor vê o histórico da conversa que já pode abrir; a tela agregada é de staff | Tudo restrito à gestão |
| D6 | Mede funil, não receita | Incluir atribuição de receita (exige pedidos do DINTEC) |

---

## Arquitetura

### Onde o código vive

| Camada | Caminho | O quê |
|---|---|---|
| Migration | `supabase/migrations/` | `ads`, `ad_touches`, RLS, alteração de `convert_lead_mark`, RPC de métricas |
| Captura | `src/providers/whatsapp/webhook/core.ts` | `recordAdTouch` no contrato `db`, chamado onde hoje mora `setConversationAdReferral` |
| Espelho runtime | `supabase/functions/_shared/whatsapp/` | via `scripts/sync-whatsapp-shared.ts` — **obrigatório**, o núcleo roda em Deno também |
| Provider | `src/providers/data/impl/{mock,supabase}/adTouches.ts` | contrato novo no barrel `@/providers/data` |
| Feature | `src/features/ad-analytics/` | `engine/` (agregação e rótulos, testados), `components/`, `pages/` |
| Superfícies existentes | `src/features/conversations/`, `src/features/customers/` | histórico no cartão do thread; bloco na ficha |
| Rota | `src/routes/app.gestao.anuncios.tsx` | página de Gestão |
| Backfill | `scripts/backfill-ad-touches.ts` | script paginado, idempotente, re-executável |

### Por que o toque nasce no webhook e não num trigger

O referral chega no payload do provider e é normalizado pelos parsers (`extractWahaAdReferral` e irmãos) — informação que **não existe** na linha da mensagem gravada: `messages` não tem `raw_payload`. Um trigger no banco não teria de onde tirar o `sourceId`. O único lugar que enxerga o dado é o webhook.

---

## Modelo de Dados

### `public.ads` — catálogo de criativos

Deliberadamente **sem `store_id`**: um anúncio não é entidade comercial da loja (contrariando o padrão multi-loja de propósito), é referência externa ao Meta, e o mesmo criativo pode trazer gente para lojas diferentes. Quem carrega `store_id` é o toque.

```sql
create table public.ads (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null unique,
  source_type   text,
  headline      text,
  body          text,
  source_url    text,
  media_url     text,
  media_type    text check (media_type in ('image','video')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

`source_id` é o `sourceID` do `externalAdReply` (ex.: `120238998853430275`) e é a chave natural de deduplicação.

### `public.ad_touches` — log de toques

```sql
create table public.ad_touches (
  id              uuid primary key default gen_random_uuid(),
  ad_id           uuid not null references public.ads(id) on delete cascade,
  store_id        uuid not null references public.stores(id),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id      uuid references public.messages(id) on delete set null,
  contact_id      uuid references public.contacts(id) on delete set null,
  lead_id         uuid references public.leads(id) on delete set null,
  customer_id     uuid references public.customers(id) on delete set null,
  occurred_at     timestamptz not null,
  origin          text not null check (origin in ('webhook','backfill_delivery','backfill_conversation')),
  created_at      timestamptz not null default now()
);

create unique index ad_touches_message_id_key
  on public.ad_touches (message_id) where message_id is not null;
create unique index ad_touches_dedupe_key
  on public.ad_touches (conversation_id, ad_id, occurred_at);

create index ad_touches_ad_occurred_idx on public.ad_touches (ad_id, occurred_at desc);
create index ad_touches_store_idx        on public.ad_touches (store_id);
create index ad_touches_conversation_idx on public.ad_touches (conversation_id);
create index ad_touches_lead_idx         on public.ad_touches (lead_id) where lead_id is not null;
create index ad_touches_customer_idx     on public.ad_touches (customer_id) where customer_id is not null;
```

> ⚠️ **Todos os `id` do schema são `uuid`** — verificado por catálogo em 2026-08-18 (`conversations`, `messages`, `leads`, `customers`, `contacts`, `stores`, `sellers`). Não confiar em migration antiga para inferir tipo de FK: já houve caso de declaração desatualizada neste repositório. Nota de inconsistência **pré-existente e fora de escopo**: `customers.converted_from_lead_id` é `text`, embora `leads.id` seja `uuid`.

### Regras de negócio

| # | Regra |
|---|---|
| **RN-01** | **Idempotência.** O webhook reentrega o mesmo evento cerca de **5×** (medido: 168 entregas com referral → 33 mensagens distintas numa amostra de 2 dias). `message_id` único garante no máximo um toque por mensagem; `(conversation_id, ad_id, occurred_at)` único cobre o backfill, que não sempre casa a mensagem. Inserção usa `on conflict do nothing`. |
| **RN-02** | **Upsert do criativo.** `insert into ads … on conflict (source_id) do update set` atualiza título/texto/links/mídia e avança `last_seen_at`. O anunciante pode editar o texto sem trocar o ID; guarda-se a versão mais recente. Versionar criativo está **fora de escopo**. |
| **RN-03** | **Best-effort.** O registro do toque acontece dentro do mesmo `try/catch` que já protege `setConversationAdReferral`, **depois** da marca de idempotência do evento: uma falha aqui não pode fazer a mensagem ser reprocessada nem perder a mensagem. Falha vira `warn` estruturado. |
| **RN-04** | **Propriedade no momento do toque.** `contact_id`, `lead_id` e `customer_id` são copiados da conversa no instante da inserção. Não são retroativos — exceto pela RN-05. |
| **RN-05** | **Propagação na conversão.** Dentro da RPC `convert_lead_mark(p_lead_id uuid, p_customer_id uuid, p_stage jsonb)`, que já é `SECURITY DEFINER`: `update public.ad_touches set customer_id = p_customer_id where lead_id = p_lead_id and customer_id is null`. Não sobrescreve `customer_id` já preenchido. |
| **RN-06** | **Honestidade da data.** `origin` distingue medição de reconstrução. Toda superfície que exibe série temporal **precisa** avisar quando o período inclui `backfill_conversation`, cuja data é a da conversa, não a do clique. |
| **RN-07** | **`conversations.ad_referral` não muda de comportamento.** Continua sobrescrita, continua sendo a fonte do cartão do thread (PR #530). A tabela nova é aditiva; nada do que existe passa a depender dela na Fase 1. |

### RLS

| Tabela | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `ads` | qualquer `authenticated` (catálogo, sem PII) | somente `service_role` |
| `ad_touches` | staff da loja vê tudo (`store_id = current_store_id() and is_staff()`); não-staff vê só o toque cuja conversa ele pode abrir (`can_access_conversation(conversation_id)`) | somente `service_role` e a RPC `SECURITY DEFINER` |

`can_access_conversation(conv uuid)` já existe e é `SECURITY DEFINER` — é o que mantém o histórico dentro do modelo de 2 portões (instância + carteira). Sem essa policy, um vendedor leria metadado de conversa alheia.

> ⚠️ **RLS dupla é armadilha de performance conhecida aqui** (incidente de `statement_timeout` com RLS aninhada). A policy de não-staff chama uma função `SECURITY DEFINER` por linha; por isso a tela agregada **não** consulta a tabela direto — usa a RPC da RN-08.

| # | Regra |
|---|---|
| **RN-08** | **Métrica vem de RPC agregada.** `ad_funnel_metrics(p_store_id uuid, p_from timestamptz, p_to timestamptz)` devolve uma linha por anúncio, já agregada no banco. Proibido puxar toques e somar no cliente: este projeto já estourou o tamanho de URL com `.in()` em analytics, e a agregação client-side reintroduziria o problema. |

---

## Backfill

### O que dá para recuperar

| Período | Fonte | Precisão | Volume estimado |
|---|---|---|---|
| **19/07/2026 → hoje** | `webhook_deliveries.request_payload`, caminho `payload._data.Message.extendedTextMessage.contextInfo.externalAdReply` | **Data real** do evento; casa a mensagem por `payload.id` → `messages.provider_message_id` | 5.894 entregas → **~1.100 toques distintos** (fator de reentrega ≈5) |
| **antes de 19/07** | `conversations.ad_referral` | Data **aproximada** (`conversations.created_at`); um único toque por conversa | ~800 conversas |

A janela de 19/07 é a retenção observada de `webhook_deliveries` (125.479 linhas no total). `messages` **não** guarda payload cru, então não há terceira fonte.

### Como roda

Script `scripts/backfill-ad-touches.ts`, com service role, **paginado por janela de tempo curta**.

> ⚠️ Medido nesta sessão: `ilike` ou extração de jsonb sobre `webhook_deliveries` inteira **estoura o statement_timeout**. Duas consultas foram abortadas. A varredura precisa ser por faixa de `created_at` com `limit`, nunca de uma vez.

Ordem: primeiro a fonte precisa (`backfill_delivery`), depois a aproximada (`backfill_conversation`), que **só insere para conversas sem nenhum toque** já reconstruído. Idempotente pelos índices únicos: pode rodar de novo sem duplicar.

---

## Superfícies

### S1 — Histórico no cartão do thread

O cartão do PR #530 ganha um rodapé "**+N anúncios anteriores**" quando há mais de um toque, expandindo para a lista (título + data de cada). Aditivo: o cartão continua mostrando o último anúncio como hoje. Visível ao vendedor que já pode abrir a conversa (D5).

### S2 — Bloco na ficha do cliente

"**Veio de anúncio**" com a linha do tempo dos toques do cliente — é o que faz a procedência acompanhar o cliente na prática, e o pedido explícito do dono. Some quando não há toque.

### S3 — Tela `app.gestao.anuncios`

Uma linha por anúncio, com filtro de período e loja:

| Coluna | Definição |
|---|---|
| Anúncio | `headline`, com link para `source_url` e o `source_id` copiável |
| Toques | `count(*)` de toques no período |
| Conversas | `count(distinct conversation_id)` |
| Leads | `count(distinct lead_id)` |
| Temperatura | distribuição frio/morno/quente dos leads distintos |
| Clientes | `count(distinct customer_id)` |
| Conversão | clientes ÷ leads, com o denominador visível (a base é pequena: 6 clientes convertidos no total hoje) |
| Primeiro / último toque | `min`/`max(occurred_at)` |

Regras de UX obrigatórias (`docs/dev/ux-guidelines.md`): header glassmorphism, `ScrollProgressBar`, busca com `/` e `Escape`, colunas redimensionáveis com persistência `gallo-ad-analytics-column-widths`, delimitadores verticais só no header, menu de colunas no clique-direito do cabeçalho.

> ⚠️ **A tela exige seed do recurso no RBAC** (`ad_analytics`) na migration da Fase 4, junto da RPC — nunca em fase anterior, para não deixar recurso órfão se a Fase 4 não vier. Recurso que existe só no código faz o menu desaparecer para **todos**, inclusive Owner — armadilha já vivida neste repositório.

---

## Fora de escopo

Atribuição de receita por anúncio (não há pedidos); versionamento de criativo; multi-touch attribution com pesos; integração com a API do Meta para gasto/impressões/CTR; anúncios de outras plataformas (Google, TikTok); e exportação. Cada um é projeto próprio.

---

## Fases

Uma PR por fase. Migration e deploy **sempre** com OK explícito do dono — mergear PR não aplica migration.

### Fase 1 — Modelo de dados e captura ao vivo

Migration (`ads`, `ad_touches`, índices, RLS); `recordAdTouch` no contrato `db` e a chamada em `core.ts`; providers mock e supabase; `scripts/sync-whatsapp-shared.ts`; testes do engine de montagem do toque.
**Gate:** `bun run test` + `bun run build`; migration aplicada via MCP **e** exportada para `supabase/migrations/` no mesmo PR; Edge Functions de WhatsApp redeployadas; smoke — mandar mensagem por um anúncio real e ver uma linha em `ad_touches`.

### Fase 2 — Propagação e backfill

`convert_lead_mark` recriada com a RN-05; `scripts/backfill-ad-touches.ts`; testes do parser de payload guardado (fixtures reais de `webhook_deliveries`).
**Gate:** backfill rodado em produção com contagem antes/depois; conferir que nenhuma conversa com `ad_referral` ficou sem toque; converter um lead de teste e ver o `customer_id` carimbado.

### Fase 3 — Superfícies do atendimento

S1 (rodapé do cartão) e S2 (bloco na ficha).
**Gate:** testes do engine; smoke com conversa de múltiplos toques e com conversa de um só.

### Fase 4 — Tela de funil

Migration da RPC `ad_funnel_metrics` **e** seed do recurso RBAC `ad_analytics`; feature `ad-analytics`; rota; permissão.
**Gate:** RPC conferida contra contagem manual em SQL; tela aberta com perfil não-staff **não** deve listar; aviso da RN-06 aparece quando o período inclui dado reconstruído.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Redeploy de Edge Function derruba a captura de mensagem | RN-03 (best-effort); deploy em janela combinada com o dono; rollback = redeploy da versão anterior |
| Backfill duplica toques | Dois índices únicos + `on conflict do nothing`; script re-executável |
| Métrica de conversão engana por base pequena | Denominador sempre visível; 6 clientes convertidos hoje |
| RLS de não-staff derruba a performance | Tela agregada usa RPC; policy per-row só nas superfícies de uma conversa |
| Menu desaparece após deploy | Seed do recurso RBAC na mesma migration, verificado antes do merge |
| Anunciante edita o criativo e o texto antigo se perde | Aceito (RN-02); `last_seen_at` registra quando foi visto |

## Critérios de aceite

1. Um cliente que chega por dois anúncios diferentes gera **dois** registros em `ad_touches`, e nenhum é apagado.
2. Reentrega do mesmo evento pelo webhook **não** cria toque duplicado.
3. Converter o lead em cliente carimba `customer_id` em todos os toques daquele lead.
4. A ficha do cliente mostra de qual anúncio o relacionamento começou.
5. A tela de Gestão lista os 5 anúncios com contagem que **bate com SQL manual**.
6. Vendedor comum não abre a tela de Gestão e não vê toque de conversa que não pode abrir.
7. Período que inclui dado reconstruído exibe o aviso da RN-06.
8. `bun run test` e `bun run build` passam; nenhum erro novo de `tsc` nos arquivos tocados.
