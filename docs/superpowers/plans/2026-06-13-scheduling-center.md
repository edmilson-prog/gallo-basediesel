# Central de Agendamento de Mensagens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o split-button de agendamento por uma Central de Agendamento dedicada (entrada por ícone ⏰), com 4 modos de exibição (Modal padrão / Lateral / Inline / Timeline), rascunho, agendamento de mídia (imagem/vídeo/áudio/documento) e fila global por papel (Owner/Gestor), reaproveitando o disparo server-side já existente.

**Architecture:** Núcleo único (estado + subcomponentes compartilhados) renderizado por 4 "cascas" (shells) intercambiáveis — o seletor só troca a casca, nenhuma lógica de agendamento vive nas cascas. Os dados continuam na tabela `scheduled_sends` (sem nova fronteira de RLS — store-scoped), o disparo segue no worker `scheduled-send-worker` + `pg_cron` (estendido para mídia), e o composer principal volta a ter um único botão **Enviar**.

**Tech Stack:** React 19 + TypeScript strict, TanStack Query, Tailwind v4 + shadcn/ui (Dialog/Sheet/Drawer/Tabs/ToggleGroup), Zustand (mock store), Vitest, Supabase (Postgres + Edge Functions/Deno), bun.

**Spec de referência:** `docs/superpowers/specs/2026-06-13-scheduling-center-design.md` (aprovado). Cada tarefa cita a seção do spec que cobre.

**Branch:** `feat/scheduling-center` (já criada — confirme com `git branch --show-current` antes de começar).

---

## Convenções desta base de código (leia antes de começar)

- **Idioma:** código, identificadores e comentários em **inglês**; toda string de UI em **português do Brasil com acentos corretos** (UTF-8 — nunca `nao`/`midia`/`horario`).
- **Tokens semânticos apenas** em componentes: `bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`, e severidades `text-severity-{info|success|warning|critical}` / `bg-severity-{...}/10`. **Proibido** hex cru ou `red-500` (o `ScheduledList` atual viola isso e será removido).
- **Provider Pattern:** features acessam dados só via `@/providers/data` (hooks `useXxxProvider()`); nunca importam `@/mocks` direto (fronteira ESLint). A camada de provider é a única que toca o mock.
- **Build NÃO faz type-check.** O gate prático é `bun run test` + `bun run build`. Rode `bunx tsc --noEmit` à parte para checagem de tipos; há baseline de erros pré-existentes — avalie **código novo por delta** (`git diff --name-status main...HEAD --diff-filter=A`).
- **Commits:** Conventional Commits em inglês, atômicos. Trailer ao final de cada mensagem de commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **`git add` por nome de arquivo** — nunca `git add -A`/`git add .`.
- **NUNCA commitar** `src/routeTree.gen.ts` (gerado) nem `vite.config.ts` (alteração local do usuário). Eles aparecem como modificados no working tree — deixe-os de fora de todo `git add`.
- **Migrations:** todo `apply_migration` via MCP Supabase deve ser **espelhado** num arquivo em `supabase/migrations/` no mesmo commit. Produção (`njizaasajkdqptlxddqn`) é **LIVE** — aplicar migration e redeploy de Edge Function exigem **aprovação explícita do dono** (o passo está marcado ⚠️ APROVAÇÃO nas tarefas).
- **Camada `src/providers/whatsapp/`** é runtime-agnostic (só Web APIs + imports relativos sem `.ts`). Mudou algo nela ⇒ rode `bunx tsx scripts/sync-whatsapp-shared.ts` (espelha em `supabase/functions/_shared/whatsapp/` adicionando `.ts` aos imports) e **redeploy** do worker.

---

## File Structure

**Criar:**

```
src/features/quick-send/components/scheduling/
  SchedulingCenter.tsx          # orquestrador: detém estado + dados + escolhe a casca
  ScheduleButton.tsx            # ícone ⏰ + badge no composer (entrada)
  ScheduleModeSwitcher.tsx      # segmented control ▣▦▤≣ (troca a casca)
  ScheduleComposerForm.tsx      # mensagem/legenda + MediaAttachField + ScheduleTimePicker + footer
  ScheduleTimePicker.tsx        # presets + datetime + frase de confirmação + aviso 24h
  MediaAttachField.tsx          # anexar/preview/remover 1 mídia (upload no anexo → storageRef)
  ScheduledItemCard.tsx         # card unitário (preview, status, editar, cancelar)
  ScheduledQueueList.tsx        # lista de agendados da conversa
  DraftsList.tsx                # rascunhos (sem horário)
  GlobalQueueList.tsx           # fila global (Owner/Gestor) com destinatário
  shells/SchedulingModalShell.tsx
  shells/SchedulingDrawerShell.tsx
  shells/SchedulingInlineShell.tsx
  shells/SchedulingTimelineShell.tsx
  types.ts                      # ISchedulingShellProps + SchedulingTab (contrato casca↔núcleo)
src/features/quick-send/hooks/
  useSchedulingViewMode.ts      # modo atual (persistido em localStorage) — padrão useAssetPickerMode
  useSchedulingComposer.ts      # estado do form (costura o engine puro)
  useScheduleMediaUpload.ts     # upload de 1 anexo → { mediaPath, mediaType, fileName, previewUrl }
  useGlobalScheduled.ts         # fila global (Owner/Gestor)
src/features/quick-send/engine/scheduleComposer.ts        # lógica pura do form (validação + build de payload)
src/features/quick-send/engine/scheduleComposer.test.ts
src/features/quick-send/hooks/__tests__/useSchedulingViewMode.test.ts  # normalizador puro (env node, sem DOM)
supabase/migrations/20260613170000_scheduled_sends_drafts_and_media.sql
```

**Modificar:**

```
src/shared/types/quickSend.ts                       # status draft; scheduledFor nullable; payload media; IScheduledSendWithContext; contrato create+listStore
src/features/quick-send/engine/scheduledSend.ts     # formatScheduleConfirm (dia da semana + fuso)
src/features/quick-send/engine/scheduledSend.test.ts# (criar se não existir) casos da nova função
src/features/quick-send/i18n/pt-BR.ts               # microcopy da Central (§11 do spec)
src/providers/data/contracts/scheduledSend.ts       # (re-export — confirmar listStore visível)
src/providers/data/impl/mock/scheduledSend.ts       # draft/listStore/media
src/providers/data/impl/supabase/scheduledSend.ts   # draft/listStore/media; scheduled_for nullable
src/mocks/api/scheduledSend.ts                       # create respeita status draft + listStore
src/providers/whatsapp/scheduled/core.ts            # caso media → kind:"media"
src/providers/whatsapp/scheduled/core.test.ts       # caso media
src/config/themes.ts                                 # LOCALSTORAGE_KEYS.schedulingViewMode
src/features/quick-send/hooks/useScheduledSendRunner.ts  # caso media (mock degradado)
src/features/quick-send/index.ts                     # barrel: + SchedulingCenter/ScheduleButton; − ScheduleSendMenu/ScheduledList
src/features/conversations/components/MessageInput.tsx   # remove split-button; ScheduleButton + SchedulingCenter; Enviar único
src/features/conversations/pages/ConversationPage.tsx    # remove <ScheduledList/> montado (mantém runner)
```

**Remover (função migrou para a Central):**

```
src/features/quick-send/components/ScheduleSendMenu.tsx
src/features/quick-send/components/ScheduledList.tsx
```

---

## Mapa de tarefas (ordem de execução, menor → maior risco)

1. Migration: `scheduled_for` nullable + status `draft`
2. Tipos de domínio + i18n (fundação)
3. Engine: `formatScheduleConfirm` (TDD)
4. Worker core: caso `media` (TDD) + sync + redeploy ⚠️
5. Providers: contrato + mock api/provider + supabase (draft/listStore/media) (TDD no mock)
6. `useSchedulingViewMode` + localStorage key (TDD)
7. `useSchedulingComposer` (estado do form, TDD) + `useGlobalScheduled` + `useScheduleMediaUpload`
8. Núcleo: `ScheduleTimePicker` + `MediaAttachField`
9. Núcleo: `ScheduleComposerForm` + `ScheduledItemCard` + `ScheduledQueueList` + `DraftsList`
10. Núcleo: `GlobalQueueList` + `ScheduleModeSwitcher` + `types.ts`
11. As 4 cascas + `SchedulingCenter`
12. `ScheduleButton` (ícone + badge)
13. Integração no `MessageInput` + `ConversationPage`
14. Barrel + remoção de `ScheduleSendMenu`/`ScheduledList`
15. Runner mock: caso `media` (degradado)
16. Verificação final (build + test + tsc delta) + smoke manual

---

### Task 1: Migration — `scheduled_for` nullable + status `draft`

Cobre spec §6.2. Aditivo e seguro: torna `scheduled_for` opcional (rascunhos), formaliza o conjunto de status incluindo `draft`, e garante a invariante "todo `pending` tem horário" (o que mantém o claim RPC correto sem alterá-lo).

**Files:**
- Create: `supabase/migrations/20260613170000_scheduled_sends_drafts_and_media.sql`

- [ ] **Step 1: Inspecionar o estado atual da tabela (read-only)**

Via MCP Supabase `execute_sql` (projeto `njizaasajkdqptlxddqn`):

```sql
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'scheduled_sends'
order by ordinal_position;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.scheduled_sends'::regclass;
```

Esperado: ver `scheduled_for` como `NOT NULL` e descobrir se há algum CHECK em `status` (provavelmente não — coluna `text` livre, default `pending`). Anote o nome de qualquer CHECK de status para reusar/dropar.

- [ ] **Step 2: Escrever o arquivo de migration (espelho Git)**

Crie `supabase/migrations/20260613170000_scheduled_sends_drafts_and_media.sql`:

```sql
-- Scheduling Center (Fase 1): drafts + media.
-- 1) Drafts have no time → scheduled_for becomes nullable.
-- 2) Formalize the status set including 'draft'.
-- 3) Invariant: every 'pending' row MUST have a time (keeps claim_due_scheduled_sends
--    correct without touching it — drafts/null never become "due").
-- payload gains media fields, but it is a jsonb column → no DDL needed for that.

alter table public.scheduled_sends
  alter column scheduled_for drop not null;

alter table public.scheduled_sends
  drop constraint if exists scheduled_sends_status_check;
alter table public.scheduled_sends
  add constraint scheduled_sends_status_check
  check (status in ('draft', 'pending', 'sent', 'cancelled', 'failed'));

alter table public.scheduled_sends
  drop constraint if exists scheduled_sends_pending_needs_time;
alter table public.scheduled_sends
  add constraint scheduled_sends_pending_needs_time
  check (status <> 'pending' or scheduled_for is not null);
```

- [ ] **Step 3: ⚠️ APROVAÇÃO — aplicar a migration em produção**

Produção é LIVE. **Pare e peça aprovação explícita do dono** antes de aplicar. Com aprovação, aplique via MCP `apply_migration` com `name: "scheduled_sends_drafts_and_media"` e exatamente o SQL do Step 2 (o nome do arquivo e o `name` do apply devem casar).

- [ ] **Step 4: Verificar a aplicação**

Repita as consultas do Step 1. Esperado: `scheduled_for` agora `YES` (nullable); existir `scheduled_sends_status_check` com os 5 valores e `scheduled_sends_pending_needs_time`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260613170000_scheduled_sends_drafts_and_media.sql
git commit -m "feat(db): scheduled_sends drafts (nullable time) and draft status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Tipos de domínio + i18n (fundação)

Cobre spec §6.1 e §11. Muda só tipos e strings; mantém o build verde ajustando os poucos consumidores que dependem da forma do `payload`. **Não** toca o contrato do provider ainda (isso é a Task 5, para que interface e implementações mudem juntas).

**Files:**
- Modify: `src/shared/types/quickSend.ts`
- Modify: `src/features/quick-send/i18n/pt-BR.ts`
- Modify: `src/features/quick-send/components/ScheduledList.tsx` (ajuste mínimo p/ compilar até a remoção na Task 14)
- Modify: `src/providers/data/impl/supabase/scheduledSend.ts` (apenas `scheduled_for: string | null` na Row)

- [ ] **Step 1: Estender os tipos em `src/shared/types/quickSend.ts`**

Substitua o bloco `ScheduledSendStatus`/`IScheduledSend` (linhas 82–99 do arquivo atual) por:

```ts
export type ScheduledSendStatus = "draft" | "pending" | "sent" | "cancelled" | "failed";

/** Media kinds a scheduled message can carry (1 attachment per message in Fase 1). */
export type ScheduledMediaType = "image" | "video" | "audio" | "document";

export interface IScheduledSend {
  id: ID;
  storeId: ID;
  conversationId: ID;
  /** Null only for drafts; pending/sent/failed always carry a time. */
  scheduledFor: ISO8601 | null;
  payload: {
    type: "snippet" | "media" | "asset" | "combo" | "product";
    /** Plain text (snippet) OR caption (media). */
    contextMessage?: string;
    // media fields (type === "media"):
    /** Object path in the whatsapp-media bucket (IMediaAsset.storageRef). */
    mediaPath?: string;
    mediaType?: ScheduledMediaType;
    /** Original filename — labels documents on the recipient side. */
    fileName?: string;
    // legacy kinds (unchanged):
    assetIds?: ID[];
    quickReplyId?: ID;
    productId?: ID;
  };
  status: ScheduledSendStatus;
  failureReason?: string;
  createdBy: ID;
  createdAt: ISO8601;
}

/** Scheduled row enriched with its recipient — used by the global queue. */
export interface IScheduledSendWithContext extends IScheduledSend {
  customerName: string | null;
  customerPhone: string | null;
}
```

