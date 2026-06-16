# PRD-212: Horário de Atendimento + Enforcement de Acesso

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | (mesmo da Fase 1/2) |
| **Objetivo** | Permitir definir, por usuário, um **horário de atendimento** (janelas por dia da semana) que controla o **acesso à plataforma**: usuários operacionais só acessam dentro do horário; Owner/Gestor são exceção; quem já está dentro quando a janela fecha é apenas avisado; fora do horário o usuário fica `offline` e sai do rodízio |
| **Tipo** | Feature |
| **Complexidade** | Média-Alta |
| **Total de Fases** | 4 |
| **Prioridade** | Média (P2) |
| **Épico** | Gestão de Pessoas & Acesso (polish go-live) |
| **PRDs Relacionados** | 211 (cadastro de usuário), F1:013 (horário comercial da loja / disponibilidade), 107 (Auth Custom Claims), 103 (RLS), 213 (rodízio) |
| **Padrão de código** | camelCase para novos campos; snake_case (plural) para tabelas |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios |
|--------------|-----------|
| **Baixa** | 1 arquivo, sem dependências externas, < 100 linhas |
| **Média** | 2-5 arquivos, banco OU integração, funcionalidade isolada |
| **Alta** | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa Média-Alta:** introduz um modelo de horário por usuário (com timezone e exceções pontuais), um gate de acesso integrado à autenticação com regras assimétricas por papel, exceções de emergência, e interage com disponibilidade (PRD-013) e rodízio (PRD-213). O enforcement precisa ser confiável tanto no mock (Fase 1, client-side) quanto no real (Fase 2, server-side via Auth/Edge Function), sem nunca trancar Owner/Gestor.

---

## Contexto do Problema

Hoje o acesso à plataforma é governado **apenas por papel** (o `<GuardedRoute>` do PRD-003 protege rotas por papel) e a autenticação não conhece "horário de trabalho". Existe um conceito de horário, mas é outro: o `IPlatformSettings.businessHours` (PRD-013) é o **horário comercial da loja**, usado pela engine de distribuição para acionar o SDR fora do expediente. Ele **não** controla quando cada pessoa pode entrar no sistema.

A Turbo Diesel precisa de algo diferente: que um vendedor, um SDR ou o financeiro só consiga **acessar a plataforma dentro do seu turno**. É um controle de jornada e de superfície de acesso — evita que um operador entre no sistema fora do horário (seja por hábito, seja por risco operacional/segurança), e mantém a presença coerente (quem está fora do turno não deve aparecer disponível para receber atendimento).

O desafio é fazer isso **sem criar armadilhas**: o dono e os gestores precisam de acesso a qualquer hora (emergências, fechamento, suporte), ninguém pode ser "expulso" no meio de um atendimento em andamento, e tem que existir uma válvula de escape (liberação temporária) para o imprevisto.

> **Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação.**

---

## Conceito da Solução

### Situação Atual (As-Is)

- Acesso controlado só por papel; sem noção de horário por usuário.
- `IPlatformSettings.businessHours` = horário **da loja** (distribuição/SDR), não de acesso.
- `ISeller.availability` (online/ausente/ocupado/offline) é definido manualmente pelo usuário/gestor (PRD-013).

### Situação Desejada (To-Be)

**1. Horário por usuário (`workSchedule`).** Cada usuário pode ter uma agenda semanal de janelas de atendimento — mesma forma estrutural do `IBusinessHours` (dias × `openAt`/`closeAt` × `enabled`), porém **por usuário** e com **timezone** `America/Sao_Paulo`. Quem não tem `workSchedule` definido não sofre restrição (sem janela = acesso livre).

> **Distinção explícita (anti-confusão):** `IPlatformSettings.businessHours` controla **distribuição/SDR da loja**; `ISeller.workSchedule` controla **acesso do usuário**. São entidades distintas e independentes. Este PRD **não** altera o `businessHours` da loja.

**2. Exceções pontuais (`scheduleOverrides`).** Datas específicas que **bloqueiam** (ex: feriado, folga) ou **liberam** (ex: mutirão) fora da regra semanal. Cobre feriados e ajustes one-off sem reescrever a agenda.

**3. Enforcement assimétrico (decisão 3-C).**

