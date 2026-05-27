# PRD-061: Busca Avançada (E-commerce)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                    |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                         |
| **Objetivo**          | Construir busca avançada do e-commerce com busca textual robusta, filtros laterais, identificação por veículo (caminhão), auto-complete inteligente, ordenações e paginação |
| **Tipo**              | Feature                                                                                                                                                                     |
| **Complexidade**      | Alta                                                                                                                                                                        |
| **Total de Fases**    | 5                                                                                                                                                                           |
| **Prioridade**        | Alta                                                                                                                                                                        |
| **Épico**             | Bloco 5 — E-commerce (Onda 3)                                                                                                                                               |
| **PRDs Relacionados** | PRD-021 (Identificação Peça SDR — reusa lógica), PRD-030 (Catálogo), PRD-060 (Home), PRD-062 (Categoria), PRD-063 (Ficha), PRD-064 (Carrinho)                               |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                          |
| **Padrão de código**  | Feature-based; código em `src/features/storefront-search/`; rota `/loja/busca`                                                                                              |

### Critérios de Complexidade

> **Justificativa de Alta:** busca textual em múltiplos campos com debounce e auto-complete, filtros combinados (categoria, marca compatível, preço, estoque, fabricante), **filtro por veículo** (cliente informa marca/modelo/ano e sistema filtra peças compatíveis via aplicações do PRD-030), URL sync para SEO e compartilhamento, paginação eficiente, ordenações múltiplas, e reaproveitamento da engine `searchPartsByApplication` do PRD-021 mas em contexto público.

---

## Contexto do Problema

Cliente B2C ou B2B chega no e-commerce e quer encontrar peça. Hoje sem busca avançada:

**Busca por texto livre não basta.** "Filtro óleo" retorna 50 resultados — mas cliente quer pro Volvo R450 dele. Sem filtro por veículo, processa lista enorme. **OEM ainda confuso para B2C.** Cliente comum digita "filtro" — não sabe OEM. Auto-complete inteligente ajuda. **Sem filtros laterais, refinamento impossível.** Quer só Volvo originais? Quer faixa de preço? Sem filtros, perde-se.

Este PRD entrega: busca poderosa com texto + filtros laterais + identificação por veículo + UX otimizado para conversão.

---

## Conceito da Solução

### Página `/loja/busca`

Layout em 2 colunas (desktop):

- **Esquerda (sidebar)**: filtros
- **Direita (main)**: resultados

Mobile: filtros em drawer/sheet.

### Header da página

- Input de busca grande (espelha o do header global, sincronizado)
- Contador de resultados
- Ordenação (dropdown)

### Filtros laterais

**Identificação por veículo** (destaque no topo):

- "Qual seu caminhão?"
- 3 campos: Marca + Modelo + Ano
- Botão "Aplicar"
- Quando aplicado, badge "🚛 Filtrado para Volvo R450 2020" com X para limpar

**Filtros tradicionais:**

- **Categoria** (multi-select)
- **Marca compatível** (radio: Volvo / Scania / Mercedes / Ford / Iveco)
- **Fabricante da peça** (multi-select: Volvo / Mann / Mahle / etc.)
- **Tipo** (radio: Original / Equivalente / Ambos)
- **Faixa de preço** (range slider)
- **Em estoque** (toggle "Apenas disponíveis")

### Resultados

Grid de produtos (3 colunas desktop, 2 tablet, 1 mobile):

- Imagem placeholder (ícone categoria)
- Nome
- Código OEM
- Fabricante + badge Original/Equivalente
- Preço
- Indicador estoque (verde/amarelo/vermelho compactos)
- Botão "Adicionar ao carrinho" (rápido) + Click no card leva à ficha (PRD-063)

### Auto-complete

Quando digita no input:

- Debounce 300ms
- Mostra dropdown com até 8 sugestões:
  - Produtos que casam (nome + OEM)
  - Categorias relacionadas
  - Marcas se digitado nome de marca
- Click na sugestão executa busca refinada ou navega para ficha

### Ordenações

- Relevância (default)
- Menor preço
- Maior preço
- Mais vendidos (consulta PRD-041)
- Lançamentos (createdAt desc)

### URL Sync

Filtros, busca, ordenação, página → query params:

- `?q=filtro+oleo&categoria=filtro&veiculo=volvo-r450-2020&page=1&sort=preco-asc`
- Permite compartilhar link e SEO básico

### Estado vazio

Quando nenhum resultado:

- Ícone amigável
- "Não encontramos peças para sua busca"
- Sugestões: "Tente buscar pelo código OEM" / "Limpe filtros"
- CTA "Falar com vendedor" (link WhatsApp)

### Permissões

- **Público**: tudo
- **Logado**: mesmo, com preferências do cliente salvas (Fase 2)

