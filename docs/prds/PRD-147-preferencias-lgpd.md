# PRD-147: Preferências de Notificação — Trilha Legal LGPD

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `crm.consent_records` + página pública `/preferencias-email/:token` + guarda no dispatch_ |
| **Objetivo** | Dar **lastro jurídico** ao sistema de preferências que já funciona (matriz do 008, persistida no 146): trilha de consentimento **imutável e append-only** (`crm.consent_records`) registrando cada opt-in/opt-out com base legal, origem, contexto e snapshot; **bases legais por categoria** (transacional = execução de contrato — só opt-out de canal; **marketing = consentimento** — opt-in explícito, default OFF, e sem registro de opt-in o dispatch **não envia**, guarda `skipped_no_consent`); a **página pública real** `/preferencias-email/:token` que o footer de todo email (141) já linka — valida o JWT, permite gestão granular e o descadastro de um clique; e o **opt-out automático por complaint** (marcação de spam do 141 vira registro legal). Não recria a tela do 009 — a enriquece com linguagem de consentimento e a faz gerar registros |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — gate legal do go-live: enviar marketing sem isto é passivo LGPD; e o link do footer (141) hoje aponta para um stub |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | PRD-008 F1 (matriz — recebe a semântica legal); PRD-009 F1 (tela — deltas de linguagem); PRD-146 (persistência real das preferências — a trilha registra as mudanças); PRD-141 (token JWT do footer + complaint webhook); PRD-143 (base legal transacional do WhatsApp já declarada — formalizada aqui); PRD-148/149 (**bloqueados por este**: marketing sem 147 não roda); PRD-103 (RLS) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Tabela append-only com revogação de UPDATE/DELETE; página pública fora do shell autenticado |

### Critérios de Complexidade

> **Justificativa de Alta:** o difícil aqui não é código — é **prova**. A LGPD (art. 8º §1º) põe no controlador o ônus de provar que o consentimento existiu: quando, como, para quê, com que aviso na tela. Isso exige imutabilidade real (append-only com revogação de privilégios no banco, não disciplina de aplicação), snapshot do contexto (o texto que a pessoa viu), e a distinção fina entre bases legais — confirmação de pagamento não pede consentimento (execução de contrato), drip de reativação pede (consentimento), e misturar as duas é exatamente o erro que gera autuação. Soma-se a página pública: superfície não-autenticada que mexe em dados pessoais via token — cada decisão de UX ali é também decisão de segurança.

---

## Contexto do Problema

O estado pós-146 é funcional e juridicamente frágil:

1. A matriz de preferências **funciona**, mas uma linha em `notification_preferences` com `updated_at` não prova consentimento — não diz o que a pessoa viu, de onde veio, nem sobrevive a um UPDATE posterior.
2. O footer de **todo email** já enviado pelo 141 linka `/preferencias-email/:token` — que é um stub. Link de descadastro quebrado é violação direta (LGPD + boas práticas de entregabilidade que o 141 protege).
3. A Onda quer ligar **drip (148) e carrinho abandonado (149)** — categoria marketing pura. Sem opt-in provável, cada disparo é passivo.
4. O complaint (marcou spam, 141) suprime tecnicamente o email — mas a **manifestação do titular** não vira registro legal de opt-out abrangente.

---

## Conceito da Solução

### Bases Legais por Categoria (a espinha do PRD)

| Categoria (008) | Base legal | Regra de envio | Quem controla |
|---|---|---|---|
| `transactional` | Execução de contrato (art. 7º V) | Envia sem opt-in; **opt-out por canal** respeitado (exceto supressão técnica, que é independente) | Titular desliga canal |
| `operational` / `system` (sellers) | Execução de contrato de trabalho / legítimo interesse | Idem transacional, escopo interno | Seller ajusta canais |
| `commercial` (follow-up de orçamento ativo) | Legítimo interesse (art. 7º IX) com opt-out destacado | Envia; opt-out simples e imediato | Titular |
| `gamification` (interno) | Legítimo interesse | Opt-out livre | Seller |
| **`marketing`** (drip, abandono, novidades) | **Consentimento (art. 7º I)** | **Só envia com `consent_record` de opt-in ativo** — matriz "on" sem registro **não basta** | Titular dá e revoga |

