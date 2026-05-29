# Índice de PRDs — GALLO BASE DIESEL

> **Catálogo mestre do projeto**
> Versão: **1.1** — Maio/2026 (corrigido após double-check de 28/05/2026)
> Mantido pelo Arquiteto: Edmilson Souza (AILA Sistemas Inteligentes)

---

## ⚠️ Nota de Correção (v1.1 — 28/05/2026)

Esta versão corrige um **desalinhamento de numeração no Bloco 4** identificado por investigação cruzada (double-check) entre o índice planejado, os PRDs efetivamente redigidos e os placeholders do shell (PRD-003):

1. **Títulos dos PRDs 050/051/052 corrigidos** para refletir o que foi de fato redigido. O índice v1.0 planejava `050=Despesas`, `051=Fluxo de Caixa`, `052=Estoque Curadoria`, mas a redação do Bloco 4b ocupou esses números com **Estoque-Análise (050)**, **Atendimento-Análise (051)** e **Estoque-Movimentação (052)**, sem atualizar este índice.
2. **Despesas e Fluxo de Caixa recuperados** como **PRD-054** e **PRD-055** (números livres no Bloco 4, antes do e-commerce em 060). Como 050/051 já estavam implementados, optou-se por não renumerar.
3. **Placeholders do shell** (`/app/gestao/despesas`, `/app/gestao/caixa`) devem ser corrigidos de `prd="050"`/`prd="051"` para `prd="054"`/`prd="055"` (tarefa do agente desenvolvedor).
4. Detalhes completos da causa raiz: ver changelog ao final.

---

## Informações do Projeto

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Cliente** | GALLO BASE DIESEL (rebranding de Turbo Diesel — distribuidora de peças pesadas em Frederico Westphalen/RS) |
| **Repositório** | _A definir após criação no Lovable_ |
| **Início do projeto** | Maio/2026 |
| **Briefing de execução** | `briefing-execucao-prds.md` v1.1 |
| **Metodologia** | AILA GuiaPRD v1.4 |
| **Estratégia de desenvolvimento** | Frontend First — mockup navegável → validação cliente → backend real (Fase 2) |
| **Versão atual do app** | Em implementação (Bloco 4 em andamento) |
| **Versão alvo MVP** | v1.0.0 — codinome **Heavy** |
| **Total de PRDs planejados (MVP)** | **52** (era 50; +054 Despesas, +055 Fluxo de Caixa) |
| **PRDs redigidos** | **52** (todos) |
| **PRDs implementados** | ver seção "Implementação" (estado a reconciliar com repo vivo) |
| **PRDs futuros (Fase 2/3, PRDs 100+/200+)** | documentados em índice próprio (`INDEX-...-fase2-v1_3.md`) |

---

## Agentes do Workflow

| Agente | Modelo | Ambiente | Função |
|--------|--------|----------|--------|
| **Arquiteto** | Claude Opus 4.7 (Anthropic) | Plataforma Web (claude.ai) | Cria e mantém PRDs |
| **Desenvolvedor (Lovable)** | Claude Opus 4.7 (via Lovable) | Lovable | Gera scaffold visual inicial (apenas PRD-001 e PRD-003) |
| **Desenvolvedor (CLI)** | Claude Opus 4.7 | Claude Code CLI v2.1.x | Implementa demais PRDs no clone local |

---

## Identidade Visual GALLO (referência rápida)

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

---

## Resumo de Status

### Documentação (PRDs redigidos)

| Status | Quantidade | Percentual |
|--------|------------|------------|
| 📝 Redigido | 52 | 100% |
| ⏸ A redigir | 0 | 0% |
| **Total MVP** | **52** | **100%** |

### Implementação (estado observado — reconciliar com repo vivo)

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Implementado | ~31 | ~60% |
| ⏳ Pendente | ~21 | ~40% |
| **Total** | **52** | **100%** |

> **Ressalva importante:** o estado de implementação acima reflete os arquivos `_DONE` observados no Project Knowledge, que **pode estar defasado** em relação ao repositório git vivo onde o Claude Code CLI trabalha. Por exemplo, os PRDs 050/051 foram reportados como `_DONE` pelo agente no repo, mas aparecem sem o sufixo no Project Knowledge. **Reconciliar com o git antes de usar como fonte de verdade.**

### Distribuição por Implementação

