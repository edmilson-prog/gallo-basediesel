# PRD-013: Regras de Distribuição e Roteamento

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                     |
| **Objetivo**          | Definir como conversas novas são automaticamente atribuídas a vendedores conforme regras configuráveis (carteira, especialidade, round-robin, carga, disponibilidade), com fallback para SDR fora do horário e fila de espera quando ninguém disponível |
| **Tipo**              | Feature                                                                                                                                                                                                                                                 |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                    |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                       |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                    |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                                                                                  |
| **PRDs Relacionados** | PRD-010 (Inbox), PRD-011 (Conversa), PRD-014 (Painel Gestor), PRD-018 (Carteira), PRD-019 (Configurações), PRD-023 (Escalonamento SDR)                                                                                                                  |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                                                                        |
| **Padrão de código**  | Feature-based; código em `src/features/distribution/`; engine de regras em `src/features/distribution/engine/`; configurações em `src/features/distribution/components/RulesPanel.tsx`                                                                  |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** engine de regras com cascata de critérios (carteira → especialidade → round-robin → carga), respeito a `availability` e horário comercial, fallback para SDR ou fila, painel administrativo com editor visual de regras, simulador de teste ("se essa conversa chegasse agora, quem receberia?"), histórico auditado de cada decisão, integração transversal com `<ConversationsProvider>` (PRD-005) para interceptar criação de conversa, e regras precisam ser semanticamente compatíveis com a operação real do WhatsApp na Fase 2 — onde a primeira mensagem dispara o roteamento.

---

## Contexto do Problema

Hoje na GALLO BASE DIESEL, novos clientes mandam mensagem no WhatsApp Business e quem está com o celular na mão atende. Resultado: 2 vendedores respondem o mesmo cliente, conflito de "esse era meu lead", clientes ignorados porque ninguém percebeu, vendedor sobrecarregado enquanto outro fica ocioso. Sem regras claras de distribuição, o atendimento vira loteria.

Três problemas concretos:

**Carteira não é respeitada automaticamente.** Cliente "Transportadora Aurora" já é da carteira do Carlos. Mas quando ela manda mensagem nova depois de 2 meses, qualquer vendedor pode pegar — e a relação se perde, comissão fica confusa, métricas de retenção ficam erradas. A distribuição precisa, em primeiro lugar, **respeitar a carteira existente**. **Sem critérios escalonados, fica caótico.** "E se Carlos estiver ausente?" "E se for sábado?" "E se for um lead novo sem vendedor?" Cada situação precisa ter uma regra automática, não improviso. **Visibilidade gerencial zero.** O Owner não sabe "por que esse lead foi para Marina e não para Carlos?". Sem audit trail das decisões de distribuição, qualquer ajuste futuro é fé cega.

Este PRD entrega: engine de roteamento em cascata (5 critérios), painel administrativo para Owner editar regras visualmente, simulador de teste das regras, fallback inteligente (SDR fora do horário, fila quando todos ocupados), e auditoria completa de cada decisão.

Importante notar: este PRD trata de **distribuição inicial** (conversa entrando no sistema). Transferência de carteira já existente é PRD-018. Escalonamento de SDR para humano é PRD-023.

---

## Conceito da Solução

### Engine de regras em cascata

Quando uma conversa nova entra no sistema, o engine percorre **5 critérios em ordem**, parando no primeiro que produzir resultado:

| Ordem | Critério               | Lógica                                                                                                              |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1     | **Carteira existente** | Se cliente já tem `sellerId` (carteira), conversa vai direto para esse vendedor (mesmo se ofline — fica aguardando) |
| 2     | **Especialidade**      | Se há vendedor com `specialties` matching com produto/veículo mencionado, prioriza                                  |
| 3     | **Round-robin**        | Distribuição equitativa entre vendedores disponíveis (`availability === 'online'`)                                  |
| 4     | **Carga**              | Em caso de empate ou tiebreak, vendedor com menos conversas ativas                                                  |
| 5     | **Fallback**           | Ninguém disponível → SDR assume (`isSdrActive: true`) ou conversa entra em fila                                     |

Cada critério pode ser **ligado/desligado** ou ter peso ajustado pelo Owner no painel admin.

### Modos de operação

| Modo                       | Comportamento                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| **Automático** (default)   | Engine roda em cascata sem intervenção; vendedor é notificado                            |
| **Manual**                 | Owner/Gestor pode revisar conversas órfãs e atribuir manualmente                         |
| **SDR-first**              | Toda conversa nova passa primeiro pelo SDR; só escala para humano sob critério (PRD-023) |
| **Híbrido** (default real) | Carteira respeitada; resto via SDR-first                                                 |

### Disponibilidade dos vendedores

