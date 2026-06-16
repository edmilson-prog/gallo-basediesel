# PRD-211: Papéis Editáveis + Aprofundamento de Usuário

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | (mesmo da Fase 1/2) |
| **Objetivo** | Transformar o RBAC hardcoded e read-only (PRD-006) em um sistema de papéis **persistido e editável** (papéis de sistema protegidos + papéis customizados), formalizar o registro de recursos como dado, reviver `ITeam` como **Departamento** e aprofundar o cadastro de usuário com os campos que sustentam o lote de Gestão de Pessoas & Acesso |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta (P1) |
| **Épico** | Gestão de Pessoas & Acesso (polish go-live) |
| **PRDs Relacionados** | F1:002 (modelo), F1:006 (RBAC), F1:007 (multistore), F1:019 (configurações), 103 (RLS), 107 (Auth Custom Claims), 212 (horário), 213 (rodízio) |
| **Padrão de código** | camelCase para novos campos; snake_case (plural) para tabelas |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios |
|--------------|-----------|
| **Baixa** | 1 arquivo, sem dependências externas, < 100 linhas |
| **Média** | 2-5 arquivos, banco OU integração, funcionalidade isolada |
| **Alta** | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** converte a matriz de permissões de constante hardcoded para fonte editável (com propagação para enforcement via claims/RLS), introduz CRUD de papéis customizados com proteção de papéis de sistema, formaliza o registro de recursos como dado, revive a entidade `ITeam` como Departamento com CRUD, e adiciona uma tela completa de gestão de usuários — tudo mantendo compatibilidade *drop-in* entre Fase 1 (mock) e Fase 2 (Supabase + RLS).

---

## Contexto do Problema

A matriz RBAC entregue no PRD-006 (Fase 1) é uma constante TypeScript (`PERMISSIONS_MATRIX` em `matrix.ts`), e a tela `/app/configuracoes/papeis` é **somente leitura** — exatamente o que a UI atual expõe ("Somente leitura · edição na Fase 2"). Isso foi a decisão correta para o MVP, mas dois sintomas mostram que chegou a hora da solução definitiva:

1. **A lista de recursos cresceu além dos 18 originais.** A matriz hoje cobre recursos que não existiam no PRD-006 (DRE Gerencial, Despesas, Fluxo de Caixa, Rentabilidade, Estoque, Análise de Atendimento, Insights, Admin E-commerce, Integração E-commerce, Papéis, Auditoria…). Cada novo recurso obriga a editar código. Não escala.

2. **O Owner não consegue ajustar permissões sem um deploy.** Qualquer regra fina ("o Financeiro também pode ver Rentabilidade", "criar um papel 'Conferente' que só vê Estoque") exige intervenção de desenvolvedor. O negócio precisa de autonomia.

Além disso, o restante do lote (horário por usuário no PRD-212, rodízio no PRD-213, modo espião) depende de um **cadastro de usuário mais rico** e de um **conceito de departamento** — ambos hoje inexistentes ou dormentes. O `ITeam` foi modelado no PRD-002 mas nunca ativado; o scope `team` do RBAC existe mas se comporta como `own`. Este PRD é a fundação que destrava todos os demais.

> **Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação.**

---

## Conceito da Solução

### Situação Atual (As-Is)

- `IRole` e `PERMISSIONS_MATRIX` são constantes hardcoded; 7 papéis fixos; matriz imutável em runtime.
- Tela de papéis é read-only.
- `ITeam` existe no tipo (`{ id, name, storeId, managerId, sellerIds[] }`) mas **dormente** — sem CRUD, sem UI, sem uso real. Scope `team` ≈ `own`.
- Usuário (`ISeller`) tem cadastro básico (identidade, papel, `availability`, `specialties`, `divisions`); não há tela de gestão completa nem vínculo a departamento.
- Recursos do RBAC são um union literal em código (`resources.ts`).

### Situação Desejada (To-Be)

**1. Papéis persistidos e editáveis (decisão 1-C — híbrido).**

