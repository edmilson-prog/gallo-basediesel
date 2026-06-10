# PRD-118: Status Tracking de Mensagens WhatsApp

> ✅ **CONCLUÍDO em 2026-06-10** (branch `feat/prd-118-status-tracking`). Entregue: migration `whatsapp_118_status_tracking` (customers.whatsapp_status, messages.failure_code, índice parcial outbound, RPC `whatsapp_delivery_health` owner-only validada ao vivo); badges completos (queued/sent/delivered/read/failed + tooltip com motivo + mini-badge no preview do inbox); **Realtime na conversa** (`useRealtimeMessages` + `applyRealtimeRow` com ranking anti-regressão de status); retry em fonte supabase via pipeline real (nova mensagem, `dispatch_retry` auditado com original); detecção 131026 (webhook + síncrona) marcando cliente inválido + gate `CUSTOMER_INVALID_WHATSAPP` com override staff auditado e revalidação manual no header; seção "WhatsApp — Saúde de Entrega" no dashboard Owner (24h/7d + top falhas); seção #118 na suíte RLS. Desvios registrados em `docs/dev/whatsapp-status-tracking.md` (schema public, messages.status, dashboard owner-only, RF-031/amostra de clientes adiados p/ PRD-120, retry de template via picker, e2e gated em credenciais).

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/features/conversations/` + queries de BI_ |
| **Objetivo** | Ampliar o tracking de `dispatch_status` (queued → sent → delivered → read → failed) com: UI rica de badges visuais (✓, ✓✓, ✓✓ azul), métricas agregadas por vendedor/conta/período, detecção de número inválido com flag no customer, retry manual para failed, dashboard de saúde de entrega exposto no painel de admin (com integração ao monitoramento do PRD-110) |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 3 |
| **Prioridade** | P1 — go-live aceita sem isto, mas é diferencial de UX e operação |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) |
| **PRDs Relacionados** | PRD-114 (webhook atualiza status); PRD-115 (envio define queued→sent→failed); PRD-101 (`messages.dispatch_status`, `failure_reason`); PRD-105 (Realtime propaga updates); PRD-110 (monitoring agrega); PRD-014 Fase 1 (Painel Gestor — consumidor de métricas) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Componentes em `src/features/conversations/components/`; queries de métricas em provider; dashboard reutilizável |

### Critérios de Complexidade

> **Justificativa de Média:** sem complexidade técnica gigante (UI + agregação SQL), mas múltiplos pontos de integração (Inbox, Conversa, Painel, Monitoring) e estados visuais bem definidos. Erro comum: tratar status como sequencial estrita quando na verdade tem ramos (sent → failed direto, delivered sem read, etc.). UX precisa ser clara sem ser barulhenta.

---

## Contexto do Problema

PRD-115 estabeleceu o ciclo básico de status, PRD-114 atualiza via webhook. Mas hoje:
- A UI ainda mostra apenas "enviado" / "falhou" — perde nuance entre delivered e read
- Vendedor não sabe **por que** uma mensagem falhou
- Gestor não tem visão de "qual conta WhatsApp tem mais falha"
- Número inválido descoberto via falha continua sendo tentado em mensagens futuras
- Failed messages somem visualmente — sem opção clara de retry

Este PRD completa o ciclo: **visibilidade de qualidade** e **ação corretiva**.

---

## Conceito da Solução

### Lifecycle Completo de Status

```
                  ┌──────────┐
            ┌────▶│  queued  │  (PRD-115 insere)
            │     └────┬─────┘
            │          │ provider.send sucesso
            │          ▼
            │     ┌──────────┐
            │     │   sent   │  (PRD-115 update após provider OK)
            │     └────┬─────┘
            │          │ webhook delivered (PRD-114)
            │          ▼
            │     ┌──────────┐
            │     │ delivered│  (PRD-114 update)
            │     └────┬─────┘
            │          │ webhook read (opcional)
            │          ▼
            │     ┌──────────┐
            │     │   read   │  (PRD-114 update — usuário leu)
            │     └──────────┘
            │
            └─── falha em qualquer ponto ────▶ ┌──────────┐
                                                │  failed  │
                                                └─────┬────┘
                                                      │ retry manual
                                                      ▼
                                                  (volta queued)
