# ROADMAP FASE 2 — GALLO BASE DIESEL

**Plataforma de Inteligência Comercial — Roadmap PRDs 100-200**

**Versão:** 1.0
**Data:** 25/05/2026
**Autor:** AILA Sistemas Inteligentes

---

## 1. Contexto estratégico

A **Fase 1 (PRDs 001-071)** entregou o MVP Frontend First com mocks navegáveis — 50 PRDs cobrindo CRM, SDR, Comercial, BI (Gestão), E-commerce e Auxiliares. Cliente GALLO valida visualmente a plataforma com dados realistas antes de qualquer investimento em backend real.

A **Fase 2 (PRDs 100-200)** entrega o **sistema em produção real**: backend Supabase, integrações com WhatsApp/DINTEC/Pagamentos/SEFAZ, IA real (LLM), notificações funcionais, B2B corporativo operacional, PWA offline-first, multi-loja ativa e compliance avançado.

**Princípio central:** drop-in replacement. A Fase 1 foi construída com Provider Pattern e estruturas preparadas para Fase 2 substituir backends mock por reais sem refatorar consumidores. Cada PRD da Fase 2 substitui placeholders coerentes deixados na Fase 1.

---

## 2. Convenções de leitura

Cada PRD da Fase 2 nesta listagem tem:

| Campo | Significado |
|-------|-------------|
| **#** | Número do PRD (100-200) |
| **Nome** | Título curto |
| **Objetivo** | Uma frase descrevendo o entregável |
| **Escopo** | Bullets principais |
| **Dependências** | PRDs Fase 1 (substitui placeholders) + PRDs Fase 2 (sequência) |
| **Complexidade** | Baixa / Média / Alta / Crítica |
| **Prioridade** | P0 (bloqueante para go-live) / P1 (alta) / P2 (média) / P3 (futuro) |

---

## 3. Ondas da Fase 2

A Fase 2 está organizada em **10 ondas** de 10 PRDs cada, com sequência recomendada:

| Onda | Faixa | Tema | Duração estimada |
|------|-------|------|------------------|
| 4 | 100-110 | **Backend Supabase Real** | 8-12 semanas |
| 5 | 111-120 | **WhatsApp Real** | 6-8 semanas |
| 6 | 121-130 | **Integração DINTEC ERP** | 10-14 semanas |
| 7 | 131-140 | **Pagamentos** | 8-10 semanas |
| 8 | 141-150 | **Notificações Reais** | 4-6 semanas |
| 9 | 151-160 | **LLM / IA Real** | 8-12 semanas |
| 10 | 161-170 | **B2B Corporativo Funcional** | 10-12 semanas |
| 11 | 171-180 | **PWA Offline-First** | 6-8 semanas |
| 12 | 181-190 | **Multi-loja + Equipes Ativas** | 6-8 semanas |
| 13 | 191-200 | **Compliance + ML Avançado** | 10-14 semanas |

**Total estimado:** 76-114 semanas (~18-26 meses) de desenvolvimento contínuo, podendo ser paralelizado em squads.

---

## 4. ONDA 4 — Backend Supabase Real (PRDs 100-110)

> **Marco crítico:** primeira onda é P0. Sem backend real, nada do MVP vai a produção. Substitui mocks por persistência real.

### PRD-100 — Setup do projeto Supabase
**Objetivo:** Configurar projeto Supabase de produção + ambientes (dev/staging/prod).
**Escopo:**
- Criação de organizações e projetos
- Configuração de regiões (AWS São Paulo para latência)
- Variáveis de ambiente (`VITE_DATA_SOURCE`, keys, secrets)
- Setup de billing e quotas
- Backup automatizado

**Dependências:** todos os PRDs Fase 1 (consumidores prontos)
**Complexidade:** Média — **Prioridade:** P0

---

### PRD-101 — Schema do banco (migrations + seeds)
**Objetivo:** Criar schemas relacionais espelhando os tipos modelados na Fase 1.
**Escopo:**
- Tabelas para todos os modelos de PRD-002 + extensões
- Foreign keys, constraints, índices
- Migrations versionadas (Drizzle ORM ou similar)
- Seeds de produção para dados iniciais (categorias, configurações default)
- Estratégia de evolução de schema

**Dependências:** PRD-100, PRD-002 (modelo conceitual)
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-102 — Edge Functions infraestrutura
**Objetivo:** Estabelecer padrão de Edge Functions (Deno) para lógica server-side.
**Escopo:**
- Estrutura de pastas + organização
- Auth context propagation
- Error handling padronizado
- Logging estruturado
- Deployment automatizado via CI

**Dependências:** PRD-101
**Complexidade:** Média — **Prioridade:** P0

---

### PRD-103 — RLS (Row Level Security)
**Objetivo:** Implementar políticas RLS em todas as tabelas para segurança real (vs RBAC apenas frontend do PRD-006).
**Escopo:**
- Política por tabela respeitando roles (Owner/Gestor/Vendedor/Financeiro/Cliente B2B/Visualizador)
- Políticas multi-loja (Owner cross-store, Gestor por storeId)
- Políticas de carteira (Vendedor só lê seus clientes)
- Políticas de portal B2B (cliente vê só seus dados)
- Testes de RLS via SQL

