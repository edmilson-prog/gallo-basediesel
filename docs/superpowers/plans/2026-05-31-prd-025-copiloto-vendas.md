# PRD-025 Copiloto de Vendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a superfície do Copiloto de Vendas (orientação privada ao vendedor) na tela de atendimento, com 3 variantes alternáveis por parâmetro (default `strip`), briefing/resumo reaproveitados e sugestões por regra determinística — tudo mock, sem LLM.

**Architecture:** Provider Pattern em `src/providers/data/` (contrato + mock + stub supabase + hook + factory) consumido por uma feature em `src/features/copilot/`. O `MockCopilotProvider.getPanelData(conversationId)` compõe o painel lendo as fontes únicas existentes (conversa, mensagens, cliente, escalonamento SDR) e roda 3 regras puras (R1/R2/R3). A UI consome via `useCopilotPanel` e renderiza a variante resolvida por `VITE_COPILOT_PLACEMENT`.

**Tech Stack:** React + Vite + TypeScript (strict) + Tailwind v4 + shadcn/ui + Iconify. Gerenciador: `bun`.

**Verificação (adaptada ao projeto):** este repositório **não tem suíte de testes** (ver `CLAUDE.md`: "type-check é coberto pelo `noEmit` do `tsc` via `bun run build`"). Portanto o gate de cada tarefa é **`bun run build`** (type-check estrito) + **`bun run lint`**, e as tarefas de UI fecham com **validação manual** no app (o usuário testa a UI manualmente — não abrir preview de browser para validar). As regras R1/R2/R3 são funções puras com casos de aceite descritos para conferência manual. Não adicionar framework de teste (o `bunfig.toml` impõe guarda de supply-chain de 24h; novos pacotes exigem confirmação).

**Referências de design:** `docs/prds/PRD-025-copiloto-vendas.md` (PRD) · `docs/superpowers/specs/2026-05-31-prd-025-copiloto-design.md` (spec de design) · `docs/html/gallo-copiloto-mockup2.html` e o protótipo evoluído `.superpowers/brainstorm/2181-1780264417/content/copiloto-variantes.html` (CSS/estrutura visual exatos a portar para Tailwind + tokens semânticos).

---

## Mapa de arquivos

| Arquivo                                                            | Responsabilidade                                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types/copilot.ts`                                      | tipos do domínio (`ICopilotSuggestion`, `ICopilotBriefing`, `ICopilotSummary`, `ICopilotPanelData`, `CopilotPlacement`)      |
| `src/shared/types/index.ts`                                        | barrel — re-exporta os tipos do copiloto                                                                                     |
| `src/providers/data/contracts/copilot.ts`                          | `ICopilotProvider`                                                                                                           |
| `src/providers/data/contracts/index.ts`                            | adiciona `copilot` ao `IDataProviders`                                                                                       |
| `src/providers/data/impl/mock/copilotRules.ts`                     | regras puras R1/R2/R3 + `runCopilotRules`                                                                                    |
| `src/providers/data/impl/mock/copilot.ts`                          | `mockCopilotProvider` — compõe o painel                                                                                      |
| `src/providers/data/impl/supabase/copilot.ts`                      | stub Fase 2 (`AICopilotProvider` + `generateReply`)                                                                          |
| `src/providers/data/factory.ts`                                    | registra mock + supabase nos bundles                                                                                         |
| `src/providers/data/hooks/useCopilotProvider.ts`                   | hook de acesso ao provider                                                                                                   |
| `src/providers/data/index.ts`                                      | exporta `useCopilotProvider`                                                                                                 |
| `src/features/copilot/config.ts`                                   | `resolvePlacement()` + constantes                                                                                            |
| `src/features/copilot/hooks/useCopilotPlacement.ts`                | resolve a variante ativa                                                                                                     |
| `src/features/copilot/hooks/useCopilotPanel.ts`                    | orquestra painel + dismiss local + loading/erro                                                                              |
| `src/features/copilot/i18n/pt-BR.ts`                               | strings em pt-BR                                                                                                             |
| `src/features/copilot/components/*`                                | `CopilotHeader`, `CopilotSuggestionItem`, `CopilotSummary`, `CopilotReply`, `CopilotStrip`, `CopilotCard`, `CopilotFicheTab` |
| `src/features/copilot/index.ts`                                    | barrel da feature                                                                                                            |
| `src/features/conversations/pages/ConversationPage.tsx`            | monta `strip`/`card` nos slots                                                                                               |
| `src/features/customers/components/CustomerProfileFiche.tsx`       | aba "Copiloto" quando placement = `tab`                                                                                      |
| `docs/prds/PRD-002-*`, `docs/prds/DELTAS-*`, `docs/prds/PRD-004-*` | DELTAs                                                                                                                       |

## Mapa Fase do PRD → Tarefas

| Fase PRD                             | Tarefas                                       |
| ------------------------------------ | --------------------------------------------- |
| 1 — Análise, contrato e DELTAs       | T1, T2 (DELTA-002/004 documentados em T13)    |
| 4 — Sugestões + Provider + esqueleto | T3, T4, T5                                    |
| 2 — Superfície + parametrização      | T6, T7, T8, T9, T10, T11, T12                 |
| 3 — Briefing + Resumo                | embutido em T4 (composição) + T9/T10 (render) |
| 5 — Validação                        | T13                                           |

---

## Task 1: Tipos do domínio do Copiloto

**Files:**

- Create: `src/shared/types/copilot.ts`
- Modify: `src/shared/types/index.ts` (após o bloco "SDR Escalation (PRD-023)")

- [ ] **Step 1: Criar `src/shared/types/copilot.ts`**

```typescript
import type { ABCClass } from "./bi";
import type { CustomerStatus } from "./customer";
import type { ID, ISO8601, Money } from "./common";
import type { ISdrContextSummary } from "./sdr-escalation";

/** Tipo de orientação que o copiloto emite. */
export type CopilotSuggestionKind = "alert" | "action" | "opportunity";

/** Origem da sugestão. Fase 1 sempre "rule"; Fase 2 habilita "ai". */
export type CopilotSuggestionSource = "rule" | "ai";

export type CopilotSuggestionSeverity = "low" | "medium" | "high";

export type CopilotSuggestionStatus = "active" | "dismissed" | "acted";

/** Posição da superfície do copiloto na tela de atendimento. */
export type CopilotPlacement = "strip" | "tab" | "card";

/**
 * Orientação privada ao vendedor, derivada de uma regra (Fase 1) ou do motor de
 * IA (Fase 2). Nunca trafega para o cliente. Ver PRD-025.
 */
export interface ICopilotSuggestion {
  id: ID;
  conversationId: ID;
  customerId?: ID;
  leadId?: ID;
  storeId: ID;
  kind: CopilotSuggestionKind;
  source: CopilotSuggestionSource;
  /** Orientação curta exibida ao vendedor. */
  title: string;
  /** Complemento opcional, revelado ao expandir. */
  detail?: string;
  /** Identificador da regra/sinal (ex.: "unanswered_deadline"). */
  triggeredBy: string;
  severity?: CopilotSuggestionSeverity;
  /** Liga a uma IRecommendation quando a sugestão deriva de uma já existente. */
  relatedRecommendationId?: ID;
  status: CopilotSuggestionStatus;
  createdAt: ISO8601;
}

