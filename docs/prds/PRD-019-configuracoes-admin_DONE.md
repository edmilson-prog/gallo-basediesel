# PRD-019: Configurações Administrativas (esqueleto navegável)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                        |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                             |
| **Objetivo**          | Centralizar configurações administráveis da plataforma em um hub navegável, com edição funcional onde já há especificação (distribuição, modo de cadastro de veículos, lifecycle thresholds) e placeholders coerentes para áreas que serão expandidas na Fase 2 |
| **Tipo**              | Feature                                                                                                                                                                                                                                                         |
| **Complexidade**      | Média                                                                                                                                                                                                                                                           |
| **Total de Fases**    | 3                                                                                                                                                                                                                                                               |
| **Prioridade**        | Média                                                                                                                                                                                                                                                           |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                                                                                          |
| **Profundidade**      | **Esqueleto enxuto (E)**                                                                                                                                                                                                                                        |
| **PRDs Relacionados** | PRD-002 (IPlatformSettings), PRD-006 (RBAC — papéis), PRD-007 (multi-loja — lojas), PRD-013 (distribuição), PRD-016 (veículos), PRD-017 (pipeline de leads)                                                                                                     |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                              |
| **Padrão de código**  | Feature-based; código em `src/features/admin-settings/`; usa `SettingsLayout` do PRD-003                                                                                                                                                                        |

---

## Contexto do Problema

Vários PRDs anteriores referenciam configurações editáveis pelo Owner — distribuição (PRD-013), modos de cadastro de veículos (PRD-016), estágios de pipeline e motivos de perda (PRD-017), limiares de ciclo de vida do cliente (PRD-012), tags sugeridas (PRD-012), regras de gamificação (PRD-042 e PRD-043). Sem um hub centralizado, três problemas:

**Owner não sabe onde encontrar.** Cada configuração espalhada em uma sub-rota diferente, descobrir vira caça ao tesouro. **Configurações da Fase 2 não têm casa.** Tags promovidas pelo gestor, configurações de gamificação detalhadas, portal default — esses ficarão para a Fase 2, mas precisam de placeholder navegável no MVP para validar UX. **Falta de consistência de UX entre áreas.** Cada PRD que precisa editar algo inventa seu próprio padrão.

Este PRD entrega: hub `/app/configuracoes` com sub-rotas categorizadas, edição funcional para o subconjunto especificado no MVP, placeholders coerentes onde Fase 2 implementa o conteúdo.

---

## Conceito da Solução

### Estrutura de navegação

```
/app/configuracoes
├── /perfil                    (qualquer user)  — edição básica do próprio perfil
├── /aparencia                 (qualquer user)  — tema/modo (do PRD-001)
├── /usuarios                  (Owner)          — listagem de vendedores e papéis  [PLACEHOLDER]
├── /papeis                    (Owner)          — visualização da matriz RBAC (PRD-006)
├── /distribuicao              (Owner)          — regras de distribuição (PRD-013)
├── /lojas                     (Owner)          — gestão de lojas (PRD-007)
├── /atendimento
│   ├── /pipeline              (Owner)          — estágios de leads (PRD-017)         [edição limitada]
│   ├── /motivos-perda         (Owner)          — taxonomia (PRD-017)
│   ├── /tags                  (Owner/Gestor)   — catálogo de tags e promoções
│   ├── /lifecycle             (Owner)          — limiares dormente/perdido (PRD-012)
│   └── /horario-comercial     (Owner)          — businessHours (PRD-013)
├── /veiculos
│   └── /cadastro-mode         (Owner)          — modo padrão (PRD-016)
├── /whatsapp                  (Owner)          — contas WhatsApp                     [PLACEHOLDER]
├── /portal-cliente            (Owner)          — defaults do portal                  [PLACEHOLDER]
├── /gamificacao               (Owner)          — regras                              [PLACEHOLDER]
├── /divisoes                  (Owner)          — habilitar Parts/Service/Industrial  [PLACEHOLDER]
└── /auditoria                 (Owner/Gestor)   — log (PRD-006)
```