`ISeller.availability` pode ser: `online | ausente | ocupado | offline`. Apenas `online` recebe distribuição automática. Vendedor controla via toggle na sua interface (cabeçalho/avatar).

### Horário comercial

Configurável em `IPlatformSettings.businessHours`: dias da semana + horários. Fora do expediente:

- Conversas novas vão direto para SDR (`isSdrActive: true`)
- Mensagem automática de boas-vindas
- Quando expediente começa, SDR continua até vendedor pegar

### Fila de espera

Se carteira não se aplica, especialidade não casa, e ninguém está online:

- Conversa fica com `assignedSellerId: null` e `status: 'aguardando'`
- SDR atende se configurado
- Aparece na inbox com badge "Em fila" para Owner/Gestor distribuir manualmente
- Tempo na fila é métrica monitorada (PRD-014)

### Painel administrativo (Owner only)

Rota `/app/configuracoes/distribuicao` (sub-rota das configurações do PRD-019). Conteúdo:

1. **Modo de operação** — toggle entre automático/manual/SDR-first/híbrido
2. **Ordem dos critérios** — drag-and-drop reordenar (com pesos opcionais)
3. **Toggle por critério** — ativar/desativar cada um
4. **Horário comercial** — calendário semanal com janelas
5. **Mensagem de fora do expediente** — texto enviado automaticamente pelo SDR
6. **Política de fila** — tempo máximo na fila antes de notificar Owner
7. **Simulador** — "Se uma conversa chegasse agora de [cliente X / lead novo], quem receberia?" mostra trace completo da decisão
8. **Histórico de distribuições** — lista paginada com motivo de cada atribuição

### Trace de decisão

Cada distribuição automática registra um objeto `IDistributionTrace`:

```typescript
IDistributionTrace {
  id: ID;
  conversationId: ID;
  customerId?: ID;
  leadId?: ID;
  timestamp: ISO8601;
  selectedSellerId: ID | null;       // null se foi pra SDR ou fila
  criterionMatched: 'carteira' | 'especialidade' | 'round_robin' | 'carga' | 'fallback_sdr' | 'fallback_fila';
  candidatesEvaluated: { sellerId: ID; reason: string }[];  // todos avaliados, mesmo descartados
  storeId: ID;
}
```

Esse trace alimenta o histórico no painel e o audit log (PRD-006).

### Notificação ao vendedor

Quando o engine atribui uma conversa a um vendedor:

- Conversa aparece na inbox dele (real-time simulado do PRD-010)
- Badge "Nova!" piscando
- Toast no canto: "Nova conversa atribuída: [Nome do cliente]"
- No MVP, notificação visual; Fase 2 inclui push notification

### Alternativas Consideradas

| Alternativa                                                         | Por que foi descartada                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Distribuição puramente aleatória                                    | Quebra carteira; perde relacionamento de vendas                                                         |
| Lista fixa de pesos numéricos sem hierarquia                        | Difícil de configurar; cascata é mais legível                                                           |
| Sem fallback para fila                                              | Conversas órfãs ficam invisíveis até alguém perceber                                                    |
| Algoritmo ML para distribuição                                      | Complexidade desnecessária no MVP; cascata determinística é auditável                                   |
| Distribuição síncrona em tempo de chegada da mensagem (no provider) | Acopla engine ao provider; preferir engine como service independente que pode rodar em qualquer trigger |
| Sem trace de decisão                                                | Sem auditoria, ajustar regra é fé cega                                                                  |
| Permitir vendedor recusar distribuição                              | Complica fluxo; vendedor edita `availability` se não quer receber                                       |

**Decisão consolidada:** **cascata de 5 critérios configurável pelo Owner, modo híbrido default, fallback duplo (SDR + fila), trace completo de cada decisão, simulador no painel admin.**

---

## Escopo

### Incluído

- ✅ Engine de regras em `src/features/distribution/engine/`:
  - `distributeConversation(conversation, context): IDistributionResult` — função pura
  - 5 critérios encapsulados em funções separadas (`tryCarteira`, `tryEspecialidade`, `tryRoundRobin`, `tryCarga`, `tryFallback`)
  - Retorna `selectedSellerId` ou `null` + trace de candidatos avaliados
- ✅ Integração com `mockConversationsProvider.create` (PRD-005): toda conversa nova passa pelo engine
- ✅ Modelo `IDistributionTrace` adicionado a `src/shared/types/distribution.ts`
- ✅ Modelo `IBusinessHours` em `IPlatformSettings.businessHours`
- ✅ Toggle de disponibilidade do vendedor na top bar (avatar dropdown — atualizar PRD-003)
- ✅ Mensagem automática fora do expediente (configurada no painel)
- ✅ Lógica de fila: conversas órfãs com `assignedSellerId: null` e `status: 'aguardando'`
- ✅ Painel administrativo `/app/configuracoes/distribuicao`:
  - Toggle de modo de operação
  - Ativar/desativar cada critério com explicação
  - Editor de horário comercial (calendário semanal)
  - Editor de mensagem fora do expediente
  - Política de fila (tempo máximo)
  - Simulador "Se chegasse agora de X" com trace visual
  - Histórico paginado de distribuições com filtros
