# Índice de PRDs — GALLO BASE DIESEL — Fase 2

> **Catálogo mestre da Fase 2**
> Versão: 1.0 — Maio/2026
> Mantido pelo Arquiteto: Edmilson Souza (AILA Sistemas Inteligentes) + Claude Opus 4.7

---

## Informações do Projeto

| Campo                                   | Valor                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| **Projeto**                             | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                        |
| **Cliente**                             | GALLO BASE DIESEL (distribuidora de peças pesadas em Frederico Westphalen/RS)   |
| **Repositório**                         | (mesmo da Fase 1)                                                               |
| **Fase atual**                          | Fase 2 — Backend Real, Integrações e Produção                                   |
| **Início da Fase 2**                    | Pós-validação Fase 1 (estimado Q3/2026)                                         |
| **Briefing de execução Fase 2**         | `briefing-execucao-prds-fase2.md` v1.0                                          |
| **Roadmap inicial Fase 2**              | `ROADMAP-FASE2-Gallo-Base-Diesel.md` v1.0 (referência histórica)                |
| **Metodologia**                         | AILA GuiaPRD v1.4                                                               |
| **Estratégia de desenvolvimento**       | Drop-in replacement — mockup validado → backend real sem refatorar consumidores |
| **Versão atual do app**                 | v1.0.0 — codinome **Heavy** (MVP Fase 1)                                        |
| **Versão alvo Fase 2 (go-live mínimo)** | v2.4.0 — codinome **Reach** (pós-Onda 8)                                        |
| **Versão alvo Fase 2 completa**         | v4.0.0 — codinome **Compliance** (pós-Onda 13)                                  |
| **Total de PRDs planejados (Fase 2)**   | 100 (faixa 100–200)                                                             |
| **PRDs redigidos**                      | 0                                                                               |
| **PRDs implementados**                  | 0                                                                               |

---

## Agentes do Workflow

| Agente                  | Modelo                      | Ambiente                   | Função                                                    |
| ----------------------- | --------------------------- | -------------------------- | --------------------------------------------------------- |
| **Arquiteto**           | Claude Opus 4.7 (Anthropic) | Plataforma Web (claude.ai) | Cria e mantém PRDs Fase 2                                 |
| **Desenvolvedor (CLI)** | Claude Opus 4.7             | Claude Code CLI v2.1.x     | Implementa PRDs Fase 2 sobre o repositório vivo da Fase 1 |
| **Direção estratégica** | Edmilson Souza + Frederico  | Plataforma Web (claude.ai) | Revisão, autorização, decisões finais                     |

---

## Identidade Visual GALLO (preservada da Fase 1)

| Token                 | Valor                             | Uso                               |
| --------------------- | --------------------------------- | --------------------------------- |
| Preto técnico         | `#404041`                         | Cor principal da marca-mãe        |
| Dourado cromia diesel | `#D2A809`                         | Cor de ação tema Diesel (default) |
| Verde PARTS           | `#337648`                         | Submarca + tema alternativo       |
| Vermelho SERVICE      | `#C4151C`                         | Submarca + tema alternativo       |
| Amarelo INDUSTRIAL    | `#C79C2C`                         | Submarca + tema alternativo       |
| Tipografia display    | Saira Condensed                   | Títulos, hierarquia industrial    |
| Tipografia UI         | Inter                             | Body, formulários                 |
| Tipografia mono       | JetBrains Mono                    | Códigos OEM, SKUs                 |
| Sistema de temas      | 4 temas × 2 modos = 8 combinações | Dark + Diesel é o default         |

**Identidade visual da Fase 2 NÃO MUDA em relação à Fase 1.** PRDs Fase 2 não redefinem cores, fontes, temas ou tokens. Quando relevante, referenciam PRD-001 Fase 1.

---

## Resumo de Status

### Documentação (PRDs redigidos)

| Status           | Quantidade | Percentual |
| ---------------- | ---------- | ---------- |
| 📝 Redigido      | 0          | 0%         |
| ⏸ A redigir      | 100        | 100%       |
| **Total Fase 2** | **100**    | **100%**   |

### Implementação

| Status          | Quantidade | Percentual |
| --------------- | ---------- | ---------- |
| ✅ Implementado | 0          | 0%         |
| 🔄 Em Andamento | 0          | 0%         |
| ⏳ Pendente     | 100        | 100%       |
| ❌ Cancelado    | 0          | 0%         |
| **Total**       | **100**    | **100%**   |

### Distribuição por Tipo

| Tipo                                | Quantidade |
| ----------------------------------- | ---------- |
| 🔌 Integração (template específico) | 19         |
| ⚙️ Feature                          | 81         |

### Distribuição por Profundidade

| Profundidade           | Quantidade |
| ---------------------- | ---------- |
| **D** Detalhado        | 74         |
| **E** Esqueleto enxuto | 26         |