**Dependências:** PRD-101, PRD-006 (RBAC frontend)
**Complexidade:** Crítica — **Prioridade:** P0

---

### PRD-104 — Substituir Providers Mock por Supabase
**Objetivo:** Drop-in replacement de todos os providers do Provider Pattern (PRD-005).
**Escopo:**
- Implementação de cada Provider real (catalog, customers, conversations, quotes, orders, goals, etc.)
- Interface idêntica aos mocks (zero mudança nos consumidores)
- Toggle via `VITE_DATA_SOURCE=supabase`
- Testes end-to-end de cada provider

**Dependências:** PRD-103, todos os PRDs Fase 1 (consumidores)
**Complexidade:** Crítica — **Prioridade:** P0

---

### PRD-105 — Realtime
**Objetivo:** Habilitar atualizações em tempo real via Supabase Realtime.
**Escopo:**
- Subscriptions por tabela (conversations, orders, goals)
- Filtros server-side por permissão
- Reconciliação de estado client-side
- Substituição de polling/timers do MVP por Realtime

**Dependências:** PRD-104
**Complexidade:** Alta — **Prioridade:** P1

---

### PRD-106 — Supabase Storage
**Objetivo:** Habilitar upload e armazenamento real de mídias.
**Escopo:**
- Buckets: produtos (imagens), banners, logo, avatares, anexos de conversas, NFs em PDF
- Políticas de acesso por bucket
- Upload via frontend com progresso
- Cropping/redimensionamento básico
- CDN para entrega
- Substituir placeholders de imagem em PRDs 030, 060, 063

**Dependências:** PRD-104, PRDs com placeholders (030, 060, 063)
**Complexidade:** Média — **Prioridade:** P1

---

### PRD-107 — Supabase Auth com Custom Claims
**Objetivo:** Auth real substituindo mocks do PRD-006, PRD-065, PRD-071.
**Escopo:**
- Email/senha real com verificação
- OAuth (Google placeholder)
- Recuperação de senha funcional
- Custom claims para roles e permissões
- Session management
- Migração dos auth mocks (PRD-065 storefront + PRD-071 portal B2B)

**Dependências:** PRD-103, PRD-065, PRD-071
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-108 — Performance e Otimização
**Objetivo:** Garantir performance em produção com volumes reais.
**Escopo:**
- Análise de slow queries
- Índices estratégicos (consultas mais usadas)
- Query optimization
- Caching estratégico (Redis ou similar)
- Connection pooling
- Métricas de performance

**Dependências:** PRD-104
**Complexidade:** Alta — **Prioridade:** P1

---

### PRD-109 — Backup e Disaster Recovery
**Objetivo:** Estratégia robusta de backup, restore e disaster recovery.
**Escopo:**
- Backup diário automatizado
- Backup point-in-time
- Restore testado mensalmente
- Replicação cross-região (Fase futura)
- Documentação de runbook

**Dependências:** PRD-100
**Complexidade:** Média — **Prioridade:** P0

---

### PRD-110 — Monitoring e Observability
**Objetivo:** Visibilidade total da saúde do sistema.
**Escopo:**
- APM (Application Performance Monitoring)
- Logs estruturados centralizados
- Métricas de negócio em dashboards (Grafana ou similar)
- Alertas para Owner (slow queries, error rate, downtime)
- Status page público

**Dependências:** PRD-104
**Complexidade:** Média — **Prioridade:** P1

---

## 5. ONDA 5 — WhatsApp Real (PRDs 111-120)

> **Marco:** Canal #1 da GALLO sai do placeholder. SDR funciona com clientes reais.

### PRD-111 — Setup Meta Cloud API
**Objetivo:** Onboarding completo na Meta Business Platform.
**Escopo:**
- Verificação de empresa Meta
- Registro de número de telefone empresarial
- Aprovação de templates HSM iniciais
- Configuração de webhooks
- Limites e cotas

**Dependências:** PRD-100
**Complexidade:** Média — **Prioridade:** P0

---

### PRD-112 — Provider Meta Cloud API
**Objetivo:** Implementação do provider de WhatsApp via Meta Cloud API.
**Escopo:**
- Envio de mensagens (text, image, document, template)
- Recebimento via webhooks
- Status updates (sent/delivered/read)
- Media handling (upload/download)

**Dependências:** PRD-111, PRD-104
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-113 — Provider Evolution API (alternativa)
**Objetivo:** Provider alternativo via Evolution API (não-oficial; flexibilidade).
**Escopo:**
- Mesma interface do Meta provider
- Toggle por conta WhatsApp (`IWhatsAppAccount.provider`)
- Limitações documentadas

**Dependências:** PRD-112
**Complexidade:** Alta — **Prioridade:** P1

---

### PRD-114 — Webhook Receiver
**Objetivo:** Edge Function processando mensagens entrantes.
**Escopo:**
- Validação de assinatura Meta
- Parsing de payload
- Criação/atualização de IConversation e IMessage
- Trigger de distribuição (PRD-013) e SDR (PRD-020)
- Idempotência

**Dependências:** PRD-112, PRD-102
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-115 — Envio de Mensagens (UI)
**Objetivo:** Vendedor envia mensagens reais via interface.
**Escopo:**
- Substituir simulação do PRD-011 por envio real
- Indicador de status (enviando/enviado/entregue/lido)
- Retry em falhas
- Audit log do envio