- ✅ Atualização do PRD-010 (Inbox): badge "Em fila" para conversas órfãs, filtro "Em fila"
- ✅ Notificação visual ao vendedor (toast + badge na inbox) quando recebe distribuição
- ✅ Geradores de mock para `IDistributionTrace` (PRD-004 update)
- ✅ Audit log de mudanças nas regras de distribuição (PRD-006)
- ✅ Permissões: apenas Owner edita regras; Gestor visualiza + redistribui manualmente
- ✅ Documentação `docs/distribuicao.md` explicando engine e regras

### Excluído

- ❌ Distribuição em tempo real via webhooks reais do WhatsApp — Fase 2 (PRD-101)
- ❌ ML/IA para otimizar distribuição — Fase 2 ou nunca
- ❌ Distribuição cross-store (lead chega para matriz mas Erechim atende) — Fase 2
- ❌ Push notifications no celular — Fase 2
- ❌ Sons de alerta — fora do MVP
- ❌ Auto-pausar vendedor que não responde em X minutos — Fase 2
- ❌ Roteamento por canal (WhatsApp para vendedor X, e-commerce para vendedor Y) — fora do MVP; usar especialidade se necessário
- ❌ Integração com calendário externo (Google Calendar) para detectar ausências — Fase 2
- ❌ Permitir cliente solicitar vendedor específico no SDR — Fase 2

---

## Critérios em Detalhe

### Critério 1 — Carteira Existente

**Condição:** `customer.sellerId` está preenchido (cliente já tem vendedor responsável).
**Ação:** atribui conversa a `customer.sellerId` mesmo se ele estiver `ausente/ocupado/offline`. A conversa fica aguardando ele voltar.
**Justificativa:** preserva relacionamento de vendas, commissões, métricas de carteira.
**Pode ser desligado?** Sim, mas com aviso forte ao Owner ("Isso vai quebrar continuidade de carteira").

### Critério 2 — Especialidade

**Condição:** mensagem inicial contém marca/modelo de veículo OU produto específico, e há vendedor com `specialties` contendo esse termo.
**Ação:** atribui ao especialista disponível (online) com menos carga.
**Detecção:** análise simples de keywords na primeira mensagem (no MVP, lista de palavras-chave configurável: "Volvo", "Scania", "freio", "motor"; na Fase 2, usar IA).
**Pode ser desligado?** Sim.

### Critério 3 — Round-Robin

**Condição:** quando carteira não se aplica e especialidade não casou.
**Ação:** distribui em revezamento entre vendedores `online`. O sistema mantém um `lastAssignedSellerId` em `IPlatformSettings` e seleciona o próximo na lista.
**Tiebreak:** carga (próximo critério).
**Pode ser desligado?** Sim — nesse caso vai direto para critério de carga.

### Critério 4 — Carga

**Condição:** usado isoladamente OU como tiebreak do round-robin.
**Ação:** vendedor com menor número de conversas com status `aguardando` ou `em_andamento` recebe.
**Empate:** quem ficou mais tempo sem receber.
**Pode ser desligado?** Sim — mas nesse caso round-robin precisa estar ligado.

### Critério 5 — Fallback

**Condição:** ninguém disponível atende.
**Ações em ordem:**

1. Se SDR está habilitado E está dentro do horário OU configurado para fora: assume com `isSdrActive: true`
2. Se SDR não está habilitado: conversa entra em fila (`status: 'aguardando'`, `assignedSellerId: null`)
3. Owner é notificado se conversa fica em fila > X minutos (configurável)

---

## Requisitos Funcionais

### Modelo de dados

- **RF-001:** Adicionar interface `IDistributionTrace` em `src/shared/types/distribution.ts` com campos: id, conversationId, customerId?, leadId?, timestamp, selectedSellerId, criterionMatched, candidatesEvaluated, storeId.
- **RF-002:** Adicionar campos em `IPlatformSettings`:
  - `distribution: IDistributionSettings` contendo: mode (auto/manual/sdr-first/hybrid), criteriaEnabled (objeto com flags por critério), criteriaOrder (array de ordem), businessHours, offHoursMessage, queueTimeoutMinutes, lastAssignedSellerId (para round-robin)