### Funcional no MVP vs Placeholder

| Categoria                      | Status MVP                                                            |
| ------------------------------ | --------------------------------------------------------------------- |
| **Perfil**                     | ✅ Funcional (editar próprios dados)                                  |
| **Aparência**                  | ✅ Funcional (tema/modo via PRD-001)                                  |
| **Distribuição**               | ✅ Funcional (PRD-013 inteiro)                                        |
| **Veículos — modo cadastro**   | ✅ Funcional (PRD-016)                                                |
| **Lifecycle thresholds**       | ✅ Funcional simples (slider de dias)                                 |
| **Horário comercial**          | ✅ Funcional (parte do PRD-013 — calendário semanal)                  |
| **Motivos de perda**           | ✅ Funcional simples (CRUD de strings)                                |
| **Estágios de pipeline**       | 🟡 Read-only no MVP (visualizar configuração atual; edição na Fase 2) |
| **Tags do catálogo**           | 🟡 Visualização + promoção manual (sem edição extensa)                |
| **Papéis e permissões**        | 🟡 Read-only (matriz visível, edição na Fase 2)                       |
| **Lojas**                      | 🟡 Read-only (matriz visível, CRUD na Fase 2)                         |
| **Auditoria**                  | ✅ Funcional (via PRD-006)                                            |
| **Usuários**                   | ⏸ Placeholder (Fase 2: CRUD de vendedores)                            |
| **WhatsApp accounts**          | ⏸ Placeholder (Fase 2: PRDs 100-102)                                  |
| **Portal do cliente defaults** | ⏸ Placeholder                                                         |
| **Gamificação**                | ⏸ Placeholder (Fase 2: PRDs 042-043)                                  |
| **Divisões**                   | ⏸ Placeholder (PARTS/SERVICE/INDUSTRIAL)                              |

### Layout

`SettingsLayout` do PRD-003: sub-sidebar à esquerda agrupada por categoria, conteúdo à direita.

```
┌────────────────────────────────────────────────────────────────────┐
│ Header: Configurações                                                │
├─────────────────────────┬──────────────────────────────────────────┤
│ Sub-sidebar             │  Conteúdo da seção ativa                  │
│ ▶ Pessoal               │                                            │
│   • Perfil              │                                            │
│   • Aparência           │                                            │
│ ▶ Administração         │                                            │
│   • Usuários            │                                            │
│   • Papéis              │                                            │
│   • Lojas               │                                            │
│ ▶ Operação              │                                            │
│   • Distribuição        │                                            │
│   • Atendimento ▾       │                                            │
│   • Veículos ▾          │                                            │
│ ▶ Integrações           │                                            │
│   • WhatsApp            │                                            │
│   • Portal              │                                            │
│ ▶ Avançado              │                                            │
│   • Gamificação         │                                            │
│   • Divisões            │                                            │
│   • Auditoria           │                                            │
└─────────────────────────┴──────────────────────────────────────────┘
```

### Placeholder pattern

Toda seção em modo placeholder mostra:

- Título da seção
- Descrição curta do que será (sem ferir expectativa)
- Card visual estilizado mostrando a estrutura esperada (read-only)
- Banner: "Edição disponível na Fase 2 — esta seção está em preparação"

Exemplo (Gamificação):

```
┌─────────────────────────────────────────────┐
│ Gamificação                                  │
│ Configure regras de pontuação, badges e     │
│ ranking dos vendedores.                      │
├─────────────────────────────────────────────┤
│ 🚧 Edição disponível na Fase 2              │
│                                              │
│ Esta seção será implementada em PRD-042 e   │
│ PRD-043, permitindo configurar:              │
│  • Regras de pontuação por venda            │
│  • Badges e conquistas                       │
│  • Critérios de ranking                      │
│                                              │
│ Por enquanto, os defaults da plataforma     │
│ estão em vigor.                              │
└─────────────────────────────────────────────┘
```