### Distribuição por Prioridade

| Prioridade | Quantidade | Significado             |
| ---------- | ---------- | ----------------------- |
| **P0**     | 26         | Bloqueante para go-live |
| **P1**     | 30         | Alta                    |
| **P2**     | 21         | Média                   |
| **P3**     | 23         | Futuro                  |

---

## Catálogo Completo dos PRDs

> **Legenda:** 📝 Redigido | ⏸ A redigir | ✅ Implementado | 🔄 Em Andamento | ⏳ Pendente | **D** Detalhado | **E** Esqueleto enxuto | **I** Integração | **P0–P3** Prioridade

### Onda 4 — Backend Supabase Real (PRDs 100–110)

**Marco:** primeira onda é P0. Substitui mocks por persistência real. **Sem essa onda, nada vai a produção.**
Versão alvo: **v2.0.0 — codinome Engine**

| #   | Título                                 | Tipo       | Prof. | Prior. | Documento | Status | Depende de          |
| --- | -------------------------------------- | ---------- | ----- | ------ | --------- | ------ | ------------------- |
| 100 | Setup do projeto Supabase              | Integração | D     | P0     | ⏸         | ⏳     | —                   |
| 101 | Schema do banco (migrations + seeds)   | Feature    | D     | P0     | ⏸         | ⏳     | 100, F1:002         |
| 102 | Edge Functions infraestrutura          | Feature    | D     | P0     | ⏸         | ⏳     | 101                 |
| 103 | RLS (Row Level Security)               | Feature    | D     | P0     | ⏸         | ⏳     | 101, F1:006         |
| 104 | Substituir Providers Mock por Supabase | Feature    | D     | P0     | ⏸         | ⏳     | 103, F1:005         |
| 105 | Realtime                               | Feature    | D     | P1     | ⏸         | ⏳     | 104                 |
| 106 | Supabase Storage                       | Feature    | D     | P1     | ⏸         | ⏳     | 104                 |
| 107 | Supabase Auth com Custom Claims        | Integração | D     | P0     | ⏸         | ⏳     | 103, F1:006/065/071 |
| 108 | Performance e Otimização               | Feature    | D     | P1     | ⏸         | ⏳     | 104                 |
| 109 | Backup e Disaster Recovery             | Feature    | D     | P0     | ⏸         | ⏳     | 100                 |
| 110 | Monitoring e Observability             | Feature    | D     | P1     | ⏸         | ⏳     | 104                 |

### Onda 5 — WhatsApp Real (PRDs 111–120)

**Marco:** canal #1 da GALLO sai do placeholder. SDR funciona com clientes reais.
Versão alvo: **v2.1.0 — codinome Bridge**

| #   | Título                               | Tipo       | Prof. | Prior. | Documento | Status | Depende de  |
| --- | ------------------------------------ | ---------- | ----- | ------ | --------- | ------ | ----------- |
| 111 | Setup Meta Cloud API                 | Integração | D     | P0     | ⏸         | ⏳     | 100         |
| 112 | Provider Meta Cloud API              | Integração | D     | P0     | ⏸         | ⏳     | 111, 104    |
| 113 | Provider Evolution API (alternativa) | Integração | D     | P1     | ⏸         | ⏳     | 112         |
| 114 | Webhook Receiver                     | Integração | D     | P0     | ⏸         | ⏳     | 112, 102    |
| 115 | Envio de Mensagens (UI)              | Feature    | D     | P0     | ⏸         | ⏳     | 114, F1:011 |
| 116 | Templates HSM Management             | Feature    | D     | P1     | ⏸         | ⏳     | 114         |
| 117 | Session Management 24h               | Feature    | D     | P1     | ⏸         | ⏳     | 115, 116    |
| 118 | Múltiplas Contas WhatsApp            | Feature    | D     | P1     | ⏸         | ⏳     | 114, F1:019 |
| 119 | Status Sync e Read Receipts          | Feature    | E     | P2     | ⏸         | ⏳     | 114, 105    |
| 120 | Migração de Stubs WhatsApp           | Feature    | D     | P0     | ⏸         | ⏳     | 111–119     |

### Onda 6 — Integração DINTEC ERP (PRDs 121–130)

**Marco:** catálogo, estoque e NF passam a ser fonte única (DINTEC). Plataforma deixa de ser ilha.
Versão alvo: **v2.2.0 — codinome Sync**