/**
 * Extrato de contexto do cliente. Reflete os MESMOS valores da Ficha (PRD-012),
 * sem recomputar — referência, não recálculo.
 */
export interface ICopilotBriefing {
  customerName: string;
  lifecycleStatus: CustomerStatus;
  abcClass?: ABCClass;
  averageTicket?: Money;
  ltv?: Money;
  recencyDays?: number;
  /** Texto curto de frequência, ex.: "4 pedidos · 12m". */
  frequency?: string;
  primaryVehicle?: { brand: string; model?: string };
  isPositivado?: boolean;
}

export type CopilotSummarySource = "sdr" | "mock";

/** Resumo da conversa apresentado pelo copiloto. */
export interface ICopilotSummary {
  text: string;
  source: CopilotSummarySource;
  /** Presente quando o resumo deriva do handoff do SDR (PRD-023). */
  sdrContext?: ISdrContextSummary;
}

/**
 * Agregado consumido pela superfície do copiloto.
 *
 * Nota de arquitetura: diferente do rascunho do PRD-025, `placement` NÃO vive
 * aqui — é configuração de front (build-time, `VITE_COPILOT_PLACEMENT`), resolvida
 * por `useCopilotPlacement`, não um dado do provider.
 */
export interface ICopilotPanelData {
  conversationId: ID;
  briefing?: ICopilotBriefing;
  summary?: ICopilotSummary;
  suggestions: ICopilotSuggestion[];
}
```

- [ ] **Step 2: Re-exportar no barrel `src/shared/types/index.ts`**

Adicione, logo após o bloco `// SDR Escalation (PRD-023)` (por volta da linha 194):

```typescript
// Copiloto de Vendas (PRD-025)
export type {
  ICopilotSuggestion,
  ICopilotBriefing,
  ICopilotSummary,
  ICopilotPanelData,
  CopilotSuggestionKind,
  CopilotSuggestionSource,
  CopilotSuggestionSeverity,
  CopilotSuggestionStatus,
  CopilotPlacement,
  CopilotSummarySource,
} from "./copilot";
```

- [ ] **Step 3: Type-check**

Run: `bun run build`
Expected: build OK, sem erros de tipo (os novos tipos compilam e são exportados).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/copilot.ts src/shared/types/index.ts
git commit -m "feat(copilot): add domain types for sales copilot (PRD-025)"
```

---

## Task 2: Contrato do provider + agregador `IDataProviders`

**Files:**

- Create: `src/providers/data/contracts/copilot.ts`
- Modify: `src/providers/data/contracts/index.ts`

- [ ] **Step 1: Criar `src/providers/data/contracts/copilot.ts`**

```typescript
import type { ID, ICopilotPanelData } from "@/shared/types";

/**
 * Contrato do Copiloto de Vendas (PRD-025).
 *
 * Fase 1: `mockCopilotProvider` (regras determinísticas).
 * Fase 2: `AICopilotProvider` (Supabase + LLM) habilita `generateReply` sem
 * alterar a superfície consumidora.
 */
export interface ICopilotProvider {
  /** Compõe briefing + resumo + sugestões para a conversa. */
  getPanelData(conversationId: ID): Promise<ICopilotPanelData>;
  /** Marca uma sugestão como dispensada (Fase 1: no-op + gancho de auditoria). */
  dismissSuggestion(id: ID): Promise<void>;
  // Fase 2: generateReply(conversationId: ID): Promise<string>;
}
```

- [ ] **Step 2: Importar o contrato em `src/providers/data/contracts/index.ts`**

Adicione o import junto aos demais (após a linha 31, `import type { ISdrEscalationsProvider } ...`):

```typescript
import type { ICopilotProvider } from "./copilot";
```

Adicione o re-export (após a linha 89, `export type { ISdrEscalationsProvider, ... }`):

```typescript
export type { ICopilotProvider } from "./copilot";
```

- [ ] **Step 3: Adicionar a chave ao `IDataProviders`**

No `interface IDataProviders { ... }`, adicione como última chave (após `sdrEscalations: ISdrEscalationsProvider;`):

```typescript
copilot: ICopilotProvider;
```

- [ ] **Step 4: Type-check**

Run: `bun run build`
Expected: **FALHA esperada** em `factory.ts` — `mockProviders`/`supabaseProviders` agora não satisfazem `IDataProviders` (falta `copilot`). Isso confirma que o contrato foi adicionado. Será resolvido na Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/contracts/copilot.ts src/providers/data/contracts/index.ts
git commit -m "feat(copilot): add ICopilotProvider contract to data providers (PRD-025)"
```

---

## Task 3: Regras determinísticas R1/R2/R3 (puras)

**Files:**

- Create: `src/providers/data/impl/mock/copilotRules.ts`

- [ ] **Step 1: Criar `src/providers/data/impl/mock/copilotRules.ts`**

