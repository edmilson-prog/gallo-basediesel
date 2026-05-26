# PRD-023: Escalonamento para Vendedor com Resumo de Contexto

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                            |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                 |
| **Objetivo**          | Construir o handoff estruturado do SDR para vendedor humano — escolha inteligente do destinatário, resumo de contexto enviado, indicadores visuais e métricas para medir qualidade do escalonamento |
| **Tipo**              | Feature                                                                                                                                                                                             |
| **Complexidade**      | Alta                                                                                                                                                                                                |
| **Total de Fases**    | 5                                                                                                                                                                                                   |
| **Prioridade**        | Alta                                                                                                                                                                                                |
| **Épico**             | Bloco 2 — SDR (Agente IA 24/7)                                                                                                                                                                      |
| **PRDs Relacionados** | PRD-010 (Inbox), PRD-011 (Conversa), PRD-013 (Distribuição), PRD-020 (SDR), PRD-021 (Identificação), PRD-022 (Orçamento), PRD-024 (Painel SDR)                                                      |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                  |
| **Padrão de código**  | Feature-based; código em `src/features/sdr-escalation/`; reutiliza engine de distribuição (PRD-013)                                                                                                 |

### Critérios de Complexidade

> **Justificativa de Alta:** integração transversal entre SDR (PRD-020), distribuição (PRD-013), inbox (PRD-010) e conversa (PRD-011); composição automática de resumo de contexto multi-fonte (sessão SDR + identificação de peça + orçamento + dados do cliente + veículo); 3 modos de escalonamento (urgent/normal/standard) com workflows distintos; lógica de fila quando ninguém disponível com timeout configurável; bubble system formatado destacando handoff; indicador visual prominente na inbox + conversa para o vendedor recém-atribuído; métricas de tempo até primeiro atendimento humano alimentando PRDs 014 e 024.

---

## Contexto do Problema

SDR fez seu trabalho — qualificou, identificou peça, gerou orçamento. Agora o cliente quer falar com humano (pediu ou foi detectado em negociação — PRD-022). Sem handoff estruturado, três problemas concretos:

**Vendedor recebe a conversa "no escuro".** Cliente já contou tudo ao SDR. Vendedor abre, vê 20 mensagens, precisa ler tudo para entender o contexto. Cliente espera 5 minutos enquanto vendedor lê. Pior: pergunta de novo o que já foi respondido. **Distribuição arbitrária.** Conversa pode cair em qualquer vendedor — mesmo um especialista em Mercedes recebendo cliente que pediu Volvo. **Sem visibilidade de origem.** Vendedor não sabe que a conversa foi escalada pelo SDR; mistura na inbox com conversas comuns; perde a urgência implícita.

Três soluções:

**Resumo de contexto automático.** Quando SDR escala, gera bloco visual no início (system bubble) com: cliente, veículo, peça, orçamento gerado, motivo do escalonamento. Vendedor abre e em 5 segundos sabe tudo. **Escolha inteligente do destinatário.** Reutiliza engine do PRD-013 — respeita carteira, especialidade, disponibilidade. Se SDR identificou Volvo, prioriza vendedor com `specialties` Volvo. **Indicadores visuais.** Badge "Escalado pelo SDR" no item da inbox e no header da conversa. Cor diferente do borda esquerda. Toast com urgência maior.

---

## Conceito da Solução

### Modos de escalonamento

| Modo       | Quando                                               | Comportamento                                                                                        |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `urgent`   | Cliente solicitou explicitamente + horário comercial | Distribuição imediata; toast prominente; notifica todos os vendedores online se ninguém pegou em 30s |
| `normal`   | Negociação detectada / dúvida complexa               | Distribuição normal via engine; toast padrão                                                         |
| `standard` | Sem urgência (cliente pediu vendedor genericamente)  | Distribuição normal; SDR responde "Vou conectar com vendedor — pode demorar alguns minutos"          |

### Trigger

PRD-020 (SDR) chama `escalateToHuman(session, reason)` em 3 cenários:

1. Cliente pediu explicitamente (intent `escalar_humano` detectado em mensagem)
2. Negociação detectada (PRD-022 detecta intent `negotiate`)
3. SDR falhou em entender 3 vezes seguidas (intent `unknown` repetido)

