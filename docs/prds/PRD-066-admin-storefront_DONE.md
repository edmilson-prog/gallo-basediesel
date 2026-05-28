# PRD-066: Admin Storefront

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                             |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                  |
| **Objetivo**          | Construir painel centralizado para Owner gerenciar o e-commerce — produtos em destaque, banners, categorias em destaque, cupons placeholder, métricas de tráfego/conversão placeholder, e customização visual mínima |
| **Tipo**              | Feature                                                                                                                                                                                                              |
| **Complexidade**      | Média                                                                                                                                                                                                                |
| **Total de Fases**    | 4                                                                                                                                                                                                                    |
| **Prioridade**        | Média                                                                                                                                                                                                                |
| **Épico**             | Bloco 5 — E-commerce (Onda 3)                                                                                                                                                                                        |
| **PRDs Relacionados** | PRD-060 (Home — config), PRD-062 (Categoria — config), PRD-063 (Produto), PRD-064 (Carrinho — métricas), PRD-067 (Integração Central)                                                                                |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                   |
| **Padrão de código**  | Feature-based; código em `src/features/storefront-admin/`; rota `/app/storefront-admin`                                                                                                                              |

### Critérios de Complexidade

> **Justificativa de Média:** painel administrativo agregando sub-configs já criadas em PRDs 060 e 062 (consolida em uma tela), métricas placeholder de visitas/conversão/abandono, gestão de cupons placeholder, e visualização de performance do e-commerce. Sem mutations próprias além das configs existentes; complexidade está na consolidação.

---

## Contexto do Problema

PRDs 060 e 062 já criaram sub-configs dispersas em `/app/configuracoes/storefront` e `/app/configuracoes/storefront/categorias`. Mas:

**Owner perde tempo navegando.** Para mudar hero do home + adicionar categoria em destaque + listar produtos promo, abre 3 telas diferentes.
**Sem visibilidade de performance.** "Quantas visitas o e-commerce teve essa semana? Conversão? Abandono?" — sem métricas, decisões viram chute.
**Cupons e campanhas precisam home centralizada.** Mesmo placeholders, precisam estar em um lugar.

Este PRD entrega: painel `/app/storefront-admin` com tabs unificadas + métricas placeholder + estrutura para evolução.

---

## Conceito da Solução

### Página `/app/storefront-admin`

Layout com tabs no header:

1. **Dashboard** — métricas do e-commerce
2. **Conteúdo** — hero, categorias destaque, produtos destaque, sobre, footer
3. **Cupons** — placeholder Fase 2
4. **Campanhas** — placeholder Fase 2
5. **Análise** — drill-down de tráfego/conversão

### Aba 1 — Dashboard

KPIs no topo (placeholders no MVP):

- Visitas no período (mock)
- Pedidos via e-commerce (real — IOrder com origin='ecommerce')
- Conversão (placeholder)
- Ticket médio do e-commerce (real)
- Carrinhos abandonados (placeholder Fase 2)
- Top produtos clicados (placeholder Fase 2)

Gráficos:

- Evolução de pedidos via e-commerce nos últimos 30 dias (real)
- Demais placeholders com banner "Métricas completas na Fase 2"

### Aba 2 — Conteúdo

Aglutina configs dos PRDs 060 e 062 em sub-tabs:

**Sub-tab Home:**

- Hero (headline, subheadline, indicadores)
- Marcas em destaque (toggle/ordem)
- Categorias em destaque (multi-select)
- Produtos em destaque (manual ou automático)
- Por que comprar (4 textos editáveis)
- Sobre nós (textarea)
- Footer (contato, redes, endereço)
- Meta SEO (title, description)

**Sub-tab Categorias:**

- Por categoria: descrição, banner placeholder, produtos promo

**Sub-tab Identidade:**

- Logo placeholder (upload Fase 2)
- Cores principais (preview do tema PARTS)
- Banner: "Customização avançada na Fase 2"

### Aba 3 — Cupons (placeholder)

Card central:

- "Gestão de cupons disponível na Fase 2"
- Lista mockada de cupons fictícios para demonstração visual
- Botão "Criar cupom" desabilitado com tooltip

### Aba 4 — Campanhas (placeholder)

Card central:

- "Campanhas promocionais disponíveis na Fase 2"
- Visualização mockada (banner Black Friday, etc.)
- Botão desabilitado