A consequência operacional: **guarda no dispatch** (141 — DELTA declarado, somando à de quiet hours do 146):

```
categoria == 'marketing' E canal externo:
  último consent_record (recipient, 'marketing', canal) é opt_in?
    não → delivery 'skipped_no_consent' (CHECK aditivo) + audit
    sim → segue (quiet hours do 146 ainda se aplicam)
```

### `crm.consent_records` — Append-Only de Verdade

```sql
CREATE TABLE crm.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('seller','customer')),

  scope_category text NOT NULL,            -- 'marketing' | 'transactional' | ... | 'all'
  scope_channel text NOT NULL,             -- 'email' | 'whatsapp' | 'sms' | 'push' | 'all'
  action text NOT NULL CHECK (action IN ('opt_in','opt_out')),
  legal_basis text NOT NULL CHECK (legal_basis IN ('consent','contract','legitimate_interest')),

  source text NOT NULL CHECK (source IN (
    'token_page',            -- página pública do footer
    'preferences_screen',    -- tela do 009 (autenticado)
    'checkout_optin',        -- checkbox do checkout (149 usa)
    'complaint_webhook',     -- marcou spam (141)
    'staff_assisted',        -- vendedor registrou a pedido do titular (auditado em dobro)
    'system_default'         -- seed de defaults (apenas bases não-consent)
  )),
  consent_text_snapshot text,              -- o texto exato exibido (obrigatório p/ opt_in de consent)
  ip inet, user_agent text,                -- quando origem pública/autenticada web
  acted_by uuid,                           -- seller, quando staff_assisted

  resulting_matrix jsonb NOT NULL,         -- snapshot da matriz após aplicar
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crm.consent_records (recipient_id, recipient_type, scope_category, scope_channel, created_at DESC);

REVOKE UPDATE, DELETE ON crm.consent_records FROM authenticated, anon, service_role;
-- imutabilidade no banco; nem a service_role edita. Correção = novo registro.
```

O estado vigente é **derivado**: o último registro por `(recipient, categoria, canal)` vence — função `getConsentState()` usada pela guarda e pela UI. A matriz do 146 continua sendo o cache operacional; a trilha é a verdade legal — toda mutação da matriz **gera** o registro na mesma transação (escritor único: função `applyConsentChange()` — a tela do 009, a página pública e o webhook de complaint passam todos por ela).

### Página Pública `/preferencias-email/:token`

```
[GALLO header light — fora do shell autenticado]

Olá, João. Gerencie o que você recebe da GALLO Base Diesel:

  Comunicações da sua conta (pedidos, pagamentos, notas)
  ✉ Email [on]  WhatsApp [on]        ← opt-out de canal (contrato)
  Estas mensagens fazem parte do serviço; você pode escolher o canal.

  Ofertas e novidades (marketing)
  ✉ Email [OFF] WhatsApp [OFF]       ← consentimento (default off)
  ☐ Quero receber ofertas... [texto integral versionado]

  [ Salvar preferências ]
  [ Descadastrar de todas as comunicações de marketing ]  ← 1 clique
```

- Valida o **JWT do 141** (recipientId+type, exp 90d, assinatura); inválido/expirado → formulário "digite seu email" que **envia novo link** (nunca confirma se o email existe — anti-enumeração) 
- Toda ação → `applyConsentChange()` com `source='token_page'` + IP/UA + snapshot do texto
- Descadastro de um clique: `opt_out (marketing, all)` — exigência prática de entregabilidade (e do List-Unsubscribe header, adicionado ao 141 como DELTA: `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click`)
- Token é capacidade de **gestão de preferências apenas** — não loga, não expõe pedidos, não mostra outros dados

### Complaint → Registro Legal

O webhook do 141 (`email.complained`) ganha uma linha: além da supressão técnica, `applyConsentChange(opt_out, marketing, all, source='complaint_webhook')`. Marcar spam é a manifestação mais inequívoca de opt-out que existe — agora ela tem efeito jurídico registrado, não só técnico.

### Direitos do Titular (operacional mínimo)