### Modelo

```typescript
ISdrEscalation {
  id: ID;
  sessionId: ID;             // ISdrSession.id
  conversationId: ID;
  customerId?: ID;
  leadId?: ID;
  reason: 'customer_requested' | 'negotiation_detected' | 'sdr_failed' | 'complexity' | 'out_of_scope';
  reasonDetails?: string;
  contextSummary: ISdrContextSummary;
  mode: 'urgent' | 'normal' | 'standard';
  assignedSellerId?: ID;
  assignedAt?: ISO8601;
  firstHumanResponseAt?: ISO8601;
  status: 'pending' | 'assigned' | 'answered' | 'abandoned';
  storeId: ID;
  createdAt: ISO8601;
}

ISdrContextSummary {
  customerName?: string;
  customerCompany?: string;
  customerPhone: string;
  isB2B: boolean;
  vehicleIdentified?: { brand: string; model: string; year?: number; engine?: string };
  partIdentified?: { id: ID; name: string; oemCode?: string; isOriginal: boolean };
  quoteGenerated?: { id: ID; total: Money; validUntil: ISO8601; status: string };
  conversationLength: number;
  timeInSdr: number;          // segundos desde início da sessão
  collectedData: Record<string, unknown>;
  sdrTrace: { step: string; timestamp: ISO8601; details?: string }[];
}
```

### Escolha do vendedor destinatário

Reutiliza o engine de distribuição do **PRD-013** com pequenas adaptações:

1. **Carteira**: se conversa tem `customerId` E customer tem `sellerId`, vai para ele (mesmo se ausente — preserva relacionamento). Se ele está offline, sistema avisa via toast quando voltar.
2. **Especialidade**: se SDR identificou marca/modelo do veículo, busca vendedor com `specialties` matching.
3. **Round-robin / Carga**: se carteira e especialidade não casam, segue cascata normal.
4. **Fallback fila**: ninguém disponível → fica em fila com badge urgência.

Diferença do PRD-013 normal: **sempre prioriza vendedores online** sobre os ausentes (exceto carteira). Modo `urgent` força essa preferência.

### Resumo de contexto — bubble system

Quando escalonamento acontece, sistema cria bubble `authorType='system'` formatado:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 ESCALADO PELO SDR

👤 Cliente: João Silva (Frota Express)
   📞 (55) 99999-9999
   Tipo: B2B

🚛 Veículo identificado:
   Volvo R450 — 2020 — Motor DC13

🔧 Peça solicitada:
   Filtro de óleo Volvo (cód. 21380488)
   Original

💰 Orçamento gerado:
   Total: R$ 145,00 (incluindo frete)
   Válido até: 01/06/2026

❓ Motivo do escalonamento:
   Cliente pediu desconto

⏱ Tempo em atendimento SDR:
   4 minutos (12 mensagens)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Bubble fica destacado visualmente na conversa (PRD-011 já tem `SystemBubble`).

### Indicadores visuais

- **Item da inbox**: badge "🤖 Escalado pelo SDR" próximo ao nome do cliente; borda esquerda em cor especial (`--brand-parts` verde para "novo escalonamento") por 60s
- **Header da conversa**: badge prominente abaixo do nome
- **Toast ao vendedor**: "Nova conversa escalada pelo SDR — [Nome do cliente]" com botão "Atender agora"

### Modo Urgent — fluxo especial

Para `urgent`:

1. Distribuição tenta atribuir ao vendedor "natural" (carteira/especialidade)
2. Se ele está offline ou não responde em 30s → notifica todos os vendedores online da loja
3. Primeiro a clicar "Atender" assume; outros recebem aviso "Já foi atendido"
4. Audit log de quem assumiu

### Fila quando ninguém disponível

Igual ao PRD-013 — conversa fica em fila com badge "Em fila" + nova flag "Escalada SDR". Owner é notificado se demora mais que `IPlatformSettings.escalationQueueTimeoutMinutes` (default 5 minutos para urgent, 30 para normal).

### Métricas

Geradas e alimentam PRD-014 (Painel Gestor) e PRD-024 (Painel SDR):

