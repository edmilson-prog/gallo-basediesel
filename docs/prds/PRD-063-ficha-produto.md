# PRD-063: Ficha do Produto (E-commerce)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                             |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                  |
| **Objetivo**          | Construir a ficha pública do produto no e-commerce com galeria, informações comerciais, aplicações peça↔veículo, equivalências com comparativo, especificações, produtos relacionados e CTA de adicionar ao carrinho |
| **Tipo**              | Feature                                                                                                                                                                                                              |
| **Complexidade**      | Alta                                                                                                                                                                                                                 |
| **Total de Fases**    | 5                                                                                                                                                                                                                    |
| **Prioridade**        | Alta                                                                                                                                                                                                                 |
| **Épico**             | Bloco 5 — E-commerce (Onda 3)                                                                                                                                                                                        |
| **PRDs Relacionados** | PRD-030 (Catálogo), PRD-060 (Home), PRD-061 (Busca), PRD-062 (Categoria), PRD-064 (Carrinho), PRD-065 (Conta)                                                                                                        |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                   |
| **Padrão de código**  | Feature-based; código em `src/features/storefront-product/`; rota `/loja/produto/:id`                                                                                                                                |

### Critérios de Complexidade

> **Justificativa de Alta:** página de detalhe rica com múltiplas seções (galeria, informações comerciais, aplicações, equivalências com comparativo de preço, especificações, produtos relacionados), galeria de imagens placeholder com lightbox, seletor de quantidade, adicionar ao carrinho com feedback visual, compartilhamento social, SEO rico (Open Graph, schema.org Product), e integração com 4+ PRDs do bloco.

---

## Contexto do Problema

Cliente clica em produto em /loja (PRD-060), /loja/busca (PRD-061) ou /loja/categoria (PRD-062). Precisa de página rica que **converta**:

**Sem detalhes técnicos, cliente B2B não fecha.** Vendedor de frota quer ver aplicações exatas (motor compatível? ano?). **Sem visualizar equivalências, não percebe economia.** PRD-030 já tem equivalências; ficha precisa apresentar com clareza. **Sem CTA forte para carrinho, conversão cai.** Botão "Adicionar" precisa ser óbvio e satisfatório.

Este PRD entrega: ficha completa otimizada para conversão e informação técnica.

---

## Conceito da Solução

### Layout

```
┌────────────────────────────────────────────────┐
│ Header global (PRD-060)                        │
├────────────────────────────────────────────────┤
│ Breadcrumbs: Home > Filtros > Filtro Volvo R450│
├──────────────┬─────────────────────────────────┤
│ GALERIA      │ NOME + BADGES                   │
│              │ Código OEM                      │
│ [Imagem]     │                                 │
│              │ R$ 95,00                        │
│ [thumbs]     │ Estoque: disponível ✓           │
│              │                                 │
│              │ Quantidade: [-] 1 [+]           │
│              │ [Adicionar ao Carrinho]         │
│              │ [Compartilhar via WhatsApp]     │
├──────────────┴─────────────────────────────────┤
│ ABAS                                           │
│ [Aplicações] [Equivalências] [Especificações]  │
│                                                │
│ Conteúdo da aba ativa                          │
├────────────────────────────────────────────────┤
│ PRODUTOS RELACIONADOS                          │
│ [Card][Card][Card][Card]                       │
├────────────────────────────────────────────────┤
│ Footer global (PRD-060)                        │
└────────────────────────────────────────────────┘
```

### Galeria

MVP: 1 imagem placeholder (ícone categoria em background gradient PARTS).
Estrutura preparada para múltiplas imagens (carousel + thumbnails) na Fase 2.

Click abre lightbox simples (zoom).

### Header de informações

- **Nome** grande
- **Código OEM** secundário
- **Badges**: categoria, fabricante, Original/Equivalente, "Mais vendido" (se aplicável)
- **Preço** em destaque (R$ XX,XX)
- **Indicador de estoque**:
  - Verde "Em estoque ✓" se stockQuantity ≥ threshold
  - Amarelo "Últimas unidades" se baixo
  - Vermelho "Esgotado" se zero (botão Adicionar bloqueado, CTA "Avise-me" placeholder Fase 2)
- **Seletor de quantidade**: `[-] 1 [+]` com input editável
- **Botão "Adicionar ao Carrinho"** grande, primário (verde PARTS)
- **Botão "Compartilhar via WhatsApp"** secundário

### Abas

3 abas:

**Aba Aplicações:**