### Aba 5 — Análise

Versão mais detalhada do Dashboard:

- Funil de conversão e-commerce (visitas → carrinho → checkout → pagamento) — placeholder no MVP
- Páginas mais visitadas (placeholder)
- Origens de tráfego (placeholder Fase 2 com integração Analytics)
- Performance por dispositivo (placeholder)

### Permissões

- **Owner**: tudo
- **Gestor**: read-only no Dashboard e Análise; sem edição de Conteúdo
- **Vendedor**: SEM ACESSO

### Alternativas Consideradas

| Alternativa                                                    | Por que descartada                           |
| -------------------------------------------------------------- | -------------------------------------------- |
| Manter sub-configs espalhadas em /app/configuracoes/storefront | Owner perde tempo navegando                  |
| Sem aba Cupons/Campanhas                                       | Estrutura preparada para Fase 2 é importante |
| Métricas reais via Google Analytics no MVP                     | Complexidade; placeholders coerentes         |
| Sem aba Análise (apenas Dashboard)                             | Drill-down justifica aba dedicada            |

---

## Escopo

### Incluído

- ✅ Página `/app/storefront-admin` substituindo placeholder do PRD-003
- ✅ 5 abas: Dashboard, Conteúdo, Cupons, Campanhas, Análise
- ✅ Dashboard com KPIs (mix de real + placeholder)
- ✅ Gráfico real de pedidos via e-commerce (consume PRD-032 filtrando origin='ecommerce')
- ✅ Aba Conteúdo unifica configs dos PRDs 060 e 062 em sub-tabs
- ✅ Sub-tab Identidade com placeholder de logo + cores
- ✅ Aba Cupons placeholder com mockup visual
- ✅ Aba Campanhas placeholder com mockup
- ✅ Aba Análise com funil placeholder e métricas placeholder
- ✅ Permissões (Vendedor bloqueado, Gestor read-only no admin)
- ✅ Redirecionamento das sub-rotas antigas (`/app/configuracoes/storefront` → `/app/storefront-admin?tab=conteudo`)
- ✅ Mobile responsivo (tabs em scroll horizontal)
- ✅ Audit log em mudanças de conteúdo

### Excluído

- ❌ Integração com Google Analytics — Fase 2
- ❌ Cupons funcionais (CRUD + aplicação) — Fase 2
- ❌ Campanhas com workflow — Fase 2
- ❌ A/B testing de hero/banner — Fase 2
- ❌ Upload real de imagens (logo, banner) — Fase 2
- ❌ Customização avançada de tema — Fase 2
- ❌ Multi-storefront (várias lojas com vitrines distintas) — Fase 2
- ❌ Heatmap / análise de cliques — Fase 2

---

## Requisitos Funcionais

### Página principal

- **RF-001:** `StorefrontAdminPage` em `src/features/storefront-admin/pages/`, rota `/app/storefront-admin`.
- **RF-002:** Tabs do shadcn com 5 abas. URL sync de aba ativa.
- **RF-003:** Guard de rota: apenas Owner edita; Gestor vê Dashboard e Análise read-only.

### Aba Dashboard

- **RF-004:** 6 KPI cards (algumas reais, algumas placeholder com badge "Mock/Fase 2").
- **RF-005:** Gráfico de pedidos via e-commerce (real — filtrar IOrder com origin='ecommerce').
- **RF-006:** Demais gráficos placeholder com banner explicativo.

### Aba Conteúdo

- **RF-007:** Sub-tabs internas: Home, Categorias, Identidade.
- **RF-008:** **Sub-tab Home**: editor consolidado das configs do PRD-060 (hero, marcas, categorias destaque, produtos destaque, benefícios, sobre, footer, SEO).
- **RF-009:** **Sub-tab Categorias**: editor das configs do PRD-062 (descrição por categoria, produtos promo).
- **RF-010:** **Sub-tab Identidade**: placeholders de logo e cores; banner Fase 2.
- **RF-011:** Salvar com audit log; toast de confirmação.
- **RF-012:** Modal de confirmação se mudanças não salvas ao navegar.

### Aba Cupons

- **RF-013:** Card central placeholder + lista mockada (3-4 cupons fictícios).
- **RF-014:** Botão "Criar cupom" desabilitado com tooltip Fase 2.

