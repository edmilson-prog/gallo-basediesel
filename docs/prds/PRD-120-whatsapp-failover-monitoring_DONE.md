# PRD-120: Failover Meta↔Evolution + Monitoring de Provider WhatsApp

> ✅ **CONCLUÍDO em 2026-06-10** (v0.83.0 pós-merge — **fecha a Onda 5**).
> Entregue: 5 colunas de failover em `whatsapp_accounts` (migration
> `20260610152000`, CHECKs RF-002/003); engine puro
> `src/providers/whatsapp/failover.ts` (matriz de estados RF-020,
> auto-activate/restore, `resolveEffectiveAccount` — 16 testes);
> `processSendRequest` resolve a conta efetiva antes do pre-check 24h, audita
> `failover_used` e bounça `FAILOVER_INCOMPATIBLE` 422 para template com
> reserva Evolution (5 testes novos no core); tick SQL
> `public.whatsapp_health_tick()` via pg_cron */5 (transições + auto-failover
> + auto-restore 30min + audit ator `stores.manager_id` + notificações
> in-app); RPC owner-only `whatsapp_provider_health()`; seção "Provedores &
> Failover" em /app/gestao/saude; config de política/reserva + toggle manual
> auditado na tela Configurações → WhatsApp; seção #120 na suíte RLS.
> **Desvios registrados** em `docs/dev/whatsapp-failover.md`: tick SQL-only
> (sem pg_net/Edge healthCheck ativo — sem credenciais reais), RPC em vez de
> view, alertas por e-mail adiados (in-app no MVP; Resend gated #52), página
> de detalhe com gráficos (RF-061) e filtro de inbox por falha adiados,
> numeração v2.1.0 do PRD não adotada. e2e real gated nas credenciais Meta.

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/providers/whatsapp/` + `supabase/functions/` + UI admin_ |
| **Objetivo** | Fechar a Onda 5: introduzir **failover condicional** entre providers WhatsApp (Meta ↔ Evolution) configurado por conta, monitoring específico de saúde de cada provider (latência, taxa de erro, disconnect Evolution), alertas operacionais integrados ao PRD-110, audit log de transições, e UI de override manual para Owner. Após este PRD, a Onda 5 está completa e o sistema sobe para **v2.1.0 "Bridge"** |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | P1 — não-bloqueante para go-live com apenas 1 provider por conta, mas reduz risco operacional |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) — **fecha a onda** |
| **PRDs Relacionados** | PRD-111 (interface — `healthCheck`); PRD-112 (Meta — códigos de erro, rate limit); PRD-113 (Evolution — disconnect state); PRD-115 (envio — caller do failover); PRD-101 (schema — `whatsapp_accounts.failover_account_id` novo); PRD-110 (monitoring base — host de métricas + alertas); PRD-103 (RLS — admin) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Failover lógica em `src/providers/whatsapp/failover.ts`; monitoring queries em `crm.v_whatsapp_provider_health` |

### Critérios de Complexidade

> **Justificativa de Alta:** failover entre WhatsApp tem nuances específicas — não é apenas "tentar provider B se A falhar". Contas são diferentes (números diferentes Meta vs Evolution), customer pode ter respondido em uma das contas, janela 24h não é compartilhada, e nem todos os providers suportam o mesmo tipo de mensagem (template HSM só Meta). Decisão automática vs manual é frontier: muito automático esconde problemas operacionais; muito manual perde valor. Monitoring agregado e separado por provider exige queries cuidadosas. Erro causa mensagem enviada do número errado ou loop infinito de retry cross-provider.

---

## Contexto do Problema

Onda 5 entregou os 2 providers funcionando. Mas hoje:
- Se a conta Meta entra em **pausa** (qualidade caiu, ou cobrança), os envios falham até intervenção manual
- Se a instância Evolution **desconecta** (Baileys session expira, VPS reinicia), idem
- Owner descobre tarde — apenas quando vendedor reclama
- Não há resiliência operacional além de "abrir incidente"

Failover **inteligente** resolve para mensagens críticas:
- Conta principal Meta cai → mensagens novas vão automaticamente para conta Evolution previamente configurada
- Mensagens existentes na conversa Meta continuam lá (não migram histórico)
- Owner alertado em tempo real
- Quando Meta volta, failover desativa automaticamente (ou manual confirmação)

**Importante:** failover não é mágica. Customer responde no número Meta original → continua chegando lá. Failover é só para **outbound iniciado pela empresa** quando o provider primário está degradado.

---

## Conceito da Solução

### Modelo de Failover

Adicionar à `crm.whatsapp_accounts`:
- `failover_account_id uuid REFERENCES crm.whatsapp_accounts(id) NULL` — conta backup
- `failover_policy text CHECK IN ('disabled', 'manual', 'automatic') DEFAULT 'disabled'`
- `current_state text CHECK IN ('healthy', 'degraded', 'down', 'paused') DEFAULT 'healthy'`
- `state_changed_at timestamptz`
- `is_failover_active boolean DEFAULT false` — flag operacional

```sql
-- Migration aditiva
ALTER TABLE crm.whatsapp_accounts
  ADD COLUMN failover_account_id uuid REFERENCES crm.whatsapp_accounts(id),
  ADD COLUMN failover_policy text NOT NULL DEFAULT 'disabled'
    CHECK (failover_policy IN ('disabled', 'manual', 'automatic')),
  ADD COLUMN current_state text NOT NULL DEFAULT 'healthy'
    CHECK (current_state IN ('healthy', 'degraded', 'down', 'paused')),
  ADD COLUMN state_changed_at timestamptz,
  ADD COLUMN is_failover_active boolean NOT NULL DEFAULT false;
```

### Detecção de Estado

Edge Function `whatsapp-health-monitor` agendada via `pg_cron` (a cada 5min):
1. Para cada `whatsapp_accounts.is_active=true`:
2. Chama `provider.healthCheck()`
3. Combina com métricas das últimas 15min de `integration_logs`:
   - Taxa de erro > 30% → `degraded`
   - Taxa de erro > 70% ou healthcheck `down` → `down`
   - Healthcheck retorna `degraded` direto → `degraded`
4. UPDATE `current_state` + `state_changed_at`
5. Se `failover_policy = 'automatic'` AND `current_state = 'down'` → SET `is_failover_active = true`
6. Audit log + alerta (PRD-110)

### Fluxo de Envio com Failover

Edge Function `whatsapp-send` (PRD-115) atualizada:

```typescript
async function resolveAccountForSend(conversationId, kind): Promise<string> {
  const conv = await getConversation(conversationId)
  const account = await getAccount(conv.whatsappAccountId)
  
  // Se failover ativo e suporta o tipo de mensagem
  if (account.isFailoverActive && account.failoverAccountId) {
    const failover = await getAccount(account.failoverAccountId)
    
    // Validações:
    if (kind === 'template' && failover.provider !== 'meta') {
      // Evolution não tem template — não pode fazer failover de template
      throw new AppError('FAILOVER_INCOMPATIBLE', 422, ...)
    }
    
    audit('failover_used', { from: account.id, to: failover.id })
    return failover.id
  }
  
  return conv.whatsappAccountId
}
```

**Crítico:** failover só afeta **envios novos da conversa**. Webhook inbound continua chegando no número original. Para customer, o sistema parece coerente: ele recebe respostas (talvez de outro número, mas representando a mesma empresa).

### Quando Failover NÃO se Aplica

- Templates HSM em failover para Evolution → impossível (PRD-113 RF-040)
- Conversa que tem histórico recente: avisar Owner ("Envio agora vai por outro número")
- Customer que respondeu em uma das contas: respeitar — não muda

### Restore Automático

Quando provider volta a `healthy` por >= 30min consecutivos, `is_failover_active = false` automaticamente, com audit + notificação. Owner pode definir threshold maior se desejar (config futura).

### Monitoring de Saúde Específico

Em `/app/admin/saude` (PRD-110), nova seção "Saúde de Provider WhatsApp":

```
Conta              Provider    Estado    Latência p95   Erro%   Failover
─────────────────────────────────────────────────────────────────────────
Matriz             Meta        🟢 healthy   850ms        0.4%   Disponível (Evolution)
Filial1            Evolution   🟡 degraded  2.1s         8.2%   N/A
Filial2            Meta        🔴 paused    n/a          n/a    Ativo → Evolution-bkp
```

Click em uma conta abre detalhes: últimas 24h em gráfico, lista de erros recentes, botão "Ativar failover manual" / "Desativar failover".

### Override Manual de Owner

UI permite Owner:
- Forçar `is_failover_active=true` (mesmo se policy=manual e provider healthy)
- Forçar `is_failover_active=false` (rejeita failover automático)
- Trocar `failover_policy` (manual ↔ automatic ↔ disabled)
- Trocar `failover_account_id`

Toda mudança logada em audit.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Failover transparente sem aviso | Owner precisa saber que está rodando em backup |
| Migrar histórico de conversa para conta de failover | Não-implementável (Meta + Evolution são silos) |
| Provider único com fallback "interno" | Conceito diferente — failover é cross-provider |
| Auto-failover global (toda conta) | Por conta dá flexibilidade — algumas contas sem failover por design |
| Healthcheck contínuo (sem cron) | Caro; 5min cobre detecção razoável |
| Restore manual apenas | Owner sobrecarregado; auto-restore com threshold é melhor |

---

## Escopo

### Incluído

- ✅ Migration aditiva em `crm.whatsapp_accounts` com 5 colunas novas (failover + estado)
- ✅ Edge Function `whatsapp-health-monitor` agendada (`pg_cron` cada 5min) que avalia estado de cada conta
- ✅ Lógica de transição de estado: healthy ↔ degraded ↔ down ↔ paused
- ✅ Auto-activate failover quando `policy=automatic` AND `state=down`
- ✅ Auto-restore failover quando `state=healthy` por >= 30min
- ✅ Update no PRD-115 `whatsapp-send` para resolver conta via `resolveAccountForSend` (com failover)
- ✅ Validação cross-provider: failover de template HSM bloqueado se backup é Evolution
- ✅ Audit log estruturado: `failover_activated`, `failover_deactivated`, `failover_used`, `provider_state_changed`
- ✅ Section em `/app/admin/saude` (PRD-110): "Saúde de Provider WhatsApp"
- ✅ View SQL `crm.v_whatsapp_provider_health` agregando estado + métricas das últimas 24h
- ✅ UI de detalhes da conta: gráfico de latência, lista de erros, botões de override manual
- ✅ Alertas integrados (PRD-110):
  - `provider_state_changed` → degraded/down → email Owner
  - `failover_activated` → email
  - `failover_deactivated` → email (informativo)
- ✅ RLS: visão de provider health apenas Owner/Manager (PRD-103 estendido)
- ✅ Testes: simular degradação → verificar transição de estado + failover activate; restore após melhora
- ✅ Documentação `docs/dev/whatsapp-failover.md`: arquitetura, políticas, runbook operacional

### Excluído

- ❌ Failover entre números do MESMO provider (ex: dois números Meta da mesma BA) — fora do MVP; cliente pode configurar como contas separadas
- ❌ Roteamento por hora/horário (peak time use Meta, off-peak use Evolution) — fora de escopo
- ❌ Multi-provider load balancing (50/50) — fora de escopo
- ❌ Migração de histórico entre contas — tecnicamente impossível
- ❌ Notificação push ao Owner quando failover ativa — email no MVP
- ❌ Auto-pause de provider por baixa qualidade Meta — Meta gerencia, não temos visibilidade direta da quality rating
- ❌ Custos de cada provider (Meta cobra por conversa) — Onda 9 ou 13 quando billing for relevante

---

## Requisitos Funcionais

### Schema

- **RF-001:** Migration adiciona 5 colunas em `crm.whatsapp_accounts`:
  - `failover_account_id uuid REFERENCES crm.whatsapp_accounts(id) ON DELETE SET NULL`
  - `failover_policy text NOT NULL DEFAULT 'disabled' CHECK IN (...)`
  - `current_state text NOT NULL DEFAULT 'healthy' CHECK IN (...)`
  - `state_changed_at timestamptz`
  - `is_failover_active boolean NOT NULL DEFAULT false`
- **RF-002:** Constraint: `failover_account_id != id` (não pode failover para si mesmo) — via CHECK.
- **RF-003:** Constraint: se `failover_policy != 'disabled'`, `failover_account_id` deve ser NOT NULL — via CHECK.

### Health Monitor Edge Function

- **RF-010:** Edge Function `supabase/functions/whatsapp-health-monitor/index.ts` que:
  1. Itera todas as `whatsapp_accounts.is_active=true`
  2. Para cada uma: chama `provider.healthCheck()`
  3. Consulta `crm.integration_logs` filtrado por conta nas últimas 15min — calcula taxa de erro
  4. Determina novo estado conforme regras (RF-020)
  5. UPDATE conta com novo state se mudou
  6. Decide failover automático (RF-030) ou restore (RF-031)
  7. Audit log + alerta se mudança crítica
- **RF-011:** Agendamento via `pg_cron` (instalado em ambiente Supabase): `SELECT cron.schedule('whatsapp-health-monitor', '*/5 * * * *', 'SELECT net.http_post(url=>...)')` — invoca a Edge Function a cada 5min.
- **RF-012:** Idempotência: se UPDATE não muda nada, não dispara audit/alerta (evita ruído).

### Regras de Estado

- **RF-020:** Regras de transição (avaliadas pelo health monitor):
  - `healthCheck` retorna `healthy` AND taxa_erro_15min < 10% → `healthy`
  - `healthCheck` `healthy` AND taxa_erro 10-30% → `degraded`
  - `healthCheck` `degraded` OR taxa_erro 30-70% → `degraded`
  - `healthCheck` `down` OR taxa_erro > 70% → `down`
  - Caso especial: Meta retorna account paused → `paused` (estado distinto, requer ação manual)
- **RF-021:** Transição registra `state_changed_at = now()`.

### Auto-Failover

- **RF-030:** Se `failover_policy = 'automatic'` AND `current_state = 'down'` (ou `paused`) AND `is_failover_active = false`:
  - SET `is_failover_active = true`
  - Audit `failover_activated` com payload `{ from_account, to_account, reason: state }`
  - Disparar alerta para Owner
- **RF-031:** Auto-restore: se `is_failover_active = true` AND `current_state = 'healthy'` AND `state_changed_at > 30min atrás`:
  - SET `is_failover_active = false`
  - Audit `failover_deactivated` payload `{ from_account, to_account, reason: 'auto-restore' }`
  - Alerta informativo

### Resolução de Conta no Envio

- **RF-040:** PRD-115 atualizado: antes de chamar `getWhatsAppProvider(accountId)`, chama `resolveAccountForSend(conversationId, kind)`:
  1. Lê conversation → account principal
  2. Se `account.isFailoverActive` AND `account.failoverAccountId`:
     - Valida compatibility por `kind`:
       - `template` → exige failover Meta; se backup é Evolution, lança `FAILOVER_INCOMPATIBLE`
       - `text` / `media` → ambos suportam, OK
       - `interactive` → exige failover Meta
     - Retorna `failoverAccountId`
     - Audit `failover_used` por mensagem
  3. Senão retorna conta original
- **RF-041:** Erro `FAILOVER_INCOMPATIBLE` é exibido ao vendedor: "Conta em failover, mas tipo de mensagem não suportado. Aguarde restauração ou contate gestor."

### Manual Override

- **RF-050:** Tela `/app/configuracoes/whatsapp` (existente ou criada — espelha cadastro de account) ganha aba "Failover":
  - Campo `failover_account_id` (select)
  - Campo `failover_policy` (radio: disabled / manual / automatic)
  - Botão "Ativar failover agora" (manual) — visível apenas se `policy != 'disabled'`
  - Botão "Desativar failover" — visível se `is_failover_active = true`
- **RF-051:** Mudanças logadas em audit como `policy_change` ou `manual_failover_toggle`.
- **RF-052:** Permissão: apenas Owner (RLS + guarda de rota).

### Dashboard de Saúde

- **RF-060:** Em `/app/admin/saude` (PRD-110), nova seção "Saúde de Provider WhatsApp":
  - Tabela com colunas: Conta, Provider, Estado (badge colorido), Latência p95 24h, Erro% 24h, Failover (configurado/ativo/n/a)
  - Hover sobre estado mostra `state_changed_at`
- **RF-061:** Click em conta abre `/app/admin/saude/whatsapp/<account_id>`:
  - Gráfico de latência (área) últimas 24h
  - Gráfico de taxa de erro (line) últimas 24h
  - Tabela de últimas 20 falhas com `failure_code`, `failure_reason`, customer
  - Botões "Forçar failover" e "Desativar failover" se aplicável
- **RF-062:** Atualização via polling 30s ou Realtime opcional.

### View SQL

- **RF-070:** View `crm.v_whatsapp_provider_health`:
  ```sql
  CREATE OR REPLACE VIEW crm.v_whatsapp_provider_health AS
  SELECT
    a.id AS account_id,
    a.phone_number,
    a.provider,
    a.current_state,
    a.state_changed_at,
    a.is_failover_active,
    a.failover_account_id,
    -- métricas últimas 24h via integration_logs
    (SELECT count(*) FROM crm.integration_logs il
     WHERE il.integration_name = 'whatsapp_' || a.provider
       AND il.created_at > now() - interval '24 hours') AS total_calls_24h,
    (SELECT count(*) FROM crm.integration_logs il
     WHERE il.integration_name = 'whatsapp_' || a.provider
       AND il.created_at > now() - interval '24 hours'
       AND il.http_status >= 400) AS error_count_24h,
    (SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY il.latency_ms))::int
     FROM crm.integration_logs il
     WHERE il.integration_name = 'whatsapp_' || a.provider
       AND il.created_at > now() - interval '24 hours') AS latency_p95_24h
  FROM crm.whatsapp_accounts a
  WHERE a.is_active = true;
  ```
- **RF-071:** RLS na view: SELECT apenas Owner/Manager da store dona da conta.

### Alertas

- **RF-080:** Integração com PRD-110 alerts:
  - `provider_state_changed` para `degraded`/`down`/`paused` → email Owner imediato
  - `failover_activated` → email Owner imediato
  - `failover_deactivated` (auto-restore) → email Owner informativo
  - `failover_used` (cada mensagem) → NÃO dispara alerta (ruído); apenas audit
- **RF-081:** Alerta inclui: conta afetada, estado atual, ação tomada (failover ativado?), link para `/app/admin/saude/whatsapp/<id>`.

### Audit Log

- **RF-090:** Eventos auditados:
  - `provider_state_changed` (cada transição)
  - `failover_activated`, `failover_deactivated` (automático ou manual)
  - `failover_used` (por mensagem; visível em audit mas sem alerta)
  - `failover_policy_changed`, `failover_account_changed` (via UI Owner)

### Testes

- **RF-100:** Testes unitários da lógica de transição de estado (regras combinatórias healthCheck × taxa_erro).
- **RF-101:** Teste integração: simular Meta retornando erro 100% por 15min em staging → health monitor detecta → estado=down → failover ativa automaticamente → envio subsequente usa Evolution → audit registra → email mock enviado.
- **RF-102:** Teste: forçar failover manual via UI → envio usa backup → revogar → volta normal.

### Documentação

- **RF-110:** `docs/dev/whatsapp-failover.md`:
  - Arquitetura e modelo de failover
  - Políticas (disabled / manual / automatic) com casos de uso
  - Limitações (template em Evolution, histórico não migra)
  - Runbook operacional Owner:
    - Como configurar failover entre 2 contas
    - O que esperar quando provider degrada
    - Como ativar/desativar manualmente
    - Troubleshooting comum

---

## Requisitos Não-Funcionais

- **RNF-001 (Detecção):** Health monitor detecta degradação em < 5min (granularidade do cron) com falsos positivos < 5%.
- **RNF-002 (Auto-restore robusto):** Threshold de 30min healthy contínuos evita flapping.
- **RNF-003 (Audit completo):** Toda transição e cada uso de failover auditados — rastreabilidade total.
- **RNF-004 (Performance):** Resolução de conta no envio adiciona < 50ms p95.
- **RNF-005 (Falha graciosa):** Se health monitor falha (job pg_cron), envios continuam normais — fail-open.
- **RNF-006 (Segurança):** Apenas Owner configura/override failover; RLS estrito.

---

## Critérios de Aceitação

### RF-010 + RF-020: Detecção de Estado

```gherkin
DADO conta Meta com 100% erros nos últimos 15min
QUANDO health monitor roda
ENTÃO current_state transiciona para 'down'
  E state_changed_at = now()
  E audit log 'provider_state_changed' registrado
  E email enviado ao Owner

