# PRD-003: Shell do App, Navegação e Layouts Base

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                     |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                          |
| **Objetivo**          | Estabelecer a arquitetura de roteamento, autenticação mockada, layouts reutilizáveis e navegação contextualizada por papel, formando o "esqueleto navegável" que todos os módulos da plataforma vão consumir |
| **Tipo**              | Feature                                                                                                                                                                                                      |
| **Complexidade**      | Alta                                                                                                                                                                                                         |
| **Total de Fases**    | 5                                                                                                                                                                                                            |
| **Prioridade**        | Alta                                                                                                                                                                                                         |
| **Épico**             | Bloco 0 — Fundação                                                                                                                                                                                           |
| **PRDs Relacionados** | PRD-001 (Design System), PRD-002 (Modelo Conceitual), PRD-004 (Mocks), PRD-006 (RBAC), PRD-007 (Multi-Loja)                                                                                                  |
| **Implementação**     | 🟢 Lovable (segundo do par scaffold, junto com PRD-001)                                                                                                                                                      |
| **Padrão de código**  | Feature-based; rotas em `src/features/shell/routes/`; layouts em `src/features/shell/layouts/`; auth em `src/features/auth/`                                                                                 |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** dois sub-apps coexistindo em um único projeto (`/app/*` interno + `/loja/*` e-commerce), auth mockada com 3 perfis e role guards, 8 layouts reutilizáveis incluindo um layout de 3 colunas (Conversation), sidebar contextualizada por papel, bottom nav adaptativo mobile, top bar com seletor de loja + busca global + notificações + theme switcher, e placeholders de navegação end-to-end para 30+ rotas que serão preenchidas pelos PRDs posteriores.

---

## Contexto do Problema

O design system do PRD-001 entrega os tokens, componentes e identidade visual. O modelo conceitual do PRD-002 entrega a tipagem. Mas nenhum dos dois entrega **um app navegável**. Sem o PRD-003, ao abrir o projeto no Lovable o stakeholder vê uma tela em branco — não consegue clicar em nada, não consegue percorrer fluxos, não consegue validar a estrutura de informação da plataforma.

A consequência disso é dupla. **Stakeholders não conseguem validar a estrutura.** O cliente final (GALLO) precisa ver as telas se conectando para aprovar o conceito antes do investimento no backend. Sem shell navegável, a validação fica refém de mockups estáticos no Figma — perdendo a interatividade que é justamente o ponto da estratégia Frontend First. **PRDs subsequentes nascem fragmentados.** Sem layouts pré-definidos, o PRD-010 (Inbox) inventa seu próprio layout, o PRD-040 (Visão Executiva) inventa outro, e no fim cada módulo tem sua própria estrutura de página. A coerência se perde.

Há também um ponto sutil de arquitetura. A plataforma GALLO comporta **dois apps no mesmo projeto**: o app interno (CRM, gestão, atendimento — usado por owner/vendedor) e a vitrine pública (e-commerce — usado pelo cliente final). Ambos compartilham design system, tipos, mocks e providers, mas têm navegações, layouts e até públicos completamente diferentes. Resolver essa decisão arquitetural cedo (no PRD-003) evita refatorações caras adiante.

Este PRD entrega o "esqueleto navegável" — um app onde se pode clicar em todos os menus, alternar perfis, percorrer rotas, ver layouts vazios com EmptyState — preparado para os PRDs dos blocos seguintes encherem cada tela com conteúdo real.

---

## Conceito da Solução

### Situação Atual (As-Is)

Não existe nem projeto base ainda. PRD-001 estabelece tokens, PRD-002 estabelece tipos, mas nenhum render efetivo de tela.

### Situação Desejada (To-Be)

Um app navegável de ponta a ponta com:

- **Router root** com React Router v6 distinguindo `/app/*` (app interno) e `/loja/*` (e-commerce), com `/` redirecionando conforme contexto/papel
- **Auth mockada** com 3 perfis pré-configurados (Owner, Vendedor, Cliente) selecionáveis em tela de "login" sem senha — apenas para gerar contexto de papel
- **8 layouts reutilizáveis** cobrindo todos os padrões estruturais que os módulos vão precisar
- **Sidebar do app interno** contextualizada por papel (Owner vê tudo; Vendedor vê só Central + Carteira + Configurações pessoais)
- **Bottom nav mobile** que substitui a sidebar em viewports < 768px
- **Top bar** com logo, busca global, seletor de loja, notificações, theme switcher e avatar
- **Layout do e-commerce** distinto e público (sem sidebar, com header de navegação e footer)
- **Role guards** que protegem rotas por papel
- **Placeholders de navegação** em todas as 30+ rotas que serão implementadas nos blocos seguintes — cada uma com EmptyState informando "Em construção — ver PRD-XXX"

### Alternativas Consideradas

| Alternativa                                                       | Por que foi descartada                                                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Dois projetos Vite separados (um para `/app`, outro para `/loja`) | Quebra a estratégia de "uma plataforma única"; duplica config, dependências, design system, tipos, mocks. Sobrecarga de manutenção altíssima |
| Auth real com Supabase desde a Fase 1                             | Contraria a estratégia Frontend First; backend só entra na Fase 2 após validação do cliente                                                  |
| Single layout que se adapta a tudo via props                      | Cresce monoliticamente; cada nova necessidade vira mais um caso especial. 8 layouts especializados são mais simples de manter                |
| Sidebar fixa para todos os papéis (sem contextualização)          | UX confusa: Vendedor veria itens que não consegue usar. Filtrar por papel desde o shell é essencial                                          |
| Bottom nav igual à sidebar (mesmos itens)                         | Mobile não comporta 10+ itens. Top 4-5 itens prioritários + "Mais..." que abre drawer com o resto                                            |
| Sem auth mockada (tudo aberto)                                    | Impede testar o role guard, impede demonstrar diferenças entre perfis para o cliente, e prepara mal para Fase 2                              |

**Decisão:** **um projeto Vite, duas árvores de rotas, design system compartilhado, auth mockada com 3 perfis e 8 layouts especializados.**

---

## Arquitetura de Roteamento

A plataforma é um único projeto React + Vite com **três grandes áreas de rota**:

| Prefixo   | Público                               | Layout                                          | Conteúdo                                          |
| --------- | ------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `/app/*`  | Owner, Vendedor (autenticados)        | `<AppLayout>` com sidebar + topbar              | CRM, Gestão, Atendimento, Configurações           |
| `/loja/*` | Público anônimo + Cliente autenticado | `<LojaLayout>` com header navegacional + footer | Vitrine, busca, ficha de produto, carrinho, conta |
| `/auth/*` | Anônimo                               | `<AuthLayout>`                                  | Login mockado (seleção de perfil)                 |

A rota raiz `/` redireciona:

- Se não autenticado → `/auth/login`
- Se Owner ou Vendedor autenticado → `/app/inicio`
- Se Cliente autenticado → `/loja`

### Mapa de rotas do app interno (`/app/*`)

| Rota                           | Página                              | Layout               | Papéis permitidos | PRD futuro |
| ------------------------------ | ----------------------------------- | -------------------- | ----------------- | ---------- |
| `/app/inicio`                  | Dashboard inicial                   | `AppLayout`          | Owner, Vendedor   | PRD-014    |
| `/app/atendimento`             | Inbox de conversas                  | `ConversationLayout` | Owner, Vendedor   | PRD-010    |
| `/app/atendimento/:id`         | Conversa específica                 | `ConversationLayout` | Owner, Vendedor   | PRD-011    |
| `/app/clientes`                | Lista de clientes                   | `DetailLayout`       | Owner, Vendedor   | PRD-015    |
| `/app/clientes/:id`            | Ficha do cliente                    | `DetailLayout`       | Owner, Vendedor   | PRD-012    |
| `/app/leads`                   | Pipeline de leads (Kanban)          | `AppLayout`          | Owner, Vendedor   | PRD-017    |
| `/app/veiculos`                | Veículos                            | `AppLayout`          | Owner, Vendedor   | PRD-016    |
| `/app/carteira`                | Gestão de carteira e transferências | `AppLayout`          | Owner             | PRD-018    |
| `/app/catalogo`                | Catálogo interno de peças           | `AppLayout`          | Owner, Vendedor   | PRD-030    |
| `/app/orcamentos`              | Orçamentos                          | `AppLayout`          | Owner, Vendedor   | PRD-031    |
| `/app/pedidos`                 | Pedidos                             | `AppLayout`          | Owner, Vendedor   | PRD-032    |
| `/app/sdr`                     | Painel do agente SDR                | `AppLayout`          | Owner             | PRD-024    |
| `/app/gestao`                  | Visão executiva                     | `DashboardLayout`    | Owner             | PRD-040    |
| `/app/gestao/vendas`           | Vendas                              | `DashboardLayout`    | Owner             | PRD-041    |
| `/app/gestao/metas`            | Metas                               | `DashboardLayout`    | Owner             | PRD-042    |
| `/app/gestao/ranking`          | Ranking                             | `DashboardLayout`    | Owner, Vendedor   | PRD-043    |
| `/app/gestao/positivacao`      | Positivação                         | `DashboardLayout`    | Owner             | PRD-044    |
| `/app/gestao/abc`              | Curva ABC                           | `DashboardLayout`    | Owner             | PRD-045    |
| `/app/gestao/comissoes`        | Comissões                           | `DashboardLayout`    | Owner             | PRD-047    |
| `/app/gestao/dre`              | DRE Gerencial                       | `DashboardLayout`    | Owner             | PRD-048    |
| `/app/gestao/rentabilidade`    | Rentabilidade                       | `DashboardLayout`    | Owner             | PRD-049    |
| `/app/gestao/despesas`         | Despesas                            | `DashboardLayout`    | Owner             | PRD-050    |
| `/app/gestao/caixa`            | Fluxo de Caixa                      | `DashboardLayout`    | Owner             | PRD-051    |
| `/app/gestao/estoque`          | Estoque com curadoria               | `DashboardLayout`    | Owner             | PRD-052    |
| `/app/configuracoes`           | Configurações admin                 | `SettingsLayout`     | Owner             | PRD-019    |
| `/app/configuracoes/perfil`    | Perfil do usuário                   | `SettingsLayout`     | Owner, Vendedor   | —          |
| `/app/configuracoes/aparencia` | Tema/Modo                           | `SettingsLayout`     | Owner, Vendedor   | —          |
| `/design-system`               | Documentação visual viva            | `EmptyLayout`        | Dev-only          | PRD-001    |

### Mapa de rotas da vitrine (`/loja/*`)

| Rota                    | Página                          | Layout                 | Papéis      | PRD futuro |
| ----------------------- | ------------------------------- | ---------------------- | ----------- | ---------- |
| `/loja`                 | Home da vitrine                 | `LojaLayout`           | Público     | PRD-060    |
| `/loja/busca`           | Busca avançada (OEM, aplicação) | `LojaLayout`           | Público     | PRD-061    |
| `/loja/categoria/:slug` | Listagem de categoria           | `LojaLayout`           | Público     | PRD-062    |
| `/loja/produto/:slug`   | Ficha de produto                | `LojaLayout`           | Público     | PRD-063    |
| `/loja/carrinho`        | Carrinho                        | `LojaLayout`           | Público     | PRD-064    |
| `/loja/checkout`        | Checkout                        | `LojaLayout`           | Autenticado | PRD-064    |
| `/loja/conta`           | Conta do cliente                | `LojaLayout`           | Cliente     | PRD-065    |
| `/loja/conta/pedidos`   | Pedidos do cliente              | `LojaLayout`           | Cliente     | PRD-065    |
| `/portal`               | Portal do cliente B2B           | `AppLayout` (reduzido) | Cliente B2B | PRD-071    |

### Rotas de autenticação (`/auth/*`)

| Rota           | Página                                          | Layout       |
| -------------- | ----------------------------------------------- | ------------ |
| `/auth/login`  | Tela de seleção de perfil mockado               | `AuthLayout` |
| `/auth/logout` | Encerra sessão e redireciona para `/auth/login` | —            |

### Rotas de erro

| Rota             | Página                   | Layout        |
| ---------------- | ------------------------ | ------------- |
| `/404`           | Não encontrado           | `EmptyLayout` |
| `/sem-permissao` | Acesso negado            | `EmptyLayout` |
| `/erro`          | Erro genérico (boundary) | `EmptyLayout` |

---

## Autenticação Mockada

