# PRD-070: PWA Vendedor Externo (esqueleto navegável)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                 |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                      |
| **Objetivo**          | Criar PWA (Progressive Web App) para vendedor externo — esqueleto navegável otimizado mobile com minha carteira, novo orçamento rápido, agenda de visitas e captura offline preparado para implementação completa Fase 2 |
| **Tipo**              | Feature                                                                                                                                                                                                                  |
| **Complexidade**      | Média                                                                                                                                                                                                                    |
| **Total de Fases**    | 3                                                                                                                                                                                                                        |
| **Prioridade**        | Média                                                                                                                                                                                                                    |
| **Épico**             | Bloco 6 — Auxiliares                                                                                                                                                                                                     |
| **Profundidade**      | **Esqueleto enxuto (E)**                                                                                                                                                                                                 |
| **PRDs Relacionados** | PRD-002 (ISeller — campo type externo), PRD-012 (Cliente), PRD-015 (Carteira), PRD-031 (Orçamento)                                                                                                                       |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                       |
| **Padrão de código**  | Feature-based; código em `src/features/external-seller-pwa/`; rota `/pwa/*`                                                                                                                                              |

### Critérios de Complexidade

> **Justificativa de Média:** PWA sub-app com layout mobile-first próprio (não responsive do app web), service worker placeholder Fase 2, modo offline placeholder, 5 telas principais (login, dashboard, carteira, novo orçamento rápido, agenda), sincronização placeholder Fase 2. Esqueleto navegável no MVP demonstra estrutura sem implementar offline-first completo.

---

## Contexto do Problema

GALLO BASE DIESEL pode no futuro ter **vendedores externos** que visitam clientes em campo (frotas pelo interior do RS). Hoje o sistema é desktop-first; em campo:

**Tablet/celular precisa de UX dedicado.** App web não é otimizado para uso em pé, com uma mão.
**Conectividade ruim.** Vendedor em estrada/zona rural — offline-first é importante.
**Workflow simplificado.** Em campo, não precisa de todos os recursos — precisa de: ver carteira, criar orçamento rápido, agendar visita, fechar pedido.

Este PRD entrega: **esqueleto navegável** mostrando a estrutura preparada. Implementação completa (service worker, IndexedDB, sync) fica para Fase 2 quando vendedor externo for ativado.

> **Nota:** briefing menciona "External seller support via `ISeller` type field (dormant in MVP, modeled for future)". Este PRD é a fundação visual desse caminho.

---

## Conceito da Solução

### Estrutura

Rota base `/pwa` separada de `/app` (interno) e `/loja` (e-commerce).

```
/pwa/login           → Login simplificado
/pwa/inicio          → Dashboard mobile
/pwa/carteira        → Minha carteira (lista de clientes)
/pwa/carteira/:id    → Cliente detalhe (versão compacta)
/pwa/orcamento-rapido → Wizard criação orçamento (3 telas)
/pwa/agenda          → Agenda de visitas
/pwa/agenda/nova     → Agendar visita
```

### Layout mobile-first

Bottom navigation (5 ícones):

- 🏠 Início
- 📇 Carteira
- 📋 Novo Orçamento
- 📅 Agenda
- 👤 Eu

### Login `/pwa/login`

- Logo GALLO simplificado
- Email + senha (auth mock no MVP)
- Botão "Entrar"

### Dashboard `/pwa/inicio`

KPIs grandes (touch-friendly):

- "5 visitas hoje"
- "2 orçamentos enviados"
- "R$ 12k em pipeline"

Listas:

- Próximas visitas (hoje + amanhã)
- Orçamentos pendentes
- Atalhos: Novo orçamento / Agendar visita

### Carteira `/pwa/carteira`

Lista compacta de clientes (mesma origem do PRD-015 mas com layout mobile):

- Busca no topo
- Cada item: foto + nome + último contato + status badge
- Click → /pwa/carteira/:id (versão compacta da ficha PRD-012)

### Novo Orçamento Rápido `/pwa/orcamento-rapido`

Wizard de 3 telas (touch-otimizado):

1. **Cliente**: select da carteira (autocomplete) ou "+ Novo"
2. **Itens**: busca de produto (PRD-030) com seletor de quantidade grande; lista crescente; total atualizado
3. **Confirmar**: revisar + enviar

Cria IQuote (PRD-031) com origin='vendedor' e captura de localização opcional (placeholder Fase 2).

### Agenda `/pwa/agenda`

