# PRD-062: Listagem por Categoria (E-commerce)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                              |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                   |
| **Objetivo**          | Construir páginas de listagem por categoria (`/loja/categoria/:slug`) com header rico, filtros secundários, grid de produtos, ordenações, breadcrumbs e SEO otimizado |
| **Tipo**              | Feature                                                                                                                                                               |
| **Complexidade**      | Média                                                                                                                                                                 |
| **Total de Fases**    | 4                                                                                                                                                                     |
| **Prioridade**        | Alta                                                                                                                                                                  |
| **Épico**             | Bloco 5 — E-commerce (Onda 3)                                                                                                                                         |
| **PRDs Relacionados** | PRD-030 (Catálogo), PRD-060 (Home — categorias em destaque), PRD-061 (Busca — compartilha componentes), PRD-063 (Ficha)                                               |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                    |
| **Padrão de código**  | Feature-based; código em `src/features/storefront-category/`; rotas `/loja/categoria/:slug`                                                                           |

### Critérios de Complexidade

> **Justificativa de Média:** página de listagem com filtros secundários (3-4 filtros), grid responsivo reutilizando `<ProductCard>` do PRD-061, ordenações, paginação, header com banner + descrição, breadcrumbs, SEO otimizado, e páginas especiais (mais-vendidos, promoções). Sem mutações próprias; consome catálogo do PRD-030.

---

## Contexto do Problema

Home (PRD-060) e busca (PRD-061) cobrem entradas genéricas. Mas cliente B2C ou B2B precisa navegar por **categoria específica**:

**"Quero ver todos os filtros"** sem digitar busca — categoria é UX natural.
**SEO por categoria** atrai tráfego: cliente busca "filtros de óleo caminhão" no Google e cai diretamente em `/loja/categoria/filtros-oleo`.
**Páginas curadas** como "mais vendidos" e "promoções" criam destaques institucionais.

Este PRD entrega: páginas dinâmicas por categoria + páginas especiais curadas.

---

## Conceito da Solução

### Estrutura de URL

```
/loja/categoria/:slug
```

Exemplos:

- `/loja/categoria/filtros`
- `/loja/categoria/freios`
- `/loja/categoria/correias`
- `/loja/categoria/mais-vendidas` (especial)
- `/loja/categoria/promocoes` (especial — placeholder MVP)
- `/loja/categoria/novidades` (especial)

### Slug mapping

```typescript
const categorySlugMap = {
  filtros: { category: "filtro", name: "Filtros" },
  freios: { category: "freio", name: "Freios" },
  correias: { category: "correia", name: "Correias" },
  motor: { category: "motor", name: "Motor" },
  embreagem: { category: "embreagem", name: "Embreagem" },
  eletrica: { category: "eletrica", name: "Elétrica" },
  // ...
  // Especiais
  "mais-vendidas": { special: "top_sellers" },
  novidades: { special: "newest" },
  promocoes: { special: "promotions" },
};
```

### Layout

```
┌─────────────────────────────────────────┐
│ Header global (PRD-060)                 │
├─────────────────────────────────────────┤
│ Breadcrumbs: Home > Filtros             │
├─────────────────────────────────────────┤
│ HEADER DA CATEGORIA                     │
│ Banner placeholder + título + descrição│
│ "X produtos disponíveis"                │
├──────────┬──────────────────────────────┤
│ FILTROS  │ ORDENAÇÃO + RESULTADOS       │
│ Sidebar  │ Grid de produtos             │
│          │ Paginação                    │
├──────────┴──────────────────────────────┤
│ Footer global (PRD-060)                 │
└─────────────────────────────────────────┘
```

### Header da categoria

- Banner colorido (gradient da submarca PARTS) com ícone da categoria
- Título grande
- Descrição (configurável)
- Contador "X produtos disponíveis"

### Filtros secundários (laterais)

Mais simples que PRD-061 (não duplicar):

- **Subcategoria** (se aplicável — ex: para filtros: óleo/ar/combustível/cabine)
- **Marca compatível** (radio: Volvo / Scania / Mercedes / Ford / Iveco / todos)
- **Fabricante** (multi-select)
- **Original / Equivalente / Ambos**
- **Faixa de preço**
- **Em estoque** (toggle)

### Resultados

Grid igual ao PRD-061 reutilizando `<ProductCard>`.

### Ordenações

Mesmas do PRD-061 (relevância / preço / mais vendidos / lançamentos).

### Páginas especiais

**Mais vendidas** (`/loja/categoria/mais-vendidas`):

- Sem filtro de categoria
- Ordenação default: vendas
- Filtros: marca compatível, faixa preço
- Header: "Produtos mais vendidos"

