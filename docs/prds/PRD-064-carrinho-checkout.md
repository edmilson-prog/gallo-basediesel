# PRD-064: Carrinho e Checkout (E-commerce)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                   |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                        |
| **Objetivo**          | Construir carrinho persistente, página de carrinho editável, checkout em 3 passos (identificação, endereço, pagamento) e conversão para pedido via PRD-032 |
| **Tipo**              | Feature                                                                                                                                                    |
| **Complexidade**      | Alta                                                                                                                                                       |
| **Total de Fases**    | 5                                                                                                                                                          |
| **Prioridade**        | Alta                                                                                                                                                       |
| **Épico**             | Bloco 5 — E-commerce (Onda 3)                                                                                                                              |
| **PRDs Relacionados** | PRD-030 (Catálogo), PRD-032 (Pedido — destino), PRD-033 (Frete), PRD-060 (Header com contador), PRD-063 (Ficha), PRD-065 (Login no checkout)               |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                         |
| **Padrão de código**  | Feature-based; código em `src/features/storefront-cart/`; rotas `/loja/carrinho`, `/loja/checkout`, `/loja/pedido-confirmado/:id`                          |

### Critérios de Complexidade

> **Justificativa de Alta:** carrinho persistente via Zustand + localStorage (Fase 2 com Supabase), página de carrinho editável (quantidades, remoção), cálculo de frete em tempo real, checkout em 3 passos com validações por etapa, identificação (login do PRD-065 OU guest checkout), endereço (cadastrado ou novo), métodos de pagamento placeholders, revisão final, conversão para IOrder via PRD-032, página de confirmação, e snapshots imutáveis dos preços.

---

## Contexto do Problema

Cliente adicionou produtos ao carrinho via PRD-063. Agora precisa de:

**Carrinho persistente.** Cliente abandona aba — ao voltar, items ainda lá.
**Página de carrinho editável.** Mudar quantidades, remover items, ver totais.
**Checkout claro e curto.** 3 passos no máximo; cada um focado.
**Conversão para pedido.** Carrinho confirmado vira `IOrder` (PRD-032) com origin='ecommerce'.

Este PRD entrega: ciclo completo de carrinho → checkout → pedido. **Pagamento e NF placeholder** no MVP (Fase 2 integra gateways reais).

---

## Conceito da Solução

### Zustand Store (estado global)

```typescript
interface CartStore {
  items: ICartItem[];
  totalItems: number;
  subtotal: number;

  addItem(partId: ID, quantity: number): void;
  updateQuantity(partId: ID, quantity: number): void;
  removeItem(partId: ID): void;
  clearCart(): void;
}

ICartItem {
  partId: ID;
  partName: string;       // snapshot
  partOemCode: string;    // snapshot
  unitPrice: number;      // snapshot do momento
  quantity: number;
  imageUrl?: string;
  addedAt: ISO8601;
}
```

Persistência: localStorage no MVP via middleware `persist` do Zustand.

### Página `/loja/carrinho`

```
┌─────────────────────────────────────────────┐
│ Header global                               │
├─────────────────────────────────────────────┤
│ "Seu Carrinho"                              │
│                                             │
│ ┌─────────────────────────────┬───────────┐│
│ │ ITEM 1                       │ RESUMO    ││
│ │ [img] Nome + OEM             │           ││
│ │       Qty [-]2[+] R$190      │ Subtotal  ││
│ │       Remover                │ R$ 380    ││
│ │                              │           ││
│ │ ITEM 2 ...                   │ Frete     ││
│ │                              │ R$ 50     ││
│ │ + Cupom (placeholder)        │           ││
│ │                              │ Total     ││
│ │                              │ R$ 430    ││
│ │                              │           ││
│ │                              │[Finalizar]││
│ └─────────────────────────────┴───────────┘│
├─────────────────────────────────────────────┤
│ "Continue comprando" → /loja                │
└─────────────────────────────────────────────┘
```

### Componentes do carrinho

