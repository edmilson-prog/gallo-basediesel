# PRD-100: Setup do Projeto Supabase

> **✅ STATUS: CONCLUÍDO (com ressalvas) — 2026-06-09**
>
> Infra provisionada e documentada: projeto único `njizaasajkdqptlxddqn` (desvio registrado: sem par staging/prod — o Preview da Vercel cumpre o papel), envs na Vercel/`.env.example`, runbooks `docs/infra/supabase-setup.md` + `rotate-keys.md`, smoke validado. Workflows `db-deploy.yml`/`gen-types.yml` criados no padrão no-op-até-secret.
>
> **Ressalvas:** secrets de CI gated no dono (#45); custom domains e billing alerts são configuração de dashboard (dono); runbook de DR pertence ao PRD-109 (pendente).

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                     |
| **Repositório**       | _Repositório vivo da Fase 1 — adicionar diretório `supabase/` na raiz_                                                                                                                                                                                                                                                       |
| **Objetivo**          | Provisionar a infraestrutura Supabase ponta-a-ponta (2 projetos: staging + prod) com 2 schemas dedicados (`crm` + `storefront`), gestão de credenciais via Vault, tooling de migrações via CLI + MCP, monitoring básico e alertas de billing, estabelecendo a base sobre a qual todos os demais PRDs da Onda 4 vão construir |
| **Tipo**              | Integração                                                                                                                                                                                                                                                                                                                   |
| **Complexidade**      | Média                                                                                                                                                                                                                                                                                                                        |
| **Total de Fases**    | 4                                                                                                                                                                                                                                                                                                                            |
| **Prioridade**        | P0 — bloqueante para toda a Fase 2                                                                                                                                                                                                                                                                                           |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                                                                               |
| **PRDs Relacionados** | PRD-005 Fase 1 (Provider Pattern — define os contratos que o Supabase implementa); PRD-101 (Schema do banco — consome este setup); PRD-102 (Edge Functions — consome este setup); PRD-103 (RLS); PRD-107 (Auth); PRD-109 (Backup/DR); PRD-110 (Monitoring)                                                                   |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                           |
| **Padrão de código**  | snake_case para SQL; nomes de projetos Supabase em kebab-case (`gallo-prod`, `gallo-staging`)                                                                                                                                                                                                                                |

### Critérios de Complexidade

> **Justificativa de Média:** o PRD não envolve regra de negócio nem lógica complexa, mas exige acertos infraestruturais cuja correção é difícil reverter sem dor — provisionamento de 2 projetos em ambientes isolados, configuração de Vault para secrets sensíveis, integração com Vercel para handoff de env vars, custom domains com SSL, billing alerts e a definição canônica dos schemas que governarão toda a Fase 2. Erros aqui custam refactor em todos os PRDs subsequentes da Onda 4.

---

## Informações do Serviço Externo

### Dados do Provedor

| Campo               | Valor                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| **Nome do Serviço** | Supabase                                                                                  |
| **Provedor**        | Supabase Inc.                                                                             |
| **Documentação**    | https://supabase.com/docs                                                                 |
| **Tipo de API**     | REST (PostgREST) + Realtime (WebSocket) + Storage (S3-compatible) + Edge Functions (Deno) |
| **Versão da API**   | PostgREST v12+ (gerenciada pelo Supabase)                                                 |
| **Ambiente**        | 2 projetos distintos: `gallo-staging` (sandbox UAT) e `gallo-prod` (operação real)        |

### Credenciais Necessárias por Projeto

| Credencial                  | Tipo                                    | Onde Obter                                        | Onde Armazenar                                                                       |
| --------------------------- | --------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `SUPABASE_URL`              | URL pública do projeto                  | Dashboard → Project Settings → API                | Vercel env vars (público, prefixo `VITE_`)                                           |
| `SUPABASE_ANON_KEY`         | JWT público anônimo                     | Dashboard → Project Settings → API                | Vercel env vars (público, prefixo `VITE_`)                                           |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT admin (bypass RLS)                  | Dashboard → Project Settings → API                | **Supabase Vault** (server-side, nunca exposto ao frontend) + GitHub Secrets para CI |
| `SUPABASE_JWT_SECRET`       | Segredo para assinar JWTs custom claims | Dashboard → Project Settings → API → JWT Settings | Supabase Vault (consumido por PRD-107 Auth Custom Claims)                            |
| `SUPABASE_DB_PASSWORD`      | Senha do usuário postgres               | Definida na criação do projeto                    | 1Password do AILA + GitHub Secrets para `supabase db push` em CI                     |

> ⚠️ **NUNCA** incluir credenciais reais neste documento, em commits ou em logs. Para acesso operacional do Arquiteto e Desenvolvedor durante a Fase 2, usar o MCP Supabase já conectado nesta organização.

### Limites e Quotas (Plano Pro)

| Limite                    | Valor              | Consequência se Exceder           | Mitigação prevista                                  |
| ------------------------- | ------------------ | --------------------------------- | --------------------------------------------------- |
| Database size             | 8 GB               | Cobrança adicional ~$0,125/GB/mês | PRD-108 inclui métricas + alerta a 70%              |
| Egress (bandwidth)        | 250 GB/mês         | Cobrança adicional ~$0,09/GB      | Alerta a 70%, PRD-105 (Realtime) precisa medir      |
| Storage                   | 100 GB             | Cobrança adicional ~$0,021/GB/mês | PRD-106 inclui política de retenção de mídias       |
| Auth MAU                  | 100.000 ativos/mês | Cobrança $0,00325/MAU adicional   | Volume MVP irrisório frente ao teto                 |
| Edge Function invocations | 2M/mês             | Cobrança $2/M adicional           | PRD-110 mede; alerta a 70%                          |
| Realtime concurrent peak  | 500 connections    | Throttle nas conexões excedentes  | PRD-105 define estratégia de subscriptions por loja |
| Cron jobs (pg_cron)       | 100 jobs ativos    | Erros de scheduling               | Limite confortável; uso previsto < 20 jobs          |

**Custo recorrente esperado:** USD 25/mês × 2 projetos = **USD 50/mês** (~R$ 250/mês ao câmbio de R$ 5,00). Picos pontuais de overage estimados < R$ 100/mês. Plano Free não atende: ausência de PITR (PRD-109) e quotas insuficientes para staging com volume realista.

### Fluxo de Comunicação

```
[Vercel Frontend]
   │
   ├──── PostgREST  ────▶  [Supabase Cloud]
   ├──── Realtime   ────▶  ├── PostgreSQL (db.<ref>.supabase.co:5432)
   ├──── Storage    ────▶  ├── GoTrue (auth)
   ├──── Auth       ────▶  ├── Storage API
   └──── Edge Fn    ────▶  ├── Realtime server
                           └── Edge Functions runtime (Deno)
```

Comunicação é sempre outbound a partir do frontend (Vercel) ou da CLI/CI/MCP do Arquiteto. Não há webhook inbound da Supabase para a nossa infraestrutura neste PRD (webhooks de auth, db e storage só serão configurados nos PRDs específicos: 107, 105, 106 etc.).

### Autenticação JWT

Tratada em detalhe no PRD-107 (Supabase Auth com Custom Claims). Neste PRD apenas garantimos que:

- O JWT secret é gerado pelo Supabase no momento da criação do projeto
- Edge Functions têm acesso ao secret via `Deno.env.get('SUPABASE_JWT_SECRET')`
- Frontend só recebe `ANON_KEY` (RLS protege o resto)

---

## Contexto do Problema

A Fase 1 entregou a plataforma GALLO 100% mockada (`VITE_DATA_SOURCE=mock`). O Provider Pattern do PRD-005 já define os contratos de acesso a dados, mas o "lado real" do switch (`VITE_DATA_SOURCE=supabase`) está vazio — não há projeto Supabase provisionado, não há schema, não há credenciais, não há nada.

Sem este PRD, **nenhum outro PRD da Fase 2 pode começar**:

- PRD-101 (Schema) precisa de projetos onde rodar `supabase db push`
- PRD-102 (Edge Functions) precisa de runtime Deno onde deployar
- PRD-103 (RLS) precisa de banco com schemas criados
- PRD-104 (Substituir Providers) precisa de URL + chaves para o cliente JS
- Todos os PRDs subsequentes assumem este setup como dado

A complexidade aqui não vem de regra de negócio (zero), mas de **acertar infraestrutura cuja correção tardia é cara**: trocar região depois de migrar dados é doloroso; mudar nome de schema depois de criar 50 tabelas exige migração massiva; expor `SERVICE_ROLE_KEY` no frontend por engano é incidente de segurança grave.

---

## Conceito da Solução

### Situação Atual (As-Is)

- Apenas mocks locais e Vercel Preview com `VITE_DATA_SOURCE=mock`
- Sem persistência real; cada reload "limpa" estado server-side simulado
- Provider Pattern do PRD-005 com implementações "supabase-stub" que só lançam `NotImplementedError`
- Nenhuma credencial Supabase em uso

### Situação Desejada (To-Be)

**2 projetos Supabase isolados** — `gallo-staging` e `gallo-prod` — provisionados na região AWS São Paulo (sa-east-1), ambos no plano Pro, com:

- **Schemas dedicados criados** no `supabase/migrations/00000_init_schemas.sql`: `crm` (operação interna + base ERP futuro), `storefront` (e-commerce público), `public` deliberadamente vazio (apenas extensões PostgreSQL)
- **PostgREST configurado** para expor `crm` para autenticados e `storefront` para anônimo + autenticado B2C — defense-in-depth real (vide §4.3 do briefing v1.3)
- **Vault habilitado** com secrets sensíveis (DINTEC, gateways, LLMs, WhatsApp, JWT secret)
- **CLI Supabase configurada** localmente para o time AILA (`supabase init`, `supabase link --project-ref`, `supabase db push`)
- **MCP Supabase** já conectado (continua sendo o tooling operacional do Arquiteto)
- **Custom domains** com SSL: `gallo.app` (prod) e `staging.gallo.app` (staging)
- **Vercel integrado** — env vars sincronizadas por ambiente (preview → mock, staging → staging.gallo.app, production → gallo.app)
- **Billing alerts** configurados a 70/85/95% do plano Pro
- **GitHub Actions secrets** configurados para `supabase db push` em CI por branch (main → prod, staging → staging)
- **Documentação** de runbook em `docs/infra/supabase-setup.md` cobrindo: criação de novo projeto (caso de DR), rotação de chaves, restauração de backup, troubleshooting comum

### Analogia operacional

Funciona como **abrir as instalações de uma fábrica antes da operação começar**: ligar a energia, contratar o seguro, instalar os portões de segurança, definir os turnos. Nenhuma linha de produção ainda — só os trilhos sobre os quais ela vai correr. Os PRDs 101–110 vão "produzir" sobre esses trilhos.

### Alternativas Consideradas

| Alternativa                                       | Por que descartada                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3 projetos Supabase (staging + prod + demo)       | Demo roda 100% mock no Vercel Preview, sem necessidade de backend dedicado. Reduz custo de USD 75 → USD 50/mês e elimina 1 superfície de incidente                                                     |
| 1 projeto com schemas distintos para staging/prod | Operacionalmente frágil: RLS por ambiente em projeto único é viável tecnicamente mas impossível de auditar; SERVICE_ROLE_KEY de prod nunca pode aparecer em logs de staging — separação física resolve |
| Self-hosted Supabase em VPS própria               | Aumenta operação (manter Postgres, Realtime, GoTrue, Storage), elimina PITR gerenciado, sem ganho real no MVP. Avaliar em Fase 5 se volume justificar                                                  |
| Plano Free para staging                           | Sem PITR, sem custom domains, quotas insuficientes para volume realista de teste. USD 25/mês de Pro paga a tranquilidade                                                                               |
| Drizzle ORM além do Supabase CLI                  | Sem ganho real: Provider Pattern (PRD-005) já abstrai consumidores; tipos gerados pelo Supabase CLI cobrem type-safety. Camada extra de manutenção.                                                    |
| Schema único `public` para tudo                   | Anula defense-in-depth do PostgREST. Bug em policy RLS do `crm.customers` vazaria para anônimo do e-commerce. Schemas dedicados são barreira física                                                    |

---

## Escopo

### Incluído

- ✅ Criação de 2 projetos Supabase (`gallo-staging`, `gallo-prod`) na organização AILA, região AWS São Paulo (sa-east-1), plano Pro
- ✅ Migration inicial `00000_init_schemas.sql` criando schemas `crm` e `storefront`; deixando `public` vazio (apenas extensões `uuid-ossp`, `pgcrypto`, `pg_trgm`)
- ✅ Configuração do PostgREST para expor schemas: `crm` (autenticado), `storefront` (anônimo + autenticado B2C)
- ✅ Habilitação do Supabase Vault em ambos os projetos
- ✅ Configuração de Custom Domain `gallo.app` em prod e `staging.gallo.app` em staging (SSL gerenciado pelo Supabase)
- ✅ Estrutura inicial do diretório `supabase/` no repositório (`config.toml`, `migrations/`, `functions/`, `seed.sql`)
- ✅ Configuração local do CLI Supabase com `supabase init` + `supabase link --project-ref` documentada
- ✅ Integração MCP Supabase confirmada e operacional para Arquiteto e Desenvolvedor
- ✅ Sincronização de env vars no Vercel para os 3 ambientes (Preview = mock; Staging = staging supabase; Production = prod supabase)
- ✅ GitHub Secrets configurados: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD_STAGING`, `SUPABASE_DB_PASSWORD_PROD`, `SUPABASE_PROJECT_REF_STAGING`, `SUPABASE_PROJECT_REF_PROD`
- ✅ Workflow GitHub Actions `.github/workflows/db-deploy.yml` para `supabase db push` automatizado por branch
- ✅ Billing alerts configurados em ambos os projetos: 70%, 85%, 95% do plano Pro (email para `infra@ailasistemas.com.br`)
- ✅ Runbook em `docs/infra/supabase-setup.md`: provisionamento, rotação de chaves, troubleshooting comum
- ✅ Documentação interna no README.md do projeto explicando como rodar localmente apontando para staging vs Supabase local
- ✅ Validação end-to-end: aplicação no Vercel Preview com `VITE_DATA_SOURCE=supabase` conecta ao staging, autentica anônimo, faz select trivial (`select 1`), recebe resposta

### Excluído

- ❌ Criação de tabelas de domínio (vai no PRD-101)
- ❌ Definição de policies RLS (vai no PRD-103)
- ❌ Deploy de Edge Functions de negócio (vai no PRD-102)
- ❌ Configuração de Auth providers além do email/password padrão (vai no PRD-107)
- ❌ Buckets de Storage configurados (vai no PRD-106)
- ❌ Configuração de Realtime channels (vai no PRD-105)
- ❌ Setup de PITR e estratégia de DR (vai no PRD-109)
- ❌ Painéis de observability (vai no PRD-110)
- ❌ Tunning de Postgres (vai no PRD-108)
- ❌ Setup de banco Supabase local via Docker (não-objetivo no MVP; documenta como nice-to-have)
- ❌ Self-hosting do Supabase em VPS própria

---

## Requisitos Funcionais

### Provisionamento dos Projetos

- **RF-001:** A organização Supabase utilizada deve ser a `AILA Sistemas Inteligentes`. Não criar projetos em organização pessoal.
- **RF-002:** Devem ser criados exatamente 2 projetos: nome técnico `gallo-staging` (display `GALLO Staging`) e `gallo-prod` (display `GALLO Produção`).
- **RF-003:** Ambos os projetos devem ser provisionados na região AWS São Paulo (`sa-east-1`).
- **RF-004:** Ambos os projetos devem usar o plano **Pro** (USD 25/mês cada).
- **RF-005:** Senha do usuário `postgres` deve ser gerada com >= 32 caracteres aleatórios, armazenada no 1Password do AILA imediatamente após a criação. **Esta senha nunca é regenerável pela Supabase** — perda exige re-criação do projeto.
- **RF-006:** Project Ref de cada projeto deve ser registrado em `docs/infra/supabase-setup.md` (não é segredo — é identificador público usado em URLs).

### Configuração de Schemas

- **RF-010:** A primeira migration aplicada (`supabase/migrations/00000000000000_init_schemas.sql`) deve criar os schemas `crm` e `storefront` se não existirem.
- **RF-011:** A migration deve habilitar as extensões `uuid-ossp`, `pgcrypto` e `pg_trgm` no schema `public`. Extensões em schema `public` é prática padrão Supabase.
- **RF-012:** A migration deve revogar todos os privilégios default em `public` para o role `anon` (evita exposição acidental de futuras tabelas de extensão).
- **RF-013:** A configuração do PostgREST (`config.toml` → `[api]` → `schemas`) deve expor os schemas `crm` e `storefront`. O role `anon` terá `GRANT USAGE` apenas em `storefront`; o role `authenticated` terá `GRANT USAGE` em ambos. RLS efetivamente filtra leitura/escrita.
- **RF-014:** Para garantir migrações reprodutíveis, a migration deve ser idempotente: usar `CREATE SCHEMA IF NOT EXISTS`, `CREATE EXTENSION IF NOT EXISTS`.

### Vault e Secrets

- **RF-020:** O Supabase Vault deve estar habilitado em ambos os projetos (é habilitado por default em planos Pro+; este RF apenas valida).
- **RF-021:** Os seguintes secrets devem ser **registrados como entradas placeholder** no Vault de cada projeto (valores reais virão nos PRDs específicos): `dintec_db_connection_string`, `dintec_export_ftp_credentials`, `asaas_api_key`, `mercadopago_access_token`, `meta_whatsapp_access_token`, `meta_whatsapp_phone_number_id`, `meta_whatsapp_webhook_verify_token`, `resend_api_key`, `openai_api_key`, `anthropic_api_key`, `openrouter_api_key`, `nfe_provider_api_key`. Cada entrada criada com valor `__placeholder_set_in_PRD_XXX__` para sinalizar pendência.
- **RF-022:** O acesso ao Vault deve ser restrito ao role `service_role` (Edge Functions e operações server-side); jamais expor para `anon` ou `authenticated`.
- **RF-023:** Documentar em `docs/infra/secrets.md` qual PRD popula cada secret e como rotacionar.

### Custom Domains

- **RF-030:** Domain `gallo.app` configurado em produção, com SSL gerenciado automaticamente pelo Supabase.
- **RF-031:** Subdomain `staging.gallo.app` configurado em staging, com SSL gerenciado automaticamente.
- **RF-032:** Registros DNS necessários (CNAME ou A) devem ser configurados no registrador do domínio. Documentar exatamente quais registros foram criados em `docs/infra/dns-records.md`.
- **RF-033:** A URL pública `https://api.gallo.app` (gerada via custom domain) deve responder ao endpoint `/rest/v1/` com `200 OK` e cabeçalho `Server: postgrest`.

### Vercel Integration

- **RF-040:** Conectar a integração oficial Supabase ↔ Vercel para sincronização automática de env vars (alternativamente, configurar manualmente; integração nativa é preferível).
- **RF-041:** Para cada um dos 3 ambientes Vercel — Preview, Staging (branch `staging`), Production (branch `main`) —, configurar:
  - `VITE_DATA_SOURCE`: `mock` (Preview) / `supabase` (Staging) / `supabase` (Production)
  - `VITE_SUPABASE_URL`: vazio (Preview) / URL do staging / URL do prod
  - `VITE_SUPABASE_ANON_KEY`: vazio (Preview) / chave do staging / chave do prod
- **RF-042:** Variáveis com prefixo `VITE_` são públicas (bundle frontend). `SUPABASE_SERVICE_ROLE_KEY` **NUNCA** deve ter prefixo `VITE_` nem ser referenciada no frontend. Server-side em Edge Functions acessa via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

### CI/CD (GitHub Actions)

- **RF-050:** Workflow `.github/workflows/db-deploy.yml` deve ser criado disparando em push para branches `staging` e `main`.
- **RF-051:** O workflow deve usar a action oficial `supabase/setup-cli@v1`, autenticar com `SUPABASE_ACCESS_TOKEN`, fazer `supabase link --project-ref <ref>` apontando para o projeto correto conforme branch, e executar `supabase db push` (aplicar migrations pendentes).
- **RF-052:** Em caso de falha do `db push`, o workflow deve **abortar o deploy do frontend Vercel** (via dependência no Vercel) — não aplicar mudança de schema parcial.
- **RF-053:** GitHub Secrets necessários (configurados no repo Settings → Secrets and variables → Actions):
  - `SUPABASE_ACCESS_TOKEN` (token pessoal do owner da org Supabase)
  - `SUPABASE_DB_PASSWORD_STAGING` e `SUPABASE_DB_PASSWORD_PROD`
  - `SUPABASE_PROJECT_REF_STAGING` e `SUPABASE_PROJECT_REF_PROD`

### Billing e Quotas

- **RF-060:** Em cada projeto, configurar alertas de billing nos limiares 70%, 85% e 95% do plano Pro mensal.
- **RF-061:** Email de destino dos alertas: `infra@ailasistemas.com.br` (configurar lista interna caso ainda não exista).
- **RF-062:** Documentar em `docs/infra/cost-management.md` o orçamento mensal previsto, ações ao atingir cada limiar, e contato de emergência.

### Documentação e Runbooks

- **RF-070:** Criar `docs/infra/supabase-setup.md` com: passo a passo de provisionamento, project refs, custom domains configurados, ambiente Vercel mapeado, lista de secrets pendentes (referência cruzada aos PRDs que populam cada um).
- **RF-071:** Criar `docs/infra/runbooks/rotate-keys.md` com procedimento de rotação de `SERVICE_ROLE_KEY`, `JWT_SECRET` e senha do `postgres`.
- **RF-072:** Criar `docs/infra/runbooks/disaster-recovery.md` com procedimento de provisionamento de novo projeto a partir de backup (PRD-109 detalha PITR; aqui é só o scaffold).
- **RF-073:** Atualizar o `README.md` do repositório com seção "Local Development" explicando como rodar contra staging (`.env.local` apontando para Supabase staging) vs como rodar 100% mock.

### Validação End-to-End

- **RF-080:** Após todo o setup, deve ser possível: clonar o repositório limpo, copiar `.env.example` → `.env.local`, executar `npm install && npm run dev`, abrir o browser e ter a aplicação carregando contra o **staging** com query trivial `select 1` retornando sucesso.
- **RF-081:** Smoke test automatizado em CI: ao final do `db-deploy.yml`, executar um script Node simples que faz `createClient(url, anonKey).from('whatever').select('1').limit(0)` e valida que recebe `200 OK` (testa conectividade, RLS desabilitada não vaza, anon key válida).

---

## Requisitos Não-Funcionais

- **RNF-001 (Segurança — credenciais):** Nenhuma credencial deve aparecer em commits Git, logs do CI, mensagens do MCP, ou capturas de tela do projeto. Verificação manual antes do PR final. `gitleaks` (ou similar) deve ser adicionado ao pipeline para varredura automática.
- **RNF-002 (Segurança — RLS por default):** Embora policies sejam definidas no PRD-103, este PRD-100 já configura `ALTER DATABASE postgres SET row_security = on` (geralmente o default; validar) — garantia adicional que tabelas sem policy explícita ficam inacessíveis.
- **RNF-003 (Reprodutibilidade):** Toda configuração do projeto Supabase deve estar versionada em `supabase/config.toml` no repositório, exceto valores específicos de ambiente (refs, chaves). Recriar o projeto deve exigir no máximo: criar projeto novo + `supabase link` + `supabase db push` + configurar 4 secrets no Vault.
- **RNF-004 (Auditabilidade):** Todas as ações de provisionamento (criação de projeto, mudanças de configuração, rotações de chave) devem ser registradas em `docs/infra/changelog.md` com data, responsável e justificativa.
- **RNF-005 (Observabilidade básica):** A aba "Database → Logs" e "API Logs" do Dashboard Supabase devem estar acessíveis ao Owner. PRD-110 expande para observability dedicada; aqui basta o que o Supabase já entrega out-of-the-box.
- **RNF-006 (Performance — latência):** Latência base esperada entre Vercel São Paulo e Supabase São Paulo: < 50ms p95 em select trivial. Validar com `curl -w "%{time_total}"` no smoke test.
- **RNF-007 (Disponibilidade):** Plano Pro do Supabase tem SLA de 99,9%. Para o MVP é suficiente; alertas de downtime gerenciados pelo próprio Supabase Status Page (assinar via email a equipe AILA).
- **RNF-008 (Backup):** PITR de 7 dias incluso no plano Pro deve estar habilitado em ambos os projetos. PRD-109 detalha estratégia completa; aqui apenas confirma que a feature está ativa.

---

## Critérios de Aceitação

### RF-002 + RF-003 + RF-004: Provisionamento Correto

```gherkin
DADO que o Arquiteto (Edmilson) está logado no Dashboard Supabase
QUANDO consulta a organização "AILA Sistemas Inteligentes"
ENTÃO existem exatamente 2 projetos: "GALLO Staging" e "GALLO Produção"
  E ambos estão na região "AWS South America (São Paulo)"
  E ambos têm plano "Pro" ativo
  E ambos têm PITR habilitado
```

### RF-010 + RF-013: Schemas Corretos

```gherkin
DADO que a migration 00000000000000_init_schemas.sql foi aplicada em staging
QUANDO o Arquiteto executa via MCP Supabase: list_tables com schemas=['crm','storefront','public']
ENTÃO o schema "crm" existe (vazio neste PRD; tabelas vêm no PRD-101)
  E o schema "storefront" existe (vazio neste PRD)
  E o schema "public" tem apenas extensões (uuid-ossp, pgcrypto, pg_trgm)
  E nenhuma tabela de domínio existe em "public"
```

### RF-013: PostgREST Expõe Schemas Corretos

```gherkin
DADO que o staging está configurado e o frontend usa anon key
QUANDO faz uma requisição GET /rest/v1/?schema=crm com role anônimo
ENTÃO recebe 401 Unauthorized (anon não tem GRANT USAGE em crm)

QUANDO faz uma requisição GET /rest/v1/?schema=storefront com role anônimo
ENTÃO recebe 200 OK com lista vazia (acesso permitido; sem tabelas ainda)
```

### RF-022: SERVICE_ROLE_KEY Nunca no Frontend

```gherkin
DADO que o frontend buildado está deployado no Vercel
QUANDO o Arquiteto inspeciona o JavaScript bundle minificado
ENTÃO o string "service_role" NÃO aparece em nenhum lugar
  E a chave SUPABASE_SERVICE_ROLE_KEY NÃO está em nenhuma variável window/global
  E a chave SUPABASE_ANON_KEY aparece (esperado, é pública)
```

### RF-041 + RF-080: Conectividade End-to-End

```gherkin
DADO que um novo desenvolvedor clonou o repositório
  E executou cp .env.example .env.local
  E preencheu VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY com valores do staging
  E executou npm install && npm run dev
QUANDO acessa http://localhost:5173 no browser
ENTÃO a aplicação carrega sem erros de conexão
  E o console mostra "Connected to Supabase staging" (log adicionado pelo provider real do PRD-005)
  E uma query trivial (select 1 via from('storefront.dummy_check')) retorna 404 elegante (tabela não existe ainda — esperado neste PRD)
```

### RF-051 + RF-052: CI Aplica Migrations e Falha com Graça

```gherkin
DADO que um pull request com migration nova foi mergeado em "staging" branch
QUANDO o workflow db-deploy.yml é disparado
ENTÃO o supabase CLI é instalado
  E a action faz supabase link --project-ref <ref staging>
  E o supabase db push é executado
  E em caso de sucesso: o status do PR fica verde e o deploy do Vercel prossegue
  E em caso de falha SQL: o workflow falha, o deploy Vercel é bloqueado, e o desenvolvedor recebe notificação
```

### RF-060: Billing Alerts Funcionam

```gherkin
DADO que os alertas estão configurados a 70/85/95%
QUANDO o consumo de Database size simulado atinge 5,6 GB (70% de 8 GB)
ENTÃO um email é disparado para infra@ailasistemas.com.br
  E o subject contém "70%" e "GALLO Staging" ou "GALLO Produção"
```

---

## Fases de Implementação

### Fase 1 — Provisionamento dos projetos (1 dia)

- Criar `gallo-staging` na organização AILA, região `sa-east-1`, plano Pro
- Criar `gallo-prod` idem
- Registrar senhas do `postgres` no 1Password
- Documentar project refs em `docs/infra/supabase-setup.md`
- Confirmar PITR habilitado em ambos
- Confirmar que MCP Supabase enxerga os 2 novos projetos via `list_projects`

### Fase 2 — Schemas, Vault, Custom Domains (1 dia)

- Criar diretório `supabase/` no repositório via `supabase init`
- Configurar `supabase/config.toml` com `[api] schemas = ["crm", "storefront"]`
- Escrever `supabase/migrations/00000000000000_init_schemas.sql`
- Aplicar migration em ambos os projetos via `supabase db push` ou via MCP `apply_migration`
- Habilitar Vault e popular as 12 entradas placeholder de secrets
- Configurar custom domains `gallo.app` (prod) e `staging.gallo.app` (staging); criar registros DNS no registrador
- Validar SSL respondendo nos custom domains

### Fase 3 — Integração Vercel + CI (1 dia)

- Conectar Supabase ↔ Vercel via integração oficial; configurar mapeamento de env vars por ambiente
- Criar `.env.example` no repositório com todas as variáveis necessárias (sem valores)
- Configurar GitHub Secrets do repositório
- Escrever `.github/workflows/db-deploy.yml`
- Testar workflow com uma migration trivial (`-- test migration\nSELECT 1;`) em branch `staging`
- Validar que falha de SQL aborta o deploy Vercel
- Validar smoke test E2E (RF-080 + RF-081)

### Fase 4 — Documentação + Billing + Handoff (meio dia)

- Configurar billing alerts em ambos os projetos
- Escrever `docs/infra/supabase-setup.md` completo
- Escrever runbooks `rotate-keys.md` e `disaster-recovery.md`
- Atualizar `README.md` do repositório
- Demo para Edmilson + Frederico do setup completo
- Marcar este PRD como `_DONE` no arquivo

---

## Dependências

### PRDs

- **Bloqueia (PRDs que dependem deste):** PRD-101, PRD-102, PRD-103, PRD-104, PRD-105, PRD-106, PRD-107, PRD-108, PRD-109, PRD-110 (toda a Onda 4) + todas as ondas subsequentes
- **Depende de:** nenhum PRD anterior — é a raiz da Fase 2

### Bibliotecas e Ferramentas

- Supabase CLI (`npm i -g supabase` ou Homebrew)
- MCP Supabase (já conectado nesta organização)
- 1Password CLI (opcional, recomendado para o time)
- `gitleaks` (varredura de secrets em commits — RNF-001)
- GitHub Actions (já em uso pelo projeto)

### Decisões Pendentes

- **Conta Vercel:** confirmar se a conta GALLO no Vercel pertence à organização AILA ou à GALLO BASE DIESEL. Para integração nativa Supabase ↔ Vercel funcionar, ambas organizações precisam estar conectadas. **Tratativa:** validar com cliente antes da Fase 3 deste PRD.
- **Registrador do domínio `gallo.app`:** confirmar onde está registrado (Registro.br? Cloudflare? GoDaddy?) para configurar DNS. **Tratativa:** Edmilson confirma antes da Fase 2.
- **Email `infra@ailasistemas.com.br`:** confirmar se já existe ou se precisa criar. Necessário para receber alertas. **Tratativa:** confirmar na Fase 4.

---

## Cadeia de PRDs

```
                    ┌─────────────────────────────────────┐
                    │  PRD-100 (Setup Supabase)           │
                    │  ESTE PRD — raiz da Fase 2          │
                    └──────────────────┬──────────────────┘
                                       │
              ┌────────────┬───────────┼───────────┬────────────┐
              ▼            ▼           ▼           ▼            ▼
        ┌──────────┐  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ PRD-101  │  │ PRD-102  │ │ PRD-109  │ │ PRD-107  │ │ PRD-110  │
        │ Schema   │  │ Edge Fn  │ │ Backup   │ │ Auth     │ │ Monitor  │
        └────┬─────┘  └────┬─────┘ └──────────┘ └──────────┘ └──────────┘
             │             │
             ▼             ▼
       ┌──────────┐  ┌──────────┐
       │ PRD-103  │  │ PRD-105  │
       │ RLS      │  │ Realtime │
       └────┬─────┘  └──────────┘
            │
            ▼
       ┌──────────┐
       │ PRD-104  │
       │ Provider │
       │ Substit. │
       └──────────┘
```

---

## Considerações de Segurança

- **Princípio do menor privilégio:** `anon` só tem `USAGE` em `storefront`; nunca em `crm`. `authenticated` tem em ambos, mas RLS (PRD-103) filtra.
- **Defense-in-depth:** o isolamento de schemas é a primeira camada; RLS é a segunda; auth claims (PRD-107) é a terceira. Bug em uma camada não vaza dados se as outras estão íntegras.
- **Rotação de chaves:** o runbook `rotate-keys.md` (RF-071) cobre o procedimento. Rotação semestral recomendada como prática (não automatizado no MVP; entra em planejamento futuro).
- **Audit trail de mudanças de configuração:** Supabase Dashboard registra mudanças de configuração; reforçar com `docs/infra/changelog.md` versionado no Git (RNF-004).
- **Exposição acidental de `SERVICE_ROLE_KEY`:** RF-022 + RNF-001 + verificação manual no PR final. `gitleaks` no pipeline reforça.
- **DNS hijacking:** custom domains com SSL Supabase mitiga; DNSSEC no registrador é recomendação adicional (não-objetivo no MVP).
- **Conformidade LGPD:** dados em São Paulo (sa-east-1) atendem requisito de residência. Aspectos detalhados de LGPD vão no PRD-191 (Onda 13).

---

## Fluxos de Usuário

> **Nota:** este PRD não tem fluxos de usuário final. Os "usuários" aqui são o Arquiteto (Edmilson), o Desenvolvedor (Claude Code CLI) e o time AILA. Os fluxos abaixo descrevem operações de infraestrutura.

### Fluxo principal — Provisionamento inicial

```
[Arquiteto] ──▶ Cria gallo-staging no Dashboard Supabase
            ──▶ Cria gallo-prod
            ──▶ Salva passwords no 1Password
            ──▶ Documenta refs

[Desenvolvedor CLI] ──▶ Roda supabase init no repositório
                    ──▶ Configura config.toml com schemas
                    ──▶ Escreve migration init_schemas
                    ──▶ supabase link + supabase db push em staging
                    ──▶ Valida via MCP list_tables
                    ──▶ Repete em prod
```

### Fluxo de uso pelo time depois de pronto

```
[Dev novo no time] ──▶ Clona repo
                  ──▶ cp .env.example .env.local
                  ──▶ Pega credenciais staging do 1Password
                  ──▶ npm install && npm run dev
                  ──▶ App roda contra staging
                  ──▶ Pode também rodar com VITE_DATA_SOURCE=mock para iterar offline
```

### Fluxo de promoção de migration

```
[Dev escreve migration] ──▶ supabase/migrations/<timestamp>_<nome>.sql
                       ──▶ Testa localmente em staging via supabase db push
                       ──▶ PR para branch staging
                       ──▶ GitHub Actions roda db-deploy.yml em staging
                       ──▶ Após validação UAT (2 semanas, briefing §5.3)
                       ──▶ PR de staging para main
                       ──▶ db-deploy.yml roda em prod
                       ──▶ Migration aplicada em prod
```

### Fluxo de erro — migration quebra em CI

```
[CI tenta db push] ──▶ SQL inválido detectado
                  ──▶ Workflow falha
                  ──▶ Deploy Vercel é bloqueado (RF-052)
                  ──▶ Dev recebe notificação no PR
                  ──▶ Dev corrige migration localmente
                  ──▶ Push força nova execução do workflow
                  ──▶ Sucesso → deploy prossegue
```

---

## Convenções de Código (Referência Rápida)

> Consulte a Seção 5 do `guia-prd.md` para a versão completa.

| Elemento                 | Convenção                     | Exemplo                            |
| ------------------------ | ----------------------------- | ---------------------------------- |
| **Projetos Supabase**    | kebab-case                    | `gallo-staging`, `gallo-prod`      |
| **Schemas SQL**          | lowercase, sem prefixo        | `crm`, `storefront`                |
| **Tabelas SQL**          | snake_case, plural            | `customer_notes`, `audit_logs`     |
| **Colunas SQL**          | snake_case                    | `created_at`, `seller_id`          |
| **Migrations**           | `<timestamp>_<descrição>.sql` | `00000000000000_init_schemas.sql`  |
| **Env vars frontend**    | prefixo `VITE_`, UPPER_SNAKE  | `VITE_SUPABASE_URL`                |
| **Env vars server-side** | UPPER_SNAKE sem prefixo VITE  | `SUPABASE_SERVICE_ROLE_KEY`        |
| **GitHub Secrets**       | UPPER_SNAKE_SUFFIXED          | `SUPABASE_DB_PASSWORD_PROD`        |
| **Documentos infra**     | kebab-case                    | `docs/infra/supabase-setup.md`     |
| **Git commits**          | Conventional Commits          | `feat(infra):`, `chore(supabase):` |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 operando via Claude Code CLI v2.1.x. Este PRD foi escrito pelo Agente Arquiteto (Claude Opus 4.7 na plataforma web).

### Esclarecimento de Dúvidas

> 💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: criação dos projetos Supabase (organização correta? plano correto?), configuração DNS (quem é o registrador? quem tem acesso?), GitHub Secrets (quem cria? quem rotaciona?), email para alertas.

### Instruções Obrigatórias

> ⚠️ **1. ANTES DE IMPLEMENTAR:** "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> ⚠️ **2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app seguindo SemVer (este PRD entrega base para v2.0.0-rc.1)
> - Atualizar o CHANGELOG.md seguindo Keep a Changelog
> - Renomear este arquivo adicionando `_DONE` ao final (`PRD-100-setup-supabase_DONE.md`)
> - Atualizar a seção "Status de Implementação" com: Status ✅ IMPLEMENTADO, Data, Versão do app, observações

### Princípios de Implementação

| Princípio                   | Descrição                                                              |
| --------------------------- | ---------------------------------------------------------------------- |
| **Idempotência primeiro**   | Toda migration deve poder ser re-executada sem erro (`IF NOT EXISTS`)  |
| **Documentação versionada** | Tudo em `docs/infra/` no Git; nada em wiki externa                     |
| **Validação automática**    | Smoke test em CI (RF-081) é não-negociável; vale mais que documentação |
| **Secrets fora do Git**     | Verificado por `gitleaks` no pre-commit hook + CI                      |
| **Defense-in-depth**        | Schemas + RLS + JWT claims (este PRD entrega a primeira camada)        |

### Orientações Específicas

| Aspecto                              | Orientação                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ordem de criação dos projetos**    | Comece pelo `gallo-staging` para testar todo o fluxo; só depois crie `gallo-prod` aplicando os aprendizados                                                                          |
| **MCP Supabase como acelerador**     | Use `Supabase:list_projects`, `Supabase:apply_migration`, `Supabase:list_tables`, `Supabase:get_advisors` em vez de só Dashboard manual — acelera muito                              |
| **`supabase/config.toml`**           | O arquivo é o "manifest" do projeto local; toda config deve estar ali, exceto credenciais. `supabase link` sincroniza com o projeto remoto                                           |
| **Migration timestamp**              | Use formato `YYYYMMDDHHMMSS` (Supabase CLI gera automaticamente com `supabase migration new <nome>`); a primeira migration usa `00000000000000` para garantir que aparece primeiro   |
| **Custom domain DNS**                | Pode levar até 24h para propagar; provisione DNS com antecedência. Testar com `dig` antes de marcar como pronto                                                                      |
| **GitHub Actions tempo de execução** | `db-deploy.yml` deve completar em < 3 minutos no caso médio. Se demorar mais, investigar                                                                                             |
| **Recuperação de erro**              | Se `supabase db push` falha em prod por algum motivo, fazer rollback via `supabase db reset` é destrutivo — preferir corrigir migration e reaplicar; PITR (PRD-109) é último recurso |

### O que NÃO Fazer

| ❌ Evitar                                                                   |
| --------------------------------------------------------------------------- |
| Provisionar projetos em organização pessoal (deve ser AILA)                 |
| Plano Free em staging (sem PITR é risco inaceitável)                        |
| Schema único `public` (anula defense-in-depth do PostgREST)                 |
| Expor `SUPABASE_SERVICE_ROLE_KEY` no frontend                               |
| Hardcodar credenciais em qualquer arquivo                                   |
| Configurar billing sem alertas                                              |
| Pular validação E2E (RF-080); é o que prova que tudo funciona               |
| Deixar Vault sem secrets placeholder (mesmo vazios; servem como inventário) |
| Esquecer DNSSEC e SSL automático                                            |
| Aplicar migrations diretamente em prod sem passar por staging               |

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

| Data       | Versão | Alteração                                                              |
| ---------- | ------ | ---------------------------------------------------------------------- |
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1a do Lote 1 (Onda 4 Backend Supabase Real) |

---

**AILA - Sistemas Inteligentes**