| #   | Título                              | Tipo       | Prof. | Prior. | Documento | Status | Depende de    |
| --- | ----------------------------------- | ---------- | ----- | ------ | --------- | ------ | ------------- |
| 121 | Discovery e Contrato Técnico DINTEC | Integração | D     | P0     | ⏸         | ⏳     | —             |
| 122 | Provider DINTEC base                | Integração | D     | P0     | ⏸         | ⏳     | 121, 102      |
| 123 | Sync de Catálogo                    | Feature    | D     | P0     | ⏸         | ⏳     | 122, F1:030   |
| 124 | Sync de Estoque                     | Feature    | D     | P0     | ⏸         | ⏳     | 122, F1:030   |
| 125 | Sync de Clientes                    | Feature    | D     | P1     | ⏸         | ⏳     | 122, F1:012   |
| 126 | Sync de Pedidos                     | Feature    | D     | P0     | ⏸         | ⏳     | 122, F1:032   |
| 127 | NF Eletrônica via DINTEC            | Integração | D     | P0     | ⏸         | ⏳     | 122, 126, 106 |
| 128 | Conflict Resolution Cross-System    | Feature    | D     | P1     | ⏸         | ⏳     | 123–127       |
| 129 | Importação CSV (fallback)           | Feature    | D     | P2     | ⏸         | ⏳     | 123           |
| 130 | Audit Cross-System                  | Feature    | D     | P1     | ⏸         | ⏳     | 123–128       |

### Onda 7 — Pagamentos (PRDs 131–140)

**Marco:** e-commerce sai do modo demonstração. PIX, cartão e boleto funcionam de verdade.
Versão alvo: **v2.3.0 — codinome Cash**

| #   | Título                      | Tipo       | Prof. | Prior. | Documento | Status | Depende de    |
| --- | --------------------------- | ---------- | ----- | ------ | --------- | ------ | ------------- |
| 131 | PIX Open Banking estrutura  | Integração | D     | P0     | ⏸         | ⏳     | 104           |
| 132 | PIX QR Code Dinâmico        | Feature    | D     | P0     | ⏸         | ⏳     | 131, F1:064   |
| 133 | PIX Webhook (Confirmação)   | Integração | D     | P0     | ⏸         | ⏳     | 132           |
| 134 | Boleto Bancário             | Integração | D     | P1     | ⏸         | ⏳     | 131           |
| 135 | Cartão de Crédito           | Integração | D     | P1     | ⏸         | ⏳     | 131           |
| 136 | Parcelamento                | Feature    | D     | P1     | ⏸         | ⏳     | 134, 135      |
| 137 | Refund Automático           | Feature    | D     | P1     | ⏸         | ⏳     | 132, 134, 135 |
| 138 | Conciliação Financeira      | Feature    | D     | P1     | ⏸         | ⏳     | 132–137       |
| 139 | Anti-Fraude Básico          | Feature    | E     | P2     | ⏸         | ⏳     | 135           |
| 140 | Migração de Stubs Pagamento | Feature    | D     | P0     | ⏸         | ⏳     | 131–138       |

### Onda 8 — Notificações Reais (PRDs 141–150)

**Marco:** sistema "fala" com cliente — email, WhatsApp transacional, push. Possível **go-live cliente final.**
Versão alvo: **v2.4.0 — codinome Reach**

| #   | Título                                        | Tipo       | Prof. | Prior. | Documento | Status | Depende de  |
| --- | --------------------------------------------- | ---------- | ----- | ------ | --------- | ------ | ----------- |
| 141 | Email Transacional                            | Integração | D     | P0     | ⏸         | ⏳     | 104         |
| 142 | Templates Email                               | Feature    | D     | P1     | ⏸         | ⏳     | 141         |
| 143 | WhatsApp Transacional via HSM                 | Feature    | D     | P0     | ⏸         | ⏳     | 116, F1:067 |
| 144 | SMS (Fallback)                                | Integração | E     | P3     | ⏸         | ⏳     | 104         |
| 145 | Push Notifications Web                        | Feature    | E     | P2     | ⏸         | ⏳     | 104, F1:070 |
| 146 | Notification Center                           | Feature    | D     | P1     | ⏸         | ⏳     | 141, 143    |
| 147 | Preferências do Cliente (Opt-in/Opt-out LGPD) | Feature    | D     | P0     | ⏸         | ⏳     | 141, 143    |
| 148 | Drip Campaigns                                | Feature    | D     | P2     | ⏸         | ⏳     | 142, 143    |
| 149 | Carrinho Abandonado                           | Feature    | D     | P1     | ⏸         | ⏳     | F1:064, 148 |
| 150 | Migração de Stubs Notificações                | Feature    | D     | P0     | ⏸         | ⏳     | 141–149     |

### Onda 9 — LLM / IA Real (PRDs 151–160)

**Marco:** heurísticas do PRD-053 e simulador do PRD-020-024 ganham IA real. Salto major.
Versão alvo: **v3.0.0 — codinome Brain**