- [ ] **Step 2: Estender o contrato `IScheduledSendProvider` (apenas tipo `create`)**

No mesmo arquivo, atualize `create` para aceitar um `status` opcional restrito (rascunho/agendado). **Não** adicione `listStore` aqui ainda (Task 5). Substitua a linha `create(...)` da interface por:

```ts
  create(
    input: Omit<IScheduledSend, "id" | "storeId" | "status" | "createdAt"> & {
      /** Default "pending"; pass "draft" to save without a time. */
      status?: Extract<ScheduledSendStatus, "draft" | "pending">;
    },
  ): Promise<IScheduledSend>;
```

> Como `create` agora aceita `status`, os dois providers continuam compilando (o campo é opcional e eles ignoram por ora; a Task 5 implementa o uso).

- [ ] **Step 3: Adicionar microcopy da Central em `src/features/quick-send/i18n/pt-BR.ts`**

Dentro do grupo `schedule: { ... }` (após a linha `sentBadge: "Enviado",`), **adicione** as chaves abaixo (append-only; não renomeie/remova as existentes). Ajuste também `scheduledToast` (remoção do "não precisa clicar em Enviar", desnecessário sem o caret) e adicione `payloadMedia`:

```ts
    // Scheduling Center (Fase 1)
    payloadMedia: "Mídia",
    centerTitle: "Agendar mensagem",
    centerContext: (nome: string, fone: string) => `Conversa com ${nome} · ${fone}`,
    tabNew: "Novo agendamento",
    tabScheduled: (n: number) => `Agendados · ${n}`,
    tabAll: (n: number) => `Todos · ${n}`,
    entryTooltip: "Agendar mensagem",
    fieldLabel: "Mensagem",
    fieldLabelMedia: "Mensagem / legenda",
    fieldPlaceholder: "Escreva a mensagem que será enviada no horário escolhido…",
    attach: "Anexar",
    attachImage: "Imagem",
    attachVideo: "Vídeo",
    attachAudio: "Áudio",
    attachDocument: "Documento",
    attachFailed: "Falha no upload. Tentar de novo.",
    whenLabel: "Quando enviar",
    confirmLine: (frase: string) => frase, // formatScheduleConfirm já entrega a frase completa
    window24hWarn:
      "Fora da janela de 24h — pode falhar se o cliente não responder antes. Considere um template.",
    useTemplate: "Usar template",
    ctaSchedule: "Agendar",
    ctaSaveDraft: "Salvar rascunho",
    ctaSaveEdit: "Salvar alterações",
    draftSaved: "Rascunho salvo.",
    draftNoTime: "Sem horário definido",
    setTime: "Definir horário",
    draftsTitle: (n: number) => `Rascunhos · ${n}`,
    deleteDraft: "Excluir",
    discardConfirmTitle: "Descartar agendamento?",
    discardConfirmBody: "O texto e os anexos serão perdidos.",
    discardConfirmCancel: "Continuar editando",
    discardConfirmOk: "Descartar",
    disabledEmpty: "Escreva uma mensagem ou anexe um arquivo.",
    disabledNoTime: "Escolha uma data e hora.",
    emptyConversation: "Nenhuma mensagem agendada nesta conversa.",
    emptyGlobal: "Nenhuma mensagem agendada na loja.",
    createCta: "Criar agendamento",
    reschedule: "Reagendar",
    recipient: (nome: string) => `Para ${nome}`,
    modeModal: "Modal",
    modeDrawer: "Lateral",
    modeInline: "Inline",
    modeTimeline: "Timeline",
    modeSwitcherLabel: "Modo de exibição",
```

E **substitua** a linha existente do `scheduledToast`:

```ts
    scheduledToast: (when: string) => `Mensagem agendada para ${when}.`,
```

- [ ] **Step 4: Manter `ScheduledList.tsx` compilando até sua remoção (Task 14)**

`PAYLOAD_LABEL` em `ScheduledList.tsx` é um `Record` exaustivo sobre `payload.type`, que agora inclui `"media"`. Adicione a entrada para o TS aceitar o record. No objeto `PAYLOAD_LABEL` (linhas ~17–25), adicione:

```ts
  media: "payloadMedia",
```

(de modo que fique `asset/snippet/combo/product/media`). Sem essa linha o build quebra com "Property 'media' is missing".

- [ ] **Step 5: Ajustar a Row do supabase para `scheduled_for` nullable**

Em `src/providers/data/impl/supabase/scheduledSend.ts`, no `interface ScheduledSendRow`, troque:

```ts
  scheduled_for: string;
```

por

```ts
  scheduled_for: string | null;
```

`rowToScheduledSend` já atribui `scheduledFor: row.scheduled_for` — agora o tipo bate com `ISO8601 | null`.

- [ ] **Step 6: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: nenhum erro **novo** introduzido por estes arquivos (cruze com o baseline). `bun run build` conclui sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/quickSend.ts src/features/quick-send/i18n/pt-BR.ts src/features/quick-send/components/ScheduledList.tsx src/providers/data/impl/supabase/scheduledSend.ts
git commit -m "feat(types): scheduled send draft status, nullable time, media payload + center i18n

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Engine — `formatScheduleConfirm` (dia da semana + fuso)

Cobre spec §8.2 ("Será enviado {dia da semana}, {dd/mm} às {hh:mm} (horário de Brasília)."). Função pura, TDD. **Mantém** `formatScheduleLabel` (usado em cards/toasts) e `validateFuture`/`isDue` intactos.

**Files:**
- Modify: `src/features/quick-send/engine/scheduledSend.ts`
- Test: `src/features/quick-send/engine/scheduledSend.test.ts` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/features/quick-send/engine/scheduledSend.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatScheduleConfirm, formatScheduleLabel, validateFuture } from "./scheduledSend";

