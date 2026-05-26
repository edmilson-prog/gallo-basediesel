# PRD-020: Simulação de Conversa SDR ↔ Cliente

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                        |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                             |
| **Objetivo**          | Construir o agente SDR (Sales Development Representative) com IA simulada no MVP — fluxo guiado de qualificação de leads e clientes, mensagens via templates substituíveis, roteamento por necessidade, e estrutura preparada para LangChain/LLM real na Fase 2 |
| **Tipo**              | Feature                                                                                                                                                                                                                                                         |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                            |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                               |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                            |
| **Épico**             | Bloco 2 — SDR (Agente IA 24/7)                                                                                                                                                                                                                                  |
| **PRDs Relacionados** | PRD-010 (Inbox), PRD-011 (Conversa), PRD-013 (Distribuição), PRD-017 (Pipeline), PRD-021 (Identificação de Peça), PRD-022 (Orçamento via SDR), PRD-023 (Escalonamento), PRD-024 (Painel SDR)                                                                    |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                              |
| **Padrão de código**  | Feature-based; código em `src/features/sdr/`; engine em `src/features/sdr/engine/`; templates em `src/features/sdr/templates/`                                                                                                                                  |

### Critérios de Complexidade Utilizados

> **Justificativa de Alta:** engine de conversação com estado (sessão SDR por conversa), 5 templates configuráveis com substituição de variáveis, máquina de estados com transições (saudação → identificação → necessidade → ação), integração com 4 PRDs (021, 022, 023, 024), painel de simulação interativo para Owner/Gestor testar fluxos sem afetar produção, métricas básicas, e arquitetura preparada para troca futura por LangChain/OpenAI sem refatoração das features que consomem o SDR.

---

## Contexto do Problema

A GALLO BASE DIESEL atende WhatsApp 8h-18h (horário comercial). Clientes mandam mensagem às 22h, no fim de semana, no feriado — e ficam sem resposta. Três cenários típicos:

**Cliente B2B com urgência fora do horário.** Caminhoneiro parado na estrada às 23h precisa de freio. Manda mensagem para a GALLO. Sem ninguém respondendo, ele liga pra concorrente. Venda perdida por falta de presença 24/7. **Lead frio nunca qualificado.** Cliente novo manda mensagem sábado de manhã "qual o preço do filtro?". Segunda-feira ninguém lembra de responder. Cliente já comprou em outro lugar. **Vendedor afogado com perguntas básicas.** Vendedor humano de plantão recebe 20 mensagens, 15 são "qual o horário?" ou "vocês entregam em [cidade]?". Tempo de qualidade desperdiçado.

O **SDR** resolve isso: agente IA que atende 24/7, faz qualificação básica (quem é, o que precisa, quanto tem), responde perguntas frequentes, e escala para humano quando há valor real ou complexidade. É a "primeira camada" antes do vendedor humano.

No MVP, o SDR é **simulado** — máquina de estados com templates de mensagem, sem IA real. A arquitetura prepara substituição por LangChain/OpenAI na Fase 2 sem refatoração das integrações.

---

## Conceito da Solução

### O que o SDR faz

| Capacidade                       | MVP (simulado)                                                              | Fase 2 (LLM real)                       |
| -------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| **Saudação**                     | Template + variável `{{nome_cliente}}`                                      | LLM gera texto natural                  |
| **Identificação**                | Pergunta sequencial (nome → empresa → telefone)                             | LLM extrai do contexto                  |
| **Reconhecer necessidade**       | Pattern matching simples (keywords: "peça", "preço", "frete", "humano")     | LLM classifica intenção                 |
| **Identificar peça**             | Atalho para PRD-021 com keywords parciais                                   | LLM analisa texto livre + imagens       |
| **Gerar orçamento**              | Atalho para PRD-022 quando peça identificada + cliente confirma             | LLM negocia condições                   |
| **Escalar para humano**          | Quando reconhece "humano", "vendedor", "ajuda" ou via regra de complexidade | LLM detecta nuance                      |
| **Responder FAQ**                | Templates fixos por keyword                                                 | LLM responde com base em knowledge base |
| **Pausa por intervenção humana** | Quando vendedor envia mensagem `out`, SDR pausa automaticamente             | Mesma lógica                            |

### Máquina de estados (engine MVP)

O SDR mantém estado por conversa em `ISdrSession`:

