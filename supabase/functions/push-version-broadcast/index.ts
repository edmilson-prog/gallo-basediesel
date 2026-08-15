import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * push-version-broadcast — avisa a equipe, por push, que saiu versão nova do app
 * de atendimento.
 *
 * Chamada por `pg_cron` a cada 2 minutos (migration
 * 20260812120000_push_version_broadcast.sql). Lê o `/version.json` de produção,
 * compara com o que já foi anunciado e, se for um build inédito, dispara para
 * TODOS os aparelhos inscritos.
 *
 * ⚠️ Isto é um broadcast — a forma exata do incidente de disparo em massa do
 * SDR. O que o torna seguro é a trava, não a boa intenção:
 *
 *  - **um anúncio por build.** `push_broadcasts.build_id` é UNIQUE e a linha é
 *    escrita ANTES dos envios; dois workers em corrida, só um ganha.
 *  - **janela de silêncio no servidor.** A preferência "silenciar das 22h às 6h"
 *    é local do aparelho e o servidor não a enxerga, então ele guarda a própria
 *    janela, mais larga (21h–7h).
 *  - **nada é adivinhado.** `/version.json` ilegível → não anuncia.
 *
 * O disparo é por polling porque não depende de configurar nada na Vercel. Um
 * webhook de deploy substituiria isso sem mudar o resto.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost, type RequestContext } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import { sendWebPush, type IVapidKeys } from "../_shared/webpush.ts";
import { buildUpdateNotification, decideBroadcast } from "./broadcastGate.ts";

/** Mesmo segredo do push-dispatch: os dois são workers de push chamados pelo
 *  banco, e um segredo a menos é um item a menos para provisionar errado. */
const WORKER_SECRET_NAME = "PUSH_DISPATCH_WORKER_SECRET";
const VAPID_PRIVATE_NAME = "VAPID_PRIVATE_KEY";
const VAPID_PUBLIC_NAME = "VAPID_PUBLIC_KEY";
const VAPID_SUBJECT_NAME = "VAPID_SUBJECT";

const VERSION_URL = "https://crm.gallobasediesel.com.br/version.json";

interface ISubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Duplicado do push-dispatch de propósito: manter a resolução de VAPID dentro
 *  de cada função evita que mexer numa obrigue a redeployar a outra. */
async function resolveVapid(
  resolve: (name: string) => Promise<string | undefined>,
): Promise<IVapidKeys> {
  const [privateKey, publicKey, subject] = await Promise.all([
    resolve(VAPID_PRIVATE_NAME),
    resolve(VAPID_PUBLIC_NAME),
    resolve(VAPID_SUBJECT_NAME),
  ]);
  if (!privateKey || !publicKey) throw new HttpError(503, "VAPID keys not provisioned");
  return {
    privateKey,
    publicKey,
    subject: subject ?? "mailto:suporte@gallobasediesel.com.br",
  };
}

/** Fail-open: qualquer falha de leitura vira "build desconhecido", que não anuncia. */
async function readLiveVersion(): Promise<{ buildId: string | null; version: string | null }> {
  try {
    const res = await fetch(VERSION_URL, { cache: "no-store" });
    if (!res.ok) return { buildId: null, version: null };
    const data = (await res.json()) as { buildId?: unknown; version?: unknown };
    return {
      buildId: typeof data.buildId === "string" && data.buildId ? data.buildId : null,
      version: typeof data.version === "string" && data.version ? data.version : null,
    };
  } catch {
    return { buildId: null, version: null };
  }
}

servePost(async (req: Request, ctx: RequestContext): Promise<Response> => {
  const provided = req.headers.get("x-worker-secret") ?? "";
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const resolveSecret = createSecretResolver(admin);

  if (!verifyWorkerSecret(provided, await resolveSecret(WORKER_SECRET_NAME))) {
    throw new HttpError(401, "unauthorized");
  }

  const { buildId, version } = await readLiveVersion();

  // Dois fatos exatos, duas perguntas: este build já foi anunciado, e a tabela
  // alguma vez anunciou algo. Amostrar as N últimas linhas responderia as duas
  // por aproximação, que é como um broadcast escapa.
  const [{ data: seen, error: seenError }, { count, error: countError }] = await Promise.all([
    admin
      .from("push_broadcasts")
      .select("id")
      .eq("build_id", buildId ?? "")
      .maybeSingle(),
    admin.from("push_broadcasts").select("id", { count: "exact", head: true }),
  ]);
  if (seenError) throw new HttpError(500, `broadcast read failed: ${seenError.message}`);
  if (countError) throw new HttpError(500, `broadcast count failed: ${countError.message}`);

  const verdict = decideBroadcast({
    liveBuildId: buildId,
    alreadyNotified: seen !== null,
    isFirstRun: (count ?? 0) === 0,
    now: new Date(),
  });

  // "bootstrap" reivindica o build sem enviar nada: a primeira execução só
  // marca onde a operação está hoje.
  if (verdict === "bootstrap") {
    await admin
      .from("push_broadcasts")
      .upsert({ build_id: buildId, version }, { onConflict: "build_id", ignoreDuplicates: true });
    return json({ skipped: "bootstrap", buildId, version });
  }
  if (verdict !== "send") return json({ skipped: verdict, buildId });

  // Reivindica o build ANTES de enviar. `ignoreDuplicates` faz a corrida
  // devolver vazio para quem perdeu, em vez de levantar erro.
  const { data: claimed, error: claimError } = await admin
    .from("push_broadcasts")
    .upsert({ build_id: buildId, version }, { onConflict: "build_id", ignoreDuplicates: true })
    .select("id");
  if (claimError) throw new HttpError(500, `broadcast claim failed: ${claimError.message}`);
  const claim = (claimed ?? [])[0] as { id: string } | undefined;
  if (!claim) return json({ skipped: "already-notified", buildId });

  const { data: subscriptionData, error: subscriptionError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (subscriptionError) {
    throw new HttpError(500, `subscriptions read failed: ${subscriptionError.message}`);
  }
  const subscriptions = (subscriptionData ?? []) as ISubscriptionRow[];
  if (subscriptions.length === 0) return json({ sent: 0, skipped: "NO_SUBSCRIPTION", buildId });

  const vapid = await resolveVapid(resolveSecret);
  const payload = JSON.stringify(buildUpdateNotification(version));

  const results = await Promise.all(
    subscriptions.map(async (subscription) => ({
      subscription,
      result: await sendWebPush(subscription, payload, vapid),
    })),
  );

  const expired = results
    .filter((entry) => entry.result.isExpired)
    .map((entry) => entry.subscription.id);
  if (expired.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expired);
    ctx.log.info("pruned expired push subscriptions", { count: expired.length });
  }

  const delivered = results.filter(
    (entry) => entry.result.status >= 200 && entry.result.status < 300,
  );
  const failed = results.filter(
    (entry) => !entry.result.isExpired && (entry.result.status < 200 || entry.result.status >= 300),
  );
  if (failed.length > 0) {
    ctx.log.error("update broadcast failures", {
      failed: failed.map((entry) => ({ endpoint: entry.subscription.endpoint, ...entry.result })),
    });
  }

  await admin
    .from("push_broadcasts")
    .update({ sent_count: delivered.length, failed_count: failed.length })
    .eq("id", claim.id);

  return json({
    buildId,
    version,
    sent: delivered.length,
    expired: expired.length,
    failed: failed.length,
  });
});