- **Lista de items**: cards com imagem placeholder, nome, OEM, quantidade editável (selector ou input), preço unitário, subtotal, botão remover
- **Cupom**: input com tooltip "Cupons disponíveis na Fase 2" (placeholder)
- **Resumo lateral** (sticky em desktop):
  - Subtotal
  - Frete (com input de CEP / endereço)
  - Total
  - Botão "Finalizar Pedido" grande
- **CTA "Continuar comprando"** → home

### Cálculo de frete

- Input "CEP" no resumo (ou usar endereço de cliente logado)
- Click "Calcular" chama `calculateShipping` (PRD-033)
- Valor exibido (ou "a combinar" se região não mapeada)

### Carrinho vazio

- Ícone + mensagem amigável "Seu carrinho está vazio"
- CTA "Explorar catálogo" → home

### Checkout em 3 passos

Rota `/loja/checkout` com wizard de 3 etapas:

**Passo 1 — Identificação:**

- Cliente já logado: avança direto
- Cliente não logado: 2 opções
  - **Login** (modal pequeno, ou redireciona para PRD-065 com return URL)
  - **Continuar como visitante** (informa nome + CPF/CNPJ + email + telefone)

**Passo 2 — Endereço:**

- Cliente logado com endereços cadastrados: select
- Sem endereço cadastrado / visitante: formulário completo
  - CEP (busca endereço via CEP — placeholder ou API ViaCEP simples no MVP)
  - Rua, número, complemento, bairro, cidade, estado
  - Opção "Salvar este endereço" (se logado)

**Passo 3 — Pagamento e Revisão:**

- **Forma de pagamento** (radio com 3 opções placeholders):
  - PIX (placeholder: "Você receberá o código PIX após confirmação")
  - Boleto (placeholder: "Boleto será enviado por email")
  - Cartão de crédito (placeholder: "Integração na Fase 2")
- **Revisão final**: items, endereço, valores
- **Botão "Confirmar Pedido"** grande
- Disclaimer: "Pedido em modo demonstração — pagamento real disponível na Fase 2"

### Confirmação do pedido

Ao clicar "Confirmar":

1. Cria `IOrder` via `createOrderFromCart()` (similar a `createOrderFromQuote` do PRD-032)
2. `IOrder.origin = 'ecommerce'`
3. Status inicial: `paymentStatus='pending_payment'`, `fulfillmentStatus='pending'`
4. `IOrder.conversationId` vazio (não veio de SDR)
5. Vincula a `customerId` se logado; senão cria customer placeholder via dados informados
6. Atribui vendedor responsável: distribuição automática (PRD-013) ou Owner manual
7. Limpa carrinho
8. Navega para `/loja/pedido-confirmado/:orderId`

### Página de confirmação

```
✓ Pedido confirmado!
Número: #PD-2026-0042

Você receberá email e WhatsApp com detalhes.

[Resumo do pedido]
[Acessar minha conta] → /loja/conta
[Voltar para a loja] → /loja
```

Em modo demonstração: banner "Pedido registrado em modo demo — sistema completo na Fase 2".

### Mini-preview do carrinho (header)

Quando cliente adiciona item (PRD-063):

- Mini-drawer ou popover do contador do header
- Mostra últimos 3 items + total
- Botão "Ver Carrinho Completo" → `/loja/carrinho`

### Persistência

- localStorage no MVP via Zustand persist
- Sincronização entre abas (Fase 2)
- Migration para Supabase na Fase 2 (com login do cliente)

### Validações

- Quantidade ≥ 1 e ≤ stockQuantity (do PRD-030)
- Avisar se produto perdeu estoque desde adição: "X esgotou após você adicionar"
- Endereço obrigatório
- CEP válido (formato XXXXX-XXX)

### Permissões

- **Público**: pode usar carrinho e checkout como visitante
- **Logado**: experiência otimizada (endereço salvo, conta vinculada)

### Alternativas Consideradas

| Alternativa                   | Por que descartada                            |
| ----------------------------- | --------------------------------------------- |
| Login obrigatório no checkout | Atrito; guest checkout converte mais          |
| Checkout em 1 página          | UX inferior para mobile; 3 passos guia melhor |
| Pagamento real no MVP         | Complexidade alta; integração na Fase 2       |
| Sem mini-preview no header    | Cliente perde contexto após adicionar         |
| Carrinho server-side no MVP   | localStorage suficiente; Fase 2 migra         |
| Cupom funcional no MVP        | Placeholder coerente; sistema completo Fase 2 |

