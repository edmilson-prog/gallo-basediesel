import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * audio-transcribe — 13ª Edge Function. Retry manual da transcrição de áudio
 * inbound (feature `audio_transcription`). O caminho automático (webhook) chama
 * transcribeMessageAudio diretamente, sem HTTP; este endpoint existe só para o
 * botão de retry da UI quando a tentativa automática falhou.
 */

import { requireAnyCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { transcribeMessageAudio } from "../_shared/ai/transcribeAudio.ts";

servePost(async (req) => {
  const { admin, callerClient } = await requireAnyCaller(req);
  const body = await parseJsonBody(req);
  const messageId = String(body.messageId ?? "");
  if (!messageId) throw new HttpError(400, "messageId é obrigatório");

  // Access check via RLS: the caller can only retry a message in a conversation
  // they can read (can_access_conversation, delegated by messages_select).
  const { data: msg, error: msgErr } = await callerClient
    .from("messages")
    .select("id")
    .eq("id", messageId)
    .maybeSingle();
  if (msgErr) throw new HttpError(500, `message read failed: ${msgErr.message}`);
  if (!msg) throw new HttpError(403, "sem acesso a esta mensagem");

  const result = await transcribeMessageAudio(admin, messageId);
  return json({ ok: true, status: result.status });
});
