# Índice de PRDs — GALLO BASE DIESEL

> **Catálogo mestre do projeto**
> Versão: 1.0 — Maio/2026
> Mantido pelo Arquiteto: Edmilson Souza (AILA Sistemas Inteligentes)

---

## Informações do Projeto

| Campo                                | Valor                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**                          | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                            |
| **Cliente**                          | GALLO BASE DIESEL (rebranding de Turbo Diesel — distribuidora de peças pesadas em Frederico Westphalen/RS)                          |
| **Repositório**                      | _A definir após criação no Lovable_                                                                                                 |
| **Início do projeto**                | Maio/2026                                                                                                                           |
| **Briefing de execução**             | `briefing-execucao-prds.md` v1.1                                                                                                    |
| **Metodologia**                      | AILA GuiaPRD v1.4                                                                                                                   |
| **Estratégia de desenvolvimento**    | Frontend First — mockup navegável → validação cliente → backend real (Fase 2)                                                       |
| **Versão atual do app**              | v0.56.0 — codinome **Copilot**                                                                                                      |
| **Versão alvo MVP**                  | v1.0.0 — codinome **Heavy**                                                                                                         |
| **Total de PRDs planejados (MVP)**   | 50                                                                                                                                  |
| **PRDs redigidos**                   | 50 (todos os PRDs do MVP redigidos)                                                                                                 |
| **PRDs implementados**               | 35 (Bloco 0 completo · Bloco 1 completo · Bloco 2 completo · Bloco 3 completo · Bloco 4 ½ — 8/14 · PRD-009 Chime · PRD-025 Copilot) |
| **PRDs futuros (Fase 2, PRDs 100+)** | 8 (roadmap futuro)                                                                                                                  |

---

## Agentes do Workflow

| Agente                      | Modelo                        | Ambiente                   | Função                                                  |
| --------------------------- | ----------------------------- | -------------------------- | ------------------------------------------------------- |
| **Arquiteto**               | Claude Opus 4.7 (Anthropic)   | Plataforma Web (claude.ai) | Cria e mantém PRDs                                      |
| **Desenvolvedor (Lovable)** | Claude Opus 4.7 (via Lovable) | Lovable                    | Gera scaffold visual inicial (apenas PRD-001 e PRD-003) |
| **Desenvolvedor (CLI)**     | Claude Opus 4.7               | Claude Code CLI v2.1.3     | Implementa demais PRDs no clone local                   |

---

## Identidade Visual GALLO (referência rápida)

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

---

## Resumo de Status

### Documentação (PRDs redigidos)

| Status        | Quantidade | Percentual |
| ------------- | ---------- | ---------- |
| 📝 Redigido   | 50         | 100%       |
| ⏸ A redigir   | 0          | 0%         |
| **Total MVP** | **50**     | **100%**   |

### Implementação

| Status          | Quantidade | Percentual |
| --------------- | ---------- | ---------- |
| ✅ Implementado | 34         | 68%        |
| 🔄 Em Andamento | 0          | 0%         |
| ⏳ Pendente     | 16         | 32%        |
| ❌ Cancelado    | 0          | 0%         |
| **Total**       | **50**     | **100%**   |

### Distribuição por Implementação

| Implementação                    | Quantidade | Notas                                         |
| -------------------------------- | ---------- | --------------------------------------------- |
| 🟢 Lovable (scaffold visual)     | 2          | PRD-001 e PRD-003 — formam o scaffold inicial |
| 🔵 Claude Code CLI (clone local) | 48         | Demais PRDs, implementados sobre o scaffold   |

---

## Catálogo Completo dos PRDs

> **Legenda:** 📝 Redigido | ⏸ A redigir | ✅ Implementado | 🔄 Em Andamento | ⏳ Pendente | 🟢 Lovable | 🔵 Claude Code CLI | **D** Detalhado | **E** Esqueleto enxuto

### Bloco 0 — Fundação (PRDs 001–007)

Estabelece os pilares técnicos e visuais sobre os quais todo o resto se constrói. **Pré-requisito obrigatório** para qualquer outro bloco. Os PRDs 001 e 003 vão para o Lovable; demais para o Claude Code CLI.

| #   | Título                                                                                                 | Tipo    | Prof. | Impl. | Documento | Status | Depende de |
| --- | ------------------------------------------------------------------------------------------------------ | ------- | ----- | ----- | --------- | ------ | ---------- |
| 001 | [Identidade Visual GALLO e Design System Base](./PRD-001-identidade-visual-gallo-design-system.md)     | Feature | D     | 🟢    | 📝        | ✅     | —          |
| 002 | [Modelo Conceitual de Domínio e Glossário](./PRD-002-modelo-conceitual-glossario_DONE.md)              | Feature | D     | 🔵    | 📝        | ✅     | —          |
| 003 | [Shell do App, Navegação e Layouts Base](./PRD-003-shell-app-navegacao-layouts_DONE.md)                | Feature | D     | 🔵    | 📝        | ✅     | 001, 002   |
| 004 | [Geradores de Dados Fictícios e Camada de Mocks](./PRD-004-mocks-geradores-dados_DONE.md)              | Feature | D     | 🔵    | 📝        | ✅     | 002        |
| 005 | [Arquitetura de Provedores de Dados (Mock/Supabase)](./PRD-005-provider-pattern-mock-supabase_DONE.md) | Feature | D     | 🔵    | 📝        | ✅     | 004        |
| 006 | [Sistema de Roles, Permissões e Auditoria (visual)](./PRD-006-rbac-permissoes-auditoria_DONE.md)       | Feature | D     | 🔵    | 📝        | ✅     | 002, 003   |
| 007 | [Multi-Loja: Modelagem e Operação Cross-Store](./PRD-007-multistore_DONE.md)                           | Feature | D     | 🔵    | 📝        | ✅     | 002–006    |