---

## Escopo

### Incluído

- ✅ Zustand store `useCartStore` com persistência localStorage
- ✅ Página `/loja/carrinho` com items editáveis + resumo + cálculo de frete
- ✅ Mini-preview do carrinho no header (drawer/popover)
- ✅ Estado vazio do carrinho com CTA
- ✅ Wizard de checkout em 3 passos `/loja/checkout`
- ✅ Passo 1 (Identificação): login ou guest
- ✅ Passo 2 (Endereço): com busca de CEP placeholder
- ✅ Passo 3 (Pagamento + Revisão): 3 métodos placeholder
- ✅ Conversão para IOrder via `createOrderFromCart()`
- ✅ Página de confirmação `/loja/pedido-confirmado/:orderId`
- ✅ Distribuição automática do pedido (PRD-013)
- ✅ Snapshots imutáveis dos preços
- ✅ Validações (estoque disponível, CEP, campos obrigatórios)
- ✅ Aviso de estoque insuficiente
- ✅ Banner "Modo demonstração" em pagamento e confirmação
- ✅ Integração com PRD-033 (frete), PRD-032 (pedido), PRD-065 (login opcional)
- ✅ Mobile responsivo
- ✅ Cupom placeholder

### Excluído

- ❌ Pagamento real (Pix Open Banking, gateway de cartão, boleto bancário) — Fase 2
- ❌ Cupons funcionais — Fase 2
- ❌ Programa de fidelidade — Fase 2
- ❌ Compra recorrente — Fase 2
- ❌ Múltiplos endereços por checkout (entrega dividida) — Fase 2
- ❌ Sincronização cross-device — Fase 2
- ❌ "Salvar para depois" (wishlist) — Fase 2
- ❌ Cálculo de impostos detalhado — Fase 2
- ❌ Programa de frete grátis acima de X — Fase 2
- ❌ Combinar compra com orçamento existente — Fase 2

---

## Requisitos Funcionais

### Store Zustand

- **RF-001:** Criar `useCartStore` em `src/features/storefront-cart/store/`.
- **RF-002:** Middleware `persist` salvando em localStorage.
- **RF-003:** Métodos: `addItem`, `updateQuantity`, `removeItem`, `clearCart`.
- **RF-004:** Computeds: `totalItems`, `subtotal`.
- **RF-005:** Validação de quantidade ≥ 1 e ≤ stockQuantity ao adicionar/atualizar.

### Página `/loja/carrinho`

- **RF-006:** `CartPage` em `src/features/storefront-cart/pages/`.
- **RF-007:** Lista de items com edição inline:
  - Quantidade via selector `-/+` ou input
  - Botão remover
  - Atualiza store global
- **RF-008:** Resumo lateral sticky (desktop) com:
  - Subtotal
  - Input CEP + botão "Calcular frete"
  - Frete (resultado)
  - Total
  - Botão "Finalizar Pedido" (link `/loja/checkout`)
- **RF-009:** Mobile: resumo abaixo dos items, botão sticky-bottom.
- **RF-010:** Cupom input com tooltip "Disponível na Fase 2".
- **RF-011:** CTA "Continuar comprando" → home.

### Carrinho vazio

- **RF-012:** Estado vazio com ícone + mensagem + CTA "Explorar catálogo".

### Mini-preview do header

- **RF-013:** `<CartMiniPreview>` componente:
  - Aparece ao adicionar item (3s)
  - Ou ao hover/click no contador do header
  - Mostra últimos 3 items + subtotal
  - Botão "Ver Carrinho Completo"

### Wizard de checkout

- **RF-014:** `CheckoutPage` em `/loja/checkout` com state local de wizard.
- **RF-015:** Stepper visual com 3 passos: Identificação → Endereço → Pagamento.
- **RF-016:** Navegação entre passos com validação por etapa.
- **RF-017:** Botões "Voltar" / "Continuar".