| #   | Título                                           | Tipo       | Prof. | Prior. | Documento | Status | Depende de      |
| --- | ------------------------------------------------ | ---------- | ----- | ------ | --------- | ------ | --------------- |
| 151 | LangChain + LLM Gateway                          | Integração | D     | P0     | ⏸         | ⏳     | 102             |
| 152 | Insights via LLM (substitui heurísticas PRD-053) | Feature    | D     | P1     | ⏸         | ⏳     | 151, F1:053     |
| 153 | SDR Avançado com LLM                             | Feature    | D     | P0     | ⏸         | ⏳     | 151, F1:020–024 |
| 154 | Análise de Sentimento                            | Feature    | D     | P2     | ⏸         | ⏳     | 151, F1:051     |
| 155 | Sugestões de Ação Contextualizadas               | Feature    | D     | P2     | ⏸         | ⏳     | 151             |
| 156 | Relatórios Narrativos                            | Feature    | E     | P3     | ⏸         | ⏳     | 151, F1:040     |
| 157 | Assistente IA dentro do App                      | Feature    | E     | P3     | ⏸         | ⏳     | 151             |
| 158 | Classificação Automática de Tópicos              | Feature    | E     | P3     | ⏸         | ⏳     | 151             |
| 159 | Forecast com ML                                  | Feature    | E     | P3     | ⏸         | ⏳     | 104             |
| 160 | Safety, Guardrails e Anti-Bias                   | Feature    | D     | P0     | ⏸         | ⏳     | 151             |

### Onda 10 — B2B Corporativo Funcional (PRDs 161–170)

**Marco:** Portal B2B (PRD-071) deixa de ser esqueleto e ativa workflows reais.
Versão alvo: **v3.1.0 — codinome Crown**

| #   | Título                                | Tipo       | Prof. | Prior. | Documento | Status | Depende de  |
| --- | ------------------------------------- | ---------- | ----- | ------ | --------- | ------ | ----------- |
| 161 | Workflow de Aprovação Real            | Feature    | D     | P0     | ⏸         | ⏳     | F1:071, 143 |
| 162 | Faturamento Corporativo               | Feature    | D     | P0     | ⏸         | ⏳     | F1:071, 138 |
| 163 | Parcelamento Estendido B2B (30/60/90) | Feature    | D     | P1     | ⏸         | ⏳     | 162         |
| 164 | NF Corporativa + Faturamento Mensal   | Feature    | D     | P1     | ⏸         | ⏳     | 127, 163    |
| 165 | Catálogo Personalizado por Contrato   | Feature    | D     | P1     | ⏸         | ⏳     | F1:071/030  |
| 166 | Comissões Avançadas                   | Feature    | D     | P2     | ⏸         | ⏳     | F1:047      |
| 167 | Convite Real de Usuários do Portal    | Feature    | D     | P1     | ⏸         | ⏳     | F1:071, 141 |
| 168 | Integração ERP do Cliente             | Integração | E     | P3     | ⏸         | ⏳     | 199         |
| 169 | Marketplace Privado B2B               | Feature    | E     | P3     | ⏸         | ⏳     | F1:071      |
| 170 | Reports Customizados B2B              | Feature    | E     | P2     | ⏸         | ⏳     | F1:071      |

### Onda 11 — PWA Offline-First (PRDs 171–180)

**Marco:** PRD-070 esqueleto vira app real para vendedor externo em campo.
Versão alvo: **v3.2.0 — codinome Field**

| #   | Título                      | Tipo    | Prof. | Prior. | Documento | Status | Depende de  |
| --- | --------------------------- | ------- | ----- | ------ | --------- | ------ | ----------- |
| 171 | Service Worker Completo     | Feature | D     | P1     | ⏸         | ⏳     | F1:070      |
| 172 | IndexedDB Cache Local       | Feature | D     | P1     | ⏸         | ⏳     | 171         |
| 173 | Sync Queue Offline          | Feature | D     | P1     | ⏸         | ⏳     | 171, 172    |
| 174 | Conflict Resolution Offline | Feature | D     | P1     | ⏸         | ⏳     | 173         |
| 175 | GPS e Localização           | Feature | E     | P2     | ⏸         | ⏳     | F1:070      |
| 176 | Captura de Foto             | Feature | E     | P2     | ⏸         | ⏳     | 106         |
| 177 | Assinatura Digital          | Feature | E     | P2     | ⏸         | ⏳     | F1:070      |
| 178 | Push Notifications Mobile   | Feature | E     | P2     | ⏸         | ⏳     | 145, F1:070 |
| 179 | Voice Notes em Conversas    | Feature | E     | P3     | ⏸         | ⏳     | 115, 153    |
| 180 | Migração Completa PRD-070   | Feature | D     | P1     | ⏸         | ⏳     | 171–179     |

### Onda 12 — Multi-loja + Equipes Ativas (PRDs 181–190)