```typescript
ISdrSession {
  id: ID;
  conversationId: ID;
  state: 'saudacao' | 'identificacao' | 'qualificacao' | 'roteamento' | 'aguardando_humano' | 'pausado' | 'finalizado';
  collectedData: {
    name?: string;
    company?: string;
    phone?: string;
    needs?: string;       // captura textual da necessidade
    identifiedPart?: ID;  // se PRD-021 identificou
    quoteId?: ID;          // se PRD-022 gerou
  };
  lastActivityAt: ISO8601;
  startedAt: ISO8601;
  finishedAt?: ISO8601;
  finishReason?: 'escalated' | 'completed' | 'abandoned' | 'paused_by_human';
}
```

Transições:

```
saudacao → identificacao → qualificacao → roteamento
                                              ↓
                              ┌───────────────┼────────────────┐
                              ↓               ↓                ↓
                       identifica peça   FAQ template    escala humano
                       (PRD-021)        responde         (PRD-023)
                              ↓
                      gera orçamento
                      (PRD-022)
                              ↓
                       aguarda decisão
                              ↓
                    aceita / recusa / escalar
```

Estado `pausado` é especial: quando vendedor humano envia mensagem `out` na conversa, SDR pausa automaticamente (`isSdrActive: false`). Pode ser reativado manualmente.

### Templates de mensagem

`IPlatformSettings.sdrTemplates` é um array de templates:

```typescript
ISdrTemplate {
  id: ID;
  trigger: 'saudacao' | 'identificacao_nome' | 'identificacao_empresa' | 'pergunta_necessidade' | 'faq_horario' | 'faq_entrega' | 'escalacao_humano' | 'despedida';
  text: string;          // ex: "Olá {{nome}}! Sou o assistente da GALLO BASE DIESEL. Como posso ajudar?"
  variables: string[];   // ['nome']
}
```

Substituição: `{{nome}}` é trocado por valor de `collectedData.name` ou fallback ("amigo").

Templates default:

- **saudacao**: "Olá! 👋 Sou o assistente da GALLO BASE DIESEL. Atendemos 24/7 para te ajudar com peças e serviços para diesel pesado. Como posso te ajudar?"
- **identificacao_nome**: "Pra começar, qual seu nome?"
- **identificacao_empresa**: "Você é cliente PJ ou pessoa física? Se PJ, qual a empresa?"
- **pergunta_necessidade**: "Me conta o que você precisa hoje. Qual peça ou serviço?"
- **faq_horario**: "Nosso horário comercial é de segunda a sexta, 8h às 18h. Mas o atendimento aqui no WhatsApp é 24/7! 🚀"
- **faq_entrega**: "Atendemos toda a região Sul com entrega expressa em Frederico Westphalen e municípios próximos. Para outras localidades, peço seu CEP que verifico prazo e frete."
- **escalacao_humano**: "Beleza, {{nome}}! Vou te conectar com um dos nossos vendedores especialistas. Aguarda só um instante."
- **despedida**: "Foi um prazer, {{nome}}! Qualquer coisa, é só mandar mensagem aqui. GALLO BASE DIESEL — sua peça pesada de confiança. 💪"

### Reconhecimento de intenção (MVP via keywords)

Quando cliente envia mensagem `in`, engine analisa:

| Keywords                                                                    | Intenção                       | Ação                                                       |
| --------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| "horário", "horarios", "atendimento", "aberto"                              | FAQ horário                    | Responde template `faq_horario`                            |
| "entrega", "frete", "envio", "região"                                       | FAQ entrega                    | Responde template `faq_entrega`                            |
| "humano", "vendedor", "atendente", "pessoa", "alguém"                       | Escalar                        | Inicia fluxo PRD-023                                       |
| "peça", "preciso", "comprar", "tem o", marca de veículo (Volvo/Scania/etc.) | Identificar peça               | Inicia fluxo PRD-021                                       |
| "orçamento", "valor", "preço", "quanto custa"                               | Gerar orçamento                | Se peça já identificada, PRD-022; senão pede identificação |
| Outros                                                                      | Coletar texto livre em `needs` | Avança para próxima etapa do estado                        |

Pattern matching é simples (lowercase + includes); preparado para troca por classificador LLM na Fase 2.

### Pausa automática por intervenção humana

Quando uma mensagem `out` é enviada por vendedor (`authorType='seller'`) em conversa com `isSdrActive: true`:

- Sistema marca `isSdrActive: false` automaticamente
- `ISdrSession.state = 'pausado'`
- `ISdrSession.finishReason = 'paused_by_human'`
- Audit log: "SDR pausado por intervenção humana"

Vendedor pode reativar SDR manualmente via menu ⋮ da conversa (PRD-011 "Pausar/Reativar SDR").

### Painel de simulação (Owner/Gestor)

Rota `/app/configuracoes/sdr/simulador` — interface tipo "playground" onde Owner/Gestor pode:

- Simular conversa cliente ↔ SDR sem afetar produção
- Ver estado atual da sessão (`state`, `collectedData`)
- Ver template selecionado em cada turno
- Ver intenção detectada por keyword
- Inspecionar trace completo

Útil para validar templates antes de ativar; para debugging quando algo não funciona; para demonstração a clientes.

### Métricas básicas (alimentam PRD-024)

- Total de conversas atendidas pelo SDR no período
- Taxa de escalação para humano (% conversas que escalam vs resolvem)
- Tempo médio de sessão SDR
- Tempo médio até primeira resposta do SDR
- Taxa de FAQ resolvidas sem escalar
- Volume por hora (heatmap fora do horário comercial — onde SDR brilha)

Detalhes da visualização: PRD-024.

### Integração com fluxo principal

| Quando                                                  | Comportamento                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| Conversa nova chega fora do horário comercial (PRD-013) | SDR assume com `isSdrActive: true`                            |
| Conversa nova chega no horário sem vendedor disponível  | SDR assume                                                    |
| Modo "SDR-first" (PRD-013)                              | SDR sempre atende primeiro                                    |
| Vendedor envia mensagem `out` em conversa com SDR ativo | SDR pausa                                                     |
| Cliente pede humano                                     | SDR escala via PRD-023                                        |
| Mensagens do SDR aparecem na inbox e conversa           | Distinguidas visualmente (badge "🤖 SDR" — PRD-010 e PRD-011) |

### Alternativas Consideradas

| Alternativa                                | Por que foi descartada                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| LLM real desde o MVP                       | Custo, complexidade, dependência externa; mock simulado valida UX e fluxo |
| SDR responde apenas FAQ (sem qualificação) | Perde captura de leads — ponto central da proposta                        |
| SDR sempre ativo (sem pausa)               | Conflito com vendedor humano; pausa automática é essencial                |
| Templates apenas em texto sem variáveis    | Mensagens viram robóticas demais ("Olá usuário"); variáveis humanizam     |
| Sem máquina de estados                     | Conversa vira improviso; engine precisa de progressão clara               |
| Reconhecimento por regex complexa          | Mais frágil que keyword simples; LLM resolve melhor na Fase 2             |
| Painel de simulação fora do app            | Mantém no app facilita acesso e contexto                                  |
| Sem audit log de mensagens do SDR          | SDR é decisão de produto — rastreio obrigatório                           |

**Decisão consolidada:** **máquina de estados explícita, 8+ templates com variáveis, pattern matching simples para intenção, pausa automática por intervenção, painel de simulação, métricas integradas, arquitetura troca-LLM-na-Fase-2 sem refatorar consumidores.**

---

## Escopo

### Incluído

- ✅ Modelo `ISdrSession` e `ISdrTemplate` em `src/shared/types/sdr.ts`
- ✅ Engine `sdrRespond(message, session)` em `src/features/sdr/engine/respond.ts` — função pura que recebe input e retorna ação
- ✅ Máquina de estados implementada com 7 estados (saudacao → identificacao → qualificacao → roteamento → aguardando_humano → pausado → finalizado)
- ✅ 8 templates default editáveis via `IPlatformSettings.sdrTemplates` (PRD-019 já tem placeholder)
- ✅ Sistema de substituição de variáveis (`{{nome}}` etc.)
- ✅ Pattern matching para 6 categorias de intenção
- ✅ Integração com `mockConversationsProvider`: quando mensagem `in` chega em conversa com `isSdrActive: true`, engine processa e gera mensagem `out` com `authorType: 'sdr'`
- ✅ Pausa automática quando vendedor envia mensagem `out`
- ✅ Botão "Reativar SDR" no menu ⋮ da conversa (PRD-011) — quando pausado
- ✅ Painel de simulação `/app/configuracoes/sdr/simulador` interativo
- ✅ Trace de cada turno (intenção detectada, template selecionado, variáveis usadas)
- ✅ Integração com PRD-021 (identificar peça) — função `identifyPart(text, session)` retorna candidatos
- ✅ Integração com PRD-022 (gerar orçamento) — função `createQuote(session)` quando peça e cliente confirmados
- ✅ Integração com PRD-023 (escalonamento) — função `escalateToHuman(session, reason)`
- ✅ Audit log em transições de estado e ações geradas pelo SDR
- ✅ Geradores de mock: 20 ISdrSession históricas com mix de estados (escalated, completed, abandoned)
- ✅ Permissões: Owner edita templates; Gestor visualiza simulador; Vendedor recebe conversas escaladas