```typescript
import type {
  IConversation,
  IMessage,
  ICustomer,
  ICopilotSuggestion,
  CopilotSuggestionKind,
  CopilotSuggestionSeverity,
} from "@/shared/types";

export interface ICopilotRuleContext {
  conversation: IConversation;
  /** Mensagens da conversa, ordem ascendente por sentAt. */
  messages: IMessage[];
  customer?: ICustomer;
  now: Date;
}

/** Remove acentos e normaliza caixa para casamento robusto em pt-BR. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function inboundFromCustomer(messages: IMessage[]): IMessage[] {
  return messages.filter((m) => m.direction === "in" && m.authorType === "customer");
}

function makeSuggestion(
  ctx: ICopilotRuleContext,
  args: {
    kind: CopilotSuggestionKind;
    triggeredBy: string;
    title: string;
    detail?: string;
    severity: CopilotSuggestionSeverity;
  },
): ICopilotSuggestion {
  return {
    // ID determinístico → estabiliza o "dispensar" entre renders.
    id: `${ctx.conversation.id}::${args.triggeredBy}`,
    conversationId: ctx.conversation.id,
    customerId: ctx.conversation.customerId,
    leadId: ctx.conversation.leadId,
    storeId: ctx.conversation.storeId,
    kind: args.kind,
    source: "rule",
    title: args.title,
    detail: args.detail,
    triggeredBy: args.triggeredBy,
    severity: args.severity,
    status: "active",
    createdAt: ctx.now.toISOString(),
  };
}

const DEADLINE_TERMS = ["prazo", "entrega", "quando chega", "quando que chega", "previsao"];
const BILLING_TERMS = ["nota", "nf", "nota fiscal", "faturar", "faturamento", "fiscal"];
const COMPANY_TERMS = ["empresa", "cnpj", "razao social", "em nome da", "pessoa juridica"];
const BUYING_INTENT_TERMS = [
  "orcamento",
  "preco",
  "valor",
  "boleto",
  "cotacao",
  "parcel",
  "quanto",
];

function matchesAny(text: string, terms: string[]): boolean {
  const n = normalize(text);
  return terms.some((t) => n.includes(t));
}

/**
 * R1 — `unanswered_deadline` (alert): ≥2 mensagens do cliente sobre prazo/entrega
 * sem mensagem posterior do vendedor, e conversa não resolvida.
 */
export function ruleUnansweredDeadline(ctx: ICopilotRuleContext): ICopilotSuggestion | null {
  if (ctx.conversation.status === "resolvida" || ctx.conversation.status === "arquivada") {
    return null;
  }
  const deadlineMsgs = inboundFromCustomer(ctx.messages).filter((m) =>
    matchesAny(m.text, DEADLINE_TERMS),
  );
  if (deadlineMsgs.length < 2) return null;
  const last = deadlineMsgs[deadlineMsgs.length - 1];
  const sellerRepliedAfter = ctx.messages.some(
    (m) => m.direction === "out" && m.authorType === "seller" && m.sentAt > last.sentAt,
  );
  if (sellerRepliedAfter) return null;
  return makeSuggestion(ctx, {
    kind: "alert",
    triggeredBy: "unanswered_deadline",
    title: "Cliente perguntou o prazo 2× sem resposta — confirme a entrega.",
    detail: "Há perguntas de prazo/entrega sem retorno do vendedor. Responda antes que esfrie.",
    severity: "high",
  });
}

/**
 * R2 — `billing_mismatch` (action): cliente B2C (CPF) pede NF/faturamento em nome
 * de empresa.
 */
export function ruleBillingMismatch(ctx: ICopilotRuleContext): ICopilotSuggestion | null {
  if (ctx.customer?.type !== "B2C") return null;
  const hit = inboundFromCustomer(ctx.messages).some(
    (m) => matchesAny(m.text, BILLING_TERMS) && matchesAny(m.text, COMPANY_TERMS),
  );
  if (!hit) return null;
  return makeSuggestion(ctx, {
    kind: "action",
    triggeredBy: "billing_mismatch",
    title: "Pediu NF em nome da empresa, mas o cadastro é B2C (CPF).",
    detail: "Confirme os dados de faturamento (CNPJ/razão social) antes de emitir.",
    severity: "medium",
  });
}

/**
 * R3 — `dormant_opportunity` (opportunity): cliente dormente com sinal de intenção
 * de compra na conversa atual.
 */
export function ruleDormantOpportunity(ctx: ICopilotRuleContext): ICopilotSuggestion | null {
  if (ctx.customer?.status !== "dormente") return null;
  const hit = inboundFromCustomer(ctx.messages).some((m) =>
    matchesAny(m.text, BUYING_INTENT_TERMS),
  );
  if (!hit) return null;
  return makeSuggestion(ctx, {
    kind: "opportunity",
    triggeredBy: "dormant_opportunity",
    title: "Cliente dormente voltando a comprar — facilite o fechamento.",
    detail: "Oferecer condição de pagamento (ex.: parcelado) costuma destravar a conversão.",
    severity: "medium",
  });
}

const KIND_ORDER: Record<CopilotSuggestionKind, number> = { alert: 0, action: 1, opportunity: 2 };
const SEVERITY_ORDER: Record<CopilotSuggestionSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Roda todas as regras e ordena por (kind, severidade). */
export function runCopilotRules(ctx: ICopilotRuleContext): ICopilotSuggestion[] {
  const out = [
    ruleUnansweredDeadline(ctx),
    ruleBillingMismatch(ctx),
    ruleDormantOpportunity(ctx),
  ].filter((s): s is ICopilotSuggestion => s !== null);

  return out.sort((a, b) => {
    const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (byKind !== 0) return byKind;
    return SEVERITY_ORDER[a.severity ?? "low"] - SEVERITY_ORDER[b.severity ?? "low"];
  });
}
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: OK (a falha do `factory.ts` da Task 2 persiste até a Task 5 — se atrapalhar o build, prossiga; o lint deste arquivo deve passar).

- [ ] **Step 3: Casos de aceite (conferência manual da lógica)**

Verifique mentalmente/anote (sem runner): R1 dispara com 2 mensagens "qual o prazo?" sem resposta do vendedor e status ≠ resolvida; R2 dispara para B2C com "emitir a nota em nome da empresa"; R3 dispara para `status: "dormente"` com "pode mandar o orçamento?". Cada uma retorna `null` quando a pré-condição falha.

- [ ] **Step 4: Commit**

```bash
git add src/providers/data/impl/mock/copilotRules.ts
git commit -m "feat(copilot): add deterministic suggestion rules R1/R2/R3 (PRD-025)"
```

---

## Task 4: `mockCopilotProvider` — composição do painel

**Files:**

- Create: `src/providers/data/impl/mock/copilot.ts`

- [ ] **Step 1: Criar `src/providers/data/impl/mock/copilot.ts`**

```typescript
import type {
  ICustomer,
  ICopilotBriefing,
  ICopilotPanelData,
  ICopilotSummary,
  ID,
  IMessage,
  ISdrContextSummary,
} from "@/shared/types";
import type { ICopilotProvider } from "../../contracts/copilot";
import { mockConversationsProvider } from "./conversations";
import { mockMessagesProvider } from "./messages";
import { mockCustomersProvider } from "./customers";
import { mockSdrEscalationsProvider } from "./sdrEscalations";
import { runCopilotRules } from "./copilotRules";

function customerDisplayName(customer: ICustomer): string {
  return customer.type === "B2B"
    ? customer.nomeFantasia || customer.razaoSocial || customer.contactName
    : customer.fullName;
}