- **Tempo médio até primeiro atendimento humano** (TTFR = Time To First Response): `firstHumanResponseAt - assignedAt`
- **Taxa de abandono pós-escalonamento**: % de escalações onde cliente não respondeu mais
- **Taxa de conversão pós-escalonamento**: % que viraram pedido após handoff
- **Acerto da especialidade**: % das escalações onde vendedor escolhido tinha specialty matching

### Comunicação ao cliente

SDR não some sem se despedir. Mensagem antes do handoff:

```
🤖 Beleza, João! Vou conectar você com nosso vendedor especialista.

📋 Resumo do que conversamos:
• Filtro de óleo Volvo R450 2020
• Orçamento: R$ 145,00

Aguarda só um instante, ele vai assumir a conversa agora.
```

### Alternativas Consideradas

| Alternativa                                     | Por que foi descartada                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Sem resumo de contexto                          | Vendedor lê tudo do zero — perde 2-3 minutos por escalonamento |
| Distribuição puramente round-robin              | Carteira deve ser respeitada; especialidade economiza tempo    |
| Sem modos de escalação                          | Urgent e standard precisam ter comportamentos distintos        |
| Sem fallback para fila                          | Conversa órfã durante escalonamento é catastrófica             |
| Cliente recebe handoff silencioso               | Cliente espera 2min sem saber → liga concorrente               |
| Sem indicador visual no item da inbox           | Vendedor não percebe urgência implícita                        |
| Modo urgent sempre notificando todos vendedores | Spam interno; só se primeiro não responder em 30s              |
| Bubble system simples sem estrutura             | Sem hierarquia visual, vira "outra mensagem"                   |

**Decisão consolidada:** **3 modos de escalonamento, resumo de contexto estruturado em bubble system formatado, escolha respeitando carteira → especialidade → engine PRD-013, indicadores visuais em múltiplos lugares, comunicação clara ao cliente, métricas de TTFR.**

---

## Escopo

### Incluído

- ✅ Modelo `ISdrEscalation` em `src/shared/types/sdr-escalation.ts`
- ✅ Modelo `ISdrContextSummary` agregando dados de sessão SDR, cliente, veículo, peça, orçamento
- ✅ Função `escalateToHuman(session, reason, mode?)` em `src/features/sdr-escalation/engine/escalate.ts`
- ✅ Helper `buildContextSummary(session, conversation, customer)` que compõe o resumo
- ✅ Helper `chooseHumanSeller(context)` reutilizando engine do PRD-013 com adaptações
- ✅ Renderizador `renderEscalationBubble(summary)` que formata o bubble system
- ✅ 3 modos de escalonamento (`urgent`, `normal`, `standard`) com workflows distintos
- ✅ Modo `urgent`: notifica todos os vendedores online se primeiro não responder em 30s
- ✅ Fallback para fila quando ninguém disponível, com timeout configurável
- ✅ Mensagem ao cliente antes do handoff (template configurável)
- ✅ Indicadores visuais:
  - Badge "🤖 Escalado pelo SDR" no item da inbox (PRD-010)
  - Badge prominente no header da conversa (PRD-011)
  - Toast prominente para vendedor recém-atribuído
  - Borda especial por 60s
- ✅ Auditoria automática (`action='sdr_escalate'`) com motivo, modo, sellerId escolhido, contexto
- ✅ Métricas: TTFR, taxa de abandono pós-handoff, taxa de conversão, acerto de especialidade
- ✅ Geradores de mock: 30 IS drEscalations históricas em variados estados
- ✅ Integração com PRD-020 (SDR) — chamada `escalateToHuman()` em 3 cenários
- ✅ Integração com PRD-022 (orçamento) — chamada quando negociação detectada
- ✅ Permissões: SDR escala; Vendedor recebe; Owner/Gestor visualizam métricas e histórico

### Excluído

- ❌ Notificação push para celular do vendedor — Fase 2
- ❌ Roteamento por habilidade de negociação (vendedor especialista em fechar) — Fase 2 com IA
- ❌ Reescalonamento automático (vendedor não respondeu, passa para outro) — Fase 2; no MVP apenas urgent broadcasta
- ❌ Escalonamento entre lojas (vendedor da matriz pega conversa de filial sem licença) — Fase 2
- ❌ Sugestão automática de resposta para vendedor (baseada em contexto SDR) — Fase 2 com IA
- ❌ Cliente solicitar vendedor específico — Fase 2
- ❌ Aprovação por Gestor antes do handoff (workflow) — fora do MVP
- ❌ Histórico de "vendedores que mais recebem escalações" — pode entrar no PRD-024 mas não aqui