| Momento | Papel operacional (Vendedor, Vendedor Externo, SDR, Financeiro) | Owner / Gestor | Cliente (portal) |
|---------|------------------------------------------------------------------|----------------|-------------------|
| **Login fora da janela** | 🚫 Bloqueado — mensagem clara + horário + opção de pedir liberação | ✅ Sempre liberado (isento) | N/A — `workSchedule` não se aplica a clientes externos |
| **Janela fecha durante a sessão** (decisão 4-C) | ⚠️ **Apenas avisa** (banner persistente "fora do horário de atendimento"); **não** desloga, **não** bloqueia ações | Sem efeito | N/A |
| **Fora da janela** (decisão 5-A) | 🟤 `availability` vira `offline` automaticamente + **removido do rodízio** | Sem efeito automático | N/A |

> **Racional do assimétrico:** barra-se a **entrada** (a superfície de acesso fora do turno), mas nunca se arranca alguém no meio de um atendimento — o que seria pior para o cliente final do que o benefício do controle. Owner/Gestor jamais são trancados (continuidade operacional e suporte).

**4. Exceção de emergência (override temporário).** Owner (e Gestor, no seu departamento) pode conceder a um usuário uma **liberação temporária** ("liberar acesso até HH:mm de hoje" ou "liberar agora por N horas"). Registrada e auditada. É a válvula de escape para o imprevisto.

**5. Enforcement confiável em duas fases.**
- **Fase 1 (mock auth):** o gate roda no fluxo de `signIn` + guard de sessão (client-side). Suficiente para validar UX e regra.
- **Fase 2 (real):** o gate de login deve ser **validado no servidor** (Edge Function de login / verificação no Auth — PRD-107), para não ser contornável por manipulação de client. O `workSchedule` e os overrides ficam na fonte persistida; a decisão de bloquear acontece server-side. *Drop-in* sobre a estrutura da Fase 1.

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Reusar `businessHours` da loja como horário de acesso | Confunde dois conceitos distintos; a loja tem um horário, cada pessoa tem o seu turno |
| Bloqueio duro também no meio da sessão (logout forçado) | Arranca o operador no meio de um atendimento — prejudica o cliente final (decisão 4-C escolheu "só avisa") |
| Bloquear Owner/Gestor também | Inviabiliza emergências, fechamento e suporte fora do horário (decisão 3-C isenta) |
| Sem exceção de emergência | Qualquer imprevisto trancaria a operação sem saída |
| Gate só no client (Fase 2) | Contornável; enforcement de acesso precisa ser server-side no real |
| Horário por papel (não por usuário) | Granularidade insuficiente — turnos variam por pessoa |

**Decisão consolidada:** **horário por usuário (com timezone e exceções), enforcement assimétrico (bloqueia login de operacionais, isenta Owner/Gestor, só avisa no meio da sessão), `offline`+saída-do-rodízio fora da janela, override de emergência auditado, e gate validado server-side na Fase 2.**

---

## Escopo

### Incluído

- ✅ `ISeller.workSchedule?: IWorkSchedule` — janelas por dia da semana (`weekday 0-6`, `openAt`/`closeAt` 'HH:mm', `enabled`), timezone `America/Sao_Paulo`
- ✅ `scheduleOverrides` — exceções por data (bloquear/liberar) por usuário
- ✅ Aba **"Horário"** na tela de usuário (PRD-211): editar agenda semanal + exceções
- ✅ Helper `isWithinWorkSchedule(user, date)` (puro, testável) considerando timezone e overrides
- ✅ Gate de login com regra assimétrica por papel (bloqueia operacional fora da janela; isenta Owner/Gestor; N/A para Cliente)
- ✅ Banner persistente de "fora do horário" quando a janela fecha durante a sessão (sem logout, sem bloqueio)
- ✅ Transição automática para `availability: 'offline'` e remoção do rodízio fora da janela (integra PRD-013 e PRD-213)
- ✅ Override de emergência (liberação temporária) concedido por Owner/Gestor, com expiração e auditoria
- ✅ Mensagem de bloqueio clara (horário do usuário + "a partir de HH:mm" + opção de solicitar liberação)
- ✅ Contrato de enforcement *drop-in*: client-side (Fase 1) → server-side via Auth/Edge Function (Fase 2)
- ✅ Auditoria de definição/alteração de horário, criação de override e tentativas de login bloqueadas por horário

