# PRD-213: Rodízio / Fila de Atendimento

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | (mesmo da Fase 1/2) |
| **Objetivo** | Entregar uma **fila de atendimento (rodízio)** como mecanismo próprio e configurável: uma fila por loja, com participantes ordenáveis por drag-and-drop, liga/desliga de participação por usuário, e pulo automático de quem está offline. A fila direciona o atendimento ou a um **departamento** (e dele aos usuários vinculados) ou ao **usuário diretamente**, conforme `targetMode` por loja |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta (P1) |
| **Épico** | Gestão de Pessoas & Acesso (polish go-live) |
| **PRDs Relacionados** | 211 (departamento, usuários), 212 (offline fora do horário), F1:013 (distribuição/roteamento — referência), F1:010 (inbox), F1:023 (escalonamento SDR), 105 (Realtime), `faturamentoMode` (padrão de config por loja) |
| **Padrão de código** | camelCase para novos campos; snake_case (plural) para tabelas |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios |
|--------------|-----------|
| **Baixa** | 1 arquivo, sem dependências externas, < 100 linhas |
| **Média** | 2-5 arquivos, banco OU integração, funcionalidade isolada |
| **Alta** | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** introduz uma fila de atendimento de primeira classe com dois modos de direcionamento (departamento de dois níveis × usuário direto), ordenação por drag-and-drop, participação ligável por usuário, pulo de offline com avanço de ponteiro e justiça temporal, integração com presença (Realtime), com horário (PRD-212) e com o motor de distribuição existente (PRD-013) por um contrato de fronteira explícito que previne atribuição dupla.

---

## Contexto do Problema

O PRD-013 já entregou um motor de distribuição em cascata (carteira → especialidade → round-robin → carga → fallback) e o critério **round-robin** revezando entre vendedores `online`, com ordem implícita e `lastAssignedSellerId`. Funciona, mas não dá à GALLO o controle operacional que ela precisa para o atendimento do dia a dia:

- Não há **liga/desliga de participação por usuário** — o round-robin usa todos os online, sem opção de "hoje fulano não entra no rodízio".
- O **drag-and-drop** existente no PRD-013 reordena os **critérios**, não os **vendedores** na fila.
- Não há um conceito explícito de **fila** que a operação possa visualizar e gerir ("quem é o próximo?", "quem está pulado e por quê?").
- Não há **direcionamento por departamento** — algo que passou a fazer sentido agora que o Departamento foi ativado (PRD-211).

Este PRD entrega a **fila de atendimento (rodízio)** como um mecanismo próprio e visível, mantendo o motor do PRD-013 intacto e referenciando-o onde for relevante.

> **Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação.**

---

## Conceito da Solução

### Modelo mental: a fila vem primeiro

A **fila de atendimento é o conceito de topo** (uma por loja). Conversas novas de rotina chegam à fila, e a fila decide o destino. O destino depende do `targetMode` da loja:

```
                          ┌─────────────────────────────────────┐
   conversa nova ───────▶ │       FILA DE ATENDIMENTO (loja)     │
   (inbound de rotina)    │            targetMode?               │
                          └───────────────┬─────────────────────┘
                                          │
                  ┌───────────────────────┴────────────────────────┐
                  ▼ targetMode='department'                          ▼ targetMode='direct'
        ┌───────────────────────┐                          ┌──────────────────────┐
        │ rodízio de DEPARTAMENTOS│                         │ rodízio de USUÁRIOS  │
        │ (ordem + enabled)       │                         │ (ordem + enabled)    │
        └───────────┬─────────────┘                         └──────────┬───────────┘
                    ▼                                                   ▼
        rodízio interno de MEMBROS                              usuário selecionado
        do departamento escolhido
                    ▼
            usuário selecionado
```

### Contrato de fronteira com o PRD-013 (decisão 6-B — mecanismo próprio)

A fila/rodízio é **mecanismo próprio** e **não reescreve** o motor do PRD-013. Para evitar **atribuição dupla**, vale o contrato:

| Etapa | Responsável | Observação |
|-------|-------------|------------|
| **Carteira** (cliente já tem vendedor) | PRD-013 (a montante) | Continua tendo precedência — cliente conhecido vai ao seu vendedor |
| **Especialidade** (match por marca/modelo) | PRD-013 (a montante) | Continua tendo precedência quando casa |
| **Revezamento de rotina** | **PRD-213 (esta fila)** | Quando a fila está ativa para o escopo, **ela é a fonte de seleção** do revezamento — substitui o "round-robin/carga" para o inbound que governa |
| **Fallback** (SDR / fila de espera) | PRD-013 (a jusante) | Mantido como rede de segurança |

> **Princípio anti-duplicação:** uma conversa é atribuída **exatamente uma vez**. A fila é **consultada** como a fonte do revezamento (ponto de integração único, referenciando o PRD-013), não como um segundo motor concorrente. Carteira e especialidade permanecem como pré-filtros porque, por design, sobrepõem-se à justiça do rodízio (cliente conhecido e especialista têm prioridade).

### `targetMode` por loja (decisão 12-C)

Config de runtime por `IStore`, no mesmo padrão do `faturamentoMode`:

| Modo | Comportamento |
|------|---------------|
| `direct` | A fila é uma lista ordenada de **usuários**; seleciona o próximo usuário elegível |
| `department` | A fila é uma lista ordenada de **departamentos**; seleciona o próximo departamento elegível, e dentro dele roda o **rodízio interno de membros** |

### Regras do rodízio

- **Ordem por drag-and-drop:** a ordem dos participantes (usuários ou departamentos) é definida arrastando; persistida como `order`.
- **Liga/desliga por participante:** cada participante tem `enabled`; desligado não recebe (fica visível mas fora da vez).
- **Pulo de offline (decisão 8-A):** quando chega a vez de um participante **offline** (ou desabilitado, ou fora do horário via PRD-212), o sistema **pula e passa ao próximo elegível**, avançando o ponteiro. O participante pulado não "segura a vez".
- **Justiça temporal:** um ponteiro (`lastAssignedRefId`) mantém o revezamento justo ao longo do tempo (próximo na sequência, não sempre o primeiro).
- **Modo departamento:** o rodízio de departamentos e o rodízio interno de membros são independentes (cada um com sua ordem e seu ponteiro).

### Elegibilidade de um participante

Um usuário é elegível para receber pela fila quando: `enabled = true` **E** `availability = 'online'` **E** dentro do horário (PRD-212) **E** status `ativo` (PRD-211). Um departamento é elegível quando `enabled = true` **E** possui ao menos um membro elegível.

### Rastreabilidade

Cada atribuição feita pela fila registra um **trace** (no espírito do `IDistributionTrace` do PRD-013): quem foi selecionado, quem foi avaliado/pulado e por quê (offline, desabilitado, fora do horário), e por qual modo. Alimenta auditoria e a visão "quem é o próximo".

### Mock-first (drop-in)

- **Fase 1:** a fila roda em memória/mock; `online/offline` vem do estado mockado; alimenta a atribuição mockada de conversas.
- **Fase 2:** a fila roda sobre Supabase; `online/offline` vem da presença real (Realtime, PRD-105); mesma interface (drop-in).

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Reescrever o round-robin do PRD-013 (DELTA) | Decisão 6-B optou por mecanismo próprio; PRD-013 já implementado, não deve ser reescrito |
| Dois motores independentes decidindo atribuição | Risco de atribuição dupla; resolvido com o contrato de fronteira (ponto de consulta único) |
| Sempre o primeiro online (sem ponteiro) | Injusto — sobrecarrega o topo da lista; ponteiro garante revezamento |
| Segurar a vez de quem está offline | Trava a fila; decisão 8-A optou por pular e avançar |
| Fila por canal/divisão | Decisão 7-A definiu **uma fila por loja**; granularidade fina fica fora do escopo |
| Forçar escolha department vs direct | `targetMode` configurável (12-C) atende ambos sem decisão prematura |