---

## Requisitos Funcionais

### Modelo

- **RF-001:** Adicionar `ISdrEscalation` e `ISdrContextSummary` em `src/shared/types/sdr-escalation.ts`.
- **RF-002:** Adicionar em `IPlatformSettings`:
  - `escalationQueueTimeoutMinutesUrgent: number` (default 5)
  - `escalationQueueTimeoutMinutesNormal: number` (default 30)
  - `escalationCustomerHandoffTemplate: string` (template da mensagem ao cliente antes do handoff)
  - `escalationUrgentBroadcastDelaySeconds: number` (default 30)

### Engine de escalação

- **RF-003:** Criar `escalateToHuman(input): IEscalationResult` em `src/features/sdr-escalation/engine/escalate.ts`:
  - Recebe: `{ session, reason, mode?, context }`
  - Detecta modo automaticamente se não fornecido: `customer_requested` → `urgent` se em horário; `negotiation_detected` → `normal`; outros → `standard`
  - Retorna: `{ escalation, assignedSellerId?, queueStatus?, audit }`
- **RF-004:** Função pura — sem side effects; mutations executadas pelo consumidor.

### Composição do resumo

- **RF-005:** Criar `buildContextSummary(session, conversation, customer): ISdrContextSummary`:
  - Coleta dados do `ISdrSession.collectedData`
  - Inclui peça identificada (se `identifiedPart`)
  - Inclui orçamento gerado (se `quoteId`)
  - Inclui veículo identificado
  - Calcula `conversationLength` (mensagens), `timeInSdr` (segundos)
  - Inclui trace dos passos do SDR (estados percorridos)

### Escolha do vendedor

- **RF-006:** Criar `chooseHumanSeller(escalationInput): ID | null` em `src/features/sdr-escalation/engine/choose-seller.ts`:
  - Reusa cascata do PRD-013 com adaptações:
    - **Carteira**: se cliente tem `sellerId`, prioriza
    - **Especialidade**: se peça identificada com marca, busca vendedor com `specialties` matching
    - **Disponibilidade prioritária**: prefere `online` > `ausente` > `ocupado` (offline excluído)
    - **Modo urgent**: força preferência por `online` (até carteira pode ser substituída se titular offline)
  - Retorna sellerId ou null (fila)

### Renderização do bubble

- **RF-007:** Criar `renderEscalationBubble(summary): string` em `src/features/sdr-escalation/templates/render.ts`.
- **RF-008:** Template default conforme exemplo em "Conceito da Solução":
  - Cabeçalho destacado "🤖 ESCALADO PELO SDR"
  - Seções: cliente, veículo, peça, orçamento, motivo, tempo
  - Renderização condicional: se peça não identificada, omite seção
- **RF-009:** Bubble é criado via `messagesProvider.create()` com `authorType='system'`, `content=resumo formatado`.

### Mensagem ao cliente

- **RF-010:** Antes do handoff, SDR envia mensagem ao cliente usando template `escalationCustomerHandoffTemplate`:

  ```
  🤖 Beleza, {{nome}}! Vou conectar você com nosso vendedor especialista.

  📋 Resumo do que conversamos:
  {{resumo_curto}}

  Aguarda só um instante, ele vai assumir a conversa agora.
  ```

- **RF-011:** `resumo_curto` é versão compacta do contextSummary (1-2 linhas).

### Fluxo completo

- **RF-012:** Quando `escalateToHuman()` é chamado:
  1. Constrói `contextSummary`
  2. Detecta modo (`urgent`/`normal`/`standard`)
  3. Chama `chooseHumanSeller()` para destinatário
  4. SDR envia mensagem ao cliente (RF-010)
  5. Cria bubble system com resumo (RF-008)
  6. Atualiza conversa: `assignedSellerId = sellerEscolhido`, `isSdrActive = false`
  7. ISdrSession.finishReason = 'escalated'
  8. Cria `ISdrEscalation` registro
  9. Notifica vendedor escolhido (toast + badge)
  10. Audit log

