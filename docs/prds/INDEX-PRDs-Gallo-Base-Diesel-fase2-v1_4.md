# Índice de PRDs — GALLO BASE DIESEL — Fase 2 — v1.4

> **Catálogo mestre da Fase 2**
> Versão: 1.4 — Maio/2026
> Mantido pelo Arquiteto: Edmilson Souza (AILA Sistemas Inteligentes) + Claude Opus 4.7

---

## Arquitetura Supabase (decisões v1.3 — mantidas)

| Item | Decisão |
|------|---------|
| **Projetos Supabase** | 2 (staging + prod). Demo roda 100% mock no Vercel Preview, sem backend |
| **Hostnames** | `gallo.app` (prod), `staging.gallo.app` (staging) |
| **Schemas** | `crm` (operação interna + base ERP futuro), `storefront` (e-commerce). `public` deliberadamente vazio. `auth`/`storage` nativos |
| **Defense-in-depth** | PostgREST anônimo só expõe `storefront`. Schema `crm` invisível para anônimo |
| **Cross-schema** | Apenas via Edge Function (ex: checkout storefront → `crm.orders`) |
| **Frontend clients** | 2 distintos: `crmClient` e `lojaClient` (schemas via `db.schema`) |
| **Audit log imutável** | Policies `FOR DELETE/UPDATE USING (false)` em `crm.audit_logs` (não exige schema separado) |
| **Migrations** | Supabase CLI puro + MCP Supabase. Drizzle descartado |
| **Tipos TS** | `supabase gen types` → `src/types/supabase.generated.ts` (commited) |
| **Sub-apps no React** | 4: `/app` (crm), `/loja` (storefront), `/pwa` (crm + RLS por seller_id), `/portal` (crm + RLS por customer_id) |

---

## Informações do Projeto

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Cliente** | GALLO BASE DIESEL (distribuidora de peças pesadas em Frederico Westphalen/RS) |
| **Repositório** | (mesmo da Fase 1) |
| **Fase atual** | Fase 2 — Backend Real, Integrações e Produção |
| **Início da Fase 2** | Pós-validação Fase 1 (estimado Q3/2026) |
| **Briefing de execução Fase 2** | `briefing-execucao-prds-fase2.md` v1.3 |
| **Roadmap inicial Fase 2** | `ROADMAP-FASE2-Gallo-Base-Diesel.md` v1.0 (referência histórica) |
| **Metodologia** | AILA GuiaPRD v1.4 |
| **Estratégia de desenvolvimento** | Drop-in replacement — mockup validado → backend real sem refatorar consumidores |
| **Versão atual do app** | v1.0.0 — codinome **Heavy** (MVP Fase 1) |
| **Versão alvo Fase 2 (go-live mínimo)** | v2.4.0 — codinome **Reach** (pós-Onda 8) |
| **Versão alvo Fase 2 completa** | v4.0.0 — codinome **Compliance** (pós-Onda 13) |
| **Total de PRDs planejados (Fase 2)** | 106 (faixa 100–200, com sub-numeração B/C/D) |
| **PRDs Fase 3 — Onda 14 (registrado)** | 1 redigido (PRD-201) + 9 slots reservados (202–210) |
| **Total redigido neste documento** | 107 |
| **PRDs redigidos** | **32 (Ondas 4 + 5 + 6 completas)** |
| **PRDs implementados** | 0 |

---

## Agentes do Workflow

| Agente | Modelo | Ambiente | Função |
|--------|--------|----------|--------|
| **Arquiteto** | Claude Opus 4.7 (Anthropic) | Plataforma Web (claude.ai) | Cria e mantém PRDs Fase 2 |
| **Desenvolvedor (CLI)** | Claude Opus 4.7 | Claude Code CLI v2.1.x | Implementa PRDs Fase 2 sobre o repositório vivo da Fase 1 |
| **Direção estratégica** | Edmilson Souza + Frederico | Plataforma Web (claude.ai) | Revisão, autorização, decisões finais |

---

## Identidade Visual GALLO (preservada da Fase 1)

| Token | Valor | Uso |
|-------|-------|-----|
| Preto técnico | `#404041` | Cor principal da marca-mãe |
| Dourado cromia diesel | `#D2A809` | Cor de ação tema Diesel (default) |
| Verde PARTS | `#337648` | Submarca + tema alternativo |
| Vermelho SERVICE | `#C4151C` | Submarca + tema alternativo |
| Amarelo INDUSTRIAL | `#C79C2C` | Submarca + tema alternativo |
| Tipografia display | Saira Condensed | Títulos, hierarquia industrial |
| Tipografia UI | Inter | Body, formulários |
| Tipografia mono | JetBrains Mono | Códigos OEM, SKUs |
| Sistema de temas | 4 temas × 2 modos = 8 combinações | Dark + Diesel é o default |

**Identidade visual da Fase 2 NÃO MUDA em relação à Fase 1.** PRDs Fase 2 não redefinem cores, fontes, temas ou tokens. Quando relevante, referenciam PRD-001 Fase 1.

---

## Resumo de Status

### Documentação (PRDs redigidos)

| Status | Quantidade | Percentual |
|--------|------------|------------|
| 📝 Redigido | **32** | **30%** |
| ⏸ A redigir | 74 | 70% |
| **Total Fase 2** | **106** | **100%** |

### Implementação

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Implementado | 0 | 0% |
| 🔄 Em Andamento | 0 | 0% |
| ⏳ Pendente | 106 | 100% |
| ❌ Cancelado | 0 | 0% |
| **Total** | **106** | **100%** |

### Distribuição por Tipo

| Tipo | Quantidade |
|------|------------|
| 🔌 Integração (template específico) | 22 |
| ⚙️ Feature | 84 |

### Distribuição por Profundidade

| Profundidade | Quantidade |
|--------------|------------|
| **D** Detalhado | 80 |
| **E** Esqueleto enxuto | 26 |

### Distribuição por Prioridade

| Prioridade | Quantidade | Significado |
|------------|------------|-------------|
| **P0** | 26 | Bloqueante para go-live |
| **P1** | 30 | Alta |
| **P2** | 21 | Média |
| **P3** | 23 | Futuro |

---

## Catálogo Completo dos PRDs