- Lista de `IPartApplication` agrupada por marca de veículo
- Cada item: modelo + faixa de anos + motor + notas
- Filtro inline "Verificar compatibilidade": cliente informa marca/modelo/ano → destaca matching

**Aba Equivalências:**

- Lista de peças equivalentes (consulta `getEquivalents` do PRD-030)
- Cada item: imagem placeholder + nome + fabricante + preço + % economia (se aplicável)
- Click leva à ficha da equivalente
- Indicador "Original" vs "Equivalente"

**Aba Especificações:**

- Tabela de specs: peso, dimensões, descrição técnica completa, códigos alternativos
- Texto institucional sobre garantia/origem (placeholder)

### Produtos relacionados

Grid de 4 produtos relacionados (mesma categoria, mesmas aplicações ou mesma marca):

- Reuso `<ProductCard>` do PRD-061
- Algoritmo simples: produtos da mesma categoria OU com pelo menos 1 application em comum

### Compartilhamento

Botão "Compartilhar via WhatsApp":

- Abre WhatsApp Web/App com mensagem pré-preenchida:

  ```
  Confira este produto na GALLO BASE DIESEL:

  Filtro de óleo Volvo R450
  Cód. 21380488 — R$ 95,00

  https://gallo.com.br/loja/produto/abc123
  ```

Adicional: copy link button (placeholder).

### Adicionar ao Carrinho

- Click no botão grande:
  - Adiciona ao carrinho com quantidade selecionada
  - Toast com animação: "✓ Produto adicionado ao carrinho!"
  - Mini-preview do carrinho (slide-in do header)
  - Contador do header atualiza
- Botão atualizado para "Ver Carrinho" temporariamente (3s) — UX padrão e-commerce

### Estoque zerado

Quando `stockQuantity === 0`:

- Indicador vermelho "Esgotado"
- Botão "Adicionar ao Carrinho" desabilitado
- CTA alternativa: "Avise-me quando voltar" (input email + placeholder; Fase 2)
- Mensagem: "Entre em contato pelo WhatsApp para verificar disponibilidade"

### SEO rico

- Title: "Filtro de óleo Volvo R450 — Cód. 21380488 | GALLO PARTS"
- Description: "Filtro original Volvo. Compatível com R450, FH540 motores DC13. Estoque disponível. R$ 95,00."
- Schema.org Product (microdata via tags)
- og:image placeholder

### FAQ (placeholder)

Aba "Dúvidas" placeholder com card: "Sistema de perguntas e respostas disponível na Fase 2".

### Permissões

- **Público**: tudo
- **Logado**: pode adicionar ao carrinho com persistência server-side (Fase 2; MVP usa localStorage)

### Alternativas Consideradas

| Alternativa                                | Por que descartada                                   |
| ------------------------------------------ | ---------------------------------------------------- |
| Sem abas (tudo scroll)                     | Página muito longa; abas organizam                   |
| Galeria com múltiplas imagens reais no MVP | Sem upload de imagem ainda (PRD-030); placeholder OK |
| Sem produtos relacionados                  | Cross-sell perdido                                   |
| Sem destaque de equivalências              | Diferencial GALLO; precisa destaque                  |
| Sem compartilhamento WhatsApp              | Canal principal da GALLO — essencial                 |
| FAQ com Q&A real no MVP                    | Complexidade; placeholder coerente                   |

---

## Escopo

### Incluído

- ✅ Rota `/loja/produto/:id` (id da IPart)
- ✅ Slug amigável opcional (`/loja/produto/:id/:slug`) para SEO — slug gerado de partName
- ✅ Layout 2 colunas (galeria + info) → mobile stack
- ✅ Galeria com 1 imagem placeholder + lightbox simples
- ✅ Header de informações com nome, OEM, badges, preço, estoque, qty selector, CTAs
- ✅ 3 abas: Aplicações, Equivalências, Especificações
- ✅ Filtro inline "Verificar compatibilidade" na aba Aplicações
- ✅ Comparativo de % economia em Equivalências
- ✅ Produtos relacionados (algoritmo simples)
- ✅ Adicionar ao carrinho com toast + mini-preview + atualização contador
- ✅ Compartilhamento via WhatsApp
- ✅ Indicadores de estoque com regras (esgotado bloqueia botão)
- ✅ FAQ placeholder
- ✅ Breadcrumbs
- ✅ SEO rico (meta tags + schema.org Product)
- ✅ Integração com PRDs 030, 060, 061, 062, 064
- ✅ Mobile responsivo
- ✅ Estado 404 amigável se id inválido

### Excluído