| Tipo de papel | Protegido | Permissões editáveis | Renomear | Excluir |
|---------------|-----------|----------------------|----------|---------|
| **Sistema** (os 7 atuais: Owner, Gestor, Vendedor, Vendedor Externo, SDR, Financeiro, Cliente) | ✅ | ✅ (com aviso + "restaurar padrão") | ❌ | ❌ |
| **Customizado** (criados pelo Owner) | ❌ | ✅ | ✅ | ✅ |

> **Decisão de design (a confirmar se divergir):** "papel de sistema travado" aqui significa **protegido contra exclusão e renomeação** (a identidade do papel é referenciada por código e por RLS — não pode sumir), mas suas **permissões permanecem editáveis** pelo Owner, com aviso explícito e ação de "restaurar padrão de fábrica". Isso entrega o objetivo central — autonomia sobre permissões — sem permitir que o Owner quebre a integridade estrutural do sistema. O `Owner` é exceção: seu conjunto `*:*:all` é imutável (evita auto-lockout).

**2. Registro de recursos como dado.** Os recursos do RBAC viram um catálogo persistido (`crm.rbac_resources`), com rótulo amigável e agrupamento por área. Adicionar um recurso novo deixa de exigir edição de código — vira um INSERT (ou seed versionado).

**3. Departamento (decisão 2-A — reviver `ITeam`).** A entidade `ITeam` é ativada e reposicionada como **Departamento**: CRUD completo (nome, gestor responsável, membros, loja). O usuário ganha `departmentId`. O scope `team` do RBAC passa a ter significado real (registros do próprio departamento). O Departamento é a unidade que o rodízio (PRD-213) usa quando `targetMode: 'department'`.

**4. Gestão de usuários aprofundada.** Tela dedicada (Owner/Gestor) para CRUD de usuários com todos os campos: identidade, papel, departamento, status (ativo/suspenso), especialidades, disponibilidade padrão. As abas de **Horário** (PRD-212) e **Rodízio** (PRD-213) são plugadas progressivamente nessa mesma tela.

**5. Propagação para enforcement.** Editar uma permissão não pode criar brecha de segurança. O conjunto efetivo de permissões de cada papel flui para o enforcement real:
- **Fase 1 (mock):** a matriz persistida (mock store) alimenta o `hasPermission()`/`usePermission()` existentes — *drop-in* sobre o PRD-006.
- **Fase 2 (Supabase):** a mesma matriz alimenta as **custom claims** do JWT (PRD-107) e/ou uma função `security definer` consultada pelas policies RLS (PRD-103). Mudança de permissão → refresh de claims do usuário afetado.

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Manter matriz hardcoded, só expandir a lista | Não resolve a dor: cada ajuste continua exigindo deploy |
| Papéis 100% customizados (sem papéis de sistema) | Owner poderia excluir um papel referenciado por código/RLS e quebrar o sistema; perde-se o baseline seguro |
| Papéis de sistema totalmente travados (nem permissões editáveis) | Contraria o objetivo central de dar autonomia sobre permissões ao Owner |
| Criar entidade `IDepartment` nova | `ITeam` já existe modelada e o scope `team` já está cabeado; criar entidade paralela duplicaria conceito (decisão 2-A) |
| Permissões só no frontend (sem propagar p/ RLS) | Brecha de segurança grave: UI esconderia, mas a API real concederia |
| Editar permissões direto no JWT sem fonte persistida | Claims são derivados; a fonte da verdade tem que ser o banco para auditoria e consistência |

**Decisão consolidada:** **papéis persistidos com modelo híbrido (sistema protegidos + customizados editáveis), registro de recursos como dado, `ITeam` revivido como Departamento com CRUD, tela completa de gestão de usuários, e propagação garantida da matriz para o enforcement real (hasPermission no mock → claims/RLS no Supabase).**

---

## Escopo

### Incluído