> **Legenda:** 📝 Redigido | ⏸ A redigir | ✅ Implementado | 🔄 Em Andamento | ⏳ Pendente | **D** Detalhado | **E** Esqueleto enxuto | **I** Integração | **P0–P3** Prioridade

### Onda 4 — Backend Supabase Real (PRDs 100–110) — ✅ ONDA REDIGIDA

**Marco:** primeira onda é P0. Substitui mocks por persistência real. **Sem essa onda, nada vai a produção.**
Versão alvo: **v2.0.0 — codinome Engine**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 100 | Setup do projeto Supabase | Integração | D | P0 | 📝 | ⏳ | — |
| 101 | Schema do banco (migrations + seeds) | Feature | D | P0 | 📝 | ⏳ | 100, F1:002 |
| 102 | Edge Functions infraestrutura | Feature | D | P0 | 📝 | ⏳ | 101 |
| 103 | RLS (Row Level Security) | Feature | D | P0 | 📝 | ⏳ | 101, F1:006 |
| 104 | Substituir Providers Mock por Supabase | Feature | D | P0 | 📝 | ⏳ | 103, F1:005 |
| 105 | Realtime | Feature | D | P1 | 📝 | ⏳ | 104 |
| 106 | Supabase Storage | Feature | D | P1 | 📝 | ⏳ | 104 |
| 107 | Supabase Auth com Custom Claims | Integração | D | P0 | 📝 | ⏳ | 103, F1:006/065/071 |
| 108 | Performance e Otimização | Feature | D | P1 | 📝 | ⏳ | 104 |
| 109 | Backup e Disaster Recovery | Integração | D | P1 | 📝 | ⏳ | 100 |
| 110 | Monitoring e Observability | Integração | D | P0 | 📝 | ⏳ | 104 |

### Onda 5 — WhatsApp Real (PRDs 111–120) — ✅ ONDA REDIGIDA

**Marco:** canal #1 da GALLO sai do placeholder. SDR funciona com clientes reais.
Versão alvo: **v2.1.0 — codinome Bridge**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 111 | WhatsApp Provider Interface | Feature | D | P0 | 📝 | ⏳ | 005, 101 |
| 112 | Meta Cloud API Provider | Integração | D | P0 | 📝 | ⏳ | 111, 100 |
| 113 | Evolution API Provider | Integração | D | P0 | 📝 | ⏳ | 111, 100 |
| 114 | Webhook Unificado WhatsApp | Integração | D | P0 | 📝 | ⏳ | 112, 113, 102, 105, 106 |
| 115 | Envio de Mensagens | Feature | D | P0 | 📝 | ⏳ | 114, F1:011 |
| 116 | Templates HSM | Feature | D | P0 | 📝 | ⏳ | 112, 115 |
| 117 | Gerenciamento de Janela 24h | Feature | D | P1 | 📝 | ⏳ | 114, 116 |
| 118 | Status Tracking de Mensagens | Feature | D | P1 | 📝 | ⏳ | 114, 115, 110 |
| 119 | Migração de Stubs WhatsApp | Feature | D | P0 | 📝 | ⏳ | 111–118 |
| 120 | Failover + Monitoring de Provider | Feature | D | P1 | 📝 | ⏳ | 111–119, 110 |

> **Nota de re-escopo (27/05/2026):** PRD-118 original ("Múltiplas Contas WhatsApp") foi consolidado dentro de `whatsapp_accounts` (PRD-101) e cobertura natural via `failover_account_id` no PRD-120. PRD-118 ressignificado como Status Tracking (UX). PRD-120 reescopado como Failover + Monitoring (era originalmente reservado pra "Migração", agora em 119).

### Onda 6 — DINTEC via CSV + NFe Própria (PRDs 121–131) — ✅ ONDA REDIGIDA

> **⚠️ DINTEC sem qualquer acesso confirmado (27/05/2026):** cliente confirmou que não há API nem acesso a banco. Onda re-escopada para **import CSV manual**. Substituição do DINTEC vira **Fase 4/5** (ver §14 do briefing).
> Versão alvo: **v2.2.0 — codinome Anchor**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 121 | DINTEC Import Provider Interface | Feature | D | P0 | 📝 | ⏳ | 005, 101 |
| 122 | DINTEC CSV Schema + Upload UI | Feature | D | P0 | 📝 | ⏳ | 121, 101, 103, 106 |
| 123 | DINTEC Import Engine | Feature | D | P0 | 📝 | ⏳ | 121, 122, 101, 102 |
| 124 | DINTEC Sync Customers | Feature | D | P0 | 📝 | ⏳ | 123, 101 |
| 125 | DINTEC Sync Parts | Feature | D | P0 | 📝 | ⏳ | 123, 101 |
| 126 | DINTEC Reconciliation + Conflict Resolution | Feature | D | P1 | 📝 | ⏳ | 123, 124, 125 |
| 127 | NFe Provider Interface | Feature | D | P0 | 📝 | ⏳ | 005, 100, 101 |
| 128 | NFe Emission (Edge Function) | Integração | D | P0 | 📝 | ⏳ | 127, 101, 102, 103, 105 |
| 129 | NFe Storage (PDF + XML) | Feature | D | P0 | 📝 | ⏳ | 127, 128, 106 |
| 130 | NFe Cancelamento + Status Tracking | Integração | D | P0 | 📝 | ⏳ | 127, 128, 129, 102 |
| 131 | NFe Migração + Operacionalização | Feature | D | P0 | 📝 | ⏳ | 127–130, 100, 110 |

> **Nota de re-escopo (27/05/2026):** Onda 6 cresceu de 10 para 11 PRDs durante a redação. Codinome corrigido de "Sync" para "Anchor" (NFe como âncora fiscal). Estrutura final: 6 PRDs DINTEC (121-126) + 5 PRDs NFe (127-131). PRDs originalmente previstos como "Scheduler de Import" (129), "Audit Cross-System" (130), "Cadastro Clientes GALLO" (125), "Export Pedidos" (126), "Discovery DINTEC" (121) foram consolidados ou reescopados dentro do novo modelo. "Reconciliação Manual" (originalmente 128) virou PRD-126 (Reconciliation com UI de conflict resolution).

### Onda 7 — Pagamentos (PRDs 131–140)