### Passo 1 — Identificação

- **RF-018:** Se cliente logado (PRD-065), avança automaticamente.
- **RF-019:** Senão, 2 opções:
  - Botão "Entrar" → modal ou redirect para `/loja/login?return=/loja/checkout`
  - Botão "Continuar como visitante" → formulário inline:
    - Nome completo
    - CPF ou CNPJ (radio PF/PJ)
    - Email
    - Telefone (WhatsApp)
- **RF-020:** Validações: nome obrigatório, CPF/CNPJ válido formato (validação simples no MVP), email válido, telefone 10-11 dígitos.

### Passo 2 — Endereço

- **RF-021:** Se cliente logado com endereços salvos: select com radio.
- **RF-022:** Botão "+ Novo endereço" abre formulário.
- **RF-023:** Formulário:
  - CEP (input formatado XXXXX-XXX)
  - Botão "Buscar" → chama ViaCEP placeholder (API real OK; ou apenas validação manual no MVP)
  - Rua, Número, Complemento, Bairro, Cidade, Estado
- **RF-024:** Toggle "Salvar este endereço para futuras compras" (se logado).

### Passo 3 — Pagamento + Revisão

- **RF-025:** Radio com 3 métodos: PIX / Boleto / Cartão (todos placeholders).
- **RF-026:** Cada opção tem descrição/disclaimer:
  - PIX: "Você receberá o código PIX após confirmação"
  - Boleto: "Boleto será enviado por email"
  - Cartão: "Integração disponível na Fase 2"
- **RF-027:** Revisão final:
  - Items
  - Endereço selecionado
  - Forma de pagamento
  - Valores (subtotal, frete, total)
- **RF-028:** Banner "Pedido em modo demonstração — pagamento real disponível na Fase 2".
- **RF-029:** Botão "Confirmar Pedido" (primário grande).

### Conversão para pedido

- **RF-030:** Função `createOrderFromCart(cart, identification, address, paymentMethod)`:
  - Cria `IOrder` com `origin='ecommerce'`
  - Items copiados como snapshots
  - paymentStatus='pending_payment', fulfillmentStatus='pending'
  - paymentMethod conforme escolha
  - customerId vinculado (se logado) ou criado novo (placeholder se visitante)
  - sellerId atribuído via distribuição (PRD-013) — modo round-robin para e-commerce
- **RF-031:** Limpa carrinho via `clearCart()`.
- **RF-032:** Audit log de criação.

### Página de confirmação

- **RF-033:** `OrderConfirmedPage` em `/loja/pedido-confirmado/:orderId`.
- **RF-034:** Mensagem de sucesso + número do pedido + resumo.
- **RF-035:** Texto: "Você receberá email e WhatsApp com detalhes" (placeholder).
- **RF-036:** CTAs: "Acessar minha conta" (PRD-065), "Voltar para a loja".
- **RF-037:** Banner modo demo.

### Validações de estoque

- **RF-038:** Ao entrar no carrinho ou checkout, verificar se items ainda têm estoque suficiente.
- **RF-039:** Se algum item esgotou: alerta "X não está mais disponível — foi removido do seu carrinho"; remove automaticamente.
- **RF-040:** Se quantidade > estoque disponível: ajusta automaticamente para o máximo, mostra aviso.

### Mobile

- **RF-041:** Botão "Finalizar" sticky-bottom no /loja/carrinho.
- **RF-042:** Wizard de checkout em scroll vertical (não sidebar).

---

## Requisitos Não-Funcionais

- **RNF-001:** Carrinho persiste corretamente no localStorage.
- **RNF-002:** Wizard renderiza < 400ms por passo.
- **RNF-003:** Mobile usável.
- **RNF-004:** WCAG 2.1 AA — wizard com aria-live announcing changes.
- **RNF-005:** Validações claras; mensagens de erro visíveis e específicas.

---

## Critérios de Aceitação

