# Design — Inbox real do WhatsApp (Evolution): espelho da conta conectada

> **Status:** aprovado pelo dono em 2026-06-11.
> **Contexto:** produção (dados+auth Supabase) tem a conta Evolution `GALLO Campanhas` (instância `Agent-GALLO-R9-B1`) conectada por QR (PR #67) e o webhook unificado recebendo eventos. Porém o Inbox mostra apenas as 96 conversas **seed fictício** carregadas na Fase 2: mensagens enviadas do próprio celular (`fromMe`) são descartadas no parser, statuses não casam com nada e **não existe importação do histórico**. Mensagem nova de cliente já cria conversa sozinha (webhook PRD-114) — o restante do espelho não existe.

## Decisões do dono

| Decisão | Escolha |
| --- | --- |
| Escopo do Inbox real | **Espelho completo** — histórico importado + recebidas novas + mensagens enviadas pelo celular |
| Seed em produção | **Arquivar** (tag `demo-seed` + status `arquivada` + zerar não-lidas) — nada é apagado; consultável pelo filtro "Arquivadas" e sempre disponível no modo Demonstração |
| Profundidade do histórico | **Tudo que a Evolution tiver armazenado** (sem corte de data) |
| Grupos | **Ignorados** (importação e webhook) — o modelo do CRM é conversa ↔ cliente 1:1 |
| Arquitetura | **Abordagem A** — importação one-shot idempotente (Edge Function) + webhook estendido para `fromMe`; o banco continua a fonte de verdade (Realtime, distribuição, SDR, janela 24h intactos) |

## 1. Arquivamento do seed (operação de dados em produção)

- UPDATE assistido via MCP (com aprovação do dono na execução; **não é migration** — é correção de dados pontual, registrada nesta spec e no PR):
  - Critério: conversas **sem nenhuma mensagem real** — `id not in (select conversation_id from messages where provider_message_id is not null)`.
  - Efeito: `tags = tags + 'demo-seed'`, `status = 'arquivada'`, `unread_count = 0`.
- Reversível: a tag `demo-seed` identifica para sempre as linhas alteradas (UPDATE inverso possível).
- Um registro em `audit_logs` (action `seed_conversations_archived`, contagem no `after`).
- Mensagens, clientes, pedidos e demais dados seed **não são tocados**.

## 2. Webhook — espelhar `fromMe` + guarda de grupos

Camada `src/providers/whatsapp/` (runtime-agnostic; ⚠️ regra: mudou ⇒ `bun scripts/sync-whatsapp-shared.ts` + redeploy de `whatsapp-webhook`).

### Parser (`evolution/parser.ts`)
- `messages.upsert` com `fromMe=true` deixa de lançar erro e vira tipo novo `IOutboundEcho`: `{ type: "outbound-echo", providerMessageId, toPhone (remoteJid), contentType, text, mediaCaption, timestamp, rawPayload }`.
- **Guarda de grupos** (inbound E echo): `remoteJid` terminando em `@g.us`, `@broadcast` (inclui `status@broadcast`) ou `@newsletter` → throw (o webhook ignora com 200, padrão atual).

### Core (`webhook/core.ts`) — ramo `outbound-echo`
1. **Anti-eco:** `findOutboundMessageByProviderMessageId` encontrou (mensagem enviada pelo app) → `markProcessed` + outcome `duplicate`.
2. Resolve a conta pela instância (`findEvolutionAccount`); cliente pelo telefone do destinatário — cria pendente (`pending_review`, vendedor default da loja) quando número novo.
3. Conversa: reusa aberta (cliente+conta) ou cria com **status `em_andamento`** (nós iniciamos; nada aguardando a equipe) — `createConversation` ganha o campo `status` no input.
4. Insere mensagem `direction: "out"`, `author_type: "seller"`, `author_id: null` (não há como saber quem digitou no celular), `status: "sent"`, `provider_message_id` setado — os acks futuros (`messages.update`) atualizam entregue/lido pelo fluxo existente.
5. **Bump sem não-lida:** novo método `touchConversation(conversationId, lastMessageAt)` no `IWebhookDb` (atualiza `last_message_at` sem incrementar `unread_count`).
6. `markProcessed` após persistir; audit `webhook_received` com `direction: "out"` no `after`.
- Limitação aceita: janela de corrida rara entre o eco e o commit do `provider_message_id` pelo `whatsapp-send` pode duplicar uma mensagem de saída (cosmético; anotado, sem mitigação extra agora).
- Mídia de eco não é baixada (mesma política da importação; `media_type` + caption entram).

## 3. Importação de histórico — Edge Function `whatsapp-import-history` (a 12ª)

- **Owner-only** (`servePost` + `requireCaller(req, ["owner"])`), mesmo esqueleto `_shared/` das demais.
- Núcleo runtime-agnostic em `src/providers/whatsapp/import/core.ts` com superfície de banco injetada (`IImportDb`, mesmo padrão de `webhook/core.ts`), testado no Vitest e espelhado em `_shared/whatsapp/import/` pelo sync.
- Helpers REST novos em `evolution/instance.ts`: `findChats(target)` e `findMessages(target, remoteJid, page)` (POST `/chat/findChats/{instance}` e `/chat/findMessages/{instance}`, apikey Vault-first via `{credentials_ref}_API_KEY`, logging em `integration_logs` como hoje).
- **Contrato por lotes:** body `{ accountId, cursor? }` → processa ~10 chats por chamada → `{ done, nextCursor, stats }`. Stats acumuláveis: `chatsProcessed, chatsSkippedGroup, customersCreated, conversationsCreated, messagesImported, messagesSkipped`.
- Fluxo por chat individual (`@s.whatsapp.net`; grupos/broadcast/newsletter pulados):
  1. Telefone → cliente existente (match exato por dígitos, como o webhook) ou cria pendente (`pending_review`).
  2. Conversa: reusa aberta (cliente+conta) ou cria com status `em_andamento`, vendedor do cliente, `unread_count = 0`, `created_at` = timestamp da primeira mensagem importada.
  3. Mensagens (todas que a Evolution devolver, paginadas): **dedup por `provider_message_id`** — existente é pulada (idempotência total; rodar de novo nunca duplica e retoma após falha). Direção por `fromMe` (`in` → author customer; `out` → author seller/`author_id null`); status: ack do registro quando disponível, senão `delivered` (in) / `sent` (out); `sent_at` do timestamp original.
  4. `last_message_at` = maior timestamp; ordenação e janela de 24h (RPC `last_inbound_at`) funcionam automaticamente.
- **Mídia histórica não é baixada** (URLs expiram, volume imprevisível): mensagem entra com `media_type`, caption e `media_download_status = 'failed'` (elegível a retry manual futuro). Texto entra completo.
- Audit por execução: `whatsapp_history_imported` com stats do lote.
- Limitação honesta: a profundidade depende do que a instância Evolution armazenou (sincronização do pareamento + tráfego desde então) — não é o histórico completo do celular.

## 4. UI — botão de importação

- Tela **Configurações → WhatsApp** (`WhatsAppAccountsPage`): na conta Evolution **conectada**, botão "Importar conversas do WhatsApp", visível apenas para Owner.
- Diálogo: confirmação (explica clientes pendentes e grupos ignorados) → execução em loop de lotes com progresso ao vivo (chats processados / mensagens importadas) → resumo final ("X conversas, Y mensagens, Z clientes novos para revisar, W grupos ignorados"). Erro → toast pt-BR; reexecutar retoma (idempotente).
- Cliente HTTP no padrão das demais invocações de função da feature (functions.invoke com mapeamento de erro pt-BR).
- Inbox: **nenhuma mudança** — lista, Realtime e badges já cobrem.

## 5. Erros, testes e gate

- Testes Vitest (TDD nos núcleos):
  - parser — eco `fromMe`, guarda de grupos (inbound e eco), statuses inalterados;
  - `webhook/core` — anti-eco (app-send não duplica), espelho cria conversa `em_andamento` sem não-lida, cliente pendente para número novo, grupos ignorados;
  - `import/core` — mapeamento chat→cliente→conversa, dedup por `provider_message_id`, cursor/lotes, stats, grupos pulados.
- Gate: `bun run build` + `bun run test` verdes; `scripts/sync-whatsapp-shared.ts` rodado; deploy `whatsapp-webhook` (atualizado) + `whatsapp-import-history` (nova); smoke real no número conectado (mensagem recebida, enviada pelo celular e importação) validado pelo dono.
- Branch `feat/whatsapp-real-inbox` a partir da `main`; PR própria; bump MINOR após merge (fluxo do projeto). PR #68 (CRUD de usuários) segue aberta e independente.

## Fora de escopo (explícito)

- Grupos de WhatsApp (importação ou recepção) — exigiria remodelar conversa↔cliente.
- Download de mídia histórica e de ecos `fromMe` (retry manual futuro; pipeline de mídia inbound novo segue como está).
- Atribuição do autor real de mensagens enviadas pelo celular (entram como "vendedor" anônimo).
- Histórico para contas **Meta Cloud** (a API da Meta não expõe histórico; importação é Evolution-only).
- Limpeza/arquivamento de outros dados seed (clientes, pedidos, orçamentos) — operação própria, fora deste pacote.
- Sincronização contínua por polling (webhook já cobre o tempo real).
