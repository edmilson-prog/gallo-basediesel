# Anexos: nome original do arquivo + chip de envio no composer — Design

> **Data:** 2026-07-02 · **Status:** aprovado pelo dono (opção A do companion visual)
> **Origem:** feedback direto — a bolha de documento mostra o ID de storage
> (`beef3c1d-….pdf`) em vez do nome original, e o envio de anexo não dá nenhum
> feedback visual entre escolher o arquivo e a bolha aparecer (2–6 s de upload).

## 1. Objetivo

1. Quem olha a conversa vê **`Catalogo-UFI-Filtros.pdf`**, não o ID de storage —
   na bolha, na galeria "Mídias" (conversa e ficha do cliente), no viewer e no
   nome do arquivo baixado. Vale para documentos **enviados e recebidos**.
2. Ao anexar um arquivo, o composer mostra imediatamente um **chip
   "Enviando anexo…"** com nome original, tamanho e spinner, e trava o envio
   até concluir — eliminando a sensação de "nada aconteceu".

## 2. Contexto verificado (por que é barato)

- O nome original **já viaja** pelo pipeline de envio: `useAttachmentUpload`
  retorna `fileName: file.name` (src/features/conversations/hooks/useAttachmentUpload.ts:87),
  `useMessageSend` inclui no body do invoke (useMessageSend.ts:186), o edge
  `whatsapp-send` repassa intocado e o engine rotula o documento para o
  destinatário (send/core.ts:333 — Meta `document.filename`, Evolution
  `fileName`). Ele só é **descartado no INSERT** de `messages`
  (supabase/functions/_shared/whatsappSendAdapter.ts:121-133).
- No recebimento, os 3 parsers **declaram o campo no payload cru e o
  descartam**: Evolution `documentMessage.fileName` (evolution/parser.ts:34→92),
  Evolution Go idem (evolution-go/parser.ts:54→115) e Meta `document.filename`
  (meta/parser.ts:31→130-141).
- As RPCs de leitura do thread e do preview são `RETURNS SETOF public.messages`
  com `SELECT m.*` (`conversation_messages`, migration 20260620140000:23,38,45;
  `last_messages_for_conversations`, 20260620120000:127-149) — uma coluna nova
  **flui automaticamente**, sem tocar nas funções da zona congelada.
- A UI deriva o nome via `fileNameFromUrl(mediaUrl)`
  (messageDisplay.ts:137-142) — último segmento do path de storage, que é um
  ID sintético (`conversations/<convId>/<msgId>/media.<ext>` no inbound;
  UUID de asset no outbound).

## 3. Item 1 — persistir o nome (`messages.media_filename`)

### 3.1 Banco

- Migration: `alter table public.messages add column media_filename text;`
  (nullable; sem índice — busca por nome está fora de escopo).
- Versionada em `supabase/migrations/` e aplicada em prod via MCP **com OK do
  dono** (regra do projeto), no mesmo PR.
- Retrocompat: mensagens antigas ficam `null` e a UI degrada para
  `fileNameFromUrl` (comportamento atual).

### 3.2 Outbound (envio)

- `ISendDb.insertQueuedMessage` (src/providers/whatsapp/send/core.ts:97-106)
  ganha `fileName: string | null`; a chamada persist-before-send (:300-308)
  passa `input.fileName ?? null` (só chega em `kind === "media"`).
- Adapter `whatsappSendAdapter.ts` grava `media_filename: input.fileName`
  no INSERT (:121-133).
- **Agendado herda de graça**: o worker monta o mesmo `ISendRequest` com
  `fileName` (scheduled/core.ts:58) e usa o mesmo core/adapter.
- `useMessageSend`:
  - mensagem otimista ganha `mediaFilename: fileName` (:135-155) — a bolha
    nasce com o nome certo;
  - ramo mock passa `mediaFilename: fileName` no `provider.send` (:202-208)
    para paridade demo (o mock persiste via spread automaticamente,
    src/mocks/api/messages.ts:111).