```

### Badges Visuais (espelhando WhatsApp consumer)

| Status | Badge | Cor | Significado |
|--------|-------|-----|-------------|
| `queued` | ⏳ | cinza | enviando ao provider |
| `sent` | ✓ | cinza | aceito pelo provider, não confirmado no celular |
| `delivered` | ✓✓ | cinza | chegou no celular do cliente |
| `read` | ✓✓ | **azul** | cliente leu (confirmação de leitura ativa) |
| `failed` | ⚠ | vermelho | falhou — com tooltip `failure_reason` |

Familiar para usuários WhatsApp; reduz curva.

### Detecção de Número Inválido

Quando Meta retorna code `131026` (número não-WhatsApp), além de marcar `failed`:
- Update `crm.customers.whatsapp_status = 'invalid'` (coluna nova — migration aditiva)
- Flag visual no customer profile: "Este número não é WhatsApp"
- Próximas tentativas para esse customer pedem confirmação antes de enviar

### Retry Manual

```
[Mensagem failed na tela]
   ┌─────────────────────────┐
   │ ⚠ Falhou — Número não é│
   │   WhatsApp              │
   │ [Tentar novamente]      │
   └─────────────────────────┘
       │
       │ click
       ▼
   PRD-115 invoca novamente:
   - cria NOVA message (preserva a failed)
   - tenta envio
   - update se sucesso
```

Não muda a failed; cria uma nova. Histórico preservado para auditoria.

### Dashboard de Saúde de Entrega

Em `/app/admin/saude` (PRD-110), nova seção:

```
WhatsApp — Saúde de Entrega (últimas 24h)

Conta            Enviadas  Sent%   Deliv%   Read%   Failed
Matriz (Meta)    1240      99.1%   97.3%    62.1%   1.0%
Filial1 (Evo)    345       99.7%   95.6%    n/a     1.7%

Top falhas:
- 5x Número não-WhatsApp (customers: João, Maria, ...)
- 3x Rate limited
- 2x Template não aprovado
```

### Métricas SQL

```sql
-- View ou função para taxa de entrega
CREATE OR REPLACE VIEW crm.v_whatsapp_delivery_health AS
SELECT
  m.conversation_id,
  c.whatsapp_account_id,
  date_trunc('hour', m.created_at) AS hour_bucket,
  count(*) FILTER (WHERE m.direction='outbound') AS total_outbound,
  count(*) FILTER (WHERE m.dispatch_status='sent') AS sent_count,
  count(*) FILTER (WHERE m.dispatch_status='delivered') AS delivered_count,
  count(*) FILTER (WHERE m.dispatch_status='read') AS read_count,
  count(*) FILTER (WHERE m.dispatch_status='failed') AS failed_count
FROM crm.messages m
JOIN crm.conversations c ON c.id = m.conversation_id
WHERE m.direction='outbound'
  AND m.created_at > now() - interval '7 days'