- **RF-003:** Adicionar `availability` a `ISeller` (já está no PRD-002) — confirmar e criar UI de toggle.
- **RF-004:** Adicionar `IBusinessHours` em types: `{ weekday: 0-6; openAt: 'HH:mm'; closeAt: 'HH:mm'; enabled: boolean }[]`.

### Engine de distribuição

- **RF-005:** Criar `distributeConversation(input: IDistributionInput, context: IDistributionContext): IDistributionResult` em `src/features/distribution/engine/distribute.ts`.
- **RF-006:** A função deve ser **pura** — sem side effects, sem mutations no store. Receber tudo via parâmetros (vendedores disponíveis, settings, etc.) e retornar resultado decision + trace.
- **RF-007:** Implementar 5 funções de critério: `tryCarteira`, `tryEspecialidade`, `tryRoundRobin`, `tryCarga`, `tryFallback`.
- **RF-008:** Cada função de critério recebe `IDistributionContext` e retorna `{ matched: boolean; sellerId?: ID; reason: string }`.
- **RF-009:** O orchestrador `distributeConversation` percorre os critérios na ordem definida por `settings.criteriaOrder`, parando no primeiro que retornar `matched: true`.
- **RF-010:** Cada candidato avaliado entra em `candidatesEvaluated[]` do trace, mesmo descartado, com motivo.

### Integração com providers

- **RF-011:** Interceptar `conversationsProvider.create()` em `src/providers/data/impl/mock/conversations.ts`:
  - Chamar `distributeConversation(...)` antes de salvar
  - Preencher `assignedSellerId`, `isSdrActive` conforme resultado
  - Salvar `IDistributionTrace` no mock store
  - Emitir audit log via `auditLog()` do PRD-006
- **RF-012:** Em modo `manual`, a interceptação **não** atribui automaticamente — apenas marca como `aguardando` para Gestor distribuir.

### Disponibilidade do vendedor (UI)

- **RF-013:** Atualizar `<AvatarDropdown>` do TopBar (PRD-003) adicionando seção "Disponibilidade" com 4 opções: Online (verde), Ausente (amarelo), Ocupado (laranja), Offline (cinza).
- **RF-014:** Selecionar opção atualiza `currentUser.availability` via `sellersProvider.update()`.
- **RF-015:** Apenas Owner/Gestor podem mudar disponibilidade de outros vendedores (acessível via lista de vendedores em PRD-019 ou Painel do Gestor PRD-014).
- **RF-016:** Audit log registra mudanças de disponibilidade.

### Horário comercial

- **RF-017:** Verificar horário via helper `isWithinBusinessHours(date, businessHours): boolean` em `src/features/distribution/utils/`.
- **RF-018:** Quando fora do horário, engine força `isSdrActive: true` na conversa atribuída.
- **RF-019:** Mensagem automática de fora do expediente: criar `IMessage` de `authorType: 'system'` com texto configurado por Owner, logo após a primeira mensagem do cliente.

### Fila de espera

- **RF-020:** Conversas órfãs (`assignedSellerId: null` E `status: 'aguardando'`) aparecem na inbox com badge "Em fila" (cor `--brand-industrial` amarelo).
- **RF-021:** Filtro adicional "Em fila" no `<AssignmentFilter>` do PRD-010, visível apenas para Owner/Gestor.
- **RF-022:** Timer em background: a cada minuto verifica conversas em fila há mais de `queueTimeoutMinutes`. Para cada uma, dispara `auditLog` com action `queue_timeout` (Owner pode revisar).

### Painel administrativo

- **RF-023:** Criar `DistributionRulesPanel` em `src/features/distribution/pages/DistributionRulesPanel.tsx`, rota `/app/configuracoes/distribuicao`.
- **RF-024:** Painel protegido por `<GuardedRoute permission={{ resource: 'settings', action: 'edit' }}>` — apenas Owner.
- **RF-025:** Seção "Modo de operação": 4 cards radio (Automático / Manual / SDR-first / Híbrido) com explicação de cada.
- **RF-026:** Seção "Critérios": lista com drag-and-drop para reordenar (`@dnd-kit` ou similar) e toggle on/off por critério. Tooltip explicativo em cada.
- **RF-027:** Seção "Horário comercial": grade visual semanal (7 dias × 24h) onde Owner pinta as janelas ativas. Editor alternativo com tabela: dia + abrir + fechar.
- **RF-028:** Seção "Mensagem de fora do expediente": textarea + preview de como aparecerá ao cliente.
- **RF-029:** Seção "Política de fila": número de minutos antes de alertar (default 30).
- **RF-030:** Seção "Simulador":
  - Dropdown para selecionar tipo: "Cliente existente" (lista mocks) / "Lead novo" (escolher canal)
  - Botão "Simular agora"
  - Resultado: trace visual mostrando cada critério percorrido com sucesso/falha + decisão final (qual vendedor ou SDR/fila)