Calendário simplificado:

- Visualização semana atual
- Lista de visitas agendadas
- Botão "+ Nova visita"

### Agendamento `/pwa/agenda/nova`

Form simples:

- Cliente (select)
- Data + hora
- Endereço (autopreenchido pelo cliente)
- Notas

Cria entrada `IVisit` (modelo novo, simples).

### Offline (placeholder)

No MVP: app funciona apenas online. Banner: "Modo offline disponível na Fase 2".

Fase 2:

- Service worker
- IndexedDB para cache de carteira/produtos
- Queue de mutations offline
- Sync ao reconectar

### Manifest PWA

`manifest.json` configurado para "instalável":

- Nome: "GALLO Vendedor"
- Theme color: cor da marca
- Icons placeholder
- start_url: `/pwa`
- display: standalone

### Permissões

- Apenas `ISeller` com `type='external'` (Fase 2 — no MVP, qualquer vendedor pode acessar para validação visual)
- Sessão própria (separada do /app interno?)

### Alternativas Consideradas

| Alternativa                               | Por que descartada                                      |
| ----------------------------------------- | ------------------------------------------------------- |
| Implementar offline-first completo no MVP | Complexidade alta sem ROI até ter vendedor externo real |
| Usar /app responsive (não app separado)   | UX em campo precisa otimização mobile-first dedicada    |
| Native app (Flutter, React Native)        | PWA é suficiente; sem custo de manutenção dupla         |
| Sem login (auth via SSO)                  | Fase 2 — manter MVP simples                             |

---

## Escopo

### Incluído

- ✅ Rota base `/pwa` com layout mobile-first próprio
- ✅ Bottom navigation com 5 ícones
- ✅ Login mock `/pwa/login`
- ✅ Dashboard `/pwa/inicio` com KPIs grandes e listas
- ✅ Carteira `/pwa/carteira` com lista compacta + busca
- ✅ Cliente detalhe `/pwa/carteira/:id` (versão compacta da ficha)
- ✅ Novo Orçamento Rápido wizard 3 telas
- ✅ Agenda `/pwa/agenda` com calendário simples + lista
- ✅ Agendar visita `/pwa/agenda/nova`
- ✅ Modelo `IVisit` para visitas (placeholder)
- ✅ Manifest PWA instalável
- ✅ Banner "Modo offline disponível na Fase 2"
- ✅ Banner em cada tela "PWA em desenvolvimento — funcionalidades completas na Fase 2"
- ✅ Reuso de providers e tipos do /app
- ✅ Componentes touch-friendly (botões grandes, padding generoso)

### Excluído

- ❌ Service worker funcional — Fase 2
- ❌ IndexedDB offline cache — Fase 2
- ❌ Sync queue para mutations offline — Fase 2
- ❌ Push notifications — Fase 2
- ❌ Captura de localização GPS — Fase 2
- ❌ Captura de assinatura — Fase 2
- ❌ Foto de cliente/produto — Fase 2
- ❌ Integração com calendário do dispositivo — Fase 2
- ❌ Mapa de rotas otimizadas — Fase 2
- ❌ Modo escuro automático por horário — Fase 2

---

## Requisitos Funcionais

### Estrutura e roteamento

- **RF-001:** Rota base `/pwa` com `PWALayout` próprio (mobile-first).
- **RF-002:** Bottom navigation persistente com 5 ícones.
- **RF-003:** Manifest PWA + meta tags para instalação.

### Login

- **RF-004:** `PWALoginPage` em `/pwa/login`.
- **RF-005:** Auth mock (similar PRD-065 storefront).
- **RF-006:** Banner "PWA em desenvolvimento — funcionalidades completas na Fase 2".

### Dashboard

- **RF-007:** `PWAHomePage` em `/pwa/inicio` com KPIs + listas.
- **RF-008:** Atalhos para principais ações.

### Carteira

- **RF-009:** `PWAPortfolioPage` em `/pwa/carteira` reusando dados do PRD-015 com UI mobile.
- **RF-010:** Busca no topo + lista scrolável.

### Cliente detalhe (compacto)

- **RF-011:** `PWACustomerDetailPage` em `/pwa/carteira/:id`.
- **RF-012:** Versão simplificada da ficha (PRD-012): info essencial + tabs (pedidos, orçamentos, veículos, conversas).

### Novo Orçamento Rápido

