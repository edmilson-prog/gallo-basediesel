# Briefing de Execução — PRDs Fase 2 do Projeto GALLO BASE DIESEL

> **Documento mestre de execução — Fase 2** — versão 1.0 — Maio/2026
> Consolida o desenho estratégico da Fase 2 e serve como **input único** das sessões de escrita dos 100 PRDs (faixa 100–200).
>
> **Arquiteto:** Edmilson Souza (AILA Sistemas Inteligentes) + Claude Opus 4.7
> **Sessão de planejamento:** Claude Opus 4.7 (claude.ai)
> **Sessão de execução (futura):** Claude Opus 4.7 — escrita dos PRDs Fase 2
> **Implementação posterior:** Claude Code CLI v2.1.x (Agente Desenvolvedor)

---

## Sumário

1. [Propósito deste documento](#1-propósito-deste-documento)
2. [Status atual do projeto](#2-status-atual-do-projeto)
3. [Resumo estratégico da Fase 2](#3-resumo-estratégico-da-fase-2)
4. [Princípios arquiteturais da Fase 2](#4-princípios-arquiteturais-da-fase-2)
5. [Modelo de transição Fase 1 → Fase 2](#5-modelo-de-transição-fase-1--fase-2)
6. [Extensões ao modelo conceitual](#6-extensões-ao-modelo-conceitual)
7. [Índice expandido dos 100 PRDs](#7-índice-expandido-dos-100-prds)
8. [Lotes recomendados de escrita](#8-lotes-recomendados-de-escrita)
9. [Convenções de estilo](#9-convenções-de-estilo)
10. [Orçamento operacional estimado](#10-orçamento-operacional-estimado)
11. [Cronograma macro Fase 2](#11-cronograma-macro-fase-2)
12. [Riscos e mitigações](#12-riscos-e-mitigações)
13. [Apêndices](#13-apêndices)

---

## 1. Propósito deste documento

Este briefing é o equivalente Fase 2 do `briefing-execucao-prds.md` v1.1 que conduziu a Fase 1. Ele consolida:

- O **status atual do projeto** (Fase 1 entregue, próximos marcos)
- O **objetivo estratégico da Fase 2** (tirar a plataforma do mockup e levá-la a produção)
- Os **princípios arquiteturais transversais** que governam todas as 10 ondas
- O **modelo de transição** entre Fase 1 e Fase 2 (drop-in replacement, coexistência)
- As **extensões ao modelo conceitual** que cada onda traz
- O **índice expandido dos 100 PRDs** com profundidade, dependências e lote
- A **ordem recomendada de escrita** em 10 lotes (1 por onda)
- As **convenções de estilo** (GuiaPRD v1.4 + decisões específicas Fase 2)
- O **orçamento operacional** estimado por onda
- O **cronograma macro** das 10 ondas

**Como usar:** abra uma nova sessão no claude.ai, anexe este documento + os 50 PRDs Fase 1 + o `ROADMAP-FASE2-Gallo-Base-Diesel.md` + o `DELTAS-PRDs-Gallo-Base-Diesel.md`, e use o prompt sugerido em §8.2 para iniciar a escrita do primeiro lote. O Claude da próxima sessão terá tudo o que precisa para produzir PRDs completos e consistentes.

---

## 2. Status atual do projeto

### 2.1 Onde a Fase 1 chegou

A Fase 1 entregou **50 PRDs** distribuídos em 7 blocos (000 a 700), cobrindo:

| Bloco                     | PRDs         | Foco                                                                                                                                         |
| ------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Fundação              | 001–007 (7)  | Identidade, modelo, shell, mocks, providers, RBAC, multi-loja                                                                                |
| 1 — CRM                   | 010–019 (10) | Inbox, conversa, ficha, distribuição, painel, leads, veículos, carteira                                                                      |
| 2 — SDR                   | 020–024 (5)  | Simulação, identificação de peça, orçamento, escalonamento, painel                                                                           |
| 3 — Comercial Operacional | 030–033 (4)  | Catálogo, orçamento, pedido, frete                                                                                                           |
| 4 — Gestão e BI           | 040–053 (14) | Cockpit, vendas, metas, gamificação, positivação, ABC, carteira analítica, comissões, DRE, rentabilidade, despesas, caixa, estoque, insights |
| 5 — E-commerce            | 060–067 (8)  | Vitrine, busca, categoria, ficha produto, carrinho, conta, admin, integração                                                                 |
| 6 — Auxiliares            | 070–071 (2)  | PWA externo, portal B2B (esqueletos)                                                                                                         |

**Marco atual:** documentação Fase 1 100% completa. Implementação pelo Claude Code CLI em curso — os PRDs marcados com sufixo `_DONE` no arquivo já têm código implementado; os sem sufixo seguem sendo implementados em paralelo a esta sessão de planejamento Fase 2.

### 2.2 O que a Fase 1 entregou conceitualmente

- **Plataforma navegável** com dados mockados realistas que cliente GALLO usa para validar visualmente toda a experiência antes de qualquer investimento em backend real
- **Arquitetura preparada para drop-in replacement** — Provider Pattern, mocks isolados em `src/mocks/`, switches parametrizados via env var, providers com interface estável
- **Modelo conceitual completo** — ~50 entidades tipadas em TypeScript, organizadas por domínio
- **RBAC visual** com matriz canônica de permissões + tela de auditoria mockada
- **Multi-loja modelado** (apenas matriz ativa no MVP)
- **Capabilities WhatsApp** mapeadas (Meta vs Evolution) sem integração real
- **18 áreas com placeholders explícitos** marcadas como "Modo demonstração / Fase 2" — listadas em §5.1

### 2.3 Documentos de referência do projeto

| Documento                               | Versão        | Papel                                                                    |
| --------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| `briefing-execucao-prds.md`             | v1.1 (Fase 1) | Briefing mestre Fase 1 — referência histórica                            |
| `briefing-execucao-prds-fase2.md`       | v1.0 (este)   | Briefing mestre Fase 2 — input único                                     |
| `INDEX-PRDs-Gallo-Base-Diesel.md`       | v1.0 (Fase 1) | Catálogo dos 50 PRDs Fase 1                                              |
| `INDEX-PRDs-Gallo-Base-Diesel-fase2.md` | v1.0 (Fase 2) | Catálogo dos 100 PRDs Fase 2                                             |
| `ROADMAP-FASE2-Gallo-Base-Diesel.md`    | v1.0          | Mapa estratégico inicial Fase 2 (referência histórica)                   |
| `DELTAS-PRDs-Gallo-Base-Diesel.md`      | v1.1          | Extensões cruzadas entre PRDs Fase 1                                     |
| `guia-prd.md`                           | v1.4          | Metodologia AILA para criação de PRDs                                    |
| `template-prd-feature.md`               | —             | Base estrutural para PRDs de feature                                     |
| `template-prd-integration.md`           | —             | Base estrutural para PRDs de integração externa (predominante na Fase 2) |
| `template-prd-bugfix.md`                | —             | Base estrutural para PRDs de correção                                    |

### 2.4 Agentes do workflow

| Agente                  | Modelo                     | Ambiente        | Papel                                                     |
| ----------------------- | -------------------------- | --------------- | --------------------------------------------------------- |
| **Arquiteto**           | Claude Opus 4.7            | claude.ai (web) | Produz e mantém PRDs Fase 2                               |
| **Desenvolvedor**       | Claude Opus 4.7 (CLI)      | Claude Code CLI | Implementa PRDs Fase 2 sobre o repositório vivo da Fase 1 |
| **Direção estratégica** | Edmilson Souza + Frederico | claude.ai (web) | Revisão, autorização, decisões finais                     |

---

## 3. Resumo estratégico da Fase 2

### 3.1 Objetivo central

Transformar o mockup navegável da Fase 1 em **sistema em produção real**, substituindo backends mock por backends reais sem refatorar consumidores (drop-in replacement), e ativando integrações externas (WhatsApp Meta/Evolution, DINTEC ERP, pagamentos, NF, LLM, notificações).

### 3.2 Estrutura macro

A Fase 2 está organizada em **10 ondas** totalizando **105 PRDs** na faixa 100–200 (4 PRDs inseridos via sufixo `B/C/D` em Ondas 6, 7 e 9 após decisões de 27/05/2026):

| Onda | Faixa   | PRDs | Tema                                                   | Duração estimada  | Prioridade      |
| ---- | ------- | ---- | ------------------------------------------------------ | ----------------- | --------------- |
| 4    | 100–110 | 11   | **Backend Supabase Real**                              | 8–12 semanas      | P0 — bloqueante |
| 5    | 111–120 | 10   | **WhatsApp Real**                                      | 6–8 semanas       | P0              |
| 6    | 121–131 | 11   | **DINTEC + NFe Própria** (sem API)                     | **14–18 semanas** | P0              |
| 7    | 131–140 | 11   | **Pagamentos** (Asaas + Mercado Pago)                  | 8–10 semanas      | P0              |
| 8    | 141–150 | 10   | **Notificações Reais**                                 | 4–6 semanas       | P0/P1           |
| 9    | 151–160 | 13   | **LLM / IA Real** (3 providers + override + dashboard) | 10–14 semanas     | P0/P1           |
| 10   | 161–170 | 10   | **B2B Corporativo Funcional**                          | 10–12 semanas     | P0/P1           |
| 11   | 171–180 | 10   | **PWA Offline-First**                                  | 6–8 semanas       | P1/P2           |
| 12   | 181–190 | 10   | **Multi-loja + Equipes Ativas**                        | 6–8 semanas       | P1/P2           |
| 13   | 191–200 | 10   | **Compliance + ML Avançado**                           | 10–14 semanas     | P0/P3           |

**Total estimado:** 82–120 semanas (~19–28 meses) de desenvolvimento contínuo, com possibilidade de paralelização em squads.

### 3.3 Princípio central da Fase 2

**Drop-in replacement.** Cada PRD da Fase 2 substitui um placeholder coerente deixado na Fase 1, mantendo interface estável. Consumidores (componentes React, hooks, telas) **não devem precisar mudar** quando a implementação real substituir o mock.

Esse princípio se materializa em três frentes:

1. **Providers** (PRD-005 Fase 1) — toda integração nova segue o padrão `IProvider` com implementação Mock e implementação Real intercambiáveis via env var
2. **Stubs marcados** — todas as funções placeholder na Fase 1 têm nomes explícitos (`stubCreateOrder`, `calculateShippingPlaceholder`, etc.) e estão mapeados no `DELTAS-PRDs-Gallo-Base-Diesel.md` §4 para suas implementações reais
3. **Banners "Modo demonstração / Fase 2"** — todas as áreas com placeholder têm banner visível na Fase 1; a remoção desses banners é uma entrega explícita dos PRDs de migração (PRD-120, PRD-140, PRD-150 etc.)

### 3.4 Coexistência durante a transição

Fase 1 e Fase 2 **vão coexistir** por um período. A implementação dos PRDs Fase 1 ainda em curso (PRDs sem sufixo `_DONE`) corre em paralelo à escrita dos PRDs Fase 2. Isso é intencional:

- **Documentação Fase 2 não bloqueia implementação Fase 1** — escrevemos PRDs Fase 2 enquanto Claude Code CLI continua entregando os PRDs Fase 1 pendentes
- **Implementação Fase 2 só começa após validação cliente do mockup completo** — ou seja, todos os 50 PRDs Fase 1 implementados e validados pelo cliente GALLO antes de qualquer linha de código Fase 2
- **Mocks continuam funcionais** mesmo após Fase 2 iniciar — o switch `VITE_DATA_SOURCE=mock` permanece operacional para ambientes de demonstração, treinamento e onboarding

---

## 4. Princípios arquiteturais da Fase 2

Os 10 princípios abaixo são **invariantes** que governam todos os 100 PRDs da Fase 2. Cada PRD deve respeitá-los ou explicitar e justificar exceções.

### 4.1 Drop-in Replacement

Interface dos providers e funções públicas é **estável**. Implementação real substitui mock sem refatoração nos consumidores.

**Implicação prática:** ao escrever um PRD que substitui placeholder, validar que o contrato (tipos de entrada, tipos de retorno, comportamento esperado em erro) permanece idêntico ao da Fase 1.

### 4.2 Snapshots imutáveis preservados

A Fase 1 estabeleceu que `IQuoteItem`, `IOrderItem` e `ICommission` carregam snapshots no momento da criação (preço, OEM, regra, meta). Esses snapshots **não mudam** mesmo se a entidade-fonte (peça, regra, meta) for alterada depois.

**Implicação na Fase 2:** ao modelar tabelas Supabase, snapshots viram colunas **JSONB** ou colunas redundantes congeladas no commit da transação. Audit log trilha mudanças nas entidades-fonte; snapshots permanecem intocados.

### 4.3 RLS espelhando RBAC do PRD-006

A Fase 1 entregou matriz canônica de permissões em `src/features/rbac/permissions/matrix.ts` cobrindo 18 recursos × 5 ações × 4 scopes. A Fase 2 implementa essa matriz como **políticas Row-Level Security no Supabase** (PRD-103).

**Implicação:** toda tabela Supabase tem RLS habilitada por padrão. Cada PRD da Fase 2 que cria tabela nova deve incluir as policies correspondentes, espelhando a matriz do PRD-006. Vendedor não consegue ler clientes de outro vendedor mesmo se quebrar o frontend.

### 4.4 Audit log promovido a primeira classe

Na Fase 1, audit log é **mockado e visual**. Na Fase 2, vira **persistido em tabela própria + logs estruturados + retenção configurável + exports automatizados para compliance**.

Áreas com audit log obrigatório (não opcional):

- Mudanças de preço (PRD-030 Fase 1)
- Mudanças de target de meta (PRD-042 Fase 1)
- Aprovação de descontos (PRD-031 Fase 1)
- Mudanças de regra de comissão (PRD-047 Fase 1)
- Fechamento de período de comissão (PRD-047 Fase 1)
- Mudanças de configuração financeira (PRD-048 Fase 1)
- Cancelamento de pedido (PRD-032 Fase 1)
- Dismiss de insights (PRD-053 Fase 1)
- CRUD de usuários do portal B2B (PRD-071 Fase 1)
- **Toda operação cross-system** (sync DINTEC, webhook WhatsApp, webhook PIX, geração de NF) — novo da Fase 2

### 4.5 Provider Pattern transversal

O padrão estabelecido no PRD-005 Fase 1 (factory + interface + implementação Mock/Supabase) se estende a **toda integração nova da Fase 2**:

| Tipo de provider | Switch                                         | Implementações                             |
| ---------------- | ---------------------------------------------- | ------------------------------------------ |
| Dados            | `VITE_DATA_SOURCE`                             | mock / supabase                            |
| WhatsApp         | `IWhatsAppAccount.provider` por conta          | meta / evolution                           |
| **Pagamento**    | configuração por método em painel admin        | **mock / asaas / mercado-pago**            |
| Frete            | configuração por estratégia                    | mock / correios / transportadora-X         |
| **LLM**          | **configuração global + override por feature** | **mock / anthropic / openai / openrouter** |
| **Email**        | configuração global                            | **mock / resend**                          |
| **NFe**          | configuração global                            | **mock / nfeio / enotas / plugnotas**      |
| Storage          | configuração global                            | mock / supabase-storage / s3               |

**Padrão de configuração via painel admin:** Inspirado no projeto Dermatobel (prints anexados pelo Arquiteto em 27/05), todos os providers acima são parametrizáveis em runtime através de UI dedicada na área Admin > Configurações > Inteligência (LLM) / Pagamentos / Comunicação. Chaves de API são armazenadas encriptadas via **Supabase Vault**. Cada PRD que introduz provider obrigatoriamente entrega: (1) painel de configuração visual, (2) teste de conexão, (3) rotação de chave, (4) seletor de modelo padrão (quando aplicável), (5) kill switch.

**Sistema de override por feature (LLM-específico):** A feature de "override por feature" do print Dermatobel (PRD-151C) permite rotear chamadas LLM de cada feature consumidora para provider/modelo diferente do default. Exemplo: chatbot usa OpenAI gpt-4o-mini (custo), insights usam Claude Opus 4.7 (qualidade), OCR usa OpenRouter com fallback.

**Implicação:** PRDs Fase 2 que introduzem nova integração externa **devem** seguir esse padrão. Não há atalho via fetch direto no consumidor.

### 4.6 Capabilities preservadas

`IWhatsAppCapabilities` foi modelado na Fase 1 com `getCapabilities()` por provider. Funcionalidades exclusivas de cada provider habilitam/desabilitam controles na UI sem esconder a feature.

**Implicação na Fase 2:** ao implementar Provider Meta (PRD-112) e Provider Evolution (PRD-113), preservar a UI adaptativa. Templates HSM existem apenas no Meta; mensagens proativas livres só no Evolution. Tooltip explicativo em cada controle.

### 4.7 Idempotência em integrações externas

Todo webhook receiver, sync de catálogo, processamento de pagamento e disparo de notificação deve ser **idempotente** — receber a mesma payload duas vezes não pode causar efeito duplicado.

**Implementação típica:**

- Tabela `processed_events` com chave única do evento externo
- Lookup antes de processar
- Retorno 200 mesmo em duplicata (sem reprocessar)

**PRDs explicitamente afetados:** 114 (Webhook WhatsApp), 122 (Provider DINTEC base), 123–128 (syncs DINTEC), 133 (PIX webhook), 137 (Refund), 141 (Email transacional).

### 4.8 Multi-tenant via `storeId` mantido

A Fase 1 modelou `storeId` em todas as entidades transacionais com apenas matriz operacional. A Fase 2 **mantém** esse contrato mesmo quando múltiplas lojas ainda não estão ativas.

**Implicação:** PRDs Fase 2 que criam tabelas novas (audit_log expandido, integration_logs, payment_attempts, etc.) **devem** carregar `storeId` se forem entidades transacionais. RLS por loja é parte do PRD-103.

### 4.9 LGPD desde o dia 1

A Fase 2 entra em operação real com clientes reais. LGPD não é uma feature de evolução futura — é requisito de produção desde a Onda 4.

**Áreas com tratamento LGPD obrigatório:**

- Consentimento granular ao cadastrar cliente (PRD-147)
- Portabilidade de dados via export estruturado (PRD-191)
- Direito ao esquecimento — soft delete com retenção configurável (PRD-191)
- PII redaction em logs e prompts LLM (PRD-160)
- Audit trail de acessos a dados sensíveis (PRD-191)

**PRD-191 (LGPD Avançado)** é P0 mesmo estando na Onda 13 — implementação mínima exigida desde a Onda 4 para go-live.

### 4.10 Observability obrigatória

Toda integração externa, toda mutation crítica e todo job em background deve ser **observável** desde o primeiro dia em produção:

- Logs estruturados (JSON) com `traceId`, `userId`, `storeId`, contexto
- Métricas APM (latência, error rate, throughput)
- Alertas para Owner em falhas críticas (rate > 5%, latency > p95 acordado)
- Dashboard de saúde de cada integração (Supabase, WhatsApp, DINTEC, PIX, LLM)

**PRD-110 (Monitoring)** é P1 mas decididamente operacional desde o início da Onda 4. Implementação parcial é tolerável; ausência total não.

---

## 5. Modelo de transição Fase 1 → Fase 2

### 5.1 Mapa de stubs e implementações reais

Tabela consolidada herdada do `DELTAS-PRDs-Gallo-Base-Diesel.md` §4, expandida com PRDs Fase 2 responsáveis pela substituição:

| Stub Fase 1                                                                                                 | PRD origem    | PRD Fase 2 que substitui                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `searchPartsByApplication`, `findByOemCode`, `getEquivalents`, `findByAlternativeCode`, `searchPartsByText` | PRD-021       | **PRD-030 Fase 1** (já substituído internamente)                             |
| `generateSdrQuote`                                                                                          | PRD-022       | **PRD-031 Fase 1** (já substituído internamente)                             |
| `stubCreateOrder` (aceite SDR)                                                                              | PRD-022       | **PRD-032 Fase 1** (já substituído internamente)                             |
| `stubCreateOrder` (conversão quote)                                                                         | PRD-031       | **PRD-032 Fase 1** (já substituído internamente)                             |
| `calculateShippingPlaceholder`, `calculateShipping`                                                         | PRDs 022, 031 | **PRD-033 Fase 1** (já substituído internamente)                             |
| `commissionPreview`                                                                                         | PRD-032       | **PRD-047 Fase 1** (substituído por `ICommission` real)                      |
| Margem mockada no cockpit                                                                                   | PRD-040       | **PRD-049 Fase 1** + **PRD-152 Fase 2** (LLM substitui heurística)           |
| **Hooks analíticos stub**                                                                                   | PRD-040       | **PRDs 041, 042, 044, 045, 046, 047, 048, 049, 050, 053** (todos Fase 1)     |
| **Envio WhatsApp simulado**                                                                                 | PRD-011       | **PRD-115 Fase 2** (envio real via Meta)                                     |
| **Recepção WhatsApp simulada**                                                                              | PRD-010       | **PRD-114 Fase 2** (webhook receiver)                                        |
| **Pagamentos simulados**                                                                                    | PRDs 032, 064 | **PRDs 131–140 Fase 2** (pagamentos reais)                                   |
| **NF placeholder**                                                                                          | PRD-032       | **PRD-127 + PRD-127B Fase 2** (Provider NFe Próprio + emissão NFE.io/eNotas) |
| **Importação CSV placeholder**                                                                              | PRD-030       | **PRD-129 Fase 2** (CSV real)                                                |
| **Notificações cliente placeholder**                                                                        | PRD-067       | **PRDs 141–150 Fase 2** (email + WhatsApp + push)                            |
| **Workflow de aprovação placeholder**                                                                       | PRD-071       | **PRD-161 Fase 2** (workflow real)                                           |
| **Faturamento corporativo placeholder**                                                                     | PRD-071       | **PRDs 162–164 Fase 2** (faturamento real)                                   |
| **Insights via heurística**                                                                                 | PRD-053       | **PRD-152 Fase 2** (LLM substitui)                                           |
| **SDR via templates simples**                                                                               | PRDs 020–024  | **PRD-153 Fase 2** (SDR conversacional via LLM)                              |
| **PWA esqueleto**                                                                                           | PRD-070       | **PRDs 171–180 Fase 2** (PWA completo)                                       |
| **Customização avançada storefront placeholder**                                                            | PRD-066       | (acelerado em onda futura — não é P0)                                        |

### 5.2 Estratégia de drop-in via `VITE_DATA_SOURCE`

O contrato definido no PRD-005 Fase 1 é o **único ponto de switch entre Mock e Real**:

```bash
# Desenvolvimento + demos
VITE_DATA_SOURCE=mock npm run dev

# Produção
VITE_DATA_SOURCE=supabase npm run build
```

**Regras:**

1. **Build time, não runtime** — o switch é resolvido no build do Vite. Não há mecanismo runtime para alternar.
2. **Sem flag intermediária** — `VITE_DATA_SOURCE=hybrid` ou similar **não existe**. Ou é mock ou é real.
3. **Persistência de mocks após Fase 2** — a pasta `src/mocks/` permanece no repositório indefinidamente. Bibliotecas como Storybook, ambientes de QA e demos para novos prospects continuam usando mocks.

### 5.3 Estratégia de migração paralela

Para minimizar risco e permitir validação incremental, a Fase 2 segue **migração em paralelo** com 3 ambientes:

| Ambiente            | `VITE_DATA_SOURCE`    | Usuários             | Propósito                            |
| ------------------- | --------------------- | -------------------- | ------------------------------------ |
| `gallo-demo.com`    | `mock`                | Vendas, prospects    | Demonstrações comerciais permanentes |
| `gallo-staging.com` | `supabase` (sandbox)  | Equipe interna GALLO | Validação pré-produção               |
| `gallo.app`         | `supabase` (produção) | Operação real        | Sistema vivo                         |

**Regra de promoção:** uma feature da Fase 2 só vai para produção depois de **2 semanas em staging** sem incidentes críticos. Cada PRD de Fase 2 inclui critério de aceitação para promoção.

### 5.4 Validação cliente entre ondas

Cada onda termina com um **gate de validação** com cliente GALLO:

- Demonstração das features da onda em ambiente de staging
- Lista de critérios de aceitação dos PRDs assinada
- Validação de orçamento operacional consumido vs estimado
- Decisão de avançar para próxima onda

**Nenhuma onda Fase 2 começa sem assinatura formal do cliente sobre a onda anterior.**

---

## 6. Extensões ao modelo conceitual

A Fase 2 introduz novos agregados e estende existentes. Esta seção consolida o que cada onda traz, em complemento ao `DELTAS-PRDs-Gallo-Base-Diesel.md` (que registra os deltas Fase 1).

### 6.1 Novos agregados Fase 2

| Agregado                  | Onda | PRD origem    | Propósito                                                    |
| ------------------------- | ---- | ------------- | ------------------------------------------------------------ |
| `ICredential`             | 4    | PRD-100       | Credenciais ofuscadas de providers externos                  |
| `IIntegrationLog`         | 4    | PRD-110       | Log estruturado de chamadas externas                         |
| `IRealtimeSubscription`   | 4    | PRD-105       | Tracking de subscriptions ativas                             |
| `IStorageAsset`           | 4    | PRD-106       | Metadata de mídias no Supabase Storage                       |
| `IUserSession`            | 4    | PRD-107       | Sessões Supabase Auth com custom claims                      |
| `IWhatsAppTemplate`       | 5    | PRD-116       | Templates HSM aprovados pela Meta                            |
| `IWhatsAppMediaAsset`     | 5    | PRD-115       | Mídias enviadas/recebidas via WhatsApp                       |
| `IIntegrationSyncRun`     | 6    | PRDs 123–128  | Cada execução de sync DINTEC                                 |
| `IConflictResolution`     | 6    | PRD-128       | Conflitos cross-system pendentes                             |
| `ILLMProvider`            | 9    | PRD-151B      | Configuração de provider LLM (chave, modelo, params)         |
| `ILLMOverride`            | 9    | PRD-151C      | Override por feature (feature → provider/modelo)             |
| `ILLMUsageMetrics`        | 9    | PRD-151D      | Métricas agregadas de consumo (período × feature × provider) |
| `INFEProvider`            | 6    | PRD-127       | Configuração de provider NFe (NFE.io / eNotas / PlugNotas)   |
| `INFEEmission`            | 6    | PRD-127B      | Cada emissão NFe (request + response + PDF + XML)            |
| `IDintecExportFile`       | 6    | PRDs 123, 126 | Arquivos CSV/XML trocados com DINTEC                         |
| `IDintecDBConnection`     | 6    | PRD-122       | Configuração da conexão direta ao banco DINTEC               |
| `IPaymentAttempt`         | 7    | PRDs 131–137  | Tentativa de pagamento (com webhook tracking)                |
| `IRefundOperation`        | 7    | PRD-137       | Refunds executados                                           |
| `IConciliationRecord`     | 7    | PRD-138       | Registros de conciliação financeira                          |
| `IFraudCheck`             | 7    | PRD-139       | Análises anti-fraude                                         |
| `INotificationDispatch`   | 8    | PRDs 141–150  | Cada notificação enviada (canal + status)                    |
| `INotificationPreference` | 8    | PRD-147       | Preferências de opt-in/opt-out por cliente                   |
| `IDripCampaign`           | 8    | PRD-148       | Campanhas automatizadas                                      |
| `IAbandonedCart`          | 8    | PRD-149       | Carrinhos abandonados rastreados                             |
| `ILLMRequest`             | 9    | PRD-151       | Cada chamada ao LLM (com cost tracking)                      |
| `ILLMEvaluation`          | 9    | PRD-160       | Resultados de eval harness                                   |
| `ISentimentAnalysis`      | 9    | PRD-154       | Análise de sentimento de conversas                           |
| `IActionSuggestion`       | 9    | PRD-155       | Sugestões IA inline em conversas                             |
| `IApprovalWorkflow`       | 10   | PRD-161       | Workflows B2B reais                                          |
| `ICreditAccount`          | 10   | PRD-162       | Conta-corrente B2B                                           |
| `IConsolidatedInvoice`    | 10   | PRD-164       | Fatura mensal corporativa                                    |
| `IContractPricing`        | 10   | PRD-165       | Preços por contrato B2B                                      |
| `ICustomerERPLink`        | 10   | PRD-168       | Vínculo cliente↔ERP do cliente                               |
| `IServiceWorkerCache`     | 11   | PRD-171       | Estado do cache offline                                      |
| `ISyncQueueItem`          | 11   | PRD-173       | Mutations offline na fila                                    |
| `IGeoCheckIn`             | 11   | PRD-175       | Check-ins geolocalizados                                     |
| `IDigitalSignature`       | 11   | PRD-177       | Assinaturas digitais coletadas                               |
| `IConsentRecord`          | 13   | PRD-191       | Consentimentos LGPD granulares                               |
| `IDataPortabilityRequest` | 13   | PRD-191       | Solicitações de portabilidade                                |
| `IForgetMeRequest`        | 13   | PRD-191       | Solicitações de esquecimento                                 |
| `IFeatureFlag`            | 13   | PRD-198       | Flags de feature toggle                                      |
| `IExperiment`             | 13   | PRD-197       | Experimentos A/B                                             |
| `IPublicAPIKey`           | 13   | PRD-199       | Chaves de API pública                                        |

### 6.2 Extensões a agregados existentes

Agregados da Fase 1 ganham campos novos na Fase 2:

| Agregado existente | PRD origem Fase 2  | Extensão                                                             |
| ------------------ | ------------------ | -------------------------------------------------------------------- |
| `IUser`            | PRD-107            | `supabaseUserId`, `customClaims`, `lastSession`                      |
| `IWhatsAppAccount` | PRD-118            | `realCredentials` (criptografadas), `webhookSecret`, `lastWebhookAt` |
| `IPart`            | PRDs 123, 124      | `dintecId`, `lastDintecSyncAt`, `dintecVersionHash`                  |
| `ICustomer`        | PRD-125            | `dintecId`, `consentRecords[]`, `lgpdStatus`                         |
| `IOrder`           | PRDs 126, 127, 133 | `dintecOrderId`, `nfNumber`, `nfChave`, `paymentAttemptId`           |
| `IMessage`         | PRDs 114, 115      | `metaMessageId`, `dispatchStatus`, `webhookEventIds[]`               |
| `IAuditLog`        | PRD-110            | `traceId`, `integrationContext`, `payloadHash`                       |
| `IInsight`         | PRD-152            | `llmModelUsed`, `llmCost`, `evaluationScore`                         |
| `IConversation`    | PRD-154            | `sentimentTrend`, `lastSentimentAt`                                  |
| `IPortalRequest`   | PRD-161            | `approvalWorkflowId`, `currentStep`                                  |

### 6.3 Schemas Supabase derivados

PRD-101 (Schema do banco) consolida o mapeamento dos tipos TypeScript da Fase 1 + extensões Fase 2 para tabelas SQL. Convenções fixas:

- **camelCase TypeScript** → **snake_case PostgreSQL** (mapeamento no provider)
- **Datas como `ISO8601` em TS** → **`timestamptz` em SQL**
- **IDs como `string` em TS** → **`uuid` em SQL**
- **Snapshots em items** → **colunas `jsonb`** com schema validado via constraint
- **Audit log** → tabela única `audit_logs` com `payload jsonb` + índices em `actor_id`, `entity_type`, `entity_id`, `created_at`
- **RLS habilitada em 100% das tabelas** sem exceção; policies espelham matriz do PRD-006

---

## 7. Índice expandido dos 100 PRDs

Legenda de profundidade: **D** = detalhado | **E** = esqueleto enxuto | **I** = integração (template específico para APIs externas).

Legenda de prioridade: **P0** = bloqueante para go-live | **P1** = alta | **P2** = média | **P3** = futuro.

### Onda 4 — Backend Supabase Real (PRDs 100–110)

| #   | Título                                 | Tipo       | Prof. | Prior. | Complexidade | Depende de                 |
| --- | -------------------------------------- | ---------- | ----- | ------ | ------------ | -------------------------- |
| 100 | Setup do projeto Supabase              | Integração | D     | P0     | Média        | —                          |
| 101 | Schema do banco (migrations + seeds)   | Feature    | D     | P0     | Alta         | 100, Fase 1: 002           |
| 102 | Edge Functions infraestrutura          | Feature    | D     | P0     | Média        | 101                        |
| 103 | RLS (Row Level Security)               | Feature    | D     | P0     | Crítica      | 101, Fase 1: 006           |
| 104 | Substituir Providers Mock por Supabase | Feature    | D     | P0     | Crítica      | 103, Fase 1: 005           |
| 105 | Realtime                               | Feature    | D     | P1     | Alta         | 104                        |
| 106 | Supabase Storage                       | Feature    | D     | P1     | Média        | 104                        |
| 107 | Supabase Auth com Custom Claims        | Integração | D     | P0     | Alta         | 103, Fase 1: 006, 065, 071 |
| 108 | Performance e Otimização               | Feature    | D     | P1     | Alta         | 104                        |
| 109 | Backup e Disaster Recovery             | Feature    | D     | P0     | Média        | 100                        |
| 110 | Monitoring e Observability             | Feature    | D     | P1     | Média        | 104                        |

### Onda 5 — WhatsApp Real (PRDs 111–120)

| #   | Título                      | Tipo       | Prof. | Prior. | Complexidade | Depende de       |
| --- | --------------------------- | ---------- | ----- | ------ | ------------ | ---------------- |
| 111 | Setup Meta Cloud API        | Integração | D     | P0     | Média        | 100              |
| 112 | Provider Meta Cloud API     | Integração | D     | P0     | Alta         | 111, 104         |
| 113 | Provider Evolution API      | Integração | D     | P1     | Alta         | 112              |
| 114 | Webhook Receiver            | Integração | D     | P0     | Alta         | 112, 102         |
| 115 | Envio de Mensagens (UI)     | Feature    | D     | P0     | Média        | 114, Fase 1: 011 |
| 116 | Templates HSM Management    | Feature    | D     | P1     | Média        | 114              |
| 117 | Session Management 24h      | Feature    | D     | P1     | Média        | 115, 116         |
| 118 | Múltiplas Contas WhatsApp   | Feature    | D     | P1     | Média        | 114, Fase 1: 019 |
| 119 | Status Sync e Read Receipts | Feature    | E     | P2     | Baixa        | 114, 105         |
| 120 | Migração de Stubs WhatsApp  | Feature    | D     | P0     | Média        | 111–119          |

### Onda 6 — Integração DINTEC ERP + NFe Própria (PRDs 121–131)

> **⚠️ Nota crítica (27/05/2026):** descobriu-se que **DINTEC não expõe API**. Onda 6 foi **re-estruturada** para integração via banco direto (SQL read-only) + watchers de export CSV + emissor NFe próprio (NFE.io / eNotas / PlugNotas). PRD-127 mudou de papel; PRD-127B foi inserido para emissão NFe.

| #    | Título                                                           | Tipo       | Prof. | Prior. | Complexidade | Depende de       |
| ---- | ---------------------------------------------------------------- | ---------- | ----- | ------ | ------------ | ---------------- |
| 121  | Discovery DINTEC (sem API — banco, exports, workflow fiscal)     | Integração | D     | P0     | Alta         | —                |
| 122  | Provider DINTEC base (DB connector read-only + file watcher)     | Integração | D     | P0     | Crítica      | 121, 102         |
| 123  | Sync de Catálogo (leitura direta no banco DINTEC)                | Feature    | D     | P0     | Alta         | 122, Fase 1: 030 |
| 124  | Sync de Estoque (view SQL near real-time)                        | Feature    | D     | P0     | Alta         | 122, Fase 1: 030 |
| 125  | Sync de Clientes (read DINTEC + escrita só GALLO — ilha parcial) | Feature    | D     | P1     | Média        | 122, Fase 1: 012 |
| 126  | Export de Pedidos (CSV/XML para DINTEC consumir)                 | Feature    | D     | P0     | Alta         | 122, Fase 1: 032 |
| 127  | Provider NFe Próprio (abstração NFE.io / eNotas / PlugNotas)     | Integração | D     | P0     | Alta         | 102, 104         |
| 127B | Emissão NFe via Provider (substitui placeholder PRD-032)         | Feature    | D     | P0     | Alta         | 127, 126, 106    |
| 128  | Conflict Resolution Cross-System                                 | Feature    | D     | P1     | Alta         | 123–127B         |
| 129  | Importação CSV Robusta (promovido a P0 — primário, não fallback) | Feature    | D     | P0     | Média        | 123              |
| 130  | Audit Cross-System                                               | Feature    | D     | P1     | Média        | 123–128          |

### Onda 7 — Pagamentos (PRDs 131–140)

> **Decisão 27/05/2026:** dois gateways selecionáveis via painel admin — **Asaas + Mercado Pago**.

| #    | Título                                        | Tipo       | Prof. | Prior. | Complexidade | Depende de             |
| ---- | --------------------------------------------- | ---------- | ----- | ------ | ------------ | ---------------------- |
| 131  | Provider Asaas (PIX + boleto + cartão)        | Integração | D     | P0     | Alta         | 104                    |
| 131B | Provider Mercado Pago (PIX + boleto + cartão) | Integração | D     | P0     | Alta         | 104                    |
| 132  | PIX QR Code Dinâmico (multi-provider)         | Feature    | D     | P0     | Média        | 131, 131B, Fase 1: 064 |
| 133  | PIX Webhook (Confirmação multi-provider)      | Integração | D     | P0     | Alta         | 132                    |
| 134  | Boleto Bancário (multi-provider)              | Integração | D     | P1     | Média        | 131, 131B              |
| 135  | Cartão de Crédito (multi-provider)            | Integração | D     | P1     | Alta         | 131, 131B              |
| 136  | Parcelamento                                  | Feature    | D     | P1     | Alta         | 134, 135               |
| 137  | Refund Automático (multi-provider)            | Feature    | D     | P1     | Alta         | 132, 134, 135          |
| 138  | Conciliação Financeira                        | Feature    | D     | P1     | Alta         | 132–137                |
| 139  | Anti-Fraude Básico                            | Feature    | E     | P2     | Média        | 135                    |
| 140  | Migração de Stubs Pagamento                   | Feature    | D     | P0     | Média        | 131–138                |

### Onda 8 — Notificações Reais (PRDs 141–150)

| #   | Título                                   | Tipo       | Prof. | Prior. | Complexidade | Depende de       |
| --- | ---------------------------------------- | ---------- | ----- | ------ | ------------ | ---------------- |
| 141 | Email Transacional                       | Integração | D     | P0     | Média        | 104              |
| 142 | Templates Email                          | Feature    | D     | P1     | Média        | 141              |
| 143 | WhatsApp Transacional via HSM            | Feature    | D     | P0     | Média        | 116, Fase 1: 067 |
| 144 | SMS (Fallback)                           | Integração | E     | P3     | Baixa        | 104              |
| 145 | Push Notifications Web                   | Feature    | E     | P2     | Média        | 104, Fase 1: 070 |
| 146 | Notification Center                      | Feature    | D     | P1     | Média        | 141, 143         |
| 147 | Preferências do Cliente (Opt-in/Opt-out) | Feature    | D     | P0     | Média        | 141, 143         |
| 148 | Drip Campaigns                           | Feature    | D     | P2     | Alta         | 142, 143         |
| 149 | Carrinho Abandonado                      | Feature    | D     | P1     | Média        | Fase 1: 064, 148 |
| 150 | Migração de Stubs Notificações           | Feature    | D     | P0     | Média        | 141–149          |

### Onda 9 — LLM / IA Real (PRDs 151–160)

> **Decisão 27/05/2026:** três providers LLM selecionáveis em paralelo — **OpenAI + Anthropic + OpenRouter**. PRDs 151B, 151C e 151D inseridos com base em referência visual do projeto Dermatobel (prints 27/05).

| #    | Título                                                      | Tipo       | Prof. | Prior. | Complexidade | Depende de                 |
| ---- | ----------------------------------------------------------- | ---------- | ----- | ------ | ------------ | -------------------------- |
| 151  | LLM Gateway (3 providers: OpenAI, Anthropic, OpenRouter)    | Integração | D     | P0     | Alta         | 102                        |
| 151B | Painel de Configuração de Providers LLM                     | Feature    | D     | P0     | Média        | 151                        |
| 151C | Sistema de Override por Feature                             | Feature    | D     | P0     | Média        | 151, 151B                  |
| 151D | Dashboard de Monitoramento de IA (tokens, custos, latência) | Feature    | D     | P0     | Média        | 151, 151B                  |
| 152  | Insights via LLM (substitui heurísticas PRD-053)            | Feature    | D     | P1     | Crítica      | 151, 151C, Fase 1: 053     |
| 153  | SDR Avançado com LLM                                        | Feature    | D     | P0     | Crítica      | 151, 151C, Fase 1: 020–024 |
| 154  | Análise de Sentimento                                       | Feature    | D     | P2     | Alta         | 151, 151C, Fase 1: 051     |
| 155  | Sugestões de Ação Contextualizadas                          | Feature    | D     | P2     | Alta         | 151, 151C                  |
| 156  | Relatórios Narrativos                                       | Feature    | E     | P3     | Alta         | 151, Fase 1: 040           |
| 157  | Assistente IA dentro do App                                 | Feature    | E     | P3     | Alta         | 151                        |
| 158  | Classificação Automática de Tópicos                         | Feature    | E     | P3     | Média        | 151                        |
| 159  | Forecast com ML                                             | Feature    | E     | P3     | Crítica      | 104                        |
| 160  | Safety, Guardrails e Anti-Bias                              | Feature    | D     | P0     | Crítica      | 151                        |

**Sobre PRDs 151B/C/D — referência visual Dermatobel:**

- **PRD-151B (Painel de Configuração):** espelha o print "Provedores de IA" — cards por provider com chave de API ofuscada, modelo padrão, parâmetros de geração (temperature, max_tokens), kill switch global, taxa de conversão USD→BRL, teste de conexão, rotação de chave, status "configurado/não configurado".
- **PRD-151C (Override por Feature):** espelha o print "Overrides por Feature" — listagem das features consumidoras de LLM (Chatbot, Insights, OCR de Receitas, Resumo Quiz, SDR, etc.), botão "+ Adicionar override" para rotear feature específica para provider/modelo diferente do default. Banner "Features conhecidas sem override" no rodapé.
- **PRD-151D (Dashboard de Monitoramento):** espelha os prints "Monitoramento de IA" (Consolidado + Por Provedor) — KPIs (total de chamadas, tokens, custo BRL, latência média, taxa de erro), filtros (período, feature, provedor), gráfico histórico semanal por provedor, tabela de consumo por feature (chamadas, tokens, custo, sucesso%), exportar CSV.

### Onda 10 — B2B Corporativo Funcional (PRDs 161–170)

| #   | Título                                | Tipo       | Prof. | Prior. | Complexidade | Depende de       |
| --- | ------------------------------------- | ---------- | ----- | ------ | ------------ | ---------------- |
| 161 | Workflow de Aprovação Real            | Feature    | D     | P0     | Alta         | Fase 1: 071, 143 |
| 162 | Faturamento Corporativo               | Feature    | D     | P0     | Crítica      | Fase 1: 071, 138 |
| 163 | Parcelamento Estendido B2B (30/60/90) | Feature    | D     | P1     | Alta         | 162              |
| 164 | NF Corporativa + Faturamento Mensal   | Feature    | D     | P1     | Alta         | 127, 163         |
| 165 | Catálogo Personalizado por Contrato   | Feature    | D     | P1     | Alta         | Fase 1: 071, 030 |
| 166 | Comissões Avançadas                   | Feature    | D     | P2     | Alta         | Fase 1: 047      |
| 167 | Convite Real de Usuários do Portal    | Feature    | D     | P1     | Média        | Fase 1: 071, 141 |
| 168 | Integração ERP do Cliente             | Integração | E     | P3     | Crítica      | 199              |
| 169 | Marketplace Privado B2B               | Feature    | E     | P3     | Crítica      | Fase 1: 071      |
| 170 | Reports Customizados B2B              | Feature    | E     | P2     | Média        | Fase 1: 071      |

### Onda 11 — PWA Offline-First (PRDs 171–180)

| #   | Título                      | Tipo    | Prof. | Prior. | Complexidade | Depende de       |
| --- | --------------------------- | ------- | ----- | ------ | ------------ | ---------------- |
| 171 | Service Worker Completo     | Feature | D     | P1     | Alta         | Fase 1: 070      |
| 172 | IndexedDB Cache Local       | Feature | D     | P1     | Alta         | 171              |
| 173 | Sync Queue Offline          | Feature | D     | P1     | Crítica      | 171, 172         |
| 174 | Conflict Resolution Offline | Feature | D     | P1     | Crítica      | 173              |
| 175 | GPS e Localização           | Feature | E     | P2     | Média        | Fase 1: 070      |
| 176 | Captura de Foto             | Feature | E     | P2     | Média        | 106              |
| 177 | Assinatura Digital          | Feature | E     | P2     | Média        | Fase 1: 070      |
| 178 | Push Notifications Mobile   | Feature | E     | P2     | Média        | 145, Fase 1: 070 |
| 179 | Voice Notes em Conversas    | Feature | E     | P3     | Alta         | 115, 153         |
| 180 | Migração Completa PRD-070   | Feature | D     | P1     | Média        | 171–179          |

### Onda 12 — Multi-loja + Equipes Ativas (PRDs 181–190)

| #   | Título                            | Tipo    | Prof. | Prior. | Complexidade | Depende de            |
| --- | --------------------------------- | ------- | ----- | ------ | ------------ | --------------------- |
| 181 | Segunda Loja Ativa                | Feature | D     | P2     | Alta         | Fase 1: 007           |
| 182 | Roteamento Entre Lojas            | Feature | D     | P2     | Alta         | 181                   |
| 183 | Estoque Cross-Loja                | Feature | D     | P2     | Alta         | 181, 124              |
| 184 | Equipes Ativas (CRUD)             | Feature | D     | P2     | Média        | Fase 1: 019           |
| 185 | Metas por Equipe                  | Feature | D     | P2     | Alta         | Fase 1: 042, 184      |
| 186 | Comissões com Split por Equipe    | Feature | D     | P2     | Alta         | Fase 1: 047, 184      |
| 187 | Cobertura por Equipe              | Feature | D     | P2     | Alta         | Fase 1: 013, 184      |
| 188 | Cross-Store BI Consolidado        | Feature | D     | P1     | Alta         | 181, Fase 1: 040      |
| 189 | Permissões Cross-Store Granulares | Feature | D     | P1     | Alta         | Fase 1: 006, 103, 181 |
| 190 | Vendedor Externo Ativado          | Feature | D     | P2     | Média        | Fase 1: 070, 180      |

### Onda 13 — Compliance + ML Avançado (PRDs 191–200)

| #   | Título                                   | Tipo       | Prof. | Prior. | Complexidade | Depende de |
| --- | ---------------------------------------- | ---------- | ----- | ------ | ------------ | ---------- |
| 191 | LGPD Avançado                            | Feature    | D     | P0     | Crítica      | 147        |
| 192 | Auditoria SOC2                           | Feature    | E     | P3     | Crítica      | 110, 103   |
| 193 | ISO 27001 Placeholder                    | Feature    | E     | P3     | Crítica      | 192        |
| 194 | BI Predictivo (Churn, Demanda)           | Feature    | E     | P3     | Crítica      | 159        |
| 195 | Recomendações de IA (Cross-sell, Upsell) | Feature    | E     | P3     | Alta         | 151        |
| 196 | Cohort Analysis                          | Feature    | E     | P3     | Média        | 104        |
| 197 | A/B Testing Infrastructure               | Feature    | E     | P3     | Alta         | 198        |
| 198 | Feature Flags                            | Feature    | D     | P2     | Média        | 104        |
| 199 | API Pública                              | Integração | D     | P3     | Crítica      | 104, 103   |
| 200 | Marketplace de Integrações               | Feature    | E     | P3     | Crítica      | 199        |

### 7.1 Resumo do índice

| Visão                          | Quantidade |
| ------------------------------ | ---------- |
| **Total PRDs Fase 2**          | 105        |
| **Detalhados (D)**             | 79         |
| **Esqueletos (E)**             | 26         |
| **Integrações (I/Integração)** | 21         |
| **P0 (bloqueante go-live)**    | 31         |
| **P1 (alta)**                  | 30         |
| **P2 (média)**                 | 21         |
| **P3 (futuro)**                | 23         |

---

## 8. Lotes recomendados de escrita

Análogo aos 8 lotes da Fase 1, a Fase 2 organiza-se em **10 lotes** (um por onda) para escrita dos PRDs. Cada lote é uma sessão de trabalho focado.

### 8.1 Lotes e estimativas

| Lote | Onda                 | PRDs    | Quant.  | Estimativa turnos | Sub-lotes                                                         |
| ---- | -------------------- | ------- | ------- | ----------------- | ----------------------------------------------------------------- |
| 1    | 4 — Supabase Backend | 100–110 | 11      | 4–5               | (100,101,102), (103,104,105), (106,107), (108,109,110)            |
| 2    | 5 — WhatsApp         | 111–120 | 10      | 4                 | (111,112,113), (114,115,116), (117,118), (119,120)                |
| 3    | 6 — DINTEC + NFe     | 121–131 | 11      | 5                 | (121,122), (123,124,125), (126,127,127B), (128,129,130)           |
| 4    | 7 — Pagamentos       | 131–140 | 11      | 4                 | (131,131B,132), (133,134,135), (136,137,138), (139,140)           |
| 5    | 8 — Notificações     | 141–150 | 10      | 3–4               | (141,142,143), (144,145,146), (147,148), (149,150)                |
| 6    | 9 — LLM/IA           | 151–160 | 13      | 5                 | (151,151B,151C,151D), (160,152,153), (154,155,156), (157,158,159) |
| 7    | 10 — B2B             | 161–170 | 10      | 4                 | (161,162,163), (164,165), (166,167), (168,169,170)                |
| 8    | 11 — PWA             | 171–180 | 10      | 3–4               | (171,172,173,174), (175,176,177), (178,179,180)                   |
| 9    | 12 — Multi-loja      | 181–190 | 10      | 3                 | (181,182,183), (184,185,186,187), (188,189,190)                   |
| 10   | 13 — Compliance      | 191–200 | 10      | 3                 | (191,192,193), (194,195,196), (197,198,199,200)                   |
|      | **Total**            |         | **105** | **38–42**         |                                                                   |

**Distribuição sugerida em sessões:**

- **Sessão A:** Lotes 1, 2 (Onda 4 + 5) — 21 PRDs em 8–9 turnos
- **Sessão B:** Lotes 3, 4 (Onda 6 + 7) — 20 PRDs em 8–9 turnos
- **Sessão C:** Lotes 5, 6 (Onda 8 + 9) — 20 PRDs em 7–8 turnos
- **Sessão D:** Lotes 7, 8 (Onda 10 + 11) — 20 PRDs em 7–8 turnos
- **Sessão E:** Lotes 9, 10 (Onda 12 + 13) — 20 PRDs em 6 turnos

### 8.2 Prompt sugerido para abrir a próxima sessão

```
Olá Claude. Vou anexar como contexto:

1. briefing-execucao-prds-fase2.md v1.0 (este documento)
2. INDEX-PRDs-Gallo-Base-Diesel-fase2.md v1.0
3. ROADMAP-FASE2-Gallo-Base-Diesel.md v1.0 (referência histórica)
4. DELTAS-PRDs-Gallo-Base-Diesel.md v1.1 (deltas Fase 1)
5. Os 50 PRDs Fase 1 (.md no project knowledge)
6. guia-prd.md v1.4 + templates

Quero que você escreva os PRDs Fase 2 seguindo a ordem do Lote N
(Onda Y — Tema Z), respeitando:

- A profundidade indicada por PRD (D / E / I)
- Os princípios arquiteturais da Seção 4 do briefing fase2
- O modelo de transição da Seção 5
- O índice expandido da Seção 7
- As convenções de estilo da Seção 9
- O GuiaPRD v1.4 + template de integração para PRDs externos

Comece pelo PRD-N00 (Setup/Provider/etc da onda). Após cada PRD,
apresente o arquivo pronto e aguarde minha confirmação antes de
seguir para o próximo. Se tiver dúvidas de escopo, pergunte antes
de escrever.

Eu sou o Arquiteto. Você está executando o papel do GuiaPRD
de "Agente Arquiteto" produzindo PRDs para o Agente Desenvolvedor
(Claude Code CLI) implementar depois.
```

### 8.3 Checklist antes de iniciar cada lote

- [ ] Releitura rápida da Seção 4 (princípios arquiteturais)
- [ ] Releitura da Seção 5 (modelo de transição)
- [ ] Releitura da Seção 6 (extensões ao modelo conceitual relevantes ao lote)
- [ ] Verificar dependências do lote no índice (Seção 7)
- [ ] Confirmar profundidade alvo (D vs E vs I)
- [ ] Identificar PRDs Fase 1 que serão consumidos/estendidos
- [ ] Identificar stubs a substituir (Seção 5.1)
- [ ] Aplicar convenções da Seção 9 + GuiaPRD v1.4

### 8.4 Critérios de pronto de cada PRD

- [ ] Cabeçalho completo com Informações Gerais
- [ ] Todas as seções obrigatórias do GuiaPRD v1.4
- [ ] **Para PRDs de integração:** seção específica sobre provider externo, credenciais, rate limiting, fallback, retry, idempotência (template `template-prd-integration.md`)
- [ ] **Para PRDs que substituem stubs:** lista explícita dos stubs Fase 1 substituídos e validação de interface estável
- [ ] **Para PRDs que criam tabelas Supabase:** seção de schema com nomes em snake_case + RLS policies espelhando matriz do PRD-006
- [ ] **Para PRDs com webhooks:** seção de idempotência + audit log estruturado
- [ ] Notas para o Agente Desenvolvedor (Seção 7 do GuiaPRD) presentes e completas
- [ ] Status de Implementação como `⏳ PENDENTE` no rodapé
- [ ] Referências cruzadas a outros PRDs sempre por número (PRD-NNN)
- [ ] Modelo conceitual respeitado (sem inventar entidades novas que não estão na Seção 6 deste briefing)
- [ ] Identidade visual GALLO respeitada (preservada da Fase 1)

---

## 9. Convenções de estilo

### 9.1 GuiaPRD v1.4 como base

Toda a estrutura segue o `guia-prd.md` v1.4. Estrutura mínima:

1. Informações Gerais (tabela)
2. Critérios de Complexidade
3. Contexto do Problema
4. Conceito da Solução (As-Is, To-Be, Alternativas)
5. Escopo (Incluído + Excluído)
6. Requisitos Funcionais (RF-NNN)
7. Requisitos Não-Funcionais
8. Critérios de Aceitação (Gherkin)
9. Fases de Implementação
10. Dependências (PRDs, libs, decisões pendentes)
11. Cadeia de PRDs
12. Considerações de Segurança
13. Fluxos de Usuário
14. Convenções de Código
15. **Notas para o Agente Desenvolvedor** (Seção 7 do GuiaPRD — obrigatória)
16. Status de Implementação (rodapé)
17. Histórico

### 9.2 Decisões específicas Fase 2

#### 9.2.1 Template de integração predominante

PRDs marcados com tipo **Integração** seguem `template-prd-integration.md`, que adiciona seções obrigatórias sobre:

- **Provider externo:** nome, fornecedor, contato comercial, SLA contratado
- **Credenciais:** estratégia de armazenamento (Vault, env vars criptografadas), rotação
- **Rate limiting:** limites do provider, estratégia de backoff
- **Fallback:** comportamento quando provider está fora
- **Retry:** política de retentativas, exponential backoff
- **Idempotência:** chave de idempotência, deduplicação
- **Webhook (quando aplicável):** validação de assinatura, IPs whitelisted, payload schema
- **Custos operacionais:** modelo de pricing, estimativa mensal
- **Compliance:** LGPD, PCI-DSS (pagamentos), retenção de dados

#### 9.2.2 Sufixo `_DONE` preservado

Convenção da Fase 1 mantida: ao implementar um PRD, Claude Code CLI renomeia o arquivo de `PRD-NNN-nome.md` para `PRD-NNN-nome_DONE.md`. Documentação e implementação ficam sincronizadas via convenção de arquivo.

#### 9.2.3 Numeração em milhares por onda

Embora a faixa global seja 100–200, os blocos por onda começam em múltiplos de 10 (100, 111, 121, 131, 141, 151, 161, 171, 181, 191). Isso permite **futuras inserções intra-onda** sem renumeração (ex: PRD-105B se decidir adicionar Realtime avançado depois de PRD-105 sem deslocar 106).

#### 9.2.4 Linguagem

- **Português brasileiro** em toda a documentação
- **Inglês técnico** para nomes de variáveis, funções, tabelas, eventos, providers
- **Camel case** em TS; **snake case** em PostgreSQL; **kebab case** em URLs/rotas/arquivos

#### 9.2.5 Identidade visual preservada

A identidade visual GALLO definida na Fase 1 (PRD-001) **não muda** na Fase 2. PRDs Fase 2 não redefinem cores, fontes, temas ou tokens. Quando relevante, referenciam PRD-001 Fase 1.

#### 9.2.6 SemVer com codinomes

Versionamento SemVer com codinomes em inglês para releases MINOR e MAJOR. Continuação da sequência Fase 1:

- v1.0.0 — **Heavy** (MVP Fase 1 completo)
- v2.0.0 — **Engine** (Onda 4 — backend real)
- v2.1.0 — **Bridge** (Onda 5 — WhatsApp real)
- v2.2.0 — **Sync** (Onda 6 — DINTEC integrado)
- v2.3.0 — **Cash** (Onda 7 — pagamentos)
- v2.4.0 — **Reach** (Onda 8 — notificações)
- v3.0.0 — **Brain** (Onda 9 — LLM real, salto major)
- v3.1.0 — **Crown** (Onda 10 — B2B funcional)
- v3.2.0 — **Field** (Onda 11 — PWA real)
- v3.3.0 — **Network** (Onda 12 — multi-loja)
- v4.0.0 — **Compliance** (Onda 13 — produção endurecida)

---

## 10. Orçamento operacional estimado

Custos recorrentes mensais por onda (R$, estimativa conservadora para volume MVP–pequeno):

| Onda | Componente                                                               | Custo mensal estimado                                    |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| 4    | Supabase (Pro plan + storage)                                            | R$ 500 – 1.500                                           |
| 4    | Monitoring (Sentry, Logtail)                                             | R$ 200 – 500                                             |
| 5    | WhatsApp Meta Cloud API (conversas)                                      | R$ 800 – 3.000                                           |
| 5    | Evolution API (servidor próprio)                                         | R$ 150 – 400                                             |
| 6    | **DINTEC — acesso ao banco** (negociar com cliente, possível custo zero) | R$ 0 – 500                                               |
| 6    | **NFe (NFE.io / eNotas / PlugNotas)**                                    | R$ 0,30 – 0,50 por NFe (≈ R$ 150 – 250/mês para 500 NFs) |
| 7    | **Asaas** (gateway PIX/boleto/cartão)                                    | 0,99% – 4,99% por transação                              |
| 7    | **Mercado Pago** (gateway PIX/boleto/cartão)                             | 0,99% – 4,98% por transação                              |
| 7    | Antifraude básico                                                        | R$ 0,30 – 1,00 por análise                               |
| 8    | **Email transacional (Resend)**                                          | R$ 100 – 400                                             |
| 8    | SMS (Twilio)                                                             | R$ 0,10 – 0,30 por SMS                                   |
| 9    | **OpenAI** (gpt-4o-mini default + gpt-4o para premium)                   | R$ 800 – 3.000                                           |
| 9    | **Anthropic Claude** (Sonnet/Opus para tarefas críticas)                 | R$ 1.500 – 6.000                                         |
| 9    | **OpenRouter** (fallback + modelos alternativos)                         | R$ 300 – 1.500                                           |
| 11   | Push notifications (FCM/APNs)                                            | R$ 0 (grátis até volumes altos)                          |
| 13   | Pen-test anual (LGPD/SOC2 prep)                                          | R$ 15.000 – 40.000/ano                                   |

**Total mensal estimado pós-Onda 4:** R$ 800 – 2.500 (sistema mínimo)
**Total mensal estimado pós-Onda 9:** R$ 5.500 – 20.000 (com 3 LLMs em produção, WhatsApp e NFe em volume)

**Estratégia de redução de custo LLM:** override por feature (PRD-151C) permite alocar modelo barato (gpt-4o-mini) em features de alto volume (chatbot, classificação) e modelo premium (Claude Sonnet/Opus) só em tarefas críticas (insights estratégicos, SDR de alto valor). Estimativa: redução de 40–60% no custo total LLM.

---

## 11. Cronograma macro Fase 2

```
                       ┌─────── ANO 1 ───────┐  ┌─────── ANO 2 ───────┐
                       │                      │  │                      │
Mês 1-3   ── Onda 4 (Backend Supabase) ─────▶ Gate cliente
Mês 4-5   ── Onda 5 (WhatsApp Real)   ──────▶ Gate cliente
Mês 6-9   ── Onda 6 (DINTEC + NFe própria) ─▶ Gate cliente  ┃  (+3-4 sem vs original — DINTEC sem API)
Mês 9-11  ── Onda 7 (Pagamentos)      ──────▶ Gate cliente  ┃ GO-LIVE
Mês 11-12 ── Onda 8 (Notificações)    ──────▶ Gate cliente  ┃ POSSÍVEL
                                                              ┃ pós-Onda 8
Mês 12-15 ── Onda 9 (LLM/IA real)     ──────▶ Gate cliente   (+2 sem vs original — 3 providers + dashboards)
Mês 15-17 ── Onda 10 (B2B funcional)  ──────▶ Gate cliente
Mês 17-19 ── Onda 11 (PWA real)       ──────▶ Gate cliente
Mês 19-20 ── Onda 12 (Multi-loja)     ──────▶ Gate cliente
Mês 20-24 ── Onda 13 (Compliance+ML)  ──────▶ MVP Fase 2 completo
```

**Marcos críticos:**

- **Mês 3:** v2.0.0 Engine — backend real opera. Sistema sai do mock para staging.
- **Mês 5:** v2.1.0 Bridge — WhatsApp produção. Vendedores enviam mensagens reais.
- **Mês 8:** v2.2.0 Sync — DINTEC integrado. Catálogo/estoque/NF reais.
- **Mês 10:** v2.3.0 Cash — pagamentos PIX/cartão/boleto. **E-commerce sai do modo demo.**
- **Mês 11:** v2.4.0 Reach — notificações ativas. Sistema "fala" com cliente.
- **Mês 11 (potencial):** **Go-live cliente final.** Sistema funcional para operação real.
- **Mês 13:** v3.0.0 Brain — LLM substitui heurísticas. Salto qualitativo de IA.
- **Mês 22:** v4.0.0 Compliance — produção endurecida com LGPD/SOC2 prep.

**Paralelização possível:** Ondas 5, 6, 7 podem ser paralelas se houver squads dedicados. Ondas 9, 10, 11 também aceitam paralelismo após Onda 8 concluída.

---

## 12. Riscos e mitigações

| Risco                                                   | Probabilidade  | Impacto  | Mitigação                                                                                                                                                                                         |
| ------------------------------------------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DINTEC não tem API (RISCO MATERIALIZADO 27/05/2026)** | **Confirmado** | **Alto** | **Onda 6 re-estruturada: leitura direta no banco DINTEC + export CSV + emissor NFe próprio (NFE.io/eNotas/PlugNotas). PRD-127 mudou de papel, PRD-127B inserido. Onda estendida em 3–4 semanas.** |
| WhatsApp Meta rejeita templates HSM iniciais            | Alta           | Médio    | PRD-111 inclui templates de baixo risco; fallback para Evolution (PRD-113)                                                                                                                        |
| Custo LLM escala além do orçamentado                    | Alta           | Alto     | PRD-151D (Dashboard) + PRD-151C (override por feature) permitem alocar modelos baratos em features de alto volume; cache agressivo                                                                |
| Migração DINTEC corrompe catálogo                       | Baixa          | Crítico  | PRD-128 (Conflict Resolution) + backup automatizado pré-sync + rollback documentado                                                                                                               |
| **Mudança de schema do banco DINTEC quebra leitura**    | **Média**      | **Alto** | **PRD-122 inclui camada de mapeamento isolada; monitoring detecta mudanças; fallback para CSV (PRD-129)**                                                                                         |
| LGPD não atendida no go-live                            | Média          | Crítico  | PRD-191 (LGPD) é P0 mesmo na Onda 13; implementação mínima desde Onda 4                                                                                                                           |
| Drop-in replacement quebra silenciosamente              | Média          | Alto     | Testes E2E em cada PRD de migração (PRDs 120, 140, 150); promoção gradual com staging 2 semanas                                                                                                   |
| Cliente GALLO recusa avançar entre ondas                | Baixa          | Médio    | Gates de validação formais; entregáveis demonstráveis a cada onda; flexibilidade no roadmap                                                                                                       |
| Equipe perde contexto entre ondas                       | Média          | Médio    | Sessões de planejamento Fase 2 documentadas (este briefing); índice atualizado mensalmente                                                                                                        |
| Performance Supabase insuficiente para volume real      | Baixa          | Alto     | PRD-108 (Performance) é P1; load testing pré-go-live; provisão de upgrade de plano                                                                                                                |
| Dependência de provider externo (PIX, Meta, Anthropic)  | Alta           | Alto     | Provider Pattern permite troca; nunca depender de provider único em P0                                                                                                                            |

---

## 13. Apêndices

### 13.1 Glossário Fase 2

| Termo                                         | Significado                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Drop-in replacement**                       | Substituir implementação sem mudar interface; consumidores não percebem              |
| **HSM (Highly Structured Messages)**          | Templates WhatsApp pré-aprovados pela Meta para uso fora da janela 24h               |
| **Janela 24h**                                | Período no qual WhatsApp permite mensagens livres após interação do cliente          |
| **RLS (Row Level Security)**                  | Filtragem automática de linhas no PostgreSQL baseada em policies SQL                 |
| **Custom Claims**                             | Atributos arbitrários incluídos no JWT do Supabase Auth                              |
| **Edge Function**                             | Função serverless Deno executada no edge do Supabase                                 |
| **Realtime**                                  | Subscriptions WebSocket nativas do Supabase para mudanças em tabelas                 |
| **Webhook receiver**                          | Endpoint que recebe notificações de provider externo                                 |
| **Idempotência**                              | Propriedade de processar a mesma operação múltiplas vezes com mesmo resultado        |
| **Snapshot**                                  | Cópia congelada de dados no momento da criação (não muda se entidade-fonte mudar)    |
| **Sync incremental**                          | Sincronização apenas das mudanças desde último sync (vs sync full)                   |
| **Conflict resolution**                       | Estratégia para resolver divergências quando dois sistemas mudam o mesmo dado        |
| **Drip campaign**                             | Sequência automatizada de mensagens disparadas por evento ou tempo                   |
| **LLM Gateway**                               | Camada de abstração sobre múltiplos modelos de linguagem (Claude, GPT, etc.)         |
| **RAG (Retrieval-Augmented Generation)**      | Padrão de LLM com busca prévia em base de conhecimento                               |
| **PII (Personally Identifiable Information)** | Informação pessoal identificável (LGPD/GDPR)                                         |
| **Guardrail**                                 | Filtro de segurança/conformidade em outputs de LLM                                   |
| **Service Worker**                            | Script JavaScript que roda em background no navegador (PWA)                          |
| **IndexedDB**                                 | API de armazenamento estruturado no navegador para offline                           |
| **Sync queue**                                | Fila de mutations a sincronizar com servidor após reconexão                          |
| **Multi-tenant**                              | Arquitetura onde múltiplos clientes/lojas compartilham infraestrutura com isolamento |
| **Feature flag**                              | Toggle para ativar/desativar feature em runtime sem deploy                           |

### 13.2 Decisões tomadas (27/05/2026)

Após análise dos prints inspiracionais do projeto Dermatobel e validação do Arquiteto, as seguintes decisões foram fixadas:

1. **Provedores de pagamento:** **Asaas + Mercado Pago** integrados em paralelo. Seleção configurável por método e por loja via painel admin. Inspiração de UI: padrão de cards de provider com chave ofuscada + teste de conexão (referência: print Dermatobel "Provedores de IA").

2. **Provedor de email transacional:** **Resend** (fixo). Sem segundo provider no MVP.

3. **Provedores de LLM:** **OpenAI + Anthropic + OpenRouter** integrados em paralelo. Default global selecionável; **override por feature** disponível (PRD-151C); dashboard de monitoramento de tokens/custos/latência (PRD-151D); painel admin de configuração (PRD-151B). Inspiração de UI completa: prints Dermatobel anexados em 27/05.

4. **Provedor NFe:** **abstração com múltiplas implementações** — NFE.io / eNotas / PlugNotas. Seleção via painel admin (PRD-127). Inserido em resposta ao risco materializado de DINTEC sem API.

5. **DINTEC sem API:** **risco materializado**. Onda 6 re-estruturada — leitura direta no banco DINTEC (SQL read-only) + watcher de export CSV + emissor NFe próprio. PRD-127 mudou de papel ("NF via DINTEC" → "Provider NFe Próprio"); PRD-127B inserido para emissão.

### 13.3 Decisões ainda em aberto

- **Banco DINTEC — tipo e acesso:** SQL Server? Firebird? Acesso via VPN ao servidor cliente, espelhamento, ou export periódico? PRD-121 (Discovery) deve resolver na primeira semana da Onda 6.
- **Modelo padrão de cada provider LLM:** OpenAI gpt-4o-mini? Anthropic Claude Sonnet 4.7? OpenRouter qual rota default? Validar com cliente no kickoff da Onda 9.

### 13.3 Identidade preservada da Fase 1

Os seguintes elementos da Fase 1 permanecem **intocados** na Fase 2:

- **Nome do projeto:** GALLO BASE DIESEL
- **Submarcas:** PARTS, SERVICE, INDUSTRIAL
- **Paleta:** preto técnico `#404041`, dourado `#D2A809`, verde PARTS `#337648`, vermelho SERVICE `#C4151C`, amarelo INDUSTRIAL `#C79C2C`
- **Tipografia:** Saira Condensed (display), Inter (UI), JetBrains Mono (mono)
- **Sistema de temas:** 4 temas × 2 modos = 8 combinações (default: dark + diesel)
- **Stack tecnológica core:** React + Vite + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel
- **Metodologia documental:** AILA GuiaPRD v1.4
- **Convenções de código:** camelCase TS, kebab-case CSS, snake_case PostgreSQL

### 13.4 Princípios consolidados da Fase 1 que continuam válidos

Da Seção 7 do `DELTAS-PRDs-Gallo-Base-Diesel.md`:

- **7.1 Snapshots imutáveis** — preservados na Fase 2 (vide §4.2 deste briefing)
- **7.2 Audit log obrigatório** — promovido a primeira classe (vide §4.4)
- **7.3 Banners "Modo demonstração / Fase 2"** — removidos pelos PRDs de migração (120, 140, 150...) à medida que features ganham implementação real
- **7.4 Permissões granulares** — Vendedor permanece bloqueado nas mesmas 9 telas; novos bloqueios da Fase 2 (admin de integrações, configuração financeira real, audit cross-system) seguem mesmo padrão
- **7.5 Equipes dormentes** — saem da dormência na Onda 12 (PRDs 184–187)
- **7.6 Carteira 1:1 estrita** — preservada; PRDs B2B (Onda 10) respeitam mesmo modelo

### 13.5 Histórico de versões

| Versão | Data       | Mudanças                                                                                                                                                                                                                                                                                                             |
| ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0    | Maio/2026  | Criação inicial — consolidação da Fase 2 em 10 ondas, 100 PRDs, 10 lotes de escrita, princípios arquiteturais, modelo de transição                                                                                                                                                                                   |
| 1.1    | 27/05/2026 | Decisões tomadas: Asaas+Mercado Pago (gateways), Resend (email), OpenAI+Anthropic+OpenRouter (LLM). DINTEC sem API confirmado — Onda 6 re-estruturada (banco direto + CSV + emissor NFe próprio). +5 PRDs inseridos (127B, 131B, 151B, 151C, 151D) inspirados nos prints do projeto Dermatobel. Total: **105 PRDs**. |

---

**AILA — Sistemas Inteligentes**
_Frederico Westphalen / RS — Brasil_