---

## Escopo

### Incluído

- ✅ Hub `/app/configuracoes` usando `SettingsLayout` do PRD-003
- ✅ Sub-sidebar com 5 categorias (Pessoal / Administração / Operação / Integrações / Avançado)
- ✅ Sub-rotas funcionais:
  - `/perfil` — editar nome, email, telefone, foto do próprio user
  - `/aparencia` — toggle tema/modo (já implementado pelo PRD-001; este PRD apenas referencia)
  - `/distribuicao` — embed do painel completo do PRD-013
  - `/lojas` — embed do painel read-only do PRD-007
  - `/papeis` — embed da matriz read-only do PRD-006
  - `/atendimento/motivos-perda` — CRUD simples de strings (lista, add, remove)
  - `/atendimento/lifecycle` — sliders para dormentDays (default 90) e lostDays (default 365)
  - `/atendimento/horario-comercial` — editor de horário (calendário semanal do PRD-013, integrado aqui também)
  - `/veiculos/cadastro-mode` — radio com 3 opções (auto/approval/manual)
  - `/atendimento/pipeline` — visualização read-only dos estágios atuais
  - `/atendimento/tags` — listagem de tags com indicador de "rascunho" (livres) vs "oficial" + botão "Promover" individual
  - `/auditoria` — embed do componente de audit log do PRD-006
- ✅ Sub-rotas placeholder:
  - `/usuarios`, `/whatsapp`, `/portal-cliente`, `/gamificacao`, `/divisoes`
- ✅ Permissões via `<GuardedRoute>` por sub-rota (alguns são Owner-only, outros Gestor-ok, outros qualquer user)
- ✅ Audit log via PRD-006 em todas as edições
- ✅ Botão "Voltar" / breadcrumb em sub-rotas profundas
- ✅ Validações básicas em cada formulário
- ✅ Toast de confirmação ao salvar

### Excluído

- ❌ CRUD completo de usuários (criar, demitir vendedores) — Fase 2
- ❌ CRUD de lojas (criar filial) — Fase 2
- ❌ Edição de matriz RBAC (criar papéis customizados, alterar permissões) — Fase 2
- ❌ Conexão real com WhatsApp Cloud API / Evolution — Fase 2 (PRDs 100-102)
- ❌ Configuração de gateway de pagamento — Fase 2
- ❌ Configuração de IA / LLMs (parâmetros do SDR) — Fase 2 (PRD-024)
- ❌ Editor visual de estágios do pipeline (arrastar, renomear, mudar cores) — Fase 2
- ❌ Edição de configurações por loja específica em ambiente multi-loja — Fase 2 quando filial existir
- ❌ Histórico de versões de configurações (rollback) — Fase 2

---

## Requisitos Funcionais

### Hub e navegação

- **RF-001:** Substituir placeholder de `/app/configuracoes` (PRD-003) por `AdminSettingsPage` usando `SettingsLayout`.
- **RF-002:** Sub-sidebar com 5 grupos (Pessoal / Administração / Operação / Integrações / Avançado) listando todas as sub-rotas.
- **RF-003:** Sub-rotas filtradas por permissão do user atual: itens sem permissão não aparecem no menu.
- **RF-004:** Rota `/app/configuracoes` sem sub-rota redireciona para `/app/configuracoes/perfil` (sempre acessível).
- **RF-005:** Item ativo da sub-sidebar destacado (background `--accent` translúcido).
- **RF-006:** Mobile (< 768px): sub-sidebar vira dropdown ou drawer.

### Sub-rota /perfil (qualquer user)

- **RF-007:** Formulário para editar `currentUser`:
  - Nome (texto)
  - Email
  - Telefone
  - Foto (upload simulado no MVP — placeholder)
  - Especialidades (multi-input se Vendedor)
- **RF-008:** Botão "Salvar" chama `useSellersProvider().update(currentUser.id, patch)`.
- **RF-009:** Toast de confirmação.
- **RF-010:** Auditoria automática via mutations do provider (PRD-006).