| Implementação | Quantidade | Notas |
|---------------|------------|-------|
| 🟢 Lovable (scaffold visual) | 2 | PRD-001 e PRD-003 — formam o scaffold inicial |
| 🔵 Claude Code CLI (clone local) | 50 | Demais PRDs, implementados sobre o scaffold |

---

## Catálogo Completo dos PRDs

> **Legenda:** 📝 Redigido | ⏸ A redigir | ✅ Implementado | 🔄 Em Andamento | ⏳ Pendente | 🟢 Lovable | 🔵 Claude Code CLI | **D** Detalhado | **E** Esqueleto enxuto

### Bloco 0 — Fundação (PRDs 001–007)

Estabelece os pilares técnicos e visuais. **Pré-requisito obrigatório** para qualquer outro bloco.

| # | Título | Tipo | Prof. | Impl. | Documento | Status |
|---|--------|------|-------|-------|-----------|--------|
| 001 | Identidade Visual GALLO e Design System Base | Feature | D | 🟢 | 📝 | ⏳ |
| 002 | Modelo Conceitual de Domínio e Glossário | Feature | D | 🔵 | 📝 | ✅ |
| 003 | Shell do App, Navegação e Layouts Base | Feature | D | 🟢 | 📝 | ✅ |
| 004 | Geradores de Dados Fictícios e Camada de Mocks | Feature | D | 🔵 | 📝 | ✅ |
| 005 | Arquitetura de Provedores de Dados (Mock/Supabase) | Feature | D | 🔵 | 📝 | ✅ |
| 006 | Sistema de Roles, Permissões e Auditoria (visual) | Feature | D | 🔵 | 📝 | ✅ |
| 007 | Multi-Loja: Modelagem e Operação Cross-Store | Feature | D | 🔵 | 📝 | ✅ |

### Bloco 1 — Central de Atendimento e CRM (PRDs 010–019)

Coração operacional do MVP. **Onda 1.**

| # | Título | Tipo | Prof. | Impl. | Documento | Status |
|---|--------|------|-------|-------|-----------|--------|
| 010 | Inbox Unificado e Lista de Conversas | Feature | D | 🔵 | 📝 | ✅ |
| 011 | Conversa com Histórico Multicanal | Feature | D | 🔵 | 📝 | ✅ |
| 012 | Ficha Unificada do Cliente | Feature | D | 🔵 | 📝 | ✅ |
| 013 | Regras de Distribuição e Roteamento | Feature | D | 🔵 | 📝 | ✅ |
| 014 | Painel do Gestor — Métricas e Saúde da Carteira | Feature | D | 🔵 | 📝 | ✅ |
| 015 | Lista Geral de Clientes (segmentações e ações em lote) | Feature | D | 🔵 | 📝 | ✅ |
| 016 | Veículos do Cliente | Feature | D | 🔵 | 📝 | ✅ |
| 017 | Pipeline de Leads (Kanban + Lista) | Feature | D | 🔵 | 📝 | ✅ |
| 018 | Gestão de Carteira e Transferências | Feature | D | 🔵 | 📝 | ✅ |
| 019 | Configurações Administrativas (esqueleto navegável) | Feature | E | 🔵 | 📝 | ✅ |

### Bloco 2 — Agente SDR (PRDs 020–024)

Agente de IA que atende 24/7. **Onda 1.**

| # | Título | Tipo | Prof. | Impl. | Documento | Status |
|---|--------|------|-------|-------|-----------|--------|
| 020 | Simulação de Conversa SDR ↔ Cliente | Feature | D | 🔵 | 📝 | ✅ |
| 021 | Identificação de Peça (OEM, descrição, equivalência) | Feature | D | 🔵 | 📝 | ✅ |
| 022 | Geração de Orçamento via SDR | Feature | D | 🔵 | 📝 | ✅ |
| 023 | Escalonamento para Vendedor com Resumo de Contexto | Feature | D | 🔵 | 📝 | ✅ |
| 024 | Painel de Configuração e Métricas do Agente | Feature | D | 🔵 | 📝 | ✅ |

### Bloco 3 — Comercial Operacional (PRDs 030–033)

Catálogo interno, orçamento, pedido, frete. **Onda 1.**