Não há senha, não há banco. A tela `/auth/login` lista os três perfis disponíveis com cards clicáveis. Selecionar um perfil grava em `localStorage` (chave `gallo-mock-user`) e direciona para a área correspondente.

| Perfil mock  | Nome                                   | Papel      | Loja   | Direcionamento pós-login |
| ------------ | -------------------------------------- | ---------- | ------ | ------------------------ |
| **Owner**    | "João Gallo" (fundador, apelido Gallo) | `Owner`    | Matriz | `/app/inicio`            |
| **Vendedor** | "Carlos Santos"                        | `Vendedor` | Matriz | `/app/atendimento`       |
| **Cliente**  | "Transportadora Aurora Ltda" (B2B)     | `Cliente`  | —      | `/loja`                  |

Perfis são gerados pelos mocks (PRD-004). A tela de login apenas escolhe qual deles "está logado". Em qualquer momento o usuário pode clicar em "Trocar perfil" no menu do avatar e retornar à tela de login.

---

## Escopo

### Incluído

- ✅ Configuração do React Router v6 com roteamento aninhado e lazy loading de páginas
- ✅ 3 árvores de rota (`/app`, `/loja`, `/auth`) + rotas de erro (`/404`, `/sem-permissao`, `/erro`)
- ✅ Auth mockada: tela `/auth/login` com cards de seleção dos 3 perfis; persistência em `localStorage`
- ✅ Context `<AuthProvider>` expondo usuário atual e helpers (`useAuth()`, `useCurrentUser()`, `hasRole()`)
- ✅ Role guards: componente `<GuardedRoute roles={[...]}>` ou wrapper similar que protege rotas por papel
- ✅ 8 layouts reutilizáveis (detalhados na próxima seção)
- ✅ `<Sidebar>` do app interno com itens contextualizados por papel (Owner vs Vendedor)
- ✅ `<TopBar>` com logo, busca global (placeholder), seletor de loja (mostrando "GALLO Matriz"), notificações (placeholder), theme switcher (do PRD-001), avatar com dropdown
- ✅ `<BottomNav>` mobile com 4-5 itens prioritários + botão "Mais" que abre drawer
- ✅ Páginas placeholder em todas as 30+ rotas do app interno com `<EmptyState>` informando "Em construção — PRD-XXX"
- ✅ Header navegacional da vitrine `<LojaHeader>` com logo, categorias principais (placeholder), busca, carrinho, conta
- ✅ Footer da vitrine `<LojaFooter>` com links institucionais (placeholder)
- ✅ Página `/404` amigável com link para voltar à home
- ✅ Página `/sem-permissao` quando role guard bloqueia
- ✅ Error boundary global redirecionando para `/erro`
- ✅ Lazy loading de rotas (code splitting via `React.lazy()` + `<Suspense>`)
- ✅ Loading skeleton durante transições de rota

### Excluído

- ❌ Conteúdo real de qualquer tela funcional — todas as rotas têm placeholder; o conteúdo vem nos PRDs específicos
- ❌ Auth real com senha, recuperação, MFA — Fase 2 com Supabase Auth
- ❌ Busca global funcional — o input existe e fica visível, mas não faz nada (placeholder)
- ❌ Notificações reais (push, WebSocket) — Fase 2; no MVP, apenas ícone + dropdown com mensagens estáticas
- ❌ Multi-loja com troca real — seletor de loja existe no shell mas no MVP só há "GALLO Matriz"; lógica real fica no PRD-007
- ❌ Permissões granulares por recurso/ação — apenas filtragem por papel no shell; RBAC completo é PRD-006
- ❌ Páginas funcionais do `/portal` cliente B2B — apenas placeholder de rota; conteúdo no PRD-071
- ❌ Persistência de estado de UI entre sessões (filtros aplicados, abas abertas) — fora do MVP
- ❌ Animações elaboradas de transição entre rotas — apenas fade discreto padrão do shadcn
- ❌ Idiomas múltiplos (i18n) — único idioma português no MVP
- ❌ Acessibilidade extrema (screen reader navegação completa) — atende padrão WCAG AA básico definido no PRD-001

---

## Layouts Reutilizáveis

### Inventário

| #   | Layout               | Onde se aplica                          | Anatomia                                                                    |
| --- | -------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `AppLayout`          | Padrão do app interno                   | Sidebar + TopBar + Content (rolável)                                        |
| 2   | `ConversationLayout` | Atendimento (PRDs 010, 011)             | Sidebar + TopBar + 3 colunas (Lista conversas \| Conversa \| Ficha cliente) |
| 3   | `DetailLayout`       | Listas com detalhe (Clientes, Catálogo) | Sidebar + TopBar + 2 colunas (Lista \| Detalhe)                             |
| 4   | `DashboardLayout`    | Gestão e BI                             | Sidebar + TopBar + Grid de widgets/cards                                    |
| 5   | `SettingsLayout`     | Configurações                           | Sidebar + TopBar + Sub-sidebar de seções + Content                          |
| 6   | `LojaLayout`         | E-commerce público                      | LojaHeader + Content + LojaFooter (sem sidebar)                             |
| 7   | `AuthLayout`         | Login mockado                           | Centralizado, sem chrome, com logo grande                                   |
| 8   | `EmptyLayout`        | 404, erro, splash, design-system        | Centralizado, mínimo                                                        |

### Anatomia detalhada do `ConversationLayout` (mais complexo)

Por ser o mais elaborado e o mais consumido pelo MVP (atendimento é o core), recebe atenção especial:

```
┌─────────────────────────────────────────────────────────────┐
│                       TopBar (h: 64px)                       │
├──────────┬──────────────────┬────────────────────────────────┤
│          │                  │                                │
│ Sidebar  │  Lista de        │   Conversa                     │
│ (w:240)  │  conversas       │   selecionada                  │
│          │  (w: 320px)      │   (flex: 1)                    │
│          │                  │                                │
│ • Início │ ┌──────────────┐ │ ┌────────────────────────────┐ │
│ • Atend. │ │ Conv item 1  │ │ │ Mensagens...               │ │
│ • Clien. │ │ Conv item 2  │ │ │                            │ │
│ • Leads  │ │ Conv item 3  │ │ │                            │ │
│ • Carte. │ │ ...          │ │ └────────────────────────────┘ │
│          │ └──────────────┘ │ ┌────────────────────────────┐ │
│          │                  │ │ Input + ações              │ │
│          │                  │ └────────────────────────────┘ │
├──────────┴──────────────────┴────────────────────────────────┤
│                                                              │
│        Ficha do cliente colapsável (overlay direito)         │
│                  (w: 360px quando aberta)                    │
└──────────────────────────────────────────────────────────────┘
```

