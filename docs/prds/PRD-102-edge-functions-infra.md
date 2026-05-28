# PRD-102: Edge Functions — Infraestrutura

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                                                                                                                           |
| **Repositório**       | _Repositório vivo da Fase 1, diretório `supabase/functions/`_                                                                                                                                                                                                                                                                                                                                                                                      |
| **Objetivo**          | Estabelecer o padrão canônico para lógica server-side em Supabase Edge Functions (runtime Deno): estrutura de pastas, propagação de contexto de autenticação, error handling padronizado, logging estruturado, middleware de idempotência, CORS, pipeline de deploy CI/CD e function-canário "hello-trace" demonstrando os patterns. **Não implementa nenhuma function de negócio** — entrega a infra reutilizável que será consumida por Ondas 5+ |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Complexidade**      | Média                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Total de Fases**    | 4                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Prioridade**        | P0 — bloqueante para Ondas 5+ (webhooks WhatsApp, syncs DINTEC, pagamentos, notificações, LLM gateway)                                                                                                                                                                                                                                                                                                                                             |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                                                                                                                                                                                                     |
| **PRDs Relacionados** | PRD-100 (Setup — pré-requisito); PRD-101 (Schema — usa `crm.processed_events`, `crm.integration_logs`, `crm.audit_logs`); PRD-103 (RLS); PRD-107 (Auth — fonte do JWT que functions consomem); PRD-110 (Monitoring — consome logs estruturados deste PRD)                                                                                                                                                                                          |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Padrão de código**  | TypeScript Deno; functions em kebab-case; código compartilhado em `supabase/functions/_shared/`                                                                                                                                                                                                                                                                                                                                                    |

### Critérios de Complexidade

> **Justificativa de Média:** o PRD não implementa lógica de negócio, mas estabelece **padrões de infraestrutura que serão replicados em todas as Edge Functions futuras** (estimativa: 20–40 functions ao longo da Fase 2). Acertar aqui evita retrabalho em ondas posteriores. Envolve: convenções de pastas, middleware composável (auth + log + idempotência + erros), pipeline CI, runtime Deno (não Node), e function-canário operacional como template literal. Complexidade técnica média; risco de inconsistência caso patterns saiam fracos.

---

## Contexto do Problema

A Fase 2 vai precisar de **muita lógica server-side**:

- Receber webhooks (WhatsApp Meta, PIX, gateways de pagamento)
- Disparar requisições para providers externos (DINTEC export, NFe.io, Asaas, Mercado Pago, Resend, OpenAI/Anthropic/OpenRouter)
- Sincronizar dados (CSV DINTEC, batch jobs)
- Operações privilegiadas que bypassam RLS (admin de feature flags, refresh de view `storefront.products`)
- Audit log estruturado (gravar em `crm.audit_logs` a partir de eventos cross-system)

Supabase Edge Functions (runtime Deno isolate) são a opção natural — baixa latência, deploy simples, integradas ao mesmo ambiente do banco e Auth.

O risco é: **se cada PRD futuro reescreve seu próprio boilerplate** (extrair JWT, fazer log, tratar erro, lidar com CORS), o codebase vira inconsistente. Este PRD entrega **uma biblioteca interna de utilitários** em `supabase/functions/_shared/` que toda function da Fase 2 vai consumir.

---

## Conceito da Solução

### Arquitetura

```
supabase/
├── config.toml
├── migrations/
└── functions/
    ├── _shared/              ← módulo compartilhado (não é function — não deployado)
    │   ├── auth.ts           ← extrai e valida JWT, retorna IAuthContext
    │   ├── errors.ts         ← AppError class + responseFromError()
    │   ├── logger.ts         ← logger estruturado JSON
    │   ├── idempotency.ts    ← withIdempotency() middleware
    │   ├── cors.ts           ← cors() helper + OPTIONS handler
    │   ├── audit.ts          ← writeAuditLog() helper
    │   ├── integration-log.ts← writeIntegrationLog() helper
    │   ├── trace.ts          ← gerador de traceId + propagação
    │   ├── env.ts            ← validação de variáveis de ambiente obrigatórias
    │   └── types.ts          ← tipos compartilhados (IAuthContext, etc.)
    └── hello-trace/          ← function-canário (deployada)
        └── index.ts
```

### Estrutura típica de uma function consumindo o \_shared

```typescript
// supabase/functions/hello-trace/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { withAuth } from "../_shared/auth.ts";
import { withCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { AppError, responseFromError } from "../_shared/errors.ts";
import { newTraceId } from "../_shared/trace.ts";

const FUNCTION_NAME = "hello-trace";
const FUNCTION_VERSION = "1.0.0";

serve(async (req: Request) => {
  // 1. CORS preflight
  const corsResponse = withCors(req);
  if (corsResponse) return corsResponse;

  // 2. Trace ID
  const traceId = req.headers.get("x-trace-id") ?? newTraceId();
  const log = createLogger({ functionName: FUNCTION_NAME, version: FUNCTION_VERSION, traceId });

  try {
    // 3. Auth
    const ctx = await withAuth(req, log);
    log.info("Authenticated", { userId: ctx.userId, storeId: ctx.storeId, role: ctx.role });

    // 4. Lógica da function (neste caso, devolve o context para validação)
    const payload = {
      message: "Hello, trace!",
      traceId,
      authContext: {
        userId: ctx.userId,
        sellerId: ctx.sellerId,
        storeId: ctx.storeId,
        role: ctx.role,
      },
      timestamp: new Date().toISOString(),
    };

    log.info("Success", { durationMs: Date.now() - log.startTime });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json", "x-trace-id": traceId },
    });
  } catch (err) {
    log.error("Failed", { error: err });
    return responseFromError(err, traceId);
  }
});
```