### Excluído

- ❌ Alterar o `businessHours` da loja (PRD-013) — permanece intacto e independente
- ❌ Folha de ponto / registro de jornada trabalhista (marcação de entrada/saída para RH) — fora do escopo (isto é controle de acesso, não ponto eletrônico)
- ❌ Cálculo de horas extras / banco de horas — fora do escopo
- ❌ Horário por canal ou por divisão — fora do escopo (é por usuário)
- ❌ Bloqueio de IP / geofencing — fora do escopo
- ❌ Notificações proativas "seu turno começa em X" — futuro (pode integrar PRD-146 Notification Center depois)

---

## Requisitos Funcionais

### Modelo de horário

- **RF-001:** Definir `IWorkSchedule` como array de janelas `{ weekday: 0-6; openAt: 'HH:mm'; closeAt: 'HH:mm'; enabled: boolean }`, reaproveitando a forma do `IBusinessHours` do PRD-013. Permitir múltiplas janelas no mesmo dia (ex: manhã e tarde com intervalo de almoço).
- **RF-002:** Adicionar `workSchedule?: IWorkSchedule` em `ISeller` (DELTA sobre F1:002). Ausência de `workSchedule` ⇒ **sem restrição de horário** (acesso livre).
- **RF-003:** Definir `scheduleOverrides` por usuário: lista de `{ date: ISO8601 (dia); type: 'block' | 'allow'; reason?; openAt?; closeAt? }`. Override tem precedência sobre a regra semanal naquela data.
- **RF-004:** Todo cálculo de horário usa timezone `America/Sao_Paulo` (independente do fuso do dispositivo).

### Helper de verificação

- **RF-005:** Criar `isWithinWorkSchedule(user, date): boolean` — função **pura** que retorna se o usuário está dentro do horário de atendimento na data/hora informada, considerando regra semanal **e** overrides.
- **RF-006:** Criar `getNextOpenAt(user, date): ISO8601 | null` — retorna o próximo início de janela (para compor a mensagem "acesso liberado a partir de HH:mm").

### Enforcement no login

- **RF-007:** No fluxo de autenticação, após identificar o papel do usuário, aplicar:
  - Papel **operacional** (Vendedor, Vendedor Externo, SDR, Financeiro) **fora** da janela e **sem override de liberação ativo** ⇒ **bloquear login**.
  - Papel **Owner** ou **Gestor** ⇒ **nunca** bloquear por horário.
  - **Cliente** ⇒ `workSchedule` não se aplica (clientes do portal não têm restrição de horário).
- **RF-008:** A tela de bloqueio deve exibir mensagem clara: horário de atendimento do usuário, "Acesso liberado a partir de HH:mm" (via `getNextOpenAt`), e ação **"Solicitar liberação ao gestor"**.
- **RF-009:** Usuário com status `suspenso` (PRD-211) é bloqueado independentemente de horário — a regra de suspensão prevalece.

### Comportamento durante a sessão

- **RF-010:** Se a janela do usuário **fechar enquanto ele está logado**, exibir **banner persistente** "Você está fora do seu horário de atendimento" — **sem** deslogar e **sem** bloquear ações (decisão 4-C).
- **RF-011:** Ao **fechar** a janela (ou ao detectar que o usuário está fora dela), definir `availability: 'offline'` automaticamente e **removê-lo do rodízio** (integra PRD-213, decisão 5-A). Ao reabrir a janela, **não** forçar `online` — o usuário decide reativar sua disponibilidade.
- **RF-012:** A transição automática para `offline` por horário deve ser distinguível de um `offline` definido manualmente (para a UI explicar o motivo: "offline — fora do horário").

### Override de emergência

- **RF-013:** Owner (qualquer usuário) e Gestor (usuários do seu departamento) podem conceder **liberação temporária**: "liberar acesso até HH:mm de hoje" ou "liberar por N horas a partir de agora".
- **RF-014:** Enquanto o override de liberação está ativo, o login do usuário é permitido mesmo fora da janela; ao expirar, a regra normal volta.
- **RF-015:** Criar/expirar override é auditado (`IAuditLog`), registrando quem concedeu, para quem, e a janela de validade.

### Edição (aba Horário)