- Biblioteca de ativos: `useSendAsset` passa `fileName: sendable.title`
  (useSendAsset.ts:142-146) — título curado do ativo como rótulo.
- Product card: só texto, N/A.

### 3.3 Inbound (webhook)

- Shapes de conteúdo dos parsers ganham `fileName?`/`mediaFilename?` e o
  branch de documento o popula:
  - Evolution: `IEvolutionContent` (evolution/parser.ts:76-80) + branch (:92-93);
  - Evolution Go: `IGoContent` (evolution-go/parser.ts:99-104) + branch (:115-116);
  - Meta: branch de mídia (meta/parser.ts:130-141) lendo `message.document?.filename`.
- `IInboundMessage` (types.ts:128-151) **e** `IOutboundEcho` (types.ts:172-182)
  ganham `mediaFilename?: string` — o echo cobre documento enviado do celular.
- `IWebhookDb.insertInboundMessage`/`insertOutboundEchoMessage`
  (webhook/core.ts:92-101/:104-112) ganham `mediaFilename: string | null`;
  chamadas em :645-654 e :545-553 propagam `parsed.mediaFilename ?? null`.
- Edge `whatsapp-webhook/index.ts`: os dois INSERTs gravam `media_filename`
  (:302-314 e :322-335). Gravar no INSERT (não no `setMessageMedia`) garante o
  nome mesmo quando o download da mídia falha/expira.

### 3.4 Import de histórico

- `INormalizedRecord` (import/core.ts:124-131) ganha `mediaFilename?`;
  populado em `normalizeRecord` (REST, :165-199) e `normalizeWhatsmeowRecord`
  (HistorySync, history-core.ts:88-115) — ambos já têm o nó cru com fileName.
- Row de `landNormalizedChat` (:403-412), contrato `IImportDb` (:105-117) e
  INSERT de `import-db.ts` (:103-117 — arquivo fora do espelho, editado à mão).
- Motivação: sem isso, cada importação futura cria documentos com nome perdido
  para sempre.

### 3.5 Leitura e UI

- `IMessage.mediaFilename?: string` (src/shared/types/conversation.ts:126-157).
- Provider supabase (src/providers/data/impl/supabase/messages.ts): `MessageRow`
  (:37-54), `COLUMNS` (:57-59), `rowToMessage` (:69-91) e o row de INSERT do
  método `send` do provider (:133-147 — em prod o envio real vai pelo edge,
  mas o método persiste caminhos internos e deve gravar a coluna também).
- Realtime do thread: campo **aditivo** em `IMessageRealtimeRow` (:10-26) e no
  `rowToMessage` local (useRealtimeMessages.ts:51-69). Nada de query keys,
  caches ou RPCs — mudança de 2 linhas na zona congelada, puramente aditiva.
- `IConversationMediaItem` (engine/conversationMedia.ts:7-19) ganha
  `fileName?`; populado em `messageToMediaItem` (:44-63).
- Pontos de UI (fallback `mediaFilename ?? fileNameFromUrl(url)` em todos):
  1. `DocumentBubble.tsx:21` — corrige nome exibido (:32), ícone por extensão
     (:23) e download (:44-49) de uma vez; cobre documento **e vídeo**
     (MessageBubble.tsx:63-64 roteia ambos).
  2. `MediaThumb.tsx:70` — download do tile de documento; rótulo do tile (:79)
     passa a preferir o nome real (`fileName ?? caption ?? "Documento"`).
  3. `MediaViewerDialog.tsx:43` — header (:54) e download (:48).
- `mediaDownload.ts` não muda (`downloadFileName` já prioriza `existingName`).

## 4. Item 2 — chip de envio no composer (opção A)

- Estado novo em `MessageInput.tsx` (ao lado de `sendingVoice`, :215):
  `uploadingAttachment: { name: string; size: number; kind: AttachmentKind } | null`.
- `handleAttachSelected` (:414-442) seta no início (após validar `file`) e
  limpa em **todos** os caminhos (erro de upload, rejeição por tamanho, erro de
  envio, sucesso) — espelhando o try/catch/finally de `handleSendVoice`
  (:448-494).
