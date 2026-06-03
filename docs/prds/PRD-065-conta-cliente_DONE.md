# PRD-065: Conta do Cliente (E-commerce)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                      |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                           |
| **Objetivo**          | Construir a área logada do cliente em `/loja/conta` — login/cadastro, dashboard, histórico de pedidos e orçamentos, perfil, endereços salvos, veículos cadastrados (B2B), logout              |
| **Tipo**              | Feature                                                                                                                                                                                       |
| **Complexidade**      | Alta                                                                                                                                                                                          |
| **Total de Fases**    | 5                                                                                                                                                                                             |
| **Prioridade**        | Alta                                                                                                                                                                                          |
| **Épico**             | Bloco 5 — E-commerce (Onda 3)                                                                                                                                                                 |
| **PRDs Relacionados** | PRD-006 (Auth — placeholder), PRD-012 (Cliente), PRD-016 (Veículos B2B), PRD-031 (Orçamentos), PRD-032 (Pedidos), PRD-060 (Header), PRD-064 (Carrinho), PRD-071 (Portal completo — esqueleto) |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                            |
| **Padrão de código**  | Feature-based; código em `src/features/storefront-account/`; rotas `/loja/login`, `/loja/cadastro`, `/loja/conta/*`                                                                           |

### Critérios de Complexidade

> **Justificativa de Alta:** sistema de auth mock para cliente (separado do auth interno PRD-006), múltiplas páginas (login, cadastro, dashboard, pedidos, orçamentos, perfil, endereços, veículos para B2B), discriminated union B2B/B2C com fluxos diferentes, integração com 5+ PRDs (012/016/031/032/064), gerenciamento de sessão, recovery de senha placeholder, e estrutura preparada para Supabase Auth na Fase 2.

---

## Contexto do Problema

Cliente que comprou (PRD-064) ou está prestes a comprar precisa de área pessoal:

**Acompanhar pedido**: "Quando chega minha peça?" — status visual.
**Histórico**: "Comprei aquele filtro mês passado, qual era?" — recompra fácil.
**Dados salvos**: não digitar endereço toda compra.
**Cliente B2B com frota**: gerenciar veículos cadastrados para facilitar compras compatíveis.

Este PRD entrega: experiência completa de área logada com foco em recompra e gestão.

> **Nota:** PRD-071 (auxiliar) é o "Portal do Cliente" completo (esqueleto profundo com mais features B2B avançadas). Este PRD-065 cobre essencial para conversão e-commerce.

---

## Conceito da Solução

### Estrutura de rotas

```
/loja/login              → página de login
/loja/cadastro           → página de cadastro
/loja/recuperar-senha    → placeholder
/loja/conta              → dashboard (autenticado)
/loja/conta/pedidos      → lista de pedidos
/loja/conta/pedidos/:id  → detalhe do pedido
/loja/conta/orcamentos   → lista de orçamentos (PRD-031)
/loja/conta/orcamentos/:id → detalhe
/loja/conta/perfil       → editar dados
/loja/conta/enderecos    → endereços salvos
/loja/conta/veiculos     → veículos cadastrados (B2B)
```

### Login `/loja/login`

Formulário simples:

- Email
- Senha
- "Esqueci minha senha" (link placeholder)
- "Cadastre-se" link
- Botão "Entrar"
- Opcional: "Continuar como visitante" (volta ao checkout sem login)

Auth mock no MVP:

- Validação básica
- Cria sessão em Zustand store + localStorage
- Não há senha real verificada (qualquer senha + email mockado = login)
- Fase 2: Supabase Auth real

### Cadastro `/loja/cadastro`

Toggle B2B / B2C:

- **B2C** (Pessoa Física):
  - Nome completo
  - CPF
  - Email
  - Telefone (WhatsApp)
  - Senha + confirmação
- **B2B** (Empresa):
  - Razão social
  - Nome fantasia
  - CNPJ
  - Nome do contato principal
  - Email comercial
  - Telefone
  - Senha + confirmação

Validações de formato (CPF/CNPJ); LGPD checkbox.

### Dashboard `/loja/conta`

```
"Olá, [nome]!"

[Card "Pedidos"]    [Card "Orçamentos"]    [Card "Perfil"]
3 ativos            1 enviado              [Editar]
Ver todos           Ver todos

[Sidebar lateral]
- Dashboard
- Pedidos
- Orçamentos
- Perfil
- Endereços
- Veículos (B2B only)
- Sair
```

Layout: sidebar de navegação + main content.

### Histórico de pedidos `/loja/conta/pedidos`

Lista de `IOrder` filtrada por `customerId` do logado:

- Card por pedido: número, data, total, status badge, itens
- Click leva ao detalhe

### Detalhe do pedido `/loja/conta/pedidos/:id`

Versão simplificada do PRD-032 para visualização do cliente:

- Header com status
- Items
- Endereço de entrega
- Forma de pagamento + status
- Botão "Repetir pedido" (adiciona items ao carrinho)
- Botão "Falar sobre este pedido" (link WhatsApp)

### Histórico de orçamentos `/loja/conta/orcamentos`

Lista de `IQuote` do cliente:

- Card: número, data, validade, total, status
- Click leva ao detalhe
- Pode aceitar orçamento ainda válido → cria pedido (PRD-031 flow)

### Perfil `/loja/conta/perfil`

- Edição de dados pessoais
- Senha atual + nova senha (mock)
- Preferências (newsletter — placeholder)

### Endereços `/loja/conta/enderecos`

- Lista de endereços cadastrados
- Adicionar / editar / remover
- Marcar um como padrão

### Veículos (B2B only) `/loja/conta/veiculos`

- Reuso do componente `<CustomerVehiclesList>` do PRD-016
- Adicionar / editar veículos da frota
- Útil para autocomplete em buscas e checkout

### Header global após login

Substitui botão "Entrar" por:

- Avatar + nome (truncate)
- Dropdown: "Minha conta", "Meus pedidos", "Sair"

### Logout

- Limpa sessão (Zustand + localStorage)
- Mantém carrinho (não vincular customer)
- Redireciona para `/loja`

### Sessão mock

```typescript
useAuthStore {
  isAuthenticated: boolean;
  user: ICustomer | null;  // dados completos
  login(email, password): Promise<boolean>;
  register(data): Promise<boolean>;
  logout(): void;
}
```

Persistência localStorage; expira em 30 dias mock.

### Sincronização com PRD-064 (checkout)

Quando cliente logado faz checkout:

- Endereços salvos disponíveis
- Customer já vinculado
- Veículo opcionalmente selecionável para o pedido (`appliedToVehicleId` em IOrderItem — PRD-032)

### Recuperação de senha

Página placeholder com:

- Input email
- Botão "Enviar instruções"
- Toast: "Instruções enviadas (modo demonstração — funcionalidade completa na Fase 2)"

### Permissões

- **Visitante**: redireciona para login ao tentar acessar `/loja/conta/*`
- **Logado**: tudo acessível
- **Cliente B2B**: vê tab Veículos; cliente B2C não vê

### Alternativas Consideradas

| Alternativa                     | Por que descartada                                             |
| ------------------------------- | -------------------------------------------------------------- |
| Auth real no MVP                | Complexidade alta; mock + Supabase Fase 2                      |
| Login obrigatório no checkout   | Atrito; PRD-064 permite guest                                  |
| Sem área de orçamentos          | Cliente B2B recebe orçamentos via vendedor; precisa visualizar |
| Sem veículos para B2B           | Diferencial GALLO; B2B com frota precisa                       |
| Mistura B2B/B2C no cadastro     | Fluxos diferentes; toggle é melhor UX                          |
| OAuth (Google, Facebook) no MVP | Fase 2                                                         |

---

## Escopo

### Incluído

- ✅ Páginas: login, cadastro, dashboard, pedidos, orçamentos, perfil, endereços, veículos (B2B)
- ✅ Auth store mock com Zustand + localStorage
- ✅ Discriminated B2B/B2C no cadastro
- ✅ Validações de campos (CPF/CNPJ, email, senha, etc.)
- ✅ Recuperação de senha placeholder
- ✅ Layout sidebar + main no /loja/conta
- ✅ Histórico de pedidos com card detalhado
- ✅ Detalhe de pedido com "Repetir pedido"
- ✅ Histórico de orçamentos com aceite (link PRD-031)
- ✅ Edição de perfil
- ✅ CRUD de endereços
- ✅ Tab Veículos para B2B (reuso PRD-016)
- ✅ Logout limpa sessão
- ✅ Header global muda quando logado
- ✅ Integração com PRD-064 (checkout otimizado)
- ✅ Sincronização customer no IOrder
- ✅ Banner "Modo demonstração" em recuperação de senha
- ✅ Mobile responsivo

### Excluído

- ❌ Auth real (Supabase Auth) — Fase 2
- ❌ OAuth (Google/Facebook) — Fase 2
- ❌ Verificação de email — Fase 2
- ❌ 2FA — Fase 2
- ❌ Sessão cross-device — Fase 2
- ❌ Programa de fidelidade — Fase 2
- ❌ Notificações configuráveis — Fase 2
- ❌ Exclusão de conta — Fase 2 (LGPD)
- ❌ Reviews de produtos comprados — Fase 2
- ❌ Wishlist — Fase 2

---

## Requisitos Funcionais

### Auth store