- **RF-013:** `PWAQuickQuotePage` em `/pwa/orcamento-rapido` com wizard 3 telas.
- **RF-014:** Stepper visual touch-friendly.
- **RF-015:** Cria IQuote via PRD-031 com origin='vendedor'.

### Agenda

- **RF-016:** `PWAAgendaPage` em `/pwa/agenda`.
- **RF-017:** Modelo `IVisit { id, customerId, sellerId, scheduledAt, address, notes, status }`.
- **RF-018:** Geradores de mock: ~15 visitas distribuídas.
- **RF-019:** Calendário simplificado + lista de visitas.

### Agendamento

- **RF-020:** `PWANewVisitPage` em `/pwa/agenda/nova` com form simples.

### Manifest PWA

- **RF-021:** `manifest.json` com nome, ícones placeholder, theme color, start_url.
- **RF-022:** Service worker básico (apenas cache de assets estáticos no MVP; sem lógica offline).

### Permissões

- **RF-023:** No MVP: qualquer vendedor pode acessar (validação visual).
- **RF-024:** Fase 2: apenas `ISeller.type='external'`.

---

## Requisitos Não-Funcionais

- **RNF-001:** UI mobile-first (320px+).
- **RNF-002:** Botões mínimo 44×44 px (touch-friendly).
- **RNF-003:** PWA instalável (lighthouse PWA ≥ 80).
- **RNF-004:** Páginas renderizam < 400ms.
- **RNF-005:** Funciona em viewport rotacionado (portrait/landscape).

---

## Critérios de Aceitação

```gherkin
DADO acesso /pwa no celular
QUANDO página carrega
ENTÃO vejo layout mobile-first com bottom nav
  E banner "PWA em desenvolvimento — Fase 2"
  E posso instalar como PWA (browser oferece)

DADO clico no ícone "Carteira" no bottom nav
QUANDO navego
ENTÃO vou para /pwa/carteira
  E vejo lista compacta de clientes da minha carteira

DADO acesso /pwa/orcamento-rapido
QUANDO observo
ENTÃO vejo wizard de 3 telas
  E botões grandes touch-friendly
  E posso criar orçamento que vira IQuote real

DADO acesso /pwa/agenda
QUANDO observo
ENTÃO vejo calendário + lista de visitas mockadas
  E posso agendar nova visita

DADO instalo PWA via browser
QUANDO abro do home screen
ENTÃO app abre em modo standalone (sem barra do browser)
  E manifest aplicado corretamente
```

---

## Fases de Implementação

| Fase | Objetivo                                                 |
| ---- | -------------------------------------------------------- |
| 1    | Estrutura /pwa + layout + bottom nav + login + dashboard |
| 2    | Carteira + cliente detalhe + novo orçamento wizard       |
| 3    | Agenda + manifest PWA + polish + banners Fase 2          |

---

## Dependências

| PRD                               | Status |
| --------------------------------- | ------ |
| PRD-012 (ficha — versão compacta) | 📝     |
| PRD-015 (carteira — reuso)        | 📝     |
| PRD-031 (criação orçamento)       | 📝     |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-41   | 010-067           |
| **42** | **PRD-070 ATUAL** |
| 43     | PRD-071           |

---

## Considerações de Segurança

- PWA tem mesma sessão de auth que o app (Fase 2 com Supabase Auth)
- Dados sensíveis (carteira, preços) protegidos por permissões
- Offline placeholder no MVP — sem armazenamento de dados sensíveis local

---

## Convenções

| Elemento | Convenção                               |
| -------- | --------------------------------------- |
| Página   | `PWAHomePage`, `PWAPortfolioPage`, etc. |
| Layout   | `PWALayout`                             |
| Pasta    | `external-seller-pwa/`                  |

---

## Notas para o Agente Desenvolvedor

- Mobile-first puro — não responsive do /app
- Bottom nav é padrão de PWAs comerciais
- Reuso de providers do /app (não duplicar mocks)
- Banners "Fase 2" são essenciais (transparência)
- Manifest PWA configurado para instalabilidade
- Service worker MVP: apenas cache de assets (sem lógica offline)

---

## Status

| Campo  | Valor                               |
| ------ | ----------------------------------- |
| Status | ✅ IMPLEMENTADO (v0.45.1 — Gateway) |

---

## Histórico

| Data       | Versão | Alteração                                                                              |
| ---------- | ------ | -------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — PWA esqueleto navegável para vendedor externo, preparado para Fase 2 |

---

**AILA - Sistemas Inteligentes**