Ficha do cliente (012): seção "Consentimentos" com a linha do tempo dos registros (gestor lê; trilha auditável para responder solicitação do titular em minutos). Exclusão de cadastro: registros **permanecem** com `recipient_id` preservado (base: cumprimento de obrigação legal/exercício regular de direitos — guardar a prova do consentimento sobrevive à exclusão do perfil; nota jurídica no PRD para validação do advogado do cliente — decisão pendente).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| "updated_at na matriz basta" | Não prova o quê/quando/como; UPDATE destrói histórico — indefensável |
| Imutabilidade por disciplina de aplicação | REVOKE no banco é a única imutabilidade que vale em disputa |
| Opt-in de marketing default ON ("já é cliente") | Consentimento exige ato positivo (art. 8º §3º veda genérico); default OFF é a regra |
| Double opt-in (email de confirmação) | Padrão ouro, mas fricção alta para o perfil B2B; single com snapshot+IP é defensável — double registrado como evolução (decisão pendente) |
| Página pública com login | Mata o descadastro de um clique; token assinado é o padrão do mercado e do RFC 8058 |
| Misturar trilha com audit_logs (102) | Audit é operacional e genérico; consentimento exige schema próprio, imutável e consultável por titular |

---

## Escopo

### Incluído

- ✅ Migration `crm.consent_records` + índices + **REVOKE UPDATE/DELETE** + RLS (titular lê os próprios; gestor lê escopo; INSERT só via função)
- ✅ `applyConsentChange()` (escritor único, transacional: registro + matriz do 146 + cache) e `getConsentState()` (derivação do vigente)
- ✅ Guarda `skipped_no_consent` no dispatch (DELTA 141, ao lado da de quiet hours do 146) + valor no CHECK de deliveries
- ✅ Página pública `/preferencias-email/:token` (fora do shell, light, mobile-first): validação JWT, gestão por categoria×canal com as bases legais corretas, descadastro 1-clique, fluxo de token expirado anti-enumeração
- ✅ **DELTA 141:** headers `List-Unsubscribe` + `List-Unsubscribe-Post` em todo email (one-click → endpoint que chama `applyConsentChange`)
- ✅ Complaint webhook (141) → opt-out legal automático (`source='complaint_webhook'`)
- ✅ Deltas na tela do 009: seção marketing com checkbox de consentimento + texto integral versionado (`consent_texts` em constants, versionado por hash no snapshot); mudanças passam por `applyConsentChange(source='preferences_screen')`
- ✅ `staff_assisted`: na ficha do cliente, gestor/vendedor registra opt-in/out verbal a pedido do titular — modal com declaração obrigatória + audit em dobro
- ✅ Seed de defaults (146) reclassificado: gera registros `system_default` apenas para bases contract/legitimate_interest — **nunca** para marketing
- ✅ Ficha do cliente (012): seção "Consentimentos" (linha do tempo, leitura)
- ✅ Checkout (064): checkbox opcional de marketing no passo de dados (**desmarcado**, texto integral) → `checkout_optin` — prepara o 149
- ✅ Testes: imutabilidade (UPDATE/DELETE falham mesmo service_role), derivação do vigente (sequências opt-in→out→in), guarda no dispatch (sem registro→skipped; com→envia), JWT (válido/expirado/forjado), one-click, complaint→registro, anti-enumeração
- ✅ Documentação `docs/dev/consent-lgpd.md` + nota jurídica para validação do advogado do cliente

### Excluído

- ❌ Double opt-in (evolução registrada)
- ❌ Portal completo de direitos do titular (acesso/correção/portabilidade self-service) — Fase 3; o operacional mínimo (ficha + trilha) cobre o atendimento manual
- ❌ Cookie consent / tracking da loja (escopo distinto — frente web analytics futura)
- ❌ Criação das campanhas de marketing (148/149 — este PRD as **habilita**)
- ❌ DPO workflow / RIPD documental (processo do cliente, não software)

---

## Requisitos Funcionais

### Trilha

- **RF-001:** Tabela conforme conceito; REVOKE efetivo testado (UPDATE/DELETE negados a todos os papéis, incluindo service_role).
- **RF-002:** `applyConsentChange(input)` — única porta de escrita: valida (opt_in de `consent` exige `consent_text_snapshot`), INSERT + atualização da matriz (146) na mesma transação, retorna estado derivado.
- **RF-003:** `getConsentState(recipient, category, channel)` — último registro vence; `scope='all'` expande; ausência de registro: `consent`→sem permissão; `contract`/`legitimate_interest`→permitido.
- **RF-004:** `resulting_matrix` snapshot em todo registro (estado completo pós-mudança — reconstrução point-in-time).