```gherkin
DADO adicionei 2 produtos ao carrinho via PRD-063
QUANDO fecho aba e abro novamente
ENTÃO carrinho mantém os 2 items (localStorage)

DADO acesso /loja/carrinho com 2 items
QUANDO ajusto quantidade do item 1 de 1 para 3
ENTÃO subtotal atualiza
  E store global atualiza
  E badge do header reflete

DADO informo CEP 98400-000 (Frederico Westphalen)
QUANDO clico "Calcular frete"
ENTÃO frete = R$ 50 (regra default PRD-033)
  E total atualiza

DADO carrinho com item que esgotou no catálogo
QUANDO acesso /loja/carrinho
ENTÃO alerta: "Filtro Volvo esgotou — removido do seu carrinho"
  E item é removido automaticamente

DADO acesso /loja/checkout como visitante
QUANDO passo 1
ENTÃO vejo opções "Entrar" e "Continuar como visitante"

DADO preencho dados de visitante e avanço para passo 2
QUANDO informo CEP e busco endereço
ENTÃO formulário preenche cidade/estado automaticamente (ou pede manual)

DADO passo 3 com método PIX selecionado
QUANDO clico "Confirmar Pedido"
ENTÃO IOrder é criada com origin='ecommerce'
  E carrinho é limpo
  E navego para /loja/pedido-confirmado/:id
  E vejo mensagem de sucesso + banner modo demo

DADO cliente logado faz checkout
QUANDO confirma
ENTÃO IOrder.customerId vincula ao customer logado
  E endereço opcionalmente salvo no perfil

DADO mobile
QUANDO acesso /loja/carrinho
ENTÃO resumo abaixo dos items
  E botão "Finalizar" sticky-bottom
```

---

## Fases de Implementação

| Fase | Objetivo                                             |
| ---- | ---------------------------------------------------- |
| 1    | Zustand store + página /loja/carrinho + mini-preview |
| 2    | Wizard checkout 3 passos com state                   |
| 3    | Validações + cálculo de frete + busca CEP            |
| 4    | Conversão para pedido + página confirmação           |
| 5    | Mobile + sticky-bottom + polish + audit              |

---

## Dependências

| PRD                           | Status             |
| ----------------------------- | ------------------ |
| PRD-030 (estoque, preço)      | 📝                 |
| PRD-032 (createOrderFromCart) | 📝                 |
| PRD-033 (frete)               | 📝                 |
| PRD-060 (header com contador) | 📝 (lote anterior) |
| PRD-063 (ficha + addToCart)   | 📝 (lote atual)    |

### Futuras

| PRD             | Como Lidar              |
| --------------- | ----------------------- |
| PRD-065 (Login) | Botão Entrar no passo 1 |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-37   | 010-063           |
| **38** | **PRD-064 ATUAL** |
| 39+    | 065-067, 070-071  |

---

## Considerações de Segurança

- Checkout é entrada de dados sensíveis (CPF/CNPJ, endereço) — validação rigorosa
- localStorage: dados não criptografados (snapshot de preços OK; sem dados sensíveis até checkout)
- Customer placeholder visitante: validar CPF/CNPJ no MVP (formato; verificação real Fase 2)
- Audit log do pedido obrigatório

---

## Convenções

| Elemento    | Convenção                                         |
| ----------- | ------------------------------------------------- |
| Página      | `CartPage`, `CheckoutPage`, `OrderConfirmedPage`  |
| Store       | `useCartStore`                                    |
| Componentes | `<CartItem>`, `<CartSummary>`, `<CheckoutWizard>` |
| Pasta       | `storefront-cart/`                                |

---

## Notas para o Agente Desenvolvedor

- Zustand persist é a base — sem isso, carrinho se perde
- Snapshots imutáveis no momento de adicionar (preço pode mudar depois)
- Validação de estoque antes de cada passo importante (carrinho, checkout, confirmação)
- Banner "Modo demonstração" em pagamento + confirmação é importante (transparência)
- ViaCEP é opcional (pode ser placeholder com input manual)
- Distribuição do pedido para vendedor via PRD-013 modo round-robin

---

## Status

| Campo  | Valor       |
| ------ | ----------- |
| Status | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                           |
| ---------- | ------ | ----------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — carrinho persistente, checkout em 3 passos, conversão para pedido |

---

**AILA - Sistemas Inteligentes**