GROUP BY m.conversation_id, c.whatsapp_account_id, date_trunc('hour', m.created_at);
```

(Pode virar materialized view no PRD-108 se profiling indicar.)

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Status numérico (1,2,3,4) em vez de string | String é mais legível em logs/queries; CHECK constraint já valida |
| Inserir nova message em retry vs UPDATE failed | Inserir preserva histórico, alinha com modelo imutável de messages (PRD-101) |
| Flag `whatsapp_status` direto em customers | OK; alternativa seria tabela separada — mas coluna simples basta |
| Dashboard separado de saúde WhatsApp | Reusar `/app/admin/saude` (PRD-110) — coerência |
| Auto-retry após N segundos | Mais complexidade; manual MVP, automático em Onda 8 (engagement) |

---

## Escopo

### Incluído

- ✅ Migration aditiva `crm.customers.whatsapp_status` text CHECK in (`'unknown', 'valid', 'invalid', 'blocked'`) default `'unknown'`
- ✅ Migration aditiva `crm.messages.failure_code` text (opcional — guarda código semântico de erro além de `failure_reason` text)
- ✅ Componente `MessageStatusBadge` reutilizável (ícones + tooltip)
- ✅ Atualização da tela de Conversa (PRD-011) com badges nos balões outbound
- ✅ Atualização do Inbox (PRD-010) — última mensagem outbound mostra badge
- ✅ Componente `RetryFailedButton` que invoca PRD-115 com mesmo conteúdo
- ✅ Update no PRD-114 (webhook) para também atualizar `customers.whatsapp_status='invalid'` em falha 131026
- ✅ Update no PRD-115 para detectar customer `whatsapp_status='invalid'` antes de enviar e exibir confirmação ao vendedor
- ✅ View `crm.v_whatsapp_delivery_health` agregando métricas
- ✅ Seção "Saúde de Entrega WhatsApp" no dashboard `/app/admin/saude`:
  - Tabela por conta: enviadas, taxa sent, delivered, read, failed (últimas 24h e 7 dias)
  - Top falhas com customers afetados (clicáveis)
- ✅ Audit log de retries (`action='dispatch_retry'`)
- ✅ Testes: badges renderizam corretamente por status, retry cria nova mensagem, view de métricas
- ✅ Documentação `docs/dev/whatsapp-status-tracking.md`

### Excluído

- ❌ Auto-retry com backoff (Onda 8)
- ❌ Notificação ao vendedor de "sua mensagem foi lida" (push) — Onda 8
- ❌ Read receipts opt-out (cliente B2C pode desabilitar) — fora de escopo
- ❌ Detecção de bloqueio pelo cliente (Meta não expõe explicitamente) — não-objetivo
- ❌ Refinamento profundo de error codes Meta — cobrir top 5; resto agrupa em "Outros"
- ❌ Heatmap horário de melhor entrega — Onda 9 (analytics avançado)

---

## Requisitos Funcionais

### Schema Aditivo

- **RF-001:** Migration `crm.customers.whatsapp_status` text NOT NULL DEFAULT `'unknown'` CHECK in (`'unknown', 'valid', 'invalid', 'blocked'`).
- **RF-002:** Migration opcional `crm.messages.failure_code` text NULLABLE (códigos como `'invalid_number'`, `'rate_limited'`, `'template_required'`, `'session_expired'`).

### Badge Component

- **RF-010:** `<MessageStatusBadge status={'queued'|'sent'|'delivered'|'read'|'failed'} failureReason?={string} />` em `src/features/conversations/components/`.
- **RF-011:** Render conforme tabela de conceito (ícones + cores).
- **RF-012:** Em `failed`: hover/tap mostra tooltip com `failureReason`.
- **RF-013:** Acessível (aria-label "Mensagem enviada", "Mensagem lida", etc.).

### UI Conversa

- **RF-020:** Cada balão outbound na tela de Conversa (PRD-011) renderiza `<MessageStatusBadge>` no canto inferior.
- **RF-021:** Status atualiza em tempo real via Realtime (PRD-105 — UPDATE em messages dispara).
- **RF-022:** Em `failed`: balão tem opção `[Tentar novamente]` que abre o `RetryFailedButton`.

### UI Inbox

- **RF-030:** Lista de conversas (PRD-010): se última mensagem é outbound, exibir mini-badge no preview.
- **RF-031:** Sortable / filter por status (filter "Apenas conversas com falha recente" útil para gestor).

### Retry Manual

- **RF-040:** `<RetryFailedButton message={failedMessage} />`:
  - Click invoca `crmClient.functions.invoke('whatsapp-send', { body: { conversationId, kind: message.contentType, text: message.content, ... } })`
  - Cria nova message (NÃO atualiza a failed — preserva histórico)
  - Audit log com `action='dispatch_retry'`, payload contendo `original_message_id`
- **RF-041:** Se status atualizou no meio tempo (não está mais `failed`): botão desabilitado.

### Detecção e Persistência de Inválido

- **RF-050:** No webhook PRD-114, ao processar `InboundStatus` com `status='failed'`:
  - Se `failureReason` ou `failure_code` indica número inválido (Meta 131026): UPDATE `crm.customers` SET `whatsapp_status='invalid'` WHERE `whatsapp = <numero>` AND store_id = X
  - Audit log: `actor_type='integration'`, `action='customer_whatsapp_marked_invalid'`, payload com motivo
- **RF-051:** No PRD-115 (envio), antes de enviar para customer com `whatsapp_status='invalid'`:
  - Lança AppError frontend-friendly: `AppError('CUSTOMER_INVALID_WHATSAPP', 422, 'Número marcado como inválido. Confirme antes de enviar.')`
  - Frontend exibe modal: "Este número foi marcado como inválido. Deseja confirmar e enviar mesmo assim?" → Owner/Manager pode confirmar (override); seller comum não
- **RF-052:** Após sucesso de envio para customer `invalid`: NÃO automatizar volta para `valid` — exige action manual ("Marcar como WhatsApp válido") em ficha do customer.

### View de Métricas

- **RF-060:** Migration cria `crm.v_whatsapp_delivery_health` conforme conceito.
- **RF-061:** Função SQL agregadora `crm.whatsapp_delivery_summary(account_id, since, until)` retornando JSON com totais.
- **RF-062:** Provider PRD-104 expõe `getWhatsAppDeliveryHealth({ accountId?, sellerId?, since, until })`.

### Dashboard Saúde

- **RF-070:** Em `/app/admin/saude` (PRD-110), nova seção "WhatsApp — Saúde de Entrega":
  - Tabela por conta (24h e 7d)
  - Coluna "Top falhas" com agrupamento por `failure_code` + count + sample customers
  - Link "Ver conversas com falha" filtra Inbox
- **RF-071:** Acesso: apenas Owner/Manager (RLS + guarda de rota).
- **RF-072:** Atualização: query a cada 30s ou Realtime (depende de PRD-108 — view ou materialized).

### Audit Log

- **RF-080:** Toda transição importante logada:
  - `customer_whatsapp_marked_invalid`
  - `dispatch_retry`
  - `dispatch_override_invalid` (Owner force-send para customer invalid)

### Testes

- **RF-090:** Testes unitários do componente `MessageStatusBadge` (render correto por status).
- **RF-091:** Teste de integração: retry cria nova message; histórico preservado.
- **RF-092:** Teste: customer marcado invalid → tentativa nova bloqueia para seller; permite override de Owner.

### Documentação

- **RF-100:** `docs/dev/whatsapp-status-tracking.md`:
  - Lifecycle de status com diagrama
  - Significado de cada badge
  - Detecção e ação em número inválido
  - Como Owner/Manager investiga falhas
  - Roadmap futuro (auto-retry, push)

---

## Requisitos Não-Funcionais

- **RNF-001 (Tempo real):** Badge atualiza em < 2s após webhook (latência Realtime).
- **RNF-002 (Histórico imutável):** Retry NUNCA modifica message original — sempre cria nova.
- **RNF-003 (Performance):** Dashboard query < 1s; usar view e índices.
- **RNF-004 (Acessibilidade):** Badges com texto + cor; tooltip lido por screen reader.
- **RNF-005 (Privacy):** `failure_reason` no UI sanitizado (sem expor códigos internos sensíveis).

---

## Critérios de Aceitação

### RF-020 + RF-021: Badge em Tempo Real

```gherkin
DADO mensagem outbound enviada (status=sent)
QUANDO webhook chega com status='delivered'
ENTÃO mensagem na UI atualiza badge de ✓ para ✓✓ em < 2s sem refresh
  E quando read chega, vira ✓✓ azul