- **RF-001:** Criar `useAuthStore` em `src/features/storefront-account/store/`.
- **RF-002:** Persistência localStorage via Zustand persist.
- **RF-003:** Métodos: `login`, `register`, `logout`, `updateProfile`.
- **RF-004:** Validação mock: aceita qualquer email/senha não-vazios; busca customer em mocks por email.
- **RF-005:** Estrutura preparada para substituir por Supabase Auth na Fase 2 sem mudar consumidores.

### Login `/loja/login`

- **RF-006:** `LoginPage` com formulário.
- **RF-007:** Validações: email format, senha não-vazia.
- **RF-008:** Botão "Entrar" → chama `login()` → redireciona para `/loja/conta` ou `?return=` se especificado.
- **RF-009:** Link "Cadastre-se" → /loja/cadastro.
- **RF-010:** Link "Esqueci minha senha" → /loja/recuperar-senha.

### Cadastro `/loja/cadastro`

- **RF-011:** `RegisterPage` com toggle B2B/B2C.
- **RF-012:** Formulário condicional por tipo.
- **RF-013:** Validações: CPF/CNPJ formato, email único (busca em mocks), senha mínimo 6 chars.
- **RF-014:** Checkbox LGPD obrigatório.
- **RF-015:** Botão "Cadastrar" → cria `ICustomer` no mock + login automático.
- **RF-016:** Audit log de registro.

### Dashboard `/loja/conta`

- **RF-017:** `AccountDashboardPage` com saudação + 3 cards (pedidos, orçamentos, perfil).
- **RF-018:** Cada card mostra contagens + CTA "Ver todos".
- **RF-019:** Sidebar lateral com links de navegação.
- **RF-020:** Layout responsivo: sidebar vira menu drawer em mobile.

### Pedidos `/loja/conta/pedidos`

- **RF-021:** Lista de IOrders do customer logado.
- **RF-022:** Filtros: status (ativo/concluído/cancelado).
- **RF-023:** Cards com status badge + link detalhe.

### Detalhe pedido `/loja/conta/pedidos/:id`

- **RF-024:** Versão pública/simplificada do PRD-032.
- **RF-025:** Header com número + status.
- **RF-026:** Items + endereço + pagamento + total.
- **RF-027:** Botão "Repetir pedido": adiciona items ao carrinho via PRD-064.
- **RF-028:** Botão "Falar sobre este pedido" abre WhatsApp.

### Orçamentos `/loja/conta/orcamentos`

- **RF-029:** Lista de IQuotes do customer.
- **RF-030:** Detalhe `/loja/conta/orcamentos/:id` (versão pública).
- **RF-031:** Botão "Aceitar orçamento" (se válido e enviado): muda status='aceito' → cria pedido (PRD-031 flow).

### Perfil `/loja/conta/perfil`

- **RF-032:** Formulário com dados editáveis.
- **RF-033:** Salvar via provider; audit log.

### Endereços `/loja/conta/enderecos`

- **RF-034:** Lista de endereços (`ICustomer.addresses[]`).
- **RF-035:** CRUD com modal.
- **RF-036:** Marcar como padrão.

### Veículos (B2B)

- **RF-037:** Só visível se `customer.type === 'B2B'`.
- **RF-038:** Reuso de `<CustomerVehiclesList>` do PRD-016.

### Recuperação de senha

- **RF-039:** Page placeholder com input + botão.
- **RF-040:** Submit: toast "Instruções enviadas (modo demonstração)".

### Header global pós-login

- **RF-041:** Atualizar `<StorefrontHeader>` (PRD-060): se logado, mostra avatar + dropdown.
- **RF-042:** Dropdown: Minha conta, Meus pedidos, Sair.

### Logout

- **RF-043:** Limpa store de auth + localStorage.
- **RF-044:** Carrinho persiste (não associado ao customer agora).
- **RF-045:** Redireciona para /loja.

### Sincronização com checkout

- **RF-046:** PRD-064 detecta logado e pré-popula identificação.
- **RF-047:** Endereços salvos disponíveis em seleção.
- **RF-048:** Customer vinculado ao IOrder.

### Guard de rotas

- **RF-049:** `<GuardedStoreRoute>` em `/loja/conta/*`: redireciona para `/loja/login?return=...` se não logado.

---

## Requisitos Não-Funcionais

- **RNF-001:** Páginas renderizam < 400ms.
- **RNF-002:** Mobile usável.
- **RNF-003:** WCAG 2.1 AA.
- **RNF-004:** Sessão persiste corretamente; logout funciona em todas as abas (Fase 2).

---

## Critérios de Aceitação