**Marco:** equipes dormentes ativam; multi-loja real opera (segunda loja onboarded).
Versão alvo: **v3.3.0 — codinome Network**

| #   | Título                            | Tipo    | Prof. | Prior. | Documento | Status | Depende de       |
| --- | --------------------------------- | ------- | ----- | ------ | --------- | ------ | ---------------- |
| 181 | Segunda Loja Ativa                | Feature | D     | P2     | ⏸         | ⏳     | F1:007           |
| 182 | Roteamento Entre Lojas            | Feature | D     | P2     | ⏸         | ⏳     | 181              |
| 183 | Estoque Cross-Loja                | Feature | D     | P2     | ⏸         | ⏳     | 181, 124         |
| 184 | Equipes Ativas (CRUD)             | Feature | D     | P2     | ⏸         | ⏳     | F1:019           |
| 185 | Metas por Equipe                  | Feature | D     | P2     | ⏸         | ⏳     | F1:042, 184      |
| 186 | Comissões com Split por Equipe    | Feature | D     | P2     | ⏸         | ⏳     | F1:047, 184      |
| 187 | Cobertura por Equipe              | Feature | D     | P2     | ⏸         | ⏳     | F1:013, 184      |
| 188 | Cross-Store BI Consolidado        | Feature | D     | P1     | ⏸         | ⏳     | 181, F1:040      |
| 189 | Permissões Cross-Store Granulares | Feature | D     | P1     | ⏸         | ⏳     | F1:006, 103, 181 |
| 190 | Vendedor Externo Ativado          | Feature | D     | P2     | ⏸         | ⏳     | F1:070, 180      |

### Onda 13 — Compliance + ML Avançado (PRDs 191–200)

**Marco:** GALLO se prepara para escala (LGPD avançado, SOC2, ML predictivo, API pública).
Versão alvo: **v4.0.0 — codinome Compliance**

| #   | Título                                   | Tipo       | Prof. | Prior. | Documento | Status | Depende de |
| --- | ---------------------------------------- | ---------- | ----- | ------ | --------- | ------ | ---------- |
| 191 | LGPD Avançado                            | Feature    | D     | P0     | ⏸         | ⏳     | 147        |
| 192 | Auditoria SOC2                           | Feature    | E     | P3     | ⏸         | ⏳     | 110, 103   |
| 193 | ISO 27001 Placeholder                    | Feature    | E     | P3     | ⏸         | ⏳     | 192        |
| 194 | BI Predictivo (Churn, Demanda)           | Feature    | E     | P3     | ⏸         | ⏳     | 159        |
| 195 | Recomendações de IA (Cross-sell, Upsell) | Feature    | E     | P3     | ⏸         | ⏳     | 151        |
| 196 | Cohort Analysis                          | Feature    | E     | P3     | ⏸         | ⏳     | 104        |
| 197 | A/B Testing Infrastructure               | Feature    | E     | P3     | ⏸         | ⏳     | 198        |
| 198 | Feature Flags                            | Feature    | D     | P2     | ⏸         | ⏳     | 104        |
| 199 | API Pública                              | Integração | D     | P3     | ⏸         | ⏳     | 104, 103   |
| 200 | Marketplace de Integrações               | Feature    | E     | P3     | ⏸         | ⏳     | 199        |

---

## Visão por Onda

| Onda | Tema                        | PRDs    | Quant. | Duração estimada | Versão alvo       |
| ---- | --------------------------- | ------- | ------ | ---------------- | ----------------- |
| 4    | Backend Supabase Real       | 100–110 | 11     | 8–12 semanas     | v2.0.0 Engine     |
| 5    | WhatsApp Real               | 111–120 | 10     | 6–8 semanas      | v2.1.0 Bridge     |
| 6    | Integração DINTEC ERP       | 121–130 | 10     | 10–14 semanas    | v2.2.0 Sync       |
| 7    | Pagamentos                  | 131–140 | 10     | 8–10 semanas     | v2.3.0 Cash       |
| 8    | Notificações Reais          | 141–150 | 10     | 4–6 semanas      | v2.4.0 Reach      |
| 9    | LLM / IA Real               | 151–160 | 10     | 8–12 semanas     | v3.0.0 Brain      |
| 10   | B2B Corporativo Funcional   | 161–170 | 10     | 10–12 semanas    | v3.1.0 Crown      |
| 11   | PWA Offline-First           | 171–180 | 10     | 6–8 semanas      | v3.2.0 Field      |
| 12   | Multi-loja + Equipes Ativas | 181–190 | 10     | 6–8 semanas      | v3.3.0 Network    |
| 13   | Compliance + ML Avançado    | 191–200 | 10     | 10–14 semanas    | v4.0.0 Compliance |

---

## Visão por Tipo