### Princípios

| Princípio                           | Implementação                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth context propagation (§4.3)** | Middleware `withAuth()` extrai JWT, valida, retorna `IAuthContext`. Failure = 401 padronizado                                                                             |
| **Error handling padronizado**      | Class `AppError` com `code`, `httpStatus`, `userMessage`, `internalMessage`. `responseFromError()` converte em response HTTP                                              |
| **Logging estruturado (§4.10)**     | Logger JSON com `traceId`, `userId`, `storeId`, `functionName`, `version`, `durationMs`, `outcome`. Lidos pelo Supabase Dashboard + futuramente Logflare/Sentry (PRD-110) |
| **Idempotência (§4.7)**             | Middleware opcional `withIdempotency()` que consulta/escreve em `crm.processed_events`. Aplicável a webhooks, syncs, pagamentos                                           |
| **CORS**                            | Helper `withCors()` lida com OPTIONS preflight e adiciona headers em todas as responses                                                                                   |
| **Audit log facilitado**            | Helper `writeAuditLog()` que grava em `crm.audit_logs` respeitando schema imutável                                                                                        |
| **Integration log facilitado**      | Helper `writeIntegrationLog()` para chamadas a providers externos (DINTEC, Asaas, Meta, LLMs)                                                                             |
| **Versionamento**                   | Cada function exporta `FUNCTION_VERSION` constante; aparece em todo log; ajuda correlação de bugs                                                                         |
| **Tipagem Deno explícita**          | Sem `any`. Tipos vêm de `_shared/types.ts` + tipos gerados pelo PRD-101 (`src/types/supabase.generated.ts` shared via path)                                               |

### Alternativas Consideradas

| Alternativa                                                      | Por que descartada                                                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework completo (e.g. Hono, Oak)                              | Adiciona dependência sem ganho real no MVP. Deno `serve` puro + 9 módulos `_shared` cobrem 100% dos casos                                       |
| Lógica server-side em Vercel API Routes / Next.js Server Actions | Frontend é SPA Vite, não Next.js. Edge Functions Supabase têm acesso direto ao banco com `service_role` sem precisar passar JWT externo         |
| Funções armazenadas (PL/pgSQL) para tudo                         | Lógica complexa em PL/pgSQL é difícil de testar e versionar. Reservar PL/pgSQL para funções utilitárias (`set_updated_at`, `current_seller_id`) |
| Cada function reimplementa boilerplate                           | Inconsistência inevitável. `_shared` resolve no MVP                                                                                             |
| Auth manual por function (validar JWT na mão)                    | Bug-prone. Middleware centralizado é a única forma sensata                                                                                      |
| Logs em texto livre                                              | Impossível agregação. JSON estruturado desde dia 1                                                                                              |
| Idempotência on-demand (cada function escreve sua lógica)        | Webhooks e syncs vão ter 5–10 functions; centralizar via middleware reduz dramatic                                                              |

---

## Escopo

### Incluído

- ✅ Diretório `supabase/functions/_shared/` com 9 módulos: `auth.ts`, `errors.ts`, `logger.ts`, `idempotency.ts`, `cors.ts`, `audit.ts`, `integration-log.ts`, `trace.ts`, `env.ts`, `types.ts`
- ✅ Function-canário `supabase/functions/hello-trace/` deployada nos 2 ambientes (staging + prod) — demonstra todos os patterns + serve de template literal copiável
- ✅ `supabase/functions/deno.json` (ou `import_map.json`) padronizando imports
- ✅ `supabase/functions/.env.example` listando todas as variáveis de ambiente esperadas
- ✅ Workflow `.github/workflows/edge-deploy.yml` que faz deploy de functions automaticamente em push para `staging` e `main`
- ✅ Documentação `docs/edge/conventions.md` com guia "como criar uma nova function Edge"
- ✅ Documentação `docs/edge/_shared-api.md` com referência de cada módulo `_shared`
- ✅ Testes unitários para os módulos `_shared` (especialmente `auth`, `errors`, `idempotency`) — `deno test`
- ✅ Validação E2E: function `hello-trace` chamada autenticada retorna 200 com `authContext` correto em ambos ambientes
- ✅ Validação E2E: function `hello-trace` chamada não-autenticada retorna 401 padronizado

### Excluído

