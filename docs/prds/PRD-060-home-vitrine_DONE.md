# PRD-060: Home / Vitrine Pública

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                 |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                      |
| **Objetivo**          | Construir a home / vitrine pública do e-commerce em `/loja` com identidade visual da submarca PARTS, hero impactante, produtos em destaque, categorias e marcas, header funcional e footer institucional |
| **Tipo**              | Feature                                                                                                                                                                                                  |
| **Complexidade**      | Alta                                                                                                                                                                                                     |
| **Total de Fases**    | 5                                                                                                                                                                                                        |
| **Prioridade**        | Alta                                                                                                                                                                                                     |
| **Épico**             | Bloco 5 — E-commerce (Onda 3)                                                                                                                                                                            |
| **PRDs Relacionados** | PRD-001 (Design System), PRD-003 (Shell — sub-app /loja), PRD-030 (Catálogo), PRD-061 (Busca), PRD-062 (Categoria), PRD-063 (Ficha Produto), PRD-064 (Carrinho), PRD-065 (Conta Cliente)                 |
| **Implementação**     | 🔵 Claude Code CLI (sobre scaffold do Lovable)                                                                                                                                                           |
| **Padrão de código**  | Feature-based; código em `src/features/storefront/`; rota `/loja` (sub-app definido em PRDs 003 e 007)                                                                                                   |

### Critérios de Complexidade