Comportamento responsivo:

- ≥ 1280px: três colunas todas visíveis
- 768-1279px: lista de conversas + conversa; ficha do cliente como drawer
- < 768px: navegação por níveis (lista → conversa → ficha), com botão "voltar"

### Anatomia detalhada do `LojaLayout`

```
┌─────────────────────────────────────────────────────────────┐
│  LojaHeader (h: 80px)                                        │
│  [Logo GALLO]  [Categorias]  [Busca______]  [🛒]  [👤]      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                       Content                                │
│                       (rolável)                              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  LojaFooter                                                  │
│  Sobre · Atendimento · Políticas · Redes sociais            │
└─────────────────────────────────────────────────────────────┘
```

Visual público, sem chrome de SaaS. Tem propósito comercial.

---

## Requisitos Funcionais

### Roteamento

- **RF-001:** O sistema deve usar **React Router v6** com `<BrowserRouter>` no topo da aplicação.
- **RF-002:** As rotas devem ser organizadas em três árvores: `/app/*` (autenticado, interno), `/loja/*` (público + autenticado cliente), `/auth/*` (não autenticado).
- **RF-003:** A rota raiz `/` deve redirecionar conforme o estado:
  - Não autenticado → `/auth/login`
  - Owner/Vendedor → `/app/inicio`
  - Cliente → `/loja`
- **RF-004:** O sistema deve implementar lazy loading de páginas via `React.lazy()` + `<Suspense fallback={<RouteSkeleton/>}>` no nível de cada rota.
- **RF-005:** O sistema deve ter rotas de erro: `/404` (não encontrado), `/sem-permissao` (role guard bloqueou), `/erro` (error boundary capturou).
- **RF-006:** Toda rota não declarada deve cair em `/404`.

### Autenticação mockada

- **RF-007:** A rota `/auth/login` deve renderizar uma tela com 3 cards, um para cada perfil (Owner "João Gallo", Vendedor "Carlos Santos", Cliente "Transportadora Aurora Ltda"), cada um com nome, papel, foto e botão "Entrar".
- **RF-008:** Selecionar um perfil deve gravar em `localStorage` (chave `gallo-mock-user`) e redirecionar conforme o papel.
- **RF-009:** O sistema deve disponibilizar um `<AuthProvider>` no root da aplicação, expondo via `useAuth()`:
  - `currentUser: ISeller | ICustomer | null`
  - `userRole: RoleName | null`
  - `signIn(profileId: string): void`
  - `signOut(): void`
  - `hasRole(role: RoleName | RoleName[]): boolean`
- **RF-010:** O `<AuthProvider>` deve hidratar o estado a partir do `localStorage` no primeiro render, antes do roteamento.
- **RF-011:** A rota `/auth/logout` deve limpar `localStorage`, resetar o contexto de auth e redirecionar para `/auth/login`.
- **RF-012:** Deve haver opção "Trocar perfil" no dropdown do avatar que executa logout + navega para login.

### Role guards

- **RF-013:** O sistema deve fornecer um componente `<GuardedRoute roles={RoleName[]}>` que:
  - Se usuário não autenticado: redireciona para `/auth/login` preservando rota original em query `?next=/app/...`
  - Se usuário autenticado mas sem papel permitido: redireciona para `/sem-permissao`
  - Se permitido: renderiza children
- **RF-014:** Toda rota dentro de `/app/*` deve estar protegida por `<GuardedRoute roles={['Owner', 'Vendedor']}>` por padrão; rotas exclusivas de Owner devem usar `roles={['Owner']}`.
- **RF-015:** A rota `/loja/checkout` deve exigir autenticação (qualquer papel autenticado serve).

### Layouts

- **RF-016:** Implementar os 8 layouts listados no inventário, todos consumindo apenas componentes e tokens do PRD-001.
- **RF-017:** Cada layout deve aceitar `children` ou `<Outlet>` do React Router para renderizar o conteúdo da rota ativa.
- **RF-018:** Layouts devem ser responsivos:
  - Desktop (≥ 1024px): layout completo
  - Tablet (768-1023px): adaptações específicas por layout (ex: drawer da ficha no Conversation)
  - Mobile (< 768px): Sidebar vira BottomNav; ConversationLayout vira navegação por níveis
- **RF-019:** O `ConversationLayout` deve gerenciar três áreas distintas (lista, conversa, ficha) e respeitar o comportamento responsivo descrito na seção "Anatomia detalhada".

### Sidebar do app interno

- **RF-020:** Implementar `<Sidebar>` com largura fixa (240px expandida, 64px colapsada) e botão de toggle.
- **RF-021:** Estado colapsado/expandido deve persistir em `localStorage` (chave `gallo-sidebar-collapsed`).
- **RF-022:** Itens da sidebar devem ser filtrados por papel do usuário corrente:

**Owner** vê todos os agrupamentos:

- **Atendimento** — Início, Atendimento, Clientes, Leads, Veículos, Carteira
- **Comercial** — Catálogo, Orçamentos, Pedidos
- **SDR** — Painel SDR
- **Gestão** — Visão executiva, Vendas, Metas, Ranking, Positivação, ABC, Comissões, DRE, Rentabilidade, Despesas, Caixa, Estoque
- **Configurações** — Admin, Perfil, Aparência

**Vendedor** vê apenas:

- Início, Atendimento, Clientes, Leads, Veículos
- Catálogo, Orçamentos, Pedidos
- Ranking (parcial, só sua posição)
- Perfil, Aparência

- **RF-023:** Item ativo da sidebar deve ter destaque visual usando `--accent` do tema atual.
- **RF-024:** Cada item deve ter ícone Iconify + label; quando colapsado, só ícone com tooltip.

### Top bar