### Modo Urgent — broadcast

- **RF-013:** Em modo `urgent`, após atribuir ao vendedor escolhido:
  - Timer de `escalationUrgentBroadcastDelaySeconds` (30s default)
  - Se vendedor não enviar mensagem `out` nesse prazo, broadcast para todos vendedores online
  - Broadcast mostra alerta especial: "URGENTE: conversa aguardando há 30s"
  - Primeiro a clicar "Atender" assume; outros recebem "Já foi atendido"
- **RF-014:** Audit log de broadcasts e de quem assumiu.

### Fila quando ninguém disponível

- **RF-015:** Se `chooseHumanSeller()` retorna null:
  - `escalation.assignedSellerId = null`, `status='pending'`
  - Conversa fica em fila (visível no inbox com badge especial)
  - Timer monitora: após `escalationQueueTimeoutMinutes*` (5 ou 30), audit log de timeout e notificação ao Owner

### Indicadores visuais

- **RF-016:** Atualizar PRD-010 (Inbox):
  - Item de conversa escalada tem badge "🤖 Escalado" próximo ao nome
  - Borda esquerda em `--brand-parts` por 60s após chegada
  - Filtro adicional: "Escaladas pelo SDR"
- **RF-017:** Atualizar PRD-011 (Conversa):
  - Badge prominente no header: "🤖 Esta conversa foi escalada pelo SDR"
  - Bubble system renderizado no início do histórico (visível ao scrollar até o topo)
- **RF-018:** Toast prominente:
  - Texto: "Nova conversa escalada pelo SDR — [Nome do cliente]"
  - Botão "Atender agora" navega direto à conversa
  - Toast modo urgent tem cor + animação especial

### Reativação do SDR

- **RF-019:** Quando vendedor envia primeira mensagem `out`:
  - `escalation.firstHumanResponseAt = now`
  - `escalation.status = 'answered'`
  - Audit log

### Abandono

- **RF-020:** Se vendedor não responde em 10 minutos após assignedAt, status fica `pending` (não muda); se cliente envia mensagem nesse intervalo, marca como `urgent` retroativamente; após 1 hora sem resposta humana, status vira `'abandoned'`.

### Métricas

- **RF-021:** Hook `useEscalationMetrics(filters)`:
  - TTFR médio (Time To First Response)
  - Taxa de abandono pós-escalonamento (% `abandoned`)
  - Taxa de conversão (% que viraram pedido após handoff — depende PRD-032)
  - Acerto de especialidade (% onde vendedor escolhido tinha specialty matching)
  - Volume por modo
- **RF-022:** Consumido por PRD-014 (Painel Gestor — alerta) e PRD-024 (Painel SDR — visualização).

### Permissões

- **RF-023:** SDR (user virtual) cria escalations.
- **RF-024:** Vendedor recebe + responde.
- **RF-025:** Owner/Gestor visualizam histórico + métricas.

### Audit log

- **RF-026:** Audit em:
  - Criação de escalation (`action='sdr_escalate'`)
  - Atribuição de vendedor (`action='sdr_escalate_assign'`)
  - Broadcast urgent (`action='sdr_escalate_broadcast'`)
  - Vendedor responde (`action='sdr_escalate_answered'`)
  - Timeout fila (`action='sdr_escalate_queue_timeout'`)
  - Abandono (`action='sdr_escalate_abandoned'`)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** `escalateToHuman()` executa em < 50ms (lookups locais).
- **RNF-002 (Determinismo):** Mesmo input produz mesma escolha de vendedor.
- **RNF-003 (Atomicidade):** Mudança de `assignedSellerId`, `isSdrActive`, criação de bubble e mensagem ao cliente devem ser atômicas (transação no mock).
- **RNF-004 (Tipagem):** Zero `any`.
- **RNF-005 (Memorização):** TTFR e taxas recalculam apenas quando dados-fonte mudam.

---

## Critérios de Aceitação

### Escolha de vendedor