### Épico de Notificações (PRDs 008–009)

Fundação invisível (008) + central de notificações e preferências (009). Inserido entre o Bloco 0 e o Bloco 1; alimenta toda a plataforma sem depender da Onda 8 (canais reais). Codinomes: **Herald** (008) e **Chime** (009).

| #   | Título                                                                                   | Tipo    | Prof. | Impl. | Documento | Status | Depende de |
| --- | ---------------------------------------------------------------------------------------- | ------- | ----- | ----- | --------- | ------ | ---------- |
| 008 | [Fundação de Notificações](./PRD-008-fundacao-notificacoes_DONE.md)                      | Feature | D     | 🔵    | 📝        | ✅     | Bloco 0    |
| 009 | [Notification Center e Preferências](./PRD-009-notification-center-preferencias_DONE.md) | Feature | D     | 🔵    | 📝        | ✅     | 008        |

### Bloco 1 — Central de Atendimento e CRM (PRDs 010–019)

O coração operacional do MVP. Inbox unificado, ficha do cliente, leads, veículos, carteira. Vai para o Claude Code CLI sobre o scaffold do Bloco 0. Corresponde à **Onda 1** da Proposta Comercial v2.

| #   | Título                                                                                       | Tipo    | Prof. | Impl. | Documento | Status | Depende de    |
| --- | -------------------------------------------------------------------------------------------- | ------- | ----- | ----- | --------- | ------ | ------------- |
| 010 | [Inbox Unificado e Lista de Conversas](./PRD-010-inbox-conversas_DONE.md)                    | Feature | D     | 🔵    | 📝        | ✅     | Bloco 0       |
| 011 | [Conversa com Histórico Multicanal](./PRD-011-conversa-multicanal_DONE.md)                   | Feature | D     | 🔵    | 📝        | ✅     | 010           |
| 012 | [Ficha Unificada do Cliente](./PRD-012-ficha-cliente_DONE.md)                                | Feature | D     | 🔵    | 📝        | ✅     | 011, 016      |
| 013 | [Regras de Distribuição e Roteamento](./PRD-013-distribuicao-roteamento_DONE.md)             | Feature | D     | 🔵    | 📝        | ✅     | 010           |
| 014 | [Painel do Gestor — Métricas e Saúde da Carteira](./PRD-014-painel-gestor_DONE.md)           | Feature | D     | 🔵    | 📝        | ✅     | 010, 011, 013 |
| 015 | [Lista Geral de Clientes (segmentações e ações em lote)](./PRD-015-lista-clientes_DONE.md)   | Feature | D     | 🔵    | 📝        | ✅     | 012           |
| 016 | [Veículos do Cliente](./PRD-016-veiculos_DONE.md)                                            | Feature | D     | 🔵    | 📝        | ✅     | 012           |
| 017 | [Pipeline de Leads (Kanban + Lista)](./PRD-017-pipeline-leads_DONE.md)                       | Feature | D     | 🔵    | 📝        | ✅     | 010, 012      |
| 018 | [Gestão de Carteira e Transferências](./PRD-018-carteira-transferencias_DONE.md)             | Feature | D     | 🔵    | 📝        | ✅     | 012, 015      |
| 019 | [Configurações Administrativas (esqueleto navegável)](./PRD-019-configuracoes-admin_DONE.md) | Feature | E     | 🔵    | 📝        | ✅     | 006, 007      |

### Bloco 2 — Agente SDR (PRDs 020–024)

Agente de IA que atende 24/7, identifica peças, qualifica leads e escala para humano. Onda 1 também (compõe o "Central + SDR" da Proposta v2).

| #   | Título                                                                                       | Tipo    | Prof. | Impl. | Documento | Status | Depende de |
| --- | -------------------------------------------------------------------------------------------- | ------- | ----- | ----- | --------- | ------ | ---------- |
| 020 | [Simulação de Conversa SDR ↔ Cliente](./PRD-020-simulacao-sdr_DONE.md)                       | Feature | D     | 🔵    | 📝        | ✅     | 011        |
| 021 | [Identificação de Peça (OEM, descrição, equivalência)](./PRD-021-identificacao-peca_DONE.md) | Feature | D     | 🔵    | 📝        | ✅     | 020, 030   |
| 022 | [Geração de Orçamento via SDR](./PRD-022-orcamento-sdr_DONE.md)                              | Feature | D     | 🔵    | 📝        | ✅     | 021, 031   |
| 023 | [Escalonamento para Vendedor com Resumo de Contexto](./PRD-023-escalonamento-sdr_DONE.md)    | Feature | D     | 🔵    | 📝        | ✅     | 020, 011   |
| 024 | [Painel de Configuração e Métricas do Agente](./PRD-024-painel-sdr_DONE.md)                  | Feature | D     | 🔵    | 📝        | ✅     | 020        |