- **RF-025:** Implementar `<TopBar>` com altura fixa de 64px contendo:
  - Logo GALLO (horizontal, do PRD-001) à esquerda
  - Seletor de loja (no MVP mostra "GALLO Matriz" como item único)
  - Busca global (input com ícone, placeholder "Buscar clientes, peças, pedidos..." — não funcional no MVP)
  - Botão de notificações (ícone com badge de contagem; clicar abre dropdown com lista mockada estática)
  - `<ThemeSwitcher>` do PRD-001
  - Avatar do usuário (com dropdown: Perfil, Configurações, Trocar perfil, Sair)
- **RF-026:** Em mobile (< 768px), a `<TopBar>` reduz: logo compacta (signo apenas), busca vira botão que abre overlay, notificações e avatar mantidos.

### Bottom nav mobile

- **RF-027:** Em viewports < 768px, ocultar `<Sidebar>` e exibir `<BottomNav>` fixa no rodapé.
- **RF-028:** `<BottomNav>` deve ter 4-5 itens prioritários por papel:
  - **Owner**: Início, Atendimento, Clientes, Gestão, Mais
  - **Vendedor**: Início, Atendimento, Clientes, Ranking, Mais
- **RF-029:** O item "Mais" deve abrir um `<Sheet>` (drawer lateral) com o restante dos itens da sidebar.

### Header e footer da vitrine

- **RF-030:** Implementar `<LojaHeader>` com altura 80px contendo logo, links de categorias principais (placeholder: Filtros, Aplicações, Marcas), busca, ícone de carrinho com badge de quantidade, ícone de conta.
- **RF-031:** Implementar `<LojaFooter>` com links institucionais (Sobre, Atendimento, Políticas), redes sociais (placeholder) e copyright "© GALLO BASE DIESEL — Todos os direitos reservados".

### Páginas placeholder

- **RF-032:** Cada rota do app interno deve renderizar (por enquanto) um `<EmptyState>` com:
  - Ícone Iconify representativo
  - Título "Em construção"
  - Descrição "Esta tela será implementada no [PRD-XXX]"
  - Botão "Voltar ao início" linkando para `/app/inicio`
- **RF-033:** Cada rota da vitrine deve renderizar `<EmptyState>` semelhante mas com tom comercial (sem mencionar PRDs ao público).

### Error boundary

- **RF-034:** Aplicação deve ter `<ErrorBoundary>` global que captura erros não tratados e renderiza `/erro` com mensagem amigável + botão "Voltar".
- **RF-035:** Erros devem ser logados em `console.error` no MVP (não enviar para serviço externo; isso entra na Fase 2).

### Carregamento e transições

- **RF-036:** Cada `<Suspense>` deve renderizar `<RouteSkeleton>` (skeleton genérico que respeita o layout pai).
- **RF-037:** Transição visual entre rotas deve ser fade discreto de 150ms; nunca animações elaboradas.
- **RF-038:** Respeitar `prefers-reduced-motion` desabilitando o fade.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Tempo de troca de rota lazy-loaded deve ser ≤ 300ms em conexão razoável.
- **RNF-002 (Bundle):** Cada rota deve ser code-split via lazy loading; o bundle inicial deve carregar apenas Shell + Auth + rota inicial.
- **RNF-003 (Manutenibilidade):** Adicionar uma nova rota deve impactar exatamente: arquivo de rotas + arquivo da página + (opcionalmente) item da sidebar.
- **RNF-004 (Responsividade):** Todos os layouts e componentes do shell devem funcionar em viewports de 360px (mobile pequeno) até 1920px (desktop grande).
- **RNF-005 (Acessibilidade):** Navegação completa por teclado em todos os menus, dropdowns e botões. Atalhos opcionais (Ctrl+K para busca futura).
- **RNF-006 (SEO da vitrine):** Páginas da `/loja/*` devem ter meta tags básicas (title, description) configuráveis por rota.
- **RNF-007 (Compatibilidade):** Funcionar em Chrome, Firefox, Safari, Edge nas duas últimas versões estáveis.

---

## Critérios de Aceitação

### Auth mockada e role guards

```gherkin
DADO que o usuário não está autenticado
QUANDO ele tenta acessar /app/inicio diretamente pela URL
ENTÃO deve ser redirecionado para /auth/login?next=/app/inicio
  E após escolher um perfil válido (Owner ou Vendedor)
  E o sistema deve redirecioná-lo de volta para /app/inicio

DADO que estou logado como Vendedor
QUANDO acesso /app/gestao/dre
ENTÃO devo ser redirecionado para /sem-permissao
  E não devo ver dados de DRE em nenhum momento

DADO que estou logado como Cliente
QUANDO tento acessar /app/inicio pela URL
ENTÃO devo ser redirecionado para /sem-permissao
  E ao clicar em "Voltar" devo ir para /loja
```

### Sidebar contextualizada

```gherkin
DADO que estou logado como Owner
QUANDO observo a sidebar
ENTÃO devo ver todos os agrupamentos: Atendimento, Comercial, SDR, Gestão, Configurações
  E devo ver o item "DRE Gerencial" dentro de Gestão

DADO que estou logado como Vendedor
QUANDO observo a sidebar
ENTÃO devo ver apenas: Início, Atendimento, Clientes, Leads, Veículos, Catálogo, Orçamentos, Pedidos, Ranking, Perfil, Aparência
  E NÃO devo ver os itens DRE, Comissões, Carteira ou Painel SDR
```

### Layouts e responsividade

```gherkin
DADO que estou em /app/atendimento em desktop (≥ 1280px)
QUANDO observo o layout
ENTÃO devo ver três colunas: sidebar fixa, lista de conversas e área da conversa
  E ao clicar num botão "Ver ficha" deve aparecer uma quarta coluna à direita (overlay drawer)

DADO que estou em /app/atendimento em tablet (1024px)
QUANDO observo o layout
ENTÃO a sidebar permanece, mas a ficha do cliente fica como drawer (aberto por botão)

DADO que estou em /app/atendimento em mobile (< 768px)
QUANDO observo o layout
ENTÃO devo ver apenas a lista de conversas
  E ao clicar numa conversa devo navegar para a conversa em tela cheia
  E devo ter botão "voltar" para a lista
  E a sidebar desktop foi substituída por uma BottomNav fixa
```

### Top bar e navegação

