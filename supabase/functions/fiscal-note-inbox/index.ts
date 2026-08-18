// PRD-216 (Tally) — origem 3: caixa de e-mail monitorada.
//
// NASCE DESLIGADA. A função existe inteira, mas responde 503 com o motivo
// enquanto duas coisas faltarem: o switch `email_enabled` da loja e a
// credencial da caixa no Vault.
//
// Responder 503 com motivo legível é deliberado: quem ligar o switch sem
// cadastrar a credencial precisa descobrir isso pela resposta, não por um
// stack trace.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";

const WORKER_SECRET_NAME = "FISCAL_INBOX_WORKER_SECRET";
const INBOX_CREDENTIAL_NAME = "FISCAL_INBOX_CREDENTIAL";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // x-worker-secret é o portão desta função — precisa ser declarado aqui, ou o
  // preflight derruba qualquer chamada cross-origin antes do handler rodar.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return json({ error: "misconfigured" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

  // Um resolver por request: o cache é por instância, então a credencial lida
  // mais abaixo não paga uma segunda ida ao Vault.
  const resolveSecret = createSecretResolver(supabase);

  // Esta função roda com service_role — ela ignora RLS. Sem este portão,
  // qualquer usuário autenticado poderia dispará-la. Mesmo padrão do
  // nps-scheduler: segredo no Vault, comparado em tempo constante.
  const expected = await resolveSecret(WORKER_SECRET_NAME);
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!verifyWorkerSecret(provided, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const { data: settings } = await supabase
    .from("fiscal_note_settings")
    .select("store_id, email_enabled, inbox_address")
    .eq("email_enabled", true);

  if (!settings || settings.length === 0) {
    return json(
      {
        error: "source_disabled",
        reason: "email_disabled",
        message: "Nenhuma loja com a origem de e-mail ligada em fiscal_note_settings.",
      },
      503,
    );
  }

  // Vault primeiro, env como reserva — cadastrar em Configurações →
  // Integrações → Chaves & API passa a valer sem redeploy. Sem a credencial
  // não há como abrir a caixa, e não adianta tentar.
  const credential = await resolveSecret(INBOX_CREDENTIAL_NAME);
  if (!credential) {
    return json(
      {
        error: "source_disabled",
        reason: "email_credentials_missing",
        message:
          "A origem está ligada mas a credencial da caixa não está cadastrada. Configure FISCAL_INBOX_CREDENTIAL em Configurações → Integrações → Chaves & API antes de agendar esta função.",
        stores: settings.map((s) => s.store_id),
      },
      503,
    );
  }

  // A leitura da caixa entra quando a credencial existir. Até lá, a função
  // documenta o contrato em vez de fingir que funciona.
  return json(
    {
      error: "not_implemented",
      reason: "inbox_reader_pending",
      message: "Credencial presente; o leitor de caixa entra na ativação desta origem.",
    },
    501,
  );
});