### Sub-rota /aparencia (qualquer user)

- **RF-011:** Referenciar `<ThemeSwitcher>` do PRD-001 — seleção de tema e modo com preview.
- **RF-012:** Persistência conforme já especificado no PRD-001.

### Sub-rota /distribuicao (Owner)

- **RF-013:** Embed do `<DistributionRulesPanel>` do PRD-013.

### Sub-rota /lojas (Owner)

- **RF-014:** Embed da `StoresPage` do PRD-007 (read-only).

### Sub-rota /papeis (Owner/Gestor)

- **RF-015:** Embed da `RolesPage` do PRD-006 (read-only).

### Sub-rota /atendimento/motivos-perda (Owner)

- **RF-016:** CRUD simples de `IPlatformSettings.lossReasons` (array de strings):
  - Lista atual com botão "X" para remover
  - Input + botão "Adicionar" para criar nova
- **RF-017:** Salvar via `useSettingsProvider().update()`. Toast.

### Sub-rota /atendimento/lifecycle (Owner)

- **RF-018:** 2 sliders:
  - **Dias para considerar dormente** (default 90, range 30-180)
  - **Dias para considerar perdido** (default 365, range 180-720)
- **RF-019:** Preview do impacto: "Com X dias, atualmente [N] clientes seriam considerados dormentes" (cálculo via mock).
- **RF-020:** Salvar via provider; audit log.

### Sub-rota /atendimento/horario-comercial (Owner)

- **RF-021:** Embed do editor de horário comercial do PRD-013 (calendário semanal).

### Sub-rota /atendimento/pipeline (read-only)

- **RF-022:** Visualização dos estágios atuais em `IPlatformSettings.pipelineStages`:
  - Lista com ordem, nome, cor
  - Badge "Edição disponível na Fase 2"
- **RF-023:** Botão "Sugerir mudança" abre placeholder com tooltip "Disponível na Fase 2".

### Sub-rota /atendimento/tags (Owner/Gestor)

- **RF-024:** Listagem de tags em uso:
  - Tags oficiais (`IPlatformSettings.tagSuggestions`) com badge "✓ Oficial"
  - Tags livres detectadas (em uso por clientes mas não no catálogo) com badge "Rascunho"
- **RF-025:** Botão "Promover ao catálogo" em cada tag livre (apenas Owner/Gestor) → adiciona à `tagSuggestions`.
- **RF-026:** Botão "Remover do catálogo" em tags oficiais (com confirmação se tem clientes usando).
- **RF-027:** Botão "+ Adicionar tag oficial" — input para criar tag direto no catálogo.

### Sub-rota /veiculos/cadastro-mode (Owner)

- **RF-028:** Radio com 3 opções:
  - **Automático**: vendedor cadastra direto, aprovado
  - **Aprovação**: vendedor cadastra como pendente, gestor revisa
  - **Manual**: apenas gestor cadastra
- **RF-029:** Descrição de cada opção visível inline.
- **RF-030:** Salvar via provider; audit log; afeta `IPlatformSettings.vehicleCadastroMode`.
- **RF-031:** Aviso: "Esta configuração pode ser sobrescrita por vendedor em /usuarios (Fase 2)."

### Sub-rota /auditoria (Owner/Gestor/Financeiro)

- **RF-032:** Embed do `AuditLogPage` do PRD-006.

### Sub-rotas placeholder

- **RF-033:** Cada placeholder renderiza o pattern descrito em "Placeholder pattern":
  - Título + descrição
  - Banner "Edição disponível na Fase 2 — esta seção está em preparação"
  - Lista do que será implementado
  - Status atual (defaults da plataforma em vigor)
- **RF-034:** Para `/divisoes`, mostrar visualmente PARTS (verde), SERVICE (vermelho), INDUSTRIAL (amarelo) com toggle desabilitado em SERVICE e INDUSTRIAL: "Disponível quando GALLO ativar essa frente comercial".