- ❌ Nenhuma function de negócio (webhook WhatsApp, sync DINTEC, etc.) — vêm em PRDs específicos das Ondas 5+
- ❌ Cron/Scheduled functions — `pg_cron` será usado nos PRDs específicos; este PRD não estabelece padrão de schedule (vira PRD-105 ou PRD-110 conforme necessidade)
- ❌ Rate limiting de functions — cada Edge Function já tem rate limit nativo do Supabase; throttle de aplicação fica para PRDs específicos
- ❌ Cache de respostas — não há use case no MVP que justifique
- ❌ Versionamento de API (`/v1`, `/v2`) — todas as functions são v1 implícito. PRD-199 (API Pública, Onda 13) define versionamento se necessário
- ❌ OpenAPI/Swagger spec das functions — manualmente em `docs/edge/` se necessário; não há auto-gen
- ❌ Multi-region deploy — Supabase Edge Functions já são edge-native; região São Paulo é padrão

---

## Requisitos Funcionais

### Estrutura e Configuração

- **RF-001:** Diretório `supabase/functions/_shared/` criado. **Não é uma function deployada** — é módulo compartilhado importado por outras functions via path relativo `../_shared/<modulo>.ts`.
- **RF-002:** Arquivo `supabase/functions/deno.json` configurando:
  - `imports` (alias para `std@0.224.0` e outras libs comuns como `jose` para JWT)
  - `tasks` (`dev`, `test`, `lint`)
  - `fmt` (Deno fmt config)
- **RF-003:** Arquivo `supabase/functions/.env.example` listando variáveis de ambiente esperadas por functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `ALLOWED_ORIGINS` (CORS), `LOG_LEVEL` (`debug|info|warn|error`).
- **RF-004:** Cada function tem `index.ts` como entrypoint. **Sem subarquivos** dentro de uma function — se a function fica grande, é sinal de extrair lógica para `_shared` ou Postgres function. Function "atômica e pequena" é o padrão.

### Módulo `_shared/auth.ts`

- **RF-010:** Função `withAuth(req: Request, logger: Logger): Promise<IAuthContext>` que:
  1. Extrai header `Authorization: Bearer <jwt>`
  2. Valida o JWT contra `SUPABASE_JWT_SECRET` usando lib `jose`
  3. Decodifica os claims: `sub` (auth.users.id), `email`, `role`, custom claims (`seller_id`, `store_id`, `seller_role`)
  4. Retorna `IAuthContext { userId, sellerId, storeId, role, email, claims }`
  5. Lança `AppError('UNAUTHORIZED', 401, 'Token inválido ou ausente')` em falha
- **RF-011:** Função `withServiceRole(req: Request): Promise<void>` para functions que exigem `service_role` (admin/webhook). Valida que o token apresentado é a `SERVICE_ROLE_KEY`. Lança `AppError('FORBIDDEN', 403, ...)` se não for.
- **RF-012:** Função `withOptionalAuth(req: Request, logger: Logger): Promise<IAuthContext | null>` para functions que aceitam autenticado **e** anônimo (raro, mas útil para algumas integrações de e-commerce).
- **RF-013:** Definir tipo `IAuthContext` em `_shared/types.ts`:
  ```typescript
  export interface IAuthContext {
    userId: string; // auth.users.id
    sellerId: string | null; // crm.sellers.id (null se cliente B2C ou anônimo)
    storeId: string | null; // crm.stores.id
    role:
      | "owner"
      | "manager"
      | "seller_internal"
      | "seller_external"
      | "b2b_customer"
      | "b2c_customer"
      | "system";
    email: string;
    claims: Record<string, unknown>;
  }
  ```

### Módulo `_shared/errors.ts`

- **RF-020:** Classe `AppError extends Error` com:
  - `code: string` — código semântico (`UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION_ERROR`, `INTEGRATION_ERROR`, `IDEMPOTENCY_KEY_EXISTS`, `RATE_LIMITED`, `INTERNAL_ERROR`)
  - `httpStatus: number` — 400, 401, 403, 404, 409, 422, 429, 500, 502, 503
  - `userMessage: string` — mensagem segura para frontend
  - `internalMessage: string` — detalhe para log/debug, nunca exposto ao usuário
  - `context?: Record<string, unknown>` — payload extra para log
- **RF-021:** Função `responseFromError(err: unknown, traceId: string): Response` que:
  1. Se `err instanceof AppError`: retorna response com `httpStatus`, body `{ code, userMessage, traceId }`
  2. Se `err` é desconhecido: retorna 500 com body `{ code: 'INTERNAL_ERROR', userMessage: 'Erro interno', traceId }` — **nunca expor stack trace ou internal message**
  3. Em **todos os casos**, registra log estruturado com nível `error` e `internalMessage` + stack
- **RF-022:** Helpers de erro semânticos: `unauthorizedError()`, `forbiddenError()`, `notFoundError(entity, id)`, `validationError(field, reason)`, `integrationError(provider, status, detail)`, `idempotencyKeyExists(key)`, `internalError(detail)`.

### Módulo `_shared/logger.ts`

- **RF-030:** Função `createLogger(context: LoggerContext): Logger` onde:
  - `LoggerContext = { functionName: string, version: string, traceId: string, userId?: string, storeId?: string }`
  - `Logger = { debug, info, warn, error, startTime, withContext }`