### Bloco 3 — Comercial Operacional (PRDs 030–033)

Catálogo interno, orçamento, pedido e ciclo de vida comercial. Parte da Onda 1 (suporta SDR e CRM) e fundação para Onda 3 (e-commerce).

| #   | Título                                                                               | Tipo    | Prof. | Impl. | Documento | Status | Depende de |
| --- | ------------------------------------------------------------------------------------ | ------- | ----- | ----- | --------- | ------ | ---------- |
| 030 | [Catálogo de Produtos (visão comercial interna)](./PRD-030-catalogo-interno_DONE.md) | Feature | D     | 🔵    | 📝        | ✅     | Bloco 0    |
| 031 | [Orçamento (criação, edição, validade, conversão)](./PRD-031-orcamento_DONE.md)      | Feature | D     | 🔵    | 📝        | ✅     | 030, 012   |
| 032 | [Pedido (gestão, status, ciclo de vida)](./PRD-032-pedido_DONE.md)                   | Feature | D     | 🔵    | 📝        | ✅     | 031        |
| 033 | [Cálculo de Frete e Esqueleto Transportadoras](./PRD-033-frete_DONE.md)              | Feature | E     | 🔵    | 📝        | ✅     | 032        |

### Bloco 4 — Plataforma de Gestão e BI (PRDs 040–053)

Visão executiva, metas, gamificação, positivação, curva ABC, comissões, DRE, rentabilidade. **Onda 2** da Proposta Comercial v2.

| #   | Título                                                                           | Tipo    | Prof. | Impl. | Documento | Status | Depende de |
| --- | -------------------------------------------------------------------------------- | ------- | ----- | ----- | --------- | ------ | ---------- |
| 040 | [Visão Executiva (Home do Gestor)](./PRD-040-visao-executiva_DONE.md)            | Feature | D     | 🔵    | 📝        | ✅     | 041–049    |
| 041 | [Vendas (pipeline, vendedor, canal, categoria)](./PRD-041-vendas_DONE.md)        | Feature | D     | 🔵    | 📝        | ✅     | 032        |
| 042 | [Sistema de Metas (loja + individual; equipe dormente)](./PRD-042-metas_DONE.md) | Feature | D     | 🔵    | 📝        | ✅     | 041        |
| 043 | [Ranking de Vendedores e Gamificação](./PRD-043-ranking-gamificacao_DONE.md)     | Feature | D     | 🔵    | 📝        | ✅     | 042        |
| 044 | [Positivação de Clientes](./PRD-044-positivacao_DONE.md)                         | Feature | D     | 🔵    | 📝        | ✅     | 012, 041   |
| 045 | [Curva ABC de Clientes](./PRD-045-curva-abc_DONE.md)                             | Feature | D     | 🔵    | 📝        | ✅     | 041        |
| 046 | [Carteira Analítica com Drill-down](./PRD-046-carteira-analitica_DONE.md)        | Feature | D     | 🔵    | 📝        | ✅     | 044, 045   |
| 047 | [Comissões (cálculo, fechamento)](./PRD-047-comissoes_DONE.md)                   | Feature | D     | 🔵    | 📝        | ✅     | 041, 042   |
| 048 | [DRE Gerencial](./PRD-048-dre.md)                                                | Feature | E     | 🔵    | 📝        | ⏳     | 041        |
| 049 | [Rentabilidade por SKU / Cliente / Canal](./PRD-049-rentabilidade.md)            | Feature | E     | 🔵    | 📝        | ⏳     | 041        |
| 050 | [Estoque — Análise (esqueleto navegável)](./PRD-050-estoque-analise.md)          | Feature | E     | 🔵    | 📝        | ⏳     | 030        |
| 051 | [Atendimento — Análise (esqueleto navegável)](./PRD-051-atendimento-analise.md)  | Feature | E     | 🔵    | 📝        | ⏳     | 010, 011   |
| 052 | [Estoque — Movimentação (esqueleto)](./PRD-052-estoque-movimentacao_DONE.md)     | Feature | E     | 🔵    | 📝        | ✅     | 030, 032   |
| 053 | [IA Analítica e Insights Proativos](./PRD-053-ia-analitica-insights.md)          | Feature | D     | 🔵    | 📝        | ⏳     | 040–049    |

### Bloco 5 — E-commerce (PRDs 060–067)

Vitrine pública GALLO PARTS, busca avançada por OEM/aplicação, carrinho, checkout, conta do cliente, integração com Central. **Onda 3** da Proposta Comercial v2.