### Permissões

- **RF-035:** Cada sub-rota tem `<GuardedRoute permission={{ resource, action }}>`:
  - `/perfil`, `/aparencia`: qualquer user autenticado
  - `/distribuicao`, `/lojas`, `/usuarios`, `/whatsapp`, `/portal-cliente`, `/gamificacao`, `/divisoes`, `/veiculos/cadastro-mode`, `/atendimento/lifecycle`, `/atendimento/horario-comercial`: Owner only
  - `/papeis`, `/atendimento/tags`, `/atendimento/motivos-perda`, `/atendimento/pipeline`: Owner + Gestor
  - `/auditoria`: Owner + Gestor + Financeiro

### Validações e UX

- **RF-036:** Toda edição confirma com toast "Configuração salva" + ícone ✓.
- **RF-037:** Tentativa de salvar com erro mostra toast com mensagem clara.
- **RF-038:** Mudanças não salvas geram modal de confirmação ao tentar navegar para outra sub-rota: "Você tem alterações não salvas. Continuar sem salvar?".

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Hub renderiza em < 250ms; sub-rotas em < 300ms.
- **RNF-002 (Acessibilidade):** WCAG 2.1 AA; sub-sidebar navegável por teclado; sub-rotas anunciadas para screen readers.
- **RNF-003 (Responsividade):** Mobile usável; sub-sidebar vira menu hamburger ou drawer.
- **RNF-004 (Tipagem):** Zero `any`; `IPlatformSettings` respeitado.

---

## Critérios de Aceitação

### Navegação e permissões

```gherkin
DADO que sou Vendedor e acesso /app/configuracoes
QUANDO a página carrega
ENTÃO vejo apenas: Perfil, Aparência, Auditoria (esta última só se tiver permission view em audit_log; no caso de Vendedor, NÃO vê)
  E itens administrativos NÃO aparecem na sidebar

DADO que sou Gestor
QUANDO acesso /app/configuracoes
ENTÃO vejo Perfil, Aparência, Papéis (read-only), Tags, Motivos de Perda, Auditoria
  E NÃO vejo Distribuição (Owner-only), Lojas (Owner-only), Usuários, etc.

DADO que sou Owner
QUANDO acesso /app/configuracoes
ENTÃO vejo todas as sub-rotas
```

### Edições funcionais

```gherkin
DADO que sou Owner e acesso /app/configuracoes/atendimento/lifecycle
QUANDO movo o slider de "dormente" de 90 para 60 dias e salvo
ENTÃO toast "Configuração salva"
  E IPlatformSettings.lifecycleThresholds.dormantDays = 60
  E auditLog registra a mudança
  E preview atualiza com a nova contagem de clientes que seriam dormentes

DADO que estou em /atendimento/motivos-perda
QUANDO adiciono "Cliente sumiu" ao input e salvo
ENTÃO o motivo aparece na lista
  E IPlatformSettings.lossReasons inclui o novo
  E no modal de marcar lead como perdido (PRD-017), esse motivo aparece como opção

DADO que estou em /veiculos/cadastro-mode e mudo de "auto" para "approval"
QUANDO salvo
ENTÃO IPlatformSettings.vehicleCadastroMode = 'approval'
  E vendedores que criem veículos agora geram pendência
```

### Promoção de tags

```gherkin
DADO uma tag livre "frota volvo" criada por um vendedor
QUANDO Gestor acessa /atendimento/tags e clica "Promover ao catálogo"
ENTÃO tag passa a IPlatformSettings.tagSuggestions
  E badge muda de "Rascunho" para "Oficial"
  E auditLog registra
```

### Placeholders

```gherkin
DADO acesso /app/configuracoes/gamificacao
QUANDO a página carrega
ENTÃO vejo título, descrição, banner "Edição disponível na Fase 2"
  E lista do que será implementado
  E NÃO há controles editáveis

DADO acesso /app/configuracoes/divisoes
QUANDO observo
ENTÃO vejo 3 cards (Parts/Service/Industrial) com cores das submarcas
  E apenas Parts está habilitado (verde)
  E Service e Industrial mostram "Disponível em fase futura"
```