```gherkin
DADO que estou em qualquer tela do /app
QUANDO clico no avatar no canto superior direito
ENTÃO deve abrir um dropdown com itens: Perfil, Configurações, Trocar perfil, Sair

DADO que clico em "Trocar perfil"
QUANDO o sistema processa a ação
ENTÃO o localStorage gallo-mock-user deve ser limpo
  E devo ser redirecionado para /auth/login

DADO que estou logado e tenho preferência de tema "parts/dark"
QUANDO faço refresh da página
ENTÃO o tema parts/dark deve persistir
  E o usuário corrente deve continuar logado (do localStorage)
```

### Placeholders de navegação

```gherkin
DADO que estou em /app/gestao/comissoes
QUANDO a página carrega
ENTÃO devo ver um EmptyState com texto "Em construção — esta tela será implementada no PRD-047"
  E devo ter botão "Voltar ao início"

DADO que estou em /loja/produto/filtro-de-oleo-volvo
QUANDO a página carrega
ENTÃO devo ver um EmptyState comercial (sem menção a PRDs)
  E o layout LojaLayout deve estar completo (header de loja + footer)
```

### Cenários de erro

```gherkin
DADO que uma página lazy-loaded falha ao carregar (chunk failed)
QUANDO o ErrorBoundary captura o erro
ENTÃO devo ser direcionado para /erro
  E devo ver mensagem amigável + botão para tentar novamente

DADO que o localStorage está indisponível (modo privado restrito)
QUANDO tento fazer login mock
ENTÃO o login deve funcionar na sessão atual
  E uma mensagem discreta deve avisar que a preferência não será persistida
  E ao recarregar a página, deve voltar à tela de login
```

---

## Fases de Implementação

| Fase | Objetivo                                                                                   | Arquivos Estimados      |
| ---- | ------------------------------------------------------------------------------------------ | ----------------------- |
| 1    | Setup do roteamento e auth mockada                                                         | 6-8                     |
| 2    | Layouts base (AppLayout, AuthLayout, EmptyLayout, LojaLayout)                              | 4                       |
| 3    | Layouts especializados (ConversationLayout, DetailLayout, DashboardLayout, SettingsLayout) | 4                       |
| 4    | Sidebar, TopBar, BottomNav, LojaHeader/Footer                                              | 6-8                     |
| 5    | Páginas placeholder, rotas de erro e error boundary                                        | 30+ (arquivos pequenos) |

### Detalhamento das Fases

#### Fase 1: Roteamento e Auth Mockada

**Objetivo:** ter o esqueleto de rotas funcionando com auth básica

**Ações:**

- [ ] Instalar `react-router-dom@6`
- [ ] Criar `src/routes.tsx` como ponto central de declaração das rotas (lazy loaded)
- [ ] Criar `src/features/auth/AuthProvider.tsx`, `useAuth.ts`, `<GuardedRoute>` em `src/features/auth/`
- [ ] Criar `src/features/auth/pages/LoginPage.tsx` com 3 cards de perfil mockado
- [ ] Configurar persistência em `localStorage` chave `gallo-mock-user`
- [ ] Implementar `<ErrorBoundary>` global em `src/features/shell/components/`

**Validação:** consigo navegar entre `/auth/login`, escolher perfil, ser redirecionado para `/app/inicio` ou `/loja`, e o estado persiste em refresh.

#### Fase 2: Layouts Base

**Objetivo:** ter os 4 layouts mais simples prontos

**Ações:**

- [ ] Criar `src/features/shell/layouts/AppLayout.tsx` (sidebar placeholder + topbar placeholder + outlet)
- [ ] Criar `src/features/shell/layouts/AuthLayout.tsx` (centralizado, logo grande)
- [ ] Criar `src/features/shell/layouts/EmptyLayout.tsx` (mínimo, para 404 e splash)
- [ ] Criar `src/features/shell/layouts/LojaLayout.tsx` (header + content + footer)

**Validação:** rotas usando cada layout renderizam corretamente.

#### Fase 3: Layouts Especializados

**Objetivo:** layouts mais complexos prontos para os módulos consumirem

**Ações:**

- [ ] Criar `src/features/shell/layouts/ConversationLayout.tsx` com 3 áreas (Lista, Conversa, Ficha drawer) e comportamento responsivo
- [ ] Criar `src/features/shell/layouts/DetailLayout.tsx` (lista + detalhe)
- [ ] Criar `src/features/shell/layouts/DashboardLayout.tsx` (grid)
- [ ] Criar `src/features/shell/layouts/SettingsLayout.tsx` (sub-sidebar + content)
- [ ] Documentar exemplos de uso de cada layout em `/design-system`

**Validação:** todos os 8 layouts navegáveis a partir de uma seção de exemplos no `/design-system`.

#### Fase 4: Navegação (Sidebar, TopBar, BottomNav, LojaHeader, LojaFooter)

**Objetivo:** chrome navegacional completo, contextualizado por papel

**Ações:**

- [ ] Criar `<Sidebar>` com itens organizados por agrupamento e filtragem por papel
- [ ] Implementar toggle expandido/colapsado com persistência em `localStorage`
- [ ] Criar `<TopBar>` com logo, seletor de loja (mock), busca placeholder, notificações placeholder, theme switcher, avatar com dropdown
- [ ] Criar `<BottomNav>` mobile com 5 itens prioritários por papel e drawer "Mais"
- [ ] Criar `<LojaHeader>` (vitrine pública) e `<LojaFooter>`
- [ ] Integrar `<ThemeSwitcher>` do PRD-001

**Validação:** todas as 30+ rotas do app interno são navegáveis via sidebar; mobile usa bottom nav; tema persiste através de navegação.

#### Fase 5: Páginas Placeholder e Rotas de Erro

**Objetivo:** fechar o esqueleto end-to-end

**Ações:**

- [ ] Criar arquivos de página placeholder para todas as ~35 rotas (cada um exporta um componente que renderiza `<EmptyState>` com referência ao PRD futuro)
- [ ] Criar `/404`, `/sem-permissao`, `/erro` com mensagens amigáveis
- [ ] Configurar lazy loading + `<Suspense>` + `<RouteSkeleton>` em todas as rotas
- [ ] Garantir que cada placeholder respeita o layout especificado no mapa de rotas