| #   | Título                                                                                   | Tipo    | Prof. | Impl. | Documento | Status | Depende de    |
| --- | ---------------------------------------------------------------------------------------- | ------- | ----- | ----- | --------- | ------ | ------------- |
| 060 | [Home e Vitrine](./PRD-060-home-vitrine.md)                                              | Feature | D     | 🔵    | 📝        | ⏳     | 001           |
| 061 | [Busca Avançada (OEM, aplicação, equivalência)](./PRD-061-busca-avancada.md)             | Feature | D     | 🔵    | 📝        | ⏳     | 030           |
| 062 | [Listagem de Categoria com Filtros](./PRD-062-listagem-categoria.md)                     | Feature | D     | 🔵    | 📝        | ⏳     | 060           |
| 063 | [Ficha de Produto](./PRD-063-ficha-produto.md)                                           | Feature | D     | 🔵    | 📝        | ⏳     | 030           |
| 064 | [Carrinho e Checkout](./PRD-064-carrinho-checkout.md)                                    | Feature | D     | 🔵    | 📝        | ⏳     | 063           |
| 065 | [Conta do Cliente (histórico, pedidos)](./PRD-065-conta-cliente.md)                      | Feature | D     | 🔵    | 📝        | ⏳     | 064, 012      |
| 066 | [Painel Administrativo da Vitrine (esqueleto)](./PRD-066-admin-storefront.md)            | Feature | E     | 🔵    | 📝        | ⏳     | 060–065       |
| 067 | [Integração E-commerce ↔ Central (lead, ficha, pedido)](./PRD-067-integracao-central.md) | Feature | D     | 🔵    | 📝        | ⏳     | 064, 012, 017 |

### Bloco 6 — Plataformas Auxiliares (PRDs 070–071)

Esqueletos navegáveis fora do MVP funcional. Mostram o caminho de evolução sem implementar features completas.

| #   | Título                                                                                 | Tipo    | Prof. | Impl. | Documento | Status | Depende de |
| --- | -------------------------------------------------------------------------------------- | ------- | ----- | ----- | --------- | ------ | ---------- |
| 070 | [PWA Vendedor Externo / Representante (esqueleto)](./PRD-070-pwa-vendedor-externo.md)  | Feature | E     | 🔵    | 📝        | ⏳     | Bloco 0    |
| 071 | [Portal do Cliente (esqueleto + parâmetros na ficha)](./PRD-071-portal-cliente-b2b.md) | Feature | E     | 🔵    | 📝        | ⏳     | 012        |

### Bloco 7 — Integrações Fase 2 (PRDs 100+) — Backlog

**Fora do escopo do MVP.** Documentados como roadmap. Entram após validação do cliente e início da Fase 2 (backend real).

| #   | Título                                          | Tipo       | Status     | Notas                                |
| --- | ----------------------------------------------- | ---------- | ---------- | ------------------------------------ |
| 100 | Camada de Abstração WhatsApp (Provider Pattern) | Integração | 📋 Backlog | Provider Pattern para Meta/Evolution |
| 101 | Integração WhatsApp Cloud API (Meta)            | Integração | 📋 Backlog | Templates HSM, janela 24h            |
| 102 | Integração Evolution API                        | Integração | 📋 Backlog | Mensagens proativas livres           |
| 110 | Integração DINTEC (leitura)                     | Integração | 📋 Backlog | ERP base, catálogo + estoque         |
| 111 | Integração DINTEC (escrita opcional)            | Integração | 📋 Backlog | Sincronização bidirecional opcional  |
| 120 | Integração ERP de Terceiros (orçamento/pedido)  | Integração | 📋 Backlog | Outros ERPs além do DINTEC           |
| 130 | Integração Correios e Transportadoras           | Integração | 📋 Backlog | Frete real, rastreamento             |
| 140 | Gateway de Pagamento                            | Integração | 📋 Backlog | Stripe/Pagar.me para e-commerce      |

---

## Visão por Implementação

### 🟢 Lovable (scaffold visual inicial)

Apenas 2 PRDs vão ao Lovable, formando o esqueleto navegável que o cliente valida antes da implementação completa.

| PRD     | Título                                       | Por que Lovable                                                            |
| ------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| PRD-001 | Identidade Visual GALLO e Design System Base | Visual puro: tokens, temas, componentes shadcn, página `/design-system`    |
| PRD-003 | Shell do App, Navegação e Layouts Base       | Rotas, sidebar, top bar, layouts, auth mockada, separação `/app` × `/loja` |

**Fluxo:** PRD-001 + PRD-003 redigidos → prompt sintético consolidado → Lovable gera scaffold → clone local → Claude Code CLI assume.

### 🔵 Claude Code CLI (clone local)

Os outros 48 PRDs do MVP são implementados via Claude Code CLI sobre o scaffold. Distribuição:

| Bloco         | Quantidade | Foco                                                            |
| ------------- | ---------- | --------------------------------------------------------------- |
| 0 (parte)     | 5          | Modelo, mocks, providers, RBAC, multi-loja — fundação invisível |
| 1             | 10         | Central de Atendimento e CRM                                    |
| 2             | 5          | Agente SDR                                                      |
| 3             | 4          | Comercial Operacional                                           |
| 4             | 14         | Plataforma de Gestão e BI                                       |
| 5             | 8          | E-commerce                                                      |
| 6             | 2          | Plataformas auxiliares (esqueletos)                             |
| **Total CLI** | **48**     | —                                                               |