- **RF-031:** Seção "Histórico de distribuições": tabela paginada com colunas: timestamp, cliente/lead, canal, vendedor escolhido (ou SDR/fila), critério usado, link "ver detalhes" abrindo trace completo.
- **RF-032:** Salvar mudanças via `settingsProvider.update()`, com confirmação antes (modal: "Confirma alterar regras de distribuição? Mudanças passam a valer imediatamente para novas conversas.").
- **RF-033:** Audit log em cada modificação salva.

### Notificação ao vendedor

- **RF-034:** Quando engine atribui conversa a um vendedor online:
  - Toast no canto inferior direito da tela do vendedor (se estiver no app): "Nova conversa atribuída: [Nome do cliente] - [Canal]". Botão "Ver" navega para a conversa.
  - Badge "Nova!" piscando na inbox da conversa por 60s.
- **RF-035:** Implementação via `useRealtimeConversations()` do PRD-010 — quando detecta nova conversa atribuída ao user atual, dispara o toast.

### Permissões

- **RF-036:** **Owner**: edita regras, vê histórico, redistribui manualmente.
- **RF-037:** **Gestor**: NÃO edita regras (read-only), vê histórico, redistribui manualmente (conversas em fila ou já atribuídas — usa transfer do PRD-018).
- **RF-038:** **Vendedor**: NÃO vê painel; controla apenas a própria disponibilidade.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** `distributeConversation` executa em < 30ms mesmo com 50 vendedores.
- **RNF-002 (Determinismo):** Mesma entrada produz mesma saída (engine é puro). Round-robin usa `lastAssignedSellerId` persistente — não aleatório.
- **RNF-003 (Auditabilidade):** Trace de cada decisão preservado em audit log; possível reconstruir "por que essa conversa foi pra Carlos" 6 meses depois.
- **RNF-004 (Tipagem):** Zero `any`; engine usa types do PRD-002.
- **RNF-005 (Manutenibilidade):** Adicionar novo critério deve impactar 1 função nova + 1 entry no `criteriaOrder` da config + opção no painel — sem refatoração.
- **RNF-006 (Compatibilidade Fase 2):** Engine deve ser invocável tanto a partir do mock provider quanto, na Fase 2, de uma Edge Function do Supabase recebendo webhook do WhatsApp. Função pura facilita.

---

## Critérios de Aceitação

### Engine — Critérios em cascata

```gherkin
DADO uma conversa nova de cliente "Aurora" que já tem sellerId="carlos"
QUANDO distributeConversation roda
ENTÃO o critério "carteira" matcha
  E selectedSellerId = "carlos"
  E candidatesEvaluated tem 1 item (carlos com motivo "carteira existente")
  E trace.criterionMatched === "carteira"

DADO um lead novo (sem customer associado) e mensagem mencionando "Volvo"
  E Marina tem specialties ["Volvo", "Scania"] e está online
  E Carlos tem specialties ["Mercedes"] e está online
QUANDO distributeConversation roda
ENTÃO critério "especialidade" matcha
  E selectedSellerId = "marina"

DADO um lead novo sem palavras-chave reconhecíveis
  E todos os vendedores online com mesma carga
  E lastAssignedSellerId = "carlos"
QUANDO distributeConversation roda
ENTÃO critério "round_robin" matcha
  E selectedSellerId = próximo na lista após Carlos
  E lastAssignedSellerId é atualizado
```

### Fallback

```gherkin
DADO uma conversa nova
  E NENHUM vendedor com availability=online
  E SDR está habilitado e dentro do horário
QUANDO distributeConversation roda
ENTÃO critério "fallback_sdr" matcha
  E isSdrActive = true
  E assignedSellerId pode ser null OU primeiro Owner/Gestor para handoff posterior

DADO uma conversa nova
  E NENHUM vendedor disponível E SDR desabilitado
QUANDO distributeConversation roda
ENTÃO critério "fallback_fila" matcha
  E assignedSellerId = null
  E status = "aguardando"
  E aparece na inbox com badge "Em fila" para Owner/Gestor
```

### Horário comercial

```gherkin
DADO businessHours configurado (segunda-sexta, 8h-18h)
  E uma conversa nova chega às 20h de uma quarta-feira
QUANDO o engine roda
ENTÃO mesmo se houver vendedor online, isSdrActive é true
  E mensagem automática de fora do expediente é enviada como bubble system

DADO horário comercial ativo no momento
QUANDO conversa nova chega
ENTÃO engine prossegue normalmente respeitando critérios
```

### Painel administrativo