- ✅ Modelo persistido de papéis: `crm.roles` + `crm.role_permissions` (e mock equivalente na Fase 1)
- ✅ Distinção `isSystem` (protegido) × customizado; flag `isOwnerImmutable` para o Owner
- ✅ CRUD de papéis customizados (criar, duplicar, renomear, excluir) — Owner-only
- ✅ Edição da matriz de permissões (recurso × ação × scope) de qualquer papel editável, com aviso ao editar papel de sistema e ação "restaurar padrão"
- ✅ Registro de recursos `crm.rbac_resources` (rótulo, área/grupo, ordem) — catálogo seedado a partir dos recursos atuais
- ✅ Tela `/app/configuracoes/papeis` evolui de read-only para **editor** (Owner-only para edição; visualização para quem tem `role:view`)
- ✅ Ativação de `ITeam` como **Departamento**: CRUD, vínculo de membros, gestor responsável (Owner/Gestor)
- ✅ Campo `departmentId?` em `ISeller` + ativação semântica do scope `team`
- ✅ Tela `/app/configuracoes/usuarios` — CRUD completo de usuários com todos os campos de cadastro
- ✅ Dois novos recursos no catálogo RBAC: `manage_roles` (gerir papéis) e `monitor` (base para o modo espião — comportamento entra no DELTA do espião)
- ✅ Auditoria de toda mutação de papel, permissão, departamento e usuário (via `auditLog` do PRD-006)
- ✅ Contrato de propagação para enforcement documentado (mock → claims/RLS), garantindo paridade *drop-in*

### Excluído

- ❌ Permissões por registro individual (ACL por linha) — fora do modelo (role + scope continua sendo o paradigma)
- ❌ Comportamento do **modo espião** (supressão de não-lida/presença) — vai no DELTA Espião (próximo PRD do lote); aqui só nasce o recurso `monitor`
- ❌ **Horário de atendimento** por usuário — PRD-212 (este PRD apenas reserva o espaço da aba "Horário" na tela de usuário)
- ❌ **Rodízio/fila** — PRD-213 (idem, aba "Rodízio")
- ❌ Hierarquia de papéis (herança entre papéis) — fora do escopo; scope hierárquico (`own<team<store<all`) permanece o mecanismo
- ❌ Permissões por equipe com split avançado / metas por equipe — Onda 12 (PRDs 184–189), que este PRD parcialmente antecipa apenas no que tange a ativação do Departamento
- ❌ Delegação temporária de papel (assumir papel de outro) — futuro

> **Nota de relação com a Onda 12:** este PRD **antecipa** a ativação de `ITeam` (originalmente prevista no PRD-184 "Equipes Ativas") e a edição de permissões (afim ao PRD-189 "Permissões por Equipe"), porque o rodízio e o controle de acesso precisam disso já no polish do go-live. Ao implementar, o INDEX e os PRDs 184/189 devem ser reconciliados (provável absorção/redução de escopo deles).

---

## Requisitos Funcionais

### Modelo de papéis e recursos

- **RF-001:** Definir persistência de papéis: tabela `crm.roles` com `id`, `name`, `slug` (estável, referenciável por código), `description`, `is_system` (bool), `is_owner_immutable` (bool), `store_id?` (papéis customizados podem ser por loja ou globais — global no MVP), `created_at`. Mock equivalente na Fase 1.
- **RF-002:** Definir `crm.role_permissions` relacionando papel → (`resource`, `action`, `scope`), de forma que reproduza 1:1 a granularidade da matriz atual (recurso × ação × scope).
- **RF-003:** Seedar os 7 papéis atuais como `is_system = true`, preservando exatamente as permissões hoje vigentes na `PERMISSIONS_MATRIX` (migração sem mudança de comportamento). O papel `Owner` recebe `is_owner_immutable = true`.
- **RF-004:** Definir `crm.rbac_resources` com `key` (ex: `customer`), `label` (ex: "Clientes"), `group` (área, ex: "Comercial"), `order`. Seedar com todos os recursos atualmente na matriz.
- **RF-005:** O conjunto de **ações** (`view`, `create`, `edit`, `delete`, `approve`) e a hierarquia de **scopes** (`own < team < store < all`) permanecem como no PRD-006 (sem mudança).

