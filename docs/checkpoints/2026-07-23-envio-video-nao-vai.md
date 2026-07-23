# Checkpoint — Envio de vídeo no Atendimento não está indo

**Data:** 2026-07-23
**Worktree:** `.claude/worktrees/video-send-fix` — branch `worktree-video-send-fix` (base: `main` @ `f0756308`)
**Status:** contexto capturado, **investigação ainda não iniciada** (sessão encerrada para troca de modelo)

---

## 1. O pedido do dono

> "envio de vídeos nas mensagens que não está indo. isso foi implementado recentemente e validado."

O envio de vídeo pelo composer do Atendimento foi entregue na **v0.149.0 `Reel`** (anexo avulso de vídeo pelo menu de anexo + drag-and-drop, cap de 16 MB, reaproveitando o pipeline de imagem/documento/áudio). Foi validado na época. **Agora regrediu / não funciona.**

### Evidência fornecida (print)

Tela do Atendimento, conversa da instância **"Vendas — WAHA" (55 9985-0110)**, com um arquivo de vídeo (thumbnail vertical) sendo **arrastado** sobre o composer — overlay tracejado "Solte o arquivo aqui para anexar" visível. O print captura o momento do drop, **não** mostra o erro nem o resultado.

Versão no rodapé do print: **v0.154.0 "Dossier"** (main atual).

---

## 2. O que ainda NÃO se sabe (confirmar com o dono antes de teorizar)

Estas perguntas decidem em qual das três camadas o bug vive — não chute:

1. **Onde falha?**
   a. O vídeo **não anexa** (o drop é rejeitado / nada aparece no chip de anexo)?
   b. Anexa, mas **o envio falha** (toast de erro, balão vermelho, status `failed`)?
   c. Envia (balão aparece) mas **não chega no WhatsApp do cliente**?
2. **Aparece alguma mensagem/toast?** Qual texto exato?
3. **Vale para o menu de anexo → "Vídeo" também, ou só para o drag-and-drop?**
4. **Qual arquivo?** Extensão, tamanho e mimetype (um `.mov` do iPhone, por exemplo, cai em `video/quicktime`, que o WhatsApp não aceita nativo).
5. **Só na instância WAHA** ou em qualquer instância?

---

## 3. Mapa do caminho de vídeo (arquivos-chave já levantados)

### Frontend — composer
- `src/features/conversations/components/MessageInput.tsx:514` — `inferAttachmentKind(file)` no drop/paste; `null` ⇒ toast e para.
- `src/features/conversations/engine/attachmentKind.ts:31` — `type.startsWith("video/") → "video"`. **Só olha o MIME e, no fallback, a extensão de *documento*** — arquivo de vídeo com `type` vazio (comum em paste/alguns drops) **não** tem fallback por extensão e retorna `null`. Suspeito nº 1 para o sintoma (a).
- `src/features/conversations/hooks/useAttachmentUpload.ts:17` — cap de 16 MiB para vídeo; `ATTACHMENT_ACCEPT.video = "video/*"`; upload real para o bucket `whatsapp-media` e devolve **signed URL**.

### Envio — camada runtime-agnostic
- `src/providers/whatsapp/send/core.ts` — resolve a conta efetiva e despacha.
- `src/providers/whatsapp/waha/send.ts:78-83` — `MEDIA_ENDPOINTS.video = "/api/sendFile"` (mesmo endpoint do documento; imagem usa `/api/sendImage`, áudio `/api/sendVoice`). Envia `file: { mimetype, url, filename }`.
- ⚠️ **Regra do repo:** mexeu em `src/providers/whatsapp/` ⇒ rodar `scripts/sync-whatsapp-shared.ts` e **redeployar** as Edge Functions (`waha-send`, `scheduled-send-worker`, `sdr-respond` conforme o toque).

### Edge Functions candidatas
`supabase/functions/waha-send/` (espelho de `send/core.ts`), `whatsapp-send/`, `scheduled-send-worker/`.

### Hipóteses a testar (ordem sugerida — **valide, não assuma**)
1. `inferAttachmentKind` devolvendo `null` para o arquivo específico (MIME vazio / `video/quicktime`).
2. Cap de 16 MB estourando silenciosamente (vídeo de celular passa fácil de 16 MB) — checar se o toast de tamanho aparece e se a mensagem é clara.
3. WAHA rejeitando `/api/sendFile` para vídeo (mimetype não suportado, URL assinada expirada antes do fetch do WAHA, tamanho).
4. Regressão vinda da onda de paginação (#353/#354) ou de outra mudança pós-`Reel` — vale um `git log` nos 4 arquivos acima desde a tag `v0.149.0`.

### Onde olhar a verdade em runtime
- `public.integration_logs` (owner-only) — request/response reais do WAHA.
- Logs da Edge Function `waha-send` via MCP Supabase (`get_logs`).
- Console do navegador no momento do drop.

---

## 4. Restrições da casa que valem aqui

- **Nunca mergear sem OK do dono**; nada de `apply_migration`/deploy de Edge em produção sem confirmação explícita.
- **NÃO tocar no cache do Atendimento** (signing em lote #137, realtime, query keys, RPC gated-once) — congelado.
- Testes: `bun run test`; gate prático de CI = `bun run build` + `bun run test` (o build **não** faz type-check; `tsc` tem baseline de erros pré-existentes — avaliar por delta).
- Dev server: worktree sem `.env.local` sobe em **MOCK** silenciosamente — em mock o envio de vídeo é object URL local e **não** reproduz o bug real.

---

## 5. Prompt para a próxima sessão

> Estou na worktree `D:\claude\gallo-basediesel\.claude\worktrees\video-send-fix` (branch `worktree-video-send-fix`). Leia `docs/checkpoints/2026-07-23-envio-video-nao-vai.md`. O envio de vídeo no composer do Atendimento (entregue na v0.149.0 `Reel`, instância "Vendas — WAHA") parou de funcionar. Use a skill `superpowers:systematic-debugging`: comece me perguntando os 5 itens da §2 e leia `integration_logs`/logs da Edge `waha-send` antes de propor qualquer correção.
