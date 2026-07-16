# Origem por anúncio (Click-to-WhatsApp Ads) — Design

> **Data:** 2026-07-13
> **Motivação:** o dono quer identificar, na tela de Atendimento, quais conversas
> começaram através de um anúncio (Facebook/Instagram Ads "Click to WhatsApp"),
> mesmo quando o cliente não escreve nada que denuncie isso na mensagem
> (ex.: "Opa! Vim do anúncio..." às vezes aparece, às vezes não). O sinal
> confiável não está no texto — está em metadados que o próprio WhatsApp
> anexa à mensagem inicial, e que hoje são descartados no parse do webhook.

## 1. O que o WhatsApp já entrega (e o que fazemos com isso hoje)

Toda mensagem originada de um anúncio "Click to WhatsApp" ou de um post
com botão de WhatsApp chega ao webhook com um objeto de contexto anexado
à mensagem — no protocolo "WhatsApp Web multi-device" (a base dos 3
motores em escopo) esse objeto é `contextInfo.externalAdReplyInfo`, com
campos como `title`/`body` (texto do criativo), `sourceId`/`ctwaClid`
(id de rastreio), `sourceUrl`, `mediaType`/`mediaUrl` (imagem ou vídeo do
anúncio) e `sourceType`.

Investigação confirmou que **hoje esse dado é descartado silenciosamente**:

- `rawPayload` é preservado em memória pelos 3 parsers (`meta`, `evolution`,
  `evolution-go` — comentário "kept verbatim for audit, PRD-110"), mas
  **nunca é persistido** em `messages`/`conversations`; só sobrevive, de forma
  parcial e não indexável, em `integration_logs` para eventos ignorados/duplicados.
- Nenhuma das interfaces de payload cru (`IEvolutionRawMessage` em
  `src/providers/whatsapp/evolution/parser.ts`, `IGoMessageBody` em
  `evolution-go/parser.ts`, `IWahaMessagePayload` em `waha/parser.ts`) declara
  `contextInfo` — o campo existe no protocolo, mas os parsers nunca leem essa
  parte do JSON.
- `IConversation`/`IMessage` (`src/shared/types/`) não têm nenhum campo de
  origem de marketing. O único "source" existente (`ILead.origin`) é um enum
  fechado preenchido manualmente pelo funil de leads, não pelo webhook.

## 2. Escopo

**Motores cobertos:** Evolution v2 (Baileys), Evolution-Go (whatsmeow) e WAHA
(engine GOWS/whatsmeow) — os 3 rodam sobre o protocolo WhatsApp Web
multi-device, onde `contextInfo.externalAdReplyInfo` está disponível
independente de ser conta oficial ou não. **Meta Cloud API fica fora** desta
entrega (não está em uso ativo hoje; teria um caminho mais simples via
`messages[].referral`, mas não é o foco atual).

**Fora de escopo:**
- Rastreamento de cliques/UTM em campanhas fora do WhatsApp.
- Distinguir "anúncio pago" de "post orgânico compartilhado com botão de
  WhatsApp" — o WhatsApp pode preencher `externalAdReplyInfo` para os dois
  casos, com `sourceType` variando. A entrega trata a simples presença do
  objeto como sinal de "veio de uma peça de divulgação" (rótulo genérico,
  não uma alegação exclusiva de "anúncio pago"); refinar por `sourceType`
  fica para uma iteração futura, se o dono achar que a distinção importa na
  prática.
- Emissão de eventos de conversão de volta para o Meta Ads Manager (CAPI) —
  não pedido, e um projeto bem maior.

## 3. Captura (parsers)

Novo tipo compartilhado em `src/providers/whatsapp/types.ts`:

```ts
export interface IAdReferral {
  sourceId?: string;
  sourceUrl?: string;
  sourceType?: string;
  headline?: string;
  body?: string;
  mediaType?: "image" | "video";
  mediaUrl?: string;
}
```

`IInboundMessage` ganha `adReferral?: IAdReferral` (opcional — ausente em
99% das mensagens). `IInboundStatus`/`IOutboundEcho` não precisam do campo
(referral só existe na mensagem inbound original).

Cada parser ganha uma função pura `extractAdReferral(raw): IAdReferral | undefined`,
testada isoladamente, que lê `contextInfo.externalAdReplyInfo` da mensagem
crua e normaliza para `IAdReferral` (mapeando os nomes de campo específicos
de cada engine — Baileys/whatsmeow usam casing levemente distintos entre si).

⚠️ **Risco de implementação conhecido, não uma incerteza de design:** o
payload exato que o **WAHA** expõe para esse objeto não está confirmado —
o parser atual (`waha/parser.ts`) só modela um envelope achatado
(`id, from, body, media`), sem expor a estrutura profunda do engine. Antes
de escrever `extractAdReferral` para o WAHA, o plano de implementação deve
incluir um passo de captura de payload real (log temporário de uma mensagem
de anúncio genuína, no mesmo padrão de descoberta já usado neste projeto —
DINTEC, resolução de `@lid` do WAHA) para confirmar o shape. Evolution v2 e
Evolution-Go já têm o shape confirmado via a documentação Swagger do
whatsmeow (`ContextInfo_ExternalAdReplyInfo`) e o protocolo Baileys.