### CRUD e edição de papéis

- **RF-006:** Owner pode **criar** papel customizado (nome, descrição, e matriz de permissões inicial — em branco ou duplicada de um papel existente).
- **RF-007:** Owner pode **duplicar** qualquer papel (inclusive de sistema) gerando um customizado editável com as mesmas permissões.
- **RF-008:** Owner pode **editar a matriz de permissões** de qualquer papel editável marcando/desmarcando célula (recurso × ação) e definindo o scope por recurso.
- **RF-009:** Ao editar um papel **de sistema**, exibir aviso claro ("Você está alterando um papel de sistema; isso afeta todos os usuários com este papel") e oferecer ação **"Restaurar padrão de fábrica"** que devolve as permissões seedadas originais.
- **RF-010:** Owner pode **renomear** e **excluir** papéis customizados. Papéis de sistema **não** podem ser renomeados nem excluídos (UI desabilita + backend rejeita).
- **RF-011:** Excluir um papel customizado só é permitido se **nenhum usuário** estiver com ele atribuído; caso contrário, bloquear com mensagem indicando quantos usuários precisam ser remanejados.
- **RF-012:** O conjunto de permissões do `Owner` é imutável (UI read-only + backend rejeita qualquer alteração), prevenindo auto-lockout.

### Departamento (ativação do `ITeam`)

- **RF-013:** Ativar `ITeam` como **Departamento**: CRUD com `name`, `managerId` (gestor responsável), `storeId`, `sellerIds[]` (membros), `createdAt`. Rótulo na UI: "Departamento".
- **RF-014:** Adicionar `departmentId?: ID` em `ISeller`; um usuário pertence a no máximo um departamento (MVP).
- **RF-015:** O scope `team` do RBAC passa a resolver para "registros vinculados a membros do mesmo `departmentId`" do usuário (deixa de ser equivalente a `own`).
- **RF-016:** Owner gerencia todos os departamentos; Gestor gerencia o(s) departamento(s) onde é `managerId`.

### Gestão de usuários

- **RF-017:** Criar tela `/app/configuracoes/usuarios` com lista paginada de usuários (avatar, nome, papel, departamento, status, disponibilidade) e busca/filtro por papel, departamento e status.
- **RF-018:** Formulário de criação/edição de usuário com campos: identidade (nome, e-mail, telefone, avatar), papel (select dos papéis disponíveis), departamento (select), status (`ativo` | `suspenso`), especialidades (`specialties[]`), disponibilidade padrão.
- **RF-019:** Status `suspenso` impede login do usuário (independente de horário) e o remove de qualquer rodízio; reativar restaura o estado anterior.
- **RF-020:** A tela de usuário deve reservar (placeholder) as abas **"Horário"** (preenchida pelo PRD-212) e **"Rodízio"** (preenchida pelo PRD-213), para evolução progressiva sem retrabalho de layout.

### Propagação para enforcement

- **RF-021:** Na Fase 1, `hasPermission()`/`usePermission()` (PRD-006) passam a ler a matriz **da fonte persistida (mock store)** em vez da constante hardcoded, preservando a assinatura e o comportamento síncrono.
- **RF-022:** Na Fase 2, qualquer alteração de permissão de um papel deve propagar para o enforcement real: atualização das **custom claims** (PRD-107) dos usuários afetados e/ou consulta dinâmica via função `security definer` usada pelas policies RLS (PRD-103). Não pode existir janela em que a UI conceda o que a API nega (ou vice-versa).
- **RF-023:** Toda mutação (criar/editar/excluir papel, alterar célula de permissão, criar/editar departamento, criar/editar/suspender usuário) registra `IAuditLog` com `before`/`after`.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** `hasPermission()` deve permanecer síncrono e < 1ms após o carregamento inicial da matriz (cache em memória da matriz persistida; revalidação sob mudança).
- **RNF-002 (Reatividade):** Alterar a permissão de um papel deve refletir na UI dos usuários afetados sem exigir novo login na Fase 1; na Fase 2, no máximo após refresh de claims (documentar o gatilho).
- **RNF-003 (Tipagem):** `resource`, `action` e `scope` permanecem tipados; o catálogo de recursos persistido deve validar contra o tipo conhecido no build (sincronização tipo↔seed documentada).
- **RNF-004 (Integridade):** Impossível excluir/renomear papel de sistema; impossível alterar permissões do Owner; impossível excluir papel customizado em uso.
- **RNF-005 (Compatibilidade Fase 2):** O modelo `roles`/`role_permissions`/`rbac_resources` deve mapear diretamente para as policies RLS do PRD-103 e para as claims do PRD-107.
- **RNF-006 (Acessibilidade):** Editor de matriz navegável por teclado; células com `aria-label` descritivo (recurso + ação + estado); tema light/dark.