**Dependências:** PRD-114, PRD-011
**Complexidade:** Média — **Prioridade:** P0

---

### PRD-116 — Templates HSM Management
**Objetivo:** Gerenciar templates aprovados pela Meta (HSM — Highly Structured Messages).
**Escopo:**
- CRUD de templates locais
- Sync com Meta (aprovação/rejeição)
- Variáveis dinâmicas
- Categorias (transactional/marketing)
- Usados em notificações automáticas (pedido confirmado, status muda)

**Dependências:** PRD-114
**Complexidade:** Média — **Prioridade:** P1

---

### PRD-117 — Session Management 24h
**Objetivo:** Gerenciar a janela de 24h do WhatsApp Business.
**Escopo:**
- Detectar quando session ativa vs precisa template HSM
- Botão visual indicando estado da janela
- Fallback automático para template quando session expirou
- Métricas de uso

**Dependências:** PRD-115, PRD-116
**Complexidade:** Média — **Prioridade:** P1

---

### PRD-118 — Múltiplas Contas WhatsApp
**Objetivo:** Suporte robusto a múltiplos números (consolida `IWhatsAppAccount`).
**Escopo:**
- CRUD de contas
- Atribuição de conta por loja/equipe
- Roteamento de mensagens entrantes por número de destino
- Métricas por conta

**Dependências:** PRD-114, PRD-019 (multi-conta já modelado)
**Complexidade:** Média — **Prioridade:** P1

---

### PRD-119 — Status Sync e Read Receipts
**Objetivo:** Status visuais em tempo real (PRD-011).
**Escopo:**
- Recepção de webhooks de status
- Atualização do IMessage em tempo real
- Indicadores visuais (✓ enviado, ✓✓ entregue, ✓✓ azul lido)

**Dependências:** PRD-114, PRD-105 (Realtime)
**Complexidade:** Baixa — **Prioridade:** P2

---

### PRD-120 — Migração de Stubs WhatsApp
**Objetivo:** Substituir todos os placeholders de "WhatsApp Fase 2" deixados nos PRDs 022, 031, 032, 064, 067.
**Escopo:**
- Auditoria de placeholders nos PRDs Fase 1
- Substituição um a um por chamadas reais
- Testes de regressão

**Dependências:** PRDs 111-119
**Complexidade:** Média — **Prioridade:** P0

---

## 6. ONDA 6 — Integração DINTEC ERP (PRDs 121-130)

> **Marco:** Catálogo, estoque e NF passam a ser fonte única (DINTEC). Plataforma deixa de ser ilha.

### PRD-121 — Discovery e Contrato Técnico DINTEC
**Objetivo:** Mapear capacidades técnicas do DINTEC + desenhar integração.
**Escopo:**
- Reuniões com fornecedor DINTEC
- Mapeamento de endpoints/SOAP/webhook
- Modelagem de transformações
- Documento de contrato técnico assinado

**Dependências:** —
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-122 — Provider DINTEC base
**Objetivo:** Camada de comunicação com DINTEC.
**Escopo:**
- HTTP client / SOAP client
- Autenticação
- Rate limiting
- Retry / circuit breaker
- Mapeadores DINTEC → modelos GALLO

**Dependências:** PRD-121, PRD-102
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-123 — Sync de Catálogo
**Objetivo:** Catálogo real vem do DINTEC.
**Escopo:**
- Job inicial de import full
- Sync incremental periódico (cron)
- Webhook do DINTEC para mudanças (se disponível)
- Conflict resolution (mock vs DINTEC)
- Migração dos 200 mocks → catálogo real

**Dependências:** PRD-122, PRD-030
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-124 — Sync de Estoque
**Objetivo:** Estoque real-time ou near-real-time.
**Escopo:**
- Polling ou webhooks
- Atualização de `stockQuantity` em `IPart`
- Alertas de stockout (PRD-050)
- Reserva de estoque durante checkout (PRD-064)

**Dependências:** PRD-122, PRD-030
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-125 — Sync de Clientes
**Objetivo:** Sincronização bidirecional de clientes.
**Escopo:**
- Import inicial
- Sync incremental
- Conflict resolution (cliente criado em ambos os lados)
- Mapeamento de campos

**Dependências:** PRD-122, PRD-012
**Complexidade:** Média — **Prioridade:** P1

---

### PRD-126 — Sync de Pedidos
**Objetivo:** Pedido criado na plataforma → criado no DINTEC.
**Escopo:**
- Push de IOrder para DINTEC
- Status sync bidirecional
- Mapeamento de transições
- Tratamento de falhas (queue + retry)

**Dependências:** PRD-122, PRD-032
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-127 — NF Eletrônica via DINTEC
**Objetivo:** Emissão de NF substituindo placeholder do PRD-032.
**Escopo:**
- Trigger automático ao mudar para `paid`
- Sync de número de NF + chave + PDF
- Armazenamento em Supabase Storage
- Disponibilização ao cliente (portal B2B + email)

**Dependências:** PRD-122, PRD-126, PRD-106
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-128 — Conflict Resolution Cross-System
**Objetivo:** Lidar com divergências entre plataforma e DINTEC.
**Escopo:**
- Detecção de conflitos
- Estratégias por tipo (last-write-wins, manual, merge)
- UI para Gestor resolver
- Audit log especial