- **RF-031:** Cada chamada de log produz output JSON estruturado:
  ```json
  {
    "timestamp": "2026-05-27T10:00:00.000Z",
    "level": "info",
    "functionName": "hello-trace",
    "version": "1.0.0",
    "traceId": "01H...ULID",
    "userId": "uuid",
    "storeId": "uuid",
    "message": "Authenticated",
    "context": {}
  }
  ```
- **RF-032:** Nível padrão = `info`. Configurável via env `LOG_LEVEL`. Filtragem por nível faz-se antes de serializar (performance).
- **RF-033:** Tempos: `logger.startTime` registra o início da function; cada log automaticamente inclui `elapsedMs` desde start. Permite medir latência sem instrumentação extra.
- **RF-034:** Método `logger.withContext(extra: Record<string, unknown>): Logger` retorna logger filho com contexto adicional (útil para sub-fluxos: provedor externo, sub-passos de processamento).

### Módulo `_shared/idempotency.ts`

- **RF-040:** Função `withIdempotency(key: string, ctx: { logger: Logger }, work: () => Promise<T>): Promise<T>` que:
  1. Consulta `crm.processed_events` com `event_key = key`
  2. Se existe: retorna `result_summary` cached (sem reexecutar `work`)
  3. Se não existe: executa `work()`, grava resultado em `crm.processed_events` (`event_key`, `processed_at`, `result_summary`), retorna
  4. Em caso de erro durante `work()`: **não** grava em `processed_events` (permite retry); registra log
  5. Concurrency: usa `INSERT ... ON CONFLICT DO NOTHING` para detectar race (dois eventos chegando ao mesmo tempo)
- **RF-041:** `event_key` deve ser:
  - Para webhooks: hash do payload + provider name (`sha256(provider:payload)`)
  - Para syncs: identificador único do arquivo/batch (`dintec_csv:filename:checksum`)
  - Para pagamentos: payment provider transaction id (`asaas:txn_xxx`)
  - Documentado pelo PRD que consome o middleware
- **RF-042:** TTL de retenção: `processed_events` não expira automaticamente no MVP. PRD-108 (Performance) ou PRD-191 (LGPD avançado) podem adicionar TTL (default sugerido: 90 dias). Por enquanto, tabela cresce.

### Módulo `_shared/cors.ts`

- **RF-050:** Função `withCors(req: Request): Response | null` retorna:
  - Se `req.method === 'OPTIONS'`: response 204 com headers CORS apropriados
  - Senão: `null` (caller continua processando)
- **RF-051:** Headers CORS aplicados:
  - `Access-Control-Allow-Origin`: validado contra lista em env `ALLOWED_ORIGINS` (default em prod: `https://gallo.app`; em staging: `https://staging.gallo.app`; em dev: `*` com warning no log)
  - `Access-Control-Allow-Methods`: `GET, POST, PATCH, DELETE, OPTIONS`
  - `Access-Control-Allow-Headers`: `Content-Type, Authorization, x-trace-id, x-idempotency-key`
  - `Access-Control-Max-Age`: `86400` (24h)
- **RF-052:** Função `addCorsHeaders(response: Response): Response` para adicionar headers a responses normais (não-OPTIONS). Functions devem usar esse helper antes de retornar.

### Módulo `_shared/audit.ts`

- **RF-060:** Função `writeAuditLog(input: AuditLogInput, ctx: { logger: Logger }): Promise<void>` que insere em `crm.audit_logs` (via service_role internamente).
- **RF-061:** Input:
  ```typescript
  interface AuditLogInput {
    actorId?: string                  // crm.sellers.id; null para system/integration
    actorType: 'seller' | 'customer' | 'system' | 'llm' | 'integration'
    entityType: string                // ex: 'order', 'commission', 'feature_flag'
    entityId?: string
    action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'reject' | ...
    payload?: Record<string, unknown>
    traceId: string
    integrationContext?: Record<string, unknown>
  }
  ```
- **RF-062:** `payloadHash` calculado automaticamente (sha256 do `payload`) para fins de detecção de duplicatas. Não é unique constraint, apenas para forensics.
- **RF-063:** Em caso de falha ao escrever audit log (banco fora?), registra `logger.error('Audit log failed')` e continua o fluxo — audit log não deve **bloquear** operação principal. PRD-110 (Monitoring) alerta sobre essas falhas.

### Módulo `_shared/integration-log.ts`

- **RF-070:** Função `writeIntegrationLog(input: IntegrationLogInput): Promise<void>` que insere em `crm.integration_logs`.
- **RF-071:** Input inclui: `integrationName`, `direction` (inbound/outbound), `endpoint`, `httpStatus`, `requestPayload`, `responsePayload`, `latencyMs`, `errorMessage`, `traceId`.
- **RF-072:** Função wrapper `withIntegrationLog<T>(name: string, endpoint: string, ctx: { logger: Logger, traceId: string }, work: () => Promise<{ status: number; data: T }>): Promise<T>` que faz outbound + log automaticamente. Útil para chamadas a provedores externos.

### Módulo `_shared/trace.ts`

- **RF-080:** Função `newTraceId(): string` gera ULID (preferido sobre UUID por ser ordenável temporalmente). Lib: `https://deno.land/x/ulid@v0.3.0/mod.ts`.
- **RF-081:** Função `extractTraceId(req: Request): string` lê `x-trace-id` do header; se ausente, retorna `newTraceId()`.
- **RF-082:** Todo log e response carrega `traceId`. Frontend captura traceId em erros para mostrar ao usuário e ajudar suporte.