### Excluído

- ❌ LLM real (OpenAI, Anthropic, etc.) — Fase 2
- ❌ Transcrição de áudio para texto — Fase 2
- ❌ Análise de imagens (foto de peça) — Fase 2
- ❌ Knowledge base personalizada do cliente — Fase 2
- ❌ Aprendizado contínuo / fine-tuning — Fase 2
- ❌ A/B testing de templates — Fase 2
- ❌ Multi-idioma — MVP só português
- ❌ Personalidade configurável (formal/casual) — fixa no MVP
- ❌ Memória cross-conversa (lembrar do cliente em conversas futuras) — Fase 2
- ❌ Sugestão de respostas para vendedor humano usando contexto SDR — Fase 2 (mas placeholder em PRD-011 já existe)

---

## Requisitos Funcionais

### Modelo

- **RF-001:** Adicionar `ISdrSession` em `src/shared/types/sdr.ts` com campos especificados em "Máquina de estados".
- **RF-002:** Adicionar `ISdrTemplate` em mesma localização.
- **RF-003:** Estender `IPlatformSettings` com `sdrTemplates: ISdrTemplate[]` e `sdrEnabled: boolean`.
- **RF-004:** Mocks (PRD-004) geram 8 templates default e 20 sessões SDR históricas em estados variados.

### Engine

- **RF-005:** Criar `sdrRespond(input, session, settings)` em `src/features/sdr/engine/respond.ts` como função **pura**.
- **RF-006:** Entrada: mensagem do cliente (`IMessage`), sessão atual (`ISdrSession`), settings da plataforma.
- **RF-007:** Saída: objeto `ISdrResponse`:
  ```typescript
  ISdrResponse {
    nextState: ISdrSession['state'];
    actions: ISdrAction[];        // mensagens a enviar + transições + escaladas
    updatedCollectedData: Partial<ISdrSession['collectedData']>;
    trace: {
      detectedIntent: string;
      templateUsed: string;
      variablesUsed: Record<string, string>;
      candidatesEvaluated: string[];
    };
  }
  ```
- **RF-008:** Implementar 7 transições de estado conforme máquina especificada.
- **RF-009:** Implementar pattern matching por keywords com 6 categorias de intenção (preparado para troca por LLM).

### Templates e variáveis

- **RF-010:** Helper `renderTemplate(template, variables)` em `src/features/sdr/templates/`:
  - Substitui `{{nome}}` por `variables.nome` ou fallback (`'amigo'`)
  - Suporta múltiplas variáveis em um mesmo template
  - Variáveis ausentes → fallback ou string vazia conforme configuração
- **RF-011:** Lista de templates default em `src/features/sdr/templates/defaults.ts`.
- **RF-012:** Permitir Owner editar templates via `/app/configuracoes/sdr/templates` (PRD-019 sub-rota placeholder; aqui torna funcional como parte do bloco SDR).

### Integração com providers

- **RF-013:** Modificar `mockConversationsProvider.create()` para que conversas atribuídas ao SDR (`isSdrActive: true`) disparem `sdrRespond()` imediatamente.
- **RF-014:** Quando mensagem `in` chega em conversa com SDR ativo, hook `useSdrResponder()` detecta via Zustand subscription e chama engine.
- **RF-015:** Resposta do SDR é inserida no mock store como `IMessage` com `direction='out'`, `authorType='sdr'`, `status='sent'` → fluxo de status normal (delivered, read).

### Pausa por intervenção humana

- **RF-016:** Implementar hook `useSdrPauseOnHumanIntervention()`:
  - Subscreve a mutations de mensagens
  - Quando detecta `out` com `authorType='seller'` em conversa com `isSdrActive: true`:
    - Atualiza `isSdrActive: false`
    - `ISdrSession.state = 'pausado'`, `finishReason = 'paused_by_human'`
    - Cria bubble `system` na conversa: "🤖 SDR pausado por intervenção humana"
    - Audit log