**Validação:** click test manual em toda a sidebar e bottom nav — nenhuma rota quebra; todas mostram placeholder coerente; voltar funciona; troca de papel reflete imediatamente nos itens visíveis.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                                    | Status                                |
| ------- | -------------------------------------------- | ------------------------------------- |
| PRD-001 | Identidade Visual GALLO e Design System Base | ⏳ Pendente (deve estar pronto antes) |
| PRD-002 | Modelo Conceitual de Domínio e Glossário     | ⏳ Pendente (deve estar pronto antes) |

### Serviços Externos

| Serviço         | Tipo | Status     |
| --------------- | ---- | ---------- |
| React Router v6 | Lib  | A instalar |

### Decisões Pendentes

Nenhuma — todas as decisões críticas estão tomadas.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Bloco 0 — Fundação"**.

| Ordem | PRD         | Título                                         | Status       | Relação                      |
| ----- | ----------- | ---------------------------------------------- | ------------ | ---------------------------- |
| 1     | PRD-001     | Identidade Visual GALLO e Design System Base   | ⏳           | Pré-requisito                |
| 2     | PRD-002     | Modelo Conceitual de Domínio e Glossário       | ⏳           | Pré-requisito                |
| **3** | **PRD-003** | **Shell do App, Navegação e Layouts Base**     | **🔄 ATUAL** | Depende de PRD-001 e PRD-002 |
| 4     | PRD-004     | Geradores de Dados Fictícios e Camada de Mocks | ⏳           | Depende de PRD-002           |
| 5     | PRD-005     | Arquitetura de Provedores de Dados             | ⏳           | Depende de PRD-004           |
| 6     | PRD-006     | Sistema de Roles, Permissões e Auditoria       | ⏳           | Depende de PRD-002 e PRD-003 |
| 7     | PRD-007     | Multi-Loja                                     | ⏳           | Depende de PRD-002 e PRD-003 |

> **Nota:** PRD-003 é o segundo PRD consumido pelo Lovable. Após sua escrita (junto com PRD-001), o scaffold visual completo será gerado. PRDs 002, 004-007 ficam para o Claude Code CLI no clone local.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Auth mockada — limitações conhecidas

O esquema de auth deste PRD **não é seguro** — qualquer um pode editar o `localStorage` e se passar por qualquer papel. Isso é intencional: a Fase 1 é frontend mockado para validação, sem dados reais e sem riscos. A Fase 2 (PRDs 100+) substitui por Supabase Auth com tokens JWT verificáveis.

### Role guards no frontend ≠ proteção real

O `<GuardedRoute>` impede apenas a renderização visual de rotas para papéis errados. **Não é uma proteção de segurança** — é UX. A verdadeira proteção (acesso a dados, write permissions) acontece no backend (Supabase RLS, na Fase 2).

### Sem dados sensíveis no shell

Este PRD não manipula nem armazena dados sensíveis. O `localStorage` guarda apenas: ID do perfil mockado escolhido, preferência de tema, estado da sidebar. Nenhum desses é PII.

---

## Fluxos de Usuário

### Fluxo Principal — Owner faz login e percorre o app

1. Usuário acessa o app pela primeira vez → cai em `/auth/login`
2. Vê 3 cards: Owner, Vendedor, Cliente
3. Clica em "Entrar como Owner"
4. Sistema grava em `localStorage`, redireciona para `/app/inicio`
5. Sidebar carrega com todos os agrupamentos (Owner vê tudo)
6. Usuário clica em "Atendimento" → vai para `/app/atendimento` (placeholder)
7. Clica em "Gestão > DRE Gerencial" → vai para `/app/gestao/dre` (placeholder com referência a PRD-048)
8. Clica no avatar → dropdown abre → clica em "Trocar perfil"
9. Volta para `/auth/login`

### Fluxo Alternativo — Vendedor tenta acessar rota restrita

1. Usuário logado como Vendedor digita `/app/configuracoes` manualmente na URL
2. `<GuardedRoute roles={['Owner']}>` detecta papel insuficiente
3. Redireciona para `/sem-permissao`
4. Tela amigável: "Você não tem permissão para acessar esta área"
5. Botão "Voltar ao início" leva a `/app/inicio`

### Fluxo Mobile — Vendedor no celular

1. Vendedor abre o app no smartphone (viewport ~ 390px)
2. `<TopBar>` reduzida: signo GALLO compacto, busca como botão, notificações e avatar
3. `<BottomNav>` fixa na base: Início, Atendimento, Clientes, Ranking, Mais
4. Toca em "Atendimento" → vai para lista de conversas (tela cheia)
5. Toca em conversa específica → navega para conversa em tela cheia (sem lista)
6. Toca em "voltar" → retorna à lista
7. Toca em "Mais" → abre `<Sheet>` lateral com os demais itens (Leads, Veículos, Catálogo, etc.)

### Fluxo de Erro — chunk lazy falha

1. Usuário em `/app/inicio` clica em link para `/app/gestao`
2. `React.lazy()` tenta baixar chunk; rede falha
3. `<ErrorBoundary>` global captura o erro
4. Redireciona para `/erro`
5. Mensagem amigável + botão "Tentar novamente" (recarrega a página)

---

## Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento                | Convenção                                         | Exemplo                                     |
| ----------------------- | ------------------------------------------------- | ------------------------------------------- |
| **Componentes React**   | PascalCase                                        | `AppLayout.tsx`, `Sidebar.tsx`              |
| **Hooks**               | camelCase + `use`                                 | `useAuth.ts`, `useRouteSkeleton.ts`         |
| **Páginas**             | PascalCase + sufixo `Page`                        | `LoginPage.tsx`, `InicioPage.tsx`           |
| **Pastas**              | kebab-case                                        | `auth/`, `shell/`, `loja/`                  |
| **Layout primitives**   | PascalCase + sufixo `Layout`                      | `AppLayout`, `ConversationLayout`           |
| **Constantes de rota**  | UPPER_SNAKE_CASE                                  | `ROUTES.APP_INICIO`, `ROUTES.LOJA_HOME`     |
| **Interfaces**          | PascalCase + `I`                                  | `IRouteConfig`, `IGuardedRouteProps`        |
| **Estrutura de pastas** | Feature-based                                     | `src/features/auth/`, `src/features/shell/` |
| **Lazy loading**        | `React.lazy(() => import('@/features/.../Page'))` | —                                           |
| **Git commits**         | Conventional Commits                              | `feat: add shell layouts and routing`       |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 operando via Lovable (no scaffold inicial) ou via Claude Code CLI v2.1.3 (em refinamentos posteriores). Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.7 na plataforma web). Este PRD será consumido pelo Lovable junto com o PRD-001 no scaffold inicial.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/)
> - Atualizar o `CHANGELOG.md` seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Renomear este arquivo adicionando `_DONE` ao final
>   Ex: `PRD-003-shell-app-navegacao-layouts_DONE.md`
> - Atualizar a seção "Status de Implementação"