describe("formatScheduleConfirm", () => {
  it("builds a natural-language confirmation with weekday, date, time and timezone", () => {
    // 2026-06-13 is a Saturday. Construct via local parts (machine is BRT).
    const iso = new Date(2026, 5, 13, 14, 29).toISOString();
    expect(formatScheduleConfirm(iso)).toBe(
      "Será enviado sábado, 13/06 às 14:29 (horário de Brasília).",
    );
  });

  it("zero-pads day, month, hour and minute", () => {
    const iso = new Date(2026, 0, 5, 9, 7).toISOString(); // 2026-01-05 09:07, a Monday
    expect(formatScheduleConfirm(iso)).toBe(
      "Será enviado segunda-feira, 05/01 às 09:07 (horário de Brasília).",
    );
  });

  it("returns empty string for null/invalid input (drafts have no time)", () => {
    expect(formatScheduleConfirm(null)).toBe("");
    expect(formatScheduleConfirm("not-a-date")).toBe("");
  });

  it("keeps the short label helper working (regression)", () => {
    const iso = new Date(2026, 5, 13, 14, 29).toISOString();
    expect(formatScheduleLabel(iso)).toBe("13/06 às 14:29");
    expect(validateFuture(iso, new Date(2026, 5, 13, 14, 0).toISOString()).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
bunx vitest run src/features/quick-send/engine/scheduledSend.test.ts
```

Esperado: FAIL — `formatScheduleConfirm` não existe.

- [ ] **Step 3: Implementar a função**

Em `src/features/quick-send/engine/scheduledSend.ts`, troque a assinatura de import da linha 1 e **adicione** a função ao final do arquivo:

```ts
const WEEKDAYS_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

/**
 * Natural-language confirmation of a scheduled time in the viewer's local zone:
 * "Será enviado sábado, 13/06 às 14:29 (horário de Brasília)." Returns an empty
 * string for null/invalid input so drafts (no time) render nothing.
 */
export function formatScheduleConfirm(scheduledFor: ISO8601 | null): string {
  if (!scheduledFor) return "";
  const at = Date.parse(scheduledFor);
  if (Number.isNaN(at)) return "";
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = WEEKDAYS_PT[d.getDay()];
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `Será enviado ${weekday}, ${date} às ${time} (horário de Brasília).`;
}
```

> O label "(horário de Brasília)" é fixo por decisão de produto (loja única em Frederico Westphalen/RS, BRT). Não há conversão de fuso — exibimos a hora local do navegador, que para os usuários da loja é BRT.

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
bunx vitest run src/features/quick-send/engine/scheduledSend.test.ts
```

Esperado: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/quick-send/engine/scheduledSend.ts src/features/quick-send/engine/scheduledSend.test.ts
git commit -m "feat(quick-send): formatScheduleConfirm natural-language label with weekday + tz

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Worker core — caso `media` (TDD) + sync + redeploy

Cobre spec §10. O núcleo puro `scheduled/core.ts` passa a mapear `payload.type === "media"` para `{ kind: "media", ... }`; `processSendRequest` já assina o `mediaPath` do bucket (nenhuma mudança no `send/core.ts`). Depois sincroniza o espelho `_shared/` e redeploya o worker.

**Files:**
- Modify: `src/providers/whatsapp/scheduled/core.ts`
- Modify: `src/providers/whatsapp/scheduled/core.test.ts`
- Sync (gerado): `supabase/functions/_shared/whatsapp/scheduled/core.ts`

- [ ] **Step 1: Adicionar os casos de teste de mídia (falham primeiro)**

Em `src/providers/whatsapp/scheduled/core.test.ts`, **adicione** um novo `describe` ao final:

```ts
describe("buildScheduledSendRequest — media (image/video/audio/document)", () => {
  it("maps a media payload to a media send request with path, type, filename and caption", () => {
    const req = buildScheduledSendRequest("conv-1", {
      type: "media",
      mediaPath: "store-1/2026/06/turbo-scania.jpg",
      mediaType: "image",
      fileName: "turbo-scania.jpg",
      contextMessage: "Segue o orçamento do turbo.",
    });
    expect(req).toEqual({
      conversationId: "conv-1",
      kind: "media",
      mediaPath: "store-1/2026/06/turbo-scania.jpg",
      mediaType: "image",
      fileName: "turbo-scania.jpg",
      text: "Segue o orçamento do turbo.",
    });
  });

  it("allows media with no caption (empty text)", () => {
    const req = buildScheduledSendRequest("conv-1", {
      type: "media",
      mediaPath: "store-1/a.pdf",
      mediaType: "document",
      fileName: "a.pdf",
    });
    expect(req.text).toBe("");
    expect(req.kind).toBe("media");
  });

  it("rejects media without a mediaPath with VALIDATION_ERROR", () => {
    try {
      buildScheduledSendRequest("conv-1", { type: "media", mediaType: "image" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WhatsAppProviderError);
      expect((err as WhatsAppProviderError).code).toBe("VALIDATION_ERROR");
    }
  });
});
```

Atualize também o `it.each` de "unsupported payload types" para **remover** `media` da lista (ela passou a ser suportada) — a lista deve permanecer `["asset", "combo", "product"]` (já está; confirme que `media` não foi adicionada lá).

- [ ] **Step 2: Rodar e ver falhar**

```bash
bunx vitest run src/providers/whatsapp/scheduled/core.test.ts
```

Esperado: FAIL — media cai no ramo `NOT_SUPPORTED`.

- [ ] **Step 3: Implementar o caso `media` no núcleo**

Em `src/providers/whatsapp/scheduled/core.ts`:

(a) Estenda a interface `IScheduledPayload` (adicione os campos de mídia e `media` ao `type`):

```ts
export interface IScheduledPayload {
  type: "asset" | "snippet" | "combo" | "product" | "media";
  assetIds?: string[];
  quickReplyId?: string;
  productId?: string;
  contextMessage?: string;
  // media fields (type === "media"):
  mediaPath?: string;
  mediaType?: "image" | "video" | "audio" | "document";
  fileName?: string;
}
```

(b) Substitua o corpo de `buildScheduledSendRequest` (do `if (payload.type !== "snippet")` até o `return`) por:

```ts
  if (payload.type === "media") {
    const mediaPath = (payload.mediaPath ?? "").trim();
    if (!mediaPath) {
      throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "Mídia agendada sem arquivo.");
    }
    return {
      conversationId,
      kind: "media",
      mediaPath,
      mediaType: payload.mediaType,
      fileName: payload.fileName,
      text: (payload.contextMessage ?? "").trim(),
    };
  }
  if (payload.type !== "snippet") {
    throw new WhatsAppProviderError(
      "NOT_SUPPORTED",
      422,
      `Agendamento do tipo "${payload.type}" não é enviado automaticamente pelo servidor (apenas texto e mídia).`,
    );
  }
  const text = (payload.contextMessage ?? "").trim();
  if (!text) {
    throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "Mensagem agendada vazia.");
  }
  return { conversationId, kind: "text", text };
```

(c) Atualize o docstring do arquivo (o parágrafo "Only the `snippet` payload …") para mencionar que `snippet` e `media` são despacháveis; `asset/combo/product` seguem `NOT_SUPPORTED`.

- [ ] **Step 4: Rodar e ver passar**

```bash
bunx vitest run src/providers/whatsapp/scheduled/core.test.ts
```

Esperado: PASS (todos os describes, incluindo os de mídia).

- [ ] **Step 5: Sincronizar o espelho `_shared/`**

```bash
bunx tsx scripts/sync-whatsapp-shared.ts
```

Confirme que `supabase/functions/_shared/whatsapp/scheduled/core.ts` foi regenerado com o caso `media` (imports relativos agora com `.ts`). **Não** edite o arquivo gerado à mão. Ignore arquivos do espelho que apareçam como "modified" apenas por CRLF (`git diff --ignore-all-space` mostra zero mudança de conteúdo) — não os commite.

- [ ] **Step 6: ⚠️ APROVAÇÃO — redeploy do worker**

Produção é LIVE. **Pare e peça aprovação do dono.** Com aprovação, redeploy via Supabase CLI (caminho preferido):

```bash
npx supabase functions deploy scheduled-send-worker --project-ref njizaasajkdqptlxddqn --no-verify-jwt
```

> O worker usa gate por `x-worker-secret` (não JWT) — por isso `--no-verify-jwt`. Sem o redeploy, mídia agendada falha em produção com `NOT_SUPPORTED`.

- [ ] **Step 7: Commit**

```bash
git add src/providers/whatsapp/scheduled/core.ts src/providers/whatsapp/scheduled/core.test.ts supabase/functions/_shared/whatsapp/scheduled/core.ts
git commit -m "feat(whatsapp): dispatch scheduled media sends server-side

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> Se o espelho `_shared/whatsapp/scheduled/core.ts` não constar como alterado por conteúdo (só CRLF), inclua somente os dois arquivos de `src/`.

---

### Task 5: Providers — `listStore` + create-draft + media (mock + supabase)

Cobre spec §6.3, §7. Adiciona `listStore` ao contrato e implementa, em ambos os backends, (a) `create` respeitando `status:"draft"` com `scheduledFor: null`, e (b) a fila global com destinatário. RLS é store-scoped (sem migration de policy). Sem teste unitário — não há padrão de teste de mock store nesta base; o gate é `tsc` + `build` + smoke. (As funções puras já estão cobertas nas Tasks 3 e 7.)

**Files:**
- Modify: `src/shared/types/quickSend.ts` (interface — adicionar `listStore`)
- Modify: `src/mocks/api/scheduledSend.ts`
- Modify: `src/providers/data/impl/mock/scheduledSend.ts`
- Modify: `src/providers/data/impl/supabase/scheduledSend.ts`

- [ ] **Step 1: Adicionar `listStore` ao contrato `IScheduledSendProvider`**

Em `src/shared/types/quickSend.ts`, dentro de `interface IScheduledSendProvider`, **adicione** (após `markFailed`):

```ts
  /**
   * Store-wide scheduled queue with recipient context (Owner/Gestor only — the
   * role gate is in the UI). Store-scoped by RLS, so no extra security boundary.
   * Defaults to pending rows.
   */
  listStore(params?: { status?: ScheduledSendStatus[] }): Promise<IScheduledSendWithContext[]>;
```

- [ ] **Step 2: Mock API — `create` respeita status e `listStore` resolve o destinatário**

Em `src/mocks/api/scheduledSend.ts`:

(a) Atualize os imports do topo:

```ts
import type { ID, ISO8601, IScheduledSend, IScheduledSendWithContext, ICustomer } from "@/shared/types";
import {
  selectAllScheduledSends,
  selectScheduledSendsByConversation,
  selectConversationById,
  selectCustomerById,
} from "../store/selectors";
```

(b) Substitua o método `create` por uma versão que respeita `status` (default `pending`) e aceita `scheduledFor` null:

```ts
  create(
    input: Omit<IScheduledSend, "id" | "createdAt" | "status"> & {
      status?: IScheduledSend["status"];
    },
  ): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "create",
      () => {
        const send: IScheduledSend = {
          ...input,
          id: `sched-${crypto.randomUUID()}`,
          status: input.status ?? "pending",
          createdAt: new Date().toISOString(),
        };
        upsert("scheduledSends", send);
        return send;
      },
      { payload: input },
    );
  },
```

(c) **Adicione** o método `listStore` (antes do `_getById`):

```ts
  listStore(params?: { status?: IScheduledSend["status"][] }): Promise<IScheduledSendWithContext[]> {
    const statuses = params?.status ?? ["pending"];
    return runApi(
      "scheduledSendApi",
      "listStore",
      () =>
        selectAllScheduledSends()
          .filter((s) => statuses.includes(s.status))
          .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""))
          .map((s) => {
            const conv = selectConversationById(s.conversationId);
            const customer = conv?.customerId ? selectCustomerById(conv.customerId) : null;
            const ctx = resolveCustomerContext(customer ?? null);
            return { ...s, customerName: ctx.name, customerPhone: ctx.phone };
          }),
      { payload: { statuses } },
    );
  },
```

(d) **Adicione** o helper puro de display (acima de `export const scheduledSendApi`):

```ts
/** Recipient name/phone for the global queue. B2B → trade/legal name; B2C → full name. */
function resolveCustomerContext(c: ICustomer | null): { name: string | null; phone: string | null } {
  if (!c) return { name: null, phone: null };
  const name =
    c.type === "B2B"
      ? c.nomeFantasia || c.razaoSocial || c.contactName || null
      : c.fullName || null;
  return { name, phone: c.phone ?? null };
}
```

> Se `selectConversationById`/`selectCustomerById` não estiverem exportados de `../store/selectors`, eles existem no arquivo (linhas 47 e 23 atualmente) — apenas garanta o `export`. `IConversation.customerId` e os campos `nomeFantasia`/`razaoSocial`/`contactName` (B2B) / `fullName` (B2C) já existem no modelo.

- [ ] **Step 3: Mock provider — repassar status no create e expor `listStore`**

Em `src/providers/data/impl/mock/scheduledSend.ts`, substitua o objeto inteiro por:

```ts
import type { ID, IScheduledSend, IScheduledSendWithContext, ScheduledSendStatus } from "@/shared/types";
import { scheduledSendApi } from "@/mocks";
import type { IScheduledSendProvider } from "../../contracts/scheduledSend";
import { logMockMutation } from "./_audit";
import { withCreateStoreId } from "./_storeScope";

export const mockScheduledSendProvider: IScheduledSendProvider = {
  list: (conversationId) => scheduledSendApi.list(conversationId),

  listDue: (now) => scheduledSendApi.listDue(now),

  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await scheduledSendApi.create(scoped);
    logMockMutation({
      action: "create",
      resource: "scheduled_send",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  update: (id, patch) => scheduledSendApi.update(id, patch),

  cancel: async (id) => {
    const updated = await scheduledSendApi.cancel(id);
    logMockMutation({
      action: "cancel",
      resource: "scheduled_send",
      resourceId: id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  markSent: (id) => scheduledSendApi.markSent(id),

  markFailed: (id, reason) => scheduledSendApi.markFailed(id, reason),

  listStore: (params?: { status?: ScheduledSendStatus[] }): Promise<IScheduledSendWithContext[]> =>
    scheduledSendApi.listStore(params),
};
```

- [ ] **Step 4: Supabase provider — create respeita status/tempo-null e `listStore` (3 queries)**

Em `src/providers/data/impl/supabase/scheduledSend.ts`:

(a) Atualize os imports do topo:

```ts
import type {
  ID,
  ISO8601,
  IScheduledSend,
  IScheduledSendWithContext,
  ScheduledSendStatus,
} from "@/shared/types";
```

(b) No método `create`, troque a montagem da `row` para respeitar status e horário nulo. Substitua as duas linhas:

```ts
      scheduled_for: input.scheduledFor,
```
```ts
      status: "pending" as ScheduledSendStatus,
```

por

```ts
      scheduled_for: input.scheduledFor ?? null,
```
```ts
      status: ((input as { status?: ScheduledSendStatus }).status ?? "pending") as ScheduledSendStatus,
```

(c) **Adicione** o método `listStore` ao objeto `supabaseScheduledSendProvider` (após `markFailed`):

```ts
  async listStore(params?: {
    status?: ScheduledSendStatus[];
  }): Promise<IScheduledSendWithContext[]> {
    const statuses = params?.status ?? (["pending"] as ScheduledSendStatus[]);
    const client = getSupabaseClient();
    // (1) store-wide scheduled rows — RLS already limits to current_store_id().
    const { data: rows, error } = await client
      .from(TABLE)
      .select(COLUMNS)
      .in("status", statuses)
      .order("scheduled_for", { ascending: true, nullsFirst: false });
    if (error) throw new Error(`[supabase] scheduledSend.listStore failed: ${error.message}`);
    const sends = (rows as unknown as ScheduledSendRow[]).map(rowToScheduledSend);
    if (sends.length === 0) return [];

    // (2) conversation → customer_id
    const convIds = [...new Set(sends.map((s) => s.conversationId))];
    const { data: convs } = await client
      .from("conversations")
      .select("id, customer_id")
      .in("id", convIds);
    const convToCustomer = new Map<string, string | null>(
      ((convs as { id: string; customer_id: string | null }[] | null) ?? []).map((c) => [
        c.id,
        c.customer_id,
      ]),
    );

    // (3) customer → name/phone
    const custIds = [...new Set([...convToCustomer.values()].filter((v): v is string => !!v))];
    const customerCtx = new Map<string, { name: string | null; phone: string | null }>();
    if (custIds.length > 0) {
      const { data: custs } = await client
        .from("customers")
        .select("id, type, full_name, nome_fantasia, razao_social, contact_name, phone")
        .in("id", custIds);
      for (const c of (custs as CustomerContextRow[] | null) ?? []) {
        const name =
          c.type === "B2B"
            ? c.nome_fantasia || c.razao_social || c.contact_name || null
            : c.full_name || null;
        customerCtx.set(c.id, { name, phone: c.phone ?? null });
      }
    }

    return sends.map((s) => {
      const customerId = convToCustomer.get(s.conversationId) ?? null;
      const ctx = (customerId && customerCtx.get(customerId)) || { name: null, phone: null };
      return { ...s, customerName: ctx.name, customerPhone: ctx.phone };
    });
  },
```

(d) **Adicione** a interface auxiliar `CustomerContextRow` (junto de `ScheduledSendRow`, perto do topo do arquivo):

```ts
interface CustomerContextRow {
  id: string;
  type: "B2B" | "B2C";
  full_name: string | null;
  nome_fantasia: string | null;
  razao_social: string | null;
  contact_name: string | null;
  phone: string | null;
}
```

- [ ] **Step 5: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: sem erro novo; ambos os providers satisfazem `IScheduledSendProvider` (que agora exige `listStore`).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/quickSend.ts src/mocks/api/scheduledSend.ts src/providers/data/impl/mock/scheduledSend.ts src/providers/data/impl/supabase/scheduledSend.ts
git commit -m "feat(providers): scheduled send drafts, media and store-wide queue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `useSchedulingViewMode` + chave de localStorage (TDD no normalizador)

Cobre spec §8.7. Modo de exibição persistido por usuário, seguindo **exatamente** o padrão existente `useAssetPickerMode` (normalizador puro testável + hook fino com `localStorage`). Default `modal`.

**Files:**
- Modify: `src/config/themes.ts` (adicionar a chave)
- Create: `src/features/quick-send/hooks/useSchedulingViewMode.ts`
- Create: `src/features/quick-send/hooks/__tests__/useSchedulingViewMode.test.ts`

- [ ] **Step 1: Adicionar a chave de localStorage**

Em `src/config/themes.ts`, no objeto `LOCALSTORAGE_KEYS`, adicione a chave:

```ts
export const LOCALSTORAGE_KEYS = {
  theme: "gallo-theme",
  mode: "gallo-mode",
  schedulingViewMode: "gallo-scheduling-view-mode",
} as const;
```

- [ ] **Step 2: Escrever o teste do normalizador (falha primeiro)**

Crie `src/features/quick-send/hooks/__tests__/useSchedulingViewMode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SCHEDULING_VIEW_MODES,
  normalizeSchedulingViewMode,
} from "../useSchedulingViewMode";

describe("normalizeSchedulingViewMode", () => {
  it("returns the value when it is a known mode", () => {
    for (const m of SCHEDULING_VIEW_MODES) {
      expect(normalizeSchedulingViewMode(m)).toBe(m);
    }
  });

  it("falls back to 'modal' for unknown/empty input", () => {
    expect(normalizeSchedulingViewMode(null)).toBe("modal");
    expect(normalizeSchedulingViewMode(undefined)).toBe("modal");
    expect(normalizeSchedulingViewMode("bogus")).toBe("modal");
  });

  it("exposes the four modes with modal first (default)", () => {
    expect(SCHEDULING_VIEW_MODES).toEqual(["modal", "drawer", "inline", "timeline"]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
bunx vitest run src/features/quick-send/hooks/__tests__/useSchedulingViewMode.test.ts
```

Esperado: FAIL — módulo não existe.

- [ ] **Step 4: Implementar o hook**

Crie `src/features/quick-send/hooks/useSchedulingViewMode.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { LOCALSTORAGE_KEYS } from "@/config/themes";

export const SCHEDULING_VIEW_MODES = ["modal", "drawer", "inline", "timeline"] as const;
export type SchedulingViewMode = (typeof SCHEDULING_VIEW_MODES)[number];

const STORAGE_KEY = LOCALSTORAGE_KEYS.schedulingViewMode;
const DEFAULT_MODE: SchedulingViewMode = "modal";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeSchedulingViewMode(
  raw: string | null | undefined,
): SchedulingViewMode {
  return SCHEDULING_VIEW_MODES.includes(raw as SchedulingViewMode)
    ? (raw as SchedulingViewMode)
    : DEFAULT_MODE;
}

function read(): SchedulingViewMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return normalizeSchedulingViewMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persisted Scheduling Center display mode (default "modal"). Mirrors useAssetPickerMode. */
export function useSchedulingViewMode(): [SchedulingViewMode, (mode: SchedulingViewMode) => void] {
  const [mode, setMode] = useState<SchedulingViewMode>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore (private mode)
    }
  }, [mode]);

  const set = useCallback((next: SchedulingViewMode) => setMode(next), []);
  return [mode, set];
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
bunx vitest run src/features/quick-send/hooks/__tests__/useSchedulingViewMode.test.ts
```

Esperado: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add src/config/themes.ts src/features/quick-send/hooks/useSchedulingViewMode.ts src/features/quick-send/hooks/__tests__/useSchedulingViewMode.test.ts
git commit -m "feat(quick-send): persisted scheduling view mode (4 modes, modal default)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Engine do composer (puro, TDD) + hooks de estado/dados

Cobre spec §8.1, §8.6, §15. A **lógica testável** do formulário (validação + construção de payload) vai para o `engine/`; os hooks React (`useSchedulingComposer`, `useGlobalScheduled`, `useScheduleMediaUpload`) apenas costuram estado e provider.

**Files:**
- Create: `src/features/quick-send/engine/scheduleComposer.ts`
- Create: `src/features/quick-send/engine/scheduleComposer.test.ts`
- Create: `src/features/quick-send/hooks/useSchedulingComposer.ts`
- Create: `src/features/quick-send/hooks/useGlobalScheduled.ts`
- Create: `src/features/quick-send/hooks/useScheduleMediaUpload.ts`

- [ ] **Step 1: Escrever o teste do engine (falha primeiro)**

Crie `src/features/quick-send/engine/scheduleComposer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSchedulePayload,
  canSaveDraft,
  scheduleBlock,
  type IScheduleFormState,
} from "./scheduleComposer";

const NOW = new Date(2026, 5, 13, 12, 0).toISOString();
const future = new Date(2026, 5, 13, 18, 0).toISOString();
const past = new Date(2026, 5, 13, 6, 0).toISOString();

const base: IScheduleFormState = { text: "", media: null, scheduledFor: null };
const media = { mediaPath: "store/a.jpg", mediaType: "image" as const, fileName: "a.jpg", previewUrl: "blob:x" };

describe("scheduleBlock", () => {
  it("blocks 'empty' when there is no text and no media", () => {
    expect(scheduleBlock({ ...base, scheduledFor: future }, NOW)).toBe("empty");
  });
  it("blocks 'no-time' when there is content but no time", () => {
    expect(scheduleBlock({ ...base, text: "olá" }, NOW)).toBe("no-time");
  });
  it("blocks 'past' when the time is not in the future", () => {
    expect(scheduleBlock({ ...base, text: "olá", scheduledFor: past }, NOW)).toBe("past");
  });
  it("returns null (can schedule) with content and a future time", () => {
    expect(scheduleBlock({ ...base, text: "olá", scheduledFor: future }, NOW)).toBeNull();
    expect(scheduleBlock({ ...base, media, scheduledFor: future }, NOW)).toBeNull();
  });
});

describe("canSaveDraft", () => {
  it("requires content (text or media), not a time", () => {
    expect(canSaveDraft(base)).toBe(false);
    expect(canSaveDraft({ ...base, text: "  " })).toBe(false);
    expect(canSaveDraft({ ...base, text: "oi" })).toBe(true);
    expect(canSaveDraft({ ...base, media })).toBe(true);
  });
});

describe("buildSchedulePayload", () => {
  it("builds a snippet payload from text only", () => {
    expect(buildSchedulePayload({ ...base, text: "  Bom dia!  " })).toEqual({
      type: "snippet",
      contextMessage: "Bom dia!",
    });
  });
  it("builds a media payload (path/type/filename) with the trimmed caption", () => {
    expect(buildSchedulePayload({ ...base, text: " legenda ", media })).toEqual({
      type: "media",
      contextMessage: "legenda",
      mediaPath: "store/a.jpg",
      mediaType: "image",
      fileName: "a.jpg",
    });
  });
  it("omits the caption when empty on a media payload", () => {
    expect(buildSchedulePayload({ ...base, media })).toEqual({
      type: "media",
      mediaPath: "store/a.jpg",
      mediaType: "image",
      fileName: "a.jpg",
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
bunx vitest run src/features/quick-send/engine/scheduleComposer.test.ts
```

Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o engine puro**

Crie `src/features/quick-send/engine/scheduleComposer.ts`:

```ts
import type { ISO8601, IScheduledSend, ScheduledMediaType } from "@/shared/types";
import { validateFuture } from "./scheduledSend";

/** A media attachment staged in the composer (already uploaded → path known). */
export interface IScheduledMediaDraft {
  mediaPath: string;
  mediaType: ScheduledMediaType;
  fileName: string;
  /** Local/signed URL for preview only — not persisted. */
  previewUrl: string;
}

/** The Scheduling Center composer form state (lives above the shells). */
export interface IScheduleFormState {
  text: string;
  media: IScheduledMediaDraft | null;
  scheduledFor: ISO8601 | null;
}

/** Why scheduling is blocked, or null when it can proceed. */
export type ScheduleBlock = "empty" | "no-time" | "past" | null;

function hasContent(form: IScheduleFormState): boolean {
  return form.text.trim() !== "" || form.media !== null;
}

export function scheduleBlock(form: IScheduleFormState, now: ISO8601): ScheduleBlock {
  if (!hasContent(form)) return "empty";
  if (!form.scheduledFor) return "no-time";
  if (!validateFuture(form.scheduledFor, now).ok) return "past";
  return null;
}

/** Drafts only require content (text or media), never a time. */
export function canSaveDraft(form: IScheduleFormState): boolean {
  return hasContent(form);
}

/** Maps the form to the persisted `scheduled_sends.payload` (media or snippet). */
export function buildSchedulePayload(form: IScheduleFormState): IScheduledSend["payload"] {
  const caption = form.text.trim();
  if (form.media) {
    return {
      type: "media",
      ...(caption ? { contextMessage: caption } : {}),
      mediaPath: form.media.mediaPath,
      mediaType: form.media.mediaType,
      fileName: form.media.fileName,
    };
  }
  return { type: "snippet", contextMessage: caption };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
bunx vitest run src/features/quick-send/engine/scheduleComposer.test.ts
```

Esperado: PASS (todos os describes).

- [ ] **Step 5: Implementar `useScheduleMediaUpload`**

Crie `src/features/quick-send/hooks/useScheduleMediaUpload.ts`:

```ts
import { useCallback } from "react";
import { toast } from "sonner";
import type { IConversation, IMediaUploadInput, ScheduledMediaType } from "@/shared/types";
import { getActiveDataSource, useMediaStorageProvider } from "@/providers/data";
import type { IScheduledMediaDraft } from "../engine/scheduleComposer";

/** Per-kind size caps for scheduled attachments (mirror useAttachmentUpload + video). */
const MAX_SIZE_BYTES: Record<ScheduledMediaType, number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

/** File-picker `accept` per kind. */
export const SCHEDULE_ATTACH_ACCEPT: Record<ScheduledMediaType, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.xml,.zip",
};

const FALLBACK_MIME: Record<ScheduledMediaType, string> = {
  image: "image/jpeg",
  video: "video/mp4",
  audio: "audio/mpeg",
  document: "application/pdf",
};

export interface IUseScheduleMediaUploadResult {
  /**
   * Uploads the picked file to the whatsapp-media bucket (PRD-026) and returns
   * the persisted `storageRef` as `mediaPath` (NOT a signed URL — that expires;
   * the worker signs the path at dispatch time). Returns null when rejected
   * (size cap — already toasted). Upload failures throw.
   */
  uploadForSchedule(file: File, kind: ScheduledMediaType): Promise<IScheduledMediaDraft | null>;
}

export function useScheduleMediaUpload(
  conversation: IConversation,
): IUseScheduleMediaUploadResult {
  const media = useMediaStorageProvider();

  const uploadForSchedule = useCallback(
    async (file: File, kind: ScheduledMediaType): Promise<IScheduledMediaDraft | null> => {
      const maxBytes = MAX_SIZE_BYTES[kind];
      if (file.size > maxBytes) {
        toast.error(`Arquivo acima do limite (${Math.round(maxBytes / 1024 / 1024)} MB).`);
        return null;
      }
      const uploaded = await media.upload({
        kind,
        mimeType: file.type || FALLBACK_MIME[kind],
        sizeBytes: file.size,
        fileName: file.name,
        conversationId: conversation.id,
        customerId: conversation.customerId,
        authorType: "seller",
        direction: "out",
        file,
        storeId: conversation.storeId,
      } as IMediaUploadInput);
      // mediaPath = persisted object path; preview = signed (supabase) or local blob (mock).
      const previewUrl =
        getActiveDataSource() === "supabase"
          ? await media.getSignedUrl(uploaded.id)
          : URL.createObjectURL(file);
      return { mediaPath: uploaded.storageRef, mediaType: kind, fileName: file.name, previewUrl };
    },
    [conversation.customerId, conversation.id, conversation.storeId, media],
  );

  return { uploadForSchedule };
}
```

- [ ] **Step 6: Implementar `useGlobalScheduled`**

Crie `src/features/quick-send/hooks/useGlobalScheduled.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { IScheduledSendWithContext } from "@/shared/types";
import { getActiveDataSource, useScheduledSendProvider } from "@/providers/data";

export const globalScheduledQueryKey = ["quick-send", "scheduled", "store"] as const;

export interface IUseGlobalScheduledResult {
  items: IScheduledSendWithContext[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Store-wide pending queue for the Owner/Gestor "Todos" tab. `enabled` gates the
 * query so it never runs for sellers. Polls lightly in supabase (server worker
 * owns dispatch) so sent/failed transitions surface without a manual refetch.
 */
export function useGlobalScheduled(enabled: boolean): IUseGlobalScheduledResult {
  const provider = useScheduledSendProvider();
  const query = useQuery({
    queryKey: globalScheduledQueryKey,
    queryFn: () => provider.listStore({ status: ["pending"] }),
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled && getActiveDataSource() === "supabase" ? 30_000 : false,
  });
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
```

- [ ] **Step 7: Implementar `useSchedulingComposer`**

Crie `src/features/quick-send/hooks/useSchedulingComposer.ts`:

```ts
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, IConversation, ISO8601, IScheduledSend } from "@/shared/types";
import { useScheduledSendProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import {
  buildSchedulePayload,
  canSaveDraft as canSaveDraftFn,
  scheduleBlock,
  type IScheduleFormState,
  type IScheduledMediaDraft,
} from "../engine/scheduleComposer";
import { scheduledSendsQueryKey } from "./useConversationScheduled";
import { globalScheduledQueryKey } from "./useGlobalScheduled";

const EMPTY_FORM: IScheduleFormState = { text: "", media: null, scheduledFor: null };

export interface IUseSchedulingComposerResult {
  form: IScheduleFormState;
  /** Id of the item being edited (draft or pending), or null when composing new. */
  editingId: ID | null;
  setText(text: string): void;
  setMedia(media: IScheduledMediaDraft | null): void;
  setScheduledFor(iso: ISO8601 | null): void;
  reset(): void;
  loadForEdit(item: IScheduledSend): void;
  /** null when it can be scheduled; otherwise the block reason. */
  block: ReturnType<typeof scheduleBlock>;
  canSaveDraft: boolean;
  /** Persists a pending (or updates the edited) send. Returns the saved row. */
  schedule(): Promise<IScheduledSend>;
  /** Persists/updates as a draft (no time). */
  saveDraft(): Promise<IScheduledSend>;
}

/**
 * Composer state for the Scheduling Center. The state lives HERE (above the
 * shells) so switching display modes never loses the in-progress message.
 * Pure validation/payload logic is delegated to engine/scheduleComposer.
 */
export function useSchedulingComposer(
  conversation: IConversation,
): IUseSchedulingComposerResult {
  const provider = useScheduledSendProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [form, setForm] = useState<IScheduleFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<ID | null>(null);

  const now = new Date().toISOString();
  const block = scheduleBlock(form, now);
  const canSaveDraft = canSaveDraftFn(form);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: scheduledSendsQueryKey(conversation.id) });
    void queryClient.invalidateQueries({ queryKey: globalScheduledQueryKey });
  }, [queryClient, conversation.id]);

  const setText = useCallback((text: string) => setForm((f) => ({ ...f, text })), []);
  const setMedia = useCallback(
    (media: IScheduledMediaDraft | null) => setForm((f) => ({ ...f, media })),
    [],
  );
  const setScheduledFor = useCallback(
    (scheduledFor: ISO8601 | null) => setForm((f) => ({ ...f, scheduledFor })),
    [],
  );
  const reset = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }, []);

  const loadForEdit = useCallback((item: IScheduledSend) => {
    setEditingId(item.id);
    setForm({
      text: item.payload.contextMessage ?? "",
      media:
        item.payload.type === "media" && item.payload.mediaPath
          ? {
              mediaPath: item.payload.mediaPath,
              mediaType: item.payload.mediaType ?? "document",
              fileName: item.payload.fileName ?? "arquivo",
              previewUrl: "",
            }
          : null,
      scheduledFor: item.scheduledFor,
    });
  }, []);

  const createdBy = currentUser?.sellerId ?? conversation.assignedSellerId ?? "system";

  const persist = useCallback(
    async (status: "pending" | "draft", scheduledFor: ISO8601 | null) => {
      const payload = buildSchedulePayload(form);
      const saved = editingId
        ? await provider.update(editingId, { payload, scheduledFor, status })
        : await provider.create({
            conversationId: conversation.id,
            scheduledFor,
            payload,
            createdBy,
            status,
          });
      invalidate();
      reset();
      return saved;
    },
    [form, editingId, provider, conversation.id, createdBy, invalidate, reset],
  );

  const schedule = useCallback(() => persist("pending", form.scheduledFor), [persist, form.scheduledFor]);
  const saveDraft = useCallback(() => persist("draft", null), [persist]);

  return useMemo(
    () => ({
      form,
      editingId,
      setText,
      setMedia,
      setScheduledFor,
      reset,
      loadForEdit,
      block,
      canSaveDraft,
      schedule,
      saveDraft,
    }),
    [form, editingId, setText, setMedia, setScheduledFor, reset, loadForEdit, block, canSaveDraft, schedule, saveDraft],
  );
}
```

> `currentUser?.sellerId`: `IUserProfile` (de `@/features/auth`) carrega o `sellerId` espelhado para o FK `audit_logs.actor_id` (PR #66). Se o campo tiver outro nome no `IUserProfile`, use o equivalente; o fallback para `conversation.assignedSellerId ?? "system"` mantém o create válido.

- [ ] **Step 8: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: sem erro novo. (Os hooks ainda não estão montados em nenhuma tela — isso é a Task 13.)

- [ ] **Step 9: Commit**

```bash
git add src/features/quick-send/engine/scheduleComposer.ts src/features/quick-send/engine/scheduleComposer.test.ts src/features/quick-send/hooks/useScheduleMediaUpload.ts src/features/quick-send/hooks/useGlobalScheduled.ts src/features/quick-send/hooks/useSchedulingComposer.ts
git commit -m "feat(quick-send): scheduling composer engine + state/data hooks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Núcleo — `ScheduleTimePicker` + `MediaAttachField`

Cobre spec §8.2 e §8.3. Dois subcomponentes do núcleo, consumidos por todas as cascas. Verificação por `tsc` + `build` + smoke (sem teste de componente nesta base).

**Files:**
- Create: `src/features/quick-send/components/scheduling/ScheduleTimePicker.tsx`
- Create: `src/features/quick-send/components/scheduling/MediaAttachField.tsx`

- [ ] **Step 1: Implementar `ScheduleTimePicker`**

Crie `src/features/quick-send/components/scheduling/ScheduleTimePicker.tsx`:

```tsx
import type { ISO8601 } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { formatScheduleConfirm } from "../../engine/scheduledSend";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IScheduleTimePickerProps {
  value: ISO8601 | null;
  onChange: (iso: ISO8601 | null) => void;
  /** Show the non-blocking 24h-window warning (Meta account, window closed). */
  showWindowWarning?: boolean;
  onUseTemplate?: () => void;
}

/** Tomorrow at HH:00. */
function tomorrowAt(hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Next Monday at 08:00. */
function nextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const delta = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(8, 0, 0, 0);
  return d;
}

/** Format a Date for `<input type="datetime-local">` (local, no seconds). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PRESETS = [
  { id: "tomorrow-9", icon: "mdi:weather-sunny", label: "Amanhã 09:00", get: () => tomorrowAt(9) },
  { id: "tomorrow-14", icon: "mdi:white-balance-sunny", label: "Amanhã 14:00", get: () => tomorrowAt(14) },
  { id: "monday-8", icon: "mdi:calendar-week-begin", label: "Segunda 08:00", get: nextMonday },
] as const;

export function ScheduleTimePicker({
  value,
  onChange,
  showWindowWarning = false,
  onUseTemplate,
}: IScheduleTimePickerProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const inputValue = value ? toLocalInputValue(new Date(value)) : "";
  const confirm = formatScheduleConfirm(value);

  // Which preset (if any) currently matches the selected time.
  const activePreset = PRESETS.find((p) => value && toLocalInputValue(p.get()) === inputValue)?.id;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {s.whenLabel}
      </p>
      <ToggleGroup
        type="single"
        value={activePreset ?? ""}
        onValueChange={(id) => {
          const preset = PRESETS.find((p) => p.id === id);
          if (preset) onChange(preset.get().toISOString());
        }}
        className="flex flex-wrap justify-start gap-2"
      >
        {PRESETS.map((p) => (
          <ToggleGroupItem
            key={p.id}
            value={p.id}
            className="h-auto flex-1 flex-col gap-0.5 rounded-md border border-border px-2 py-2 data-[state=on]:border-primary data-[state=on]:bg-primary/10"
          >
            <Icon icon={p.icon} size={16} className="text-muted-foreground" />
            <span className="text-xs">{p.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Input
        type="datetime-local"
        value={inputValue}
        min={toLocalInputValue(new Date())}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        aria-label={QUICK_SEND_STRINGS.schedule.custom}
        className="h-11"
      />

      {confirm && (
        <p className="flex items-center gap-1.5 text-xs text-severity-success">
          <Icon icon="mdi:check-circle-outline" size={14} />
          {confirm}
        </p>
      )}

      {showWindowWarning && (
        <div className="flex items-start gap-2 rounded-md border border-severity-warning/30 bg-severity-warning/10 p-2 text-[11.5px] text-severity-warning">
          <Icon icon="mdi:alert-outline" size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p>{s.window24hWarn}</p>
            {onUseTemplate && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className={cn("h-auto p-0 text-severity-warning underline")}
                onClick={onUseTemplate}
              >
                {s.useTemplate}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

> Presets finais (decisão §13 do spec, default deste plano): **Amanhã 09:00 · Amanhã 14:00 · Segunda 08:00** — substituem o antigo "Hoje 18:00". Microcopy de baixo risco; ajuste o array `PRESETS` se o dono pedir outro conjunto.

- [ ] **Step 2: Implementar `MediaAttachField`**

Crie `src/features/quick-send/components/scheduling/MediaAttachField.tsx`:

```tsx
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { IConversation, ScheduledMediaType } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SCHEDULE_ATTACH_ACCEPT,
  useScheduleMediaUpload,
} from "../../hooks/useScheduleMediaUpload";
import type { IScheduledMediaDraft } from "../../engine/scheduleComposer";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IMediaAttachFieldProps {
  conversation: IConversation;
  media: IScheduledMediaDraft | null;
  onChange: (media: IScheduledMediaDraft | null) => void;
}

const KIND_ICON: Record<ScheduledMediaType, string> = {
  image: "mdi:image-outline",
  video: "mdi:play-circle-outline",
  audio: "mdi:microphone-outline",
  document: "mdi:file-document-outline",
};

/** Attach exactly one media item to a scheduled message (Fase 1: 1 per message). */
export function MediaAttachField({ conversation, media, onChange }: IMediaAttachFieldProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const { uploadForSchedule } = useScheduleMediaUpload(conversation);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const kindRef = useRef<ScheduledMediaType>("image");
  const [uploading, setUploading] = useState(false);

  const pick = (kind: ScheduledMediaType) => {
    kindRef.current = kind;
    const el = inputRef.current;
    if (!el) return;
    el.accept = SCHEDULE_ATTACH_ACCEPT[kind];
    el.click();
  };

  const onSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadForSchedule(file, kindRef.current);
      if (result) onChange(result);
    } catch {
      toast.error(s.attachFailed);
    } finally {
      setUploading(false);
    }
  };

  if (media) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-background text-muted-foreground">
          {media.mediaType === "image" && media.previewUrl ? (
            <img src={media.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon icon={KIND_ICON[media.mediaType]} size={18} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{media.fileName}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={QUICK_SEND_STRINGS.picker.cancelStaged}
          onClick={() => onChange(null)}
        >
          <Icon icon="mdi:close" size={14} />
        </Button>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" disabled={uploading}>
            <Icon icon={uploading ? "mdi:loading" : "mdi:paperclip"} size={15} className={uploading ? "animate-spin" : ""} />
            {s.attach}
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onSelect={() => pick("image")}>
            <Icon icon={KIND_ICON.image} size={14} className="mr-2" />
            {s.attachImage}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => pick("video")}>
            <Icon icon={KIND_ICON.video} size={14} className="mr-2" />
            {s.attachVideo}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => pick("audio")}>
            <Icon icon={KIND_ICON.audio} size={14} className="mr-2" />
            {s.attachAudio}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => pick("document")}>
            <Icon icon={KIND_ICON.document} size={14} className="mr-2" />
            {s.attachDocument}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onSelected(e)}
      />
    </>
  );
}
```

- [ ] **Step 3: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: sem erro novo.

- [ ] **Step 4: Commit**

```bash
git add src/features/quick-send/components/scheduling/ScheduleTimePicker.tsx src/features/quick-send/components/scheduling/MediaAttachField.tsx
git commit -m "feat(quick-send): scheduling time picker + media attach field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Núcleo — `ScheduleComposerForm` + `ScheduledItemCard` + `ScheduledQueueList` + `DraftsList`

Cobre spec §8.1, §8.4, §8.5, §15.3. Os subcomponentes "folha" do núcleo. Verificação por `tsc` + `build`.

**Files:**
- Create: `src/features/quick-send/components/scheduling/ScheduleComposerForm.tsx`
- Create: `src/features/quick-send/components/scheduling/ScheduledItemCard.tsx`
- Create: `src/features/quick-send/components/scheduling/ScheduledQueueList.tsx`
- Create: `src/features/quick-send/components/scheduling/DraftsList.tsx`

- [ ] **Step 1: Implementar `ScheduleComposerForm`**

Crie `src/features/quick-send/components/scheduling/ScheduleComposerForm.tsx`:

```tsx
import { toast } from "sonner";
import type { IConversation } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatScheduleLabel } from "../../engine/scheduledSend";
import type { IUseSchedulingComposerResult } from "../../hooks/useSchedulingComposer";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { MediaAttachField } from "./MediaAttachField";
import { ScheduleTimePicker } from "./ScheduleTimePicker";

export interface IScheduleComposerFormProps {
  conversation: IConversation;
  composer: IUseSchedulingComposerResult;
  showWindowWarning?: boolean;
  onUseTemplate?: () => void;
  /** Called after a successful schedule/draft so the shell can switch to the list. */
  onDone?: () => void;
}

const DISABLED_REASON: Record<"empty" | "no-time" | "past", string> = {
  empty: QUICK_SEND_STRINGS.schedule.disabledEmpty,
  "no-time": QUICK_SEND_STRINGS.schedule.disabledNoTime,
  past: QUICK_SEND_STRINGS.schedule.pastRejected,
};

export function ScheduleComposerForm({
  conversation,
  composer,
  showWindowWarning = false,
  onUseTemplate,
  onDone,
}: IScheduleComposerFormProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const { form, editingId, setText, setMedia, setScheduledFor, block, canSaveDraft, reset } = composer;

  const onSchedule = async () => {
    try {
      const saved = await composer.schedule();
      toast.success(s.scheduledToast(formatScheduleLabel(saved.scheduledFor ?? "")));
      onDone?.();
    } catch {
      toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
    }
  };

  const onDraft = async () => {
    try {
      await composer.saveDraft();
      toast.success(s.draftSaved);
      onDone?.();
    } catch {
      toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {form.media ? s.fieldLabelMedia : s.fieldLabel}
        </label>
        <Textarea
          value={form.text}
          onChange={(e) => setText(e.target.value)}
          placeholder={s.fieldPlaceholder}
          rows={3}
          className="min-h-[72px] resize-none bg-background"
          aria-label={form.media ? s.fieldLabelMedia : s.fieldLabel}
        />
      </div>

      <MediaAttachField conversation={conversation} media={form.media} onChange={setMedia} />

      <ScheduleTimePicker
        value={form.scheduledFor}
        onChange={setScheduledFor}
        showWindowWarning={showWindowWarning}
        onUseTemplate={onUseTemplate}
      />

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void onDraft()}
          disabled={!canSaveDraft}
        >
          {s.ctaSaveDraft}
        </Button>
        <div className="flex items-center gap-2">
          {editingId && (
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              {s.cancel}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className={cn("gap-1.5")}
            onClick={() => void onSchedule()}
            disabled={block !== null}
            title={block ? DISABLED_REASON[block] : undefined}
          >
            {editingId ? s.ctaSaveEdit : s.ctaSchedule}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implementar `ScheduledItemCard`**

Crie `src/features/quick-send/components/scheduling/ScheduledItemCard.tsx`:

```tsx
import type { IScheduledSend } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatScheduleLabel } from "../../engine/scheduledSend";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IScheduledItemCardProps {
  item: IScheduledSend;
  /** Recipient line for the global queue (Owner/Gestor). */
  recipient?: string | null;
  onEdit: (item: IScheduledSend) => void;
  onCancel: (item: IScheduledSend) => void;
}

const TYPE_ICON: Record<IScheduledSend["payload"]["type"], string> = {
  snippet: "mdi:message-text-outline",
  media: "mdi:paperclip",
  asset: "mdi:file-outline",
  combo: "mdi:package-variant",
  product: "mdi:cog-outline",
};

function previewText(item: IScheduledSend): string {
  const caption = item.payload.contextMessage?.trim();
  if (item.payload.type === "media") {
    const name = item.payload.fileName ?? QUICK_SEND_STRINGS.schedule.payloadMedia;
    return caption ? `${name} — ${caption}` : name;
  }
  return caption || QUICK_SEND_STRINGS.schedule.payloadSnippet;
}

export function ScheduledItemCard({ item, recipient, onEdit, onCancel }: IScheduledItemCardProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const isPending = item.status === "pending";
  const isFailed = item.status === "failed";
  const isSent = item.status === "sent";

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-background text-muted-foreground">
        <Icon icon={TYPE_ICON[item.payload.type]} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        {recipient && <p className="truncate text-[11px] text-muted-foreground">{s.recipient(recipient)}</p>}
        <p className="truncate text-sm text-foreground">{previewText(item)}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">
            {item.scheduledFor ? formatScheduleLabel(item.scheduledFor) : s.draftNoTime}
          </span>
          <span
            className={cn(
              "font-medium",
              isPending && "text-severity-info",
              isSent && "text-severity-success",
              isFailed && "text-severity-critical",
            )}
          >
            · {isPending ? s.pendingBadge : isSent ? s.sentBadge : isFailed ? s.failedBadge : ""}
          </span>
        </div>
        {isFailed && item.failureReason && (
          <p className="mt-0.5 text-[11px] text-severity-critical">{item.failureReason}</p>
        )}
      </div>
      {(isPending || isFailed) && (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onEdit(item)}
          >
            {isFailed ? s.reschedule : s.edit}
          </Button>
          {isPending && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-severity-critical hover:text-severity-critical"
              aria-label={s.cancel}
              onClick={() => onCancel(item)}
            >
              <Icon icon="mdi:close" size={14} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implementar `ScheduledQueueList`**

Crie `src/features/quick-send/components/scheduling/ScheduledQueueList.tsx`:

```tsx
import type { IScheduledSend } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { ScheduledItemCard } from "./ScheduledItemCard";

export interface IScheduledQueueListProps {
  /** Already filtered to pending/sent/failed (no drafts, no cancelled). */
  items: IScheduledSend[];
  onEdit: (item: IScheduledSend) => void;
  onCancel: (item: IScheduledSend) => void;
  /** Switches the shell to the "Novo" tab. */
  onCreate?: () => void;
}

export function ScheduledQueueList({ items, onEdit, onCancel, onCreate }: IScheduledQueueListProps) {
  const s = QUICK_SEND_STRINGS.schedule;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Icon icon="mdi:calendar-blank-outline" size={32} className="text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{s.emptyConversation}</p>
        {onCreate && (
          <Button type="button" variant="outline" size="sm" onClick={onCreate}>
            {s.createCta}
          </Button>
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <ScheduledItemCard item={item} onEdit={onEdit} onCancel={onCancel} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Implementar `DraftsList`**

Crie `src/features/quick-send/components/scheduling/DraftsList.tsx`:

```tsx
import type { IScheduledSend } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IDraftsListProps {
  /** Items with status === "draft". */
  items: IScheduledSend[];
  /** Opens the composer in edit mode to give the draft a time. */
  onEdit: (item: IScheduledSend) => void;
  onDelete: (item: IScheduledSend) => void;
}

export function DraftsList({ items, onEdit, onDelete }: IDraftsListProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {s.draftsTitle(items.length)}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2.5 rounded-md border border-dashed border-border bg-muted/20 p-3"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-background text-muted-foreground">
              <Icon icon="mdi:file-edit-outline" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {item.payload.contextMessage?.trim() ||
                  (item.payload.type === "media" ? item.payload.fileName : "") ||
                  s.payloadSnippet}
              </p>
              <p className="text-[11px] text-muted-foreground">{s.draftNoTime}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onEdit(item)}>
                {s.setTime}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-severity-critical hover:text-severity-critical"
                aria-label={s.deleteDraft}
                onClick={() => onDelete(item)}
              >
                <Icon icon="mdi:trash-can-outline" size={14} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: sem erro novo.

- [ ] **Step 6: Commit**

```bash
git add src/features/quick-send/components/scheduling/ScheduleComposerForm.tsx src/features/quick-send/components/scheduling/ScheduledItemCard.tsx src/features/quick-send/components/scheduling/ScheduledQueueList.tsx src/features/quick-send/components/scheduling/DraftsList.tsx
git commit -m "feat(quick-send): scheduling composer form + queue/drafts list cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Núcleo — `GlobalQueueList` + `ScheduleModeSwitcher` + contrato `types.ts`

Cobre spec §8.6, §8.7, §14. A fila global (Owner/Gestor), o seletor de modo e o contrato de props que liga o orquestrador às 4 cascas.

**Files:**
- Create: `src/features/quick-send/components/scheduling/GlobalQueueList.tsx`
- Create: `src/features/quick-send/components/scheduling/ScheduleModeSwitcher.tsx`
- Create: `src/features/quick-send/components/scheduling/types.ts`

- [ ] **Step 1: Implementar `GlobalQueueList`**

Crie `src/features/quick-send/components/scheduling/GlobalQueueList.tsx`:

```tsx
import type { IScheduledSend, IScheduledSendWithContext } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { ScheduledItemCard } from "./ScheduledItemCard";

export interface IGlobalQueueListProps {
  items: IScheduledSendWithContext[];
  isLoading: boolean;
  onEdit: (item: IScheduledSend) => void;
  onCancel: (item: IScheduledSend) => void;
}

/** Store-wide pending queue (Owner/Gestor). Each card shows the recipient. */
export function GlobalQueueList({ items, isLoading, onEdit, onCancel }: IGlobalQueueListProps) {
  const s = QUICK_SEND_STRINGS.schedule;

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">…</p>;
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Icon icon="mdi:calendar-blank-outline" size={32} className="text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{s.emptyGlobal}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <ScheduledItemCard
            item={item}
            recipient={item.customerName ?? item.customerPhone}
            onEdit={onEdit}
            onCancel={onCancel}
          />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Implementar `ScheduleModeSwitcher`**

Crie `src/features/quick-send/components/scheduling/ScheduleModeSwitcher.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SchedulingViewMode } from "../../hooks/useSchedulingViewMode";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IScheduleModeSwitcherProps {
  mode: SchedulingViewMode;
  onModeChange: (mode: SchedulingViewMode) => void;
}

const MODES: { id: SchedulingViewMode; icon: string; label: string }[] = [
  { id: "modal", icon: "mdi:card-outline", label: QUICK_SEND_STRINGS.schedule.modeModal },
  { id: "drawer", icon: "mdi:dock-right", label: QUICK_SEND_STRINGS.schedule.modeDrawer },
  { id: "inline", icon: "mdi:dock-bottom", label: QUICK_SEND_STRINGS.schedule.modeInline },
  { id: "timeline", icon: "mdi:timeline-clock-outline", label: QUICK_SEND_STRINGS.schedule.modeTimeline },
];

export function ScheduleModeSwitcher({ mode, onModeChange }: IScheduleModeSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onModeChange(v as SchedulingViewMode)}
      aria-label={QUICK_SEND_STRINGS.schedule.modeSwitcherLabel}
      className="gap-0.5"
    >
      {MODES.map((m) => (
        <Tooltip key={m.id}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value={m.id}
              aria-label={m.label}
              className="h-7 w-7 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <Icon icon={m.icon} size={15} />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{m.label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 3: Implementar o contrato `types.ts`**

Crie `src/features/quick-send/components/scheduling/types.ts`:

```ts
import type { IConversation, IScheduledSend, IScheduledSendWithContext } from "@/shared/types";
import type { IUseSchedulingComposerResult } from "../../hooks/useSchedulingComposer";
import type { SchedulingViewMode } from "../../hooks/useSchedulingViewMode";

export type SchedulingTab = "new" | "scheduled" | "all";

/**
 * Single contract every shell consumes. The orchestrator (SchedulingCenter)
 * owns all state/data and passes it down; shells ONLY position the same core
 * subcomponents — no scheduling logic lives in a shell.
 */
export interface ISchedulingShellProps {
  conversation: IConversation;
  customerName: string;
  customerPhone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SchedulingViewMode;
  onModeChange: (mode: SchedulingViewMode) => void;
  tab: SchedulingTab;
  onTabChange: (tab: SchedulingTab) => void;
  composer: IUseSchedulingComposerResult;
  /** Conversation queue (pending/sent/failed — no drafts, no cancelled). */
  scheduled: IScheduledSend[];
  drafts: IScheduledSend[];
  global: IScheduledSendWithContext[];
  globalLoading: boolean;
  canSeeGlobal: boolean;
  showWindowWarning: boolean;
  onUseTemplate?: () => void;
  onEdit: (item: IScheduledSend) => void;
  onCancel: (item: IScheduledSend) => void;
  onDeleteDraft: (item: IScheduledSend) => void;
}
```

- [ ] **Step 4: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add src/features/quick-send/components/scheduling/GlobalQueueList.tsx src/features/quick-send/components/scheduling/ScheduleModeSwitcher.tsx src/features/quick-send/components/scheduling/types.ts
git commit -m "feat(quick-send): global queue list, mode switcher and shell contract

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: As 4 cascas + `SchedulingCenter` (orquestrador)

Cobre spec §4, §9, §12. `SchedulingPanels` (abas compartilhadas) é consumido pelas 4 cascas; o `SchedulingCenter` detém todo o estado/dados, a guarda de descarte e escolhe a casca ativa.

**Files:**
- Create: `src/features/quick-send/components/scheduling/SchedulingPanels.tsx`
- Create: `src/features/quick-send/components/scheduling/shells/SchedulingModalShell.tsx`
- Create: `src/features/quick-send/components/scheduling/shells/SchedulingDrawerShell.tsx`
- Create: `src/features/quick-send/components/scheduling/shells/SchedulingInlineShell.tsx`
- Create: `src/features/quick-send/components/scheduling/shells/SchedulingTimelineShell.tsx`
- Create: `src/features/quick-send/components/scheduling/SchedulingCenter.tsx`

- [ ] **Step 1: Implementar `SchedulingPanels` (abas compartilhadas)**

Crie `src/features/quick-send/components/scheduling/SchedulingPanels.tsx`:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { ScheduleComposerForm } from "./ScheduleComposerForm";
import { ScheduledQueueList } from "./ScheduledQueueList";
import { DraftsList } from "./DraftsList";
import { GlobalQueueList } from "./GlobalQueueList";
import type { ISchedulingShellProps } from "./types";

export interface ISchedulingPanelsProps extends ISchedulingShellProps {
  /** Decorate the conversation queue with a vertical timeline axis. */
  timeline?: boolean;
}

export function SchedulingPanels(props: ISchedulingPanelsProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const {
    conversation,
    composer,
    scheduled,
    drafts,
    global,
    globalLoading,
    canSeeGlobal,
    showWindowWarning,
    onUseTemplate,
    onEdit,
    onCancel,
    onDeleteDraft,
    tab,
    onTabChange,
    timeline,
  } = props;

  const pendingCount = scheduled.filter((i) => i.status === "pending").length;

  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as typeof tab)} className="flex flex-col">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="new">{s.tabNew}</TabsTrigger>
        <TabsTrigger value="scheduled">{s.tabScheduled(pendingCount)}</TabsTrigger>
        {canSeeGlobal && (
          <TabsTrigger value="all" className="gap-1">
            {s.tabAll(global.length)}
            <Icon icon="mdi:lock-outline" size={12} className="opacity-70" />
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="new" className="pt-3">
        <ScheduleComposerForm
          conversation={conversation}
          composer={composer}
          showWindowWarning={showWindowWarning}
          onUseTemplate={onUseTemplate}
          onDone={() => onTabChange("scheduled")}
        />
      </TabsContent>

      <TabsContent value="scheduled" className="flex flex-col gap-3 pt-3">
        <DraftsList items={drafts} onEdit={onEdit} onDelete={onDeleteDraft} />
        <div className={cn(timeline && "border-l-2 border-border/60 pl-3")}>
          <ScheduledQueueList
            items={scheduled}
            onEdit={onEdit}
            onCancel={onCancel}
            onCreate={() => onTabChange("new")}
          />
        </div>
      </TabsContent>

      {canSeeGlobal && (
        <TabsContent value="all" className="pt-3">
          <GlobalQueueList items={global} isLoading={globalLoading} onEdit={onEdit} onCancel={onCancel} />
        </TabsContent>
      )}
    </Tabs>
  );
}
```

- [ ] **Step 2: Implementar `SchedulingModalShell`**

Crie `src/features/quick-send/components/scheduling/shells/SchedulingModalShell.tsx`:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QUICK_SEND_STRINGS } from "../../../i18n/pt-BR";
import { ScheduleModeSwitcher } from "../ScheduleModeSwitcher";
import { SchedulingPanels } from "../SchedulingPanels";
import type { ISchedulingShellProps } from "../types";

export function SchedulingModalShell(props: ISchedulingShellProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <span aria-hidden>⏰</span>
                {s.centerTitle}
              </DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.centerContext(props.customerName, props.customerPhone)}
              </p>
            </div>
            <ScheduleModeSwitcher mode={props.mode} onModeChange={props.onModeChange} />
          </div>
        </DialogHeader>
        <SchedulingPanels {...props} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Implementar `SchedulingDrawerShell`**

Crie `src/features/quick-send/components/scheduling/shells/SchedulingDrawerShell.tsx`:

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { QUICK_SEND_STRINGS } from "../../../i18n/pt-BR";
import { ScheduleModeSwitcher } from "../ScheduleModeSwitcher";
import { SchedulingPanels } from "../SchedulingPanels";
import type { ISchedulingShellProps } from "../types";

export function SchedulingDrawerShell(props: ISchedulingShellProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-3 sm:max-w-md">
        <SheetHeader className="space-y-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <span aria-hidden>⏰</span>
                {s.centerTitle}
              </SheetTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.centerContext(props.customerName, props.customerPhone)}
              </p>
            </div>
            <ScheduleModeSwitcher mode={props.mode} onModeChange={props.onModeChange} />
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SchedulingPanels {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Implementar `SchedulingInlineShell`**

Crie `src/features/quick-send/components/scheduling/shells/SchedulingInlineShell.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../../i18n/pt-BR";
import { ScheduleModeSwitcher } from "../ScheduleModeSwitcher";
import { SchedulingPanels } from "../SchedulingPanels";
import type { ISchedulingShellProps } from "../types";

/** Inline panel above the composer — pushes the history, never an overlay. */
export function SchedulingInlineShell(props: ISchedulingShellProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  if (!props.open) return null;
  return (
    <div className="border-t border-border bg-card px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden>⏰</span>
          <span className="text-sm font-medium text-foreground">{s.centerTitle}</span>
          <span className="truncate text-xs text-muted-foreground">
            {s.centerContext(props.customerName, props.customerPhone)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ScheduleModeSwitcher mode={props.mode} onModeChange={props.onModeChange} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label={QUICK_SEND_STRINGS.slash.close}
            onClick={() => props.onOpenChange(false)}
          >
            <Icon icon="mdi:chevron-down" size={16} />
          </Button>
        </div>
      </div>
      <SchedulingPanels {...props} />
    </div>
  );
}
```

- [ ] **Step 5: Implementar `SchedulingTimelineShell`**

Crie `src/features/quick-send/components/scheduling/shells/SchedulingTimelineShell.tsx`:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QUICK_SEND_STRINGS } from "../../../i18n/pt-BR";
import { ScheduleModeSwitcher } from "../ScheduleModeSwitcher";
import { SchedulingPanels } from "../SchedulingPanels";
import type { ISchedulingShellProps } from "../types";

/**
 * Timeline mode (Fase 1): wider dialog whose "Agendados" tab shows the queue
 * along a vertical time axis. The best-time/recurrence layer is Fase 2 (§20).
 */
export function SchedulingTimelineShell(props: ISchedulingShellProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <span aria-hidden>⏰</span>
                {s.centerTitle}
              </DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.centerContext(props.customerName, props.customerPhone)}
              </p>
            </div>
            <ScheduleModeSwitcher mode={props.mode} onModeChange={props.onModeChange} />
          </div>
        </DialogHeader>
        <SchedulingPanels {...props} timeline />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Implementar `SchedulingCenter` (orquestrador)**

Crie `src/features/quick-send/components/scheduling/SchedulingCenter.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, IConversation, IScheduledSend, IWhatsAppAccount } from "@/shared/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCustomersProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useMetaWindow } from "@/features/conversations/hooks/useMetaWindow";
import { useConversationScheduled } from "../../hooks/useConversationScheduled";
import { useSchedulingComposer } from "../../hooks/useSchedulingComposer";
import { useSchedulingViewMode } from "../../hooks/useSchedulingViewMode";
import { useGlobalScheduled } from "../../hooks/useGlobalScheduled";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { SchedulingModalShell } from "./shells/SchedulingModalShell";
import { SchedulingDrawerShell } from "./shells/SchedulingDrawerShell";
import { SchedulingInlineShell } from "./shells/SchedulingInlineShell";
import { SchedulingTimelineShell } from "./shells/SchedulingTimelineShell";
import type { ISchedulingShellProps, SchedulingTab } from "./types";

export interface ISchedulingCenterProps {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial tab — "scheduled" when opened from the badge, else "new". */
  initialTab?: SchedulingTab;
  /** Bubble a "use template" request up to the composer (24h-window CTA). */
  onUseTemplate?: () => void;
}

/** Recipient name/phone for the header + global queue. */
function resolveCustomerContext(c: ICustomer | null | undefined): { name: string; phone: string } {
  if (!c) return { name: "Cliente", phone: "" };
  const name =
    c.type === "B2B"
      ? c.nomeFantasia || c.razaoSocial || c.contactName || "Cliente"
      : c.fullName || "Cliente";
  return { name, phone: c.phone ?? "" };
}

export function SchedulingCenter({
  conversation,
  whatsappAccount,
  open,
  onOpenChange,
  initialTab = "new",
  onUseTemplate,
}: ISchedulingCenterProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const [mode, setMode] = useSchedulingViewMode();
  const [tab, setTab] = useState<SchedulingTab>(initialTab);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const composer = useSchedulingComposer(conversation);
  const { items, cancel, update } = useConversationScheduled(conversation.id);
  const { hasRole } = useAuth();
  const canSeeGlobal = hasRole(["Owner", "Gestor"]);
  const global = useGlobalScheduled(canSeeGlobal && open && tab === "all");

  const win = useMetaWindow(conversation, whatsappAccount);
  const showWindowWarning = whatsappAccount?.provider === "meta" && !win.canSendFreeText;

  const customersProvider = useCustomersProvider();
  const customerQuery = useQuery({
    queryKey: ["customers", "detail", conversation.customerId],
    queryFn: () => customersProvider.get(conversation.customerId as string),
    enabled: open && !!conversation.customerId,
    staleTime: 60_000,
  });
  const { name: customerName, phone: customerPhone } = resolveCustomerContext(customerQuery.data);

  // Reset the tab to the requested one each time the center opens.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const scheduled = useMemo(
    () => items.filter((i) => i.status === "pending" || i.status === "sent" || i.status === "failed"),
    [items],
  );
  const drafts = useMemo(() => items.filter((i) => i.status === "draft"), [items]);

  // Close guard — confirm discard when composing unsaved content on the "new" tab.
  const requestClose = (next: boolean) => {
    if (!next && tab === "new" && composer.canSaveDraft && !composer.editingId) {
      setConfirmDiscardOpen(true);
      return;
    }
    if (!next) composer.reset();
    onOpenChange(next);
  };

  const onEdit = (item: IScheduledSend) => {
    composer.loadForEdit(item);
    setTab("new");
  };

  const handleCancel = (item: IScheduledSend) => {
    let undone = false;
    toast(s.cancelled, {
      action: { label: s.undo, onClick: () => { undone = true; } },
      duration: 5_000,
      onAutoClose: () => { if (!undone) cancel(item.id); },
      onDismiss: () => { if (!undone) cancel(item.id); },
    });
  };

  const onDeleteDraft = (item: IScheduledSend) => {
    // Drafts are removed by marking them cancelled (hidden from every list).
    update(item.id, { status: "cancelled" });
  };

  const shellProps: ISchedulingShellProps = {
    conversation,
    customerName,
    customerPhone,
    open,
    onOpenChange: requestClose,
    mode,
    onModeChange: setMode,
    tab,
    onTabChange: setTab,
    composer,
    scheduled,
    drafts,
    global: global.items,
    globalLoading: global.isLoading,
    canSeeGlobal,
    showWindowWarning,
    onUseTemplate,
    onEdit,
    onCancel: handleCancel,
    onDeleteDraft,
  };

  const Shell =
    mode === "drawer"
      ? SchedulingDrawerShell
      : mode === "inline"
        ? SchedulingInlineShell
        : mode === "timeline"
          ? SchedulingTimelineShell
          : SchedulingModalShell;

  return (
    <>
      <Shell {...shellProps} />
      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{s.discardConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{s.discardConfirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{s.discardConfirmCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscardOpen(false);
                composer.reset();
                onOpenChange(false);
              }}
            >
              {s.discardConfirmOk}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

> `ICustomersProvider.get(id)` retorna `ICustomer | null`. Se a assinatura exigir um id não-nulo, o `enabled: !!conversation.customerId` garante que só roda com id presente; o cast `as string` reflete isso.

- [ ] **Step 7: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: sem erro novo. (Ainda não montado em tela — Task 13.)

- [ ] **Step 8: Commit**

```bash
git add src/features/quick-send/components/scheduling/SchedulingPanels.tsx src/features/quick-send/components/scheduling/shells/ src/features/quick-send/components/scheduling/SchedulingCenter.tsx
git commit -m "feat(quick-send): scheduling center orchestrator + 4 display shells

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: `ScheduleButton` (ícone ⏰ + badge) + exports no barrel

Cobre spec §5. A entrada da Central no composer, com badge persistente de pendentes (rascunhos NÃO contam). Exporta `SchedulingCenter`/`ScheduleButton` no barrel para a Task 13 consumir.

**Files:**
- Create: `src/features/quick-send/components/scheduling/ScheduleButton.tsx`
- Modify: `src/features/quick-send/index.ts` (apenas adicionar exports)

- [ ] **Step 1: Implementar `ScheduleButton`**

Crie `src/features/quick-send/components/scheduling/ScheduleButton.tsx`:

```tsx
import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConversationScheduled } from "../../hooks/useConversationScheduled";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import type { SchedulingTab } from "./types";

export interface IScheduleButtonProps {
  conversationId: ID;
  /** Opens the center; "scheduled" when there are pending items, else "new". */
  onOpen: (tab: SchedulingTab) => void;
  disabled?: boolean;
}

/** Composer entry to the Scheduling Center. Badge = pending count (drafts excluded). */
export function ScheduleButton({ conversationId, onOpen, disabled = false }: IScheduleButtonProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const { items } = useConversationScheduled(conversationId);
  const pending = items.filter((i) => i.status === "pending").length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="relative h-9 w-9 shrink-0 p-0"
          aria-label={s.entryTooltip}
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => onOpen(pending > 0 ? "scheduled" : "new")}
        >
          <Icon icon="mdi:calendar-clock" size={18} />
          {pending > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {pending}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{s.entryTooltip}</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Exportar no barrel `src/features/quick-send/index.ts`**

Localize a seção `// Plan C — Scheduling (PRD-027)` e, logo após a linha que exporta `useConversationScheduled`, **adicione**:

```ts
export { SchedulingCenter, type ISchedulingCenterProps } from "./components/scheduling/SchedulingCenter";
export { ScheduleButton, type IScheduleButtonProps } from "./components/scheduling/ScheduleButton";
export type { SchedulingTab } from "./components/scheduling/types";
```

> Não remova `ScheduleSendMenu`/`ScheduledList` do barrel ainda — isso é a Task 14 (depois que a Task 13 parar de usá-los).

- [ ] **Step 3: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: sem erro novo.

- [ ] **Step 4: Commit**

```bash
git add src/features/quick-send/components/scheduling/ScheduleButton.tsx src/features/quick-send/index.ts
git commit -m "feat(quick-send): schedule button entry with pending badge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Integrar no `MessageInput` + `ConversationPage` (mata o split-button)

Cobre spec §5, §18. Remove o split-button e o `handleSchedule` antigo, deixa **Enviar** único, adiciona `ScheduleButton` na fileira de ações e monta `SchedulingCenter`. Tira a barra `ScheduledList` do `ConversationPage` (o badge a substitui). **Mantém** o `useScheduledSendRunner` (runner mock).

**Files:**
- Modify: `src/features/conversations/components/MessageInput.tsx`
- Modify: `src/features/conversations/pages/ConversationPage.tsx`

- [ ] **Step 1: Ajustar imports do `MessageInput`**

Em `src/features/conversations/components/MessageInput.tsx`, no bloco de import de `@/features/quick-send` (atualmente linhas ~39–49), adicione `ScheduleButton`, `SchedulingCenter` e `type SchedulingTab`:

```tsx
import {
  AssetPicker,
  ComposerStagedAsset,
  ProductSearchDialog,
  ScheduleButton,
  SchedulingCenter,
  SlashMenu,
  SnippetField,
  useSendAsset,
  useSendProductCard,
  useQuickSendBus,
  useQuickReplies,
  type SchedulingTab,
} from "@/features/quick-send";
```

E **remova** as duas linhas de import logo abaixo:

```tsx
import { ScheduleSendMenu } from "@/features/quick-send/components/ScheduleSendMenu";
import { useScheduleSend } from "@/features/quick-send/hooks/useScheduleSend";
```

- [ ] **Step 2: Estado da Central + remover o hook antigo**

Logo após `const [templateOpen, setTemplateOpen] = useState(false);`, adicione:

```tsx
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [schedulingTab, setSchedulingTab] = useState<SchedulingTab>("new");
```

E **remova** a linha:

```tsx
  const { schedule } = useScheduleSend(conversation);
```

- [ ] **Step 3: Remover `handleSchedule`**

Apague o método inteiro (atualmente linhas ~437–452):

```tsx
  const handleSchedule = async (scheduledFor: string) => {
    const text = value.trim();
    if (!text) return;
    if (hasUnresolved(value)) {
      toast.warning(QUICK_SEND_STRINGS.snippet.sendBlockedHint);
      return;
    }
    try {
      // Snippet payload carries the already-typed text as contextMessage so the
      // runner can re-send it verbatim at the simulated time (RF-023).
      await schedule(scheduledFor, { type: "snippet", contextMessage: text });
      setValue("");
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };
```

- [ ] **Step 4: Adicionar o `ScheduleButton` na fileira de ações**

Após o bloco do Emoji (`</Popover>`) e antes do comentário `{/* Textarea + overlays */}`, insira:

```tsx
        {/* Agendar mensagem (abre a Central) */}
        <ScheduleButton
          conversationId={conversation.id}
          onOpen={(tab) => {
            setSchedulingTab(tab);
            setSchedulingOpen(true);
          }}
          disabled={readOnly}
        />

```

- [ ] **Step 5: Tornar o botão Enviar único (remover o split)**

Substitua o bloco do botão Enviar atual:

```tsx
        {/* Enviar (split: enviar agora + agendar) */}
        <div className="flex shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-1.5 rounded-r-none px-3"
                  onClick={handleSend}
                  disabled={sendDisabled}
                  aria-disabled={sendDisabled}
                >
                  <Icon icon="mdi:send" size={14} />
                  <span className="hidden lg:inline">{CONVERSATION_STRINGS.send}</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{sendDisabledReason ?? CONVERSATION_STRINGS.send}</TooltipContent>
          </Tooltip>
          <ScheduleSendMenu
            onSchedule={(iso) => void handleSchedule(iso)}
            disabled={sendDisabled}
          />
        </div>
```

por:

```tsx
        {/* Enviar (único) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0">
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5 px-3"
                onClick={handleSend}
                disabled={sendDisabled}
                aria-disabled={sendDisabled}
              >
                <Icon icon="mdi:send" size={14} />
                <span className="hidden lg:inline">{CONVERSATION_STRINGS.send}</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{sendDisabledReason ?? CONVERSATION_STRINGS.send}</TooltipContent>
        </Tooltip>
```

- [ ] **Step 6: Montar a `SchedulingCenter`**

Imediatamente antes de `</footer>` (após o `</AlertDialog>` do invalid-number), insira:

```tsx
      <SchedulingCenter
        conversation={conversation}
        whatsappAccount={whatsappAccount}
        open={schedulingOpen}
        onOpenChange={setSchedulingOpen}
        initialTab={schedulingTab}
        onUseTemplate={() => {
          setSchedulingOpen(false);
          setTemplateOpen(true);
        }}
      />
```

- [ ] **Step 7: Remover `<ScheduledList>` do `ConversationPage`**

Em `src/features/conversations/pages/ConversationPage.tsx`:

(a) No import de `@/features/quick-send` (linhas ~24–32), **remova** a linha `ScheduledList,` (mantenha `useScheduledSendRunner`, `useTrackableLinkSimulation`, etc.).

(b) **Remova** a montagem (linha ~206):

```tsx
              <ScheduledList conversationId={conversationId} />
```

- [ ] **Step 8: Type-check, build e lint**

```bash
bunx tsc --noEmit
bun run build
bun run lint
```

Esperado: sem erro novo; o `lint` não acusa import proibido (a Central só consome `@/providers/data`). Os arquivos `ScheduleSendMenu.tsx`/`ScheduledList.tsx` ainda existem (serão removidos na Task 14) — o barrel ainda os exporta, sem uso. OK.

- [ ] **Step 9: Commit**

```bash
git add src/features/conversations/components/MessageInput.tsx src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat(conversations): single Send button + scheduling center entry icon

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: Remover `ScheduleSendMenu` + `ScheduledList`

Cobre spec §17 (remover). Agora que nada os usa, apaga os dois arquivos e seus exports no barrel.

**Files:**
- Modify: `src/features/quick-send/index.ts`
- Delete: `src/features/quick-send/components/ScheduleSendMenu.tsx`
- Delete: `src/features/quick-send/components/ScheduledList.tsx`

- [ ] **Step 1: Confirmar que não há mais referências**

```bash
bunx tsc --noEmit
```

E uma busca por usos remanescentes (deve retornar só os próprios arquivos + o barrel):

Use Grep por `ScheduleSendMenu` e `ScheduledList` em `src/`. Esperado: ocorrências apenas em `src/features/quick-send/components/ScheduleSendMenu.tsx`, `src/features/quick-send/components/ScheduledList.tsx` e `src/features/quick-send/index.ts`. Se algo mais aparecer, corrija antes de prosseguir.

- [ ] **Step 2: Remover os exports do barrel**

Em `src/features/quick-send/index.ts`, **remova** as duas linhas:

```ts
export { ScheduleSendMenu, type IScheduleSendMenuProps } from "./components/ScheduleSendMenu";
```
```ts
export { ScheduledList, type IScheduledListProps } from "./components/ScheduledList";
```

- [ ] **Step 3: Apagar os arquivos**

```bash
git rm src/features/quick-send/components/ScheduleSendMenu.tsx src/features/quick-send/components/ScheduledList.tsx
```

- [ ] **Step 4: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: sem erro; nenhuma importação quebrada.

- [ ] **Step 5: Commit**

```bash
git add src/features/quick-send/index.ts
git commit -m "refactor(quick-send): remove split-button schedule menu and collapsible list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 15: Runner mock — caso `media` (degradado)

Cobre spec §18. O runner é **mock-only** (em supabase o worker dispara). O mock não tem bucket real para reidratar a mídia, então degrada para a legenda como texto — assim a demo mostra algo no horário. Em produção, o worker (Task 4) envia a mídia de verdade.

**Files:**
- Modify: `src/features/quick-send/hooks/useScheduledSendRunner.ts`

- [ ] **Step 1: Adicionar o ramo `media` ao `dispatchOne`**

Em `src/features/quick-send/hooks/useScheduledSendRunner.ts`, dentro de `dispatchOne`, no encadeamento de `if (item.payload.type === ...)`, **adicione** um ramo para `media` logo após o ramo `snippet`:

```ts
        } else if (item.payload.type === "media") {
          // Mock has no real bucket dispatch (mediaPath is a simulated path), so
          // degrade to the caption as text. In supabase the server worker sends
          // the actual media — this poller never runs there (file header).
          const caption = ctx?.trim();
          await send.send({ text: caption || "📎 (mídia agendada)" });
        } else if (item.payload.type === "asset" || item.payload.type === "combo") {
```

> Você está apenas inserindo o novo `else if (item.payload.type === "media")` **antes** do `else if (item.payload.type === "asset" || item.payload.type === "combo")` existente. Não altere os demais ramos.

- [ ] **Step 2: Type-check e build**

```bash
bunx tsc --noEmit
bun run build
```

Esperado: sem erro novo.

- [ ] **Step 3: Teste de regressão dos engines**

```bash
bun run test
```

Esperado: toda a suíte passa (incluindo `scheduledSend`, `scheduleComposer`, `scheduled/core`, `useSchedulingViewMode`).

- [ ] **Step 4: Commit**

```bash
git add src/features/quick-send/hooks/useScheduledSendRunner.ts
git commit -m "feat(quick-send): mock runner dispatches scheduled media as caption text

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 16: Verificação final + smoke manual

Gate completo + roteiro de smoke para o dono validar a UI (o dono testa a UI manualmente — **não** abra browser/preview).

**Files:** nenhuma alteração de código (a menos que algo falhe).

- [ ] **Step 1: Gate automatizado completo**

```bash
bun run test
bun run build
bun run lint
bunx tsc --noEmit
```

Esperado: testes 100% verdes; build OK; lint sem erro novo (atenção a `no-restricted-imports` — a Central só pode tocar dados via `@/providers/data`); `tsc` sem **erro novo** vs. o baseline (cruze com `git diff --name-status main...HEAD --diff-filter=A`).

- [ ] **Step 2: Conferir o working tree (não commitar ruído)**

```bash
git status
```

Confirme que **não** há `src/routeTree.gen.ts` nem `vite.config.ts` staged, e que os espelhos `_shared/whatsapp/*` só aparecem se houve mudança real de conteúdo (`git diff --ignore-all-space`). Nenhum arquivo fora do escopo do plano.

- [ ] **Step 3: Roteiro de smoke manual (entregar ao dono, pt-BR)**

Em **Produção** (crm.gallobasediesel.com.br — ou no dev server com Configurações → Avançado → Ambiente & Dados em "Produção"; o banner "Demonstração" indica mock):

1. **Entrada:** abra uma conversa. Confirme que o botão **Enviar** é **único** (sem caret ▼) e que há um ícone ⏰ na fileira de ações.
2. **Texto agendado:** clique no ⏰ → aba "Novo agendamento" → escreva uma mensagem → escolha "Amanhã 09:00" → confirme a frase "Será enviado domingo, … (horário de Brasília)." → **Agendar**. O composer principal **não** deve enviar nada agora.
3. **Badge:** o ícone ⏰ deve exibir o badge com a contagem de pendentes. Reabra → cai direto na aba "Agendados".
4. **Mídia agendada:** ⏰ → Novo → **Anexar ▸ Imagem** → selecione um arquivo → veja o chip com preview → defina horário → **Agendar**. Confirme que aparece em "Agendados" como mídia.
5. **Rascunho:** ⏰ → Novo → escreva algo, **sem** horário → **Salvar rascunho** → confira a seção "Rascunhos" em "Agendados" → "Definir horário" → vira agendado.
6. **Editar/Cancelar:** em "Agendados", **Editar** um pendente (muda texto/hora) e **Cancelar** outro (toast com **Desfazer** por 5s).
7. **4 modos:** no cabeçalho da Central, alterne ▣ Modal / ▦ Lateral / ▤ Inline / ≣ Timeline. O conteúdo em composição **não** se perde ao trocar. Recarregue a página: o último modo deve persistir.
8. **RBAC:** como **Owner/Gestor**, confira a aba "Todos · N 🔐" (fila global com destinatário). Como **vendedor**, a aba "Todos" **não** aparece.
9. **Guarda de descarte:** com texto não salvo na aba "Novo", feche (Esc/×) → deve perguntar "Descartar agendamento?".
10. **Disparo real (produção):** agende um texto para ~2 min à frente, **feche o navegador**, e confirme que a mensagem foi enviada no horário (worker server-side). Repita com uma imagem para validar o dispatch de mídia (Task 4).

- [ ] **Step 4: Atualizar o doc-mestre de pendências (se aplicável)**

Se o dono confirmar o smoke, registre em `docs/fase2-pendencias.md` (ou no CHANGELOG no fluxo de versionamento) que a Central de Agendamento Fase 1 entrou. **Não** faça bump de versão aqui — isso é o fluxo `/versionamento` à parte.

- [ ] **Step 5: Finalizar a branch**

Não faça merge para `main` sem **aprovação explícita do dono**. Com aprovação, siga o fluxo `commit-push`/`/versionamento` do projeto (bump MINOR — nova feature; codinome novo).

---

## Self-Review (preenchido pelo autor do plano)

**1. Cobertura do spec (seção → tarefa):**

- §1–§2 (problema/princípios) → Task 13 (Enviar único, ícone próprio) + §3.
- §3 (escopo: 4 modos, RBAC, rascunho, mídia) → Tasks 6, 11 (modos), 5+11 (RBAC), 7+9 (rascunho), 4+5+7+8 (mídia).
- §4 (núcleo + cascas) → Tasks 9, 10, 11.
- §5 (entrada/badge, fim do split-button, fim da ScheduledList) → Tasks 12, 13.
- §6.1 (tipos) → Task 2. §6.2 (migrations) → Task 1. §6.3 (RLS sem mudança) → documentado (Task 5 nota).
- §7 (providers: listStore, create draft) → Tasks 2 (tipo create), 5.
- §8.1 ComposerForm → Task 9. §8.2 TimePicker → Task 8 + Task 3 (confirm). §8.3 MediaAttachField → Task 8 + 7 (upload). §8.4 QueueList/ItemCard → Task 9. §8.5 DraftsList → Task 9. §8.6 GlobalQueueList → Task 10. §8.7 ModeSwitcher → Tasks 6, 10.
- §9 (4 cascas) → Task 11.
- §10 (worker mídia) → Task 4.
- §11 (i18n) → Task 2 (+ draftSaved).
- §12 (a11y: foco, Esc com guarda, aria) → Tasks 11 (guarda de descarte, aria-haspopup), 12.
- §13 (presets) → Task 8 (decisão: Amanhã 09:00 / Amanhã 14:00 / Segunda 08:00).
- §14 (RBAC detalhado) → Tasks 10, 11.
- §15 (estados de borda) → Tasks 8 (past/empty), 9 (failed→reschedule, empty state), 11 (guarda, troca de modo preserva estado).
- §15.3 (rascunho vs agendado) → Task 9 (DraftsList) + 12 (badge exclui draft).
- §16 (testes) → Tasks 3, 4, 6, 7 (puros). Componentes: build+smoke (sem infra de teste de componente nesta base — decisão registrada).
- §17 (estrutura/remoção) → Tasks 1–14.
- §18 (migração/compat) → Tasks 13 (imports), 15 (runner mock).
- §19 (não-objetivos) → respeitados (1 anexo; sem best-time/recorrência).
- §20 (Fase 2) → fora de escopo (apenas documentado no spec).
- §21 (armadilhas) → endereçadas: verbo único (T13), badge+lista (T9/T12), textarea isolada (T9), tokens semânticos (T8/T9), mídia órfã via storageRef persistido (T7), Esc com guarda (T11), núcleo único (T9–11), tap targets ≥44px (`h-11` no datetime, sheet), worker media + sync + redeploy (T4).

**2. Varredura de placeholders:** sem "TBD/TODO/implementar depois". Todo passo que altera código mostra o código real.

**3. Consistência de tipos/símbolos:**
- `ScheduledMediaType = "image"|"video"|"audio"|"document"` casa com `IMediaAsset["kind"]` (confirmado).
- `IScheduledSend.scheduledFor: ISO8601 | null` usado de ponta a ponta (engine `formatScheduleConfirm(null)`, card "Sem horário", supabase Row `string | null`, migration nullable).
- `IScheduledSendProvider.create(... & { status? })` e `listStore` definidos na Task 2/5 e implementados nos dois backends (mock + supabase) na Task 5.
- `IScheduleFormState`/`IScheduledMediaDraft` (engine) consumidos por `useSchedulingComposer`, `useScheduleMediaUpload`, `MediaAttachField`, `ScheduleComposerForm` — mesmos nomes de campo (`mediaPath`/`mediaType`/`fileName`/`previewUrl`).
- `buildScheduledSendRequest` (worker) media → `{ kind:"media", mediaPath, mediaType, fileName, text }` bate com `ISendRequest` (confirmado em `send/core.ts`).
- `SchedulingViewMode`/`SCHEDULING_VIEW_MODES`, `SchedulingTab`, `ISchedulingShellProps` consistentes entre hook, types, panels, cascas e center.
- Barrel: adiciona `SchedulingCenter`/`ScheduleButton`/`SchedulingTab` (T12) e remove `ScheduleSendMenu`/`ScheduledList` (T14) — sem export dangling.

---

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/2026-06-13-scheduling-center.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — despacho um subagente novo por tarefa, com revisão (spec + qualidade) entre tarefas; iteração rápida e contexto isolado. ⚠️ As Tasks 1 (migration) e 4 (redeploy do worker) tocam **produção LIVE** e exigem parada para aprovação do dono antes de aplicar.

**2. Inline Execution** — executo as tarefas nesta sessão com checkpoints para revisão.

**Qual abordagem?**