| # | Título | Tipo | Prof. | Impl. | Documento | Status |
|---|--------|------|-------|-------|-----------|--------|
| 030 | Catálogo de Produtos (visão comercial interna) | Feature | D | 🔵 | 📝 | ✅ |
| 031 | Orçamento (criação, edição, validade, conversão) | Feature | D | 🔵 | 📝 | ✅ |
| 032 | Pedido (gestão, status, ciclo de vida) | Feature | D | 🔵 | 📝 | ✅ |
| 033 | Cálculo de Frete e Esqueleto Transportadoras | Feature | E | 🔵 | 📝 | ✅ |

### Bloco 4 — Plataforma de Gestão e BI (PRDs 040–055) ⚠️ CORRIGIDO

Visão executiva, metas, gamificação, positivação, curva ABC, comissões, DRE, rentabilidade, análises de estoque/atendimento, **despesas e fluxo de caixa**. **Onda 2.**

> **Correção v1.1:** títulos de 050/051/052 ajustados ao que foi redigido; **054 (Despesas) e 055 (Fluxo de Caixa) adicionados** recuperando os temas originalmente planejados para 050/051.

| # | Título | Tipo | Prof. | Impl. | Documento | Status |
|---|--------|------|-------|-------|-----------|--------|
| 040 | Visão Executiva (Home do Gestor) | Feature | D | 🔵 | 📝 | ✅ |
| 041 | Vendas (pipeline, vendedor, canal, categoria) | Feature | D | 🔵 | 📝 | ✅ |
| 042 | Sistema de Metas (loja + individual; equipe dormente) | Feature | D | 🔵 | 📝 | ✅ |
| 043 | Ranking de Vendedores e Gamificação | Feature | D | 🔵 | 📝 | ⏳ |
| 044 | Positivação de Clientes | Feature | D | 🔵 | 📝 | ✅ |
| 045 | Curva ABC de Clientes | Feature | D | 🔵 | 📝 | ✅ |
| 046 | Carteira Analítica com Drill-down | Feature | D | 🔵 | 📝 | ✅ |
| 047 | Comissões (cálculo, fechamento) | Feature | D | 🔵 | 📝 | ⏳ |
| 048 | DRE Gerencial | Feature | D | 🔵 | 📝 | ⏳ |
| 049 | Rentabilidade por SKU / Cliente / Canal | Feature | D | 🔵 | 📝 | ⏳ |
| 050 | **Estoque (Análise)** ⚠️ _(era "Despesas" no plano v1.0)_ | Feature | D | 🔵 | 📝 | ⏳ |
| 051 | **Atendimento (Análise Histórica)** ⚠️ _(era "Fluxo de Caixa" no plano v1.0)_ | Feature | D | 🔵 | 📝 | ⏳ |
| 052 | **Estoque (Movimentação)** ⚠️ _(era "Estoque Curadoria" no plano v1.0)_ | Feature | E | 🔵 | 📝 | ⏳ |
| 053 | IA Analítica e Insights Proativos | Feature | D | 🔵 | 📝 | ⏳ |
| **054** | **Despesas (Lançamentos)** 🆕 _(recupera tema do slot 050 original)_ | Feature | D | 🔵 | 📝 | ⏳ |
| **055** | **Fluxo de Caixa** 🆕 _(recupera tema do slot 051 original)_ | Feature | D | 🔵 | 📝 | ⏳ |

### Bloco 5 — E-commerce (PRDs 060–067)

Vitrine pública GALLO PARTS, busca, carrinho, checkout, conta, integração. **Onda 3.**

| # | Título | Tipo | Prof. | Impl. | Documento | Status |
|---|--------|------|-------|-------|-----------|--------|
| 060 | Home e Vitrine | Feature | D | 🔵 | 📝 | ⏳ |
| 061 | Busca Avançada (OEM, aplicação, equivalência) | Feature | D | 🔵 | 📝 | ⏳ |
| 062 | Listagem de Categoria com Filtros | Feature | D | 🔵 | 📝 | ⏳ |
| 063 | Ficha de Produto | Feature | D | 🔵 | 📝 | ⏳ |
| 064 | Carrinho e Checkout | Feature | D | 🔵 | 📝 | ⏳ |
| 065 | Conta do Cliente (histórico, pedidos) | Feature | D | 🔵 | 📝 | ⏳ |
| 066 | Painel Administrativo da Vitrine (esqueleto) | Feature | E | 🔵 | 📝 | ⏳ |
| 067 | Integração E-commerce ↔ Central | Feature | D | 🔵 | 📝 | ⏳ |