### Guia de Versionamento (SemVer)

| Tipo de Mudança      | Ação                 | Exemplo       |
| -------------------- | -------------------- | ------------- |
| Correção de bug      | PATCH +1             | 0.1.0 → 0.1.1 |
| Nova funcionalidade  | MINOR +1, PATCH = 0  | 0.1.0 → 0.2.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 0.x.x → 1.0.0 |

**Codinomes da plataforma GALLO BASE DIESEL:**

| Versão | Codinome   | Contexto                                                            |
| ------ | ---------- | ------------------------------------------------------------------- |
| v0.1.0 | Genesis    | PRD-001 + PRD-002 + PRD-003 (fundação completa do Lovable scaffold) |
| v0.2.0 | Hub        | Após Bloco 0 completo (mocks + providers + RBAC + multi-loja)       |
| v0.3.0 | Pilot      | Após Bloco 1 (CRM)                                                  |
| v0.4.0 | Compass    | Após Bloco 4 (Gestão)                                               |
| v0.5.0 | Storefront | Após Bloco 5 (E-commerce)                                           |
| v1.0.0 | Heavy      | Release MVP completo                                                |

🔗 Referência: https://semver.org/

### Princípios de Implementação

| Princípio                       | Descrição                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Esqueleto antes de conteúdo** | Toda rota tem placeholder antes de ter conteúdo real. Navegação funcional vence funcionalidade incompleta                                     |
| **Layouts são contratos**       | Quando criar `ConversationLayout`, ele se torna contrato visual: nenhum PRD do Bloco 1 pode mudar a anatomia geral, apenas preencher as áreas |
| **Auth mock = não-segurança**   | Tudo aqui é UX, não segurança. Não trate como tal. Toda proteção real virá com Supabase Auth + RLS na Fase 2                                  |
| **Mobile não é versão pobre**   | BottomNav e navegação por níveis em mobile precisam estar tão polidos quanto o desktop                                                        |
| **Lazy load tudo**              | Cada rota é code-split. Bundle inicial só carrega o que é estritamente necessário para a primeira tela                                        |
| **Placeholder informativo**     | `<EmptyState>` em rotas internas referencia o PRD futuro (para o time saber); em rotas públicas (`/loja`) é tom comercial neutro              |

### Orientações Gerais

| Aspecto                            | Orientação                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **React Router v6**                | Usar `<Outlet>` dentro dos layouts para renderizar children; usar `useLocation()` para destacar item ativo da sidebar     |
| **Lazy loading**                   | `const InicioPage = lazy(() => import('@/features/home/InicioPage'))` — separar por rota, não por componente              |
| **Filtragem por papel na sidebar** | Filtrar no momento do render (não no momento de construir o array de rotas) para garantir reatividade ao trocar de perfil |
| **Mocked store selector**          | No MVP, sempre mostra "GALLO Matriz" como item único; PRD-007 (Multi-Loja) introduz a lógica real                         |
| **Search global placeholder**      | Visualmente completo (input, ícone, placeholder text "Buscar clientes, peças, pedidos…"), funcionalidade zero             |
| **Notificações placeholder**       | Badge sempre mostra 3 itens estáticos; sem ação real ao clicar                                                            |
| **Avatar dropdown**                | Inclui foto, nome, papel ("Owner / GALLO Matriz"), divider, e os itens (Perfil, Configurações, Trocar perfil, Sair)       |
| **Persistência sidebar**           | Estado expandido/colapsado em `localStorage` chave `gallo-sidebar-collapsed` (boolean)                                    |

### O que NÃO Fazer

| ❌ Evitar                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- |
| Tentar implementar conteúdo funcional de qualquer tela (ex: Inbox real) neste PRD — só placeholders                  |
| Misturar lógica do app interno (`/app`) com lógica do e-commerce (`/loja`) — pastas e providers separados            |
| Hardcodar lista de itens da sidebar nos componentes — definir como dado em `src/features/shell/config/navigation.ts` |
| Ignorar `<ThemeSwitcher>` ou reimplementá-lo — usar o componente do PRD-001                                          |
| Implementar auth real com senha — fica explícito que é mockada                                                       |
| Fazer animações elaboradas de transição de rota — fade discreto e ponto                                              |
| Criar novos layouts ao consumir nos PRDs seguintes — sempre usar um dos 8 deste PRD                                  |
| Esquecer `prefers-reduced-motion` nas transições                                                                     |
| Esquecer de proteger `/app/*` com `<GuardedRoute>` (acidentalmente expondo rotas)                                    |
| Tornar `/design-system` acessível em produção (já decidido no PRD-001, reforçar aqui)                                |

---

## Status de Implementação

| Campo                     | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                | ✅ IMPLEMENTADO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Data de Implementação** | 25/05/2026                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Versão do App**         | v0.2.0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Codinome**              | Genesis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Implementado por**      | Claude Opus 4.7 (Claude Code CLI)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Observações**           | Adaptado para TanStack Router file-based (em vez de React Router v6 do PRD original) — projeto já tinha TanStack configurado como decisão arquitetural. Conceitos equivalentes: layouts via `auth.tsx`/`app.tsx`/`loja.tsx`; lazy loading via `autoCodeSplitting`; guards via `beforeLoad`. Estrutura híbrida: rotas em `src/routes/` (TanStack obriga), layouts e components em `src/features/shell/`, auth em `src/features/auth/`. 30+ rotas placeholder. Auth mockada com 3 perfis. Bump MINOR v0.2.0 mantendo codinome Genesis (Hub reservado para após Bloco 0 completo). |

---

## Histórico

| Data       | Versão | Alteração                                                                                                      |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — shell, navegação, 8 layouts, auth mockada com 3 perfis, role guards, placeholders end-to-end |

---

**AILA - Sistemas Inteligentes**