- **RF-016:** Na aba **"Horário"** da tela de usuário (PRD-211), Owner/Gestor editam a agenda semanal (janelas por dia) e as exceções pontuais.
- **RF-017:** Validar consistência ao salvar: `closeAt` > `openAt` na mesma janela; janelas do mesmo dia não podem se sobrepor; datas de override válidas.
- **RF-018:** Toda definição/alteração de `workSchedule` e de overrides é auditada.

### Enforcement em duas fases (drop-in)

- **RF-019:** Fase 1 — o gate roda no `signIn` + guard de sessão (client-side), lendo `workSchedule`/overrides do mock store.
- **RF-020:** Fase 2 — a decisão de bloqueio de login deve ser **validada no servidor** (Edge Function de login / verificação no Auth, PRD-107), de modo que o bloqueio não seja contornável por manipulação do client. A estrutura de dados e a assinatura do helper permanecem as mesmas (drop-in).

---

## Requisitos Não-Funcionais

- **RNF-001 (Confiabilidade):** Owner/Gestor **nunca** podem ser bloqueados por horário em nenhuma fase. Falha do gate deve falhar **aberto** para Owner/Gestor e ser tratada com cautela para operacionais (logar e, em dúvida sobre integridade do horário, permitir + alertar — nunca trancar indevidamente sem sinal claro).
- **RNF-002 (Timezone):** Todo o cálculo respeita `America/Sao_Paulo`, inclusive em dispositivos com fuso divergente.
- **RNF-003 (Performance):** `isWithinWorkSchedule` < 1ms; verificação periódica de "janela fechou" sem impacto perceptível na UI.
- **RNF-004 (Segurança Fase 2):** O bloqueio de login real não pode depender só do client; precisa de validação server-side.
- **RNF-005 (Clareza):** Mensagens de bloqueio e o banner de "fora do horário" são inequívocos e informam o próximo horário disponível.
- **RNF-006 (Acessibilidade):** Editor de agenda navegável por teclado; tema light/dark.

---

## Critérios de Aceitação

### RF-007: Bloqueio de login de operacional

```gherkin
DADO um Vendedor com horário seg-sex 08:00–18:00 (America/Sao_Paulo)
QUANDO ele tenta acessar às 21:30 de uma terça sem liberação ativa
ENTÃO o login é bloqueado
  E a tela informa "Acesso liberado a partir das 08:00" e oferece "Solicitar liberação ao gestor"
  E a tentativa é auditada
```

### RF-007: Isenção de Owner/Gestor

```gherkin
DADO um Gestor com qualquer horário definido
QUANDO ele acessa às 23:00 de um domingo
ENTÃO o login é permitido normalmente (isento de restrição de horário)
```

### RF-010 / RF-011: Janela fecha durante a sessão

```gherkin
DADO um SDR logado às 17:55 com janela até 18:00
QUANDO o relógio passa das 18:00
ENTÃO um banner persistente "fora do seu horário de atendimento" aparece
  E ele NÃO é deslogado e pode concluir o atendimento em andamento
  E sua disponibilidade vira "offline (fora do horário)" e ele sai do rodízio
```

### RF-013 / RF-014: Override de emergência

```gherkin
DADO um Vendedor fora da janela
QUANDO o Owner concede "liberar acesso até 22:00 de hoje"
ENTÃO o Vendedor consegue logar até as 22:00
  E após as 22:00 a regra normal volta a bloquear
  E a concessão e a expiração são auditadas
```

### Cenários de Erro