```gherkin
DADO que sou Owner e acesso /app/configuracoes/distribuicao
QUANDO a página carrega
ENTÃO vejo todas as seções: Modo, Critérios, Horário, Mensagem, Fila, Simulador, Histórico

DADO que sou Gestor e tento acessar /app/configuracoes/distribuicao
QUANDO o GuardedRoute verifica permissão
ENTÃO sou redirecionado para /sem-permissao

DADO que reordeno os critérios via drag-and-drop e clico em Salvar
QUANDO a confirmação é aceita
ENTÃO as novas regras são persistidas
  E auditLog registra a mudança com before/after
  E próximas conversas usarão a nova ordem
```

### Simulador

```gherkin
DADO que no simulador seleciono "Lead novo - WhatsApp" e clico "Simular"
QUANDO o resultado renderiza
ENTÃO vejo trace passo a passo: carteira (não aplica - lead) → especialidade (sem keyword) → round-robin → match Marina
  E vejo lista completa de vendedores avaliados com motivos
```

### Notificação ao vendedor

```gherkin
DADO que Carlos está online e em /app/atendimento
  E uma nova conversa é distribuída para ele
QUANDO o engine completa a distribuição
ENTÃO Carlos vê toast "Nova conversa atribuída: João Silva - WhatsApp"
  E na inbox aparece a conversa nova com badge "Nova!" piscando por 60s

DADO que Carlos está em outra tela (não na inbox)
QUANDO recebe distribuição
ENTÃO toast ainda aparece com botão "Ver" que leva à conversa
```

### Cenários de erro

```gherkin
DADO que todos os vendedores estão offline E SDR desabilitado E horário não-comercial
QUANDO conversa nova chega
ENTÃO entra em fila com mensagem clara para Owner: "Conversa sem atendimento"
  E após queueTimeoutMinutes, Owner recebe notificação

DADO que round-robin foi desligado mas carga também
QUANDO conversa nova chega e nenhum critério prévio matcha
ENTÃO cai automaticamente em fallback (SDR ou fila)
  E warning no painel admin: "Você desligou critérios suficientes — distribuição cai sempre em fallback"
```

---

## Fases de Implementação

| Fase | Objetivo                                                               | Arquivos Estimados |
| ---- | ---------------------------------------------------------------------- | ------------------ |
| 1    | Modelo, engine puro e testes manuais via console                       | 8-10               |
| 2    | Integração com providers e mocks + audit log                           | 4-5                |
| 3    | UI: toggle de disponibilidade + badge "Em fila" na inbox + notificação | 4-5                |
| 4    | Painel administrativo completo com 7 seções                            | 8-10               |
| 5    | Simulador + histórico + polish                                         | 4-5                |

### Detalhamento das Fases

#### Fase 1: Modelo e Engine

**Objetivo:** lógica de distribuição funcional e testável

**Ações:**

- [ ] Criar tipos: `IDistributionTrace`, `IDistributionSettings`, `IBusinessHours` em `src/shared/types/distribution.ts`
- [ ] Atualizar `IPlatformSettings` para incluir `distribution`
- [ ] Criar `src/features/distribution/engine/` com 5 funções de critério + orchestrator
- [ ] Implementar `isWithinBusinessHours`, `getOnlineSellers`, `selectByLoad`, `selectByRoundRobin` em utils
- [ ] Testar engine via console manualmente: chamar com inputs variados e validar saídas

**Validação:** rodar `distributeConversation` com 5 cenários (carteira, especialidade, round-robin, carga, fallback) e validar resultados.

#### Fase 2: Integração com Mocks

**Objetivo:** distribuir automaticamente conversas novas

**Ações:**

- [ ] Modificar `mockConversationsProvider.create` para chamar engine antes de salvar
- [ ] Salvar `IDistributionTrace` no mock store
- [ ] Disparar `auditLog` via PRD-006
- [ ] Atualizar geradores do PRD-004 para criar traces históricos (~40 traces nos últimos 30 dias)
- [ ] Permitir modo `manual` (skip do engine se config está em modo manual)

**Validação:** criar conversas novas via mock e validar que recebem assignedSellerId corretamente; traces aparecem no store.

#### Fase 3: UI Auxiliar

**Objetivo:** vendedor controla disponibilidade e vê notificações

**Ações:**

- [ ] Atualizar `<AvatarDropdown>` do TopBar com seção Disponibilidade
- [ ] Implementar `sellersProvider.updateAvailability(id, availability)`
- [ ] Atualizar inbox do PRD-010 para badge "Em fila" e filtro
- [ ] Implementar toast de notificação ao vendedor quando recebe distribuição (via `useRealtimeConversations`)

**Validação:** mudar own availability no TopBar persiste; conversa nova aparece com badge piscante + toast.

#### Fase 4: Painel Administrativo

