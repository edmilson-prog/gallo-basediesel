# Distribuição e Roteamento (PRD-013)

> Engine puro que decide quem atende cada conversa nova. Implementado em `src/features/distribution/`. Operado pelo Owner em `/app/configuracoes/distribuicao`.

---

## Visão geral

Quando uma conversa nova entra na plataforma, o engine percorre uma **cascata configurável de critérios** e produz uma decisão:

- vendedor humano específico (`selectedSellerId`)
- SDR (`isSdrActive: true`, `assignedSellerId: null`)
- fila (`status: "aguardando"`, sem vendedor nem SDR)

Cada decisão gera um `IDistributionTrace` auditável — possível responder "por que essa conversa foi para Carlos?" meses depois.

## Modos de operação

| Modo               | Comportamento                                                                |
| ------------------ | ---------------------------------------------------------------------------- |
| `automatic`        | Cascata completa, ordem configurável                                         |
| `hybrid` (default) | Carteira respeitada; demais conversas vão ao SDR                             |
| `sdr_first`        | SDR atende toda conversa nova; humano só sob escalonamento (PRD-023)         |
| `manual`           | Engine pausado; conversas órfãs aguardam atribuição humana (`fallback_fila`) |

## Cascata de critérios

Ordem default (reordenável pelo Owner):

1. **carteira** — cliente com `sellerId` definido vai direto para ele, mesmo offline.
2. **especialidade** — keywords da primeira mensagem casam com vendedor especialista online.
3. **round_robin** — revezamento determinístico via `lastAssignedSellerId`.
4. **carga** — vendedor online com menor número de conversas abertas.
5. **fallback** — SDR assume; sem SDR, conversa entra em fila.

Cada critério tem um toggle on/off. **Fallback nunca é desligado** (rede de segurança final). Desligar carteira gera aviso forte.

## Horário comercial

`IBusinessHoursWindow[]` em `IPlatformSettings.distribution.businessHours` define janelas semanais. Default: seg-sex 8h-18h + sábado 8h-12h.

Fora do horário, o engine força `isSdrActive: true` e cria uma bubble do tipo `system` com a mensagem configurada em `offHoursMessage`.

## Arquitetura

```
src/features/distribution/
├── engine/
│   ├── distribute.ts       ← orchestrador puro
│   ├── criteria.ts         ← tryCarteira, tryEspecialidade, ...
│   ├── utils.ts            ← isWithinBusinessHours, selectByLoad, ...
│   ├── types.ts            ← IDistributionInput, IDistributionContext, IDistributionResult
│   └── index.ts
├── components/
│   ├── ModeSection.tsx
│   ├── CriteriaSection.tsx
│   ├── BusinessHoursSection.tsx
│   ├── OffHoursMessageSection.tsx
│   ├── QueuePolicySection.tsx
│   ├── DistributionSimulator.tsx
│   ├── DistributionHistory.tsx
│   └── AvailabilityToggle.tsx
├── hooks/
│   ├── useDistributionSettings.ts
│   └── useDistributionToasts.ts
└── pages/
    └── DistributionRulesPanel.tsx
```

## Engine puro

```typescript
function distributeConversation(
  input: IDistributionInput,
  context: IDistributionContext,
): IDistributionResult;
```

**Determinístico.** Mesma entrada → mesma saída. Round-robin usa `lastAssignedSellerId` persistente, nunca `Math.random()`.

**Sem side effects.** Não chama providers, não mutaSettings. O orchestrador (mock provider em Fase 1, Edge Function em Fase 2) consome o resultado e:

- persiste a conversa via `upsert("conversations", …)`
- persiste o `IDistributionTrace` via `distributionTracesApi.create(…)`
- emite `auditLog({ action: "conversation.create", … })`
- avança `lastAssignedSellerId` na settings quando o critério vencedor foi `round_robin`

**Compatível com Fase 2.** A função pura pode ser chamada tanto do mock provider quanto, mais tarde, de uma Edge Function do Supabase recebendo webhook do WhatsApp.

## Trace de decisão

```typescript
IDistributionTrace {
  id, conversationId, customerId?, leadId?, storeId,
  timestamp,
  selectedSellerId,       // null para SDR ou fila
  criterionMatched,       // 'carteira' | 'especialidade' | 'round_robin' | 'carga' | 'fallback_sdr' | 'fallback_fila'
  candidatesEvaluated,    // todos avaliados, mesmo descartados
  mode                    // modo na hora da decisão
}
```

`candidatesEvaluated[]` inclui **todos** os vendedores avaliados pelo critério vencedor, com motivo de inclusão/exclusão — base do histórico e do simulador.

## Disponibilidade do vendedor

`ISeller.availability ∈ { online, ausente, ocupado, offline }`. Apenas `online` recebe distribuição automática. Vendedor controla via avatar dropdown na TopBar (componente `AvailabilityToggle`).

Mudanças de disponibilidade geram `auditLog({ action: "seller.availability.update", … })`.

## Fila de espera

Conversas órfãs (`assignedSellerId: null && status === "aguardando" && !isSdrActive`):

- aparecem na inbox com badge "Em fila" amarelo
- são filtráveis via opção "Em fila" no `AssignmentFilter` (visível a Owner/Gestor)

Política de fila: `queueTimeoutMinutes` (default 30). _Watchdog real será implementado quando a inbox passar a operar com WhatsApp em Fase 2._

## Notificação ao vendedor

`useDistributionToasts()` (montado em `AppLayout`) polla `distributionTracesProvider` filtrado por `selectedSellerId === currentUser.sellerId`. Cada trace novo dispara um toast com botão "Ver" navegando para `/app/atendimento/$id`.

Na Fase 2 a polling vira Supabase Realtime subscription na tabela `distribution_traces` — API do hook permanece a mesma.

## Permissões

| Papel       | Acessa painel | Edita regras | Vê histórico   | Muda disponibilidade |
| ----------- | ------------- | ------------ | -------------- | -------------------- |
| Owner       | ✅            | ✅           | ✅             | Própria + outros     |
| Gestor      | ❌            | ❌           | ✅ (via inbox) | Própria + outros     |
| Vendedor    | ❌            | ❌           | ❌             | Própria              |
| SDR/Cliente | ❌            | ❌           | ❌             | —                    |

Gate: `requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" })`.

## Defaults da loja matriz

Definidos em `src/mocks/data/seedDistribution.ts`:

- `mode: "hybrid"`
- todos os critérios ativos, ordem padrão (carteira → especialidade → round_robin → carga → fallback)
- horário comercial seg-sex 8h-18h + sáb 8h-12h
- `queueTimeoutMinutes: 30`
- `specialtyKeywords`: marcas pesadas + termos de peças (volvo, scania, freio, motor, …)

## Mock vs Supabase

`mockConversationsProvider.create(input)` consome o engine. O stub Supabase (`supabaseConversationsProvider.create`) lança `NotImplementedError` até a Fase 2 — preserva o contrato sem custo de implementação prematura.

---

**Fase 2 (PRD-100+):** o engine é portado para Edge Function reagindo ao webhook do WhatsApp. O contrato `IDistributionInput`/`IDistributionResult` permanece e a porta da camada cliente (`useDistributionTracesProvider`) só troca polling por subscription.