### Aba Campanhas

- **RF-015:** Card central + mockup visual de campanhas.
- **RF-016:** Estrutura preparada para evolução.

### Aba Análise

- **RF-017:** Funil de conversão visual (4 etapas: visitas → produto → carrinho → pedido).
- **RF-018:** Conversão entre etapas com números mockados realistas.
- **RF-019:** Páginas mais visitadas e origens de tráfego placeholders.

### Migração de rotas

- **RF-020:** `/app/configuracoes/storefront` e `/app/configuracoes/storefront/categorias` redirecionam para `/app/storefront-admin?tab=conteudo&subtab=home` (ou categorias) — não quebrar bookmarks.

### Permissões

- **RF-021:** `<GuardedRoute permission={{ resource: 'storefront-admin', action: 'view' }}>`.
- **RF-022:** Vendedor BLOQUEADO totalmente.
- **RF-023:** Gestor: tabs Dashboard e Análise visíveis, abas Conteúdo/Cupons/Campanhas em modo read-only ou ocultas.

---

## Requisitos Não-Funcionais

- **RNF-001:** Página renderiza < 500ms.
- **RNF-002:** Mobile responsivo (tabs scroll horizontal).
- **RNF-003:** WCAG 2.1 AA.
- **RNF-004:** Audit log em todas as mudanças de conteúdo.

---

## Critérios de Aceitação

```gherkin
DADO Owner acessa /app/storefront-admin
QUANDO página carrega
ENTÃO vejo 5 tabs (Dashboard, Conteúdo, Cupons, Campanhas, Análise)
  E Dashboard ativo por default

DADO aba Conteúdo + sub-tab Home
QUANDO edito headline do hero e salvo
ENTÃO mudança reflete em /loja imediatamente
  E audit log registra
  E toast confirma

DADO acesso /app/configuracoes/storefront (rota antiga)
QUANDO route resolve
ENTÃO sou redirecionado para /app/storefront-admin?tab=conteudo&subtab=home

DADO clico aba Cupons
QUANDO observo
ENTÃO vejo card placeholder + mockup de cupons fictícios
  E botão "Criar cupom" desabilitado

DADO Vendedor tenta acessar /app/storefront-admin
QUANDO route guard valida
ENTÃO bloqueado (redirect)

DADO Gestor acessa
QUANDO observa
ENTÃO vê apenas Dashboard e Análise (ou abas Conteúdo bloqueadas read-only)
```

---

## Fases de Implementação

| Fase | Objetivo                                                        |
| ---- | --------------------------------------------------------------- |
| 1    | Estrutura de tabs + Dashboard com KPIs e gráfico real           |
| 2    | Aba Conteúdo unificando sub-tabs Home + Categorias + Identidade |
| 3    | Abas Cupons + Campanhas placeholders + Análise placeholder      |
| 4    | Migração rotas + permissões + mobile + polish                   |

---

## Dependências

| PRD                                      | Status |
| ---------------------------------------- | ------ |
| PRD-032 (pedidos com origin='ecommerce') | 📝     |
| PRD-060 (configs do home)                | 📝     |
| PRD-062 (configs categoria)              | 📝     |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-39   | 010-065           |
| **40** | **PRD-066 ATUAL** |
| 41+    | 067, 070, 071     |

---

## Considerações de Segurança

- Acesso restrito a Owner com audit log
- Mudanças em conteúdo público afetam imagem da marca — audit obrigatório
- Banner sobre Fase 2 em abas placeholder

---

## Convenções

| Elemento | Convenção             |
| -------- | --------------------- |
| Página   | `StorefrontAdminPage` |
| Pasta    | `storefront-admin/`   |

---

## Notas para o Agente Desenvolvedor

- Aglutinar configs existentes (não duplicar lógica)
- Redirect das rotas antigas é importante (não quebrar bookmarks)
- Placeholders coerentes (não falsos) — banners explicativos
- Dashboard tem mix de real + placeholder com badges claros
- Mobile: tabs scroll horizontal

---

## Status

| Campo  | Valor       |
| ------ | ----------- |
| Status | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                           |
| ---------- | ------ | ------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — painel admin consolidado do e-commerce com 5 tabs |

---

**AILA - Sistemas Inteligentes**