---

## Visão por Tipo

| Tipo       | Quantidade MVP | Backlog Fase 2 |
| ---------- | -------------- | -------------- |
| Feature    | 50             | 0              |
| Correção   | 0              | —              |
| Integração | 0              | 8 (PRDs 100+)  |
| **Total**  | **50**         | **8**          |

> **Nota:** No MVP, **não há nenhum PRD de Integração**. Toda integração com sistemas externos (WhatsApp, DINTEC, gateways) é deliberadamente isolada na Fase 2, mantendo a Fase 1 frontend-only com mocks.

---

## Visão por Profundidade

| Profundidade             | Quantidade | Quando se aplica                                                                                                                                                                                  |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D** (Detalhado)        | 38         | PRDs core do MVP, com todos os requisitos, critérios Gherkin, fluxos completos                                                                                                                    |
| **E** (Esqueleto enxuto) | 12         | Telas navegáveis no MVP mas com implementação rasa: financeiros (DRE, Despesas, Caixa, Rentabilidade, Estoque), auxiliares (PWA externo, Portal cliente, Admin e-commerce, Frete) e Configurações |

---

## Mapa de Dependências entre Blocos

```
BLOCO 0 (Fundação) ─────────────────────────────────────────────────┐
   │                                                                  │
   │ PRD-001 ──┐                                                      │
   │ PRD-002 ──┼──▶ Pré-requisito de TUDO                            │
   │ PRD-003 ──┘                                                      │
   │ PRD-004 ──▶ Pré-requisito de toda feature funcional             │
   │ PRD-005-007 ──▶ Infraestrutura invisível                        │
   │                                                                  │
   ├──▶ BLOCO 1 (CRM — 10 PRDs)                                       │
   │       │                                                          │
   │       ├──▶ BLOCO 2 (SDR — 5 PRDs) consome Conversa, Ficha       │
   │       │                                                          │
   │       └──▶ BLOCO 3 (Comercial — 4 PRDs) consome Cliente         │
   │                                                                  │
   ├──▶ BLOCO 3 (Comercial) ──▶ pré-requisito de BLOCO 4 e 5         │
   │                                                                  │
   ├──▶ BLOCO 4 (Gestão e BI — 14 PRDs) consome BLOCO 1 e 3          │
   │                                                                  │
   ├──▶ BLOCO 5 (E-commerce — 8 PRDs) consome BLOCO 3                │
   │       │                                                          │
   │       └──▶ PRD-067 (Integração) costura BLOCO 5 ↔ BLOCO 1       │
   │                                                                  │
   └──▶ BLOCO 6 (Auxiliares — 2 PRDs) consome BLOCO 0 e BLOCO 1     │
                                                                       │
BLOCO 7 (Integrações Fase 2) ◀────── começa após MVP validado ──────┘
```

### Dependências críticas (caminho mais longo)

```
PRD-001 ──┐
          ├──▶ PRD-002 ──▶ PRD-004 ──▶ PRD-010 (Inbox) ──▶ PRD-011 (Conversa)
          │                                                       │
PRD-003 ──┘                                                       ├──▶ PRD-016 (Veículos)
                                                                   │       │
                                                                   ├──▶ PRD-012 (Ficha) ◀──┘
                                                                   │       │
                                                                   ├──▶ PRD-015 (Clientes)
                                                                   │       │
                                                                   ├──▶ PRD-018 (Carteira)
                                                                   │
                                                                   └──▶ PRD-017 (Pipeline)
                                                                           │
                                                                           └──▶ PRD-067 (Integração e-commerce)
```

---

## Timeline Planejada — 3 Ondas

Conforme **Proposta Comercial v2**, o projeto é executado em três ondas sequenciais, cada uma resolvendo uma dor específica e gerando valor mensurável isoladamente.

### Onda 1 — Central de Atendimento + SDR

**Duração:** 75 dias a partir do kickoff
**Investimento:** R$ 45.000
**PRDs envolvidos:** Bloco 0 + Bloco 1 + Bloco 2 + Bloco 3 = **26 PRDs**

| Marco       | Conteúdo                          |
| ----------- | --------------------------------- |
| Semana 1-2  | Bloco 0 (Fundação): PRDs 001–007  |
| Semana 3-8  | Bloco 1 (CRM): PRDs 010–019       |
| Semana 8-10 | Bloco 2 (SDR): PRDs 020–024       |
| Semana 9-11 | Bloco 3 (Comercial): PRDs 030–033 |

**Entrega:** plataforma navegável com Central de Atendimento + SDR + módulos comerciais básicos, com mocks.

### Onda 2 — Plataforma de Gestão Unificada

**Duração:** 75 dias a partir do início da onda
**Investimento:** R$ 38.000
**PRDs envolvidos:** Bloco 4 = **14 PRDs**