```

### RF-040 + RNF-002: Retry Cria Nova

```gherkin
DADO mensagem M1 com status=failed, content="Olá"
QUANDO vendedor clica [Tentar novamente]
ENTÃO nova message M2 é criada (queued → sent)
  E M1 permanece failed na UI (histórico)
  E audit log registra dispatch_retry com original_message_id=M1
  E provider envia "Olá" novamente
```

### RF-050 + RF-051: Bloqueio de Número Inválido

```gherkin
DADO customer C1 com whatsapp_status='invalid' (marcado após falha 131026)
QUANDO vendedor (não owner) tenta enviar mensagem
ENTÃO PRD-115 lança AppError CUSTOMER_INVALID_WHATSAPP
  E frontend mostra modal de confirmação
  E botão "Confirmar e enviar" apenas para owner/manager

QUANDO Owner clica confirmar
ENTÃO envio prossegue
  E audit log dispatch_override_invalid
```

### RF-070: Dashboard de Saúde

```gherkin
DADO últimas 24h com 100 envios na conta Matriz: 98 delivered, 1 read, 1 failed
QUANDO Owner abre /app/admin/saude > WhatsApp
ENTÃO tabela mostra: Sent% 100%, Delivered% 99%, Read% 1%, Failed 1%
  E top falhas detalha a 1 falha (motivo + customer)