| Tipo          | Quantidade | Distribuição |
| ------------- | ---------- | ------------ |
| ⚙️ Feature    | 81         | 81%          |
| 🔌 Integração | 19         | 19%          |

**PRDs de Integração** (template específico, com seções sobre provider externo, credenciais, rate limiting, fallback, retry, idempotência):

| Onda | PRDs Integração                                                       |
| ---- | --------------------------------------------------------------------- |
| 4    | 100 (Supabase), 107 (Supabase Auth)                                   |
| 5    | 111 (Meta Cloud), 112 (Meta Provider), 113 (Evolution), 114 (Webhook) |
| 6    | 121 (DINTEC Discovery), 122 (DINTEC Base), 127 (NF Eletrônica)        |
| 7    | 131 (PIX Estrutura), 133 (PIX Webhook), 134 (Boleto), 135 (Cartão)    |
| 8    | 141 (Email), 144 (SMS)                                                |
| 9    | 151 (LLM Gateway)                                                     |
| 10   | 168 (ERP Cliente)                                                     |
| 13   | 199 (API Pública)                                                     |

---

## Visão por Prioridade

| Prioridade | Significado                                 | Quantidade |
| ---------- | ------------------------------------------- | ---------- |
| **P0**     | Bloqueante para go-live mínimo              | 26         |
| **P1**     | Alta (necessário para experiência completa) | 30         |
| **P2**     | Média (ampliação)                           | 21         |
| **P3**     | Futuro (evolução contínua)                  | 23         |

**Conjunto P0 (Fase 2.0 Go-Live mínimo) — 26 PRDs:**

| PRDs                    | Tema                                  |
| ----------------------- | ------------------------------------- |
| 100–104, 107, 109       | Backend Supabase essencial            |
| 111, 112, 114, 115, 120 | WhatsApp essencial                    |
| 121–124, 126, 127, 130  | DINTEC essencial                      |
| 131–133, 140            | Pagamentos PIX essencial              |
| 141, 143, 147, 150      | Notificações essenciais + LGPD opt-in |
| 153, 160                | SDR LLM + Safety                      |
| 161, 162                | B2B workflow + faturamento            |
| 191                     | LGPD avançado                         |

---

## Visão por Profundidade

| Profundidade           | Quantidade | Aplicação                                                                 |
| ---------------------- | ---------- | ------------------------------------------------------------------------- |
| **D** Detalhado        | 74         | PRDs core, com requisitos completos, Gherkin, fluxos                      |
| **E** Esqueleto enxuto | 26         | PRDs futuros (P3 majoritariamente) ou de menor complexidade visual no MVP |

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
            │   ONDA 4 (PRDs 100–110)      │                                │   ONDA 6 (PRDs 121–130)      │
            │   Backend Supabase           │◀───── depende ─────────────────│   DINTEC ERP                 │
            │   v2.0.0 Engine — P0         │                                │   v2.2.0 Sync — P0           │
            └──────────────┬───────────────┘                                └──────────────┬───────────────┘
                           │                                                               │
              ┌────────────┼────────────┬───────────────────────────┬────────────────────┐ │
              ▼            ▼            ▼                           ▼                    ▼ ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  ┌──────────────────────┐ ┌──────────────┐
      │ ONDA 5       │ │ ONDA 7       │ │ ONDA 8       │  │ ONDA 9               │ │ ONDA 10      │
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

                                                                            ┌──────────────────────┐
                                                                            │ ONDA 11 (171–180)    │
                                                                            │ PWA Offline-First    │
                                                                            │ v3.2 Field — P1/P2   │
                                                                            └──────────────────────┘

                                                                            ┌──────────────────────┐
                                                                            │ ONDA 12 (181–190)    │
                                                                            │ Multi-loja + Equipes │
                                                                            │ v3.3 Network — P2    │
                                                                            └──────────────────────┘

                                                                            ┌──────────────────────┐
                                                                            │ ONDA 13 (191–200)    │
                                                                            │ Compliance + ML      │
                                                                            │ v4.0 Compliance      │
                                                                            └──────────────────────┘
```

**Caminho crítico para go-live mínimo:**

```
Onda 4 (Backend) → Onda 5 (WhatsApp) → Onda 6 (DINTEC) → Onda 7 (Pagamentos) → Onda 8 (Notificações)
                                                                                          ↓
                                                                              ┃ GO-LIVE POSSÍVEL ┃
```

---

## Timeline das 10 Ondas (Cronograma Macro)

```
                       ┌─────── ANO 1 ───────┐  ┌─────── ANO 2 ───────┐
                       │                      │  │                      │