**Objetivo:** Owner configura regras visualmente

**Ações:**

- [ ] Criar `DistributionRulesPanel` em `src/features/distribution/pages/`
- [ ] Implementar seções: Modo, Critérios (com drag-and-drop), Horário (grade ou tabela), Mensagem, Fila
- [ ] Salvar via `settingsProvider.update()` com modal de confirmação
- [ ] Integrar `<GuardedRoute permission>` para Owner only
- [ ] Audit log em cada save

**Validação:** Owner edita regras, salva, vê audit log atualizado, novas conversas obedecem.

#### Fase 5: Simulador e Histórico

**Objetivo:** transparência e debugging

**Ações:**

- [ ] Implementar `<DistributionSimulator>` no painel
- [ ] Implementar `<DistributionHistory>` com tabela paginada e filtros
- [ ] Cada item do histórico expansível mostra trace completo
- [ ] Documentar engine em `docs/distribuicao.md`

**Validação:** simulador retorna trace correto; histórico mostra últimas 100 distribuições com motivo legível.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                        | Status      |
| ------- | -------------------------------- | ----------- |
| PRD-002 | Modelo Conceitual                | 📝 Redigido |
| PRD-003 | Shell (TopBar atualizado)        | 📝 Redigido |
| PRD-004 | Mocks (traces gerados)           | 📝 Redigido |
| PRD-005 | Provider Pattern (interceptação) | 📝 Redigido |
| PRD-006 | RBAC (permissions, audit log)    | 📝 Redigido |
| PRD-007 | Multi-Loja (scope)               | 📝 Redigido |
| PRD-010 | Inbox (badge "Em fila", filtro)  | 📝 Redigido |

### Serviços Externos

| Serviço                             | Tipo | Status     |
| ----------------------------------- | ---- | ---------- |
| `@dnd-kit/sortable` (drag-and-drop) | Lib  | A instalar |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem | PRD         | Título                     | Status       |
| ----- | ----------- | -------------------------- | ------------ |
| 1     | PRD-010     | Inbox                      | 📝           |
| 2     | PRD-011     | Conversa                   | 📝           |
| 3     | PRD-012     | Ficha                      | 📝           |
| **4** | **PRD-013** | **Regras de Distribuição** | **🔄 ATUAL** |
| 5     | PRD-014     | Painel Gestor              | ⏳           |
| ...   |             |                            |              |

---

## Considerações de Segurança

### Edição das regras

Apenas Owner. Gestor visualiza histórico mas não edita. Cada mudança gera audit log.

### Trace contém dados de vendedores

`candidatesEvaluated` inclui IDs e motivos para cada vendedor avaliado. Considerar sensibilidade: em audit log, manter; em UI, mostrar para Owner e Gestor (transparência operacional), esconder para vendedores comuns.

### Modo manual = controle total do Gestor

Em modo manual, vendedores **não recebem** distribuição automática. Conversas ficam em fila aguardando Gestor atribuir. UX: avisar Gestor quando ativar modo ("Você assumirá distribuição manual de todas as conversas novas").

---

## Fluxos de Usuário

### Fluxo Principal — Lead novo entra no expediente

1. Cliente novo manda mensagem WhatsApp às 10h (horário comercial)
2. Engine roda:
   - Carteira: não aplica (lead)
   - Especialidade: mensagem menciona "Volvo" → Marina tem essa especialidade → matcha
3. Conversa atribuída a Marina
4. Trace salvo, audit log emitido
5. Marina recebe toast "Nova conversa atribuída"
6. Conversa aparece na inbox com badge "Nova!" piscando

### Fluxo Alternativo — Fora do expediente

1. Cliente manda mensagem WhatsApp às 22h
2. Engine roda:
   - isWithinBusinessHours retorna false
   - Força isSdrActive = true
3. SDR cria mensagem automática "Recebi sua mensagem! Vou retornar amanhã às 8h."
4. SDR continua disponível para perguntas básicas
5. Manhã seguinte às 8h, SDR escalona para vendedor humano (PRD-023)

### Fluxo de Configuração — Owner ajusta regras

1. Owner acessa `/app/configuracoes/distribuicao`
2. Decide: desligar critério "Especialidade" (vendedores estão reclamando que sempre os mesmos pegam)
3. Toggle "Especialidade" para off
4. Modal: "Confirma? Próximas conversas seguirão diretamente para round-robin"
5. Owner confirma → audit log gravado
6. Lead novo nas próximas horas: passa direto para round-robin

### Fluxo de Simulação

1. Owner abre simulador
2. Seleciona "Lead novo - WhatsApp"
3. Clica "Simular"
4. Resultado mostra:
   - Carteira: ❌ (não aplica)
   - Especialidade: ❌ (sem keyword)
   - Round-Robin: ✅ → Vendedor selecionado: Carlos
   - Detalhes: Marina, Rafael avaliados como candidatos (mesma carga, mas Carlos é o próximo na sequência)