**Dependências:** PRDs 123-127
**Complexidade:** Alta — **Prioridade:** P1

---

### PRD-129 — Importação CSV (fallback)
**Objetivo:** Importação manual via CSV (placeholder do PRD-030 ativado).
**Escopo:**
- Upload de CSV (catálogo, clientes)
- Validação e preview
- Mapeamento de colunas
- Execução com audit log
- Útil para cargas iniciais ou correções

**Dependências:** PRD-123
**Complexidade:** Média — **Prioridade:** P2

---

### PRD-130 — Audit Cross-System
**Objetivo:** Auditoria completa de operações cross-DINTEC.
**Escopo:**
- Logs de cada sync
- Visualização de inconsistências
- Métricas de saúde da integração
- Alertas para Owner em falhas

**Dependências:** PRDs 123-128
**Complexidade:** Média — **Prioridade:** P1

---

## 7. ONDA 7 — Pagamentos (PRDs 131-140)

> **Marco:** E-commerce sai do modo demonstração. PIX, cartão e boleto funcionam de verdade.

### PRD-131 — PIX Open Banking estrutura
**Objetivo:** Configurar provider PIX (Asaas, Iugu, Stripe ou similar).
**Escopo:**
- Onboarding do provider
- Sandbox + produção
- Credenciais e secrets
- Webhook setup

**Dependências:** PRD-104
**Complexidade:** Média — **Prioridade:** P0

---

### PRD-132 — PIX QR Code Dinâmico
**Objetivo:** Gerar QR codes PIX dinâmicos para pedidos.
**Escopo:**
- Geração de QR ao confirmar pedido
- TTL configurável
- Exibição em /loja/pedido-confirmado
- Envio via WhatsApp + email

**Dependências:** PRD-131, PRD-064
**Complexidade:** Média — **Prioridade:** P0

---

### PRD-133 — PIX Webhook (Confirmação)
**Objetivo:** Receber confirmação de pagamento PIX automaticamente.
**Escopo:**
- Webhook receiver
- Atualização de `IOrder.paymentStatus='paid'`
- Trigger de fluxos pós-pagamento (PRD-067, PRD-047 comissão)
- Idempotência

**Dependências:** PRD-132
**Complexidade:** Alta — **Prioridade:** P0

---

### PRD-134 — Boleto Bancário
**Objetivo:** Boleto registrado funcional.
**Escopo:**
- Geração via provider
- Envio para cliente
- Webhook de baixa
- Vencimento + multa/juros configurável

**Dependências:** PRD-131
**Complexidade:** Média — **Prioridade:** P1

---

### PRD-135 — Cartão de Crédito
**Objetivo:** Pagamento via cartão (one-time + tokenização).
**Escopo:**
- Integração com gateway (Stripe, Pagar.me ou similar)
- Tokenização para clientes recorrentes (Fase futura)
- 3DS quando necessário
- Captura imediata

**Dependências:** PRD-131
**Complexidade:** Alta — **Prioridade:** P1

---

### PRD-136 — Parcelamento
**Objetivo:** Parcelar em cartão ou boleto.
**Escopo:**
- Cálculo de juros configurável
- Plano de parcelas visível ao cliente
- Boleto: gera N boletos com vencimentos
- Cartão: parcelamento na adquirente

**Dependências:** PRDs 134, 135
**Complexidade:** Alta — **Prioridade:** P1

---

### PRD-137 — Refund Automático
**Objetivo:** Cancelamento pós-pagamento dispara refund.
**Escopo:**
- Substitui placeholder do PRD-032
- Refund integral ou parcial
- Trigger automático no cancelamento
- Audit log financeiro

**Dependências:** PRDs 132, 134, 135
**Complexidade:** Alta — **Prioridade:** P1

---

### PRD-138 — Conciliação Financeira
**Objetivo:** Bater pagamentos recebidos com pedidos pagos.
**Escopo:**
- Dashboard de conciliação
- Detecção de divergências
- Conciliação manual quando necessário
- Relatórios para contador

**Dependências:** PRDs 132-137
**Complexidade:** Alta — **Prioridade:** P1

---

### PRD-139 — Anti-Fraude Básico
**Objetivo:** Reduzir chargebacks e fraudes em cartão.
**Escopo:**
- Score do gateway
- Regras simples (valor alto + cliente novo = revisão)
- Blacklist
- Fila de revisão manual

**Dependências:** PRD-135
**Complexidade:** Média — **Prioridade:** P2

---

### PRD-140 — Migração de Stubs Pagamento
**Objetivo:** Substituir placeholders "Pagamento Fase 2" dos PRDs 032 e 064.
**Escopo:**
- Auditoria de placeholders
- Remoção de banners "modo demonstração"
- Testes end-to-end

**Dependências:** PRDs 131-138
**Complexidade:** Média — **Prioridade:** P0

---

## 8. ONDA 8 — Notificações Reais (PRDs 141-150)

### PRD-141 — Email Transacional
**Objetivo:** Provider de email (SendGrid, Resend ou AWS SES).
**Escopo:** setup, configuração de domínio (DKIM/SPF), templates MJML, tracking, bounces.
**Dependências:** PRD-104 — **Complexidade:** Média — **Prioridade:** P0

