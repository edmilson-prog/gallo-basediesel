import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * nps-submit — endpoint PÚBLICO da landing de pesquisa (PRD-148B).
 *
 * Deploy com `--no-verify-jwt`: não há sessão. A posse do token autoriza
 * exatamente uma pesquisa e nada mais — nenhuma rota aqui lista, busca ou
 * enumera. Um token que não existe e um que expirou devolvem estados
 * diferentes apenas quando o token EXISTE; um token desconhecido é sempre
 * `invalid`, para não confirmar que já existiu.
 *
 * Duas ações, ambas por POST (o `servePost` compartilhado é POST-only e traz
 * CORS, traceId e tratamento de erro; um GET exigiria um segundo lifecycle
 * para nada):
 *   { action: 'context', token }                    → estado + primeiro nome
 *   { action: 'submit', token, score, comment? }    → grava a resposta
 *
 * Idempotência: a gravação é um UPDATE condicionado a `status in
 * ('pending','sent')`. Se nenhuma linha for afetada, a pesquisa já foi
 * respondida — 409. Isso vale inclusive sob corrida, porque quem decide é o
 * banco, não uma leitura anterior.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createRateLimiter } from "./rateLimit.ts";
import { isDetractor, isWellFormedToken, parseSubmission } from "./validation.ts";

/** Compartilhado entre requisições da mesma instância — reseta em cold start, por desenho. */
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

interface ISurveyRow {
  id: string;
  store_id: string;
  conversation_id: string | null;
  recipient_name: string | null;
  status: string;
  expires_at: string;
  /** Embedded so the survey can name the store the customer actually dealt with. */
  stores: { name: string } | null;
}

const SURVEY_COLUMNS =
  "id, store_id, conversation_id, recipient_name, status, expires_at, stores(name)";

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function firstName(fullName: string | null): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

type ISurveyState = "valid" | "expired" | "responded" | "invalid";

function stateOf(survey: ISurveyRow | null, now: Date): ISurveyState {
  if (!survey) return "invalid";
  if (survey.status === "responded") return "responded";
  if (new Date(survey.expires_at).getTime() < now.getTime()) return "expired";
  if (survey.status === "pending" || survey.status === "sent") return "valid";
  return "invalid";
}

async function loadSurvey(admin: SupabaseClient, token: string): Promise<ISurveyRow | null> {
  const { data, error } = await admin
    .from("nps_surveys")
    .select(SURVEY_COLUMNS)
    .eq("token", token)
    .maybeSingle();
  if (error) throw new HttpError(500, `consulta falhou: ${error.message}`);
  return (data as ISurveyRow | null) ?? null;
}

/**
 * Alerta de detrator: uma notificação por gestor/dono, porque `notifications`
 * endereça pessoas (recipient_type 'seller'), não papéis. O Owner recebe de
 * qualquer loja; o Gestor, apenas da loja da pesquisa.
 *
 * Best-effort: falhar aqui não pode desfazer a resposta que o cliente acabou
 * de dar. A resposta já está gravada quando isto roda.
 */
async function alertDetractor(
  admin: SupabaseClient,
  survey: ISurveyRow,
  score: number,
  comment: string | null,
): Promise<void> {
  try {
    const { data: recipients } = await admin
      .from("profiles")
      .select("seller_id, role, store_id")
      .in("role", ["owner", "manager"])
      .not("seller_id", "is", null);

    const targets = (recipients ?? []).filter(
      (row) => row.role === "owner" || row.store_id === survey.store_id,
    );
    if (targets.length === 0) return;

    const name = survey.recipient_name?.trim() || "Cliente";
    await admin.from("notifications").insert(
      targets.map((target) => ({
        dedupe_key: `nps.detrator.${survey.id}.${target.seller_id}`,
        lifecycle: "event",
        type: "nps_detrator",
        category: "operational",
        severity: "warning",
        recipient_type: "seller",
        recipient_id: target.seller_id,
        store_id: survey.store_id,
        title: `NPS ${score} — detrator`,
        body: comment ? `${name}: "${comment}"` : `${name} deu nota ${score}.`,
        entity_ref: survey.conversation_id
          ? { kind: "conversation", id: survey.conversation_id }
          : null,
        channels: ["inApp", "toast"],
        status: "unread",
        source: "nps-submit",
      })),
    );
  } catch (_) {
    // nunca deixa a trilha de alerta derrubar a submissão do cliente
  }
}

servePost(async (req, ctx) => {
  if (!limiter.check(clientIp(req), Date.now())) {
    throw new HttpError(429, "muitas tentativas, tente novamente em instantes");
  }

  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const body = await parseJsonBody(req);
  const action = body.action;
  const now = new Date();

  if (action === "context") {
    // Token malformado nunca chega ao banco.
    if (!isWellFormedToken(body.token)) return json({ state: "invalid" }, 200);
    const survey = await loadSurvey(admin, body.token);
    const state = stateOf(survey, now);
    if (state !== "valid") return json({ state }, 200);
    return json(
      {
        state,
        recipientFirstName: firstName(survey?.recipient_name ?? null),
        contextLabel: "seu atendimento",
        // The store is read from the survey, never hard-coded on the page: the
        // customer must see the unit they actually dealt with.
        storeName: survey?.stores?.name ?? null,
      },
      200,
    );
  }

  if (action === "submit") {
    const parsed = parseSubmission(body);
    if (!parsed.ok) throw new HttpError(422, parsed.error);

    const survey = await loadSurvey(admin, parsed.token);
    const state = stateOf(survey, now);
    if (state === "invalid") throw new HttpError(404, "pesquisa não encontrada");
    if (state === "expired") throw new HttpError(410, "pesquisa expirada");
    if (state === "responded") throw new HttpError(409, "pesquisa já respondida");

    // O banco arbitra: se ninguém foi afetado, outra requisição venceu a corrida.
    const { data: updated, error: updateError } = await admin
      .from("nps_surveys")
      .update({
        score: parsed.score,
        comment: parsed.comment,
        reasons: parsed.reasons,
        responded_at: now.toISOString(),
        status: "responded",
      })
      .eq("id", survey?.id as string)
      .in("status", ["pending", "sent"])
      .select("id");

    if (updateError) throw new HttpError(500, `gravação falhou: ${updateError.message}`);
    if ((updated ?? []).length === 0) throw new HttpError(409, "pesquisa já respondida");

    if (isDetractor(parsed.score) && survey) {
      await alertDetractor(admin, survey, parsed.score, parsed.comment);
    }

    ctx.log.info("nps response received", { surveyId: survey?.id, score: parsed.score });
    return json({ ok: true, detractor: isDetractor(parsed.score) }, 200);
  }

  throw new HttpError(400, "ação inválida");
});