| Marco       | Conteúdo                                                                            |
| ----------- | ----------------------------------------------------------------------------------- |
| Semana 1-4  | PRDs 041–046 (Vendas, Metas, Ranking, Positivação, ABC, Carteira analítica)         |
| Semana 5-8  | PRDs 040, 047, 053 (Visão Executiva, Comissões, IA Analítica)                       |
| Semana 9-11 | PRDs 048–052 (Esqueletos financeiros: DRE, Rentabilidade, Despesas, Caixa, Estoque) |

**Entrega:** BI gerencial completo substituindo planilhas.

### Onda 3 — E-commerce Próprio

**Duração:** 105 dias a partir do início da onda
**Investimento:** R$ 52.000
**PRDs envolvidos:** Bloco 5 + Bloco 6 = **10 PRDs**

| Marco        | Conteúdo                                               |
| ------------ | ------------------------------------------------------ |
| Semana 1-4   | PRDs 060–063 (Home, Busca, Listagem, Ficha de produto) |
| Semana 5-8   | PRDs 064–065 (Carrinho, Checkout, Conta)               |
| Semana 9-12  | PRDs 066–067 (Admin vitrine, Integração com Central)   |
| Semana 13-15 | Bloco 6 — Esqueletos auxiliares (PRD-070, 071)         |

**Entrega:** e-commerce próprio integrado à Central + esqueletos preparatórios para Fase 2.

### Cronograma Macro Consolidado

```
Mês 1-3   ── Onda 1 (Central + SDR + Comercial) ──▶ Validação Cliente
Mês 4-6   ── Onda 2 (Gestão + BI)                ──▶ Validação Cliente
Mês 7-10  ── Onda 3 (E-commerce + Auxiliares)    ──▶ MVP completo
Mês 11+   ── Operação contínua + manutenção
            └─▶ Início Fase 2 (PRDs 100+) conforme demanda
```

---

## Histórico de Versões do App (planejado)

A plataforma usa Semantic Versioning com codinomes em inglês para releases MINOR e MAJOR.

| Versão     | Codinome       | Data prevista | PRDs incluídos                   | Marco                                                                                                               |
| ---------- | -------------- | ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| v0.1.0     | **Genesis**    | Mês 1         | PRD-001                          | Scaffold inicial                                                                                                    |
| v0.1.1     | **Genesis**    | 25/05/2026    | PRD-002                          | Modelo conceitual de domínio + glossário                                                                            |
| v0.2.0     | **Genesis**    | 25/05/2026    | PRD-003                          | Shell navegável, auth mockada, 8 layouts, 30+ rotas                                                                 |
| v0.3.0     | **Genesis**    | 25/05/2026    | PRD-004 (mocks)                  | Camada de mocks com geradores determinísticos                                                                       |
| v0.4.0     | **Hub**        | 25/05/2026    | PRD-005 (provider pattern)       | Provider pattern Mock + Supabase                                                                                    |
| v0.5.0     | **Pilot**      | 25/05/2026    | PRD-006 (RBAC + auditoria)       | RBAC visual + matriz de permissões + audit log                                                                      |
| v0.6.0     | **Compass**    | 25/05/2026    | PRD-007 (multi-loja)             | **Bloco 0 (Fundação) completo** — multi-loja modelado                                                               |
| v0.7.0     | **Hub**        | 25/05/2026    | PRD-010 (Inbox unificado)        | Bloco 1 aberto — central de atendimento navegável                                                                   |
| v0.8.0     | **Pilot**      | 25/05/2026    | PRD-011 (Conversa multicanal)    | Vendedor opera conversas dentro da plataforma                                                                       |
| v0.13.0    | **Fleet**      | 26/05/2026    | PRD-016 (Veículos do Cliente)    | Veículo como entidade primária + recomendações por km                                                               |
| v0.24.0    | **Logistics**  | 26/05/2026    | PRD-032 + PRD-033                | Bloco 3 fechado — Pedido + Frete centralizado                                                                       |
| v0.25.0    | **Insight**    | 26/05/2026    | PRD-041 (Vendas — Análise)       | Abertura do Bloco 4 — dashboard analítico multidimensional                                                          |
| v0.26.0    | **Pulse**      | 26/05/2026    | PRD-042 (Metas)                  | Sistema de metas com tracking em tempo real + widget no painel gestor                                               |
| v0.27.0    | **Cockpit**    | 26/05/2026    | PRD-040 (Visão Executiva)        | Home do Gestor com 12 KPIs cross-feature                                                                            |
| v0.28.0    | **Coverage**   | 26/05/2026    | PRD-044 (Positivação)            | Cobertura mensal da base + at-risk + widget                                                                         |
| v0.29.0    | **Pareto**     | 26/05/2026    | PRD-045 (Curva ABC)              | Classificação ABC com migrações + gráfico Pareto                                                                    |
| v0.30.0    | **Vitals**     | 26/05/2026    | PRD-046 (Carteira Analítica)     | Saúde da carteira — churn, recovery, health score, evolução temporal                                                |
| v0.55.0    | **Chime**      | 31/05/2026    | PRD-009 (Notification Center UI) | Central de notificações + sino real + preferências + portal do cliente                                              |
| v0.56.0    | **Copilot**    | 31/05/2026    | PRD-025 (Copiloto de Vendas)     | Orientação privada ao vendedor — briefing + resumo + sugestões por regra; posicionamento configurável na plataforma |
| v0.13.0+   | _A definir_    | Mês 2         | PRDs 017–019 + 020–024 + 030–033 | Onda 1 entregue                                                                                                     |
| v0.5.0     | **Storefront** | Mês 9         | PRDs 060–067 (Bloco 5)           | Onda 3 quase completa                                                                                               |
| **v1.0.0** | **Heavy**      | Mês 10        | PRDs 070, 071 + polish final     | **MVP completo — release oficial**                                                                                  |
| v1.1.0+    | _A definir_    | Mês 11+       | PRDs 100+ (Fase 2)               | Integrações reais                                                                                                   |