### Guarda no Dispatch

- **RF-010:** Antes do envio de canal externo com `category='marketing'`: `getConsentState`; sem opt-in vigente → delivery `skipped_no_consent` + audit; **nunca** chama o provider.
- **RF-011:** Ordem das guardas no dispatch documentada: supressão técnica → consentimento → quiet hours (146) → envio.
- **RF-012:** Transacional/operacional não passam pela guarda de consentimento (base contratual) — opt-out de canal da matriz continua respeitado.

### Página Pública

- **RF-020:** Rota fora do shell autenticado; valida JWT (assinatura+exp); payload mínimo renderizado (primeiro nome).
- **RF-021:** Toggles por categoria×canal com microcopy da base legal correta; marketing exibe o texto integral do consentimento (versão atual).
- **RF-022:** Descadastro 1-clique (`opt_out, marketing, all`) com confirmação visual imediata, sem etapas extras.
- **RF-023:** Token inválido/expirado → form de email → **sempre** "Se este email estiver cadastrado, enviaremos um link" + envio real quando existir (rate-limit 3/h por IP).
- **RF-024:** Todas as ações → `applyConsentChange(source='token_page', ip, user_agent)`.

### One-Click (RFC 8058)

- **RF-030:** DELTA 141: headers `List-Unsubscribe: <mailto:...>, <https://.../unsubscribe-oneclick/:token>` e `List-Unsubscribe-Post: List-Unsubscribe=One-Click` em todo email.
- **RF-031:** Endpoint POST one-click: valida token, `opt_out(marketing, email)`, 200 sem corpo (chamado pelo provedor de email do titular, não por humano).

### Origens Integradas

- **RF-040:** Complaint (141) → `opt_out(marketing, all, complaint_webhook)` além da supressão.
- **RF-041:** Tela do 009: seção marketing reescrita com consentimento explícito (texto versionado); toda mudança → registro.
- **RF-042:** `staff_assisted`: modal na ficha com declaração ("registro a pedido verbal do titular em DD/MM"), `acted_by`, audit `consent_staff_assisted`.
- **RF-043:** Checkbox do checkout (064 — DELTA): desmarcado, texto integral, grava `checkout_optin` no submit do pedido.
- **RF-044:** Seed do 146 reclassificado: `system_default` proibido para `legal_basis='consent'` (teste garante).

### Visibilidade e Testes

- **RF-050:** Ficha (012): linha do tempo de consentimentos (data, ação, escopo, origem) — leitura, RBAC.
- **RF-051:** Testes conforme escopo; E2E: email real (mock) → clique no footer → página → opt-in marketing → drip (mock 148) envia → descadastro 1-clique → próximo drip `skipped_no_consent`.
- **RF-052:** `consent-lgpd.md`: mapa de bases legais, fluxos por origem, retenção pós-exclusão (nota jurídica), guia de resposta a solicitação do titular.

---

## Requisitos Não-Funcionais

- **RNF-001 (Imutabilidade no banco):** REVOKE, não disciplina — testado contra todos os papéis.
- **RNF-002 (Escritor único):** zero caminhos de mutação fora de `applyConsentChange` (lint + review).
- **RNF-003 (Default OFF para consent):** nenhum fluxo cria opt-in de marketing sem ato positivo do titular com texto exibido.
- **RNF-004 (Anti-enumeração):** página pública jamais confirma existência de cadastro.
- **RNF-005 (Prova completa):** todo opt-in de consent tem snapshot do texto + origem + contexto — defensável isoladamente.

---

## Critérios de Aceitação

### RF-010: Marketing Sem Consentimento Não Sai

```gherkin
DADO customer com matriz marketing/email "on" (legado) e ZERO consent_record de opt-in
QUANDO o drip (148) tenta enviar
ENTÃO delivery 'skipped_no_consent', provider não é chamado
  E audit registra

DADO o mesmo customer após opt-in na página do token
ENTÃO o próximo step envia normalmente
```

### RF-001: Imutável de Verdade