- Chip: novo bloco condicional entre `{stagedAsset && …}` (:681-692) e a linha
  do input (:708) — mesmo padrão dos 4 blocos condicionais existentes
  (sugestões IA, ativo preparado, nota interna, chip Origem). Conteúdo: ícone
  por tipo (`mediaIcon`), nome original truncado, tamanho (`formatFileSize`),
  spinner (`mdi:loading` + `animate-spin`) e "Enviando anexo…". Tokens
  semânticos apenas (ux-guidelines).
- Travas enquanto `uploadingAttachment !== null`:
  - botão do clipe (`DropdownMenuTrigger`, :725-735 — hoje sem `disabled`);
  - botão Enviar (compor em `sendDisabled` :292 + razão nova em
    `sendDisabledReason` :293-299 para o tooltip);
  - textarea (evita o bug latente: texto digitado durante o upload é apagado
    pelo `setValue("")` do sucesso, :430);
  - botão do microfone (já tem `disabled={!canSendFreeText}`, :839 — soma o
    estado de upload).
- Erro: chip some + toast `attachUploadFailed` existente (:424).
- Nota de voz: mantém o feedback próprio (`sending` no `VoiceRecorderBar`) —
  sem mudança.
- Strings novas no grupo `attach*` de
  src/features/conversations/i18n/pt-BR.ts:357-362 (pt-BR com acentos):
  `attachUploading` ("Enviando anexo…") e a razão do tooltip do Enviar.

## 5. Fora de escopo (decisões anotadas)

- Preview da lista da Inbox continua "📄 Documento" (sem nome do arquivo).
- Busca por conteúdo (#214) **não** indexa nome de arquivo (a RPC casa só
  `messages.text`; indexar exigiria mudança SQL própria).
- Backfill de nomes de mensagens antigas (outbound parcialmente recuperável
  cruzando `media_assets.file_name`; assistido, caso um dia incomode).
- Progresso percentual real de upload (Storage padrão não expõe; spinner
  indeterminado é suficiente para 2–6 s).

## 6. Testes

- **TDD nos pontos puros (suites existentes ganham casos):**
  - `evolution/parser`, `evolution-go/parser`, `meta/parser`: documento inbound
    (e echo outbound) expõe `mediaFilename`; sem documento → `undefined`.
  - `send/core.test.ts`: `insertQueuedMessage` recebe `fileName` em media e
    `null` em texto/template.
  - `scheduled/core.test.ts`: request do worker herda `fileName` (já cobre o
    campo; caso de persistência entra via send/core).
  - `conversationMedia`: `messageToMediaItem` propaga `fileName`.
- UI (bolha/chip) validada manualmente pelo dono (convenção do projeto — sem
  @testing-library).

## 7. Rollout

1. Branch `feat/attachment-filename-upload-chip` + PR (sem merge sem OK).
2. Migration aplicada em prod via MCP **após OK do dono**, espelhada no Git.
3. `bun run scripts/sync-whatsapp-shared.ts` (regenera `_shared/whatsapp/`) e
   redeploy: `whatsapp-webhook` (`--no-verify-jwt`), `whatsapp-send`,
   `scheduled-send-worker`.
4. Gate de CI prático: `bun run build` + `bun run test` (+ tsc por delta).
5. Bump MINOR com codinome ao final, com OK do dono.

## 8. Riscos

- **Zona congelada do atendimento:** tocada apenas de forma aditiva (2 linhas
  no mapper local do realtime; RPCs intactas; nenhum query key/cache alterado).
- **Ordem de deploy:** o edge novo gravando `media_filename` exige a migration
  aplicada antes do redeploy (senão INSERT falha em coluna inexistente).
  Ordem: migration → deploy dos 3 edges → merge/deploy do front (front antigo
  ignora a coluna; front novo tolera `null`).
- Payloads sem filename (imagem/áudio/sticker, provedores que omitem) →
  coluna `null`, fallback preserva o comportamento atual.