### Módulo `_shared/env.ts`

- **RF-090:** Função `getRequiredEnv(name: string): string` que lê `Deno.env.get(name)` e lança `AppError` se vazio/undefined.
- **RF-091:** Função `getOptionalEnv(name: string, fallback: string): string`.
- **RF-092:** Validação de boot: ao subir uma function, ela chama uma `validateEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', ...])` no início. Se falta env, function não responde — falha rápido.

### Function-canário `hello-trace`

- **RF-100:** Function em `supabase/functions/hello-trace/index.ts` que:
  - Espera GET ou POST
  - Aceita header `x-trace-id` opcional
  - Exige auth (usa `withAuth`)
  - Retorna 200 com payload `{ message, traceId, authContext, timestamp }`
  - Não persiste nada
  - Demonstra todos os patterns do `_shared`
- **RF-101:** Function deve ser deployada em ambos os projetos via workflow `edge-deploy.yml`.
- **RF-102:** Acessível via:
  - Staging: `https://<project-ref-staging>.supabase.co/functions/v1/hello-trace`
  - Prod: `https://<project-ref-prod>.supabase.co/functions/v1/hello-trace`
- **RF-103:** Smoke test no CI: após deploy, chamar a function com curl + JWT de teste e validar response 200. Falha aborta o deploy.

### Pipeline CI/CD

- **RF-110:** Workflow `.github/workflows/edge-deploy.yml` que:
  - Dispara em push para `staging` (deploy em staging) e `main` (deploy em prod)
  - Filtra paths: apenas se `supabase/functions/**` mudou
  - Setup Supabase CLI via action oficial
  - Link com o projeto correto
  - `supabase functions deploy <function-name>` para cada function modificada (ou `--all` se preferível)
  - Smoke test de `hello-trace` após cada deploy
  - Em falha: aborta deploy Vercel (dependência no CD do front)
- **RF-111:** GitHub Secrets reutilizados do PRD-100: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF_STAGING`, `SUPABASE_PROJECT_REF_PROD`.
- **RF-112:** Tempo total do workflow < 5min no caso médio.

### Testes Unitários

- **RF-120:** Diretório `supabase/functions/_shared/__tests__/` com testes Deno para:
  - `auth.test.ts`: JWT válido retorna context; JWT inválido lança AppError; JWT expirado idem
  - `errors.test.ts`: `responseFromError` converte AppError corretamente; converte erro desconhecido para 500 sem vazar stack
  - `idempotency.test.ts`: chamada inicial executa work; segunda chamada com mesma key retorna cache; race condition (2 concorrentes) só executa work uma vez
  - `cors.test.ts`: OPTIONS retorna headers corretos; origin não permitido retorna 403
- **RF-121:** Execução local: `cd supabase/functions && deno task test`
- **RF-122:** CI executa testes antes do deploy. Falha aborta tudo.

### Documentação

- **RF-130:** `docs/edge/conventions.md` com:
  - Como criar uma nova function (passo a passo)
  - Template de `index.ts` baseado em `hello-trace`
  - Convenções de naming, versionamento, logging
  - Quando usar `withAuth` vs `withServiceRole` vs `withOptionalAuth`
  - Quando usar `withIdempotency`
- **RF-131:** `docs/edge/_shared-api.md` com:
  - Referência completa de cada módulo `_shared`
  - Exemplos de uso de cada função
  - Tipos exportados

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance — cold start):** Edge Function deve responder em < 500ms p95 mesmo em cold start. Mínimo de imports diretos no `index.ts` (deferir o que possível).
- **RNF-002 (Performance — warm):** Function warm < 100ms p95 para `hello-trace` (sem I/O externo).
- **RNF-003 (Segurança — JWT):** Validação de JWT usa `SUPABASE_JWT_SECRET` (nunca `ANON_KEY` ou `SERVICE_ROLE_KEY` para esse fim). Lib `jose` é o padrão.
- **RNF-004 (Segurança — service role):** `SUPABASE_SERVICE_ROLE_KEY` é acessada apenas via `Deno.env.get` e nunca logada, nem em modo debug. `logger` deve sanitizar valores marcados como sensíveis.
- **RNF-005 (Observabilidade):** Logs estruturados JSON são consumíveis pelo Supabase Dashboard (Logs Explorer) e prontos para Logflare/Datadog/Sentry quando PRD-110 ativar.
- **RNF-006 (Manutenibilidade):** Toda function tem entre 50 e 200 linhas. Acima disso, refatorar para `_shared` ou múltiplas functions.
- **RNF-007 (Atualização de Deno):** Deno version pinned em `deno.json`. Bump de versão exige PR explícito com validação.
- **RNF-008 (Idempotência — concorrência):** `withIdempotency` deve ser thread-safe contra duas requisições simultâneas com mesma key (Postgres `INSERT ... ON CONFLICT` resolve).

---

## Critérios de Aceitação

### RF-100 + RF-101 + RF-103: hello-trace operacional

```gherkin
DADO que o PRD-100 está completo e ambos projetos Supabase existem
  E o workflow edge-deploy.yml está configurado