5. Owner confirma que a regra está correta para o cenário

### Fluxo de Erro — Todos offline + SDR offline

1. Conversa chega às 23h domingo (fora do expediente, SDR desabilitado nos fins de semana)
2. Engine: fallback → fila
3. Conversa fica em fila com badge "Em fila"
4. Após 30 minutos (queueTimeoutMinutes), audit log com action `queue_timeout`
5. Owner recebe notificação na próxima sessão: "1 conversa aguardando atendimento há mais de 30 minutos"

---

## Convenções de Código (Referência Rápida)

| Elemento        | Convenção                | Exemplo                                               |
| --------------- | ------------------------ | ----------------------------------------------------- |
| **Engine**      | camelCase, função pura   | `distributeConversation()`                            |
| **Critérios**   | camelCase, prefixo `try` | `tryCarteira`, `tryRoundRobin`                        |
| **Trace**       | PascalCase com `I`       | `IDistributionTrace`                                  |
| **Settings**    | PascalCase com `I`       | `IDistributionSettings`                               |
| **Componentes** | PascalCase               | `<DistributionRulesPanel>`, `<DistributionSimulator>` |
| **Hooks**       | camelCase + `use`        | `useDistributionSettings`, `useDistributionHistory`   |
| **Pasta**       | kebab-case               | `distribution/`, `engine/`                            |
| **Git commits** | Conventional Commits     | `feat(distribution): add 5-criteria routing engine`   |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                         | Descrição                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------- |
| **Engine é puro**                 | Sem side effects, sem chamadas a providers. Recebe dados, retorna decisão       |
| **Cascata, não pesos**            | Ordem importa, primeira regra que matcha vence — auditável e legível            |
| **Carteira sagrada**              | Critério padrão sempre ligado; desligar requer aviso forte                      |
| **SDR como rede de segurança**    | Fora do horário ou ninguém disponível → SDR atende                              |
| **Trace completo**                | Cada decisão tem `candidatesEvaluated[]` com TODOS avaliados, mesmo descartados |
| **Modo manual = pausa do engine** | Em manual, conversa fica em fila aguardando atribuição humana                   |

### Orientações Gerais

| Aspecto                            | Orientação                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| **Função pura no engine**          | Não chamar providers de dentro do engine — receber tudo via parâmetros                   |
| **Round-robin persistente**        | `lastAssignedSellerId` em settings garante revezamento real (não aleatório)              |
| **Toggle de disponibilidade**      | Adicionar ao avatar dropdown do TopBar (PRD-003); persistir via `sellersProvider.update` |
| **Filtro de fila**                 | Visível apenas para Owner/Gestor na inbox (PRD-010)                                      |
| **Drag-and-drop critérios**        | `@dnd-kit/sortable` é simples e acessível; evitar libs pesadas                           |
| **Mensagem de fora do expediente** | Criar bubble do tipo `system` (PRD-011), não confundir com mensagem real                 |
| **Simulador determinístico**       | Mesma entrada produz mesmo resultado — útil para Owner testar mudanças antes de aplicar  |

### O que NÃO Fazer

| ❌ Evitar                                                                                            |
| ---------------------------------------------------------------------------------------------------- |
| Implementar transferência de carteira aqui — é PRD-018                                               |
| Implementar escalonamento SDR → humano — é PRD-023                                                   |
| Acoplar engine ao provider mock (chamadas diretas) — usar dependency injection                       |
| Permitir Gestor editar regras (apenas Owner)                                                         |
| Esquecer audit log em mudanças de regras                                                             |
| Usar `Math.random()` no round-robin — quebra determinismo                                            |
| Distribuir conversa fora do expediente para vendedor humano sem aviso                                |
| Permitir desligar TODOS os critérios (sempre haver fallback ativo)                                   |
| Esquecer notificação ao vendedor (toast + badge)                                                     |
| Misturar UI de PRD-019 (Configurações gerais) — usar sub-rota dedicada `/configuracoes/distribuicao` |

---

## Status de Implementação

| Campo      | Valor                 |
| ---------- | --------------------- |
| **Status** | ✅ IMPLEMENTADO       |
| **Data**   | 2026-05-26            |
| **Versão** | v0.10.0 — Switchboard |

---

## Histórico

| Data       | Versão | Alteração                                                                            |
| ---------- | ------ | ------------------------------------------------------------------------------------ |
| 25/05/2026 | v1     | Criação inicial — engine de 5 critérios, painel admin, simulador, histórico auditado |

---

**AILA - Sistemas Inteligentes**