**Marco:** dois gateways em paralelo — Asaas + Mercado Pago, selecionáveis via painel admin. E-commerce sai do modo demonstração.
Versão alvo: **v2.3.0 — codinome Cash**

> ⚠️ **Atenção:** PRD-131 foi REALOCADO para Onda 6 (NFe Operacionalização). Numeração da Onda 7 inicia em 132. Renumeração completa pendente em v1.5 do INDEX.

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 132 | Provider Asaas (PIX + boleto + cartão) | Integração | D | P0 | ⏸ | ⏳ | 104 |
| 132B | Provider Mercado Pago (PIX + boleto + cartão) | Integração | D | P0 | ⏸ | ⏳ | 104 |
| 133 | PIX QR Code Dinâmico (multi-provider) | Feature | D | P0 | ⏸ | ⏳ | 132, 132B, F1:064 |
| 134 | PIX Webhook (Confirmação multi-provider) | Integração | D | P0 | ⏸ | ⏳ | 133 |
| 135 | Boleto Bancário (multi-provider) | Integração | D | P1 | ⏸ | ⏳ | 132, 132B |
| 136 | Cartão de Crédito (multi-provider) | Integração | D | P1 | ⏸ | ⏳ | 132, 132B |
| 137 | Parcelamento | Feature | D | P1 | ⏸ | ⏳ | 135, 136 |
| 138 | Refund Automático (multi-provider) | Feature | D | P1 | ⏸ | ⏳ | 133, 135, 136 |
| 139 | Conciliação Financeira | Feature | D | P1 | ⏸ | ⏳ | 133–138 |
| 140 | Anti-Fraude Básico | Feature | E | P2 | ⏸ | ⏳ | 136 |
| 140B | Migração de Stubs Pagamento | Feature | D | P0 | ⏸ | ⏳ | 132–139 |

### Onda 8 — Notificações Reais (PRDs 141–150)

**Marco:** sistema "fala" com cliente — email, WhatsApp transacional, push. Possível **go-live cliente final.**
Versão alvo: **v2.4.0 — codinome Reach**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 141 | Email Transacional (Resend) | Integração | D | P0 | ⏸ | ⏳ | 104 |
| 142 | Templates Email | Feature | D | P1 | ⏸ | ⏳ | 141 |
| 143 | WhatsApp Transacional via HSM | Feature | D | P0 | ⏸ | ⏳ | 116, F1:067 |
| 144 | SMS (Fallback) | Integração | E | P3 | ⏸ | ⏳ | 104 |
| 145 | Push Notifications Web | Feature | E | P2 | ⏸ | ⏳ | 104, F1:070 |
| 146 | Notification Center | Feature | D | P1 | ⏸ | ⏳ | 141, 143 |
| 147 | Preferências do Cliente (Opt-in/Opt-out LGPD) | Feature | D | P0 | ⏸ | ⏳ | 141, 143 |
| 148 | Drip Campaigns | Feature | D | P2 | ⏸ | ⏳ | 142, 143 |
| 149 | Carrinho Abandonado | Feature | D | P1 | ⏸ | ⏳ | F1:064, 148 |
| 150 | Migração de Stubs Notificações | Feature | D | P0 | ⏸ | ⏳ | 141–149 |

### Onda 9 — LLM / IA Real (PRDs 151–160)

**Marco:** heurísticas do PRD-053 e simulador do PRD-020-024 ganham IA real. **3 providers em paralelo** (OpenAI + Anthropic + OpenRouter), painel de configuração, override por feature e dashboard de monitoramento.
Versão alvo: **v3.0.0 — codinome Brain**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 151 | LLM Gateway (3 providers: OpenAI, Anthropic, OpenRouter) | Integração | D | P0 | ⏸ | ⏳ | 102 |
| 151B | Painel de Configuração de Providers LLM | Feature | D | P0 | ⏸ | ⏳ | 151 |
| 151C | Sistema de Override por Feature | Feature | D | P0 | ⏸ | ⏳ | 151, 151B |
| 151D | Dashboard de Monitoramento de IA (tokens, custos, latência) | Feature | D | P0 | ⏸ | ⏳ | 151, 151B |
| 152 | Insights via LLM (substitui heurísticas PRD-053) | Feature | D | P1 | ⏸ | ⏳ | 151, 151C, F1:053 |
| 153 | SDR Avançado com LLM | Feature | D | P0 | ⏸ | ⏳ | 151, 151C, F1:020–024 |
| 154 | Análise de Sentimento | Feature | D | P2 | ⏸ | ⏳ | 151, 151C, F1:051 |
| 155 | Sugestões de Ação Contextualizadas | Feature | D | P2 | ⏸ | ⏳ | 151, 151C |
| 156 | Relatórios Narrativos | Feature | E | P3 | ⏸ | ⏳ | 151, F1:040 |
| 157 | Assistente IA dentro do App | Feature | E | P3 | ⏸ | ⏳ | 151 |
| 158 | Classificação Automática de Tópicos | Feature | E | P3 | ⏸ | ⏳ | 151 |
| 159 | Forecast com ML | Feature | E | P3 | ⏸ | ⏳ | 104 |
| 160 | Safety, Guardrails e Anti-Bias | Feature | D | P0 | ⏸ | ⏳ | 151 |

### Onda 10 — B2B Corporativo Funcional (PRDs 161–170)

**Marco:** Portal B2B (PRD-071) deixa de ser esqueleto e ativa workflows reais.
Versão alvo: **v3.1.0 — codinome Crown**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 161 | Workflow de Aprovação Real | Feature | D | P0 | ⏸ | ⏳ | F1:071, 143 |
| 162 | Faturamento Corporativo | Feature | D | P0 | ⏸ | ⏳ | F1:071, 139 |
| 163 | Parcelamento Estendido B2B (30/60/90) | Feature | D | P1 | ⏸ | ⏳ | 162 |
| 164 | NF Corporativa + Faturamento Mensal | Feature | D | P1 | ⏸ | ⏳ | 127, 163 |
| 165 | Catálogo Personalizado por Contrato | Feature | D | P1 | ⏸ | ⏳ | F1:071/030 |
| 166 | Comissões Avançadas | Feature | D | P2 | ⏸ | ⏳ | F1:047 |
| 167 | Convite Real de Usuários do Portal | Feature | D | P1 | ⏸ | ⏳ | F1:071, 141 |
| 168 | Integração ERP do Cliente | Integração | E | P3 | ⏸ | ⏳ | 199 |
| 169 | Marketplace Privado B2B | Feature | E | P3 | ⏸ | ⏳ | F1:071 |
| 170 | Reports Customizados B2B | Feature | E | P2 | ⏸ | ⏳ | F1:071 |

