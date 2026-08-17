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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  // O segredo vive no Vault, resolvido pela função integration-secrets. Sem
  // ele não há como abrir a caixa — e não adianta tentar.
  const credential = Deno.env.get("FISCAL_INBOX_CREDENTIAL");
  if (!credential) {
    return json(
      {
        error: "source_disabled",
        reason: "email_credentials_missing",
        message:
          "A origem está ligada mas a credencial da caixa não está no Vault. Cadastre FISCAL_INBOX_CREDENTIAL antes de agendar esta função.",
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