- **RF-017:** Botão "Reativar SDR" no menu ⋮ da conversa (PRD-011) — visível quando session existe com state `'pausado'`. Click reativa.

### Pattern matching de intenção

- **RF-018:** Implementar `detectIntent(text)` em `src/features/sdr/engine/intent.ts`:
  - Recebe texto da mensagem
  - Lowercase + trim
  - Verifica em ordem: humano > peça > orçamento > FAQ horário > FAQ entrega > qualquer outro (texto livre)
  - Retorna `{ intent: string; confidence: number; matchedKeywords: string[] }`
- **RF-019:** Confidence é 1.0 para match exato de keyword; menor se múltiplas categorias batem (no MVP, sempre vence a primeira da ordem).

### Painel de simulação

- **RF-020:** Criar `SdrSimulatorPage` em `src/features/sdr/pages/`, rota `/app/configuracoes/sdr/simulador`.
- **RF-021:** Layout em 2 colunas:
  - **Esquerda**: conversa simulada — bubbles tipados como PRD-011, input para enviar mensagem como "cliente"
  - **Direita**: inspetor — estado atual da sessão, intent detectada, template usado, variáveis substituídas, trace
- **RF-022:** Botão "Reiniciar simulação" zera estado e começa nova sessão.
- **RF-023:** Botão "Salvar como caso de teste" (placeholder Fase 2 — pode ser salvo localmente no MVP).
- **RF-024:** Acesso: Owner/Gestor.

### Métricas (alimentam PRD-024)

- **RF-025:** Hook `useSdrMetrics(filters)` calcula:
  - `totalSessions`: contagem no período
  - `escalationRate`: % com `finishReason='escalated'`
  - `completionRate`: % com `finishReason='completed'`
  - `avgSessionDuration`: média de `finishedAt - startedAt`
  - `avgFirstResponseTime`: tempo entre criação da conversa e primeira mensagem SDR (deve ser < 5s no mock)
  - `faqResolutionRate`: % das sessões que resolveram FAQ sem escalar
  - `outOfHoursVolume`: % das sessões iniciadas fora do horário comercial

### Audit log

- **RF-026:** Audit em:
  - Início de sessão SDR (`action='sdr_session_start'`)
  - Transição de estado (`action='sdr_state_transition'`, com before/after)
  - Escalação (`action='sdr_escalate'` — referenciado em PRD-023)
  - Pausa por humano (`action='sdr_paused_by_human'`)
  - Reativação manual (`action='sdr_reactivated'`)
  - Identificação de peça (referenciado em PRD-021)
  - Geração de orçamento (referenciado em PRD-022)

### Permissões

- **RF-027:** Owner edita templates + acessa simulador + vê métricas.
- **RF-028:** Gestor acessa simulador + vê métricas (read-only).
- **RF-029:** Vendedor recebe conversas escaladas e vê histórico SDR distinguido (já em PRD-011).
- **RF-030:** SDR atua "como user" virtual com permissions específicas (ler conversas atribuídas, escrever mensagens out, criar leads, escalar). Implementado via "user ID virtual" mockado.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Resposta do SDR aparece em < 1.5s após mensagem do cliente (simulando processamento "natural"; mock pode randomizar 800ms-1500ms).
- **RNF-002 (Função pura):** Engine determinístico — mesma entrada, mesma saída (exceto randomização proposital de delay).
- **RNF-003 (Tipagem):** Zero `any`; estados union literal; templates tipados.
- **RNF-004 (Compatibilidade Fase 2):** Engine recebe contexto via parâmetros; troca para `langchainRespond()` na Fase 2 sem mudar consumidores.
- **RNF-005 (Audit):** Cada turno do SDR gera trace inspecionável; útil para debug de produção.

---

## Critérios de Aceitação

### Engine e máquina de estados

```gherkin
DADO uma conversa nova com isSdrActive=true e session em state="saudacao"
QUANDO cliente envia primeira mensagem "oi"
ENTÃO SDR responde com template saudacao + identificacao_nome
  E state avança para "identificacao"
  E audit log registra transição

DADO session em "identificacao" e collectedData.name vazio
QUANDO cliente envia "João"
ENTÃO SDR salva collectedData.name="João"
  E avança para próxima pergunta (empresa ou necessidade)
  E template usado tem variável {{nome}} substituída por "João"
```