---

## Critérios de Aceitação

### RF-006 / RF-008: Criar e configurar papel customizado

```gherkin
DADO que sou Owner em /app/configuracoes/papeis
QUANDO crio um papel "Conferente" e marco apenas view:store em "Estoque"
ENTÃO o papel é salvo como customizado e editável
  E um usuário com papel "Conferente" vê apenas Estoque (leitura)
  E um audit log registra a criação com o snapshot das permissões
```

### RF-009: Editar papel de sistema com proteção

```gherkin
DADO que sou Owner editando o papel de sistema "Financeiro"
QUANDO marco view:store em "Rentabilidade"
ENTÃO o sistema exibe aviso de que estou alterando papel de sistema antes de salvar
  E após confirmar, a permissão é aplicada e auditada
  E a ação "Restaurar padrão de fábrica" volta o Financeiro às permissões seedadas originais
```

### RF-012: Owner imutável

```gherkin
DADO que sou Owner editando o papel "Owner"
QUANDO tento desmarcar qualquer permissão
ENTÃO a UI impede a alteração (campos read-only)
  E uma tentativa via API é rejeitada com erro explícito
```

### RF-011: Exclusão bloqueada por uso

```gherkin
DADO um papel customizado "Conferente" atribuído a 2 usuários
QUANDO tento excluí-lo
ENTÃO a exclusão é bloqueada
  E a mensagem informa que 2 usuários precisam ser remanejados antes
```

### RF-013 / RF-015: Departamento e scope team

```gherkin
DADO que criei o departamento "Vendas Pesados" com 3 vendedores
E que um papel concede edit:team em "Clientes"
QUANDO um desses vendedores acessa a lista de clientes
ENTÃO ele vê os clientes vinculados aos membros do seu departamento (scope team)
  E não apenas a própria carteira (own)
```

### Cenários de Erro

