# PRD-107: Auth com Custom Claims

> **✅ STATUS: CONCLUÍDO (com ressalvas) — 2026-06-09**
>
> Custom Access Token Hook HABILITADO (claims role/seller_id/store_id); login real switchável; 5 Edge Functions owner-triggered (criar acesso, convite por e-mail, reset de senha, desligar/reativar, trocar papel); rota `/auth/definir-senha` (destino do link de convite/recovery) e wiring client `inviteSellerByEmail` + botão no dialog de Usuários.
>
> **Ressalvas:** envio de e-mail real gated na conta Resend (#46 — a função fica inerte até o secret existir); signup/recovery B2C deferidos para a fase da loja transacional (#41).

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Repositório**       | _Repositório vivo da Fase 1, `supabase/` + `src/features/auth/`_                                                                                                                                                                                                                                                                                                                                                                                            |
| **Objetivo**          | Implementar autenticação real via Supabase Auth com **custom claims** no JWT (`app_metadata`: `seller_id`, `store_id`, `role`, `customer_id`), populadas via Custom Access Token Hook. Fluxos de login, signup, convite de vendedor, recuperação de senha. Sincronização `auth.users` ↔ `crm.sellers` / `storefront.customer_accounts`. Este PRD **fecha o ciclo de segurança** — destrava as policies RLS (PRD-103) que sem claims operavam em fail-closed |
| **Tipo**              | Integração                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Prioridade**        | P0 — sem custom claims, RLS bloqueia tudo; é o que torna o sistema multi-usuário operacional                                                                                                                                                                                                                                                                                                                                                                |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                                                                                                                                                                                                              |
| **PRDs Relacionados** | PRD-100 (Setup — JWT secret); PRD-101 (Schema — `crm.sellers.auth_user_id`, `custom_claims`); PRD-103 (RLS — consome claims via `current_seller_id()` etc.); PRD-104 (Provider — sessão); PRD-006 Fase 1 (matriz RBAC fonte dos roles); PRD-167 Onda 10 (Convite de usuários B2B — estende fluxo); PRD-065 Fase 1 (Conta Cliente storefront)                                                                                                                |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Padrão de código**  | Auth hook em `supabase/functions/` ou Postgres function; lógica frontend em `src/features/auth/`                                                                                                                                                                                                                                                                                                                                                            |

### Critérios de Complexidade

> **Justificativa de Alta:** Auth é a fundação de segurança. Custom Access Token Hook (popular `app_metadata` no JWT) tem nuances — deve ser determinístico, rápido (roda em todo refresh de token), e nunca falhar (falha = ninguém loga). Sincronização `auth.users` ↔ `crm.sellers` exige triggers ou hooks cuidadosos. Múltiplos fluxos (login, signup interno via convite, signup B2C self-service, recuperação de senha). Distinção entre usuário do CRM (`crm.sellers`) e cliente B2C (`storefront.customer_accounts`). Erro causa lockout total ou, pior, claims erradas que vazam dados via RLS.

---

## Contexto do Problema

Os PRDs 103 (RLS), 104 (Provider) e 105 (Realtime) foram construídos assumindo que o JWT carrega `app_metadata` com `seller_id`, `store_id`, `role`, `customer_id`. Mas **nada popula essas claims ainda** — os PRDs anteriores documentaram isso como workaround (operam fail-closed: sem claims, RLS bloqueia tudo).

Este PRD fecha o ciclo. Após ele:

- Vendedor faz login → JWT carrega `seller_id`, `store_id`, `role`
- RLS (PRD-103) passa a filtrar corretamente (vendedor vê só a carteira)
- Provider (PRD-104) opera com segurança real
- Realtime (PRD-105) filtra eventos por permissão

A complexidade está no **Custom Access Token Hook** — uma função que o Supabase chama toda vez que emite/refresha um JWT, para injetar as claims customizadas. Ela precisa:

1. Buscar o `seller` (ou `customer_account`) correspondente ao `auth.users.id`
2. Injetar `seller_id`, `store_id`, `role` (ou `customer_id`, `role='b2c_customer'`)
3. Ser rápida (roda em todo refresh — a cada ~1h por usuário)
4. Nunca falhar (falha = login quebrado)

---

## Conceito da Solução

### Modelo de Identidade

```
auth.users (Supabase nativo)
   │
   ├──── 1:1 ────▶ crm.sellers (auth_user_id)       → role: owner/manager/seller_*
   │                                                  → claims: seller_id, store_id, role
   │
   └──── 1:1 ────▶ storefront.customer_accounts      → role: b2c_customer
                    (auth_user_id)                     → claims: customer_account_id
                    │
                    └── opcional link ──▶ crm.customers (linked_crm_customer_id)
                                          → para B2B: role: b2b_customer, claims: customer_id
```

Um `auth.users` é **ou** um seller (interno do CRM) **ou** um customer_account (cliente do e-commerce). O hook decide qual com base em qual tabela tem o `auth_user_id`.

### Custom Access Token Hook

Supabase permite registrar uma função Postgres que roda na emissão do JWT:

```sql
CREATE OR REPLACE FUNCTION crm.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_seller record;
  v_account record;
BEGIN
  claims := event -> 'claims';

  -- Tenta encontrar como seller (CRM)
  SELECT id, store_id, role INTO v_seller
  FROM crm.sellers
  WHERE auth_user_id = (event ->> 'user_id')::uuid
    AND is_active = true;

  IF FOUND THEN
    claims := jsonb_set(claims, '{app_metadata}', jsonb_build_object(
      'seller_id', v_seller.id,
      'store_id', v_seller.store_id,
      'role', v_seller.role,
      'customer_id', null
    ));
    RETURN jsonb_set(event, '{claims}', claims);
  END IF;

  -- Tenta encontrar como customer_account (storefront)
  SELECT id, linked_crm_customer_id INTO v_account
  FROM storefront.customer_accounts
  WHERE auth_user_id = (event ->> 'user_id')::uuid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{app_metadata}', jsonb_build_object(
      'seller_id', null,
      'store_id', null,
      'customer_id', v_account.linked_crm_customer_id,
      'customer_account_id', v_account.id,
      'role', CASE WHEN v_account.linked_crm_customer_id IS NOT NULL
                   THEN 'b2b_customer' ELSE 'b2c_customer' END
    ));
    RETURN jsonb_set(event, '{claims}', claims);
  END IF;

  -- Usuário sem mapeamento: claims vazias (fail closed)
  RETURN event;
END;
$$;
```

Registrar o hook no Supabase Dashboard (Auth → Hooks → Custom Access Token) ou via config.

### Fluxos de Autenticação

| Fluxo                    | Quem                  | Como                                                                                                |
| ------------------------ | --------------------- | --------------------------------------------------------------------------------------------------- |
| **Login interno**        | Vendedor/Gestor/Owner | email + senha → JWT com claims de seller                                                            |
| **Convite de vendedor**  | Owner convida         | Owner cria `crm.sellers` + envia invite via Supabase Auth; vendedor define senha no primeiro acesso |
| **Signup B2C**           | Cliente e-commerce    | self-service email+senha → cria `auth.users` + `storefront.customer_accounts`                       |
| **Login B2B**            | Cliente empresa       | credenciais fornecidas; `customer_account` linkado a `crm.customers`                                |
| **Recuperação de senha** | Qualquer              | fluxo nativo Supabase (magic link / reset email via Resend PRD-141)                                 |

### Sincronização auth.users ↔ sellers

Quando Owner cria um vendedor (`crm.sellers`), precisa criar o `auth.users` correspondente e linkar via `auth_user_id`. Fluxo via Edge Function (service_role):

```
[Owner cria vendedor no /app/configuracoes/usuarios]
   ──▶ Edge Function "invite-seller"
   ──▶ supabaseAdmin.auth.admin.inviteUserByEmail(email)
   ──▶ recebe auth.users.id
   ──▶ INSERT crm.sellers (auth_user_id = id, role, store_id, ...)
   ──▶ Vendedor recebe email de convite (via Resend, configurado no PRD-141)
   ──▶ Vendedor clica, define senha
   ──▶ No primeiro login, hook popula claims
```

### Alternativas Consideradas

| Alternativa                                        | Por que descartada                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Claims em `user_metadata`                          | `user_metadata` é editável pelo próprio usuário — inseguro para RBAC. `app_metadata` só é editável server-side |
| Buscar role via query em cada request (sem claims) | Adiciona round-trip a cada operação; claims no JWT é o padrão eficiente                                        |
| Roles via Postgres roles nativos                   | Supabase usa role `authenticated` único; custom claims é o caminho suportado                                   |
| Tabela de sessão própria                           | Reinventa Supabase Auth. Sem ganho                                                                             |
| Hook em Edge Function (não Postgres)               | Postgres function é mais rápida (sem cold start) e roda inline na emissão do token                             |
| Magic link only (sem senha)                        | Vendedores preferem senha; B2C pode ter magic link como opção                                                  |

---

## Escopo

### Incluído

- ✅ Custom Access Token Hook (`crm.custom_access_token_hook`) populando `app_metadata` com `seller_id`, `store_id`, `role` (sellers) ou `customer_id`, `customer_account_id`, `role` (customer_accounts)
- ✅ Registro do hook no Supabase (Dashboard ou config) em ambos ambientes
- ✅ Migration criando a função do hook + grants necessários
- ✅ Fluxo de login interno (email+senha) em `src/features/auth/` — tela já existe da Fase 1 (mock); este PRD conecta ao Supabase real
- ✅ Edge Function `invite-seller` (Owner convida vendedor → cria auth.users + crm.sellers + envia convite)
- ✅ Tela `/app/configuracoes/usuarios` (gestão de vendedores — convite, ativação, mudança de role) — integra com convite
- ✅ Fluxo de signup B2C self-service (e-commerce) → cria auth.users + storefront.customer_accounts
- ✅ Fluxo de recuperação de senha (nativo Supabase + email via Resend quando PRD-141 pronto; placeholder até lá)
- ✅ Sincronização: ao desativar seller (`is_active=false`), revogar sessões ativas
- ✅ Hook de logout que chama `RealtimeManager.releaseAll()` (PRD-105) e limpa cache do provider (PRD-104)
- ✅ Guarda de rotas no frontend baseada em `role` do JWT (complementa RLS — UX, não segurança)
- ✅ Testes: hook popula claims corretamente; seller vê própria carteira após login; B2C não acessa CRM
- ✅ Documentação `docs/dev/auth.md`: fluxos, hook, claims, troubleshooting

### Excluído

- ✅ Convite de usuários B2B no portal (vai no PRD-167 Onda 10 — estende este fluxo)
- ❌ MFA / 2FA (avaliar em Onda 13 Compliance)
- ❌ SSO / OAuth providers externos (Google, Microsoft) — avaliar conforme demanda do cliente
- ❌ SCIM / provisionamento automático — fora de escopo
- ❌ Política de senha complexa customizada além do default Supabase — Onda 13
- ❌ Sessões concorrentes limit (1 device por user) — fora de escopo MVP
- ❌ Auditoria detalhada de login/logout — básico via audit_logs; avançado em PRD-191
- ❌ Email transacional real de convite — depende de PRD-141 (Resend); placeholder até lá

---

## Requisitos Funcionais

### Custom Access Token Hook

- **RF-001:** Criar função `crm.custom_access_token_hook(event jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE`.
- **RF-002:** O hook busca em `crm.sellers` por `auth_user_id = event->>'user_id'` AND `is_active = true`. Se encontra, popula `app_metadata` com `seller_id`, `store_id`, `role`.
- **RF-003:** Se não é seller, busca em `storefront.customer_accounts`. Se encontra, popula `customer_account_id`, `customer_id` (se linkado), `role` ('b2b_customer' se linkado a crm.customers, senão 'b2c_customer').
- **RF-004:** Se não encontra em nenhuma tabela, retorna event sem claims (fail closed — RLS bloqueia).
- **RF-005:** O hook deve ser `STABLE` e rápido (< 10ms) — roda em todo refresh de token.
- **RF-006:** Grant de execução para o role `supabase_auth_admin` (necessário para o hook funcionar).
- **RF-007:** Registrar o hook via Supabase Dashboard (Auth → Hooks → Custom Access Token Hook) ou via `config.toml` em ambos ambientes. Documentar.

### Fluxo de Login Interno

- **RF-010:** Tela de login (`/login` ou `/app/login`) — já existe da Fase 1. Conectar ao `crmClient.auth.signInWithPassword({ email, password })`.
- **RF-011:** Após login bem-sucedido, JWT carrega claims (via hook). Frontend lê `role` para decidir rota inicial (owner → dashboard gestor; seller → inbox).
- **RF-012:** Sessão persiste (configurado no PRD-104 `persistSession: true`).
- **RF-013:** Login falho exibe mensagem clara ("Email ou senha incorretos") sem vazar qual dos dois está errado.
- **RF-014:** Vendedor inativo (`is_active=false`) — hook não popula claims → RLS bloqueia → frontend detecta ausência de role e exibe "Conta desativada, contate o gestor".

### Fluxo de Convite de Vendedor

- **RF-020:** Edge Function `invite-seller` (service_role):
  1. Recebe `{ email, name, role, store_id }` do Owner
  2. Chama `supabaseAdmin.auth.admin.inviteUserByEmail(email)`
  3. Recebe `auth.users.id`
  4. INSERT em `crm.sellers` com `auth_user_id`, `email`, `name`, `role`, `store_id`, `is_active=true`
  5. Email de convite enviado (Supabase nativo ou Resend quando PRD-141)
  6. Registra audit log
- **RF-021:** Tela `/app/configuracoes/usuarios` (Owner): listar vendedores, botão "Convidar vendedor", form (email, nome, role, store).
- **RF-022:** Vendedor convidado recebe email com link → define senha → primeiro login → hook popula claims.
- **RF-023:** Owner pode: desativar vendedor (is_active=false), reativar, mudar role. Mudança de role só reflete no próximo refresh de token (até 1h) ou force re-login.

### Fluxo de Signup B2C

- **RF-030:** Tela de signup no e-commerce (`/loja/conta/criar`) — PRD-065 Fase 1 tem o esqueleto.
- **RF-031:** `lojaClient.auth.signUp({ email, password })` → cria `auth.users`.
- **RF-032:** Trigger ou Edge Function cria `storefront.customer_accounts` correspondente (`auth_user_id`, `email`, `name`).
- **RF-033:** Email de verificação (Supabase nativo / Resend). `email_verified` atualizado.
- **RF-034:** Após verificação + login, hook popula `role='b2c_customer'`, `customer_account_id`.

### Fluxo de Login B2B

- **RF-040:** Cliente B2B tem `storefront.customer_accounts` com `linked_crm_customer_id` preenchido (link feito por owner/manager ou no PRD-167).
- **RF-041:** Login normal; hook detecta link e popula `role='b2b_customer'`, `customer_id`.
- **RF-042:** B2B acessa portal (`/portal/*`) com RLS filtrando por `customer_id`.

### Recuperação de Senha

- **RF-050:** Fluxo nativo Supabase: `auth.resetPasswordForEmail(email)`.
- **RF-051:** Email com magic link (Supabase nativo; trocar para Resend quando PRD-141 pronto).
- **RF-052:** Tela de definição de nova senha após clicar no link.

### Sincronização e Lifecycle

- **RF-060:** Ao desativar seller (`is_active=false` via UPDATE), invalidar sessões ativas: `supabaseAdmin.auth.admin.signOut(auth_user_id)` (via Edge Function). Próximo refresh falha → vendedor deslogado.
- **RF-061:** Logout no frontend: `client.auth.signOut()` + `RealtimeManager.releaseAll()` (PRD-105) + `provider.clearCache()` (PRD-104).
- **RF-062:** Refresh de token automático (PRD-104 `autoRefreshToken`). Claims re-populadas a cada refresh (mudanças de role refletem em até 1h).

### Guarda de Rotas Frontend

- **RF-070:** Componente `RequireRole` / hook `useAuth` que lê `role` do JWT.
- **RF-071:** Rotas `/app/configuracoes/*` exigem `owner`. Rotas `/app/*` exigem qualquer role de seller. `/portal/*` exige `b2b_customer`. `/pwa/*` exige `seller_external` (ou qualquer seller no MVP).
- **RF-072:** **Importante:** guarda de rota é UX (evita mostrar tela sem permissão), NÃO é segurança (RLS é a segurança real). Documentar isso claramente.

### Testes

- **RF-080:** Teste do hook: simular `event` com `user_id` de seller → claims corretas; de customer_account → claims B2C; de user sem mapeamento → sem claims.
- **RF-081:** Teste E2E: login como vendedor → ver própria carteira (RLS + claims funcionando juntos); login como vendedor B → ver carteira diferente.
- **RF-082:** Teste E2E: signup B2C → não consegue acessar `/app` nem dados de CRM.
- **RF-083:** Teste: desativar seller → sessão invalidada no próximo refresh.

### Documentação

- **RF-090:** `docs/dev/auth.md`: modelo de identidade, hook explicado, fluxos (login, convite, signup B2C/B2B, recuperação), claims structure, troubleshooting ("vendedor não vê carteira após login" → checar claims no JWT).

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Hook executa < 10ms. Índice em `crm.sellers.auth_user_id` e `storefront.customer_accounts.auth_user_id` (já em PRD-101 via UNIQUE).
- **RNF-002 (Confiabilidade):** Hook nunca lança exceção não-tratada — falha do hook = login quebrado para todos. Tratamento defensivo.
- **RNF-003 (Segurança):** Claims em `app_metadata` (server-only), nunca `user_metadata` (editável pelo user).
- **RNF-004 (Segurança — secret):** JWT secret no Vault (PRD-100). Nunca exposto.
- **RNF-005 (LGPD):** Email e dados de auth são PII. Soft delete + anonimização avaliados em PRD-191.
- **RNF-006 (UX):** Erros de login claros mas sem vazar info ("email ou senha incorretos", não "email não existe").
- **RNF-007 (Latência de role change):** Mudança de role reflete em até 1h (refresh de token) ou imediato com force re-login. Documentar essa janela.

---

## Critérios de Aceitação

### RF-002 + RF-081: Claims Populadas para Seller

```gherkin
DADO um seller S1 com auth_user_id=U1, store_id=ST1, role='seller_internal', is_active=true
QUANDO U1 faz login via signInWithPassword
ENTÃO o JWT emitido contém app_metadata.seller_id=S1
  E app_metadata.store_id=ST1
  E app_metadata.role='seller_internal'
  E ao consultar crm.customers, RLS filtra pela carteira de S1
```

### RF-003 + RF-082: B2C Isolado do CRM

```gherkin
DADO um customer_account CA1 com auth_user_id=U2 (sem linked_crm_customer_id)
QUANDO U2 faz login
ENTÃO o JWT contém app_metadata.role='b2c_customer'
  E app_metadata.customer_account_id=CA1
  E ao tentar acessar /rest/v1/?schema=crm, recebe 401
  E só consegue acessar schema storefront
```

### RF-004 + RF-014: Fail Closed sem Mapeamento

```gherkin
DADO um auth.users U3 sem registro em crm.sellers nem storefront.customer_accounts
QUANDO U3 faz login
ENTÃO o JWT não contém app_metadata com role
  E RLS bloqueia todas as queries (current_role() retorna null)
  E frontend exibe "Conta sem permissões, contate o suporte"
```

### RF-020 + RF-022: Convite de Vendedor

```gherkin
DADO Owner logado em /app/configuracoes/usuarios
QUANDO convida vendedor (email novo@gallo.com, role seller_internal, store ST1)
ENTÃO Edge Function invite-seller cria auth.users
  E cria crm.sellers com auth_user_id linkado, role, store_id
  E envia email de convite
  E registra audit log

QUANDO o vendedor clica no convite e define senha
ENTÃO no primeiro login, claims são populadas
  E vê a carteira (vazia inicialmente) corretamente
```

### RF-060 + RF-083: Desativação Invalida Sessão

```gherkin
DADO um vendedor S1 logado e ativo
QUANDO Owner desativa S1 (is_active=false)
  E uma Edge Function chama auth.admin.signOut(U1)
ENTÃO na próxima tentativa de refresh de token, S1 é deslogado
  E o hook não popula claims (is_active=false filtra)
  E S1 vê tela de "Conta desativada"
```

---

## Fases de Implementação

### Fase 1 — Hook + Claims (1.5 dias)

- Migration criando `crm.custom_access_token_hook`
- Registrar hook no Supabase (ambos ambientes)
- Criar usuários de teste manualmente (1 owner, 1 seller, 1 b2c)
- Validar que login popula claims corretamente (inspecionar JWT)
- **Marco crítico:** RLS do PRD-103 passa a funcionar de verdade

### Fase 2 — Login Interno + Guarda de Rotas (1 dia)

- Conectar tela de login ao crmClient
- `useAuth` hook + `RequireRole`
- Roteamento por role
- Logout completo (releaseAll + clearCache)

### Fase 3 — Convite de Vendedor (1.5 dias)

- Edge Function `invite-seller`
- Tela `/app/configuracoes/usuarios`
- Fluxo de ativação/desativação/mudança de role
- Invalidação de sessão na desativação

### Fase 4 — Signup B2C + B2B + Recuperação (1.5 dias)

- Signup B2C (storefront)
- Trigger/Edge Function cria customer_account
- Link B2B (manual no MVP; PRD-167 automatiza)
- Recuperação de senha (placeholder Resend)

### Fase 5 — Testes + Docs (1 dia)

- Testes do hook
- E2E: 3 personas (owner, seller, b2c)
- Documentação `docs/dev/auth.md`
- Demo + `_DONE`

---

## Dependências

### PRDs

- **Bloqueia (destrava):** PRD-103 (RLS passa a filtrar de verdade), PRD-104 (Provider opera seguro), PRD-105 (Realtime filtra), todas as Ondas 5+
- **Depende de:** PRD-100 (JWT secret), PRD-101 (`crm.sellers.auth_user_id`, `custom_claims`, `storefront.customer_accounts`), PRD-102 (Edge Functions para invite-seller), PRD-141 parcial (Resend para email real — placeholder até lá)

### Decisões Pendentes

- **Email de convite:** Supabase nativo (básico) até PRD-141 (Resend) estar pronto. Confirmar se aceita placeholder temporário.
- **MFA:** fora do MVP; confirmar que cliente concorda em postergar para Onda 13.
- **Janela de role change (1h):** aceitável ou exige force re-login imediato? Sugestão: aceitar 1h + botão "forçar logout do usuário" para Owner.

---

## Considerações de Segurança

- **`app_metadata` é server-only:** usuário não consegue editar suas próprias claims. Diferença crítica vs `user_metadata`.
- **Hook STABLE e defensivo:** nunca lança exceção; falha = login quebrado para todos.
- **is_active no hook:** vendedor desativado não recebe claims → fail closed automático.
- **Sessão invalidada na desativação:** `auth.admin.signOut` força logout.
- **Guarda de rota ≠ segurança:** documentado que RLS é a segurança; rota é UX.
- **Senha:** hashing gerenciado pelo Supabase (bcrypt). Nunca armazenamos senha.
- **JWT secret:** no Vault, rotação documentada (PRD-100 runbook).
- **Claims tampering:** JWT assinado HS256; tampering exige o secret.

---

## Notas para o Agente Desenvolvedor

### Esclarecimento de Dúvidas

> 💬 Confirme: email de convite via Supabase nativo até PRD-141 (sugerido sim); janela de 1h para role change (sugerido aceitar + botão force-logout); se MFA pode esperar Onda 13 (sugerido sim).

### Instruções Obrigatórias

> ⚠️ **1. ANTES DE IMPLEMENTAR:** O hook é o ponto mais crítico. Teste exaustivamente em staging com usuários reais antes de prod. Um hook quebrado = ninguém loga.

> ⚠️ **2. APÓS IMPLEMENTAR:**
>
> - Bump v2.0.0-rc.7 (penúltimo RC da Onda 4)
> - CHANGELOG: hook, fluxos, claims structure
> - Renomear `PRD-107-auth-custom-claims_DONE.md`
> - Validar que RLS (PRD-103) agora funciona end-to-end com claims reais
> - Documentação completa

### Princípios

| Princípio               | Descrição                                   |
| ----------------------- | ------------------------------------------- |
| **Hook nunca falha**    | Tratamento defensivo; falha = lockout geral |
| **app_metadata only**   | Nunca claims sensíveis em user_metadata     |
| **Fail closed**         | Sem mapeamento = sem claims = RLS bloqueia  |
| **Guarda de rota é UX** | RLS é a segurança real                      |
| **Logout limpa tudo**   | releaseAll + clearCache + signOut           |

### O que NÃO Fazer

| ❌ Evitar                                                   |
| ----------------------------------------------------------- |
| Claims em `user_metadata` (editável pelo user!)             |
| Hook que lança exceção não-tratada                          |
| Confiar em guarda de rota como segurança                    |
| Esquecer `is_active` no hook (vendedor desativado entraria) |
| Hook lento (roda em todo refresh)                           |
| Armazenar senha em qualquer lugar                           |
| Expor qual campo de login está errado                       |
| Esquecer de invalidar sessão na desativação                 |

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
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1c do Lote 1 (Onda 4) |

---

**AILA - Sistemas Inteligentes**