### Reconhecimento de intenção

```gherkin
DADO state="qualificacao"
QUANDO cliente envia "preciso de filtro de óleo pro meu Volvo"
ENTÃO detectIntent retorna intent="identificar_peca"
  E SDR aciona fluxo PRD-021 com text completo
  E inspetor mostra keywords detectadas: ["preciso", "Volvo"]

QUANDO cliente envia "quero falar com vendedor"
ENTÃO detectIntent retorna intent="escalar_humano"
  E SDR envia template escalacao_humano
  E aciona PRD-023 (escalonamento)
  E state vira "finalizado" com finishReason="escalated"

QUANDO cliente envia "qual o horário?"
ENTÃO detectIntent retorna intent="faq_horario"
  E SDR responde template faq_horario
  E continua disponível para próxima pergunta
```

### Pausa automática

```gherkin
DADO conversa com SDR ativo (isSdrActive=true) e session em qualquer state
QUANDO vendedor envia mensagem out com authorType="seller"
ENTÃO isSdrActive vira false
  E session.state="pausado", finishReason="paused_by_human"
  E bubble system aparece: "🤖 SDR pausado por intervenção humana"
  E audit log registra

DADO conversa pausada (session em "pausado")
QUANDO vendedor clica "Reativar SDR" no menu ⋮
ENTÃO isSdrActive volta para true
  E session.state retorna ao último state antes de pausar
  E bubble system: "🤖 SDR reativado"
```

### Painel de simulação

```gherkin
DADO que sou Owner e acesso /app/configuracoes/sdr/simulador
QUANDO digito "oi, preciso de peça" como cliente
ENTÃO vejo bubble do cliente à esquerda
  E após delay simulado, vejo resposta do SDR
  E na direita vejo: state="qualificacao", intent="identificar_peca", template="pergunta_necessidade", variáveis={}
  E trace completo expansível

DADO simulação em progresso
QUANDO clico "Reiniciar simulação"
ENTÃO conversa limpa, session nova criada em state="saudacao"
```

### Métricas

```gherkin
DADO 100 sessões SDR mockadas em últimos 30 dias
  E 35 com finishReason="escalated", 50 "completed", 15 "abandoned"
QUANDO useSdrMetrics({periodo:'30d'}) é chamado
ENTÃO retorna totalSessions=100, escalationRate=35%, completionRate=50%
  E avgSessionDuration calculado corretamente
```

### Cenários de erro

```gherkin
DADO template default ausente (Owner deletou todos)
QUANDO SDR tenta responder
ENTÃO fallback "Olá! Como posso ajudar?" é usado
  E log de warning gerado

DADO cliente envia mensagem em modo unknown intent
QUANDO engine não casa com nenhuma intent
ENTÃO SDR avança state coletando texto livre em needs
  E pergunta complementar do template "pergunta_necessidade"

DADO conversa fica > 30 minutos sem interação
QUANDO engine detecta inatividade
ENTÃO session.state vira "finalizado" com finishReason="abandoned"
  E SDR envia despedida polida
```

---

## Fases de Implementação

| Fase | Objetivo                                                     | Arquivos Estimados |
| ---- | ------------------------------------------------------------ | ------------------ |
| 1    | Modelo, engine puro, templates, máquina de estados           | 8-10               |
| 2    | Integração com mock provider (mensagens automáticas) + pausa | 4-5                |
| 3    | Painel de simulação interativo                               | 5-6                |
| 4    | Métricas + audit + integração com PRDs 021/022/023 (stubs)   | 4-5                |
| 5    | Polish, edição de templates, mobile, acessibilidade          | 3-4                |

### Detalhamento das Fases

#### Fase 1: Engine e Templates

**Objetivo:** núcleo funcional sem UI

**Ações:**

- [ ] Criar tipos `ISdrSession`, `ISdrTemplate`, `ISdrResponse`, `ISdrAction`
- [ ] Implementar `sdrRespond()` como função pura
- [ ] Implementar `detectIntent()` com pattern matching
- [ ] Implementar `renderTemplate()` com substituição de variáveis
- [ ] 8 templates default em `defaults.ts`
- [ ] Estender `IPlatformSettings` com `sdrTemplates` e `sdrEnabled`
- [ ] Testes manuais via console

**Validação:** chamar `sdrRespond()` com 10 cenários e validar saídas.

#### Fase 2: Integração com Provider