QUANDO o desenvolvedor faz push de supabase/functions/hello-trace para staging
ENTÃO o workflow CI executa
  E faz supabase functions deploy hello-trace --project-ref <staging>
  E executa smoke test: curl com JWT válido contra a URL da function
  E recebe 200 OK com payload contendo authContext
  E o workflow passa
```

### RF-010 + RF-022: Auth retorna contexto correto

```gherkin
DADO um JWT válido contendo custom_claims = { seller_id: "X", store_id: "Y", seller_role: "manager" }
QUANDO uma function chama withAuth(req, logger)
ENTÃO recebe IAuthContext com sellerId="X", storeId="Y", role="manager"
  E nenhum erro é lançado

DADO um request sem header Authorization
QUANDO uma function chama withAuth(req, logger)
ENTÃO lança AppError com code="UNAUTHORIZED" e httpStatus=401
  E a function retorna 401 com body { code, userMessage, traceId }
```

### RF-021: Erros não vazam internal info

```gherkin
DADO uma function que lança new Error("DATABASE_PASSWORD=secret123")
QUANDO responseFromError é chamado
ENTÃO retorna response 500 com body { code: "INTERNAL_ERROR", userMessage: "Erro interno", traceId }
  E o body NÃO contém "DATABASE_PASSWORD"
  E o body NÃO contém stack trace
  E o log estruturado registra o erro completo (apenas server-side)
```

### RF-040 + RF-042: Idempotency funciona

```gherkin
DADO uma function que usa withIdempotency com key="webhook:abc123"
QUANDO recebe a primeira requisição
ENTÃO executa work() normalmente
  E grava resultado em crm.processed_events
  E retorna resultado

QUANDO recebe segunda requisição com mesma key
ENTÃO NÃO executa work() novamente
  E retorna cached result_summary
  E o latency é < 50ms (cache hit)
```

### RF-031 + RF-032: Logs estruturados

```gherkin
DADO uma function chamada com LOG_LEVEL=info
QUANDO o logger.debug é chamado
ENTÃO o log NÃO é emitido (filtrado por nível)

QUANDO o logger.info é chamado com message="Authenticated"
ENTÃO o log JSON contém { timestamp, level: "info", functionName, version, traceId, userId, storeId, message: "Authenticated" }
  E aparece no Supabase Dashboard → Logs
```

### RF-050: CORS handler

```gherkin
DADO uma function deployada
QUANDO um browser envia OPTIONS preflight com Origin "https://gallo.app"
ENTÃO recebe 204 No Content
  E headers Access-Control-Allow-Origin: https://gallo.app
  E Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS

QUANDO um browser envia OPTIONS com Origin "https://malicious.com"
ENTÃO recebe 204 mas SEM o header Access-Control-Allow-Origin
  E browser bloqueia a request real
```

### RF-120 + RF-122: Testes passam

```gherkin
DADO o ambiente local Deno configurado
QUANDO o desenvolvedor executa cd supabase/functions && deno task test
ENTÃO todos os testes em _shared/__tests__/ passam
  E o coverage de auth.ts, errors.ts, idempotency.ts é >= 80%

DADO um PR mudando _shared/auth.ts com teste quebrado
QUANDO o workflow edge-deploy.yml executa
ENTÃO os testes falham e o deploy é abortado
```

---

## Fases de Implementação

### Fase 1 — Módulos `_shared` core (2 dias)

- Criar `supabase/functions/_shared/` com módulos: `types.ts`, `env.ts`, `trace.ts`, `errors.ts`, `logger.ts`, `cors.ts`
- Validar com testes unitários iniciais
- Documentar em `docs/edge/_shared-api.md`

### Fase 2 — Auth e middleware (1 dia)

- Implementar `_shared/auth.ts` (withAuth, withServiceRole, withOptionalAuth)
- Implementar `_shared/idempotency.ts` (withIdempotency)
- Implementar `_shared/audit.ts` e `_shared/integration-log.ts`
- Testes unitários

### Fase 3 — Function-canário + Deploy CI (1 dia)

- Implementar `supabase/functions/hello-trace/index.ts`
- Escrever `.github/workflows/edge-deploy.yml`
- Configurar GitHub Secrets (reuso do PRD-100)
- Validar deploy em staging
- Smoke test E2E manual + automatizado

### Fase 4 — Documentação + Handoff (meio dia)

- Escrever `docs/edge/conventions.md`
- Completar `docs/edge/_shared-api.md`
- Deploy em prod
- Demo para Edmilson + Frederico
- Marcar como `_DONE`

---

## Dependências

### PRDs

- **Bloqueia:** PRD-114 (Webhook WhatsApp), PRDs da Onda 5+ (todos consomem `_shared`)
- **Depende de:**
  - **PRD-100** (Setup Supabase — projetos existem)
  - **PRD-101** (Schema — `crm.processed_events`, `crm.integration_logs`, `crm.audit_logs` precisam existir)
  - PRD-107 (Auth — embora `withAuth` use `JWT_SECRET` direto, custom claims são populados pelo PRD-107). **Workaround:** este PRD pode entregar com JWT padrão Supabase (sem custom claims) e `withAuth` retornar `sellerId=null, storeId=null` quando claims não populadas. PRD-107 enriquece depois.

### Bibliotecas (Deno)

- `https://deno.land/std@0.224.0/http/server.ts`
- `https://deno.land/x/jose@v5.6.3/index.ts` (validação JWT)
- `https://deno.land/x/ulid@v0.3.0/mod.ts` (traceId)
- `https://esm.sh/@supabase/supabase-js@2.45.0` (client server-side com service_role)

