// PRD-216 (Tally) — origem 2: upload com parse na Edge.
//
// Recebe o XML no corpo, valida com o MESMO parser do navegador (espelhado em
// _shared/fiscal/ por `bun run sync:fiscal`) e devolve a nota parseada mais o
// veredito de duplicidade. Não grava: quem cria a nota é o cliente, com o
// contexto de loja e fornecedor que ele já resolveu.
//
// Existe para que a validação fiscal possa sair do navegador sem duplicar
// regra — é para isto que o espelho existe.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { NfeParseError, parseNfe } from "../_shared/fiscal/nfeParser.ts";

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

  let xml: string;
  try {
    const body = (await req.json()) as { xml?: string };
    if (!body.xml) return json({ error: "missing_xml" }, 400);
    xml = body.xml;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  let parsed;
  try {
    parsed = parseNfe(xml);
  } catch (error) {
    // Erro de parse é resposta do usuário, não falha do servidor: o arquivo
    // que ele soltou não é uma NF-e válida.
    if (error instanceof NfeParseError) {
      return json({ error: "parse_failed", reason: error.message }, 422);
    }
    throw error;
  }

  // A checagem de duplicidade roda com o JWT do chamador, então a RLS confina
  // a busca à loja dele.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: existing, error } = await supabase
    .from("fiscal_notes")
    .select("id, number")
    .eq("access_key", parsed.accessKey)
    .maybeSingle();

  if (error) return json({ error: "lookup_failed", reason: error.message }, 500);
  if (existing) {
    return json({ error: "duplicate", noteId: existing.id, number: existing.number }, 409);
  }

  return json({ nfe: parsed });
});