**Objetivo:** SDR responde automaticamente na inbox

**Ações:**

- [ ] Hook `useSdrResponder()` subscreve mutations de mensagens
- [ ] Quando mensagem `in` chega em conversa com `isSdrActive=true`, dispara engine
- [ ] Inserir mensagem `out` no mock store via provider
- [ ] Status visual: enviando → sent → delivered → read (delays mockados)
- [ ] Hook `useSdrPauseOnHumanIntervention()` pausa quando vendedor envia
- [ ] Botão "Reativar SDR" no menu ⋮ da conversa (PRD-011)
- [ ] Audit log de transições

**Validação:** abrir conversa com SDR ativo, enviar como cliente, ver resposta automática.

#### Fase 3: Painel de Simulação

**Objetivo:** ferramenta de validação e demo

**Ações:**

- [ ] `SdrSimulatorPage` em duas colunas
- [ ] Esquerda: réplica do `<ConversationLayout>` colunaa central simplificado
- [ ] Direita: inspetor com state, intent, template, trace
- [ ] Botões: Reiniciar, Salvar como caso de teste (placeholder), Editar templates (atalho)
- [ ] Acesso restrito a Owner/Gestor

**Validação:** simular várias conversas; inspetor mostra dados certos.

#### Fase 4: Métricas e Integrações Stub

**Objetivo:** preparação para os outros PRDs do Bloco 2

**Ações:**

- [ ] Hook `useSdrMetrics()` calculando 7 métricas
- [ ] Stubs para `identifyPart()` (PRD-021), `createQuote()` (PRD-022), `escalateToHuman()` (PRD-023)
- [ ] Audit log padronizado em todas ações SDR
- [ ] Mocks com 20 sessões variadas

**Validação:** métricas batem com mocks; stubs são chamados nos fluxos corretos.

#### Fase 5: Polish

**Objetivo:** produção-ready

**Ações:**

- [ ] Edição de templates funcionando via `/app/configuracoes/sdr/templates`
- [ ] Validação de variáveis nos templates (alerta se template usa `{{nome}}` mas variável não existe)
- [ ] Mobile responsivo do simulador
- [ ] Acessibilidade WCAG AA
- [ ] Fallback robusto se template ausente
- [ ] Documentação `docs/sdr.md`

**Validação:** editar template e ver mudança nos próximos turnos; mobile usável.

---

## Dependências

### PRDs Anteriores

| PRD                                              | Status      |
| ------------------------------------------------ | ----------- |
| PRD-002 (modelo)                                 | 📝 Redigido |
| PRD-005 (provider)                               | 📝 Redigido |
| PRD-006 (audit)                                  | 📝 Redigido |
| PRD-010 (inbox — badge SDR)                      | 📝 Redigido |
| PRD-011 (conversa — bubbles SDR + menu reativar) | 📝 Redigido |
| PRD-013 (distribuição — SDR como fallback)       | 📝 Redigido |

### Dependências Futuras (placeholders no MVP)

| PRD                         | Como Lidar                                               |
| --------------------------- | -------------------------------------------------------- |
| PRD-021 (identificar peça)  | Stub que retorna placeholder; integração real no PRD-021 |
| PRD-022 (orçamento via SDR) | Stub que retorna placeholder; integração real no PRD-022 |
| PRD-023 (escalonamento)     | Stub que retorna placeholder; integração real no PRD-023 |
| PRD-024 (painel SDR)        | Métricas já implementadas aqui; visualização no PRD-024  |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Título                | Status       |
| ------ | ------------ | --------------------- | ------------ |
| 1-10   | PRDs 010-019 | Bloco 1 — CRM         | 📝           |
| **11** | **PRD-020**  | **Simulação SDR**     | **🔄 ATUAL** |
| 12     | PRD-021      | Identificação de Peça | ⏳           |
| 13     | PRD-022      | Orçamento via SDR     | ⏳           |
| 14     | PRD-023      | Escalonamento         | ⏳           |
| 15     | PRD-024      | Painel SDR            | ⏳           |

---

## Considerações de Segurança

### SDR não cria compromissos

SDR no MVP não confirma valores finais nem condições especiais — apenas qualifica e indica orçamento (que precisa de aprovação humana na conversão real). Mensagens deixam isso claro.

### Audit total

Cada turno do SDR registra trace completo. Em caso de problema (cliente reclama "o robô prometeu desconto"), trace mostra exatamente o que foi dito.