- ❌ Múltiplas imagens / upload real — Fase 2
- ❌ Vídeos de produto — Fase 2
- ❌ Reviews / avaliações — Fase 2
- ❌ Q&A funcional — Fase 2
- ❌ Comparador entre produtos — Fase 2
- ❌ Wishlist / favoritos — Fase 2
- ❌ "Avise-me quando voltar" funcional — Fase 2
- ❌ Visualização 3D / AR — Fase 2

---

## Requisitos Funcionais

### Roteamento

- **RF-001:** Rota `/loja/produto/:id` resolve para `ProductDetailPage`.
- **RF-002:** Slug opcional via `/loja/produto/:id/:slug` (mesmo ID; slug ignorado funcionalmente, apenas SEO).
- **RF-003:** ID inválido → 404 amigável com sugestão de busca/categorias.

### Página

- **RF-004:** `ProductDetailPage` em `src/features/storefront-product/pages/`.
- **RF-005:** Reuso de `<StorefrontHeader>` e `<StorefrontFooter>`.
- **RF-006:** Layout 2 colunas (desktop) / stack (mobile).
- **RF-007:** Breadcrumbs: Home > Categoria > Nome do produto.

### Galeria

- **RF-008:** `<ProductGallery>` com 1 imagem placeholder no MVP.
- **RF-009:** Estrutura suporta múltiplas imagens (Fase 2).
- **RF-010:** Click abre lightbox (modal simples com zoom).

### Header de informações

- **RF-011:** `<ProductInfo>` com:
  - Nome (grande, h1)
  - Código OEM (mono, cinza)
  - Badges (categoria, fabricante, Original/Equivalente)
  - Preço grande
  - Indicador de estoque (verde/amarelo/vermelho com texto)
  - Seletor de quantidade (`-` `[input]` `+`, default 1, mínimo 1, validação numérica)
  - Botão "Adicionar ao Carrinho" (primário, grande, verde PARTS)
  - Botão "Compartilhar via WhatsApp" (secundário)

### Abas

- **RF-012:** `<ProductTabs>` com 3 abas (Aplicações, Equivalências, Especificações).
- **RF-013:** **Aplicações**:
  - Lista de `IPartApplication[]` agrupada por marca
  - Filtro inline "Verificar compatibilidade" (3 dropdowns + botão)
  - Quando filtro aplicado, destacar aplicação matching com badge "✓ Compatível"
- **RF-014:** **Equivalências**:
  - Consulta `getEquivalents(partId)` (PRD-030)
  - Lista com imagem placeholder + nome + fabricante + preço
  - Calcular % economia: `((thisProduct.price - equiv.price) / thisProduct.price) * 100`
  - Indicador Original/Equivalente
  - Click leva à ficha da equivalente
- **RF-015:** **Especificações**:
  - Tabela com peso, dimensões, códigos alternativos, descrição completa
  - Texto institucional sobre garantia (placeholder editável)

### Produtos relacionados

- **RF-016:** `<RelatedProducts>` com 4 produtos.
- **RF-017:** Algoritmo: produtos da mesma categoria com pelo menos 1 application em comum; fallback a apenas mesma categoria.
- **RF-018:** Reuso de `<ProductCard>` do PRD-061.

### Adicionar ao Carrinho

- **RF-019:** Click no botão chama `addToCart(partId, quantity)` do Zustand store (PRD-064).
- **RF-020:** Toast com check: "✓ Produto adicionado ao carrinho!"
- **RF-021:** Mini-preview do carrinho (drawer pequeno do header) abre por 3s.
- **RF-022:** Contador do header atualiza imediatamente.
- **RF-023:** Botão muda temporariamente para "Ver Carrinho" por 3s (link para `/loja/carrinho`).

### Estoque zerado

- **RF-024:** Se `stockQuantity === 0`:
  - Indicador vermelho "Esgotado"
  - Botão "Adicionar ao Carrinho" desabilitado
  - CTA alternativa: "Avise-me quando voltar" (placeholder com tooltip Fase 2)
  - Link WhatsApp para verificar disponibilidade direta

### Compartilhamento

- **RF-025:** Botão "Compartilhar via WhatsApp" abre URL `https://wa.me/?text=...` com mensagem pré-preenchida (nome, OEM, preço, URL).
- **RF-026:** Botão secundário "Copiar link" placeholder.

### SEO