### Decisões Pendentes

- **Versão do `std`:** pinned em 0.224.0 no momento; bump exige PR explícito.
- **Logflare / Sentry / Datadog:** decisão de provider de observability fica para PRD-110. Este PRD apenas garante que logs JSON estão prontos para ingestion.

---

## Cadeia de PRDs

```
   ┌──────────────┐
   │ PRD-100      │
   │ Setup        │
   └──────┬───────┘
          │
   ┌──────▼───────┐
   │ PRD-101      │
   │ Schema       │
   └──────┬───────┘
          │
   ┌──────▼───────┐
   │ PRD-102      │ ← ESTE
   │ Edge Fn Infra│
   └──────┬───────┘
          │
   ┌──────┼─────────────┬────────────┬──────────────┐
   ▼      ▼             ▼            ▼              ▼
 PRD-105 PRD-114    PRD-122       PRD-131       PRD-151
 Realtime Webhook   DINTEC Sync   Asaas         LLM Gateway
         WhatsApp                  Pagamentos
```

---

## Considerações de Segurança

- **JWT validation rigorosa:** uso de lib `jose` com algoritmo `HS256` e secret do Supabase. Verificação de `exp` (expiração) explícita.
- **SERVICE_ROLE_KEY exposure:** apenas via `Deno.env.get` no runtime; jamais incluída em response, jamais logada (logger sanitiza).
- **CORS strict:** Origin whitelist em prod (`https://gallo.app`, `https://staging.gallo.app`). Dev pode aceitar `*` mas com warning no log para garantir consciência.
- **Error responses sanitized:** `responseFromError` jamais expõe stack trace ou `internalMessage` ao cliente. Apenas `code` + `userMessage` + `traceId`.
- **Idempotency contra ataque:** `event_key` deve ser determinístico e baseado em conteúdo (sha256 do payload), não em campos previsíveis. PRDs que usam `withIdempotency` devem documentar como derivam a key.
- **Rate limiting nativo:** Supabase impõe rate limit por function (default 100 req/s). Atacante não consegue floodar — Supabase responde 429. PRD-108 ajusta se necessário.
- **Input validation:** este PRD não estabelece padrão de validação (cada function valida seu próprio input). PRDs específicos vão usar `zod` ou similar.
- **CORS preflight não é auth:** OPTIONS retorna 204 sem validar JWT. Isso é correto e seguro — preflight só verifica que o servidor aceita a operação.

---

## Fluxos de Uso

### Fluxo principal — desenvolvedor cria nova function

```
[Dev] ──▶ supabase functions new <nome-da-function>
      ──▶ Copia template de hello-trace/index.ts
      ──▶ Importa _shared/ conforme necessidade
      ──▶ Implementa lógica específica
      ──▶ deno task test (testes locais)
      ──▶ supabase functions serve <nome> (teste local)
      ──▶ Commit + PR
      ──▶ CI roda testes + deploy em staging
      ──▶ Após aprovação: merge em main → deploy em prod
```

### Fluxo de chamada — frontend → Edge Function

```
[Frontend (Vercel)] ──▶ Gera JWT via Supabase Auth
                    ──▶ POST /functions/v1/hello-trace
                    ──▶ Header: Authorization: Bearer <jwt>
                    ──▶ Header: x-trace-id: <opcional>

[Edge Function] ──▶ Valida CORS (OPTIONS preflight se browser)
              ──▶ Extrai traceId
              ──▶ Cria logger
              ──▶ withAuth() valida JWT, retorna context
              ──▶ Executa lógica
              ──▶ Retorna response com x-trace-id

[Frontend] ──▶ Recebe response
          ──▶ Em caso de erro: captura traceId para suporte
```

### Fluxo de webhook — provedor externo → Edge Function

```
[Provider externo (ex: Meta)] ──▶ POST /functions/v1/whatsapp-webhook
                              ──▶ Body: payload do evento
                              ──▶ Header: x-signature (HMAC) — provider-specific

[Edge Function] ──▶ Valida signature (provider-specific)
              ──▶ Calcula event_key = sha256(payload)
              ──▶ withIdempotency(event_key, ...) — se já processado, retorna 200 cached
              ──▶ Processa evento (inserir em messages, etc.)
              ──▶ Grava em crm.integration_logs
              ──▶ Retorna 200 OK (mesmo em duplicata)
```

---

## Convenções de Código (Referência Rápida)