function daysSince(iso: string | undefined, now: Date): number | undefined {
  if (!iso) return undefined;
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

function isSameCalendarMonth(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

function buildBriefing(customer: ICustomer, now: Date): ICopilotBriefing {
  return {
    customerName: customerDisplayName(customer),
    lifecycleStatus: customer.status,
    abcClass: customer.abcClass,
    averageTicket: customer.purchaseStats?.ticketMedio,
    ltv: customer.purchaseStats?.ltv,
    recencyDays: daysSince(customer.lastPurchaseAt, now),
    frequency: customer.purchaseStats
      ? `${customer.purchaseStats.orderCount12m} pedidos · 12m`
      : undefined,
    isPositivado: isSameCalendarMonth(customer.lastPurchaseAt, now),
  };
}

function summaryFromSdr(context: ISdrContextSummary): ICopilotSummary {
  const parts: string[] = [];
  if (context.partIdentified) parts.push(`Peça: ${context.partIdentified.name}`);
  if (context.vehicleIdentified) {
    parts.push(
      `Veículo: ${[context.vehicleIdentified.brand, context.vehicleIdentified.model].filter(Boolean).join(" ")}`,
    );
  }
  if (context.quoteGenerated) parts.push("Orçamento enviado pelo SDR");
  const text = parts.length > 0 ? parts.join(" · ") : "Conversa escalada pelo SDR.";
  return { text, source: "sdr", sdrContext: context };
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function mockSummaryFromMessages(messages: IMessage[]): ICopilotSummary | undefined {
  const inbound = messages.filter(
    (m) => m.direction === "in" && m.authorType === "customer" && m.text.trim(),
  );
  if (inbound.length === 0) return undefined;
  const first = inbound[0];
  const last = inbound[inbound.length - 1];
  const text =
    first.id === last.id
      ? `Cliente: "${truncate(last.text)}".`
      : `Cliente iniciou com "${truncate(first.text, 48)}". Pendência atual: "${truncate(last.text, 48)}".`;
  return { text, source: "mock" };
}

export const mockCopilotProvider: ICopilotProvider = {
  async getPanelData(conversationId: ID): Promise<ICopilotPanelData> {
    const conversation = await mockConversationsProvider.get(conversationId);
    const messages = (
      await mockMessagesProvider.list({ conversationId, pageSize: 500, orderDir: "asc" })
    ).data;
    const customer = conversation.customerId
      ? await mockCustomersProvider.get(conversation.customerId)
      : undefined;
    const escalation = await mockSdrEscalationsProvider.getByConversation(conversationId);
    const now = new Date();

    const suggestions = runCopilotRules({ conversation, messages, customer, now });
    const briefing = customer ? buildBriefing(customer, now) : undefined;
    const summary = escalation
      ? summaryFromSdr(escalation.contextSummary)
      : mockSummaryFromMessages(messages);

    return { conversationId, briefing, summary, suggestions };
  },

  async dismissSuggestion(_id: ID): Promise<void> {
    // Fase 1: o estado de dispensa é local na sessão (useCopilotPanel).
    // Gancho para auditoria visual (PRD-006) / persistência na Fase 2.
  },
};
```

- [ ] **Step 2: Type-check**

Run: `bun run build`
Expected: este arquivo compila (a falha do `factory.ts` ainda persiste — resolvida na próxima task).

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/impl/mock/copilot.ts
git commit -m "feat(copilot): add mockCopilotProvider composing panel data (PRD-025)"
```

---

## Task 5: Stub Supabase + registro no factory + hook + barrel

**Files:**

- Create: `src/providers/data/impl/supabase/copilot.ts`
- Create: `src/providers/data/hooks/useCopilotProvider.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/index.ts`

- [ ] **Step 1: Criar o stub `src/providers/data/impl/supabase/copilot.ts`**

> Siga o mesmo padrão de não-implementado dos vizinhos em `src/providers/data/impl/supabase/` (ex.: abra `impl/supabase/recommendations.ts` e replique o estilo de stub usado lá). O esqueleto abaixo lança erro explícito até a Fase 2.

```typescript
import type { ID, ICopilotPanelData } from "@/shared/types";
import type { ICopilotProvider } from "../../contracts/copilot";

const NOT_IMPLEMENTED =
  "CopilotProvider: implementação Supabase pendente (Fase 2 — AICopilotProvider).";

export const supabaseCopilotProvider: ICopilotProvider = {
  getPanelData(_conversationId: ID): Promise<ICopilotPanelData> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  },
  dismissSuggestion(_id: ID): Promise<void> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  },
};
```

- [ ] **Step 2: Registrar nos bundles do `src/providers/data/factory.ts`**

Adicione os imports (junto aos demais mock/supabase imports):

```typescript
import { mockCopilotProvider } from "./impl/mock/copilot";
import { supabaseCopilotProvider } from "./impl/supabase/copilot";
```

Adicione a chave `copilot` em **ambos** os bundles (`mockProviders` e `supabaseProviders`), como última entrada:

```typescript
  // em mockProviders:
  copilot: mockCopilotProvider,
```

```typescript
  // em supabaseProviders:
  copilot: supabaseCopilotProvider,
```

- [ ] **Step 3: Criar o hook `src/providers/data/hooks/useCopilotProvider.ts`**

```typescript
import type { ICopilotProvider } from "../contracts/copilot";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useCopilotProvider(): ICopilotProvider {
  return useDataProviderSlice("copilot", "useCopilotProvider");
}
```

- [ ] **Step 4: Exportar o hook em `src/providers/data/index.ts`**

Abra `src/providers/data/index.ts` e adicione a re-exportação junto aos demais `use*Provider` (siga o padrão exato do arquivo — provavelmente `export { useCopilotProvider } from "./hooks/useCopilotProvider";`).

- [ ] **Step 5: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: **PASS** — `IDataProviders` agora está completo nos dois bundles; a falha das Tasks 2–4 é resolvida.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/impl/supabase/copilot.ts src/providers/data/hooks/useCopilotProvider.ts src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(copilot): wire copilot provider into factory + hook (PRD-025)"
```

---

## Task 6: Resolução da variante (`VITE_COPILOT_PLACEMENT`)

**Files:**

- Create: `src/features/copilot/config.ts`
- Create: `src/features/copilot/hooks/useCopilotPlacement.ts`

- [ ] **Step 1: Criar `src/features/copilot/config.ts`** (espelho fiel de `resolveDataSource` em `providers/data/factory.ts`)

```typescript
import type { CopilotPlacement } from "@/shared/types";

export const COPILOT_PLACEMENTS: readonly CopilotPlacement[] = ["strip", "tab", "card"] as const;

export const DEFAULT_COPILOT_PLACEMENT: CopilotPlacement = "strip";

/**
 * Resolve a variante de posicionamento a partir de `VITE_COPILOT_PLACEMENT`.
 * Valor inválido → variante default (`strip`) com aviso em DEV.
 */
export function resolvePlacement(): CopilotPlacement {
  const raw = import.meta.env.VITE_COPILOT_PLACEMENT;
  if (raw && (COPILOT_PLACEMENTS as readonly string[]).includes(raw)) {
    return raw as CopilotPlacement;
  }
  if (raw && import.meta.env.DEV) {
    console.warn(
      `[copilot] VITE_COPILOT_PLACEMENT="${raw}" inválido. ` +
        `Usando "${DEFAULT_COPILOT_PLACEMENT}". Valores: ${COPILOT_PLACEMENTS.join(", ")}.`,
    );
  }
  return DEFAULT_COPILOT_PLACEMENT;
}
```

- [ ] **Step 2: Criar `src/features/copilot/hooks/useCopilotPlacement.ts`**

```typescript
import { useMemo } from "react";
import type { CopilotPlacement } from "@/shared/types";
import { resolvePlacement } from "../config";

/** Variante ativa do copiloto (estável durante a sessão — vem de env build-time). */
export function useCopilotPlacement(): CopilotPlacement {
  return useMemo(() => resolvePlacement(), []);
}
```

- [ ] **Step 3: Type-check** — Run: `bun run build` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/copilot/config.ts src/features/copilot/hooks/useCopilotPlacement.ts
git commit -m "feat(copilot): resolve placement variant from env (PRD-025)"
```

---

## Task 7: `useCopilotPanel` — orquestração + dismiss local + estados

**Files:**

- Create: `src/features/copilot/hooks/useCopilotPanel.ts`

- [ ] **Step 1: Criar `src/features/copilot/hooks/useCopilotPanel.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";
import type {
  CopilotPlacement,
  ICopilotBriefing,
  ICopilotSuggestion,
  ICopilotSummary,
  ID,
} from "@/shared/types";
import { useCopilotProvider } from "@/providers/data";
import { useCopilotPlacement } from "./useCopilotPlacement";

export interface ICopilotPanelState {
  placement: CopilotPlacement;
  briefing?: ICopilotBriefing;
  summary?: ICopilotSummary;
  suggestions: ICopilotSuggestion[];
  loading: boolean;
  /** True quando o provider falhou — a superfície deve degradar graciosamente. */
  error: boolean;
  dismiss: (id: ID) => void;
}

export function useCopilotPanel(conversationId: ID | null): ICopilotPanelState {
  const provider = useCopilotProvider();
  const placement = useCopilotPlacement();
  const [briefing, setBriefing] = useState<ICopilotBriefing | undefined>(undefined);
  const [summary, setSummary] = useState<ICopilotSummary | undefined>(undefined);
  const [allSuggestions, setAllSuggestions] = useState<ICopilotSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<ID>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!conversationId) {
      setBriefing(undefined);
      setSummary(undefined);
      setAllSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setDismissed(new Set());
    provider
      .getPanelData(conversationId)
      .then((data) => {
        if (cancelled) return;
        setBriefing(data.briefing);
        setSummary(data.summary);
        setAllSuggestions(data.suggestions);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setBriefing(undefined);
        setSummary(undefined);
        setAllSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, conversationId]);

  const dismiss = useCallback(
    (id: ID) => {
      setDismissed((prev) => new Set(prev).add(id));
      void provider.dismissSuggestion(id).catch(() => {
        /* silencioso: dispensa é local na Fase 1 */
      });
    },
    [provider],
  );

  const suggestions = allSuggestions.filter((s) => !dismissed.has(s.id));

  return { placement, briefing, summary, suggestions, loading, error, dismiss };
}
```

- [ ] **Step 2: Type-check** — Run: `bun run build` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/copilot/hooks/useCopilotPanel.ts
git commit -m "feat(copilot): add useCopilotPanel orchestration hook (PRD-025)"
```

---

## Task 8: Strings pt-BR

**Files:**

- Create: `src/features/copilot/i18n/pt-BR.ts`

- [ ] **Step 1: Criar `src/features/copilot/i18n/pt-BR.ts`**

```typescript
export const COPILOT_STRINGS = {
  title: "Copiloto",
  privacy: "só você vê",
  privacyAria: "Orientação privada — visível apenas para você",
  regionAria: "Copiloto — orientação privada ao vendedor",
  summaryLabel: "Resumo da conversa",
  suggestionsLabel: "Sugestões do Copiloto",
  empty: "Sem alertas no momento",
  loading: "Analisando a conversa…",
  replyLabel: "Resposta",
  replyInsert: "Inserir",
  generateReply: "Gerar resposta",
  generateReplySoon: "Em breve · IA Fase 2",
  dismiss: "Dispensar sugestão",
  moreCount: (n: number) => `+${n} ${n === 1 ? "sugestão" : "sugestões"}`,
  toneLabels: { alert: "Alerta", action: "Ação", opportunity: "Oportunidade" },
  expand: "Expandir o Copiloto",
  collapse: "Recolher o Copiloto",
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/features/copilot/i18n/pt-BR.ts
git commit -m "feat(copilot): add pt-BR strings (PRD-025)"
```

---

## Task 9: Componentes compartilhados (Header, SuggestionItem, Summary, Reply)

**Files:**

- Create: `src/features/copilot/components/CopilotHeader.tsx`
- Create: `src/features/copilot/components/CopilotSuggestionItem.tsx`
- Create: `src/features/copilot/components/CopilotSummary.tsx`
- Create: `src/features/copilot/components/CopilotReply.tsx`

> Visual de referência: `copiloto-variantes.html` (classes `.cop-*`). Portar para Tailwind + **tokens semânticos**: `alert`→`warning`, `action`→`info`, `opportunity`→`success`; moldura do copiloto→`primary`. Ícones via `@/components/Icon` (`mdi:*`). Cor nunca sozinha (ícone + rótulo sempre).

- [ ] **Step 1: `CopilotSuggestionItem.tsx`** (unidade de sugestão, com dismiss e a11y)

```tsx
import type { ICopilotSuggestion, CopilotSuggestionKind } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { COPILOT_STRINGS } from "../i18n/pt-BR";

const KIND_META: Record<
  CopilotSuggestionKind,
  { icon: string; chip: string; tone: string; label: string }
> = {
  alert: {
    icon: "mdi:alert-outline",
    chip: "bg-warning/15 text-warning",
    tone: "bg-warning/15 text-warning",
    label: COPILOT_STRINGS.toneLabels.alert,
  },
  action: {
    icon: "mdi:receipt-text-outline",
    chip: "bg-info/15 text-info",
    tone: "bg-info/15 text-info",
    label: COPILOT_STRINGS.toneLabels.action,
  },
  opportunity: {
    icon: "mdi:lightbulb-on-outline",
    chip: "bg-success/15 text-success",
    tone: "bg-success/15 text-success",
    label: COPILOT_STRINGS.toneLabels.opportunity,
  },
};

export interface ICopilotSuggestionItemProps {
  suggestion: ICopilotSuggestion;
  onDismiss?: (id: string) => void;
}

export function CopilotSuggestionItem({ suggestion, onDismiss }: ICopilotSuggestionItemProps) {
  const meta = KIND_META[suggestion.kind];
  return (
    <li className="group flex items-start gap-2.5 text-sm leading-relaxed">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
          meta.chip,
        )}
        aria-hidden="true"
      >
        <Icon icon={meta.icon} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground">{suggestion.title}</span>
        {suggestion.detail && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{suggestion.detail}</span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          meta.tone,
        )}
      >
        {meta.label}
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(suggestion.id)}
          aria-label={COPILOT_STRINGS.dismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Icon icon="mdi:close" size={14} />
        </button>
      )}
    </li>
  );
}
```

- [ ] **Step 2: `CopilotHeader.tsx`** (bot + título + briefing condensado + selo privacidade)

```tsx
import type { ICopilotBriefing } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { COPILOT_STRINGS } from "../i18n/pt-BR";