- **RF-027:** `<Helmet>` com title, description, og:image dinâmicos.
- **RF-028:** Schema.org Product via microdata:
  ```html
  <div itemscope itemtype="https://schema.org/Product">
    <span itemprop="name">...</span>
    <span itemprop="mpn">OEM</span>
    <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <span itemprop="price">95.00</span>
      <span itemprop="priceCurrency">BRL</span>
      <link itemprop="availability" href="https://schema.org/InStock" />
    </div>
  </div>
  ```

### 404 amigável

- **RF-029:** Quando ID inválido:
  - Ícone + mensagem "Produto não encontrado"
  - Sugestões: ir para home, buscar, ver categorias
  - Link voltar à página anterior

### Mobile

- **RF-030:** Layout stack (galeria em cima, info abaixo).
- **RF-031:** Botão Adicionar fixo no rodapé (sticky-bottom) — UX padrão e-commerce mobile.

### Permissões

- **RF-032:** Página pública.

---

## Requisitos Não-Funcionais

- **RNF-001:** Página renderiza < 400ms.
- **RNF-002:** Mobile usável.
- **RNF-003:** WCAG 2.1 AA.
- **RNF-004:** SEO: lighthouse ≥ 80.
- **RNF-005:** Schema.org válido.

---

## Critérios de Aceitação

```gherkin
DADO acesso /loja/produto/abc123 (produto existente)
QUANDO página carrega
ENTÃO vejo galeria + info + 3 abas + relacionados
  E breadcrumbs corretos
  E meta tags SEO populados

DADO produto com estoque 0
QUANDO observo
ENTÃO indicador "Esgotado" vermelho
  E botão "Adicionar ao Carrinho" desabilitado
  E CTA "Avise-me" placeholder

DADO produto com 3 equivalências
QUANDO clico aba Equivalências
ENTÃO vejo 3 itens com % economia calculado
  E click em equivalente leva à ficha dela

DADO aba Aplicações + filtro Volvo R450 2020
QUANDO aplico
ENTÃO aplicação matching destaca com badge "✓ Compatível"

DADO clico "Adicionar ao Carrinho" com quantidade=2
QUANDO ação processa
ENTÃO toast "✓ Produto adicionado"
  E mini-preview abre
  E contador header atualiza para +2
  E botão muda temporariamente para "Ver Carrinho"

DADO clico "Compartilhar via WhatsApp"
QUANDO ação processa
ENTÃO abre WhatsApp com mensagem pré-preenchida

DADO acesso /loja/produto/inexistente
QUANDO página carrega
ENTÃO vejo 404 amigável com sugestões

DADO mobile
QUANDO scroll
ENTÃO botão "Adicionar" sticky-bottom permanece visível
```

---

## Fases de Implementação

| Fase | Objetivo                                                                     |
| ---- | ---------------------------------------------------------------------------- |
| 1    | Layout + header de info + galeria placeholder                                |
| 2    | Abas (Aplicações, Equivalências, Especificações) + filtro de compatibilidade |
| 3    | Adicionar ao carrinho + compartilhamento + estoque zerado                    |
| 4    | Produtos relacionados + SEO rico + schema.org                                |
| 5    | Mobile sticky + 404 + polish                                                 |

---

## Dependências

| PRD                                 | Status       |
| ----------------------------------- | ------------ |
| PRD-030 (catálogo + getEquivalents) | 📝           |
| PRD-060 (header/footer)             | 📝           |
| PRD-061 (ProductCard)               | 📝           |
| PRD-064 (Zustand cart store)        | 📝 (próximo) |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-36   | 010-062           |
| **37** | **PRD-063 ATUAL** |
| 38+    | 064-067, 070-071  |

---

## Considerações de Segurança

- Página pública — sem dados sensíveis
- Validação de ID na URL
- Sanitizar conteúdo dinâmico (descrição) antes de exibir

---

## Convenções

| Elemento    | Convenção                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| Página      | `ProductDetailPage`                                                       |
| Componentes | `<ProductGallery>`, `<ProductInfo>`, `<ProductTabs>`, `<RelatedProducts>` |
| Pasta       | `storefront-product/`                                                     |

---

## Notas para o Agente Desenvolvedor

- Reusar `<ProductCard>` em produtos relacionados
- Schema.org via microdata é central para SEO
- Mobile sticky bottom é UX padrão — não esquecer
- Equivalências precisam destaque visual (% economia é diferencial)
- Compartilhamento WhatsApp é central — Brasil
- Lightbox simples; sem dependência pesada

---

## Status

| Campo  | Valor       |
| ------ | ----------- |
| Status | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                    |
| ---------- | ------ | -------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — ficha pública com galeria, abas, equivalências, compartilhamento, SEO rico |

---

**AILA - Sistemas Inteligentes**