### PRD-142 — Templates Email
**Objetivo:** Sistema de templates editáveis para emails.
**Escopo:** CRUD de templates, variáveis dinâmicas, preview, A/B (Fase futura).
**Dependências:** PRD-141 — **Complexidade:** Média — **Prioridade:** P1

### PRD-143 — WhatsApp Transacional via HSM
**Objetivo:** Notificações automáticas via templates HSM aprovados.
**Escopo:** disparo automático em eventos (pedido confirmado, NF emitida, status mudou), substituindo placeholder do PRD-067.
**Dependências:** PRD-116, PRD-067 — **Complexidade:** Média — **Prioridade:** P0

### PRD-144 — SMS (Fallback)
**Objetivo:** SMS via Twilio para situações críticas.
**Escopo:** códigos OTP, alertas críticos, fallback quando WhatsApp falha.
**Dependências:** PRD-104 — **Complexidade:** Baixa — **Prioridade:** P3

### PRD-145 — Push Notifications Web
**Objetivo:** Push do navegador para vendedores/clientes.
**Escopo:** Service Worker + Push API + permissões + topics.
**Dependências:** PRD-104, PRD-070 — **Complexidade:** Média — **Prioridade:** P2

### PRD-146 — Notification Center
**Objetivo:** UI persistente de notificações dentro do app.
**Escopo:** lista, marcação como lida, filtros, ações inline; substitui toast-only do MVP.
**Dependências:** PRDs 141, 143 — **Complexidade:** Média — **Prioridade:** P1

### PRD-147 — Preferências do Cliente (Opt-in/Opt-out)
**Objetivo:** LGPD: cliente controla quais notificações recebe.
**Escopo:** preferências por canal (email, WhatsApp, SMS, push) e categoria (transacional, marketing).
**Dependências:** PRDs 141, 143 — **Complexidade:** Média — **Prioridade:** P0 (LGPD)

### PRD-148 — Drip Campaigns
**Objetivo:** Sequências automáticas (boas-vindas, recuperação dormente, pós-venda).
**Escopo:** workflows visuais simples; templates; gatilhos; métricas.
**Dependências:** PRDs 142, 143 — **Complexidade:** Alta — **Prioridade:** P2

### PRD-149 — Carrinho Abandonado
**Objetivo:** Recuperar checkout não concluído.
**Escopo:** detecção de abandono (24h sem voltar), email/WhatsApp com lembrete + incentivo opcional.
**Dependências:** PRD-064, PRD-148 — **Complexidade:** Média — **Prioridade:** P1

### PRD-150 — Migração de Stubs Notificações
**Objetivo:** Substituir placeholders de notificação dos PRDs 067, 064 e outros.
**Dependências:** PRDs 141-149 — **Complexidade:** Média — **Prioridade:** P0

---

## 9. ONDA 9 — LLM / IA Real (PRDs 151-160)

> **Marco:** Heurísticas do PRD-053 e simulador do PRD-020-024 ganham IA real.

### PRD-151 — LangChain + LLM Gateway
**Objetivo:** Infraestrutura para chamadas a Claude API + fallbacks.
**Escopo:** abstraction, rate limiting, retry, fallback entre modelos, cost tracking.
**Dependências:** PRD-102 — **Complexidade:** Alta — **Prioridade:** P0

### PRD-152 — Insights via LLM (substitui heurísticas PRD-053)
**Objetivo:** Insights gerados por LLM analisando contexto cross-PRD.
**Escopo:** prompts estruturados, RAG sobre dados da empresa, validation, evaluation harness.
**Dependências:** PRD-151, PRD-053 — **Complexidade:** Crítica — **Prioridade:** P1

### PRD-153 — SDR Avançado com LLM
**Objetivo:** Substitui simulador SDR (PRDs 020-024) por agente real conversacional.
**Escopo:** memória de conversa, identificação de peça via descrição livre, negociação simples, escalonamento inteligente.
**Dependências:** PRD-151, PRDs 020-024 — **Complexidade:** Crítica — **Prioridade:** P0

### PRD-154 — Análise de Sentimento
**Objetivo:** Detectar sentimento em conversas (PRD-051 ganha dimensão).
**Escopo:** classificação cada mensagem, alertas em conversas com cliente irritado, sumarização periódica.
**Dependências:** PRD-151, PRD-051 — **Complexidade:** Alta — **Prioridade:** P2

### PRD-155 — Sugestões de Ação Contextualizadas
**Objetivo:** Em cada conversa/ficha, IA sugere próximos passos para vendedor.
**Escopo:** prompt com contexto (cliente, histórico, conversa atual); sugestões inline; tracking de uso.
**Dependências:** PRD-151 — **Complexidade:** Alta — **Prioridade:** P2

### PRD-156 — Relatórios Narrativos
**Objetivo:** Resumos executivos em linguagem natural.
**Escopo:** "como foi o mês" gerado por IA; insights cross-PRD; entregue por email + dashboard.
**Dependências:** PRD-151, PRD-040 — **Complexidade:** Alta — **Prioridade:** P3

### PRD-157 — Assistente IA dentro do App
**Objetivo:** Chat com IA assistente (Gestor pergunta "como está vendedor X?").
**Escopo:** UI de chat embedded, RAG sobre dados, citações de fontes.
**Dependências:** PRD-151 — **Complexidade:** Alta — **Prioridade:** P3