## 4. Persistência

Uma única coluna nova, no mesmo padrão já usado em `trackable_links.utm jsonb`:

```sql
alter table conversations
  add column ad_referral jsonb;
```

- Vive em `conversations`, não em `messages` — o que a plataforma precisa
  saber é "essa conversa tem uma origem de anúncio conhecida", não o
  histórico de cada mensagem individual.
- **Atualizado a cada mensagem inbound que carregue `adReferral`** (não só
  na criação da conversa) — decisão confirmada com o dono: se um cliente
  reabre a conversa meses depois clicando num anúncio diferente, o campo
  reflete a origem mais recente, não trava na primeira.
- `null` para conversas orgânicas — sem mudança de comportamento.
- **Zero mudança** em `can_access_conversation`, `count_conversations`,
  `search_conversations`, RLS de mensagens/storage, ou qualquer índice —
  área explicitamente congelada pelo dono. A leitura do campo na lista/filtro
  usa exatamente as mesmas queries que já trazem a linha de `conversations`.

Implementação: `IWebhookDb` (`webhook/core.ts`) ganha um método novo
`setConversationAdReferral(conversationId, adReferral)`, chamado logo após
`db.insertInboundMessage(...)` quando `parsed.adReferral` está presente —
um ponto de chamada isolado, sem tocar `bumpConversation`/`reopenConversation`/
`touchConversation` existentes.

## 5. Modelo de domínio (frontend)

`IConversation` (`src/shared/types/conversation.ts`) ganha:

```ts
adReferral?: IAdReferral; // mesmo shape do provider layer, mapeado 1:1
```

Providers mock + supabase mapeiam a coluna normalmente (padrão já seguido
por todo campo novo em `conversations`).

## 6. UI

**Badge na lista** (`ConversationListItem.tsx`) — ao lado do `EcommerceBadge`
existente, mesmo padrão (`Badge variant="outline"` + ícone), renderizada
quando `conversation.adReferral` existe:

```
[WhatsApp] [📢 Anúncio] [EM FILA]
```

**Detalhe da conversa** — nova linha em `AtendimentoTab.tsx`
(`src/features/customers/components/tabs/AtendimentoTab.tsx`), reaproveitando
o componente `ContextRow` já existente ali (mesmo padrão de "Status da
conversa"/"Respondendo por"):

```
Origem da conversa    📢 Anúncio · "<headline>"
```

Com tooltip/expansão mostrando `sourceUrl`/`mediaType` quando disponíveis,
sem criar um bloco visual novo do zero.

## 7. Filtro + métrica

- **Filtro na Inbox:** "Origem: Anúncio / Orgânico / Todas" — mais um
  parâmetro opcional em `count_conversations`/`search_conversations`
  (`WHERE ad_referral IS NOT NULL`, ou o inverso), seguindo o mesmo padrão
  aditivo dos filtros existentes (Tags, Instância). Nenhum índice novo é
  necessário para o volume atual; se a query ficar lenta em produção, isso
  vira um ajuste posterior (não bloqueia esta entrega).
- **Métrica:** um KPI no painel "Atendimento" (`/app/inicio`, provider
  `atendimentoMetrics`) — contagem de conversas com `ad_referral` não nulo
  no período selecionado, ao lado dos KPIs já existentes.

## 8. Testes

- Engines puros `extractAdReferral` (um por parser) — testados com Vitest,
  cobrindo: payload com referral, payload sem referral, payload malformado
  (não deve derrubar o parse da mensagem em si).
- `setConversationAdReferral` — teste do core do webhook garantindo que o
  campo é setado na criação e **sobrescrito** em mensagens subsequentes com
  referral, e que mensagens sem referral não tocam o campo.
- Snapshot/unit do `ConversationListItem` e do `AtendimentoTab` com e sem
  `adReferral`.

## 9. Riscos e itens em aberto para a fase de implementação

1. Shape exato do payload WAHA para `externalAdReplyInfo` — precisa de
   captura real antes de codar o parser WAHA (ver seção 3).
2. Nome de campo pode variar levemente entre Baileys (Evolution v2) e
   whatsmeow (Evolution-Go/WAHA) — `extractAdReferral` de cada engine é
   escrito e testado separadamente, não uma função compartilhada ingênua.
3. `sourceType` pode não distinguir de forma confiável "anúncio pago" de
   "post orgânico" — rótulo da badge deve ser genérico o suficiente para não
   alegar algo que o dado não garante (ver seção 2, fora de escopo).