### LGPD

SDR coleta nome, empresa, telefone, necessidade. Esses dados ficam em `collectedData` da sessão e podem alimentar criação de lead (PRD-017). Consentimento padrão WhatsApp.

### Pausa por humano é sagrada

Quando vendedor entra, SDR pausa imediatamente. Sem race condition entre SDR e vendedor enviando simultâneo.

---

## Fluxos de Usuário

### Fluxo Principal — Cliente novo fora do horário

1. Sábado 22h: cliente novo manda "oi, preciso de filtro pro meu Volvo"
2. Conversa criada com SDR ativo (PRD-013 — fora horário)
3. Engine processa:
   - State `saudacao` → envia template saudacao + identificacao_nome
   - Espera resposta
4. Cliente: "João da Frota Express"
5. SDR salva nome, avança para qualificacao
6. Detecta intent `identificar_peca` (já capturado na primeira mensagem)
7. Aciona PRD-021 (stub): "Você falou de filtro pro Volvo. Que modelo e ano?"
8. Cliente: "R450 2020"
9. PRD-021 identifica peça candidata, PRD-022 gera orçamento
10. SDR envia: "Filtro de óleo Volvo R450 2020: R$ 95 + frete. Quer fechar?"
11. Cliente: "Pode ser, mas quero falar com vendedor"
12. Detecta intent `escalar_humano` → aciona PRD-023
13. Segunda-feira 8h: vendedor recebe conversa escalada com contexto

### Fluxo Alternativo — Vendedor intervém

1. SDR está respondendo cliente sobre frete
2. Vendedor Carlos abre a conversa, decide assumir
3. Carlos envia: "Oi João! Sou Carlos da GALLO, vou te ajudar"
4. Sistema detecta mensagem `out` de seller → pausa SDR
5. Bubble system: "🤖 SDR pausado por intervenção humana"
6. Carlos continua humano

### Fluxo de Simulação — Owner testa template

1. João Gallo (Owner) edita template `saudacao` para versão mais formal
2. Acessa simulador
3. Envia "oi" como cliente fake
4. Vê nova saudação aplicada
5. Inspetor mostra: template `saudacao_v2` usado, variável `{{nome}}` substituída por fallback
6. Aprova mudança, salva configuração

---

## Convenções de Código

| Elemento        | Convenção              | Exemplo                                                           |
| --------------- | ---------------------- | ----------------------------------------------------------------- |
| **Engine**      | camelCase, função pura | `sdrRespond()`, `detectIntent()`, `renderTemplate()`              |
| **Componentes** | PascalCase             | `<SdrSimulatorPage>`, `<SdrInspector>`                            |
| **Hooks**       | camelCase + `use`      | `useSdrResponder`, `useSdrMetrics`                                |
| **Tipos**       | PascalCase com `I`     | `ISdrSession`, `ISdrTemplate`, `ISdrResponse`                     |
| **Pasta**       | kebab-case             | `sdr/`, `engine/`, `templates/`                                   |
| **Git commits** | Conventional           | `feat(sdr): add simulated agent with state machine and templates` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                      | Descrição                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------- |
| **Engine puro**                | Recebe contexto, retorna decisão; sem side effects                              |
| **Mock simula realidade**      | Delays, variações de timing, falha eventual — parecendo real                    |
| **Pausa por humano é sagrada** | Sem race condition; vendedor sempre vence                                       |
| **Templates com variáveis**    | Humanizam; fallback obrigatório                                                 |
| **Audit total**                | Cada turno rastreado para debug                                                 |
| **Preparado para LLM**         | Substituir `sdrRespond` por `langchainRespond` na Fase 2 sem mudar consumidores |

### O que NÃO Fazer

| ❌ Evitar                                                |
| -------------------------------------------------------- |
| Implementar LLM real no MVP                              |
| Permitir SDR rodar sem template (fallback obrigatório)   |
| Esquecer pausa quando vendedor envia                     |
| Engine com side effects (chamar provider direto)         |
| SDR confirmar compromissos comerciais sem revisão humana |
| Esquecer audit log em transições                         |
| Templates sem variáveis (vira robótico demais)           |
| Implementar PRDs 021/022/023 aqui — stubs apenas         |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                            |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — agente SDR com máquina de estados, templates substituíveis, pattern matching de intenção, painel de simulação, métricas integradas |

---

**AILA - Sistemas Inteligentes**