### Reuso do PRD-021

Engine `searchPartsByApplication(attributes)` do PRD-030 (criada para consumo do PRD-021 SDR) é reutilizada aqui. Não há duplicação de lógica.

### Alternativas Consideradas

| Alternativa                                  | Por que descartada                       |
| -------------------------------------------- | ---------------------------------------- |
| Apenas busca textual sem filtros             | Catálogo grande exige refinamento        |
| Sem filtro por veículo                       | Diferencial GALLO; foco em diesel pesado |
| Auto-complete básico (sem categorias/marcas) | UX inferior                              |
| Sem URL sync                                 | Compartilhamento e SEO sofrem            |
| Carrossel infinito sem paginação             | UX ruim em catálogos grandes             |
| Filtros em modal único                       | Drawer/sidebar é padrão de e-commerce    |

---

## Escopo

### Incluído

- ✅ Página `/loja/busca` com layout 2 colunas (desktop) / drawer (mobile)
- ✅ Input de busca com debounce + auto-complete
- ✅ 6 filtros laterais (veículo, categoria, marca compatível, fabricante, tipo, preço, estoque)
- ✅ Resultados em grid responsivo
- ✅ Botão "Adicionar ao carrinho" rápido em cada card
- ✅ 5 ordenações
- ✅ Paginação (24/página default)
- ✅ URL sync completo
- ✅ Auto-complete com produtos + categorias + marcas
- ✅ Estado vazio com CTAs
- ✅ Integração com PRD-030 (catálogo + `searchPartsByApplication`)
- ✅ Integração com PRD-064 (adicionar ao carrinho)
- ✅ Integração com header do PRD-060 (busca sincronizada)
- ✅ Mobile responsivo (drawer de filtros)

### Excluído

- ❌ Busca por foto / OCR — Fase 2
- ❌ Busca por voz — Fase 2
- ❌ Sugestões personalizadas via IA — Fase 2
- ❌ Histórico de buscas do cliente — Fase 2
- ❌ Save search / alertas — Fase 2
- ❌ Visualização em lista vs grid (toggle) — apenas grid no MVP
- ❌ Filtros avançados (peso, dimensões) — Fase 2

---

## Requisitos Funcionais

### Página e estrutura

- **RF-001:** Rota `/loja/busca` com `SearchResultsPage`.
- **RF-002:** Layout 2 colunas desktop, 1 coluna mobile com filtros em drawer.
- **RF-003:** Reuso de `<StorefrontHeader>` e `<StorefrontFooter>` do PRD-060.

### Input e auto-complete

- **RF-004:** Input grande no topo da página espelhando o do header (controlled via Zustand para sync).
- **RF-005:** Debounce 300ms na busca.
- **RF-006:** Auto-complete com dropdown:
  - Até 8 sugestões
  - Mix de: produtos (top match), categorias relacionadas, marcas
  - Cada item com tipo (badge) + nome
- **RF-007:** Click em produto sugerido navega para ficha; click em categoria/marca aplica filtro.

### Filtros laterais

- **RF-008:** **Filtro por veículo** (destacado):
  - 3 dropdowns dependentes: Marca → Modelo → Ano
  - Botão "Aplicar"
  - Quando aplicado, badge visível com botão de limpar
- **RF-009:** Filtros tradicionais conforme conceito.
- **RF-010:** Indicador "N filtros ativos" + botão "Limpar tudo".

### Engine de busca

- **RF-011:** Reusa `searchPartsByText`, `searchPartsByApplication`, `findByOemCode` do PRD-030.
- **RF-012:** Combinação inteligente: se cliente digitou OEM, prioriza findByOemCode; se digitou texto livre, searchByText; se filtro veículo ativo, combina com searchByApplication.

### Resultados

- **RF-013:** Grid responsivo (1/2/3 colunas).
- **RF-014:** Cards de produto com:
  - Imagem placeholder (ícone categoria)
  - Nome (truncate em 2 linhas)
  - Código OEM
  - Fabricante + badge Original/Equivalente
  - Preço formatado BRL
  - Indicador estoque (compacto)
  - Botão "Adicionar ao carrinho" (acionando PRD-064)
- **RF-015:** Click no card (exceto botão) leva à ficha (PRD-063).

### Ordenações

- **RF-016:** Dropdown com 5 opções (relevância default).
- **RF-017:** Lógica de ordenação aplicada após filtros.

### Paginação

- **RF-018:** 24 produtos por página.
- **RF-019:** Botões "Anterior" / "Próxima" + indicador "Página X de Y".
- **RF-020:** URL sync com parâmetro `page`.

### URL Sync