export interface ICopilotHeaderProps {
  briefing?: ICopilotBriefing;
  /** Slot à direita (chevron de expandir/colapsar etc.). */
  trailing?: React.ReactNode;
}

function formatMoney(v?: number): string | null {
  if (v == null) return null;
  if (v >= 1000) return `R$ ${Math.round(v / 1000)}k`;
  return `R$ ${v}`;
}

export function CopilotHeader({ briefing, trailing }: ICopilotHeaderProps) {
  const ticket = formatMoney(briefing?.averageTicket);
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
        <Icon icon="mdi:robot-outline" size={15} />
      </span>
      <span className="text-sm font-bold text-primary">{COPILOT_STRINGS.title}</span>
      {briefing && (
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase text-warning">{briefing.lifecycleStatus}</span>
          {briefing.abcClass && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>
                ABC <span className="font-semibold text-primary">{briefing.abcClass}</span>
              </span>
            </>
          )}
          {ticket && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>ticket {ticket}</span>
            </>
          )}
          {briefing.recencyDays != null && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>recência {briefing.recencyDays}d</span>
            </>
          )}
        </span>
      )}
      <span
        className="ml-auto inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"
        title={COPILOT_STRINGS.privacyAria}
      >
        <Icon icon="mdi:lock-outline" size={12} />
        {COPILOT_STRINGS.privacy}
      </span>
      {trailing}
    </div>
  );
}
```

- [ ] **Step 3: `CopilotSummary.tsx`**

```tsx
import type { ICopilotSummary } from "@/shared/types";
import { COPILOT_STRINGS } from "../i18n/pt-BR";