**Decisão consolidada:** **fila de atendimento por loja, mecanismo próprio referenciando o PRD-013 por contrato de fronteira (sem reescrita, sem atribuição dupla), com `targetMode` department/direct, ordenação por drag-and-drop, participação ligável, pulo de offline com avanço de ponteiro, integração com horário (212) e presença (Realtime), e trace auditável.**

---

## Escopo

### Incluído

- ✅ `IRotationQueue` — uma fila por loja: `storeId`, `targetMode` (`'department' | 'direct'`), `lastAssignedRefId` (ponteiro), `skipOffline` (sempre verdadeiro por 8-A, exposto para futura flexibilização)
- ✅ `IRotationParticipant` — `refId` (usuário ou departamento conforme o modo/escopo), `order`, `enabled`
- ✅ Rodízio interno de membros por departamento (quando `targetMode='department'`)
- ✅ `targetMode` como config por `IStore` (padrão `faturamentoMode`)
- ✅ Lógica de seleção: próximo elegível, pulo de offline/desabilitado/fora-de-horário, avanço de ponteiro, justiça temporal
- ✅ Tela de gestão (Owner/Gestor): editar `targetMode`, ordenar participantes (drag-and-drop), ligar/desligar participação, visão ao vivo ("próximo", online/offline, pulados)
- ✅ Aba **"Rodízio"** na tela de usuário (PRD-211): liga/desliga rápido da participação daquele usuário
- ✅ Integração com PRD-212: usuário fora do horário fica offline e é pulado (decisão 5-A)
- ✅ Integração com PRD-013: contrato de fronteira (consulta como fonte do revezamento; carteira/especialidade a montante; fallback a jusante)
- ✅ Trace auditável de cada atribuição (selecionado + avaliados/pulados + motivo + modo)
- ✅ Mock-first com paridade Fase 2 (presença real via Realtime)

### Excluído

- ❌ Reescrita do motor de distribuição do PRD-013 (decisão 6-B) — apenas referência/consulta
- ❌ Múltiplas filas por loja (por canal/divisão) — decisão 7-A define **uma por loja**
- ❌ Sobrescrever carteira/especialidade — esses critérios do PRD-013 permanecem a montante
- ❌ Balanceamento por carga como critério primário do rodízio — o rodízio é por **ordem**; carga continua sendo do PRD-013 (pode ser usada apenas como desempate, se desejado, em iteração futura)
- ❌ Distribuição de leads de campanha / outbound — escopo é o inbound de atendimento de rotina
- ❌ Configuração de pesos por participante — fora do escopo (ordem + enabled bastam)

---

## Requisitos Funcionais

### Modelo

- **RF-001:** Definir `IRotationQueue` com `id`, `storeId`, `targetMode: 'department' | 'direct'`, `lastAssignedRefId?`, `skipOffline: boolean` (default true). Uma fila por loja.
- **RF-002:** Definir `IRotationParticipant` com `id`, `queueId` (ou `departmentId` quando for o rodízio interno), `refId` (id de usuário ou de departamento conforme escopo), `order: number`, `enabled: boolean`.
- **RF-003:** Adicionar `targetMode` como config por `IStore` (mesmo padrão de `faturamentoMode`); a fila lê esse modo.
- **RF-004:** No modo `department`, cada departamento possui sua própria lista ordenada de participantes (membros) com `order` e `enabled` independentes da fila de departamentos.
- **RF-005:** DELTA sobre `ISeller`: campo `rotation` agregando a participação do usuário (ex: `{ enabled: boolean }`) para liga/desliga rápido na ficha do usuário (a ordenação fica na tela da fila).

### Lógica de seleção