**Novidades** (`/loja/categoria/novidades`):

- Filtra produtos com createdAt nos últimos 90 dias
- Header: "Novidades no catálogo"

**Promoções** (`/loja/categoria/promocoes`):

- MVP: placeholder com produtos selecionados manualmente
- Banner: "Promoções limitadas — sistema completo na Fase 2"

### Breadcrumbs

- Home > Filtros (ex)
- Em mobile: simplificado

### SEO

- Title: "Filtros para Caminhão — Volvo, Scania, Mercedes e mais | GALLO PARTS"
- Description: "Encontre filtros originais e equivalentes para caminhões pesados..."
- og:image: placeholder
- URL amigável via slug

### Configuração `/app/configuracoes/storefront/categorias`

Sub-rota do storefront config (PRD-060):

- Cada categoria: descrição (textarea), banner placeholder
- Seleção de produtos para "Promoções" (manual no MVP)

### Permissões

- **Público**: tudo
- **Owner**: configura via admin

### Alternativas Consideradas

| Alternativa                                        | Por que descartada                                            |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Categoria como subset da busca (sem rota dedicada) | SEO perde força                                               |
| Filtros idênticos ao PRD-061                       | Categoria já filtra; filtros secundários focados              |
| Sem páginas especiais                              | Mais vendidos/novidades são destaque institucional importante |
| Banner via imagem real no MVP                      | Placeholder com gradient suficiente                           |

---

## Escopo

### Incluído

- ✅ Rota `/loja/categoria/:slug` com `CategoryListingPage`
- ✅ Slug mapping para categorias do catálogo + 3 páginas especiais
- ✅ Header da categoria com banner + descrição + contador
- ✅ Filtros laterais (5-6 filtros secundários)
- ✅ Grid de produtos reutilizando `<ProductCard>` do PRD-061
- ✅ Ordenações + paginação + URL sync
- ✅ Breadcrumbs
- ✅ Páginas especiais: mais-vendidas, novidades, promoções
- ✅ SEO meta tags por categoria
- ✅ Configuração admin (descrição editável, produtos promo)
- ✅ Mobile responsivo com filtros em drawer
- ✅ Empty states
- ✅ Adicionar ao carrinho via card (PRD-064)

### Excluído

- ❌ Banners via upload real — Fase 2
- ❌ Sub-categorias como rotas separadas (ex: /filtros/oleo) — Fase 2; usar filtros
- ❌ Listagem hierárquica de categorias e subcategorias — Fase 2
- ❌ A/B testing de banners — Fase 2
- ❌ Personalização por cliente — Fase 2

---

## Requisitos Funcionais

### Roteamento

- **RF-001:** Rota dinâmica `/loja/categoria/:slug` resolve para `CategoryListingPage`.
- **RF-002:** Slug mapping em `src/features/storefront-category/data/slugs.ts`.
- **RF-003:** Slug inválido → 404 amigável com sugestão de categorias válidas.

### Página

- **RF-004:** `CategoryListingPage` em `src/features/storefront-category/pages/`.
- **RF-005:** Layout 2 colunas (desktop) / drawer (mobile).
- **RF-006:** Reuso de `<StorefrontHeader>` e `<StorefrontFooter>` do PRD-060.

### Header da categoria

- **RF-007:** Banner com gradient da submarca PARTS + ícone Iconify da categoria.
- **RF-008:** Título grande + descrição configurável.
- **RF-009:** Contador "X produtos disponíveis".
- **RF-010:** Em páginas especiais: descrição diferente (configurável).

### Breadcrumbs

- **RF-011:** "Home > [Categoria]" no topo (Home link).
- **RF-012:** Em mobile, simplificado.

### Filtros laterais

- **RF-013:** 5 filtros secundários:
  - Subcategoria (se aplicável)
  - Marca compatível
  - Fabricante
  - Original/Equivalente/Ambos
  - Faixa de preço
  - Em estoque (toggle)
- **RF-014:** URL sync.
- **RF-015:** Botão "Limpar filtros".

### Resultados

- **RF-016:** Grid responsivo (1/2/3 colunas).
- **RF-017:** Reuso de `<ProductCard>` do PRD-061.
- **RF-018:** Paginação 24/página.
- **RF-019:** Click no card leva à ficha (PRD-063); botão "Adicionar ao carrinho" via PRD-064.

### Ordenações

- **RF-020:** 5 opções (mesmas do PRD-061).
- **RF-021:** URL sync.

### Páginas especiais