### PRD-158 — Classificação Automática de Tópicos
**Objetivo:** Categorizar conversas (devolução, reclamação, dúvida, compra).
**Escopo:** classificação automática, dashboards de distribuição.
**Dependências:** PRD-151 — **Complexidade:** Média — **Prioridade:** P3

### PRD-159 — Forecast com ML
**Objetivo:** Previsão de demanda, vendas, churn via séries temporais.
**Escopo:** modelos básicos (Prophet, ARIMA), evaluation, drift detection.
**Dependências:** PRD-104 (dados históricos) — **Complexidade:** Crítica — **Prioridade:** P3

### PRD-160 — Safety, Guardrails e Anti-Bias
**Objetivo:** Garantir respostas seguras e auditáveis da IA.
**Escopo:** content filters, PII redaction, audit logs de prompts/respostas, evaluation framework.
**Dependências:** PRD-151 — **Complexidade:** Crítica — **Prioridade:** P0 (em paralelo com 152-159)

---

## 10. ONDA 10 — B2B Corporativo Funcional (PRDs 161-170)

> **Marco:** Portal B2B (PRD-071) deixa de ser esqueleto e ativa workflows reais.

### PRD-161 — Workflow de Aprovação Real
**Objetivo:** Aprovações internas do portal B2B (PRD-071) funcionais.
**Escopo:** estado, notificações ao aprovador, escalation, audit.
**Dependências:** PRD-071, PRD-143 — **Complexidade:** Alta — **Prioridade:** P0

### PRD-162 — Faturamento Corporativo
**Objetivo:** Limite de crédito, conta corrente, parcelas estendidas.
**Escopo:** modelo financeiro, validação no checkout, integração contábil.
**Dependências:** PRD-071, PRD-138 — **Complexidade:** Crítica — **Prioridade:** P0

### PRD-163 — Parcelamento Estendido B2B (30/60/90)
**Objetivo:** Faturar com prazo sem cartão/boleto bancário (faturamento mensal).
**Escopo:** geração de fatura consolidada, cobrança no vencimento.
**Dependências:** PRD-162 — **Complexidade:** Alta — **Prioridade:** P1

### PRD-164 — NF Corporativa + Faturamento Mensal
**Objetivo:** NF agregada por período + boleto/transferência única.
**Escopo:** consolidação automática, NF mãe, faturamento mensal.
**Dependências:** PRDs 127, 163 — **Complexidade:** Alta — **Prioridade:** P1

### PRD-165 — Catálogo Personalizado por Contrato
**Objetivo:** Cliente B2B vê preços com desconto contratual.
**Escopo:** `IPortalContract` aplicado em tempo real; histórico de preços por contrato.
**Dependências:** PRD-071, PRD-030 — **Complexidade:** Alta — **Prioridade:** P1

### PRD-166 — Comissões Avançadas
**Objetivo:** Multiplicadores por categoria, regras complexas, splits programáveis.
**Escopo:** estende PRD-047 com lógica configurável avançada.
**Dependências:** PRD-047 — **Complexidade:** Alta — **Prioridade:** P2

### PRD-167 — Convite Real de Usuários do Portal
**Objetivo:** Admin B2B convida funcionários por email.
**Escopo:** workflow de convite → email → criação de senha → vínculo ao cliente.
**Dependências:** PRD-071, PRD-141 — **Complexidade:** Média — **Prioridade:** P1

### PRD-168 — Integração ERP do Cliente
**Objetivo:** Cliente B2B integra seu ERP com GALLO (API privada).
**Escopo:** webhooks de pedido, sincronização de NF, API documentada para cliente.
**Dependências:** PRD-199 (API pública) — **Complexidade:** Crítica — **Prioridade:** P3

### PRD-169 — Marketplace Privado B2B
**Objetivo:** Clientes B2B GALLO podem trocar peças entre si (consignação, sobras).
**Escopo:** painel separado, listagens entre clientes, mediação GALLO.
**Dependências:** PRD-071 — **Complexidade:** Crítica — **Prioridade:** P3

### PRD-170 — Reports Customizados B2B
**Objetivo:** Cliente B2B configura dashboards próprios.
**Escopo:** widgets, filtros salvos, export automático mensal.
**Dependências:** PRD-071 — **Complexidade:** Média — **Prioridade:** P2

---

## 11. ONDA 11 — PWA Offline-First (PRDs 171-180)

> **Marco:** PRD-070 esqueleto vira app real para vendedor externo em campo.

### PRD-171 — Service Worker Completo
**Objetivo:** SW funcional para PWA do vendedor.
**Escopo:** cache strategies, fallback offline, background sync.
**Dependências:** PRD-070 — **Complexidade:** Alta — **Prioridade:** P1

### PRD-172 — IndexedDB Cache Local
**Objetivo:** Carteira do vendedor disponível offline.
**Escopo:** estratégia de sync, expiração, conflitos.
**Dependências:** PRD-171 — **Complexidade:** Alta — **Prioridade:** P1

### PRD-173 — Sync Queue Offline
**Objetivo:** Mutations offline aguardam reconexão.
**Escopo:** queue persistente, retry, ordem garantida, deduplicação.
**Dependências:** PRDs 171, 172 — **Complexidade:** Crítica — **Prioridade:** P1