| Elemento                   | Convenção                      | Exemplo                                         |
| -------------------------- | ------------------------------ | ----------------------------------------------- |
| **Diretório de function**  | kebab-case                     | `hello-trace`, `whatsapp-webhook`               |
| **Arquivo principal**      | sempre `index.ts`              | `supabase/functions/hello-trace/index.ts`       |
| **Módulos shared**         | kebab-case ou snake_case       | `_shared/auth.ts`, `_shared/integration-log.ts` |
| **Imports externos**       | URL completa com versão pinned | `https://deno.land/std@0.224.0/...`             |
| **Constantes da function** | UPPER_SNAKE_CASE               | `FUNCTION_NAME`, `FUNCTION_VERSION`             |
| **Logs JSON**              | nível em lowercase             | `info`, `warn`, `error`                         |
| **Error codes**            | UPPER_SNAKE                    | `UNAUTHORIZED`, `NOT_FOUND`                     |
| **Headers customizados**   | kebab-case com `x-` prefix     | `x-trace-id`, `x-idempotency-key`               |
| **Git commits**            | Conventional Commits           | `feat(edge):`, `fix(edge):`                     |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** você é o Claude Opus 4.7 via Claude Code CLI. PRD escrito pelo Agente Arquiteto na web.

### Esclarecimento de Dúvidas

> 💬 Pergunte antes de implementar: versão do `std` Deno (sugerido: 0.224.0, mas Deno evolui rápido); biblioteca de validação JWT preferida (sugerido: `jose`); convenções de teste (Deno test nativo vs lib externa — sugerido: nativo).

### Instruções Obrigatórias

> ⚠️ **1. ANTES DE IMPLEMENTAR:** Estude a função `hello-trace` proposta no Conceito acima. Ela é o template canônico — toda Edge Function da Fase 2 deve espelhar essa estrutura.

> ⚠️ **2. APÓS IMPLEMENTAR:**
>
> - Bump versão do app para v2.0.0-rc.2 (após PRD-101 v2.0.0-rc.1)
> - CHANGELOG.md: registra a infraestrutura Edge entregue
> - Renomear para `PRD-102-edge-functions-infra_DONE.md`
> - Documentação `docs/edge/` completa antes do `_DONE`
> - Smoke test `hello-trace` em **ambos** os ambientes (staging + prod)

### Princípios de Implementação

| Princípio                            | Descrição                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| **`_shared` é a biblioteca interna** | Mudança em `_shared` impacta todas as functions — revisar com cuidado                  |
| **Function pequena e atômica**       | Se passar de 200 linhas, refatorar                                                     |
| **Logging estruturado é regra**      | Nunca usar `console.log` direto — sempre via logger                                    |
| **Idempotência é opt-in**            | Use `withIdempotency` em webhooks e syncs; não em queries simples                      |
| **Fail fast em env**                 | `validateEnv` no topo da function — se falta variável, function não responde           |
| **Sanitize input**                   | Cada function valida seu próprio input (não responsabilidade do `_shared`)             |
| **Teste o caminho de erro**          | Testes unitários cobrem caso feliz E erros — bug-prone                                 |
| **MCP Supabase para deploy**         | Pode usar `Supabase:deploy_edge_function` para deploys ad-hoc; CI é a fonte da verdade |

### Orientações Específicas

| Aspecto                 | Orientação                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cold start**          | Minimize imports no topo do `index.ts`; lazy-import quando possível                                                                                   |
| **JWT lib**             | `jose` é o padrão Deno para JWT — bem mantida, sem peer deps                                                                                          |
| **Validação de schema** | `zod` (via esm.sh) é o padrão sugerido para validar input — mas cada PRD especifica                                                                   |
| **Service role client** | Cuidado: `createClient(url, SERVICE_ROLE_KEY)` bypassa RLS. Use apenas em fluxos privilegiados (audit log write, admin ops). Nunca exponha ao usuário |
| **Test em local**       | `supabase functions serve <nome>` roda function localmente apontando para staging                                                                     |
| **Debug logs**          | Use `LOG_LEVEL=debug` em dev; volta para `info` em prod                                                                                               |

### O que NÃO Fazer

| ❌ Evitar                                                                             |
| ------------------------------------------------------------------------------------- |
| `console.log` direto (use logger estruturado)                                         |
| Logging de credenciais (sanitizar com regex se em dúvida)                             |
| Compartilhar instâncias de Supabase client entre functions (cada function cria a sua) |
| Functions de >200 linhas                                                              |
| Multiarquivo dentro de uma function (refatorar para `_shared`)                        |
| Hardcode de origins CORS (sempre via env `ALLOWED_ORIGINS`)                           |
| Vazar stack trace em response                                                         |
| Esquecer de retornar headers CORS em responses 4xx/5xx                                |
| `setTimeout` para "esperar coisa" — Edge Function tem timeout próprio                 |
| Try/catch que engole erro sem logar                                                   |

---

## Status de Implementação

| Campo                     | Valor       |
| ------------------------- | ----------- |
| **Status**                | ⏳ PENDENTE |
| **Data de Implementação** | -           |
| **Versão do App**         | -           |
| **Implementado por**      | -           |
| **Observações**           | -           |

---

## Histórico

| Data       | Versão | Alteração                                        |
| ---------- | ------ | ------------------------------------------------ |
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1a do Lote 1 (Onda 4) |

---

**AILA - Sistemas Inteligentes**