### Confirmação de mudanças não salvas

```gherkin
DADO que editei dados no /perfil mas não salvei
QUANDO clico em outra sub-rota
ENTÃO modal aparece "Você tem alterações não salvas. Continuar sem salvar?"
  E posso escolher "Cancelar" (volta ao perfil) ou "Descartar" (navega sem salvar)
```

---

## Fases de Implementação

| Fase | Objetivo                                                                                              | Arquivos Estimados |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------ |
| 1    | Hub + sub-sidebar + rotas funcionais simples (perfil, aparência, motivos, lifecycle, cadastro mode)   | 6-8                |
| 2    | Embeds de outros PRDs (distribuição, lojas, papéis, horário comercial, auditoria) + tags com promoção | 5-6                |
| 3    | Placeholders coerentes para 5 áreas Fase 2 + polish                                                   | 3-4                |

### Detalhamento das Fases

#### Fase 1: Hub e Edições Simples

**Ações:**

- [ ] Criar `AdminSettingsPage` com `SettingsLayout`
- [ ] Sub-sidebar agrupada em 5 categorias
- [ ] Filtragem de itens por permissão
- [ ] Sub-rotas: `/perfil`, `/aparencia`, `/atendimento/motivos-perda`, `/atendimento/lifecycle`, `/veiculos/cadastro-mode`
- [ ] Salvamento via providers + audit log + toast
- [ ] Confirmação de mudanças não salvas

**Validação:** Owner edita lifecycle threshold e o cálculo de clientes dormentes muda na ficha (PRD-012).

#### Fase 2: Embeds e Tags

**Ações:**

- [ ] Embeds: distribuição (PRD-013), lojas (PRD-007), papéis (PRD-006), horário comercial (PRD-013), auditoria (PRD-006)
- [ ] Sub-rota `/atendimento/tags` com listagem + promoção
- [ ] Sub-rota `/atendimento/pipeline` read-only

**Validação:** todos os embeds funcionam; promover tag livre move para catálogo oficial.

#### Fase 3: Placeholders e Polish

**Ações:**

- [ ] Sub-rotas placeholder: `/usuarios`, `/whatsapp`, `/portal-cliente`, `/gamificacao`, `/divisoes`
- [ ] Pattern visual coerente em cada placeholder
- [ ] Especial: `/divisoes` com 3 cards (Parts/Service/Industrial)
- [ ] Mobile responsivo
- [ ] Empty states e error states

**Validação:** placeholders deixam claro o que vem na Fase 2; mobile usável.

---

## Dependências

### PRDs Anteriores

| PRD                                  | Status      |
| ------------------------------------ | ----------- |
| PRD-002 (IPlatformSettings)          | 📝 Redigido |
| PRD-003 (SettingsLayout)             | 📝 Redigido |
| PRD-005 (Provider)                   | 📝 Redigido |
| PRD-006 (RBAC, audit log)            | 📝 Redigido |
| PRD-007 (lojas)                      | 📝 Redigido |
| PRD-013 (distribuição)               | 📝 Redigido |
| PRD-016 (veículos — cadastro mode)   | 📝 Redigido |
| PRD-017 (pipeline, motivos de perda) | 📝 Redigido |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Título                            | Status       |
| ------ | ------------ | --------------------------------- | ------------ |
| 1-9    | PRDs 010-018 | CRM funcional                     | 📝           |
| **10** | **PRD-019**  | **Configurações Administrativas** | **🔄 ATUAL** |

> **Marco:** com este PRD, **Bloco 1 (CRM) está completo**.

---

## Considerações de Segurança

### Audit em mudanças de configuração

Mudanças em configurações afetam comportamento de todo o sistema — limiares, modos, taxonomias. Audit log obrigatório em cada save.

### Placeholders não vazam informação

