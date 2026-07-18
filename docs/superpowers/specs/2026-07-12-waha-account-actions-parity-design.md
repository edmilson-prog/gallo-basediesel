# WAHA — Paridade de ações de conta (Verificar agora, Conexão, Mensagem de teste, Importar conversas, Sincronizar fotos) — Design

> **Status:** aprovado para plano (2026-07-12) · **Escopo:** aba Configurações → WhatsApp → WAHA
> **Continuação de:** `docs/superpowers/specs/2026-07-10-waha-instance-card-and-parameters-design.md` (card rico + parâmetros) e `docs/superpowers/specs/2026-07-10-waha-whatsapp-integration-design.md` (integração base, PR #265)

**Goal:** Dar ao card de sessão WAHA os mesmos 5 botões de ação que o card Meta/Evolution já tem — "Verificar agora", "Mensagem de teste", "Importar conversas", "Sincronizar fotos", "Conexão" — sem tocar na pipeline Meta/Evolution que já funciona em produção.

**Arquitetura (resumo):** Duas categorias de mudança. (a) **Ciclo de vida da sessão** (Verificar agora, Conexão, Mensagem de teste) — tudo dentro do `waha-connect`, a edge já isolada do WAHA; não introduz nada novo estruturalmente, só ações novas/uso de UI de ações já existentes. (b) **Import + Sync de fotos** — `whatsapp-import-history` e `whatsapp-avatar-sync` **não são** as 3 edges isoladas da WAHA; já são compartilhadas entre Evolution e Evolution Go, cada engine com seu próprio "coletor+normalizador" convergindo num core de aterrissagem (`landNormalizedChat`) engine-agnóstico. WAHA entra como 3º branch no mesmo molde — zero refatoração no caminho Evolution.

**Tech stack:** React 19 + TanStack, shadcn/ui, provider pattern, Edge Function Deno + engine `waha/*` (mirrored `src/providers/whatsapp/waha/` ⇄ `supabase/functions/_shared/whatsapp/waha/`).

---

## Global Constraints

- **Isolamento das 3 edges WAHA preservado** — `waha-connect`/`waha-webhook`/`waha-send` seguem sem importar `_shared/whatsapp/build.ts`, `webhook/core.ts` ou `send/core.ts`.
- **Zero mudança no caminho Evolution que já roda em produção** — `whatsapp-import-history`/`whatsapp-avatar-sync` ganham um branch novo (`provider === 'waha'`), o branch `evolution`/`evolution-go` existente não é tocado.
- **Engine `src/providers/whatsapp/waha/**` é runtime-agnostic** (só Web APIs + imports relativos); toda mudança lá roda `bun run scripts/sync-whatsapp-shared.ts` **e** redeploy das edges afetadas antes de qualquer teste real.
- **Sem migration** — nenhuma mudança de schema; tudo usa tabelas/colunas já existentes (`whatsapp_accounts`, `waha_servers`, `customers.avatar_synced_at`, `messages`).
- **pt-BR com acentuação correta** em toda UI; comentários/código em inglês.
- **Tokens semânticos apenas** — nenhum hex/`--gallo-*` cru (PRD-001 / ux-guidelines §5).

---

## 1. Estado atual

- `WahaSection.tsx` mostra, por sessão: **Reiniciar**, **Parâmetros**, **Editar** visíveis; **Parear novamente** (só quando `!== connected`), **Silenciar alertas**, **Logout**, **Excluir** no menu "⋮".
- `waha-connect` já expõe `create|ping|backfillLids|qr|state|logout|restart|delete|updateConfig`. `state` **já** grava `status`/`phone_number` no banco (`wahaStateToAccountStatus`).
- `waha-send` já envia texto/mídia real via `sendWahaText`/`sendWahaMedia` (`src/providers/whatsapp/waha/send.ts`) — validado em produção nesta sessão (saga do eco de saída, PR #274).
- `whatsapp-import-history` e `whatsapp-avatar-sync` só aceitam `provider === 'evolution'` (import) ou `'evolution'|'evolution-go'` (avatar sync); WAHA recebe 422 `VALIDATION_ERROR` hoje.
- `resolveWahaLid` (`src/providers/whatsapp/waha/contacts.ts`) já resolve `@lid → telefone real` via `GET /api/{session}/lids/{digits}` — usado hoje pelo webhook e pelo backfill.
- Endpoints REST da WAHA confirmados na documentação oficial (`waha.devlike.pro`):
  - `GET /api/{session}/chats?limit=&offset=&sortBy=&sortOrder=` → lista de chats (`id`, `name`, `picture`, …).
  - `GET /api/{session}/chats/{chatId}/messages?limit=&offset=&downloadMedia=&filter.fromMe=` → mensagens do chat (mesmo shape do payload de webhook: `id`, `timestamp`, `from`, `fromMe`, `body`, `hasMedia`, `media`, `ack`).
  - `GET /api/contacts/profile-picture?contactId=&session=&refresh=` → `{ profilePictureURL }`.

---

## 2. Verificar agora

**UI:** novo `Button` no card WAHA, ao lado de "Reiniciar" (ícone `mdi:refresh`, spin durante a chamada — mesmo padrão do `handleCheckNow` da aba Contas).

**Fluxo:** `invokeWaha({ accountId, action: "state" })` → a edge já atualiza `status`/`phone_number`; o frontend recarrega (`refresh()`, que já busca `listWaha` + `loadRawStates`). **Nenhuma mudança de backend.**

---

## 3. Conexão

**UI:** promove o fluxo hoje enterrado em "Parear novamente" (dropdown) a um botão primário sempre visível, ao lado de "Editar" — rótulo `"Conectar"` quando `status !== "connected"`, `"Conexão"` quando `status === "connected"` (mesma regra do card Evolution). O item "Parear novamente" some do dropdown (fica só o botão, sem duplicar entrada).

**Comportamento por estado:**
- `status !== "connected"`: mesmo fluxo atual de `handleRepair` — reinicia a sessão, abre `WahaPairingDialog` (QR).
- `status === "connected"`: abre um diálogo **somente leitura** novo (`WahaConnectionInfoDialog`) com servidor / sessão / número / estado bruto (`rawStates[row.id]`) e um botão **"Reconectar"** que, só aí, dispara o mesmo `handleRepair`. Clicar em "Conexão" **nunca** reinicia a sessão sozinho — evita desconexão surpresa por curiosidade.

**Nenhuma mudança de backend** — reaproveita `state`/`restart`/`qr` já existentes.

---

## 4. Mensagem de teste

**UI:** `TestMessageDialog.tsx` já é genérico o bastante (recebe `IWhatsAppAccount` completo) — ganha um branch por `account.provider` na função de envio, ao invés de chamar `sendEvolutionTestMessage` incondicionalmente.

**Backend — nova ação no `waha-connect`:**
```
{ accountId, action: "test-message", to: string /* dígitos com DDI+DDD */ }
→ { ok: true, traceId }
```
Owner-only (mesmo gate das demais ações). Valida `to` (12–13 dígitos, mesma regra de `sendAdHocTestMessage`), resolve `{ baseUrl, apiKey }` via `resolveWahaServer` (já existe em `waha-connect/wahaServer.ts`), monta `target = { baseUrl, sessionName: account.provider_config.sessionName }`, chama `sendWahaText(apiKey, fetch, target, { toPhone: "+"+to, text: "✅ Mensagem de teste — GALLO Base Diesel. A conexão WhatsApp desta conta está funcionando." })` — texto idêntico ao usado pela Evolution (`whatsapp-connect/index.ts::sendAdHocTestMessage`). Audita `whatsapp_test_message_sent` com `toMasked` (últimos 4 dígitos) + `providerMessageId`, mesmo shape de auditoria da Evolution. **Não grava linha em `messages`** — mesmo contrato "não aparece na Central de Atendimento" da Evolution.

**Frontend novo:** `sendWahaTestMessage(accountId, digits)` em `wahaConnect.ts`, mesma forma de `invokeWaha`.

---

## 5. Sincronizar fotos

**Backend — 3º branch em `whatsapp-avatar-sync/index.ts`** (ao lado do branch `evolution-go` já existente):
- `account.provider === "waha"` → resolve `{ baseUrl, apiKey }` via um novo `whatsapp-avatar-sync/wahaServer.ts` local (cópia enxuta de `resolveWahaServerForPing` do `waha-connect` — só `baseUrl`+`apiKey`, sem HMAC, seguindo o mesmo padrão não-`_shared` que `goServer.ts` já usa).
- `target = { baseUrl, instanceName: sessionName }` (campo reaproveitado só pra satisfazer o tipo, como o branch Go já faz) + `fetchPicUrl` override:
  ```ts
  fetchPicUrl = (wire) => fetchWahaProfilePictureUrl(apiKey, fetch, { baseUrl, sessionName }, `${wire}@c.us`);
  ```
- **Novo helper** `fetchWahaProfilePictureUrl` em `src/providers/whatsapp/waha/contacts.ts` (mirrored): `GET /api/contacts/profile-picture?contactId=<contactId>&session=<sessionName>` → `body.profilePictureURL` ou `null` em 404/vazio. Nunca lança (mesmo contrato dos outros helpers de `contacts.ts`).
- Mensagem de validação (`VALIDATION_ERROR`) atualizada para "disponível para contas Evolution e WAHA".

**Zero mudança** em `syncContactAvatar` (`_shared/avatar.ts`) — já aceita `fetchPicUrl` injetado, mesmo mecanismo do branch Go.

**UI:** `SyncAvatarsDialog.tsx` já é genérico (texto não menciona "Evolution") — nenhuma mudança de conteúdo necessária.

---

## 6. Importar conversas (a maior peça)

### 6.1 Novo engine WAHA — `src/providers/whatsapp/waha/history.ts` (mirrored)

- `fetchAllWahaChatIds(apiKey, fetchFn, target)` — pagina `GET /api/{session}/chats?limit=100&offset=N` até uma página vir com `< limit` itens (ou cap de segurança, mesmo padrão de `MAX_MESSAGE_PAGES_PER_CHAT`), devolve `string[]` de `chat.id`, sem duplicatas.
- `classifyWahaChatId(chatId): "individual" | "lid" | "group" | "broadcast" | "other"` — mesma lógica de sufixo do `parser.ts` (`@c.us` individual, `@lid` privacidade, `@g.us` grupo, `@broadcast`/`@newsletter` transmissão).
- `fetchWahaChatMessages(apiKey, fetchFn, target, chatId, offset, limit)` — uma página de `GET /api/{session}/chats/{chatId}/messages?limit=&offset=`.
- `normalizeWahaHistoryRecord(payload: IWahaMessagePayload): INormalizedRecord | null` — mesmas guardas do `normalizeRecord` da Evolution (sem `id` → descarta; timestamp inválido/futuro → descarta; conteúdo vazio/desconhecido → descarta), reaproveitando a extração de conteúdo já usada pelo parser do webhook (`contentTypeFromMimetype`/`extractContent`, exportadas de `parser.ts` para reuso).

### 6.2 Orquestração — `supabase/functions/whatsapp-import-history/wahaImport.ts` (novo, local/não-mirrored, mesmo padrão de `import-db.ts`)

`processWahaImportBatch({ account, target, apiKey, cursor, db, warn })`:
1. Busca `fetchAllWahaChatIds`, ordena (cursor estável entre chamadas, mesma razão da Evolution: a ordem da API não é garantida estável).
2. Fatia o lote (`cursor..cursor+BATCH_SIZE`), mesma constante `BATCH_CHATS_DEFAULT = 10`.
3. Por chat do lote:
   - `group`/`broadcast`/`other` → incrementa o stat correspondente, pula.
   - `lid` → chama `resolveWahaLid(apiKey, fetch, { baseUrl, sessionName, lid: chatId })`; **sem** resolução → `chatsSkippedLid++`, pula (sem chamar mensagens); **com** resolução → segue como chat individual usando o telefone resolvido.
   - `individual` (ou `lid` resolvido) → pagina `fetchWahaChatMessages` (offset += limit) até página curta ou cap de segurança, normaliza cada registro, chama o `landNormalizedChat` **importado direto de `_shared/whatsapp/import/core.ts`** (já engine-agnóstico — mesma função que a Evolution Go HistorySync reaproveita) com `phone` = telefone individual ou resolvido.
4. Retorna `{ done, nextCursor, stats }` — **mesmo shape** `IImportBatchResponse` que a Evolution já usa; o frontend (`ImportConversationsDialog`/`runHistoryImport`) não muda nada.

### 6.3 Edge `whatsapp-import-history/index.ts`

Ganha um branch: `account.provider === "waha"` → resolve `{ baseUrl, apiKey }` via novo `whatsapp-import-history/wahaServer.ts` local (mesmo padrão do item 5), monta `target`, chama `processWahaImportBatch`. Branch `evolution` existente **inalterado**. Mensagem de validação passa a listar `evolution`/`waha`.

### 6.4 Frontend

`ImportConversationsDialog.tsx` — o texto "que o servidor Evolution tem armazenado" (linha 91) passa a citar o provedor da conta (`Evolution` ou `WAHA`) dinamicamente. Resto do componente já é genérico (`runHistoryImport` não sabe nem precisa saber de provider).

---

## 7. Fora de escopo (explícito)

- **Import de mídia histórica** — mesma regra da Evolution: só texto/legenda, mídia antiga não é baixada (`media_download_status: 'failed'`, elegível a retry manual — já existe).
- **Novos servidores WAHA / múltiplas contas por servidor** — nenhuma mudança no `waha_servers`.
- **`message.ack` / status de entrega no import** — status é derivado (`out → "sent"`, `in → "delivered"`), mesma regra da Evolution.
- **Deduplicar chat `@lid` vs `@c.us` da mesma pessoa quando ambos existem como entradas separadas** — não precisa de tratamento especial: `landNormalizedChat` já resolve por telefone (`findCustomerByPhone`/`findOpenConversation`), então as duas entradas convergem naturalmente para o mesmo cliente/conversa.
- **Reaproveitar as mesmas rotinas para Evolution Go** — fora de escopo aqui; o padrão fica documentado para uma eventual unificação futura.

---

## 8. Riscos & itens a validar no plano

1. **Shape exato de `GET /api/{session}/chats/{chatId}/messages`** — a doc pública confirma os campos principais (`id`, `timestamp`, `from`, `body`, `ack`, `hasMedia`), mas o `fromMe` não veio explicitamente citado no texto da doc (só como filtro `filter.fromMe`) — o plano deve confirmar contra uma chamada real (servidor do dono) antes de fechar `normalizeWahaHistoryRecord`, com fallback: se `fromMe` vier ausente, tratar como `false` (inbound) e logar aviso — nunca quebrar o lote por isso.
2. **Paginação real de `/chats`** — o default documentado é `limit=100`; `fetchAllWahaChatIds` precisa paginar de verdade (não assumir que a 1ª página é tudo), com cap de segurança (ex.: 5000 chats) e aviso de truncamento (nunca silencioso, conforme `docs/dev` já pede pra outros importadores).
3. **Custo de `resolveWahaLid` por chat `@lid`** — decisão já tomada (resolver), mas o plano deve confirmar o timeout usado (mesmo `10s` default do restante do engine) e que uma falha de resolução (não 404, erro de rede/5xx) conta como falha do chat (`chatsFailed++`), não trava o lote inteiro.

---

## 9. Estratégia de testes

- **Engine (Vitest, TDD):** `history.test.ts` novo — `classifyWahaChatId` (todos os sufixos), `normalizeWahaHistoryRecord` (guardas: sem id, timestamp inválido, conteúdo vazio, mídia, `fromMe` ausente), `fetchAllWahaChatIds`/`fetchWahaChatMessages` (paginação, cap de segurança) com `fetch` mockado. `contacts.test.ts` ganha casos para `fetchWahaProfilePictureUrl` (200 com URL, 404, corpo vazio). Espelhar tudo via `sync-whatsapp-shared.ts`.
- **Edge:** `wahaImport.ts`/`wahaServer.ts` novos não têm suíte própria (mesmo padrão de `import-db.ts`/`goServer.ts`, que também não têm) — cobertos pelo teste de engine + smoke manual pós-deploy.
- **Gate prático:** `bun run build` + `bun run test` verdes; `bunx tsc --noEmit` avaliado por delta.
- **e2e real gated** no servidor WAHA do dono — smoke manual: 1 mensagem de teste, 1 import numa conta com histórico real (incluindo pelo menos 1 contato `@lid` se houver), 1 sync de fotos, 1 ciclo "Conexão" (ver detalhes → reconectar).

---

## 10. Rollout

Sem migration. Deploy: `waha-connect` (ação `test-message`), `whatsapp-import-history` e `whatsapp-avatar-sync` (branch `waha` novo) — todas Owner-gated, com OK do dono antes de qualquer deploy real (mesma regra de sempre). Frontend via PR/push, nunca merge direto.