> **Justificativa de Alta:** página inicial pública com **identidade visual distinta** (submarca PARTS — verde #337648), seções múltiplas (hero, destaques, categorias, marcas, sobre, footer), header funcional (busca, login, carrinho), responsividade total para mobile/desktop/tablet, otimização SEO básica, primeira impressão do e-commerce GALLO, integração com 6+ PRDs do bloco 5, e necessidade de visual diferenciado para causar impacto comercial.

---

## Contexto do Problema

A GALLO BASE DIESEL precisa de **e-commerce próprio** — não dependência de marketplaces. Hoje só vende via WhatsApp + telefone. Três problemas que vitrine resolve:

**Cliente B2C não compra fora do horário comercial.** Caminhoneiro acha peça que precisa às 23h, não pode comprar — sem checkout self-service, perde. **Marca não tem presença digital.** Sem site profissional, parece empresa pequena; concorrentes online ganham presença e SEO. **B2B descobre catálogo manualmente.** Cliente novo PJ pergunta "tem catálogo?" — sem site, vendedor manda PDF, processo lento.

Este PRD entrega: home pública impactante, primeira impressão profissional, integração com fluxo de catálogo/carrinho/checkout. **Visual da submarca PARTS** (verde) destacando que é a frente comercial de peças.

---

## Conceito da Solução

### Identidade visual

Conforme PRD-001:

- Tema **PARTS** ativo por default no `/loja`
- Cor primária: verde `#337648`
- Carbono institucional `#1A1A1A` como base
- Tipografia: Saira Condensed (títulos) + Inter (textos)
- Logo GALLO BASE DIESEL PARTS

### Estrutura da página

```
┌─────────────────────────────────────────────────┐
│ HEADER                                          │
│ Logo  [Busca]  [Categorias▾]  Login  [Carrinho] │
├─────────────────────────────────────────────────┤
│ HERO                                            │
│ "Peças pesadas para diesel — entrega rápida"   │
│ [CTA Buscar peça]  [CTA Ver catálogo]          │
├─────────────────────────────────────────────────┤
│ MARCAS QUE ATENDEMOS                            │
│ [Volvo] [Scania] [Mercedes] [Ford] [Iveco]      │
├─────────────────────────────────────────────────┤
│ CATEGORIAS EM DESTAQUE                          │
│ [Filtros] [Freios] [Correias] [Motor] [Elétrica]│
├─────────────────────────────────────────────────┤
│ PRODUTOS EM DESTAQUE                            │
│ [Card][Card][Card][Card]                        │
├─────────────────────────────────────────────────┤
│ POR QUE COMPRAR NA GALLO                        │
│ ✓ Entrega rápida ✓ Catálogo amplo ✓ Suporte    │
├─────────────────────────────────────────────────┤
│ SOBRE NÓS                                       │
│ Texto institucional + foto                      │
├─────────────────────────────────────────────────┤
│ FOOTER                                          │
│ Contato | Redes | Endereço | Termos             │
└─────────────────────────────────────────────────┘
```

### Header

Sticky no scroll, com:

- **Logo GALLO PARTS** (link para home)
- **Busca destacada** (placeholder: "Busque por código OEM, nome ou marca")
- **Categorias** dropdown (lista categorias do catálogo PRD-030)
- **Marca compatível** dropdown (Volvo, Scania, etc.) — filtros rápidos
- **Login/Cadastro** (link para PRD-065)
- **Carrinho** com badge contador

Mobile: hambúrguer menu, busca em barra inferior.

### Hero

- Background com imagem (placeholder no MVP — usar gradient + ícones)
- Headline: "Peças pesadas para diesel — entrega rápida em todo Sul do Brasil"
- Sub-headline: "Volvo, Scania, Mercedes, Ford, Iveco e mais"
- 2 CTAs: "Buscar peça" (foca busca) + "Ver catálogo" (PRD-062 mais vendidas)
- Indicadores de confiança: "5.000+ peças em estoque", "Atendimento 24/7 via WhatsApp"

### Marcas atendidas

Linha horizontal com 5 logos (placeholder SVG no MVP).
Click leva ao filtro de busca por marca compatível.

### Categorias em destaque

Grid de 6 categorias (PRD-030):

- Cada card: ícone (Iconify do design system), nome, contagem de produtos
- Click leva à listagem da categoria (PRD-062)

### Produtos em destaque

Grid de 8 produtos (responsive: 1 mobile, 2 tablet, 4 desktop):

- Imagem placeholder (ícone categoria com tema PARTS)
- Nome
- Código OEM
- Preço
- Badge "Mais vendido" / "Novidade" / "Promoção" (mock no MVP)
- Botão "Ver detalhes" → ficha (PRD-063)

No MVP: produtos selecionados manualmente em settings ou via lógica simples (top vendidos do PRD-041).

### Por que comprar (institucional)

3 ou 4 cards com benefícios:

- ✓ Entrega expressa em FW e região
- ✓ Catálogo com 5.000+ peças
- ✓ Atendimento 24/7 via WhatsApp
- ✓ Equivalências e opções de economia

### Sobre nós

Bloco curto com:

- Texto institucional (placeholder editável)
- Foto da empresa (placeholder)
- CTA "Conheça mais" (link para página estática /loja/sobre — opcional MVP)

### Footer

- **Contato**: telefone, WhatsApp, email
- **Redes**: Instagram, Facebook, YouTube (placeholders)
- **Endereço**: Frederico Westphalen/RS
- **Institucional**: Termos de uso, Privacidade, FAQ (placeholders)
- **Newsletter** (placeholder Fase 2)
- Copyright + logo

### Mobile

Layout adaptativo:

- Hero ocupa viewport completo
- Cards em coluna única
- Header com menu hambúrguer
- Busca em barra inferior fixa
- CTAs grandes (touch-friendly)

### Configuração

Sub-rota `/app/configuracoes/storefront` (Owner):

- Texto do hero (headline + subheadline)
- Produtos em destaque (selecionar manualmente ou auto via mais vendidos)
- Categorias em destaque (selecionar quais)
- Texto institucional
- Dados de contato no footer
- Banner: "E-commerce em modo demonstração — checkout real disponível na Fase 2"

### SEO básico

- Meta tags configuráveis (title, description, og:image placeholder)
- Estrutura semântica (header, main, footer, section)
- URLs limpas

### Permissões

- **Público**: tudo (sem login)
- **Logado**: header mostra avatar + acesso à conta (PRD-065)
- **Owner**: edita storefront via /app/configuracoes/storefront

### Alternativas Consideradas

| Alternativa                                    | Por que descartada                                   |
| ---------------------------------------------- | ---------------------------------------------------- |
| Vitrine separada (outro projeto)               | Briefing define sub-app no mesmo repo (PRDs 003/007) |
| Sem identidade PARTS (usar tema institucional) | E-commerce é submarca específica                     |
| Hero genérico sem CTAs específicos             | Conversão precisa de direção clara                   |
| Sem destaques (apenas categorias)              | Vitrine sem produtos vira diretório                  |
| Estrutura customizável full no MVP             | Complexidade alta; defaults suficientes              |
| Renderização SSR no MVP                        | SPA é OK; SEO básico via meta tags                   |

---

## Escopo

### Incluído

- ✅ Rota `/loja` (home) com identidade PARTS ativada
- ✅ Header funcional (logo, busca, categorias dropdown, marca dropdown, login, carrinho)
- ✅ Hero com headline, sub-headline, 2 CTAs, indicadores
- ✅ Seção marcas atendidas (5 logos placeholder + click → busca filtrada)
- ✅ Seção categorias em destaque (6 cards)
- ✅ Seção produtos em destaque (8 cards via PRD-030)
- ✅ Seção "Por que comprar" (4 benefícios institucionais)
- ✅ Seção sobre nós (placeholder editável)
- ✅ Footer institucional (contato, redes, endereço, links)
- ✅ Mobile responsivo completo
- ✅ Meta tags SEO básicas configuráveis
- ✅ Sub-rota `/app/configuracoes/storefront` (Owner)
- ✅ Integração com PRDs 030 (produtos), 061 (busca), 062 (categoria), 063 (ficha), 064 (carrinho), 065 (login)
- ✅ Componentes reutilizáveis para outras páginas do /loja
- ✅ Banner "Modo demonstração" no Owner config (Fase 2 = checkout real)

### Excluído

- ❌ SSR / SSG — Fase 2
- ❌ Personalização por região do visitante — Fase 2
- ❌ Newsletter funcional — Fase 2
- ❌ Reviews / avaliações de clientes — Fase 2
- ❌ Recomendações personalizadas via IA — Fase 2
- ❌ Multi-idioma — apenas pt-BR
- ❌ A/B testing de hero/CTAs — Fase 2
- ❌ Chat ao vivo embutido — Fase 2 (link WhatsApp suficiente)
- ❌ Página /sobre detalhada — placeholder
- ❌ Páginas legais detalhadas (Termos, Privacidade) — Fase 2

---

## Requisitos Funcionais

### Estrutura e roteamento

- **RF-001:** Rota `/loja` (home pública).
- **RF-002:** Tema PARTS aplicado por default no /loja (data-theme="parts").
- **RF-003:** Layout próprio `<StorefrontLayout>` em `src/features/storefront/layouts/` — diferente do AppLayout interno.
- **RF-004:** Carregamento de fontes garantido (Saira Condensed + Inter).

### Header

- **RF-005:** `<StorefrontHeader>` componente sticky com:
  - Logo GALLO PARTS (link `/loja`)
  - Input de busca (placeholder explicativo; submit leva a `/loja/busca?q=...`)
  - Dropdown "Categorias" listando categorias do PRD-030
  - Dropdown "Marca" com 5 marcas (filtra busca)
  - Botão Login/Cadastro (se não logado) ou Avatar (se logado, link para `/loja/conta`)
  - Botão Carrinho com badge contador (estado global via Zustand)
- **RF-006:** Mobile: hambúrguer + busca em barra inferior fixa.

### Hero

- **RF-007:** `<StorefrontHero>` com:
  - Background placeholder (gradient + iconografia OU imagem se configurada)
  - Headline configurável
  - Sub-headline configurável
  - 2 CTAs: "Buscar peça" (foca input) + "Ver catálogo" (`/loja/categoria/mais-vendidas` ou similar)
  - 3 indicadores de confiança (configuráveis)

### Marcas

- **RF-008:** `<StorefrontBrands>` com 5 cards de marcas (SVGs placeholder).
- **RF-009:** Click em marca leva a `/loja/busca?marca=Volvo`.

### Categorias em destaque

- **RF-010:** `<StorefrontCategories>` com 6 categorias selecionadas (configuráveis).
- **RF-011:** Cada card: ícone Iconify + nome + contagem de produtos da categoria.
- **RF-012:** Click leva a `/loja/categoria/:slug` (PRD-062).

### Produtos em destaque

- **RF-013:** `<StorefrontFeaturedProducts>` com 8 produtos.
- **RF-014:** Seleção configurável (manual via settings OU auto via top vendidos PRD-041).
- **RF-015:** Card de produto: imagem placeholder, nome, OEM, preço, badge ("Mais vendido"/"Novidade"/"Promoção" — mock no MVP), botão "Ver detalhes".
- **RF-016:** Click leva a `/loja/produto/:id` (PRD-063).

### Por que comprar

- **RF-017:** `<StorefrontWhyBuy>` com 4 cards de benefícios.
- **RF-018:** Textos configuráveis.

### Sobre nós

- **RF-019:** `<StorefrontAboutTeaser>` com texto curto + foto placeholder.
- **RF-020:** Configurável via settings.

### Footer

- **RF-021:** `<StorefrontFooter>` com 4 colunas (contato, redes, endereço, institucional) + copyright.
- **RF-022:** Links placeholders para páginas estáticas (criar shells se necessário).

### Configuração admin

- **RF-023:** `StorefrontConfigPage` em `/app/configuracoes/storefront` (Owner).
- **RF-024:** Editor com:
  - Hero (headline, subheadline, indicadores)
  - Marcas em destaque (toggle/ordem)
  - Categorias em destaque (multi-select de 6)
  - Produtos em destaque (modo: manual com seleção ou automático top vendidos)
  - Benefícios (4 textos editáveis)
  - Sobre nós (textarea)
  - Footer (contato, redes, endereço)
  - Meta SEO (title, description)
- **RF-025:** Banner "Modo demonstração — checkout real Fase 2".
- **RF-026:** Audit log em mudanças.

### SEO

- **RF-027:** `<Helmet>` ou tag manager para meta tags.
- **RF-028:** Title, description, og:image configuráveis.
- **RF-029:** Estrutura semântica HTML5.

### Estado global do carrinho

- **RF-030:** Zustand store `useCartStore` exporta contador para o header.
- **RF-031:** Persistência básica em localStorage (mock; Fase 2 com Supabase).

### Permissões

- **RF-032:** /loja é público (sem GuardedRoute).
- **RF-033:** Header detecta sessão (logado via PRD-065) ou não.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Home renderiza em < 600ms.
- **RNF-002 (Responsividade):** Mobile, tablet, desktop funcionam corretamente.
- **RNF-003 (Acessibilidade):** WCAG 2.1 AA; navegação por teclado em header e CTAs.
- **RNF-004 (SEO):** Meta tags presentes; lighthouse SEO ≥ 80.
- **RNF-005 (Tipagem):** Zero `any`.

---

## Critérios de Aceitação

```gherkin
DADO acesso /loja sem login
QUANDO página carrega
ENTÃO vejo hero com headline, sub-headline, 2 CTAs
  E header com logo, busca, dropdowns, login, carrinho
  E 6 seções abaixo
  E footer
  E tema PARTS aplicado (verde como primária)

DADO clico em "Buscar peça" no hero
QUANDO ação processa
ENTÃO foco vai para input de busca no header

DADO clico em categoria "Filtros" em destaque
QUANDO navego
ENTÃO sou levado a /loja/categoria/filtros (PRD-062)

DADO clico em produto em destaque
QUANDO navego
ENTÃO sou levado a /loja/produto/:id (PRD-063)

DADO Owner acessa /app/configuracoes/storefront
QUANDO edita headline e salva
ENTÃO mudança reflete em /loja imediatamente
  E audit log

DADO mobile (viewport < 768px)
QUANDO acesso /loja
ENTÃO header tem hambúrguer
  E busca em barra inferior
  E cards em coluna única
  E CTAs touch-friendly
```

---

## Fases de Implementação

| Fase | Objetivo                                          |
| ---- | ------------------------------------------------- |
| 1    | Layout /loja + header + hero                      |
| 2    | Seções marcas + categorias + produtos em destaque |
| 3    | Seções benefícios + sobre + footer                |
| 4    | Configuração admin + SEO meta tags                |
| 5    | Mobile + acessibilidade + polish                  |

---

## Dependências

| PRD                     | Status |
| ----------------------- | ------ |
| PRD-001 (tema PARTS)    | 📝     |
| PRD-003 (sub-app /loja) | 📝     |
| PRD-007 (multi-loja)    | 📝     |
| PRD-030 (catálogo)      | 📝     |

### Dependências Futuras

| PRD                 | Como Lidar                           |
| ------------------- | ------------------------------------ |
| PRD-061 (Busca)     | Header tem busca; submit leva à rota |
| PRD-062 (Categoria) | Categorias linkam para rota          |
| PRD-063 (Ficha)     | Produtos linkam para ficha           |
| PRD-064 (Carrinho)  | Header mostra contador               |
| PRD-065 (Login)     | Header tem botão login               |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-33   | 010-053           |
| **34** | **PRD-060 ATUAL** |
| 35+    | 061-067, 070-071  |

---

## Considerações de Segurança

- /loja é pública — sem dados sensíveis
- Configuração admin requer Owner — audit log
- Sem rate limiting no MVP (Fase 2)

---

## Convenções

| Elemento    | Convenção                                               |
| ----------- | ------------------------------------------------------- |
| Página      | `StorefrontHomePage`                                    |
| Componentes | `<StorefrontHeader>`, `<StorefrontHero>`, etc.          |
| Pasta       | `storefront/`                                           |
| Git         | `feat(storefront): add public home with PARTS identity` |

---

## Notas para o Agente Desenvolvedor

- Identidade PARTS é central — verde como primária dominante
- Estrutura semântica HTML5 (header/main/footer/section)
- Componentes reutilizáveis pelos outros PRDs do Bloco 5
- Hero precisa impacto visual — caprichar
- Mobile-first não obrigatório, mas mobile usável é essencial
- Banner sobre Fase 2 (modo demonstração) é importante
- Estado global do carrinho via Zustand desde já (PRD-064 consome)

---

## Status

| Campo  | Valor                             |
| ------ | --------------------------------- |
| Status | ✅ CONCLUÍDO — v0.39.0 (Showcase) |

---

## Histórico

| Data       | Versão | Alteração                                                                         |
| ---------- | ------ | --------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — home pública com identidade PARTS, 7 seções, configuração admin |
| 27/05/2026 | v1.1   | Implementação concluída — vitrine completa em `/loja`, header funcional com busca/dropdowns/cart, hero, 5 seções, footer institucional, cart store Zustand, config admin em `/app/configuracoes/storefront`, version bump 0.39.0 (Showcase) |

---

**AILA - Sistemas Inteligentes**