### Onda 11 — PWA Offline-First (PRDs 171–180)

**Marco:** PRD-070 esqueleto vira app real para vendedor externo em campo.
Versão alvo: **v3.2.0 — codinome Field**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 171 | Service Worker Completo | Feature | D | P1 | ⏸ | ⏳ | F1:070 |
| 172 | IndexedDB Cache Local | Feature | D | P1 | ⏸ | ⏳ | 171 |
| 173 | Sync Queue Offline | Feature | D | P1 | ⏸ | ⏳ | 171, 172 |
| 174 | Conflict Resolution Offline | Feature | D | P1 | ⏸ | ⏳ | 173 |
| 175 | GPS e Localização | Feature | E | P2 | ⏸ | ⏳ | F1:070 |
| 176 | Captura de Foto | Feature | E | P2 | ⏸ | ⏳ | 106 |
| 177 | Assinatura Digital | Feature | E | P2 | ⏸ | ⏳ | F1:070 |
| 178 | Push Notifications Mobile | Feature | E | P2 | ⏸ | ⏳ | 145, F1:070 |
| 179 | Voice Notes em Conversas | Feature | E | P3 | ⏸ | ⏳ | 115, 153 |
| 180 | Migração Completa PRD-070 | Feature | D | P1 | ⏸ | ⏳ | 171–179 |

### Onda 12 — Multi-loja + Equipes Ativas (PRDs 181–190)

**Marco:** equipes dormentes ativam; multi-loja real opera (segunda loja onboarded).
Versão alvo: **v3.3.0 — codinome Network**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 181 | Segunda Loja Ativa | Feature | D | P2 | ⏸ | ⏳ | F1:007 |
| 182 | Roteamento Entre Lojas | Feature | D | P2 | ⏸ | ⏳ | 181 |
| 183 | Estoque Cross-Loja | Feature | D | P2 | ⏸ | ⏳ | 181, 125 |
| 184 | Equipes Ativas (CRUD) | Feature | D | P2 | ⏸ | ⏳ | F1:019 |
| 185 | Metas por Equipe | Feature | D | P2 | ⏸ | ⏳ | F1:042, 184 |
| 186 | Comissões com Split por Equipe | Feature | D | P2 | ⏸ | ⏳ | F1:047, 184 |
| 187 | Transferência entre Lojas | Feature | E | P3 | ⏸ | ⏳ | 181, 183 |
| 188 | Dashboard Multi-Loja | Feature | E | P2 | ⏸ | ⏳ | F1:040, 181 |
| 189 | Permissões por Equipe | Feature | D | P2 | ⏸ | ⏳ | 184, F1:006 |
| 190 | Onboarding Multi-Loja | Feature | E | P3 | ⏸ | ⏳ | 181–189 |

### Onda 13 — Compliance + ML (PRDs 191–200)

**Marco:** LGPD avançado, SOC2 prep, ML predictivo. **MVP Fase 2 completo.**
Versão alvo: **v4.0.0 — codinome Compliance**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 191 | LGPD Avançado (consentimentos, DSR, anonimização) | Feature | D | P0 | ⏸ | ⏳ | 103, 147 |
| 192 | Audit Avançado (SOC2 prep) | Feature | D | P1 | ⏸ | ⏳ | 110, F1:019 |
| 193 | Análise Preditiva de Churn | Feature | D | P1 | ⏸ | ⏳ | 159, F1:051 |
| 194 | Recomendação de Peças (ML colaborativo) | Feature | D | P2 | ⏸ | ⏳ | 159, F1:030 |
| 195 | Detecção de Anomalias (estoque, vendas) | Feature | D | P2 | ⏸ | ⏳ | 159 |
| 196 | Penetration Test + Hardening | Integração | D | P0 | ⏸ | ⏳ | 100–110 |
| 197 | Backup Geo-Redundante | Integração | E | P1 | ⏸ | ⏳ | 109 |
| 198 | Documentação Completa Cliente | Feature | E | P1 | ⏸ | ⏳ | — |
| 199 | API Pública (rate-limited) | Integração | D | P2 | ⏸ | ⏳ | 102, 103 |
| 200 | Marketplace de Integrações | Feature | E | P3 | ⏸ | ⏳ | 199 |

### Onda 14 — Operações Críticas (PRDs 201–210, Fase 3)

> **Fase 3** — Operações Críticas. Move-se da metade do go-live (Fase 2) para "operação madura". 1 PRD redigido (PRD-201), 9 slots reservados.
> Versão alvo: **v4.1.0 — codinome Sentinel**

| # | Título | Tipo | Prof. | Prior. | Documento | Status | Depende de |
|---|--------|------|-------|--------|-----------|--------|------------|
| 201 | Estoque Crítico Filtros (stop-the-line) | Feature | D | P0 | 📝 | ⏳ | F1:030, 110 |
| 202 | _Reservado_ | — | — | — | ⏸ | ⏳ | — |
| 203 | _Reservado_ | — | — | — | ⏸ | ⏳ | — |
| 204 | _Reservado_ | — | — | — | ⏸ | ⏳ | — |
| 205 | _Reservado_ | — | — | — | ⏸ | ⏳ | — |
| 206 | _Reservado_ | — | — | — | ⏸ | ⏳ | — |
| 207 | _Reservado_ | — | — | — | ⏸ | ⏳ | — |
| 208 | _Reservado_ | — | — | — | ⏸ | ⏳ | — |
| 209 | _Reservado_ | — | — | — | ⏸ | ⏳ | — |
| 210 | _Reservado_ | — | — | — | ⏸ | ⏳ | — |

---

## Visão por Onda — Resumo