### Bloco 6 — Plataformas Auxiliares (PRDs 070–071)

Esqueletos navegáveis fora do MVP funcional.

| # | Título | Tipo | Prof. | Impl. | Documento | Status |
|---|--------|------|-------|-------|-----------|--------|
| 070 | PWA Vendedor Externo / Representante (esqueleto) | Feature | E | 🔵 | 📝 | ⏳ |
| 071 | Portal do Cliente (esqueleto + parâmetros na ficha) | Feature | E | 🔵 | 📝 | ⏳ |

### Fase 2/3 — Backlog (PRDs 100+/200+)

Documentados em índice próprio: `INDEX-PRDs-Gallo-Base-Diesel-fase2-v1_3.md` (105 PRDs Fase 2 + Fase 3). Alguns já redigidos antecipadamente: PRD-107 (Auth Custom Claims), PRD-109 (Backup/DR), PRD-201 (Estoque Crítico — Operações Críticas).

---

## Visão por Profundidade (atualizada v1.1)

| Profundidade | Quantidade | Mudança vs v1.0 |
|--------------|------------|------------------|
| **D** (Detalhado) | 42 | +4 (050 e 051 viraram D; +054, +055) |
| **E** (Esqueleto enxuto) | 10 | -2 (050/051 não são mais os esqueletos Despesas/Caixa) |
| **Total** | **52** | +2 |

Esqueletos (E) atuais: 019 (Configurações), 033 (Frete), 052 (Estoque-Movimentação), 066 (Admin e-commerce), 070 (PWA externo), 071 (Portal cliente) — e demais conforme revisão.

---

## Distribuição por Bloco (atualizada v1.1)

| Bloco | PRDs | % do total MVP |
|-------|------|----------------|
| Bloco 0 — Fundação | 7 | 13% |
| Bloco 1 — CRM | 10 | 19% |
| Bloco 2 — SDR | 5 | 10% |
| Bloco 3 — Comercial | 4 | 8% |
| **Bloco 4 — Gestão e BI** | **16** | **31%** |
| Bloco 5 — E-commerce | 8 | 15% |
| Bloco 6 — Auxiliares | 2 | 4% |
| **Total MVP** | **52** | **100%** |

---

## Mapa de Dependências dos Novos PRDs (054/055)

```
PRD-032 (Pedido) ──────┐
                       ├──▶ PRD-055 (Fluxo de Caixa) ──▶ PRD-040 (Cockpit: KPI saldo)
PRD-047 (Comissões) ───┤
PRD-054 (Despesas) ────┘
        │
        └──▶ DELTA em PRD-048 (DRE): substitui fixedExpenses por agregação real
```

- **PRD-054 (Despesas)** alimenta o DRE (competência) e o Fluxo de Caixa (pagamento).
- **PRD-055 (Fluxo de Caixa)** consome pedidos pagos (PRD-032), despesas pagas (PRD-054) e comissões (PRD-047); regime de caixa, distinto do DRE.

---

## Ações de Correção Pendentes (para o agente desenvolvedor)

| Ação | Onde | Prioridade |
|------|------|------------|
| Corrigir placeholder Despesas: `prd="050"` → `prd="054"` | `src/routes/app.gestao.despesas.tsx` | Imediata (trivial) |
| Corrigir placeholder Caixa: `prd="051"` → `prd="055"` | `src/routes/app.gestao.caixa.tsx` | Imediata (trivial) |
| Auditar outros placeholders órfãos | `grep -r 'PlaceholderPage prd=' src/routes/` cruzado com `*_DONE.md` | Recomendada |
| Implementar PRD-054 e PRD-055 | quando priorizado | Conforme roadmap |
| Aplicar DELTA do DRE (PRD-048) ao implementar 054 | substituir `fixedExpenses` por `aggregateExpensesForDRE` | Junto com 054 |
| Reconciliar estado `_DONE` entre Project Knowledge e git | — | Recomendada |

---

## Histórico de Versões do App (planejado)