```gherkin
DADO sessão SDR com customer cuja sellerId=Carlos
QUANDO chooseHumanSeller() executa
ENTÃO retorna Carlos (carteira respeitada)
  E independe de disponibilidade no modo normal/standard

DADO sessão sem customer (lead) mas com peça Volvo identificada
  E Marina tem specialties=["Volvo"] e está online
QUANDO chooseHumanSeller() executa
ENTÃO retorna Marina

DADO sessão sem customer + sem especialidade + Carlos com menor carga
QUANDO chooseHumanSeller() executa
ENTÃO segue cascata PRD-013 → Carlos

DADO todos os vendedores offline em modo urgent
QUANDO chooseHumanSeller() executa
ENTÃO retorna null
  E escalation status = 'pending', vai para fila
```

### Resumo de contexto

```gherkin
DADO sessão SDR completa: customer "Frota Express" B2B + veículo Volvo R450 + peça filtro óleo + orçamento R$ 145
QUANDO buildContextSummary() executa
ENTÃO retorna ISdrContextSummary com todas as seções preenchidas
  E conversationLength refletindo mensagens reais
  E timeInSdr em segundos correto

DADO sessão sem peça identificada (cliente pediu humano direto)
QUANDO buildContextSummary executa
ENTÃO retorna summary sem partIdentified
  E renderEscalationBubble omite seção de peça
```

### Renderização do bubble

```gherkin
DADO contextSummary com customer "João" + veículo + peça + orçamento
QUANDO renderEscalationBubble() executa
ENTÃO retorna texto formatado com:
  - cabeçalho "🤖 ESCALADO PELO SDR"
  - todas as seções condicionais preenchidas
  - separadores visuais
```

### Modo urgent — broadcast

```gherkin
DADO escalation modo urgent atribuída a Carlos
  E Carlos não envia mensagem out em 30s
QUANDO timer expira
ENTÃO sistema dispara broadcast para todos vendedores online
  E todos veem notificação "URGENTE: conversa aguardando há 30s"
  E primeiro a clicar "Atender" se atribui ao escalation
  E demais recebem "Já foi atendido por [vendedor]"
  E audit log de broadcast e quem assumiu

DADO Carlos responde em 20s
QUANDO firstHumanResponseAt é registrado
ENTÃO escalation.status='answered'
  E timer cancelado, sem broadcast
```

### Mensagem ao cliente

```gherkin
DADO escalation acontece
QUANDO SDR envia template ao cliente
ENTÃO mensagem contém saudação personalizada + resumo curto + "aguarda um instante"
  E é bubble out com authorType='sdr'

DADO bubble system de resumo é criado em seguida
QUANDO vendedor abre a conversa
ENTÃO vê o resumo formatado visivelmente no histórico
  E header tem badge "🤖 Esta conversa foi escalada pelo SDR"
```

### Indicadores

```gherkin
DADO escalation chega para Carlos
QUANDO ele está em outra tela
ENTÃO recebe toast: "Nova conversa escalada pelo SDR — [Nome]"
  E botão "Atender agora" navega para a conversa
  E na inbox, item tem badge "🤖 Escalado" + borda especial por 60s

DADO modo urgent
QUANDO toast aparece
ENTÃO tem cor/animação especial (mais prominente)
```

### Fila e timeout

```gherkin
DADO escalation modo urgent em fila
  E ninguém atende por 5 minutos
QUANDO timer dispara
ENTÃO audit log com action='sdr_escalate_queue_timeout'
  E Owner é notificado

DADO escalation modo normal em fila
  E ninguém atende por 30 minutos
QUANDO timer dispara
ENTÃO mesma notificação
```

### Métricas

```gherkin
DADO 100 escalations em 30 dias
  E 80 com firstHumanResponseAt preenchido
  E média de (firstHumanResponseAt - assignedAt) = 3.5 min
QUANDO useEscalationMetrics() executa
ENTÃO retorna TTFR=3.5min
  E abandonRate = 20% (20 sem resposta)
  E specialtyHitRate calculado corretamente
```

### Cenários de erro

```gherkin
DADO sessão sem dados mínimos (cliente novo, sem nada coletado)
QUANDO escalateToHuman é chamado
ENTÃO escalation criada com contextSummary mínimo (só telefone + tempo no SDR)
  E bubble system mostra "Cliente novo, sem dados completos coletados"

DADO chooseHumanSeller falha por exceção
QUANDO erro acontece
ENTÃO escalation entra em fila (status='pending')
  E audit log de erro
  E SDR informa cliente: "Tive uma dificuldade técnica, mas seu pedido está registrado"
```