- **RF-021:** Todos os filtros + busca + ordenação + página sincronizados em query params.
- **RF-022:** Compartilhar link reproduz mesmo estado.

### Estado vazio

- **RF-023:** Quando 0 resultados:
  - Ícone + mensagem amigável
  - Sugestões inline (limpar filtros, buscar OEM)
  - CTA WhatsApp (placeholder telefone GALLO)

### Adicionar ao carrinho

- **RF-024:** Botão "Adicionar ao carrinho" rápido:
  - Adiciona com quantidade=1
  - Toast: "Produto adicionado!"
  - Atualiza contador do header via Zustand

### Mobile

- **RF-025:** Filtros em drawer/sheet (slide-up ou slide-from-left).
- **RF-026:** Botão "Filtros" no topo com badge contador.
- **RF-027:** Cards em coluna única.

### Permissões

- **RF-028:** Página pública; sem GuardedRoute.

---

## Requisitos Não-Funcionais

- **RNF-001:** Resultados renderizam < 400ms para 200 peças mockadas.
- **RNF-002:** Auto-complete responde em < 200ms.
- **RNF-003:** Mobile usável.
- **RNF-004:** WCAG 2.1 AA.
- **RNF-005:** SEO: title dinâmico com busca, description amigável.

---

## Critérios de Aceitação

```gherkin
DADO acesso /loja/busca?q=filtro
QUANDO página carrega
ENTÃO vejo resultados de produtos cujo nome/OEM/descrição casa
  E filtros laterais disponíveis
  E URL preserva query

DADO aplico filtro veículo Volvo R450 2020
QUANDO botão "Aplicar"
ENTÃO resultados são reduzidos a peças com application matching
  E badge "🚛 Filtrado para Volvo R450 2020" visível
  E URL atualiza com parâmetros

DADO digito "vol" no input
QUANDO debounce passa
ENTÃO dropdown mostra: produtos com "vol" no nome, sugestão de marca Volvo, categorias relacionadas

DADO clico em produto do auto-complete
QUANDO ação processa
ENTÃO navego para /loja/produto/:id (PRD-063)

DADO clico "Adicionar ao carrinho" em um card
QUANDO ação processa
ENTÃO toast confirma
  E contador no header do PRD-060 atualiza
  E permanezco na lista (não navega)

DADO 0 resultados
QUANDO observado
ENTÃO vejo mensagem amigável + sugestões
  E CTA WhatsApp visível

DADO mobile (< 768px)
QUANDO clico no botão Filtros
ENTÃO drawer abre com filtros
  E posso aplicar e fechar
```

---

## Fases de Implementação

| Fase | Objetivo                                    |
| ---- | ------------------------------------------- |
| 1    | Página + busca textual + grid de resultados |
| 2    | Filtros laterais (todos os 6) + URL sync    |
| 3    | Auto-complete + ordenações + paginação      |
| 4    | Adicionar ao carrinho + integração PRD-064  |
| 5    | Mobile drawer + estado vazio + polish       |

---

## Dependências

| PRD                        | Status          |
| -------------------------- | --------------- |
| PRD-030 (engines de busca) | 📝              |
| PRD-060 (header)           | 📝 (lote atual) |

### Futuras

| PRD                 | Como Lidar                       |
| ------------------- | -------------------------------- |
| PRD-062 (Categoria) | Compartilha componentes de cards |
| PRD-063 (Ficha)     | Link de drill-down               |
| PRD-064 (Carrinho)  | Adicionar ao carrinho            |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-34   | 010-060           |
| **35** | **PRD-061 ATUAL** |
| 36+    | 062-067, 070-071  |

---

## Considerações de Segurança

- Página pública — sem dados sensíveis expostos
- Rate limit no input (Fase 2)
- XSS: sanitizar query antes de exibir

---

## Convenções

| Elemento    | Convenção                                            |
| ----------- | ---------------------------------------------------- |
| Página      | `SearchResultsPage`                                  |
| Componentes | `<SearchFilters>`, `<ProductCard>`, `<AutoComplete>` |
| Pasta       | `storefront-search/`                                 |

---

## Notas para o Agente Desenvolvedor

- Reusar `searchPartsByApplication` do PRD-030 (não duplicar)
- `<ProductCard>` componente reutilizável (PRD-062 também usa)
- URL sync via React Router searchParams ou query-string lib
- Filtro por veículo é o diferencial GALLO — destacar visualmente
- Auto-complete não bloqueia digitação — mostra abaixo sem interromper
- Mobile-first nos filtros (drawer é central)

---

## Status

| Campo  | Valor       |
| ------ | ----------- |
| Status | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                        |
| ---------- | ------ | -------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — busca avançada com filtro por veículo, auto-complete, URL sync |

---

**AILA - Sistemas Inteligentes**