Mês 1-3   ── Onda 4 (Backend Supabase) ─────▶ Gate cliente
Mês 4-5   ── Onda 5 (WhatsApp Real)   ──────▶ Gate cliente
Mês 6-8   ── Onda 6 (DINTEC ERP)      ──────▶ Gate cliente  ┃
Mês 8-10  ── Onda 7 (Pagamentos)      ──────▶ Gate cliente  ┃ GO-LIVE
Mês 10-11 ── Onda 8 (Notificações)    ──────▶ Gate cliente  ┃ POSSÍVEL
Mês 11-13 ── Onda 9 (LLM/IA real)     ──────▶ Gate cliente
Mês 13-15 ── Onda 10 (B2B funcional)  ──────▶ Gate cliente
Mês 15-17 ── Onda 11 (PWA real)       ──────▶ Gate cliente
Mês 17-18 ── Onda 12 (Multi-loja)     ──────▶ Gate cliente
Mês 18-22 ── Onda 13 (Compliance+ML)  ──────▶ MVP Fase 2 completo
```

**Paralelização possível:** Ondas 5, 6, 7 podem ser paralelas se houver squads dedicados. Ondas 9, 10, 11 também aceitam paralelismo após Onda 8 concluída.

---

## Histórico de Versões do App (planejado Fase 2)

| Versão     | Codinome       | Marco                                                                       |
| ---------- | -------------- | --------------------------------------------------------------------------- |
| **v1.0.0** | **Heavy**      | MVP Fase 1 completo (50 PRDs implementados)                                 |
| v2.0.0     | Engine         | Onda 4 — backend Supabase real                                              |
| v2.1.0     | Bridge         | Onda 5 — WhatsApp produção                                                  |
| v2.2.0     | Sync           | Onda 6 — DINTEC integrado                                                   |
| v2.3.0     | Cash           | Onda 7 — pagamentos reais (PIX, boleto, cartão)                             |
| **v2.4.0** | **Reach**      | **Onda 8 — notificações ativas. Possível go-live cliente final.**           |
| v3.0.0     | Brain          | Onda 9 — LLM substitui heurísticas, salto major de IA                       |
| v3.1.0     | Crown          | Onda 10 — B2B corporativo funcional                                         |
| v3.2.0     | Field          | Onda 11 — PWA real para vendedor externo                                    |
| v3.3.0     | Network        | Onda 12 — multi-loja real, equipes ativas                                   |
| **v4.0.0** | **Compliance** | **Onda 13 — LGPD avançado, SOC2 prep, ML predictivo. MVP Fase 2 completo.** |

---

## Próximos PRDs a Redigir

### Lote 1 — Onda 4 (Backend Supabase Real)

PRDs em sequência sugerida:

| Sub-lote | PRDs          | Conteúdo                                 |
| -------- | ------------- | ---------------------------------------- |
| 1a       | 100, 101, 102 | Setup Supabase + Schema + Edge Functions |
| 1b       | 103, 104, 105 | RLS + Providers Reais + Realtime         |
| 1c       | 106, 107      | Storage + Auth                           |
| 1d       | 108, 109, 110 | Performance + Backup + Monitoring        |

**Estimativa:** 4–5 turnos para 11 PRDs.

**Pré-requisito antes de iniciar:**

- [ ] Validação cliente da Fase 1 concluída (todos os 50 PRDs implementados)
- [ ] Conta Supabase criada (organização + projeto)
- [ ] Decisão sobre região (recomendado: AWS São Paulo)
- [ ] Decisão sobre plano (recomendado: Pro para começar)

---

## Decisões Arquiteturais Importantes

| Data      | Decisão                                                                         | Origem                |
| --------- | ------------------------------------------------------------------------------- | --------------------- |
| Maio/2026 | **Drop-in replacement** como princípio central da Fase 2                        | Briefing Fase 2 §4.1  |
| Maio/2026 | **VITE_DATA_SOURCE** continua sendo o único switch entre Mock e Real            | Briefing Fase 2 §5.2  |
| Maio/2026 | **RLS espelhando matriz RBAC** do PRD-006 — segurança real, não só frontend     | Briefing Fase 2 §4.3  |
| Maio/2026 | **Audit log promovido a primeira classe** — persistido + estruturado + retenção | Briefing Fase 2 §4.4  |
| Maio/2026 | **Snapshots imutáveis preservados** — colunas JSONB no Supabase                 | Briefing Fase 2 §4.2  |
| Maio/2026 | **Idempotência obrigatória** em todos os webhooks e syncs                       | Briefing Fase 2 §4.7  |
| Maio/2026 | **LGPD desde o dia 1** — PRD-191 P0 mesmo na Onda 13                            | Briefing Fase 2 §4.9  |
| Maio/2026 | **Observability obrigatória** — APM + logs estruturados + alertas desde Onda 4  | Briefing Fase 2 §4.10 |
| Maio/2026 | **3 ambientes em paralelo** — `demo` (mock), `staging`, `produção`              | Briefing Fase 2 §5.3  |
| Maio/2026 | **Gate de validação por onda** — cliente assina cada onda antes de avançar      | Briefing Fase 2 §5.4  |
| Maio/2026 | **Mocks permanecem após Fase 2** — `src/mocks/` indefinidamente                 | Briefing Fase 2 §5.2  |

---

## Riscos Identificados

| Risco                                 | Probabilidade | Impacto | Mitigação                                                              |
| ------------------------------------- | ------------- | ------- | ---------------------------------------------------------------------- |
| DINTEC sem API moderna                | Média         | Alto    | PRD-121 (Discovery) é P0 — descobrir cedo. Plano B: PRD-129 (CSV)      |
| Templates HSM rejeitados pela Meta    | Alta          | Médio   | PRD-111 com templates baixo risco; fallback Evolution (PRD-113)        |
| Custo LLM acima do orçado             | Alta          | Alto    | PRD-151 com cost tracking + alertas; cache; modelos menores            |
| Migração DINTEC corrompe catálogo     | Baixa         | Crítico | PRD-128 (Conflict Resolution) + backup pré-sync + rollback             |
| LGPD não atendida no go-live          | Média         | Crítico | PRD-191 P0; implementação mínima desde Onda 4                          |
| Drop-in quebra silenciosamente        | Média         | Alto    | Testes E2E nos PRDs 120, 140, 150; staging 2 semanas antes prod        |
| Cliente recusa avançar onda           | Baixa         | Médio   | Gates formais; entregáveis demonstráveis                               |
| Performance Supabase insuficiente     | Baixa         | Alto    | PRD-108 P1; load testing pré-go-live; upgrade de plano                 |
| Dependência única de provider externo | Alta          | Alto    | Provider Pattern permite troca; nunca depender de provider único em P0 |

---

## Como Manter Este Índice

### Quando Atualizar

| Evento                                 | Ação no Índice                                                           |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Novo PRD Fase 2 redigido               | Coluna Documento muda de ⏸ para 📝 + atualizar contagem                  |
| PRD iniciado (implementação)           | Status muda de ⏳ para 🔄                                                |
| PRD implementado                       | Status muda para ✅ + Claude Code CLI adiciona sufixo `_DONE` no arquivo |
| PRD cancelado                          | Move para ❌ + documentar motivo                                         |
| Nova versão do app                     | Atualizar "Histórico de Versões do App" + tag git                        |
| Decisão arquitetural significativa     | Adicionar em "Decisões Arquiteturais Importantes"                        |
| Risco materializado/mitigado           | Atualizar tabela de "Riscos Identificados"                               |
| Onda concluída e validada pelo cliente | Marcar versão correspondente como entregue                               |

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

| Documento             | Localização                               | Descrição                                       |
| --------------------- | ----------------------------------------- | ----------------------------------------------- |
| Briefing Fase 1       | `briefing-execucao-prds.md` v1.1          | Decisões arquiteturais Fase 1                   |
| Briefing Fase 2       | `briefing-execucao-prds-fase2.md` v1.0    | Decisões arquiteturais Fase 2 (input único)     |
| Índice Fase 1         | `INDEX-PRDs-Gallo-Base-Diesel.md`         | Catálogo dos 50 PRDs Fase 1                     |
| Índice Fase 2         | `INDEX-PRDs-Gallo-Base-Diesel-fase2.md`   | Este documento                                  |
| Roadmap Fase 2        | `ROADMAP-FASE2-Gallo-Base-Diesel.md` v1.0 | Mapa estratégico inicial — referência histórica |
| Deltas                | `DELTAS-PRDs-Gallo-Base-Diesel.md` v1.1   | Extensões cruzadas entre PRDs Fase 1            |
| Guia de PRDs          | `guia-prd.md` v1.4                        | Metodologia AILA                                |
| Template Feature      | `template-prd-feature.md`                 | Para features                                   |
| Template Integration  | `template-prd-integration.md`             | Para integrações externas (predominante Fase 2) |
| Template Bugfix       | `template-prd-bugfix.md`                  | Para correções                                  |
| Proposta Comercial    | `Proposta Comercial — Turbo Diesel RS.v2` | Modelo de 3 ondas Fase 1                        |
| Manual de marca GALLO | `Apresentação GALLO Doc 001/002.pdf`      | Identidade visual                               |

---

## Última Atualização

| Campo                | Valor                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| **Data**             | 27/05/2026                                                                                   |
| **Atualizado por**   | Edmilson Souza (Arquiteto) + Claude Opus 4.7 (sessão de planejamento Fase 2)                 |
| **Motivo**           | Criação inicial do índice consolidado da Fase 2 — 100 PRDs em 10 ondas, prontos para escrita |
| **Versão do índice** | 1.0                                                                                          |

---

**AILA — Sistemas Inteligentes**
_Frederico Westphalen / RS — Brasil_