```gherkin
DADO faço cadastro como B2C com CPF
QUANDO submeto formulário
ENTÃO ICustomer criado com type='B2C'
  E sou logado automaticamente
  E redirecionado para /loja/conta

DADO faço cadastro como B2B com CNPJ
QUANDO submeto
ENTÃO ICustomer criado com type='B2B'
  E sidebar mostra tab Veículos

DADO acesso /loja/conta sem login
QUANDO route guard valida
ENTÃO sou redirecionado para /loja/login?return=/loja/conta

DADO estou logado e acesso /loja/conta/pedidos
QUANDO observo
ENTÃO vejo apenas pedidos do meu customerId
  E posso clicar em detalhe

DADO clico "Repetir pedido"
QUANDO ação processa
ENTÃO items do pedido são adicionados ao carrinho
  E navego para /loja/carrinho

DADO B2B clico tab Veículos
QUANDO observo
ENTÃO vejo lista de veículos cadastrados
  E posso adicionar/editar via componente PRD-016

DADO B2C tenta acessar /loja/conta/veiculos
QUANDO route guard valida
ENTÃO redirect para /loja/conta com mensagem

DADO faço checkout (PRD-064) estando logado
QUANDO chego passo 2 endereço
ENTÃO vejo endereços salvos do meu perfil para selecionar

DADO clico Sair no header
QUANDO ação processa
ENTÃO sessão limpa
  E header volta para "Entrar"
  E redirecionado para /loja
  E carrinho permanece (sem vínculo)
```

---

## Fases de Implementação

| Fase | Objetivo                                                 |
| ---- | -------------------------------------------------------- |
| 1    | Auth store mock + login + cadastro                       |
| 2    | Dashboard + sidebar + listagens pedidos/orçamentos       |
| 3    | Detalhe pedido + repetir + detalhe orçamento + aceite    |
| 4    | Perfil + endereços + veículos (B2B)                      |
| 5    | Header global + sincronização checkout + polish + mobile |

---

## Dependências

| PRD                  | Status          |
| -------------------- | --------------- |
| PRD-012 (ICustomer)  | 📝              |
| PRD-016 (Veículos)   | 📝              |
| PRD-031 (Orçamentos) | 📝              |
| PRD-032 (Pedidos)    | 📝              |
| PRD-060 (Header)     | 📝              |
| PRD-064 (Checkout)   | 📝 (lote atual) |

---

## Cadeia

| Ordem  | PRD                |
| ------ | ------------------ |
| 1-38   | 010-064            |
| **39** | **PRD-065 ATUAL**  |
| 40+    | 066, 067, 070, 071 |

---

## Considerações de Segurança

- Auth mock NÃO é segurança real — apenas UX no MVP
- localStorage não criptografa — sem dados sensíveis além do necessário
- Senha mock não é validada de verdade — Fase 2 com hash
- LGPD: checkbox no cadastro é obrigatório
- Audit log em registro, login, mudanças de perfil

---

## Convenções

| Elemento | Convenção                                                 |
| -------- | --------------------------------------------------------- |
| Páginas  | `LoginPage`, `RegisterPage`, `AccountDashboardPage`, etc. |
| Store    | `useAuthStore`                                            |
| Pasta    | `storefront-account/`                                     |

---

## Notas para o Agente Desenvolvedor

- Auth mock: aceitar qualquer email/senha (busca customer por email em mocks)
- Estrutura prepara Supabase Auth Fase 2 — interface estável
- Sidebar é navegação chave; mobile vira drawer
- Reusar `<CustomerVehiclesList>` do PRD-016 (não duplicar)
- B2B/B2C condiciona tabs e fluxos
- Banner modo demo na recuperação de senha
- Repetir pedido = atalho de UX importante

---

## Status

| Campo  | Valor                             |
| ------ | --------------------------------- |
| Status | ✅ CONCLUÍDO — v0.44.0 (Passport) |

---

## Nota de adição — PRD-009 (Notification Center — Chime · v0.55.0)

A partir do PRD-009 (Central de Notificações, codinome **Chime**), a área de conta do cliente (`/loja/conta`) ganhou dois novos itens de menu e páginas dedicadas:

- **Notificações** (`/loja/conta/notificacoes`) — Central de Notificações do cliente: lista das notificações transacionais (pedidos, orçamentos, avisos do portal) com filtros e ações, sobre o `LojaLayout`, com tom comercial sem jargão interno.
- **Preferências de aviso** (`/loja/conta/preferencias`) — Tela de preferências do cliente: canais por categoria, com os canais externos (e-mail, WhatsApp, SMS, push) marcados como "Fase 2" e marketing como opt-in explícito.

Ambas as páginas funcionam por rota direta sobre o `LojaLayout` e estão estruturadas para integração à navegação lateral de conta (sidebar do `/loja/conta`) conforme o PRD-065.

---

## Histórico

| Data       | Versão | Alteração                                                                                                               |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — área logada com login/cadastro B2B/B2C, histórico, perfil, endereços, veículos                        |
| 31/05/2026 | delta  | PRD-009 (Chime, v0.55.0): adição de `/loja/conta/notificacoes` e `/loja/conta/preferencias` à área de conta do cliente. |

---

**AILA - Sistemas Inteligentes**