---

## Fases de Implementação

| Fase | Objetivo                                                    | Arquivos Estimados |
| ---- | ----------------------------------------------------------- | ------------------ |
| 1    | Modelo, engine de escalação, choose-seller                  | 5-6                |
| 2    | Build context summary + render bubble + mensagem ao cliente | 4-5                |
| 3    | Integração com PRD-010/011 (badges, toast, indicadores)     | 4-5                |
| 4    | Modo urgent broadcast + fila + timeouts                     | 4-5                |
| 5    | Métricas + polish + integração com PRDs 020/022             | 3-4                |

### Detalhamento das Fases

#### Fase 1: Engine

- [ ] Tipos `ISdrEscalation`, `ISdrContextSummary`
- [ ] Settings em `IPlatformSettings`
- [ ] `escalateToHuman()` função pura
- [ ] `chooseHumanSeller()` reusando engine PRD-013
- [ ] Testes manuais via console com 5 cenários

#### Fase 2: Contexto e Mensagens

- [ ] `buildContextSummary()` agregando dados
- [ ] `renderEscalationBubble()` com template
- [ ] Template `escalationCustomerHandoffTemplate`
- [ ] SDR envia mensagem ao cliente antes do bubble system

#### Fase 3: Indicadores Visuais

- [ ] Atualizar PRD-010 (Inbox): badge, borda especial, filtro "Escaladas"
- [ ] Atualizar PRD-011 (Conversa): badge no header
- [ ] Toast ao vendedor com botão "Atender agora"
- [ ] Animação especial para modo urgent

#### Fase 4: Urgent Broadcast e Fila

- [ ] Timer de 30s após atribuição urgent
- [ ] Broadcast quando timer expira
- [ ] Primeiro a clicar assume; outros bloqueados
- [ ] Fila quando ninguém disponível
- [ ] Timeouts configuráveis com notificação Owner

#### Fase 5: Métricas e Integração Final

- [ ] Hook `useEscalationMetrics()` com 4 métricas
- [ ] Integração com PRD-020 (chamada em 3 cenários)
- [ ] Integração com PRD-022 (chamada em negociação)
- [ ] Mocks com 30 escalations históricas
- [ ] Audit log completo
- [ ] Documentação `docs/sdr-escalation.md`

---

## Dependências

### PRDs Anteriores

| PRD                              | Status      |
| -------------------------------- | ----------- |
| PRD-002                          | 📝 Redigido |
| PRD-010 (Inbox)                  | 📝 Redigido |
| PRD-011 (Conversa)               | 📝 Redigido |
| PRD-013 (Distribuição — reusada) | 📝 Redigido |
| PRD-020 (SDR engine)             | 📝 Redigido |
| PRD-021 (Identificação)          | 📝 Redigido |
| PRD-022 (Orçamento)              | 📝 Redigido |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Status       |
| ------ | ------------ | ------------ |
| 1-13   | PRDs 010-022 | 📝           |
| **14** | **PRD-023**  | **🔄 ATUAL** |
| 15     | PRD-024      | ⏳           |

---

## Considerações de Segurança

### Resumo de contexto contém PII

ContextSummary inclui nome, telefone, empresa, peça identificada. Bubble fica visível na conversa — RBAC do PRD-006 já protege (apenas quem tem permissão de ver a conversa vê o bubble).

### Modo urgent não viola permissões

Broadcast urgente envia notificação aos vendedores online — apenas dentro da loja correta. Audit log de quem assumiu para garantir comissão.

### Atomicidade do handoff

Mudança de `assignedSellerId`, `isSdrActive`, mensagem ao cliente, bubble system — todas devem acontecer juntas. Se uma falha, todas falham (transaction no mock).

---

## Fluxos de Usuário

### Fluxo Principal — Negociação detectada