export function CopilotSummary({ summary }: { summary: ICopilotSummary }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
        {COPILOT_STRINGS.summaryLabel}
      </div>
      {summary.text}
    </div>
  );
}
```

- [ ] **Step 4: `CopilotReply.tsx`** (resposta pronta + Inserir + botão Fase 2 inerte)

```tsx
import { Icon } from "@/components/Icon";
import { COPILOT_STRINGS } from "../i18n/pt-BR";

export interface ICopilotReplyProps {
  reply: string;
  onInsert: (text: string) => void;
}

export function CopilotReply({ reply, onInsert }: ICopilotReplyProps) {
  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {COPILOT_STRINGS.replyLabel}
        </span>
        <span className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground">
          {reply}
        </span>
        <button
          type="button"
          onClick={() => onInsert(reply)}
          className="shrink-0 cursor-pointer rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
        >
          {COPILOT_STRINGS.replyInsert} ↑
        </button>
      </div>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="mt-2.5 inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground"
      >
        <Icon icon="mdi:auto-fix" size={14} />
        {COPILOT_STRINGS.generateReply}
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
          {COPILOT_STRINGS.generateReplySoon}
        </span>
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Type-check + lint** — Run: `bun run build && bun run lint` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/copilot/components/CopilotHeader.tsx src/features/copilot/components/CopilotSuggestionItem.tsx src/features/copilot/components/CopilotSummary.tsx src/features/copilot/components/CopilotReply.tsx
git commit -m "feat(copilot): add shared surface components (PRD-025)"
```

---

## Task 10: `CopilotStrip` — variante default (repouso + expandida + auto-expand)

**Files:**

- Create: `src/features/copilot/components/CopilotStrip.tsx`

- [ ] **Step 1: Criar `CopilotStrip.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ICopilotPanelState } from "../hooks/useCopilotPanel";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { CopilotHeader } from "./CopilotHeader";
import { CopilotSummary } from "./CopilotSummary";
import { CopilotSuggestionItem } from "./CopilotSuggestionItem";
import { CopilotReply } from "./CopilotReply";

export interface ICopilotStripProps {
  panel: ICopilotPanelState;
  /** Texto da resposta pronta (vem do composer, ex.: buildAiSuggestions[0]). */
  reply?: string;
  onInsertReply: (text: string) => void;
}

const KIND_ICON = {
  alert: "mdi:alert-outline",
  action: "mdi:receipt-text-outline",
  opportunity: "mdi:lightbulb-on-outline",
} as const;

const KIND_COLOR = {
  alert: "text-warning",
  action: "text-info",
  opportunity: "text-success",
} as const;