QUANDO logo após, Meta volta a responder OK
  E 30min se passam com taxa de erro < 10%
ENTÃO current_state volta a 'healthy'
  E if is_failover_active=true → auto-restore para false
```

### RF-030 + RF-040: Failover Automático e Uso

```gherkin
DADO conta A1 (Meta) com failover_policy='automatic', failover_account_id=A2 (Evolution)
QUANDO A1 transiciona para 'down'
ENTÃO is_failover_active=true automaticamente
  E audit 'failover_activated'
  E alerta enviado

QUANDO vendedor envia texto na conversa cujo whatsapp_account=A1
  E resolveAccountForSend identifica failover
ENTÃO envio usa A2 (Evolution)
  E audit 'failover_used' com from=A1, to=A2
  E mensagem persistida com a conta correta
```

### RF-040 + RF-041: Incompatibilidade Template

```gherkin
DADO failover A1(Meta)→A2(Evolution) ativo
QUANDO vendedor tenta enviar TEMPLATE
ENTÃO PRD-115 detecta incompatibility (Evolution não tem HSM)
  E lança FAILOVER_INCOMPATIBLE 422
  E frontend exibe mensagem clara
  E vendedor decide aguardar ou usar texto livre
```

### RF-050 + RF-052: Override Owner

```gherkin
DADO Owner acessa /app/configuracoes/whatsapp > Failover
QUANDO clica "Ativar failover agora" para conta saudável
ENTÃO is_failover_active=true mesmo com state=healthy
  E audit 'manual_failover_toggle' registrado
  E envios subsequentes usam backup