- **RF-006:** Criar `selectNextFromRotation(queue, context): IRotationSelectionResult` — função **pura** que retorna o `refId` selecionado e o trace, sem efeitos colaterais (recebe participantes, presença, horário, ponteiro).
- **RF-007:** Definir **elegibilidade** de usuário: `enabled = true` E `availability = 'online'` E dentro do horário (PRD-212) E status `ativo` (PRD-211).
- **RF-008:** Pulo de offline (8-A): ao chegar a vez de um participante não elegível (offline, desabilitado ou fora do horário), **pular** e avançar ao próximo elegível; o ponteiro avança além do pulado.
- **RF-009:** Justiça temporal: usar `lastAssignedRefId` para iniciar a busca do próximo **após** o último atribuído (revezamento), não sempre do início.
- **RF-010:** Modo `department`: selecionar o próximo **departamento** elegível (tem ao menos um membro elegível); dentro dele, aplicar a mesma lógica para selecionar o **membro**. Ponteiros independentes.
- **RF-011:** Se **nenhum** participante for elegível, retornar resultado vazio e deixar o fluxo seguir para o **fallback do PRD-013** (SDR/fila de espera) — sem atribuição dupla.

### Integração com a distribuição (contrato de fronteira)

- **RF-012:** Quando a fila está ativa para o escopo, ela é a **fonte do revezamento** consultada no lugar do critério "round-robin/carga" do PRD-013 — ponto de integração **único** (uma consulta), referenciando o PRD-013 (sem reescrevê-lo).
- **RF-013:** **Carteira** e **especialidade** (PRD-013) permanecem a montante: se o cliente é conhecido (tem vendedor) ou há match de especialidade, a atribuição segue esses critérios e a fila **não** é consultada para aquela conversa.
- **RF-014:** Garantir que cada conversa receba **exatamente uma** atribuição (a fila não pode atribuir uma conversa que o PRD-013 já atribuiu por carteira/especialidade, nem vice-versa).

### Tela de gestão da fila

- **RF-015:** Criar tela de gestão da fila (Owner/Gestor) — sugestão: `/app/configuracoes/rodizio` (ou subseção da distribuição do PRD-019/013): seletor de `targetMode`, lista ordenável (drag-and-drop) de participantes, toggle `enabled` por participante.
- **RF-016:** Visão ao vivo: indicar **quem é o próximo**, o estado de cada participante (online/offline/desabilitado/fora-de-horário) e os **pulados** com o motivo.
- **RF-017:** No modo `department`, a tela permite navegar do rodízio de departamentos para o rodízio interno de cada departamento (dois níveis).
- **RF-018:** Reordenar ou ligar/desligar participantes é auditado; reordenação **não** zera injustamente o ponteiro (preservar justiça onde possível).

### Aba Rodízio na ficha do usuário

- **RF-019:** Na aba **"Rodízio"** da tela de usuário (PRD-211), Owner/Gestor podem ligar/desligar a participação daquele usuário rapidamente (reflete `ISeller.rotation.enabled` / participante correspondente).
- **RF-020:** A ficha indica o estado atual do usuário na fila (participa? está elegível agora? por que está pulado, se for o caso).

### Integração com horário e presença

- **RF-021:** Integração com PRD-212 (5-A): usuário fora do horário fica `offline` e é automaticamente **pulado** pela fila; ao voltar ao horário e reativar disponibilidade, volta a ser elegível.
- **RF-022:** Fase 2 — a presença (`online/offline`) provém do Realtime (PRD-105). Fase 1 — provém do estado mockado. A interface de seleção é a mesma (drop-in).

### Rastreabilidade

- **RF-023:** Cada atribuição via fila registra um **trace** (no espírito do `IDistributionTrace`): `selectedRefId`, lista de avaliados com motivo (selecionado/pulado-offline/pulado-desabilitado/pulado-fora-horário), `targetMode`, `storeId`. Alimenta auditoria (PRD-006) e a visão "quem é o próximo".

---

## Requisitos Não-Funcionais