```gherkin
DADO que tento salvar uma janela com closeAt 08:00 e openAt 18:00
QUANDO submeto
ENTÃO recebo erro de validação (closeAt deve ser maior que openAt)

DADO que o usuário do dispositivo está em outro fuso horário
QUANDO o gate avalia o horário
ENTÃO usa America/Sao_Paulo, não o fuso local do dispositivo

DADO (Fase 2) que o client é manipulado para burlar o bloqueio
QUANDO o login é tentado fora da janela
ENTÃO a validação server-side rejeita o acesso
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|-------------------|
| 1 | Modelo (`workSchedule`, overrides) + helpers (`isWithinWorkSchedule`, `getNextOpenAt`) com timezone | 3-4 |
| 2 | Aba "Horário" na tela de usuário (edição de agenda + exceções + validações) | 3-4 |
| 3 | Gate de login assimétrico + tela de bloqueio + banner de sessão + transição offline/saída do rodízio | 4-6 |
| 4 | Override de emergência + (Fase 2) validação server-side do gate | 3-4 |

### Detalhamento das Fases

#### Fase 1: Modelo e Helpers
**Objetivo:** lógica de horário pura e testável.
**Ações:**
- [ ] Adicionar `workSchedule?` e `scheduleOverrides` ao usuário (DELTA F1:002)
- [ ] Implementar `isWithinWorkSchedule` e `getNextOpenAt` com `America/Sao_Paulo`
**Validação:** cenários de janela/override/timezone retornam os resultados esperados.

#### Fase 2: Edição
**Objetivo:** Owner/Gestor configuram o horário.
**Ações:**
- [ ] Aba "Horário" (agenda semanal + exceções) com validações de consistência + auditoria
**Validação:** salvar agenda inválida é rejeitado; agenda válida persiste e audita.

#### Fase 3: Enforcement
**Objetivo:** controlar acesso conforme a regra assimétrica.
**Ações:**
- [ ] Gate no signIn (bloqueia operacional, isenta Owner/Gestor) + tela de bloqueio
- [ ] Banner de "fora do horário" na sessão (sem logout)
- [ ] Transição automática para offline + saída do rodízio (integra 013/213)
**Validação:** todos os critérios de aceitação de login/sessão passam.

#### Fase 4: Override + Server-side
**Objetivo:** válvula de escape e enforcement real.
**Ações:**
- [ ] Override de emergência (conceder/expirar/auditar)
- [ ] (Fase 2) validação server-side do bloqueio de login (PRD-107)
**Validação:** override libera dentro da validade; manipulação de client não burla o bloqueio real.

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| 211 | Cadastro de usuário (aba Horário, status, `ISeller` aprofundado) | ⏳ (pré-requisito direto) |
| F1:013 | Disponibilidade (`availability`) + horário comercial da loja | ✅ |
| 107 | Auth Custom Claims (validação server-side do gate) | ⏳ (Fase 2) |
| 213 | Rodízio (remoção automática fora do horário) | ⏳ (integra; ver decisão 5-A) |

### Decisões Pendentes

- [ ] Lista definitiva de papéis considerados "operacionais" para o bloqueio (sugerido: Vendedor, Vendedor Externo, SDR, Financeiro)
- [ ] Permitir Gestor conceder override apenas para o próprio departamento? (sugerido: sim)

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Gestão de Pessoas & Acesso"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | PRD-211 | Papéis Editáveis + Aprofundamento de Usuário | ⏳ | Base (cadastro de usuário, aba Horário) |
| **2** | **PRD-212** | **Horário de Atendimento + Enforcement de Acesso** | **🔄 ATUAL** | Depende de 211 |
| 3 | PRD-213 | Rodízio / Fila de Atendimento | ⏳ | Integra (saída do rodízio fora do horário) |

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| `workSchedule` / overrides | Operacional/jornada | Edição Owner/Gestor; auditada |
| Tentativas de login bloqueadas | Segurança | Auditadas (ator, horário, motivo) |
| Override de emergência | Sensível (concede acesso) | Owner/Gestor; expira; auditado |

### Autenticação e Autorização

- Edição de horário e concessão de override: Owner (todos) / Gestor (seu departamento).
- O gate de horário **complementa** o RBAC (não substitui): mesmo dentro do horário, o usuário só faz o que o papel permite.
- **Inviolável:** Owner/Gestor nunca bloqueados por horário; gate real validado server-side na Fase 2.

### Auditoria

Definição/alteração de horário, criação/expiração de override e tentativas de login bloqueadas por horário geram `IAuditLog`.

---

## Fluxos de Usuário

### Fluxo Principal — Acesso dentro do turno

1. Vendedor com janela 08:00–18:00 acessa às 09:00 → login normal
2. Trabalha normalmente; às 18:00 recebe banner "fora do horário"; conclui o atendimento atual
3. Fica `offline (fora do horário)` e sai do rodízio

### Fluxo de Exceção — Tentativa fora do horário

1. Vendedor tenta às 21:30 → bloqueado
2. Vê o próximo horário e o botão "Solicitar liberação ao gestor"

### Fluxo de Emergência — Override

1. Gestor concede "liberar até 22:00" para o vendedor
2. Vendedor acessa; às 22:00 a regra volta; tudo auditado

---

### Convenções de Código (Referência Rápida)

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| **Componentes React** | PascalCase | `WorkScheduleEditor.tsx`, `OutsideHoursBanner.tsx` |
| **Hooks** | camelCase + `use` | `useWorkSchedule`, `useAccessGate` |
| **Funções puras** | camelCase | `isWithinWorkSchedule()`, `getNextOpenAt()` |
| **Interfaces** | PascalCase + `I` | `IWorkSchedule`, `IScheduleOverride` |
| **Tabelas** | snake_case (plural) | `user_schedules`, `schedule_overrides` |
| **Ícones** | Iconify | `<Icon icon="mdi:clock-outline" />` |
| **Tema** | Light + Dark | CSS variables |
| **Git commits** | Conventional Commits | `feat(access): per-user work schedule gate` |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Agente Desenvolvedor operando via Claude Code CLI. Este PRD foi criado pelo Agente Arquiteto na plataforma web.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/)
> - Atualizar o CHANGELOG.md seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Atualizar o registro de versão no banco (se aplicável)
> - Renomear este arquivo adicionando `_DONE` ao final
> - Atualizar a seção "Status de Implementação"

### Guia de Versionamento (SemVer)

| Tipo de Mudança | Ação | Exemplo |
|-----------------|------|---------|
| Correção de bug | PATCH +1 | 1.0.0 → 1.0.1 |
| Nova funcionalidade | MINOR +1 | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1 | 1.1.0 → 2.0.0 |

**Codinome sugerido (MINOR):** "Shift" (turno).

🔗 https://semver.org/

### Guia de Changelog
Added / Changed / Deprecated / Removed / Fixed / Security — 🔗 https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Nunca trancar Owner/Gestor** | A regra de horário é isenta para esses papéis em qualquer cenário |
| **Não expulsar no meio** | Janela fechando só avisa; jamais desloga ou bloqueia ação em andamento |
| **Timezone fixo** | America/Sao_Paulo, independente do dispositivo |
| **Server-side no real** | Na Fase 2, o bloqueio de login é validado no servidor |
| **Falhar com cautela** | Em dúvida sobre integridade do horário, não trancar indevidamente; logar e alertar |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Dois horários distintos** | `workSchedule` (usuário/acesso) ≠ `businessHours` (loja/distribuição). Não confundir nem mesclar |
| **Offline por horário** | Marcar de forma distinguível do offline manual (UI explica o motivo) |
| **Integração rodízio** | Coordenar com PRD-213: fora do horário ⇒ fora do rodízio (5-A) |
| **Sem ponto eletrônico** | Isto é controle de acesso, não folha de ponto/RH |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Bloquear Owner/Gestor por horário |
| Deslogar ou bloquear ações quando a janela fecha no meio da sessão |
| Usar o fuso do dispositivo no cálculo |
| Confiar só no client para bloquear login na Fase 2 |
| Alterar o `businessHours` da loja (PRD-013) |
| Forçar `online` automaticamente quando a janela reabre |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO |
| **Data de Implementação** | 2026-06-16 |
| **Versão do App** | v0.99.0 `Shift` |
| **Implementado por** | Claude (Agente Desenvolvedor) |
| **Observações** | Feature `src/features/access/`. Gate de acesso **client-side** (na rota de login) entregue; **enforcement server-side (RF-020) DEFERIDO por decisão do dono** — login é 100% client-side via `supabase.auth`, gate server-side exigiria Auth Hook em prod com risco de trancar acesso. Timezone São Paulo por offset fixo −03:00. Migration das 3 colunas jsonb aplicada em prod. Editor na aba "Horário" do cadastro de usuário (save unificado no form). Doc: `docs/dev/work-schedule-access.md`. |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 14/06/2026 | v1 | Criação inicial — horário de atendimento por usuário, enforcement assimétrico (bloqueia login operacional, isenta Owner/Gestor, só avisa na sessão), offline+saída do rodízio fora da janela, override de emergência, gate server-side na Fase 2 |

---

**AILA - Sistemas Inteligentes**