DADO vendedor (não Owner) tenta acessar mesma tela
QUANDO autenticado
ENTÃO recebe 403 (guarda de rota + RLS)
```

### RF-060: Dashboard de Saúde

```gherkin
DADO Owner acessa /app/admin/saude > WhatsApp
QUANDO tela carrega
ENTÃO tabela mostra todas as contas com estado atual
  E badges coloridos refletem current_state
  E latência p95 e erro% últimas 24h visíveis
  E click em conta abre detalhes com gráficos
```

---

## Fases de Implementação

### Fase 1 — Schema + Health Monitor (1.5 dias)
- Migration aditiva
- Edge Function whatsapp-health-monitor
- pg_cron schedule
- Lógica de transição de estado
- Audit + alertas (integração PRD-110)

### Fase 2 — Failover na Envio (1 dia)
- resolveAccountForSend em PRD-115
- Validação cross-provider
- FAILOVER_INCOMPATIBLE handling no frontend
- Audit failover_used

### Fase 3 — UI Override + Dashboard (1.5 dias)
- Aba Failover em configurações
- View v_whatsapp_provider_health
- Seção em /app/admin/saude
- Gráficos e detalhes por conta

### Fase 4 — Testes + Docs + Bump Final (1 dia)
- Testes unitários + integração (simulação de falha)
- `docs/dev/whatsapp-failover.md`
- Demo Edmilson + Frederico — simulação completa de incidente
- Bump para **v2.1.0 "Bridge"** (release final da Onda 5)
- Marcar `_DONE` + atualizar status Onda 5 no INDEX

---

## Dependências

- **Depende de:** PRD-101 (schema base), PRD-103 (RLS extension), PRD-111-118 (toda Onda 5 anterior), PRD-110 (monitoring host), PRD-102 (Edge Function + pg_cron)
- **Fecha:** Onda 5 → v2.1.0 "Bridge"
- **Decisões Pendentes:** Threshold de auto-restore (30min sugerido); granularidade health check (5min sugerido); failover para template em Evolution (bloqueado tecnicamente — confirmar UX); paused state Meta (semi-manual — Owner notifica que voltou).

---

## Considerações de Segurança

- **Override apenas Owner:** RLS + guarda de rota + validação Edge Function
- **Audit completo:** failover é mudança operacional sensível — rastreabilidade total
- **Failover não muda permissões:** vendedor só envia para próprias conversas; conta backup respeita mesma RLS
- **Credenciais separadas:** account principal e failover têm Vault refs distintos — comprometimento de uma não afeta outra
- **Alertas não vazam dados:** email contém account_id + state, não phone_number completo

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump para **v2.1.0 "Bridge"** (release final da Onda 5; sai do RC); CHANGELOG consolidado da Onda 5 inteira (PRDs 111-120); renomear `PRD-120-whatsapp-failover-monitoring_DONE.md`; validar end-to-end com simulação de incidente real em staging. **Fecha a Onda 5.**

| Princípio | Descrição |
|-----------|-----------|
| **Failover é alivio, não mágica** | Aviso ao Owner; histórico não migra |
| **Auto-restore com threshold** | Evita flapping |
| **Validação por tipo de mensagem** | Template não funciona em Evolution |
| **Audit per envio** | Rastreabilidade total quando failover ativo |
| **Manual override Owner** | Última palavra é humana |

| ❌ Evitar |
|-----------|
| Failover silencioso (sempre alertar) |
| Migrar histórico de conversation (impossível tecnicamente) |
| Permitir failover de template para Evolution |
| Flapping (transições rápidas) |
| Health monitor que trava se um provider falha (continuar outros) |
| Override sem audit |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO |
| **Data** | 2026-06-10 |
| **Versão** | v0.83.0 (pós-merge; numeração v2.1.0 do PRD não adotada — SemVer da casa) |
| **Por** | Claude Code (AILA) |
| **Observações** | Fecha a Onda 5. Tick de saúde SQL-only (pg_net/healthCheck ativo deferidos — sem credenciais); desvios completos em `docs/dev/whatsapp-failover.md` |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 2d do Lote 2 (fecha Onda 5) |

---

**AILA - Sistemas Inteligentes**