| Versão | Codinome | Mês | PRDs entregues | Marco |
|--------|----------|-----|----------------|-------|
| v0.1.0 | **Genesis** | Mês 1 | 001, 002, 003 | Fundação (scaffold Lovable) |
| v0.2.0 | **Hub** | Mês 2 | 004–007 + 010–019 + 020–024 + 030–033 | Onda 1 |
| v0.3.0 | **Pilot** | Mês 3 | Refinamentos pós-validação Onda 1 | Validação Cliente Onda 1 |
| v0.4.0 | **Compass** | Mês 6 | 040–055 (Bloco 4 — agora 16 PRDs) | Onda 2 |
| v0.5.0 | **Storefront** | Mês 9 | 060–067 (Bloco 5) | Onda 3 quase completa |
| **v1.0.0** | **Heavy** | Mês 10 | 070, 071 + polish | **MVP completo** |
| v1.1.0+ | _A definir_ | Mês 11+ | 100+ (Fase 2) | Integrações reais |

---

## Decisões Arquiteturais Importantes

| Data | Decisão | Impacto |
|------|---------|---------|
| Maio/2026 | Rebranding Turbo Diesel → **GALLO BASE DIESEL** | Identidade visual redesenhada |
| Maio/2026 | Sistema de **4 temas × 2 modos** | Dark + Diesel default |
| Maio/2026 | **Provider Pattern** transversal | Mock/Supabase por switch |
| Maio/2026 | **Multi-loja modelada desde já** | `IStore` primeira classe |
| Maio/2026 | **Equipes dormentes no MVP** | `ITeam` modelado, inativo |
| Maio/2026 | **Carteira 1:1 com 4 tipos de transferência** | Com auditoria |
| **28/05/2026** | **Correção de numeração Bloco 4** | 050/051/052 retitulados; Despesas→054, Caixa→055 |
| **28/05/2026** | **DRE passa a consumir despesas reais** | DELTA: `fixedExpenses` deprecated em favor de agregação do PRD-054 |

---

## Changelog do Índice

### v1.1 — 28/05/2026 — Correção pós double-check

**Motivo:** investigação iniciada a partir de placeholder de Despesas (`/app/gestao/despesas`) exibindo "será implementada no PRD-050", quando PRD-050 era na verdade "Estoque-Análise".

**Causa raiz confirmada por evidência:**
- O INDEX v1.0 planejou `050=Despesas`, `051=Fluxo de Caixa`, `052=Estoque Curadoria` (todos E).
- O PRD-003 (shell) registrou corretamente os placeholders conforme esse plano (`despesas→050`, `caixa→051`).
- Durante a redação do Bloco 4b, os números 050/051/052 foram ocupados por **Estoque-Análise**, **Atendimento-Análise** e **Estoque-Movimentação** — **sem atualizar este índice nem avisar**. Despesas e Fluxo de Caixa ficaram sem PRD.
- Resultado: três fontes divergentes (índice planejado, PRDs redigidos, placeholders do shell).

**Correções aplicadas:**
1. Títulos de 050/051/052 ajustados à realidade redigida.
2. Profundidades corrigidas: 050 e 051 são **D** (eram E no plano); 052 permanece **E**.
3. **PRD-054 (Despesas)** e **PRD-055 (Fluxo de Caixa)** adicionados ao Bloco 4, recuperando os temas deslocados, com DELTA documentado para o PRD-048 (DRE passa a usar despesas reais).
4. Contagens atualizadas: MVP de 50 → **52**; Bloco 4 de 14 → **16**; D de 38 → **42**; E de 12 → **10**.
5. Estado de implementação atualizado para o observado, com ressalva de dessincronia entre Project Knowledge e repositório git vivo.
6. Decisão de **não renumerar** 050/051 (já implementados) — Despesas/Caixa recebem números novos.

**Pendências geradas:** correção dos dois placeholders no shell; auditoria de outros placeholders órfãos; redação dos PRDs 054/055 (✅ concluída em 28/05/2026); reconciliação de estado `_DONE`.

### v1.0 — 25/05/2026 — Criação inicial

Índice consolidado após redação dos 4 primeiros PRDs do Bloco 0.

---

## Última Atualização

| Campo | Valor |
|-------|-------|
| **Data** | 28/05/2026 |
| **Atualizado por** | Edmilson Souza (Arquiteto) + Claude Opus 4.7 |
| **Motivo** | Correção v1.1 — desalinhamento de numeração do Bloco 4 (Despesas/Caixa) identificado em double-check; recuperação como PRD-054/055 |
| **Versão do índice** | 1.1 |

---

**AILA — Sistemas Inteligentes**
*Frederico Westphalen / RS — Brasil*