- **RNF-001 (Atomicidade):** Uma conversa é atribuída exatamente uma vez; sob concorrência (Fase 2), garantir que o avanço do ponteiro e a atribuição sejam consistentes (sem dois atendentes recebendo a mesma).
- **RNF-002 (Determinismo):** A seleção é determinística dado o estado (sem `Math.random()`); o revezamento depende do ponteiro, não de sorteio.
- **RNF-003 (Performance):** `selectNextFromRotation` < 5ms para filas de dezenas de participantes; visão ao vivo atualiza em tempo (quase) real.
- **RNF-004 (Pureza):** A lógica de seleção é pura (recebe estado, retorna decisão + trace), espelhando o `distributeConversation` do PRD-013.
- **RNF-005 (Drop-in):** Trocar mock por Realtime na presença não muda a assinatura da seleção.
- **RNF-006 (Acessibilidade):** Drag-and-drop com alternativa por teclado; estados com `aria-label`; tema light/dark.

---

## Critérios de Aceitação

### RF-008 / RF-009: Pulo de offline e revezamento

```gherkin
DADO targetMode='direct' com a ordem [Carlos, Marina, Rafael], todos enabled
E que Marina está offline
QUANDO chega uma conversa de rotina e o último atribuído foi Carlos
ENTÃO a fila avalia Marina, pula (offline) e seleciona Rafael
  E o ponteiro avança para Rafael
  E o trace registra Marina como "pulada — offline" e Rafael como selecionado
```

### RF-010: Modo departamento (dois níveis)

```gherkin
DADO targetMode='department' com a ordem [Vendas Pesados, Vendas Leves]
E que "Vendas Pesados" é o próximo e tem 2 membros online
QUANDO chega uma conversa de rotina
ENTÃO a fila seleciona "Vendas Pesados" e, no rodízio interno, o próximo membro elegível
  E os ponteiros de departamento e de membro avançam independentemente
```

### RF-013 / RF-014: Carteira tem precedência (sem duplicação)

```gherkin
DADO um cliente conhecido cujo vendedor é Carlos
QUANDO ele inicia uma conversa
ENTÃO a atribuição vai para Carlos por carteira (PRD-013)
  E a fila NÃO é consultada para essa conversa
  E a conversa recebe exatamente uma atribuição
```

### RF-016: Visão ao vivo

```gherkin
DADO a tela de gestão da fila aberta
QUANDO um participante fica offline
ENTÃO a visão ao vivo atualiza o estado dele para "offline"
  E recalcula quem é o "próximo" elegível
```

### Cenários de Erro

