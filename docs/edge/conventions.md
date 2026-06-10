# Edge Functions — Convenções (PRD-102)

> Atualizado em 2026-06-09. Funções em `supabase/functions/<nome>/index.ts`;
> módulos compartilhados em `supabase/functions/_shared/`. Canário/template: `hello-trace`.

## Anatomia de uma função GALLO

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller, STAFF_ROLES } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

servePost(async (req, { log, traceId }) => {
  const { callerId, admin, profile } = await requireCaller(req, STAFF_ROLES);
  const body = await parseJsonBody(req);
  // ... validações: throw new HttpError(400, "mensagem") ...
  // ... mutações com o client `admin` (service_role) ...
  await bestEffortAudit(admin, { /* ... */ });
  log.info("done", { resourceId });
  return json({ ok: true }, 200);
});
```

## Módulos `_shared/`

| Módulo | Exporta | Responsabilidade |
| --- | --- | --- |
| `serve.ts` | `servePost(handler)` | Ciclo de vida: CORS preflight, gate de método, `traceId` (header `x-trace-id`, gerado se ausente), captura de `HttpError` → `{ error }`, erro inesperado → 500 opaco logado |
| `auth.ts` | `requireCaller(req, roles)`, `STAFF_ROLES` | Identifica o caller pelo JWT, abre client `service_role`, carrega o profile e impõe o papel. Lança 401/403 |
| `http.ts` | `json()`, `HttpError`, `parseJsonBody()` | Respostas JSON com CORS, erros tipados, parse de body (400 em JSON inválido) |
| `cors.ts` | `CORS`, `handleOptions()` | Superfície CORS única |
| `logger.ts` | `createLogger(traceId)` | Log estruturado (1 JSON por linha) correlacionado por traceId — pesquisável no logs explorer |
| `audit.ts` | `bestEffortAudit(admin, entry)` | Auditoria que nunca derruba a operação principal |
| `env.ts` | `requiredEnv()`, `optionalEnv()` | Env fail-fast no boot vs opcional |

## Regras

1. **`verify_jwt: true` sempre** (gate do gateway) + `requireCaller` no corpo (defence-in-depth).
   Nunca desabilitar o verify_jwt sem decisão explícita do dono.
2. **`service_role` apenas server-side** — vem de `Deno.env` da função; jamais no browser.
3. **Erros**: `throw new HttpError(status, "mensagem")`. Mensagens são contrato com o client —
   não alterar strings existentes sem revisar os call sites em `src/features/admin-settings/api/`.
4. **Mutações multi-passo**: rollback manual no erro (ex.: criar auth user → falhar profile →
   `deleteUser`). Nenhum orfão.
5. **Auditoria**: toda mutação privilegiada chama `bestEffortAudit` (action `recurso.evento`).
6. **Logs**: use o `log` do contexto (nunca `console.log` cru) — mantém o traceId.

## Deploy

- **Via MCP** (fluxo atual): `deploy_edge_function` com `files` = `<fn>/index.ts` + todos os
  `_shared/*.ts`, `entrypoint_path` = `<fn>/index.ts`. Preserva os imports `../_shared/`.
- **Via CLI / CI**: `supabase functions deploy` (bundla `../_shared` nativamente).
  Workflow: `.github/workflows/edge-deploy.yml` (no-op até os secrets, issue #45).
- **Fonte versionada é o Git** — o que está deployado deve sempre espelhar `supabase/functions/`.

## Smoke test pós-deploy

```powershell
# 401 {"error":"invalid session"} + header x-trace-id = função bootou e o pipeline roda.
curl.exe -s -i -X POST https://<ref>.supabase.co/functions/v1/<fn> `
  -H "Authorization: Bearer <ANON_JWT_LEGADA>" -H "apikey: <ANON_JWT_LEGADA>" `
  -H "Content-Type: application/json" -d '{}'
```

Com um JWT de usuário real (login no app), `hello-trace` responde 200 com o eco do caller.

## Funções existentes

| Função | Papel exigido | O que faz |
| --- | --- | --- |
| `hello-trace` | qualquer profile | Canário/template dos patterns (sem mutação) |
| `invite-seller` | owner/manager | Cria acesso (senha temporária) + profile |
| `invite-seller-email` | owner/manager | Convite por e-mail via Resend (inerte sem `RESEND_API_KEY`, issue #46) |
| `reset-seller-password` | owner/manager | Redefine senha temporária |
| `set-seller-access` | owner/manager | Desliga/reativa login (ban reversível) |
| `set-seller-role` | owner | Troca papel (sincroniza `sellers.type`) |