---

## Métricas (acompanhamento)

### Velocidade de Implementação

| Período    | PRDs Redigidos | PRDs Implementados | Lead Time Médio                                                |
| ---------- | -------------- | ------------------ | -------------------------------------------------------------- |
| Maio/2026  | 7              | 3                  | — (PRD-001 via Lovable; PRD-002 e PRD-003 via Claude Code CLI) |
| Junho/2026 | _a registrar_  | _a registrar_      | _a registrar_                                                  |

### Distribuição por Complexidade (estimada)

| Complexidade | Estimativa | Notas                                                             |
| ------------ | ---------- | ----------------------------------------------------------------- |
| Baixa        | 0          | Nenhum PRD do MVP é considerado de complexidade baixa             |
| Média        | 12         | Esqueletos enxutos (E) tipicamente são complexidade média         |
| Alta         | 38         | PRDs detalhados (D) com múltiplas integrações e regras de negócio |

### Distribuição por Bloco

| Bloco                 | PRDs   | % do total MVP |
| --------------------- | ------ | -------------- |
| Bloco 0 — Fundação    | 7      | 14%            |
| Bloco 1 — CRM         | 10     | 20%            |
| Bloco 2 — SDR         | 5      | 10%            |
| Bloco 3 — Comercial   | 4      | 8%             |
| Bloco 4 — Gestão e BI | 14     | 28%            |
| Bloco 5 — E-commerce  | 8      | 16%            |
| Bloco 6 — Auxiliares  | 2      | 4%             |
| **Total MVP**         | **50** | **100%**       |

---

## Próximos Passos

### Documentação pendente

| PRD     | Título                              | Bloco | Status      | Notas                                                                            |
| ------- | ----------------------------------- | ----- | ----------- | -------------------------------------------------------------------------------- |
| PRD-043 | Ranking de Vendedores e Gamificação | 4     | ⏸ A redigir | Único PRD do MVP ainda não redigido; depende de 042 e destrava widget no PRD-014 |

### Implementação pendente (19 PRDs)

Em ordem sugerida, respeitando dependências e os deltas retroativos do `DELTAS-PRDs-Gallo-Base-Diesel.md`:

**Onda 2 — Bloco 4b (fechamento de Gestão e BI):**

| Próximo | PRD     | Título                                       |
| ------- | ------- | -------------------------------------------- |
| 1       | PRD-043 | Ranking/Gamificação (redigir + implementar)  |
| 2       | PRD-047 | Comissões (substitui stub commissionPreview) |
| 3       | PRD-048 | DRE Gerencial (adiciona unitCost ao IPart)   |
| 4       | PRD-049 | Rentabilidade por SKU/Cliente/Canal          |
| 5       | PRD-050 | Estoque — Análise (esqueleto)                |
| 6       | PRD-051 | Atendimento — Análise (esqueleto)            |
| 7       | PRD-052 | Estoque — Movimentação (derivado de pedidos) |
| 8       | PRD-053 | IA Analítica e Insights (fecha Onda 2)       |

**Onda 3 — Bloco 5 (E-commerce) e Bloco 6 (Auxiliares):**

| Próximo | PRD     | Título                                   |
| ------- | ------- | ---------------------------------------- |
| 9–16    | 060–067 | Storefront completo + integração central |
| 17–18   | 070–071 | PWA externo + Portal B2B (esqueletos)    |

**Estimativa:** ~8 entregas para fechar Onda 2 + ~10 entregas para Onda 3 = MVP v1.0.0 Heavy.

---

## Notas e Observações

### Decisões Arquiteturais Importantes

| Data      | Decisão                                               | Impacto                                                                       |
| --------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| Maio/2026 | Rebranding Turbo Diesel → **GALLO BASE DIESEL**       | Identidade visual completa redesenhada; nova paleta + tipografia              |
| Maio/2026 | Sistema de **4 temas × 2 modos**                      | UI conectada à arquitetura de marca; Dark + Diesel é default                  |
| Maio/2026 | Campo **`division`** modelado em entidades comerciais | PARTS/SERVICE/INDUSTRIAL dormentes, ativáveis sem retrabalho                  |
| Maio/2026 | **Scaffold Lovable** limitado a 2 PRDs (001 + 003)    | Demais 48 ficam no Claude Code CLI no clone local                             |
| Maio/2026 | **Provider Pattern** como filosofia transversal       | Mock/Supabase, Meta/Evolution, e futuros — todos por switch parametrizado     |
| Maio/2026 | **Multi-loja modelada desde já**                      | `IStore` é entidade de primeira classe; no MVP só matriz é gerada             |
| Maio/2026 | **Equipes dormentes no MVP**                          | `ITeam` modelado mas inativo; metas operam só em loja + individual            |
| Maio/2026 | **WhatsApp dual provider granular**                   | Por conta/número, com UI adaptativa por capabilities                          |
| Maio/2026 | **Carteira 1:1 com 4 tipos de transferência**         | Temporary (auto-revert), permanent individual, permanent batch, com auditoria |