| Onda | Tema | PRDs | Qtd | Tempo (estim.) | Versão | Status |
|------|------|------|-----|----------------|--------|--------|
| 4 | Backend Supabase Real | 100–110 | 11 | 8–10 sem | v2.0.0 Engine | ✅ Redigida |
| 5 | WhatsApp Real | 111–120 | 10 | 6–8 sem | v2.1.0 Bridge | ✅ Redigida |
| 6 | DINTEC + NFe Própria | 121–131 | 11 | 10–12 sem | v2.2.0 Anchor | ✅ Redigida |
| 7 | Pagamentos | 132–140B | 11 | 8 sem | v2.3.0 Cash | ⏸ A redigir |
| 8 | Notificações Reais | 141–150 | 10 | 6 sem | **v2.4.0 Reach** | ⏸ A redigir |
| 9 | LLM / IA Real | 151–160 | 13 | 10–12 sem | v3.0.0 Brain | ⏸ A redigir |
| 10 | B2B Corporativo | 161–170 | 10 | 8 sem | v3.1.0 Crown | ⏸ A redigir |
| 11 | PWA Offline-First | 171–180 | 10 | 8 sem | v3.2.0 Field | ⏸ A redigir |
| 12 | Multi-loja + Equipes | 181–190 | 10 | 6 sem | v3.3.0 Network | ⏸ A redigir |
| 13 | Compliance + ML | 191–200 | 10 | 12–16 sem | **v4.0.0 Compliance** | ⏸ A redigir |
| **14** | **Operações Críticas (Fase 3)** | **201–210** | **1+9 slots** | **8–10 sem** | **v4.1.0 Sentinel** | ⏸ Parcial |

---

## Visão por Tipo

| Tipo | Quantidade | Distribuição |
|------|------------|--------------|
| ⚙️ Feature | 84 | 79% |
| 🔌 Integração | 22 | 21% |

**PRDs de Integração** atualizado (após redação Ondas 4-6):

| Onda | PRDs Integração |
|------|-----------------|
| 4 | 100 (Supabase Setup), 107 (Supabase Auth), 109 (Backup/DR), 110 (Monitoring) |
| 5 | 112 (Meta Cloud Provider), 113 (Evolution Provider), 114 (Webhook Unificado) |
| 6 | 128 (NFe Emission), 130 (NFe Cancelamento + Status) |
| 7 | 132 (Asaas), 132B (Mercado Pago), 134 (PIX Webhook), 135 (Boleto), 136 (Cartão) |
| 8 | 141 (Resend), 144 (SMS) |
| 9 | 151 (LLM Gateway) |
| 10 | 168 (ERP Cliente) |
| 13 | 196 (Pen Test), 197 (Backup Geo), 199 (API Pública) |

---

## Visão por Prioridade

| Prioridade | Significado | Quantidade |
|------------|-------------|------------|
| **P0** | Bloqueante para go-live mínimo | 31 |
| **P1** | Alta (necessário para experiência completa) | 30 |
| **P2** | Média (ampliação) | 21 |
| **P3** | Futuro (evolução contínua) | 23 |

**Conjunto P0 (Fase 2.0 Go-Live mínimo) — atualizado pós-redação Ondas 4-6:**

| PRDs | Tema | Status Redação |
|------|------|----------------|
| 100–104, 107, 110 | Backend Supabase essencial | ✅ |
| 111, 112, 114, 115, 116, 119 | WhatsApp essencial | ✅ |
| 121–125, 127, 128, 129, 130, 131 | DINTEC + NFe própria essencial | ✅ |
| 132, 132B, 133, 134, 140B | Pagamentos PIX essencial (Asaas + Mercado Pago) | ⏸ |
| 141, 143, 147, 150 | Notificações essenciais + LGPD opt-in | ⏸ |
| 151, 151B, 151C, 151D, 153, 160 | LLM Gateway + painel + override + dashboard + SDR + Safety | ⏸ |
| 161, 162 | B2B workflow + faturamento | ⏸ |
| 191 | LGPD avançado | ⏸ |

---

## Visão por Profundidade

| Profundidade | Quantidade | Aplicação |
|--------------|------------|-----------|
| **D** Detalhado | 80 | PRDs core, com requisitos completos, Gherkin, fluxos |
| **E** Esqueleto enxuto | 26 | PRDs futuros (P3 majoritariamente) ou de menor complexidade visual no MVP |

---

## Mapa de Dependências entre Ondas

```
                                                    ┌──────────────────────┐
                                                    │   FASE 1 — 50 PRDs   │
                                                    │   (mockup validado)  │
                                                    └──────────┬───────────┘
                                                               │
                              ┌────────────────────────────────┴────────────────────────────────┐
                              ▼                                                                 ▼
            ┌──────────────────────────────┐                                ┌──────────────────────────────┐
            │   ONDA 4 (PRDs 100–110) ✅   │                                │   ONDA 6 (PRDs 121–131) ✅   │
            │   Backend Supabase           │◀───── depende ─────────────────│   DINTEC + NFe               │
            │   v2.0.0 Engine — P0         │                                │   v2.2.0 Anchor — P0         │
            └──────────────┬───────────────┘                                └──────────────┬───────────────┘
                           │                                                               │
              ┌────────────┼────────────┬───────────────────────────┬────────────────────┐ │
              ▼            ▼            ▼                           ▼                    ▼ ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  ┌──────────────────────┐ ┌──────────────┐
      │ ONDA 5 ✅    │ │ ONDA 7       │ │ ONDA 8       │  │ ONDA 9               │ │ ONDA 10      │
      │ WhatsApp     │ │ Pagamentos   │ │ Notificações │  │ LLM / IA Real        │ │ B2B Funcional│
      │ v2.1 Bridge  │ │ v2.3 Cash    │ │ v2.4 Reach   │  │ v3.0 Brain           │ │ v3.1 Crown   │
      │ P0           │ │ P0           │ │ P0           │  │ P0/P1                │ │ P0/P1        │
      └──────┬───────┘ └──────────────┘ └──────────────┘  └──────────────────────┘ └──────────────┘
             │                                                                            │
             └───── webhook + templates ────────────────────────────────────────────────┐ │
                                                                                        ▼ ▼
                                                                            ┌──────────────────────┐
                                                                            │ Possível GO-LIVE     │
                                                                            │ (pós-Onda 8)         │
                                                                            └──────────────────────┘
```

**Caminho crítico para go-live mínimo:**

```
Onda 4 ✅ (Backend) → Onda 5 ✅ (WhatsApp) → Onda 6 ✅ (DINTEC+NFe) → Onda 7 (Pagamentos) → Onda 8 (Notificações)
                                                                                                       ↓
                                                                                          ┃ GO-LIVE POSSÍVEL ┃
```