```gherkin
DADO que todos os participantes estão offline/desabilitados/fora do horário
QUANDO chega uma conversa de rotina
ENTÃO a fila retorna vazio
  E o fluxo segue para o fallback do PRD-013 (SDR ou fila de espera)
  E nenhuma atribuição dupla ocorre

DADO (Fase 2) duas conversas chegando simultaneamente
QUANDO ambas consultam a fila
ENTÃO o avanço de ponteiro é consistente e elas vão para participantes diferentes (sem colisão)
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|-------------------|
| 1 | Modelo (`IRotationQueue`, `IRotationParticipant`, `targetMode` no store, `rotation` no usuário) | 4-5 |
| 2 | Lógica de seleção pura (`selectNextFromRotation`) com pulo de offline, ponteiro e modo departamento | 4-6 |
| 3 | Integração com a distribuição (contrato de fronteira / consulta como fonte do revezamento) + trace | 3-4 |
| 4 | Tela de gestão da fila (targetMode, drag-and-drop, toggle, visão ao vivo, dois níveis) + aba Rodízio na ficha | 6-8 |
| 5 | Integração com horário (212) e presença (Realtime, Fase 2) + auditoria + polish | 3-4 |

### Detalhamento das Fases

#### Fase 1: Modelo
**Objetivo:** estrutura da fila e dos participantes.
**Ações:**
- [ ] Definir `IRotationQueue`/`IRotationParticipant`; `targetMode` no `IStore`; `rotation` no `ISeller` (DELTA)
- [ ] Estrutura de rodízio interno por departamento
**Validação:** uma fila por loja com participantes ordenados e ligáveis nos dois modos.

#### Fase 2: Lógica de Seleção
**Objetivo:** decisão pura e justa.
**Ações:**
- [ ] `selectNextFromRotation` (elegibilidade, pulo de offline, ponteiro, modo departamento)
**Validação:** cenários de pulo/revezamento/departamento passam de forma determinística.

#### Fase 3: Integração com Distribuição
**Objetivo:** consultar a fila sem duplicar atribuição.
**Ações:**
- [ ] Ponto de consulta único (fonte do revezamento) referenciando o PRD-013; carteira/especialidade a montante; fallback a jusante
- [ ] Trace auditável
**Validação:** carteira tem precedência; rotina passa pela fila; uma atribuição por conversa.

#### Fase 4: UI
**Objetivo:** operação gerencia a fila visualmente.
**Ações:**
- [ ] Tela de gestão (targetMode, drag-and-drop, toggle, visão ao vivo, dois níveis) + aba Rodízio na ficha do usuário
**Validação:** ordenar/ligar/desligar reflete na seleção; visão ao vivo correta.

#### Fase 5: Horário, Presença e Polish
**Objetivo:** integrar tempo real e jornada.
**Ações:**
- [ ] Integração com PRD-212 (fora do horário ⇒ pulado) e presença Realtime (Fase 2) + auditoria
**Validação:** usuário fora do horário é pulado; presença real dirige elegibilidade.

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| 211 | Departamento (ativação de `ITeam`), usuários, aba Rodízio | ⏳ (pré-requisito direto) |
| 212 | Horário (fora do horário ⇒ offline ⇒ pulado) | ⏳ (integra; decisão 5-A) |
| F1:013 | Distribuição/roteamento (carteira, especialidade, fallback) | ✅ (referência / contrato de fronteira) |
| F1:010 | Inbox (atribuição de conversas) | ✅ |
| 105 | Realtime (presença online/offline real) | ⏳ (Fase 2) |

### Decisões Pendentes

- [ ] Carga como critério de **desempate** dentro do rodízio? (sugerido: não no MVP — ordem + pulo bastam)
- [ ] Localização final da tela: subseção da distribuição (PRD-013/019) ou rota dedicada `/app/configuracoes/rodizio` (sugerido: dedicada, com link cruzado)

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Gestão de Pessoas & Acesso"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | PRD-211 | Papéis Editáveis + Aprofundamento de Usuário | ⏳ | Base (departamento, usuários) |
| 2 | PRD-212 | Horário de Atendimento + Enforcement de Acesso | ⏳ | Integra (offline fora do horário) |
| **3** | **PRD-213** | **Rodízio / Fila de Atendimento** | **🔄 ATUAL** | Depende de 211; integra 212; referencia F1:013 |

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| Configuração da fila (ordem, participação, modo) | Operacional | Edição Owner/Gestor; auditada |
| Trace de atribuição (quem foi avaliado/pulado) | Operacional | Visível a Owner/Gestor; auditado |

### Autenticação e Autorização

- Gerir a fila (ordem, modo, participação): Owner (todos) / Gestor (seu departamento).
- Visualizar a fila ao vivo: Owner/Gestor.

### Auditoria

Reordenação, liga/desliga de participação, mudança de `targetMode` e cada atribuição via fila (trace) geram `IAuditLog`.

---

## Fluxos de Usuário

### Fluxo Principal — Atendimento de rotina (modo direct)

1. Conversa nova de rotina chega (cliente novo, sem carteira nem especialidade)
2. PRD-013 não casa carteira/especialidade → consulta a fila
3. Fila seleciona o próximo usuário elegível, pulando offline; ponteiro avança
4. Conversa atribuída; trace registrado

### Fluxo Alternativo — Modo department

1. Conversa de rotina chega; fila seleciona o próximo **departamento** elegível
2. Dentro do departamento, rodízio interno seleciona o membro elegível
3. Conversa atribuída ao membro; ponteiros avançam

### Fluxo de Exceção — Cliente conhecido

1. Cliente com carteira inicia conversa → vai ao seu vendedor (PRD-013), fila não é consultada

### Fluxo de Erro — Ninguém elegível

1. Todos offline/desabilitados/fora do horário → fila retorna vazio
2. Fluxo segue para fallback do PRD-013 (SDR / fila de espera)

---

### Convenções de Código (Referência Rápida)

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| **Componentes React** | PascalCase | `RotationQueueManager.tsx`, `RotationLiveView.tsx` |
| **Hooks** | camelCase + `use` | `useRotationQueue`, `useRotationParticipants` |
| **Funções puras** | camelCase | `selectNextFromRotation()` |
| **Interfaces** | PascalCase + `I` | `IRotationQueue`, `IRotationParticipant` |
| **Tabelas** | snake_case (plural) | `rotation_queues`, `rotation_participants` |
| **Pastas** | kebab-case | `src/features/rotation/` |
| **Ícones** | Iconify | `<Icon icon="mdi:account-switch" />` |
| **Tema** | Light + Dark | CSS variables |
| **Git commits** | Conventional Commits | `feat(rotation): per-store attendance queue` |

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

**Codinome sugerido (MINOR):** "Relay" (revezamento).

🔗 https://semver.org/

### Guia de Changelog
Added / Changed / Deprecated / Removed / Fixed / Security — 🔗 https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Uma atribuição por conversa** | A fila nunca atribui o que o PRD-013 já atribuiu (e vice-versa) |
| **Mecanismo próprio, não reescrita** | Referenciar o PRD-013, não reescrever sua engine (decisão 6-B) |
| **Determinístico** | Sem sorteio; revezamento por ponteiro |
| **Pulo, não trava** | Offline/desabilitado/fora-de-horário é pulado, não segura a vez (8-A) |
| **Drop-in de presença** | Mock → Realtime sem mudar a assinatura da seleção |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Ponto de consulta único** | Integrar com a distribuição num único ponto (fonte do revezamento), referenciando o PRD-013 |
| **Carteira/especialidade a montante** | Não sobrepor esses critérios; eles têm precedência por design |
| **Dois níveis no modo department** | Ponteiros de departamento e de membro independentes |
| **`targetMode` como `faturamentoMode`** | Config por loja, mesmo padrão já estabelecido |
| **Integração com 212** | Fora do horário ⇒ offline ⇒ pulado (5-A) |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Reescrever o motor de distribuição do PRD-013 |
| Permitir atribuição dupla de uma mesma conversa |
| Usar `Math.random()` no revezamento |
| Segurar a vez de participante offline (deve pular) |
| Criar múltiplas filas por loja (uma por loja — 7-A) |
| Sobrepor carteira/especialidade do PRD-013 |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO |
| **Data de Implementação** | 2026-06-17 |
| **Versão do App** | v0.100.0 (`Carousel`) |
| **Implementado por** | Agente Desenvolvedor (Claude Code) |
| **Observações** | Mecanismo completo: modelo + engines puros testados + providers mock+supabase + tela `/app/configuracoes/rodizio` (@dnd-kit, visão ao vivo, dois níveis) + aba "Rodízio" no cadastro + integração no ponto único `conversations.create` (carteira/especialidade a montante; fila como fonte do revezamento; fallback do 013 a jusante; uma atribuição por conversa). Ambos `targetMode` (direct + department). **O webhook real NÃO foi tocado** — ativação da fila no webhook (presença server-side) DEFERIDA por decisão, como o enforcement server-side do PRD-212. Migration `20260616180000_rotation_queues.sql` **versionada; aplicação em produção pendente de autorização do dono**. Docs: `docs/dev/rotation-queue.md`. |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 14/06/2026 | v1 | Criação inicial — fila de atendimento por loja (mecanismo próprio), `targetMode` department/direct, ordenação drag-and-drop, participação ligável, pulo de offline com ponteiro, contrato de fronteira com PRD-013 (sem reescrita, sem atribuição dupla), integração com horário (212) e presença (Realtime) |

---

**AILA - Sistemas Inteligentes**
