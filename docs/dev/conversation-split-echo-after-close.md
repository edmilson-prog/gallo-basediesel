# Conversa dividida em duas: eco do celular após encerramento

> Investigação de 2026-07-23. Caso relatado: **VOLTECH OFICINA ESPECIALIZADA EM VEICULOS A DIESEL**
> (+55 49 9973-4586) aparecendo como **duas conversas** na Inbox — mesmo número, mesma instância
> (`Vendas — WAHA`, +55 55 9985-0110), histórico partido ao meio.

## 1. Veredito

**Não é bug de deduplicação, nem `@lid`, nem 9º dígito.** É o efeito colateral de uma **regra de
negócio deliberada e documentada**: um **eco** (mensagem enviada pelo aparelho, fora da plataforma)
**nunca reabre** uma conversa encerrada — ele **cria uma conversa nova**.

Regra em `docs/dev/attendance-close-history.md` §"Matriz de reabertura":

| Evento numa conversa encerrada | Comportamento |
|---|---|
| **Inbound do cliente** | **Reabre** para `aguardando` (topo da fila) |
| **Eco do celular** (outbound pelo aparelho) | **NÃO reabre** — cria conversa nova |

Implementação: `supabase/functions/waha-webhook/index.ts`

- **Eco** (`:854-869`) — lookup **OPEN-ONLY**: `.not("status","in","(resolvida,arquivada)")`.
  Não achando conversa aberta, insere uma nova (`:873`) com `assigned_seller_id: null` (cai no pool).
- **Inbound** (`:1108-1118`) — lookup **sem filtro de status** → acha a conversa encerrada e
  **reabre** (`:1157`, `didReopen`).

Espelhado em `_shared/whatsapp/webhook/core.ts` (`findOpenConversation` + `includeTerminal`).

## 2. Linha do tempo do caso VOLTECH (evidência)

Cliente `0d02ed7d-6b65-4df9-bfaa-4a6e0330b6f7`, conta `d1a9f086` (`Vendas — WAHA`).

| Quando (UTC) | O quê | Fonte |
|---|---|---|
| 20/07 19:31:26 | Última mensagem da conversa **A** (`a5081f8f`, 612 msgs) | `messages` |
| **20/07 20:23:22** | **Lucas Costa marca a conversa A como `resolvida`** | `conversation_activity` (`status`, `em_andamento→resolvida`) |
| **20/07 20:50:02** | **Sistema cria a conversa B** (`2a9dcfb4`) — primeira msg `"turbodieselscfilial@gmail.com"`, enviada **pelo celular** | `conversation_activity` (`created`, `actor_kind: system`) |
| 21/07 10:47 | Tiago assume a conversa B (`em_andamento`) | `conversation_activity` |

**27 minutos** entre encerrar e o vendedor responder pelo aparelho. As duas conversas carregam
mensagens do **mesmo chat** (`252101812834367@lid`) — não há ambiguidade de identidade do contato.

Contraprova na mesma trilha: em **08/07 16:28**, **17/07 11:12** e **17/07 17:25** a conversa A foi
**reaberta** (`type: reopen`, `actor_kind: system`) — nessas três vezes quem falou primeiro depois do
encerramento foi **o cliente** (inbound). Inbound reabre; eco não.

## 3. Escala em produção

| Métrica | Valor |
|---|---|
| Pares "mesmo cliente + mesma instância" com >1 conversa | **22** (51 conversas) |
| Desses, a conversa mais nova começa com **eco do celular** | **20 de 22** |
| Conversas criadas por eco (total) | **632** |
| …criadas **depois** de a anterior ter sido encerrada (= histórico partido) | **102** |
| …dentro de **1h** do encerramento | 24 |
| …dentro de **24h** do encerramento | 54 |

Interpretação: das 632 conversas abertas por eco, a **grande maioria é legítima** (o vendedor iniciou
pelo celular um contato que ainda não tinha conversa). O sintoma relatado corresponde às **102** em
que já existia conversa encerrada do mesmo contato na mesma instância — e **metade delas (54)**
ocorreu em menos de 24h do encerramento, ou seja, é a continuação imediata do mesmo assunto.

## 4. O que NÃO é

- **Não** é falha de dedup do eco: envios feitos **pela plataforma** (`waha-send`) são deduplicados por
  `provider_message_id` antes de qualquer escrita (`waha-webhook/index.ts:714-738`) e nunca criam
  conversa nova.
- **Não** é `@lid` vs `@c.us`: ambas as conversas contêm mensagens do mesmo `252101812834367@lid`, e o
  cliente é o mesmo registro em `customers` (busca por telefone retorna 1 linha).
- **Não** é multi-instância: `whatsapp_account_id` idêntico nas duas.
- **Não** é regressão recente do webhook: a regra vem do PRD de Encerramento & Histórico de
  Atendimento. O aumento em julho acompanha o uso crescente do botão "Resolver".

## 5. Decisão pendente (produto)

A regra atual foi escrita para **não deixar o eco do próprio aparelho ressuscitar** uma conversa que o
time deu por encerrada — o que protege fila e métricas de atendimento. O preço é o histórico partido
que o dono viu na Inbox. Caminhos possíveis, em ordem de invasividade:

1. **Janela de continuidade** — o eco reabre a conversa encerrada se o encerramento foi há menos de
   X horas (24h cobriria 54 dos 102 casos); passado isso, segue criando nova. Preserva a intenção
   original e mata o sintoma mais incômodo.
2. **Eco sempre reabre** — simetria total com o inbound. Elimina a divisão, mas ressuscita conversas
   encerradas e mexe na fila/métricas de atendimento.
3. **Manter e resolver na UI** — agrupar na Inbox conversas do mesmo contato+instância (a aba
   "Histórico" da ficha já mostra os atendimentos anteriores). Zero mudança de backend.
4. **Não mexer** — tratar como comportamento esperado, documentando para o time.

Nenhuma alteração de código foi feita nesta investigação.