1. Cliente recebe quote do SDR (PRD-022)
2. Responde "tem por menos?"
3. PRD-022 detecta `negotiate` → chama `escalateToHuman(session, 'negotiation_detected', 'normal')`
4. Engine constrói contextSummary completo
5. chooseHumanSeller seleciona Carlos (carteira do cliente)
6. SDR envia mensagem: "Beleza, João! Vou conectar com vendedor especialista..."
7. Bubble system criado com resumo
8. assignedSellerId = Carlos, isSdrActive = false
9. Carlos recebe toast + badge na inbox
10. Carlos abre a conversa, vê resumo, em 30s assume o atendimento
11. firstHumanResponseAt registrado, escalation.status='answered'

### Fluxo Urgent — Cliente solicita explicitamente

1. Cliente em conversa SDR: "quero falar com vendedor agora!"
2. PRD-020 detecta intent `escalar_humano` → chama `escalateToHuman(..., mode='urgent')`
3. Atribui ao Carlos (carteira)
4. Carlos está offline
5. Modo urgent força reatribuição ao vendedor disponível com mais carga compatível: Marina
6. Marina recebe toast com cor especial
7. Marina não responde em 30s
8. Broadcast: notificação para Pedro, Rafael e Carlos (online)
9. Rafael clica "Atender" primeiro → assume
10. Marina e Pedro recebem "Já foi atendido por Rafael"

### Fluxo Fila — Fora do horário

1. Sábado 23h: SDR atendeu, cliente pede humano
2. Ninguém online
3. Escalation cai em fila (status='pending')
4. SDR responde: "Vou conectar com vendedor, mas como é fora do horário, ele responderá segunda. Posso te ajudar com mais alguma coisa?"
5. Segunda 8h: Carlos abre app, vê escalation aguardando há 33h
6. Audit log de queue_timeout (timeout urgent foi 5min, mas escalation foi marcada como `standard`, timeout 30min — disparou no domingo)
7. Carlos assume, responde ao cliente

### Fluxo de Erro — Cliente abandona

1. Escalation atribuída ao Carlos
2. Carlos não responde
3. Cliente também não envia mais nada em 1 hora
4. Status vira `'abandoned'`
5. Audit log
6. Métricas refletem (taxa de abandono +1)

---

## Convenções de Código

| Elemento        | Convenção             | Exemplo                                                                       |
| --------------- | --------------------- | ----------------------------------------------------------------------------- |
| **Engine**      | camelCase função pura | `escalateToHuman()`, `buildContextSummary()`, `chooseHumanSeller()`           |
| **Componentes** | PascalCase            | `<EscalationBadge>`, `<EscalationToast>`                                      |
| **Hooks**       | camelCase + `use`     | `useEscalationMetrics`, `useUrgentBroadcast`                                  |
| **Pasta**       | kebab-case            | `sdr-escalation/`, `engine/`, `templates/`                                    |
| **Git commits** | Conventional          | `feat(sdr-escalation): add handoff with context summary and urgent broadcast` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                             | Descrição                                         |
| ------------------------------------- | ------------------------------------------------- |
| **Vendedor não começa do zero**       | Resumo de contexto economiza minutos por conversa |
| **Especialidade economiza erro**      | Vendedor matching peça é mais eficiente           |
| **Modo urgent não vira spam**         | Broadcast só após 30s sem resposta do escolhido   |
| **Cliente não fica em vácuo**         | Mensagem antes do handoff garante feedback        |
| **Atomicidade**                       | Múltiplas mutations devem ser transação           |
| **Métricas alimentam outros painéis** | TTFR é insight gerencial crítico                  |

### O que NÃO Fazer

| ❌ Evitar                                                           |
| ------------------------------------------------------------------- |
| Atribuir conversa sem contextSummary                                |
| Bubble system genérico ("escalada pelo SDR") sem dados estruturados |
| Modo urgent sempre fazendo broadcast (vira spam)                    |
| Reescalonar automaticamente para outro vendedor (Fase 2)            |
| Esquecer mensagem ao cliente antes do handoff                       |
| Pular validação de disponibilidade                                  |
| Permitir SDR continuar respondendo após handoff                     |
| Implementar push notification real — Fase 2                         |
| Esquecer audit log em qualquer transição                            |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                               |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — handoff estruturado SDR → humano com resumo de contexto, escolha inteligente do vendedor, 3 modos, broadcast urgent, fila com timeout |

---

**AILA - Sistemas Inteligentes**