### Riscos Identificados

| Risco                                                        | Probabilidade | Impacto | Mitigação                                                                            |
| ------------------------------------------------------------ | ------------- | ------- | ------------------------------------------------------------------------------------ |
| Drop-in replacement mock→Supabase quebrar na Fase 2          | Média         | Alto    | Disciplina nas APIs do PRD-004 mantendo contrato compatível                          |
| Volume de dados mockados insuficiente para validar BI        | Baixa         | Médio   | Volumes do PRD-004 calibrados para 200+ peças, 120+ pedidos, 12 meses de histórico   |
| Lovable gerar scaffold inconsistente com PRDs 001+003        | Média         | Médio   | Prompt sintético cuidadosamente construído após redigir os 2 PRDs                    |
| Stakeholder não conseguir validar mockup sem dados realistas | Baixa         | Alto    | Faker.js com locale pt_BR + integridade referencial garante realismo                 |
| Escopo crescer entre ondas (scope creep)                     | Alta          | Médio   | Multa rescisória de 30% sobre ondas não iniciadas + PRDs documentam escopo congelado |

### Lições Aprendidas

| Quando                            | Lição                                                                                                         | Ação Futura                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Maio/2026 (rebranding mid-flight) | Identidade visual pode mudar drasticamente durante o desenho                                                  | Validar identidade antes do PRD-001 quando possível; senão, manter briefing flexível para revisão |
| Maio/2026 (sessão de design CRM)  | Modelo conceitual cresce rapidamente quando incluem casos reais (transferências, recomendações, capabilities) | Reservar tempo proporcional no Bloco 0; modelo detalhado economiza retrabalho                     |

---

## Como Manter Este Índice

### Quando Atualizar

| Evento                             | Ação no Índice                                                       |
| ---------------------------------- | -------------------------------------------------------------------- |
| Novo PRD redigido                  | Mudar coluna Documento de ⏸ para 📝 + atualizar contagem             |
| PRD iniciado (implementação)       | Mover Status de ⏳ para 🔄 + atribuir responsável                    |
| PRD implementado                   | Mover Status para ✅ + atualizar versão do app + atualizar histórico |
| PRD cancelado                      | Mover para ❌ + documentar motivo na seção Notas                     |
| Nova versão do app                 | Atualizar "Histórico de Versões" + tag git correspondente            |
| Decisão arquitetural significativa | Adicionar entrada em "Decisões Arquiteturais Importantes"            |
| Risco materializado ou mitigado    | Atualizar tabela de "Riscos Identificados"                           |

### Checklist Periódico (mensal)

- [ ] Status de todos os PRDs atualizado conforme realidade
- [ ] Links dos arquivos redigidos funcionais
- [ ] Versão do app atualizada (se houve release no período)
- [ ] Dependências atualizadas (se algum PRD ganhou nova dependência)
- [ ] Métricas recalculadas (velocidade, distribuição)
- [ ] Timeline ajustada conforme andamento real vs planejado
- [ ] Riscos revisados
- [ ] Lições aprendidas registradas

---

## Documentos Relacionados

| Documento             | Localização                                      | Descrição                                                  |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Briefing de execução  | `briefing-execucao-prds.md` v1.1                 | Decisões arquiteturais, modelo conceitual, índice resumido |
| Guia de PRDs          | `guia-prd.md` v1.4                               | Metodologia AILA para criação de PRDs                      |
| Template Feature      | `template-prd-feature.md`                        | Para novas funcionalidades                                 |
| Template Bugfix       | `template-prd-bugfix.md`                         | Para correções                                             |
| Template Integration  | `template-prd-integration.md`                    | Para integrações externas (Fase 2)                         |
| Proposta Comercial    | `Proposta Comercial — Turbo Diesel RS.v2`        | Modelo de 3 ondas, escopo comercial                        |
| Manual de marca GALLO | `Apresentação GALLO Doc 001.pdf` + `Doc 002.pdf` | Identidade visual oficial                                  |

---

## Última Atualização

| Campo                | Valor                                                             |
| -------------------- | ----------------------------------------------------------------- |
| **Data**             | 31/05/2026                                                        |
| **Atualizado por**   | Claude Opus (Claude Code CLI)                                     |
| **Motivo**           | Implementação do PRD-025 (Copiloto de Vendas) — v0.56.0 `Copilot` |
| **Versão do índice** | 1.10                                                              |

---

**AILA — Sistemas Inteligentes**
_Frederico Westphalen / RS — Brasil_