### PRD-174 — Conflict Resolution Offline
**Objetivo:** Lidar com conflitos quando vendedor edita offline e servidor mudou.
**Escopo:** detecção, estratégias (last-write-wins, merge, manual).
**Dependências:** PRD-173 — **Complexidade:** Crítica — **Prioridade:** P1

### PRD-175 — GPS e Localização
**Objetivo:** Capturar localização em visitas e orçamentos.
**Escopo:** check-in em cliente, roteirização, mapa, geofencing.
**Dependências:** PRD-070 — **Complexidade:** Média — **Prioridade:** P2

### PRD-176 — Captura de Foto
**Objetivo:** Tirar foto da peça/cliente/ambiente direto do PWA.
**Escopo:** câmera nativa, upload com retry, anexar em conversa/pedido.
**Dependências:** PRD-106 — **Complexidade:** Média — **Prioridade:** P2

### PRD-177 — Assinatura Digital
**Objetivo:** Cliente assina pedido no celular do vendedor.
**Escopo:** canvas de assinatura, anexar em IOrder, audit.
**Dependências:** PRD-070 — **Complexidade:** Média — **Prioridade:** P2

### PRD-178 — Push Notifications Mobile
**Objetivo:** Vendedor recebe push no celular (não só na aba do navegador).
**Escopo:** notification API, opt-in, topics.
**Dependências:** PRD-145, PRD-070 — **Complexidade:** Média — **Prioridade:** P2

### PRD-179 — Voice Notes em Conversas
**Objetivo:** Gravação de áudio direto no app (vendedor manda áudio ao cliente).
**Escopo:** captura, envio via WhatsApp, transcrição via LLM (PRD-153).
**Dependências:** PRDs 115, 153 — **Complexidade:** Alta — **Prioridade:** P3

### PRD-180 — Migração Completa PRD-070
**Objetivo:** PWA esqueleto vira PWA completo.
**Escopo:** todos os placeholders Fase 2 do PRD-070 substituídos.
**Dependências:** PRDs 171-179 — **Complexidade:** Média — **Prioridade:** P1

---

## 12. ONDA 12 — Multi-loja + Equipes Ativas (PRDs 181-190)

> **Marco:** Equipes dormentes ativam; multi-loja real opera.

### PRD-181 — Segunda Loja Ativa
**Objetivo:** Onboarding de segunda loja real (filial Carazinho ou outra).
**Escopo:** wizard de criação, configurações específicas, dados separados.
**Dependências:** PRD-007 (já modelado) — **Complexidade:** Alta — **Prioridade:** P2

### PRD-182 — Roteamento Entre Lojas
**Objetivo:** Pedido pode ser transferido entre lojas.
**Escopo:** transferência manual e automática (estoque), audit.
**Dependências:** PRD-181 — **Complexidade:** Alta — **Prioridade:** P2

### PRD-183 — Estoque Cross-Loja
**Objetivo:** Consulta estoque em outras lojas.
**Escopo:** visualização agregada, requisição inter-loja.
**Dependências:** PRD-181, PRD-124 — **Complexidade:** Alta — **Prioridade:** P2

### PRD-184 — Equipes Ativas (CRUD)
**Objetivo:** `ITeam` deixa de ser dormente.
**Escopo:** CRUD, hierarquia, vendedores em times.
**Dependências:** PRD-019 — **Complexidade:** Média — **Prioridade:** P2

### PRD-185 — Metas por Equipe
**Objetivo:** Metas agregadas por time (PRD-042 estendido).
**Escopo:** rollup automático, distribuição entre membros.
**Dependências:** PRDs 042, 184 — **Complexidade:** Alta — **Prioridade:** P2

### PRD-186 — Comissões com Split por Equipe
**Objetivo:** Líder de equipe ganha % sobre vendas do time.
**Escopo:** PRD-047 estendido com regras de equipe.
**Dependências:** PRDs 047, 184 — **Complexidade:** Alta — **Prioridade:** P2

### PRD-187 — Cobertura por Equipe
**Objetivo:** Escalonamento entre membros da equipe (PRD-013 estendido).
**Escopo:** roteamento inteligente por especialidade, presença.
**Dependências:** PRDs 013, 184 — **Complexidade:** Alta — **Prioridade:** P2

### PRD-188 — Cross-Store BI Consolidado
**Objetivo:** PRD-040 (Cockpit) consolida múltiplas lojas para Owner.
**Escopo:** visões agregadas, comparativos entre lojas, drill-down por loja.
**Dependências:** PRD-181, PRD-040 — **Complexidade:** Alta — **Prioridade:** P1

### PRD-189 — Permissões Cross-Store Granulares
**Objetivo:** Owner pode delegar gestão de loja para Gestor sem perder controle.
**Escopo:** estende PRD-006 com regras finas (Owner cross-store, Gestor só sua loja).
**Dependências:** PRD-006, PRD-103, PRD-181 — **Complexidade:** Alta — **Prioridade:** P1

### PRD-190 — Vendedor Externo Ativado
**Objetivo:** `ISeller.type='external'` deixa de ser dormente.
**Escopo:** ativa PRD-070 para esse perfil, métricas específicas, comissão.
**Dependências:** PRDs 070, 180 — **Complexidade:** Média — **Prioridade:** P2