---

## Timeline das 10 Ondas (Cronograma Macro)

```
                       ┌─────── ANO 1 ───────┐  ┌─────── ANO 2 ───────┐
                       │                      │  │                      │
Mês 1-3   ── Onda 4 (Backend Supabase) ✅ REDIGIDA
Mês 4-5   ── Onda 5 (WhatsApp Real)   ✅ REDIGIDA
Mês 6-9   ── Onda 6 (DINTEC + NFe)    ✅ REDIGIDA  ┃  (+3-4 sem — sem API DINTEC)
Mês 9-11  ── Onda 7 (Pagamentos)      ──────▶ Gate cliente  ┃ GO-LIVE
Mês 11-12 ── Onda 8 (Notificações)    ──────▶ Gate cliente  ┃ POSSÍVEL
Mês 12-15 ── Onda 9 (LLM/IA — 3 providers) ▶ Gate cliente
Mês 15-17 ── Onda 10 (B2B funcional)  ──────▶ Gate cliente
Mês 17-19 ── Onda 11 (PWA real)       ──────▶ Gate cliente
Mês 19-20 ── Onda 12 (Multi-loja)     ──────▶ Gate cliente
Mês 20-24 ── Onda 13 (Compliance+ML)  ──────▶ MVP Fase 2 completo
```

**Paralelização possível:** Ondas 5, 6, 7 podem ser paralelas se houver squads dedicados. Ondas 9, 10, 11 também aceitam paralelismo após Onda 8 concluída.

---

## Histórico de Versões do App (planejado Fase 2)

| Versão | Codinome | Marco | Status Redação |
|--------|----------|-------|----------------|
| **v1.0.0** | **Heavy** | MVP Fase 1 completo (50 PRDs implementados) | ✅ |
| v2.0.0 | Engine | Onda 4 — backend Supabase real | ✅ PRDs redigidos |
| v2.1.0 | Bridge | Onda 5 — WhatsApp produção | ✅ PRDs redigidos |
| v2.2.0 | **Anchor** | Onda 6 — DINTEC integrado + NFe própria | ✅ PRDs redigidos |
| v2.3.0 | Cash | Onda 7 — pagamentos reais (PIX, boleto, cartão) | ⏸ |
| **v2.4.0** | **Reach** | **Onda 8 — notificações ativas. Possível go-live cliente final.** | ⏸ |
| v3.0.0 | Brain | Onda 9 — LLM substitui heurísticas, salto major de IA | ⏸ |
| v3.1.0 | Crown | Onda 10 — B2B corporativo funcional | ⏸ |
| v3.2.0 | Field | Onda 11 — PWA real para vendedor externo | ⏸ |
| v3.3.0 | Network | Onda 12 — multi-loja real, equipes ativas | ⏸ |
| **v4.0.0** | **Compliance** | **Onda 13 — LGPD avançado, SOC2 prep, ML predictivo. MVP Fase 2 completo.** | ⏸ |
| v4.1.0 | Sentinel | Onda 14 (Fase 3) — Operações Críticas (PRD-201 estoque stop-the-line) | 📝 parcial |

> **Codinome Onda 6 atualizado:** v2.2.0 originalmente codinome "Sync" foi renomeado para "**Anchor**" durante a redação — refletindo que NFe é o âncora fiscal do sistema, não apenas sincronização com DINTEC. Decisão registrada abaixo.

---

## Próximos PRDs a Redigir

### Lote 4 — Onda 7 (Pagamentos)

PRDs em sequência sugerida:

| Sub-lote | PRDs | Conteúdo |
|----------|------|----------|
| 4a | 132, 132B, 133 | Providers Asaas + Mercado Pago + PIX QR Code |
| 4b | 134, 135 | PIX Webhook + Boleto |
| 4c | 136, 137, 138 | Cartão + Parcelamento + Refund |
| 4d | 139, 140, 140B | Conciliação + Anti-Fraude + Migração |

**Estimativa:** 4 turnos para 11 PRDs.

**Pré-requisitos antes de iniciar Onda 7:**
- [ ] Decisão final sobre split Asaas/Mercado Pago (paralelos confirmados — confirmar pesos default)
- [ ] Contas sandbox em ambos os providers criadas
- [ ] Confirmar com cliente se cartão de crédito é P0 ou pode ser P1 no MVP

---

## Decisões Arquiteturais Importantes

