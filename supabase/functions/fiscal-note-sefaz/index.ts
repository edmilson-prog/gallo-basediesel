// PRD-216 (Tally) — origem 4: consulta à SEFAZ pela chave de acesso.
//
// NASCE DESLIGADA, e esta é a que tem o maior atrito das quatro: exige o
// certificado digital A1 da empresa, que é material jurídico, não configuração.
//
// A chave é validada AQUI antes de qualquer coisa — usando o mesmo módulo do
// navegador. Consultar a SEFAZ com uma chave de dígito verificador errado é
// gastar chamada para receber erro.

import { isValidNfeKey } from "../_shared/fiscal/nfeKey.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createSecretResolver } from "../_shared/secrets.ts";

const A1_CERTIFICATE_NAME = "SEFAZ_A1_CERTIFICATE";

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
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "unauthorized" }, 401);

  let accessKey: string;
  try {
    const body = (await req.json()) as { accessKey?: string };
    accessKey = (body.accessKey ?? "").replace(/\D/g, "");
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  // Barato e antes de tudo: chave inválida não merece uma ida à SEFAZ.
  if (!isValidNfeKey(accessKey)) {
    return json(
      {
        error: "invalid_access_key",
        message: "Chave de acesso inválida ou com dígito verificador incorreto.",
      },
      422,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: settings } = await supabase
    .from("fiscal_note_settings")
    .select("sefaz_enabled")
    .maybeSingle();

  if (!settings?.sefaz_enabled) {
    return json(
      {
        error: "source_disabled",
        reason: "sefaz_disabled",
        message: "A consulta à SEFAZ está desligada para esta loja.",
      },
      503,
    );
  }

  // O certificado sai do Vault, e o wrapper `integration_secret_get` só aceita
  // service_role — daí um cliente admin próprio. Ele NÃO substitui o de cima:
  // quem decide se esta loja pode consultar continua sendo a RLS, pelo cliente
  // do chamador. Este aqui existe só para ler o segredo.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const certificate = await createSecretResolver(admin)(A1_CERTIFICATE_NAME);
  if (!certificate) {
    return json(
      {
        error: "source_disabled",
        reason: "a1_certificate_missing",
        message:
          "A origem está ligada mas o certificado digital A1 não está cadastrado. Configure SEFAZ_A1_CERTIFICATE em Configurações → Integrações → Chaves & API. Sem ele a SEFAZ recusa a conexão.",
      },
      503,
    );
  }

  // O cliente SOAP da SEFAZ entra com o certificado. Até lá, a função é
  // honesta sobre o que falta em vez de simular uma resposta.
  return json(
    {
      error: "not_implemented",
      reason: "sefaz_client_pending",
      message: "Certificado presente; o cliente SOAP entra na ativação desta origem.",
    },
    501,
  );
});