export function CopilotStrip({ panel, reply, onInsertReply }: ICopilotStripProps) {
  const { briefing, summary, suggestions, loading, dismiss } = panel;
  const [expanded, setExpanded] = useState(false);
  const userCollapsed = useRef(false);

  // Auto-expande 1× quando há alerta de alta severidade e o usuário não colapsou.
  const hasHighAlert = suggestions.some((s) => s.kind === "alert" && s.severity === "high");
  useEffect(() => {
    if (hasHighAlert && !userCollapsed.current) setExpanded(true);
  }, [hasHighAlert]);

  const toggle = () => {
    setExpanded((prev) => {
      if (prev) userCollapsed.current = true;
      return !prev;
    });
  };

  const top = suggestions[0];
  const rest = Math.max(0, suggestions.length - 1);

  if (loading) {
    return (
      <div className="mx-4 mb-3 animate-pulse rounded-xl border border-primary/30 bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground">
        {COPILOT_STRINGS.loading}
      </div>
    );
  }

  return (
    <section
      aria-label={COPILOT_STRINGS.regionAria}
      className="mx-4 mb-3 rounded-xl border border-primary/40 bg-gradient-to-b from-primary/10 to-transparent"
    >
      {!expanded ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-label={COPILOT_STRINGS.expand}
          className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
            <Icon icon="mdi:robot-outline" size={15} />
          </span>
          {top ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <Icon
                icon={KIND_ICON[top.kind]}
                size={15}
                className={cn("shrink-0", KIND_COLOR[top.kind])}
              />
              <span className="truncate text-foreground">{top.title}</span>
            </span>
          ) : (
            <span className="flex-1 text-sm text-muted-foreground">{COPILOT_STRINGS.empty}</span>
          )}
          {rest > 0 && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {COPILOT_STRINGS.moreCount(rest)}
            </span>
          )}
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            <Icon icon="mdi:lock-outline" size={12} />
            {COPILOT_STRINGS.privacy}
          </span>
          <Icon icon="mdi:chevron-down" size={16} className="shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="px-3.5 py-3">
          <CopilotHeader
            briefing={briefing}
            trailing={
              <button
                type="button"
                onClick={toggle}
                aria-expanded
                aria-label={COPILOT_STRINGS.collapse}
                className="ml-1 shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <Icon icon="mdi:chevron-up" size={16} />
              </button>
            }
          />
          {summary && (
            <div className="mt-3">
              <CopilotSummary summary={summary} />
            </div>
          )}
          {suggestions.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2.5">
              {suggestions.map((s) => (
                <CopilotSuggestionItem key={s.id} suggestion={s} onDismiss={dismiss} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{COPILOT_STRINGS.empty}</p>
          )}
          {reply && <CopilotReply reply={reply} onInsert={onInsertReply} />}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Type-check + lint** — Run: `bun run build && bun run lint` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/copilot/components/CopilotStrip.tsx
git commit -m "feat(copilot): add CopilotStrip default variant with rest/expanded states (PRD-025)"
```

---

## Task 11: `CopilotCard` + `CopilotFicheTab`

**Files:**

- Create: `src/features/copilot/components/CopilotCard.tsx`
- Create: `src/features/copilot/components/CopilotFicheTab.tsx`

- [ ] **Step 1: `CopilotCard.tsx`** (card colapsável no topo do chat)

```tsx
import { useState } from "react";
import { Icon } from "@/components/Icon";
import type { ICopilotPanelState } from "../hooks/useCopilotPanel";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { CopilotSuggestionItem } from "./CopilotSuggestionItem";

export function CopilotCard({ panel }: { panel: ICopilotPanelState }) {
  const { suggestions, dismiss, loading } = panel;
  const [open, setOpen] = useState(true);
  if (loading) return null;

  return (
    <section
      aria-label={COPILOT_STRINGS.regionAria}
      className="mx-[18px] mt-3.5 overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-b from-primary/10 to-transparent"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
          <Icon icon="mdi:robot-outline" size={15} />
        </span>
        <span className="text-sm font-bold text-primary">{COPILOT_STRINGS.title}</span>
        <span className="text-xs text-muted-foreground">
          · {COPILOT_STRINGS.moreCount(suggestions.length)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          <Icon icon="mdi:lock-outline" size={12} />
          {COPILOT_STRINGS.privacy}
        </span>
        <Icon
          icon={open ? "mdi:chevron-up" : "mdi:chevron-down"}
          size={16}
          className="text-muted-foreground"
        />
      </button>
      {open && suggestions.length > 0 && (
        <ul className="flex flex-col gap-2.5 px-3.5 pb-3.5">
          {suggestions.map((s) => (
            <CopilotSuggestionItem key={s.id} suggestion={s} onDismiss={dismiss} />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: `CopilotFicheTab.tsx`** (conteúdo da aba na Ficha)

```tsx
import { Icon } from "@/components/Icon";
import type { ICopilotPanelState } from "../hooks/useCopilotPanel";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { CopilotSummary } from "./CopilotSummary";
import { CopilotSuggestionItem } from "./CopilotSuggestionItem";

export function CopilotFicheTab({ panel }: { panel: ICopilotPanelState }) {
  const { summary, suggestions, dismiss, loading, error } = panel;
  if (loading) return <p className="text-sm text-muted-foreground">{COPILOT_STRINGS.loading}</p>;
  if (error) return <p className="text-sm text-muted-foreground">{COPILOT_STRINGS.empty}</p>;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
          <Icon icon="mdi:robot-outline" size={15} />
        </span>
        <span className="text-sm font-bold text-primary">{COPILOT_STRINGS.title}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          <Icon icon="mdi:lock-outline" size={12} />
          {COPILOT_STRINGS.privacy}
        </span>
      </div>
      {summary && (
        <div className="mb-3.5">
          <CopilotSummary summary={summary} />
        </div>
      )}
      {suggestions.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {suggestions.map((s) => (
            <CopilotSuggestionItem key={s.id} suggestion={s} onDismiss={dismiss} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{COPILOT_STRINGS.empty}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Criar o barrel `src/features/copilot/index.ts`**

```typescript
export { CopilotStrip } from "./components/CopilotStrip";
export { CopilotCard } from "./components/CopilotCard";
export { CopilotFicheTab } from "./components/CopilotFicheTab";
export { useCopilotPanel } from "./hooks/useCopilotPanel";
export { useCopilotPlacement } from "./hooks/useCopilotPlacement";
export type { ICopilotPanelState } from "./hooks/useCopilotPanel";
```

- [ ] **Step 4: Type-check + lint** — Run: `bun run build && bun run lint` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/copilot/components/CopilotCard.tsx src/features/copilot/components/CopilotFicheTab.tsx src/features/copilot/index.ts
git commit -m "feat(copilot): add card and fiche-tab variants + feature barrel (PRD-025)"
```

---

## Task 12: Integração na tela de atendimento

**Files:**

- Modify: `src/features/conversations/pages/ConversationPage.tsx`
- Modify: `src/features/conversations/components/MessageInput.tsx`
- Modify: `src/features/customers/components/CustomerProfileFiche.tsx`

> Objetivo: montar uma única instância de `useCopilotPanel` e renderizar a variante no slot certo. Na variante `strip`, a faixa **absorve** a "resposta pronta" do `buildAiSuggestions` (o composer deixa de mostrar a barra "Sugestões IA" quando o copiloto está na faixa). A faixa precisa escrever no `textarea` do `MessageInput` (botão "Inserir ↑").

- [ ] **Step 1: Expor um setter de rascunho do composer**

Hoje o texto do input é estado interno do `MessageInput` (`value`/`setValue`, ver `MessageInput.tsx:96`). Para a faixa inserir a resposta pronta, levante esse estado de rascunho para a `ConversationPage` e passe-o ao `MessageInput`.

No `MessageInput.tsx`, troque o estado interno por props controladas (mantendo retrocompatibilidade com default):

```tsx
// adicionar às props (IMessageInputProps):
  draft?: string;
  onDraftChange?: (text: string) => void;

// no corpo, substituir `const [value, setValue] = useState("")` por estado controlado/uncontrolled:
  const [internalValue, setInternalValue] = useState("");
  const value = props.draft ?? internalValue;
  const setValue = props.onDraftChange ?? setInternalValue;
```

> Ajuste as referências internas a `value`/`setValue` que já existem. Mantenha o comportamento de `buildAiSuggestions` para os placements `card`/`tab`; oculte a barra "Sugestões IA" quando o copiloto estiver na faixa (passe uma prop `hideAiSuggestions?: boolean` e condicione o bloco em `MessageInput.tsx:190`).

- [ ] **Step 2: Montar o copiloto na `ConversationPage.tsx`**

Adicione os imports:

```tsx
import { useState } from "react";
import { CopilotStrip, CopilotCard, useCopilotPanel } from "@/features/copilot";
```

Dentro de `ConversationPage`, após `const escalation = ...`:

```tsx
const copilot = useCopilotPanel(conversationId);
const [draft, setDraft] = useState("");
// resposta pronta reaproveitada do composer (1ª sugestão de IA), só para a faixa:
const stripReply =
  copilot.placement === "strip" ? "Te envio o boleto e a NF ainda hoje." : undefined;
```

> Nota: na Fase 1, a resposta pronta exibida pela faixa pode reusar a mesma heurística do `buildAiSuggestions`. Para evitar duplicar a função, exporte-a de `MessageInput.tsx` (ou mova-a para `src/features/conversations/utils/aiSuggestions.ts`) e use a primeira sugestão. Mantenha simples: se preferir, passe um texto fixo coerente como acima — não há LLM nesta fase.

Renderize `card` no topo do chat (logo após `<ConversationHeader/>`):

```tsx
{
  copilot.placement === "card" && conversation.customerId && !copilot.error && (
    <CopilotCard panel={copilot} />
  );
}
```

Renderize `strip` acima do `MessageInput` (entre `<MetaWindowIndicator/>` e `<MessageInput/>`):

```tsx
{
  copilot.placement === "strip" && conversation.customerId && !copilot.error && (
    <CopilotStrip panel={copilot} reply={stripReply} onInsertReply={setDraft} />
  );
}
```

Passe o rascunho controlado e o flag de ocultar sugestões ao `MessageInput`:

```tsx
<MessageInput
  conversation={conversation}
  whatsappAccount={whatsappAccount}
  onSent={detail.refresh}
  draft={draft}
  onDraftChange={setDraft}
  hideAiSuggestions={copilot.placement === "strip"}
/>
```

- [ ] **Step 3: Aba "Copiloto" na Ficha (`CustomerProfileFiche.tsx`)**

Aceite uma prop opcional e renderize a aba apenas quando o placement for `tab`:

```tsx
// nas props do componente:
  copilotTab?: React.ReactNode;
```

Onde as abas são montadas, acrescente condicionalmente uma aba "Copiloto" (com ícone `mdi:robot-outline`) cujo conteúdo é `copilotTab`. Siga o padrão de abas já existente no arquivo (não trocar o componente de abas).

Na `ConversationPage`, passe o conteúdo da aba à Ficha:

```tsx
import { CopilotFicheTab } from "@/features/copilot";
// ...
<CustomerProfileFiche
  customerId={conversation.customerId}
  conversation={conversation}
  open={fiche.open}
  onOpenChange={fiche.setOpen}
  copilotTab={
    copilot.placement === "tab" && !copilot.error ? <CopilotFicheTab panel={copilot} /> : undefined
  }
/>;
```

- [ ] **Step 4: Type-check + lint** — Run: `bun run build && bun run lint` — Expected: PASS.

- [ ] **Step 5: Validação manual (as 3 variantes)**

Run: `bun run dev` (porta já ativa em dev). Abra `/app/atendimento/<id>` numa conversa com cliente.

- Default (sem env): a **faixa** aparece acima do input, em repouso (1 linha) e expande ao clicar; "Inserir ↑" escreve no campo; a barra "Sugestões IA" some.
- `VITE_COPILOT_PLACEMENT=card`: card no topo. `=tab`: aba "Copiloto" na Ficha. Valor inválido → cai em `strip` (ver warning no console DEV).

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/pages/ConversationPage.tsx src/features/conversations/components/MessageInput.tsx src/features/customers/components/CustomerProfileFiche.tsx
git commit -m "feat(copilot): mount copilot variants in conversation screen (PRD-025)"
```

---

## Task 13: DELTAs, validação transversal, versão e changelog

**Files:**

- Modify: `docs/prds/PRD-002-modelo-conceitual-glossario_DONE.md`
- Modify: `docs/prds/DELTAS-PRDs-Gallo-Base-Diesel.md`
- Modify: `docs/prds/PRD-004-mocks-geradores-dados_DONE.md`
- Modify: `CHANGELOG.md` + arquivo de versão do app
- Rename: `docs/prds/PRD-025-copiloto-vendas.md` → `..._DONE.md`

- [ ] **Step 1: DELTA no PRD-002** — registre a nova entidade `ICopilotSuggestion` (+ `ICopilotBriefing`, `ICopilotSummary`, `ICopilotPanelData`) no modelo conceitual, com nota "Adicionado por PRD-025". Replicar a entrada também em `DELTAS-PRDs-Gallo-Base-Diesel.md` seguindo o formato das demais deltas do arquivo.

- [ ] **Step 2: DELTA no PRD-004** — documente que o resumo mockado (sem escalonamento) e as sugestões por regra são gerados em runtime pelo `mockCopilotProvider` (não há gerador estático em `src/mocks`), citando os arquivos `impl/mock/copilot.ts` e `copilotRules.ts`.

- [ ] **Step 3: Validação transversal (manual)** — confirme no app:
  - Tema **light e dark** (e os 4 temas): a faixa usa só tokens semânticos; nenhuma cor fixa quebra em nenhum tema.
  - **Acessibilidade:** foco visível nos botões, `aria-expanded` na faixa/card, `aria-label` nos ícones-botão, navegação por teclado, contraste dos chips.
  - **Resiliência:** force um erro no provider (ex.: `getPanelData` rejeitar) e confirme que a conversa segue utilizável e a superfície some (sem erro bloqueante).
  - **Isolamento:** inbox, lista de mensagens e Ficha continuam funcionando como antes.
  - **RBAC:** a superfície só aparece em conversas que o perfil pode atender (a `ConversationPage` já é guardada; o copiloto não adiciona rota nova).

- [ ] **Step 4: Build final + lint** — Run: `bun run build && bun run lint` — Expected: PASS.

- [ ] **Step 5: Versão + changelog + \_DONE**
  - Bump **MINOR** (nova feature), codinome em inglês sugerido pelo PRD: **Copilot** (ou **Whisper**). Atualize o arquivo de versão do app e o `CHANGELOG.md` (Keep a Changelog — seção `Added`).
  - Atualize a seção "Status de Implementação" do PRD-025 (status ✅, data, versão, implementado por).
  - Renomeie `docs/prds/PRD-025-copiloto-vendas.md` → `docs/prds/PRD-025-copiloto-vendas_DONE.md`.
  - Atualize o índice `docs/prds/INDEX-PRDs-Gallo-Base-Diesel.md` (status do PRD-025 e contagem) e o histórico de versões.

- [ ] **Step 6: Commit**

```bash
git add docs/prds CHANGELOG.md src
git commit -m "docs(copilot): mark PRD-025 done, add deltas, bump version (Copilot)"
```

---

## Self-Review (executado na escrita do plano)

**Cobertura RF → tarefa:** RF-001/002 → T6 (resolvePlacement) + T10/T11/T12 (3 variantes). RF-003 → T9 (selo) + T9 `CopilotReply` (separação). RF-004 → T4 `buildBriefing`. RF-005 → T4 `summaryFromSdr`/`mockSummaryFromMessages`. RF-006–009 → T3 (regras) + T9 (item). RF-010 → T7 (dismiss local) + T9 (botão). RF-011 → T2/T4/T5. RF-012 → T9 `CopilotReply` (botão inerte). RNF-002 → T7 (error) + T12. RNF-003/005 → T9/T10 (tokens, a11y). RNF-006 → T12. Todas cobertas.

**Placeholder scan:** sem "TBD"/"implementar depois". As únicas instruções "siga o padrão do vizinho" (stub supabase, abas da Ficha, export do barrel) apontam para arquivos concretos a espelhar — não são lógica em aberto.

**Consistência de tipos/nomes:** `ICopilotPanelData` (sem `placement`), `useCopilotPanel` retorna `ICopilotPanelState` (com `placement` + `dismiss`), `runCopilotRules`/`ICopilotRuleContext`, `resolvePlacement`/`DEFAULT_COPILOT_PLACEMENT`, `mockCopilotProvider`/`supabaseCopilotProvider`, `useCopilotProvider`, `escalation.contextSummary`, `messages.list(...).data`, tokens `warning`/`info`/`success`/`primary` — consistentes entre tasks.