---

## 13. ONDA 13 — Compliance + ML Avançado (PRDs 191-200)

> **Marco:** GALLO se prepara para escala (LGPD avançado, SOC2, ML predictivo, API pública).

### PRD-191 — LGPD Avançado
**Objetivo:** Compliance LGPD completo além do MVP.
**Escopo:** consentimento granular, portabilidade de dados, direito ao esquecimento, DPO interface.
**Dependências:** PRD-147 — **Complexidade:** Crítica — **Prioridade:** P0 (regulatório)

### PRD-192 — Auditoria SOC2
**Objetivo:** Preparação para certificação SOC2 Type II.
**Escopo:** controles documentados, audit trail completo, penetration testing, gap analysis.
**Dependências:** PRD-110, PRD-103 — **Complexidade:** Crítica — **Prioridade:** P3

### PRD-193 — ISO 27001 Placeholder
**Objetivo:** Preparação para ISO 27001 (gestão de segurança da informação).
**Escopo:** ISMS documentation, risk assessment, controls.
**Dependências:** PRD-192 — **Complexidade:** Crítica — **Prioridade:** P3

### PRD-194 — BI Predictivo (Churn, Demanda)
**Objetivo:** Modelos ML para previsão de churn e demanda.
**Escopo:** feature engineering, model training, A/B test, interpretabilidade.
**Dependências:** PRD-159 — **Complexidade:** Crítica — **Prioridade:** P3

### PRD-195 — Recomendações de IA (Cross-sell, Upsell)
**Objetivo:** Sugerir produtos relacionados via ML.
**Escopo:** collaborative filtering, content-based, hybrid; presente em /loja e CRM.
**Dependências:** PRD-151 — **Complexidade:** Alta — **Prioridade:** P3

### PRD-196 — Cohort Analysis
**Objetivo:** Análise por coorte de clientes (quando entraram).
**Escopo:** retention curves, LTV por cohort, comparativos.
**Dependências:** PRD-104 — **Complexidade:** Média — **Prioridade:** P3

### PRD-197 — A/B Testing Infrastructure
**Objetivo:** Plataforma de experimentos.
**Escopo:** flag system, allocation, métricas, significância estatística.
**Dependências:** PRD-198 — **Complexidade:** Alta — **Prioridade:** P3

### PRD-198 — Feature Flags
**Objetivo:** Toggles para rollout gradual de features.
**Escopo:** sistema de flags, segmentação, kill switches.
**Dependências:** PRD-104 — **Complexidade:** Média — **Prioridade:** P2

### PRD-199 — API Pública
**Objetivo:** API REST/GraphQL pública para clientes integrarem.
**Escopo:** docs (OpenAPI), auth, rate limiting, sandbox.
**Dependências:** PRD-104, PRD-103 — **Complexidade:** Crítica — **Prioridade:** P3

### PRD-200 — Marketplace de Integrações
**Objetivo:** Hub de integrações Zapier-style.
**Escopo:** templates de automação, conectores, webhook builder.
**Dependências:** PRD-199 — **Complexidade:** Crítica — **Prioridade:** P3

---

## 14. Priorização sugerida para Go-Live

Para tirar a plataforma do MVP visual e levar à produção real, sequência mínima recomendada:

**Fase 2.0 (P0 obrigatório para go-live):** ~25 PRDs
- Toda Onda 4 (Backend Supabase): 100-110
- WhatsApp essencial: 111, 112, 114, 115, 120
- DINTEC essencial: 121-124, 126, 127, 130
- Pagamentos essenciais: 131, 132, 133, 140
- Notificações essenciais: 141, 143, 147, 150
- Compliance: 191 (LGPD)
- Safety IA: 160 (se PRD-053 ativado)

**Fase 2.1 (P1 — ampliação):** ~30 PRDs
- Demais Ondas 5-8 + alguns da 9, 11, 12

**Fase 2.2+ (P2/P3 — evolução contínua):** restante

---

## 15. Considerações finais

- **Ordem real depende de prioridades de negócio:** o roadmap acima é sugestão técnica. Cliente GALLO define quais ondas vêm primeiro baseado em ROI esperado.
- **Paralelização possível:** Ondas 5, 6, 7 podem ser paralelas se houver squads.
- **PRDs aqui são esqueletos:** cada um precisará ser detalhado em PRD completo (com Gherkin, fases de implementação, etc.) seguindo o padrão dos PRDs Fase 1 antes da implementação.
- **Drop-in replacement é o princípio:** todo PRD da Fase 2 que substitui placeholder da Fase 1 deve manter interface estável (Provider Pattern em ação).
- **Audit log obrigatório:** todas as integrações reais (pagamento, NF, comissão, WhatsApp) exigem audit log de produção.
- **Custos crescem:** Ondas 9 (LLM) e 6 (DINTEC) têm custos recorrentes significativos — orçamento mensal precisa ser planejado.

---

## 16. Histórico

| Versão | Data | Autor | Mudança |
|--------|------|-------|---------|
| 1.0 | 25/05/2026 | AILA | Criação inicial — 100 PRDs Fase 2 em 10 ondas |

---

**AILA - Sistemas Inteligentes**