| Data | Decisão | Origem |
|------|---------|--------|
| Maio/2026 | **Drop-in replacement** como princípio central da Fase 2 | Briefing Fase 2 §4.1 |
| Maio/2026 | **VITE_DATA_SOURCE** continua sendo o único switch entre Mock e Real | Briefing Fase 2 §5.2 |
| Maio/2026 | **RLS espelhando matriz RBAC** do PRD-006 — segurança real, não só frontend | Briefing Fase 2 §4.3 |
| Maio/2026 | **Audit log promovido a primeira classe** — persistido + estruturado + retenção | Briefing Fase 2 §4.4 |
| Maio/2026 | **Snapshots imutáveis preservados** — colunas JSONB no Supabase | Briefing Fase 2 §4.2 |
| Maio/2026 | **Idempotência obrigatória** em todos os webhooks e syncs | Briefing Fase 2 §4.7 |
| Maio/2026 | **LGPD desde o dia 1** — PRD-191 P0 mesmo na Onda 13 | Briefing Fase 2 §4.9 |
| Maio/2026 | **Observability obrigatória** — APM + logs estruturados + alertas desde Onda 4 | Briefing Fase 2 §4.10 |
| Maio/2026 | **3 ambientes em paralelo** — `demo` (mock), `staging`, `produção` | Briefing Fase 2 §5.3 |
| Maio/2026 | **Gate de validação por onda** — cliente assina cada onda antes de avançar | Briefing Fase 2 §5.4 |
| 27/05/2026 | **DINTEC sem qualquer acesso** (nem banco) confirmado pelo cliente → Onda 6 re-escopada para import CSV manual + GALLO como fonte primária de clientes | Briefing Fase 2 §14 |
| 27/05/2026 | **Substituição do DINTEC** registrada como norte estratégico das **Fases 4 e 5** (GALLO ERP Light → ERP Completo) | Briefing Fase 2 §14 |
| 27/05/2026 | **PRD-150 renumerado para PRD-201** e movido para **Onda 14 — Operações Críticas (Fase 3)** | PRD-201 |
| Maio/2026 | **Mocks permanecem após Fase 2** — `src/mocks/` indefinidamente | Briefing Fase 2 §5.2 |
| 27/05/2026 | **Asaas + Mercado Pago** como gateways de pagamento (paralelos, parametrizáveis) | Briefing Fase 2 §13.2 |
| 27/05/2026 | **Resend** como provider de email transacional (fixo) | Briefing Fase 2 §13.2 |
| 27/05/2026 | **OpenAI + Anthropic + OpenRouter** como providers LLM (3 paralelos com override por feature) | Briefing Fase 2 §13.2 |
| 27/05/2026 | **DINTEC sem API** confirmado → Onda 6 re-estruturada (CSV manual + NFe própria) | Briefing Fase 2 §12 |
| 27/05/2026 | **Provider NFe próprio** (Focus NFe / PlugNotas / eNotas) — substitui dependência DINTEC para NF | PRD-127 |
| 27/05/2026 | **Painel + Override + Dashboard de LLM** (PRDs 151B/C/D) — inspirados em prints do projeto Dermatobel | PRDs 151B, 151C, 151D |
| **27/05/2026** | **Onda 4 (Backend Supabase) redigida** — 11 PRDs, 5.918 linhas. Bump alvo v2.0.0 "Engine" | Lote 1 |
| **27/05/2026** | **Onda 5 (WhatsApp Real) redigida** — 10 PRDs, 4.440 linhas. Bump alvo v2.1.0 "Bridge" | Lote 2 |
| **27/05/2026** | **Onda 5 — PRD-118 reescopado** de "Múltiplas Contas WhatsApp" para "Status Tracking" (multi-contas coberto naturalmente pelo `whatsapp_accounts` em PRD-101); PRD-120 reescopado de "Migração de Stubs" (que virou PRD-119) para "Failover Meta↔Evolution + Monitoring" | PRDs 118, 119, 120 |
| **27/05/2026** | **Onda 6 (DINTEC + NFe) redigida** — 11 PRDs, 5.553 linhas. Bump alvo v2.2.0. **Codinome alterado de "Sync" para "Anchor"** (NFe como âncora fiscal — mais semântico que sync) | Lote 3 |
| **27/05/2026** | **Onda 6 — Estrutura final consolidada**: 6 PRDs DINTEC (interface, upload, engine, sync customers, sync parts, reconciliation) + 5 PRDs NFe (interface, emission, storage, cancel/status, operacionalização). Divergente do plano original (Discovery, Cadastro Clientes, Export Pedidos, Scheduler, Audit Cross-System consolidados ou reescopados) | Lote 3 |
| **27/05/2026** | **PRD-131 alocado para Onda 6** (NFe Operacionalização) — Onda 7 inicia em PRD-132. Renumeração total da Onda 7 pendente em v1.5 do INDEX | PRD-131 |
| **27/05/2026** | **Detecção de edição manual via audit log** (não só timestamp) — PRD-126 amplia heurística MVP de PRDs 124/125 para conflict resolution preciso por campo | PRD-126 |
| **27/05/2026** | **3 providers NFe homologados** (Focus NFe / PlugNotas / eNotas) — decisão final pendente; arquitetura neutra via Provider Pattern | PRD-127 |
| **27/05/2026** | **Certificado A1 no Vault** com validação dupla (CNPJ bate com store + expiração ≥30 dias) — workflow de upload via UI Owner em PRD-131 | PRDs 127, 131 |
| **27/05/2026** | **Legacy NFe DINTEC** registradas em `crm.nfe_emissions` com `is_legacy_dintec=true` na migration de PRD-131 — não re-emitir; apenas registrar histórico | PRD-131 |

---

## Riscos Identificados

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **DINTEC sem API (MATERIALIZADO 27/05/2026)** | **Confirmado** | **Alto** | **Onda 6 re-estruturada: CSV manual + NFe própria. PRDs 121-131 redigidos.** |
| Templates HSM rejeitados pela Meta | Alta | Médio | PRD-116 com templates baixo risco; fallback Evolution (PRD-113); failover PRD-120 |
| Custo LLM acima do orçado | Alta | Alto | PRD-151D (dashboard) + PRD-151C (override por feature) permitem alocar modelos baratos em alto volume |
| **Migração DINTEC corrompe catálogo** | **Mitigado** | **Crítico** | **PRDs 124/125 com campos protegidos + PRD-126 (Conflict Resolution) + dry-run + locked_fields persistente** |
| Mudança de schema do CSV DINTEC | Média | Alto | PRD-122 com layout canônico documentado; cliente exporta no formato; engine tolera variações via normalizeKey |
| LGPD não atendida no go-live | Média | Crítico | PRD-191 P0; implementação mínima desde Onda 4 |
| Drop-in quebra silenciosamente | Média | Alto | Testes E2E nos PRDs 119, 140B, 150; staging 2 semanas antes prod |
| Cliente recusa avançar onda | Baixa | Médio | Gates formais; entregáveis demonstráveis |
| Performance Supabase insuficiente | Baixa | Alto | PRD-108 P1; load testing pré-go-live; upgrade de plano |
| Dependência única de provider externo | Alta | Alto | Provider Pattern permite troca; nunca depender de provider único em P0 |
| **Certificado A1 expira sem aviso** | **Média** | **Crítico** | **PRD-131 com cron diário verificando expiresAt; alerta 30 dias antes** |
| **NFe rejeitada por SEFAZ em massa** | **Média** | **Alto** | **PRD-128 com validação pré-emissão (NCM, CFOP, IBGE, CPF/CNPJ DV); homologação obrigatória antes de produção (PRD-131)** |
| **Provider NFe down/lento** | **Baixa** | **Alto** | **PRD-128 com timeout 60s + status polling PRD-130; futuro: failover multi-provider** |

---

## Como Manter Este Índice

### Quando Atualizar