```gherkin
DADO que a propagação de claims (Fase 2) falha após alterar uma permissão
QUANDO o usuário afetado executa uma ação sensível
ENTÃO o enforcement real (RLS) prevalece sobre a UI
  E o sistema registra a inconsistência para reprocessamento (nunca concede além do persistido)

DADO que tento criar um papel com nome já existente
QUANDO submeto o formulário
ENTÃO recebo erro de nome duplicado e o papel não é criado
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|-------------------|
| 1 | Modelo persistido (roles, role_permissions, rbac_resources) + seed dos 7 papéis e recursos atuais | 5-7 |
| 2 | `hasPermission` lê da fonte persistida (drop-in sobre PRD-006) + cache/revalidação | 3-4 |
| 3 | Editor de papéis (CRUD + matriz editável + proteções + restaurar padrão) | 6-8 |
| 4 | Departamento (ativar ITeam + CRUD + scope team) + `departmentId` no usuário | 4-6 |
| 5 | Tela de gestão de usuários (CRUD + status) + abas placeholder Horário/Rodízio + propagação claims/RLS (Fase 2) | 6-8 |

### Detalhamento das Fases

#### Fase 1: Modelo e Seed
**Objetivo:** fonte da verdade persistida, sem mudança de comportamento.
**Ações:**
- [ ] Modelar `roles`, `role_permissions`, `rbac_resources` (mock na Fase 1; migrations na Fase 2)
- [ ] Seedar os 7 papéis de sistema reproduzindo exatamente a matriz atual
- [ ] Seedar o catálogo de recursos com todos os recursos hoje na matriz
**Validação:** o conjunto de permissões lido da fonte persistida é idêntico ao da constante atual (diff vazio).

#### Fase 2: Drop-in no hasPermission
**Objetivo:** consumir a matriz persistida preservando a API do PRD-006.
**Ações:**
- [ ] Adaptar `hasPermission`/`usePermission` para ler da fonte persistida com cache em memória
- [ ] Garantir reatividade ao alterar permissões (invalidação de cache)
**Validação:** cenários de permissão do PRD-006 continuam passando; alterar a fonte reflete no `<Can>`.

#### Fase 3: Editor de Papéis
**Objetivo:** autonomia do Owner sobre papéis.
**Ações:**
- [ ] Tela editor (lista de papéis + matriz recurso×ação×scope)
- [ ] CRUD de customizados; proteções de sistema; Owner imutável; restaurar padrão
- [ ] Auditoria de todas as mutações
**Validação:** todos os critérios de aceitação de papéis passam.

#### Fase 4: Departamento
**Objetivo:** ativar `ITeam` e dar significado ao scope `team`.
**Ações:**
- [ ] CRUD de Departamento; `departmentId` no usuário; resolução do scope `team`
**Validação:** scope team filtra por membros do departamento conforme RF-015.

#### Fase 5: Usuários + Propagação
**Objetivo:** gestão completa de usuários e enforcement consistente.
**Ações:**
- [ ] Tela de usuários (CRUD, status, filtros) + abas placeholder Horário/Rodízio
- [ ] (Fase 2) Propagação de permissões para claims (PRD-107) / RLS (PRD-103)
**Validação:** editar permissão de um papel reflete no enforcement real sem brecha.

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| F1:002 | Modelo conceitual (`IRole`, `IPermission`, `ITeam`, `ISeller`) | ✅ |
| F1:006 | RBAC (matriz, helpers, `<Can>`, auditoria) | ✅ |
| F1:007 | Multistore (scope por loja) | ✅ |
| 103 | RLS | ⏳ (Fase 2 — enforcement real) |
| 107 | Auth Custom Claims | ⏳ (Fase 2 — propagação de permissões) |

### Decisões Pendentes

- [ ] Confirmar a interpretação de "papel de sistema travado" (protegido contra exclusão/renomeação **com** permissões editáveis vs. lock total) — RF-009
- [ ] Papéis customizados são globais ou por loja? (MVP sugerido: globais)

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Gestão de Pessoas & Acesso"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| **1** | **PRD-211** | **Papéis Editáveis + Aprofundamento de Usuário** | **🔄 ATUAL** | Fundação do lote |
| 2 | PRD-212 | Horário de Atendimento + Enforcement de Acesso | ⏳ | Depende de 211 (campo no usuário, aba Horário) |
| 3 | PRD-213 | Rodízio / Fila de Atendimento | ⏳ | Depende de 211 (departamento, usuários, aba Rodízio) |
| 4 | DELTA Espião | Modo Espião (sobre PRD-006/010) | ⏳ | Depende de 211 (recurso `monitor`) |

> **Nota:** implemente na ordem. PRD-211 deve estar ✅ antes de 212/213.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| Matriz de permissões | Sensível (controla acesso) | Mutação Owner-only; auditada; Owner imutável |
| Cadastro de usuário (e-mail, telefone) | PII | Acesso restrito a Owner/Gestor; auditado |
| Vínculo usuário↔departamento | Operacional | Auditado |

### Autenticação e Autorização

- Edição de papéis/permissões: **Owner-only** (`manage_roles`). Visualização: quem tem `role:view`.
- Gestão de usuários e departamentos: Owner (tudo) / Gestor (seu departamento).
- **Princípio inviolável:** o enforcement real (RLS/claims na Fase 2) é a fonte de verdade de acesso; a UI nunca pode conceder além do persistido.

### Auditoria

Toda mutação de papel, célula de permissão, departamento, vínculo e usuário gera `IAuditLog` com `before`/`after`. Alterações em papéis de sistema recebem destaque no log (campo/flag de "papel de sistema alterado").

---

## Fluxos de Usuário

### Fluxo Principal — Owner cria papel e atribui

1. Owner acessa `/app/configuracoes/papeis`
2. Clica "Novo papel", nomeia "Conferente", duplica de "Vendedor" e ajusta a matriz
3. Salva → audit log gravado
4. Vai a `/app/configuracoes/usuarios`, cria/edita um usuário e atribui o papel "Conferente"
5. Usuário passa a operar com exatamente as permissões definidas

### Fluxo de Exceção — Editar papel de sistema

1. Owner edita "Financeiro" e adiciona view em "Rentabilidade"
2. Sistema avisa que é papel de sistema; Owner confirma
3. Permissão aplicada; opção "Restaurar padrão" disponível para reverter

### Fluxo de Erro — Excluir papel em uso

1. Owner tenta excluir "Conferente" (2 usuários)
2. Sistema bloqueia e lista que há 2 usuários a remanejar

---

### Convenções de Código (Referência Rápida)

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| **Componentes React** | PascalCase | `RoleEditor.tsx`, `UserForm.tsx` |
| **Hooks** | camelCase + `use` | `useRoles`, `useDepartments` |
| **Interfaces** | PascalCase + `I` | `IRole`, `IDepartment` (alias de `ITeam`) |
| **Tabelas (banco)** | snake_case (plural) | `roles`, `role_permissions`, `rbac_resources` |
| **Colunas** | snake_case | `is_system`, `department_id` |
| **Pastas** | kebab-case | `src/features/rbac/`, `people/` |
| **Ícones** | Iconify | `<Icon icon="mdi:shield-account" />` |
| **Tema** | Light + Dark obrigatório | CSS variables |
| **Git commits** | Conventional Commits | `feat(rbac): persisted editable roles` |

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

**Codinome sugerido (MINOR):** "Keyring" (chaveiro — controle de acesso editável).

🔗 https://semver.org/

### Guia de Changelog
Added / Changed / Deprecated / Removed / Fixed / Security — 🔗 https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Drop-in sem regressão** | A migração da matriz para fonte persistida não pode alterar o comportamento atual (diff vazio no seed) |
| **Enforcement é a verdade** | Nunca permitir que a UI conceda além do que RLS/claims aplicam |
| **Proteger a integridade** | Papéis de sistema e Owner blindados contra quebra estrutural |
| **Auditar tudo** | Toda mutação de acesso é auditável |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Seed fiel** | O seed dos 7 papéis deve reproduzir byte-a-byte a matriz vigente do PRD-006 |
| **Slug estável** | Papéis de sistema têm `slug` imutável referenciável por código e RLS |
| **`ITeam` = Departamento** | Reusar a interface `ITeam` (alias/rótulo "Departamento") em vez de criar tipo novo |
| **Abas progressivas** | Reservar abas Horário/Rodízio na tela de usuário para 212/213 |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Permitir exclusão/renomeação de papel de sistema |
| Permitir qualquer alteração nas permissões do Owner |
| Alterar comportamento de permissões durante a migração para fonte persistida |
| Conceder na UI algo que a RLS/claims negam (ou o inverso) |
| Excluir papel customizado em uso sem bloquear |
| Criar entidade de departamento nova (usar `ITeam`) |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data de Implementação** | - |
| **Versão do App** | - |
| **Implementado por** | - |
| **Observações** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 14/06/2026 | v1 | Criação inicial — papéis persistidos/editáveis (híbrido), registro de recursos como dado, ativação de `ITeam` como Departamento, tela de gestão de usuários, propagação para enforcement |

---

**AILA - Sistemas Inteligentes**