Placeholders mostram intenção de produto, não estrutura interna. Texto vago o suficiente para não comprometer roadmap.

### Permissões granulares

`<GuardedRoute>` em cada sub-rota é redundante com filtragem da sub-sidebar mas garante proteção mesmo via URL manipulation.

---

## Fluxos de Usuário

### Fluxo Principal — Owner ajusta lifecycle threshold

1. João Gallo (Owner) percebe que clientes virando dormentes em 90 dias é demais
2. Acessa `/app/configuracoes/atendimento/lifecycle`
3. Slider muda de 90 para 75
4. Preview mostra: "Com 75 dias, atualmente 28 clientes seriam considerados dormentes (vs 23 antes)"
5. Salva → toast → audit log
6. Próximas avaliações de status do ciclo de vida (PRD-012) usam 75

### Fluxo Alternativo — Gestor promove tag

1. Marina nota que vendedores criaram tag "frota Volvo" em vários clientes
2. Acessa `/app/configuracoes/atendimento/tags`
3. Vê tag "frota Volvo" listada como Rascunho (usada por 12 clientes)
4. Clica "Promover ao catálogo"
5. Tag vira oficial; sugestões nos autocompletes da ficha (PRD-012) e PRD-015 a incluem

### Fluxo de Erro — Mudança não salva

1. Owner está em `/perfil` editando email
2. Decide ir para `/distribuicao` sem salvar
3. Modal: "Você tem alterações não salvas. Continuar sem salvar?"
4. Owner escolhe "Cancelar" → volta ao perfil
5. Salva, depois navega normalmente

---

## Convenções de Código (Referência Rápida)

| Elemento        | Convenção            | Exemplo                                                                        |
| --------------- | -------------------- | ------------------------------------------------------------------------------ |
| **Página**      | PascalCase + `Page`  | `AdminSettingsPage`, `LifecycleSettingsPage`                                   |
| **Componentes** | PascalCase           | `<SettingsSidebar>`, `<LossReasonsEditor>`                                     |
| **Hooks**       | camelCase + `use`    | `useSettings`, `useUnsavedChanges`                                             |
| **Pasta**       | kebab-case           | `admin-settings/`                                                              |
| **Git commits** | Conventional Commits | `feat(admin-settings): add admin hub with functional and placeholder sections` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                            | Descrição                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| **Esqueleto não é vazio**            | Placeholders são informativos — explicam o que virá, não só "em construção"    |
| **Funcional vs placeholder**         | MVP entrega o subconjunto especificado; resto fica claro como Fase 2           |
| **Reusar componentes existentes**    | Distribuição, lojas, papéis, auditoria já têm UI própria — embed, não duplicar |
| **Permissões granulares**            | Cada sub-rota tem seu próprio gate                                             |
| **Audit em tudo**                    | Cada save dispara audit log via PRD-006                                        |
| **Mudanças não salvas tem proteção** | Modal de confirmação evita perda                                               |

### O que NÃO Fazer

| ❌ Evitar                                                      |
| -------------------------------------------------------------- |
| Implementar funcionalidade dos placeholders — fica para Fase 2 |
| Duplicar a UI de distribuição/lojas/papéis — usar embed        |
| Esquecer audit log em saves                                    |
| Permitir Vendedor ver itens administrativos                    |
| Implementar CRUD de usuários ou lojas — Fase 2                 |
| Conectar WhatsApp real — Fase 2                                |
| Esquecer proteção de mudanças não salvas                       |
| Placeholder vago "Em construção" — sempre explicar o que virá  |

---

## Status de Implementação

| Campo      | Valor             |
| ---------- | ----------------- |
| **Status** | ✅ CONCLUÍDO      |
| **Versão** | v0.16.0 — Cockpit |
| **Data**   | 26/05/2026        |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                    |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — hub de configurações com edição funcional do subconjunto especificado e placeholders coerentes para Fase 2 |

---

**AILA - Sistemas Inteligentes**
