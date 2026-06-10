# Integrações & Chaves — gestão de segredos pela plataforma

> Feature entregue em 2026-06-10. Tela: **Configurações → Integrações → Chaves
> & API** (`/app/configuracoes/chaves`, Owner-only). Decisão do dono: chaves de
> API e parâmetros de integração são gerenciados **dentro da plataforma**, não
> pelo dashboard do Supabase.

## Modelo de segurança

1. **Vault do Supabase** (`supabase_vault`, já instalado): os valores ficam
   **criptografados** em `vault.secrets`. O schema `vault` não é exposto via
   PostgREST.
2. **Wrappers SECURITY DEFINER** (migration `20260610190000`):
   `integration_secret_set`, `integration_secret_get` e
   `integration_secrets_status` — `EXECUTE` revogado de `public`/`anon`/
   `authenticated` e concedido **apenas a `service_role`**. Nenhum papel do
   app (nem o Owner) lê ou grava segredo via API do banco; coberto pela suíte
   `supabase/tests/rls-regression.sql` (seção "Integrações & Chaves").
3. **Edge Function `integration-secrets`** (verify_jwt, owner-only): a única
   porta. Ações `list` (status sem valores) e `set` (upsert auditado).
4. **Write-only**: o valor viaja **uma vez** por HTTPS (tela → função) e nunca
   volta. A tela mostra apenas "Configurada em \<data\>" + os **4 últimos
   caracteres** como dica de reconhecimento (`right(secret, 4)` no status).
5. **Auditoria**: toda gravação gera `audit_logs` com action
   `integration_secret_set` (resource = nome da chave; o valor jamais é
   logado).

## Resolução em runtime (Vault-first)

`supabase/functions/_shared/secrets.ts` → `createSecretResolver(admin)`:

```
valor = Vault (rpc integration_secret_get)  →  se ausente: Deno.env.get(name)
```

- **Vault vence** quando os dois existem — rotacionar uma chave pela
  plataforma entra em vigor **sem redeploy**.
- **Fail-open para o env**: se o Vault estiver indisponível, o fallback de env
  mantém WhatsApp/e-mail no ar.
- Cache por resolver (um por request) — cada nome é lido no máximo uma vez.

Funções reescritas para o resolver:

| Função                | O que resolve via Vault                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `whatsapp-send`       | credenciais por conta (`<ref>_ACCESS_TOKEN`, `<ref>_API_KEY`, ...) via `IEngineDeps.resolveSecret`                                 |
| `whatsapp-webhook`    | idem + gates app-level (`WHATSAPP_META_APP_SECRET`, `WHATSAPP_META_VERIFY_TOKEN`, `<ref>_WEBHOOK_SECRET`, `EVOLUTION_ALLOWED_IPS`) |
| `invite-seller-email` | `RESEND_API_KEY`, `RESEND_FROM`, `INVITE_REDIRECT_URL` (a ausência da chave mantém o modo inerte)                                  |

## Catálogo da tela

`src/features/admin-settings/engine/integrationKeys.ts` (testado) monta os
grupos:

- **E-mail transacional (Resend)** — `RESEND_API_KEY`, `RESEND_FROM`,
  `INVITE_REDIRECT_URL`.
- **WhatsApp — Webhook (nível do app)** — `WHATSAPP_META_APP_SECRET`,
  `WHATSAPP_META_VERIFY_TOKEN`, `EVOLUTION_ALLOWED_IPS`.
- **Uma seção por conta WhatsApp** com `credentials_ref` válido — sufixos
  exatamente como os engines resolvem: Meta `_ACCESS_TOKEN`/`_APP_SECRET`/
  `_VERIFY_TOKEN`; Evolution `_API_KEY`/`_WEBHOOK_SECRET`.

Nomes obedecem `^[A-Z][A-Z0-9_]{2,64}$` (validado na tela, na função e no
SQL). Provedores futuros (ex.: NF-e) ganham grupo novo no catálogo.

## O que NÃO mora aqui (por natureza)

- **Secrets do GitHub Actions** (backups/CI — `SUPABASE_DB_URL` etc.): o
  GitHub roda fora da infra e não lê o Vault.
- **Variáveis de build da Vercel** (`VITE_*`, ex.: `VITE_SENTRY_DSN` do
  frontend, `VITE_DATA_SOURCE`): resolvidas em build-time.
- **`SUPABASE_SERVICE_ROLE_KEY`**: é a credencial que protege o cofre — não
  pode morar dentro dele.
- **`SENTRY_DSN` das Edge Functions**: lido no módulo `_shared/sentry.ts` em
  load-time (sync); segue como secret de env. Documentado como exceção.

## Rotação de chave (runbook curto)

1. Gere a chave nova no provedor (Resend, Meta, ...).
2. Configurações → Integrações → Chaves & API → **Substituir** → cole → Salvar.
3. Revogue a chave antiga no provedor.
4. Pronto — sem redeploy (Vault vence o env). A trilha fica em Auditoria.

## Troubleshooting

- **"forbidden: requires owner"** — apenas o perfil Owner gerencia chaves.
- **Chave salva mas integração ainda falha** — confira o **nome** (prefixo
  `credentials_ref` da conta + sufixo correto) e se a chave nova é válida no
  provedor; a tela mostra os 4 últimos caracteres para conferência.
- **Tela vazia no modo mock** — o gerenciamento só opera com
  `VITE_DATA_SOURCE=supabase`; em mock a tela exibe o catálogo, sem ações.