- **RF-022:** **`/loja/categoria/mais-vendidas`**: consulta top vendidos (PRD-041) sem filtrar categoria.
- **RF-023:** **`/loja/categoria/novidades`**: filtra `createdAt > now - 90 dias`.
- **RF-024:** **`/loja/categoria/promocoes`**: lista produtos marcados como promo (placeholder via settings).

### SEO

- **RF-025:** `<Helmet>` com title + description dinâmicos por categoria.
- **RF-026:** URLs amigáveis (slug).

### Configuração

- **RF-027:** Sub-rota `/app/configuracoes/storefront/categorias` (parte do PRD-060 config).
- **RF-028:** Editor por categoria: descrição (textarea), banner placeholder.
- **RF-029:** Seleção de produtos para "promoções" (multi-select no MVP).
- **RF-030:** Audit log em mudanças.

### Mobile

- **RF-031:** Filtros em drawer (igual PRD-061).
- **RF-032:** Cards em coluna única.

### Empty state

- **RF-033:** Quando categoria sem produtos:
  - Ícone + mensagem
  - Sugestão: explorar outras categorias
  - Link "Ver todas as categorias" → home

---

## Requisitos Não-Funcionais

- **RNF-001:** Página renderiza < 400ms.
- **RNF-002:** Mobile usável.
- **RNF-003:** WCAG 2.1 AA.
- **RNF-004:** SEO: lighthouse SEO ≥ 80.

---

## Critérios de Aceitação

```gherkin
DADO acesso /loja/categoria/filtros
QUANDO página carrega
ENTÃO vejo header com banner + título "Filtros" + descrição
  E filtros laterais incluindo subcategoria (óleo/ar/combustível/cabine)
  E grid de produtos da categoria
  E breadcrumbs "Home > Filtros"

DADO aplico filtro Subcategoria=óleo + Marca compatível=Volvo
QUANDO filtros aplicam
ENTÃO resultados reduzem
  E URL atualiza
  E contador reflete

DADO acesso /loja/categoria/mais-vendidas
QUANDO página carrega
ENTÃO vejo top produtos vendidos
  E sem filtro de categoria
  E header especial "Produtos mais vendidos"

DADO acesso /loja/categoria/inexistente
QUANDO página carrega
ENTÃO vejo 404 amigável com sugestão de categorias válidas

DADO mobile
QUANDO clico botão "Filtros"
ENTÃO drawer abre

DADO Owner edita descrição da categoria
QUANDO salva
ENTÃO mudança reflete em /loja/categoria/filtros
  E audit log
```

---

## Fases de Implementação

| Fase | Objetivo                                                |
| ---- | ------------------------------------------------------- |
| 1    | Página dinâmica + slug mapping + header da categoria    |
| 2    | Filtros laterais + grid de resultados (reuso PRD-061)   |
| 3    | Páginas especiais (mais-vendidas, novidades, promoções) |
| 4    | Configuração admin + mobile + SEO + polish              |

---

## Dependências

| PRD                                         | Status          |
| ------------------------------------------- | --------------- |
| PRD-030 (catálogo)                          | 📝              |
| PRD-041 (top vendidos para "mais-vendidas") | 📝              |
| PRD-060 (header/footer)                     | 📝 (lote atual) |
| PRD-061 (ProductCard)                       | 📝 (lote atual) |

### Futuras

| PRD                | Como Lidar            |
| ------------------ | --------------------- |
| PRD-063 (Ficha)    | Click no card         |
| PRD-064 (Carrinho) | Adicionar ao carrinho |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-35   | 010-061           |
| **36** | **PRD-062 ATUAL** |
| 37+    | 063-067, 070-071  |

---

## Considerações de Segurança

- Página pública — sem dados sensíveis
- Slug é entrada não confiável — validar antes de consultar catálogo
- 404 amigável evita vazar estrutura interna

---

## Convenções

| Elemento | Convenção              |
| -------- | ---------------------- |
| Página   | `CategoryListingPage`  |
| Pasta    | `storefront-category/` |

---

## Notas para o Agente Desenvolvedor

- Reusar `<ProductCard>` e componentes de filtro do PRD-061 (não duplicar)
- Slug mapping centralizado — fonte única
- Páginas especiais como casos do mesmo componente (parametrizado)
- Banner via gradient + ícone é suficiente no MVP
- SEO meta tags dinâmicas

---

## Status

| Campo  | Valor                          |
| ------ | ------------------------------ |
| Status | ✅ CONCLUÍDO (v0.41.0 — Aisle) |

---

## Histórico

| Data       | Versão | Alteração                                                                                |
| ---------- | ------ | ---------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — listagem por categoria com filtros secundários, páginas especiais, SEO |

---

**AILA - Sistemas Inteligentes**