```gherkin
DADO registro de consentimento existente
QUANDO service_role tenta UPDATE ou DELETE
ENTÃO erro de permissão do Postgres (REVOKE)
  E a correção válida é um NOVO registro
```

### RF-022 + RF-031: Descadastro Sem Fricção

```gherkin
DADO email de marketing recebido
QUANDO o titular usa o "descadastrar" nativo do Gmail (one-click POST)
ENTÃO opt_out(marketing, email) registrado com source token
  E próximo envio de marketing por email → skipped_no_consent
QUANDO abre a página e clica "Descadastrar de todas"
ENTÃO opt_out(marketing, all) e confirmação imediata na tela
```

### RF-023: Anti-Enumeração

```gherkin
DADO token expirado e email digitado (existente ou não)
QUANDO submete
ENTÃO mesma mensagem neutra nos dois casos
  E link real enviado apenas quando o cadastro existe
  E 4ª tentativa na hora pelo mesmo IP → rate-limited
```

---

## Fases de Implementação

### Fase 1 — Trilha + Funções (1.5 dias)
- Migration + REVOKE + RLS; applyConsentChange/getConsentState; reclassificação do seed (146)

### Fase 2 — Guarda + One-Click (1 dia)
- skipped_no_consent no dispatch (ordem das guardas); headers + endpoint RFC 8058 (DELTA 141)

### Fase 3 — Página Pública (1.5 dias)
- Rota, JWT, toggles por base legal, 1-clique, token expirado anti-enumeração + rate-limit

### Fase 4 — Origens (1 dia)
- Complaint→registro; tela 009 com consentimento; staff_assisted; checkbox checkout (DELTA 064); ficha (012)

### Fase 5 — Testes + Docs (1 dia)
- Imutabilidade, E2E completo, consent-lgpd.md + nota jurídica
- `_DONE`

---

## Dependências

- **Depende de:** PRD-146 (matriz persistida — F1 da onda), PRD-141 (token, complaint, headers — DELTAs), PRD-009 (tela), PRD-064 (checkout — DELTA), PRD-012 (ficha)
- **Bloqueia:** **PRD-148 e PRD-149** (marketing não roda sem isto), PRD-150
- **DELTAs declarados:** 141 (guarda + headers + complaint-hook), 064 (checkbox), 146 (seed reclassificado), deliveries (CHECK +skipped_no_consent)
- **Decisões Pendentes:**
  - Texto integral do consentimento de marketing — **redação do cliente/advogado** (placeholder versionado entregue)
  - Retenção dos registros pós-exclusão de cadastro (nota jurídica) — validar com o advogado
  - Double opt-in — evolução; decidir antes de campanhas frias

---

## Considerações de Segurança

- Token = capacidade restrita a preferências; nunca autentica nem expõe dados além do primeiro nome
- Página pública: rate-limit, anti-enumeração, CSP estrita, zero terceiros
- IP/UA coletados como prova (minimização: só nas ações de consentimento)
- REVOKE inclui service_role — comprometimento de chave não reescreve a trilha
- staff_assisted com fricção deliberada (declaração + dupla auditoria): o caminho existe, abusá-lo deixa rastro

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.4.0-rc.7; CHANGELOG; renomear `PRD-147-preferencias-lgpd_DONE.md`; anotar DELTAs (141/064/146); placeholder do texto de consentimento sinalizado ao Owner para redação jurídica.

| Princípio | Descrição |
|-----------|-----------|
| **Prova, não promessa** | Snapshot + origem + imutabilidade no banco |
| **Base legal dita a regra** | Contrato envia; consentimento espera o ato |
| **Um escritor** | applyConsentChange ou nada |
| **Descadastrar é 1 clique** | RFC 8058 + página; fricção zero na saída |
| **Default OFF é inegociável** | Marketing nasce desligado, sempre |

| ❌ Evitar |
|-----------|
| UPDATE "corretivo" na trilha |
| Opt-in herdado/implícito/pré-marcado |
| Matriz mutada fora da função |
| Confirmar existência de email na página pública |
| Enviar marketing "porque a matriz estava on" |
| Snapshot ausente em opt-in de consent |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |
| **Versão** | - |
| **Por** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 5c do Lote 5 (Onda 8) |

---

**AILA - Sistemas Inteligentes**