| Evento | Ação no Índice |
|--------|----------------|
| Novo PRD Fase 2 redigido | Coluna Documento muda de ⏸ para 📝 + atualizar contagem |
| PRD iniciado (implementação) | Status muda de ⏳ para 🔄 |
| PRD implementado | Status muda para ✅ + Claude Code CLI adiciona sufixo `_DONE` no arquivo |
| PRD cancelado | Move para ❌ + documentar motivo |
| Nova versão do app | Atualizar "Histórico de Versões do App" + tag git |
| Decisão arquitetural significativa | Adicionar em "Decisões Arquiteturais Importantes" |
| Risco materializado/mitigado | Atualizar tabela de "Riscos Identificados" |
| Onda concluída e validada pelo cliente | Marcar versão correspondente como entregue |

### Checklist Periódico (mensal)

- [ ] Status de todos os PRDs Fase 2 atualizado conforme realidade
- [ ] Links dos arquivos redigidos funcionais
- [ ] Versão do app atualizada (se houve release no período)
- [ ] Dependências atualizadas (se algum PRD ganhou nova dependência)
- [ ] Métricas recalculadas (velocidade, distribuição)
- [ ] Timeline ajustada conforme andamento real vs planejado
- [ ] Riscos revisados
- [ ] Custos operacionais consumidos vs estimados
- [ ] Lições aprendidas registradas

---

## Documentos Relacionados

| Documento | Localização | Descrição |
|-----------|-------------|-----------|
| Briefing Fase 1 | `briefing-execucao-prds.md` v1.1 | Decisões arquiteturais Fase 1 |
| Briefing Fase 2 | `briefing-execucao-prds-fase2-v1.3.md` | Decisões arquiteturais Fase 2 (input único) |
| Índice Fase 1 | `INDEX-PRDs-Gallo-Base-Diesel.md` | Catálogo dos 50 PRDs Fase 1 |
| Índice Fase 2 (anterior) | `INDEX-PRDs-Gallo-Base-Diesel-fase2-v1_3.md` | Versão anterior — referência histórica |
| Índice Fase 2 (atual) | `INDEX-PRDs-Gallo-Base-Diesel-fase2-v1_4.md` | **Este documento** |
| Roadmap Fase 2 | `ROADMAP-FASE2-Gallo-Base-Diesel.md` v1.0 | Mapa estratégico inicial — referência histórica |
| Deltas | `DELTAS-PRDs-Gallo-Base-Diesel.md` v1.1 | Extensões cruzadas entre PRDs Fase 1 |
| Guia de PRDs | `guia-prd.md` v1.4 | Metodologia AILA |
| Template Feature | `template-prd-feature.md` | Para features |
| Template Integration | `template-prd-integration.md` | Para integrações externas (predominante Fase 2) |
| Template Bugfix | `template-prd-bugfix.md` | Para correções |
| Proposta Comercial | `Proposta Comercial — Turbo Diesel RS.v2` | Modelo de 3 ondas Fase 1 |
| Manual de marca GALLO | `Apresentação GALLO Doc 001/002.pdf` | Identidade visual |
| **PRDs Lote 1 (Onda 4)** | `PRD-100-monitoring.md` a `PRD-110-monitoring.md` | 11 PRDs Backend Supabase |
| **PRDs Lote 2 (Onda 5)** | `PRD-111-whatsapp-provider-interface.md` a `PRD-120-whatsapp-failover-monitoring.md` | 10 PRDs WhatsApp Real |
| **PRDs Lote 3 (Onda 6)** | `PRD-121-dintec-import-interface.md` a `PRD-131-nfe-operationalization.md` | 11 PRDs DINTEC + NFe |

---

## Decisões Pendentes Consolidadas (críticas antes da implementação)

Lista única do que Owner GALLO + Edmilson precisam resolver antes do Claude Code CLI executar:

### Infraestrutura
- [ ] Conta Vercel (AILA ou GALLO?)
- [ ] Registrador do `gallo.app`
- [ ] Email `infra@ailasistemas.com.br` ou similar
- [ ] Storage externo de backup (S3 ou Supabase secundário)
- [ ] **VPS Evolution** (AILA ou GALLO?) — impacta Onda 5

### Schema/Seed
- [ ] CNPJ da matriz GALLO
- [ ] Lista oficial de marcas (Mann/Wega/Mahle/Bosch/Tecfil — confirmar)
- [ ] Taxonomia oficial de motivos de perda
- [ ] **Templates aprovados na Meta** (submeter antes de PRD-116 implementar)

### Técnicas
- [ ] Framework de testes RLS (sugerido `supabase test db`)
- [ ] Paginação (offset MVP→cursor PRD-108)
- [ ] Tabelas com Realtime habilitado
- [ ] Sentry tier
- [ ] **Versão Meta Graph API** (v20.0 sugerido)
- [ ] Threshold auto-restore failover (30min sugerido)

### NFe (Onda 6)
- [ ] **Provider NFe escolhido** (Focus NFe / PlugNotas / eNotas) — Edmilson decide
- [ ] Capabilities reais do provider escolhido a validar (especialmente `calculatesTax`)
- [ ] **Certificado A1** adquirido com contador GALLO antes de PRD-131 setup

### DINTEC (Onda 6)
- [ ] **Layout real do CSV DINTEC** confirmado com Owner antes de PRD-122 implementar
- [ ] Estratégia de geração de CSV (operador manual? scheduled?)
- [ ] Lista canônica de marcas e categorias para PRD-125 evitar `BRAND_NOT_RESOLVED` em massa

---

## Última Atualização

| Campo | Valor |
|-------|-------|
| **Data** | 27/05/2026 |
| **Atualizado por** | Edmilson Souza (Arquiteto) + Claude Opus 4.7 |
| **Motivo** | Atualização v1.4 — refletir conclusão da redação dos **Lotes 1, 2 e 3** (Ondas 4, 5 e 6). 32 PRDs redigidos (PRDs 100-131), totalizando 15.911 linhas. Codinome Onda 6 corrigido de "Sync" para "Anchor". PRD-131 alocado para Onda 6 (NFe Operacionalização); Onda 7 reinicia em PRD-132. Decisões arquiteturais adicionadas. Riscos atualizados (alguns mitigados pela conclusão das ondas). Decisões pendentes consolidadas para Owner GALLO. |
| **Versão do índice** | 1.4 |

---

**AILA — Sistemas Inteligentes**
*Frederico Westphalen / RS — Brasil*