```

---

## Fases de Implementação

### Fase 1 — Schema + Badges (1 dia)
- Migrations aditivas (whatsapp_status, failure_code)
- Componente MessageStatusBadge
- Integração nas telas de Conversa e Inbox

### Fase 2 — Retry + Detecção Inválido (1 dia)
- RetryFailedButton + invocação
- Webhook update customers.whatsapp_status
- Bloqueio + override no PRD-115
- Modal de confirmação UI

### Fase 3 — Dashboard + View + Docs (1 dia)
- View SQL + função agregadora
- Provider methods
- Seção em /app/admin/saude
- E2E test (envio → falha → retry → sucesso)
- `docs/dev/whatsapp-status-tracking.md`
- `_DONE`

---

## Dependências

- **Depende de:** PRD-114 (atualizar status + whatsapp_status), PRD-115 (criar message no retry, bloqueio invalid), PRD-101 (migrations aditivas), PRD-105 (Realtime), PRD-110 (dashboard host)
- **Bloqueia:** UX completa Onda 5; auto-retry futuro (Onda 8)
- **Decisões Pendentes:** Códigos de erro a categorizar (top 5: invalid_number, rate_limited, template_required, session_expired, other); auto-revalidação de customer invalid (sugerido: manual MVP).

---

## Considerações de Segurança

- `failure_reason` sanitizado antes de mostrar ao usuário (sem códigos internos ou stack)
- Override de invalid restrito a Owner/Manager via RLS + validação Edge Function
- Audit log de toda transição importante
- Dashboard de saúde restrito (não-vendedor não vê dados agregados de outros)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.1.0-rc.8; CHANGELOG; renomear `PRD-118-whatsapp-status-tracking_DONE.md`.

| Princípio | Descrição |
|-----------|-----------|
| **Histórico imutável** | Retry cria nova; failed permanece |
| **Badge familiar** | Espelha WhatsApp consumer (✓, ✓✓, azul) |
| **Falha visível** | Não esconder failed; oferece ação |
| **Inválido protegido** | Bloqueio + override só pra gestão |

| ❌ Evitar |
|-----------|
| Sobrescrever failed message em retry |
| Esconder failures (criam silêncio em prod) |
| Permitir seller força-enviar para invalid |
| Badge piscando ou poluindo UI |
| Auto-revalidação sem ação humana |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO |
| **Data** | 2026-06-10 |
| **Versão** | v0.81.0 (pós-merge) |
| **Por** | Claude Code CLI |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 2c do Lote 2 (Onda 5) |

---

**AILA - Sistemas Inteligentes**
