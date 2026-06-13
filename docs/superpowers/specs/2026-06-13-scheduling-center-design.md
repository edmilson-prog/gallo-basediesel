# Central de Agendamento de Mensagens (Scheduling Center) — Design

> **Status:** spec aprovado (design) · **Data:** 2026-06-13 · **Feature branch:** `feat/scheduling-center`
> **Fase 1** (esta entrega): 4 modos de exibição + rascunho + agendar mídia + fila global por papel.
> **Fase 2** (documentada aqui, NÃO implementada agora): melhor horário + recorrência.

---

## 1. Contexto e problema

O Inbox de WhatsApp do GALLO já agenda mensagens (camada `scheduledSend`, tabela `scheduled_sends`, worker server-side `scheduled-send-worker` + `pg_cron`, entregue na branch `feat/scheduled-send-worker`). O **disparo server-side funciona**. O problema é de **UX de composição**:

- O agendamento é acionado por um **split-button** colado no botão `Enviar` (um caret `▼` que abre o `ScheduleSendMenu`). Há **dois gatilhos de "enviar" lado a lado**.
- O usuário escreve no **mesmo textarea** do envio imediato, agenda, e em seguida clica em `Enviar` (achando que falta confirmar) — e a mensagem vai **imediatamente**.
- O estado "agendado" é quase invisível (a barra `ScheduledList` colapsada em `text-[11px]`), fora do campo de visão de quem olha o botão `Enviar`.
- O toast "Agendado… não precisa clicar em Enviar" é um band-aid verbal de um problema estrutural.

**Causa-raiz:** dois affordances de envio quase idênticos + estado de agendamento sem um lar visível.

## 2. Objetivo e princípios

Construir uma **Central de Agendamento**: um lugar dedicado para compor, agendar, revisar, editar, cancelar e rascunhar mensagens (texto e mídia), com **entrada por ícone próprio** e o botão `Enviar` voltando a ser **único**.

Princípios (do consultor de UI/UX):

1. **Uma intenção, um lugar.** Agendar acontece só na Central. O composer principal **nunca mais agenda**.
2. **Campo de composição próprio** — isolado do textarea do chat (sem ambiguidade de estado).
3. **Confirmação persistente, não efêmera** — badge no ícone de entrada + lista dentro da Central; o toast é reforço.
4. **CTA inequívoco, verbo único:** **`Agendar`**. Nunca "Enviar" dentro da Central. **Sem "Enviar agora".**
5. **Reversibilidade barata** — editar/cancelar a 1 clique; cancelar com undo de 5s.
6. **Data em linguagem natural + fuso** — "amanhã, 14/06 às 09:00 (horário de Brasília)".
7. **Tokens semânticos apenas** — `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`, `text-/bg-severity-{info|success|warning|critical}`. Proibido hex/`red-500` cru (o `ScheduledList` atual viola isso — será corrigido).

## 3. Decisões de escopo (confirmadas com o dono)

| Decisão | Resolução |
|---|---|
| Quantos modos | **Os 4** (Modal/Lateral/Inline/Timeline), alternáveis na UI, com **Modal como padrão**, preferência **salva por usuário**. |
| Escopo da fila de agendados | **Híbrido com RBAC:** vendedor vê só os agendamentos **da conversa atual**; **Owner/Gestor** veem também a **fila global** ("Todos"). |
| Rascunho | **Incluído** (Fase 1). Mensagem salva sem horário. |
| Agendar mídia | **Incluído** (Fase 1): áudio, vídeo, documento, imagem (1 anexo por mensagem). |
| Melhor horário / Recorrência | **Fase 2** (não implementar agora). **Documentar em detalhe** aqui (§20) para retomada com contexto zero. |

## 4. Arquitetura — núcleo único + 4 cascas

O ganho de design é **separar a lógica da apresentação**. Um **núcleo compartilhado** (estado + subcomponentes) é renderizado por **4 "cascas"** (shells). O seletor só troca a casca.

```
SchedulingCenter (orquestrador)
 ├─ useSchedulingViewMode()      → modo atual (modal|drawer|inline|timeline), persistido
 ├─ núcleo compartilhado (subcomponentes reaproveitados por todas as cascas):
 │    ├─ ScheduleComposerForm    → mensagem/legenda + anexo + horário + confirmação + aviso 24h + footer
 │    ├─ ScheduleTimePicker      → presets + datetime + validateFuture + frase natural + fuso
 │    ├─ MediaAttachField        → anexar/preview/remover (image/video/audio/document)
 │    ├─ ScheduledQueueList      → lista de agendados da conversa (cards)
 │    ├─ DraftsList              → rascunhos (sem horário)
 │    ├─ GlobalQueueList         → fila global (Owner/Gestor) com destinatário por item
 │    └─ ScheduledItemCard       → card unitário (preview, status, editar, cancelar)
 └─ casca ativa:
      ├─ SchedulingModalShell    (padrão)  → Dialog + abas
      ├─ SchedulingDrawerShell             → Sheet/vaul lateral
      ├─ SchedulingInlineShell             → painel acima do composer
      └─ SchedulingTimelineShell           → linha do tempo + (Fase 2: melhor horário/recorrência)
```

Regra: **as 4 cascas consomem os mesmos subcomponentes do núcleo**. Adicionar/ajustar um campo no `ScheduleComposerForm` reflete nos 4 modos. Nenhuma lógica de agendamento vive dentro das cascas — só layout.

## 5. Ponto de entrada (composer) — a mudança que mata o bug

No `MessageInput`:

- **Remover** o split-button caret `▼` (o `ScheduleSendMenu` atual). O botão `Enviar` volta a ser **um único botão**.
- **Adicionar** um ícone dedicado na fileira de ações (junto de 📎 anexo e 😊 emoji): **`ScheduleButton`** — ícone `mdi:calendar-clock`, `variant="ghost"`, `aria-label="Agendar mensagem"`, com `Tooltip`.
- **Badge persistente:** quando há agendados **pendentes** na conversa, o ícone ganha um badge com o N (`bg-primary text-primary-foreground text-[10px]`, canto sup. dir.). É a prova durável que substitui o toast. **Rascunhos não contam** no badge (ou contam com estilo neutro distinto — ver §15.3).
- Clique no ícone abre a Central no modo atual; clique quando há badge abre direto na aba **Agendados**.
- A barra colapsável `ScheduledList` **deixa de existir** como elemento separado acima do composer — sua função migra para dentro da Central (e o badge).

## 6. Modelo de dados (mudanças)

### 6.1 Tipos (`src/shared/types/quickSend.ts`)

```ts
// (1) novo estado "draft"
export type ScheduledSendStatus = "draft" | "pending" | "sent" | "cancelled" | "failed";

export interface IScheduledSend {
  id: ID;
  storeId: ID;
  conversationId: ID;
  // (2) opcional: rascunho não tem horário
  scheduledFor: ISO8601 | null;
  payload: {
    // (3) novo type "media" (texto + 1 anexo). Demais mantidos.
    type: "snippet" | "media" | "asset" | "combo" | "product";
    contextMessage?: string;   // texto (snippet) OU legenda (media)
    // campos de mídia (type="media"):
    mediaPath?: string;        // caminho no bucket whatsapp-media (upload feito ao anexar)
    mediaType?: "image" | "video" | "audio" | "document";
    fileName?: string;         // nome original (rótulo de documento)
    // existentes (inalterados):
    assetIds?: ID[];
    quickReplyId?: ID;
    productId?: ID;
  };
  status: ScheduledSendStatus;
  failureReason?: string;
  createdBy: ID;
  createdAt: ISO8601;
  // já existe no banco (worker fase 1): dispatch_started_at — não exposto no tipo de UI.
}
```

### 6.2 Migrations (espelhar em `supabase/migrations/`)

1. **`scheduled_for` nullable** (rascunhos):
   ```sql
   alter table public.scheduled_sends alter column scheduled_for drop not null;
   ```
2. **status aceita `draft`** — se existir CHECK constraint em `status`, recriá-la incluindo `'draft'`; se for `text` livre, nada a fazer (verificar com `\d scheduled_sends`).
3. **payload** — jsonb já flexível; **sem mudança de schema**.

> O **claim RPC** `claim_due_scheduled_sends` já filtra `status = 'pending' AND scheduled_for <= now()`. Rascunhos (`status='draft'`, `scheduled_for IS NULL`) são **naturalmente ignorados** pelo worker. Nenhuma mudança no claim.

### 6.3 RLS (sem mudança)

A RLS de `scheduled_sends` é **store-scoped** (`store_id = current_store_id()` em select/insert/update/delete). Todos os membros da loja já podem **ler** as linhas da loja no banco. A restrição "vendedor só vê a própria conversa" é **regra de UI/provider** (filtro por `conversationId`), **não** de RLS. A fila global (Owner/Gestor) usa a mesma RLS store-scoped — **não precisa de migration de policy**. (O gate por papel é de produto, não fronteira de segurança — documentar.)

## 7. Camada de providers (`IScheduledSendProvider`)

Métodos atuais: `list`, `listDue`, `create`, `update`, `cancel`, `markSent`, `markFailed`. Mudanças/adições:

```ts
interface IScheduledSendProvider {
  // existentes
  list(conversationId: ID): Promise<IScheduledSend[]>;          // todos da conversa (inclui drafts)
  listDue(now: ISO8601): Promise<IScheduledSend[]>;             // usado só pelo runner mock
  create(input): Promise<IScheduledSend>;                       // aceita status 'draft' (scheduledFor null)
  update(id, patch): Promise<IScheduledSend>;                   // converte draft→pending, edita conteúdo/mídia/hora
  cancel(id): Promise<IScheduledSend>;
  markSent(id): Promise<IScheduledSend>;
  markFailed(id, reason): Promise<IScheduledSend>;
  // NOVO — fila global (Owner/Gestor); store-scoped via RLS, role-gated na UI
  listStore(params?: { status?: ScheduledSendStatus[] }): Promise<IScheduledSendWithContext[]>;
}

// para a fila global, cada item precisa do destinatário
interface IScheduledSendWithContext extends IScheduledSend {
  customerName: string | null;
  customerPhone: string | null;
}
```

- `create`: quando `status:'draft'`, `scheduledFor` pode ser null; o provider grava `status='draft'`.
- `update`: usado para (a) reagendar, (b) editar conteúdo/mídia, (c) **converter rascunho em agendado** (set `scheduledFor` + `status='pending'`).
- `listStore`: SELECT store-wide (pending por padrão) com join em `conversations`/`customers` para nome/telefone. Mock retorna determinístico.
- **Mock e Supabase** implementam tudo. `getActiveDataSource()` continua chaveando.

## 8. Núcleo compartilhado — subcomponentes

Todos em `src/features/quick-send/components/scheduling/` (nova pasta), consumindo hooks existentes (`useScheduleSend`, `useConversationScheduled`) refatorados + os novos.

### 8.1 `ScheduleComposerForm`
- **Campo de mensagem/legenda** — `Textarea` própria (`bg-background border-border`), label "Mensagem" → "Mensagem / legenda" quando há anexo. **Nunca** compartilha estado com o textarea do composer do chat. Suporta inserir resposta rápida (`useQuickReplies`/slash já existentes).
- **`MediaAttachField`** (§8.3).
- **`ScheduleTimePicker`** (§8.2).
- **Footer:** `[Salvar rascunho]` (ghost, esquerda) · · · `[Cancelar]` (outline) · **`[Agendar]`** (primary). **Sem "Enviar agora".** Em modo edição de rascunho, o CTA primário pode ser "Agendar" (define horário) e há "Salvar rascunho" para manter sem horário.
- **Validação:** "Agendar" desabilitado se (mensagem vazia E sem mídia) ou horário ausente/no passado; tooltip explicativo. Rascunho exige só conteúdo (texto ou mídia), não horário.
- **Modo edição:** abre pré-carregado (texto + mídia + hora); CTA vira "Salvar alterações".

### 8.2 `ScheduleTimePicker`
- **Presets** como chips (`ToggleGroup`): manter `Amanhã 09:00`, `Segunda 08:00`; trocar `Hoje 18:00` por **`Amanhã 08:00`** (B2B/início de expediente — sugestão do consultor; confirmar microcopy em §13).
- **Custom:** `<input type="datetime-local">` com `min={now}`. Reusar `validateFuture`.
- **Frase de confirmação** (sempre visível abaixo): **"Será enviado {dia da semana}, {dd/mm} às {hh:mm} (horário de Brasília)."** Estender `formatScheduleLabel` para incluir dia da semana + fuso.
- **Aviso de 24h** (não bloqueante): se o horário cai fora da janela estimada (via `useMetaWindow`/`engine/sessionWindow`) e a conta é Meta sem template → alerta `text-severity-warning`/`bg-severity-warning/10` com CTA "Usar template". Permite agendar mesmo assim.

### 8.3 `MediaAttachField`
- Botão "Anexar ▾" (`DropdownMenu`) com **Imagem / Vídeo / Documento / Áudio** (mesmos `ATTACHMENT_ACCEPT` do `useAttachmentUpload`).
- **Upload no momento do anexo** (sobe ao bucket `whatsapp-media`, padrão PRD-119); o agendamento guarda o **`mediaPath`** (não o blob).
- **Chip de anexo** (reusar visual de `ComposerStagedAsset`): ícone por tipo / thumb, nome, tamanho, remover `✕`. Áudio mostra duração; vídeo mostra thumbnail.
- **Fase 1: 1 anexo por mensagem** (espelha "uma mídia + legenda" do WhatsApp). Múltiplos anexos = Fase futura (nota §19).
- Estado de erro de upload: chip `border-severity-critical/40` + "Falha no upload. Tentar de novo.".

### 8.4 `ScheduledQueueList` + `ScheduledItemCard`
- Cards (`bg-card border-border rounded-md p-3`): ícone do tipo + preview do conteúdo + **hora em linguagem natural** + status + ações.
- **Status por severidade semântica:** `Pendente`→`text-severity-info` (dot); `Enviado`→`text-severity-success`; `Falhou`→`text-severity-critical` + `failureReason` + botão **"Reagendar"**. (Corrigir o `red-500` cru atual do `ScheduledList`.)
- **Editar:** abre o `ScheduleComposerForm` em modo edição (conteúdo + mídia + hora) — mais rico que o reschedule-só-hora atual.
- **Cancelar:** undo 5s (padrão sonner já usado).
- **Estado vazio:** `mdi:calendar-blank-outline` + "Nenhuma mensagem agendada nesta conversa." + CTA "Criar agendamento".

### 8.5 `DraftsList`
- Seção/aba separada (ou separador "Rascunhos" no topo da lista). Item de rascunho: ícone `mdi:file-edit-outline`, status neutro `text-muted-foreground`, **"Sem horário definido"**, CTA **"Definir horário"** (abre o form em edição p/ virar agendado) + "Excluir".

### 8.6 `GlobalQueueList` (Owner/Gestor)
- Aba/visão "Todos · N 🔐". Reusa `ScheduledItemCard` + **destinatário** (nome/telefone) por item. Agrupável por dia. Clique num item pode navegar para a conversa.
- **Gate:** renderizada só para `Owner`/`Gestor` (via `useAuth().userRole`/`hasRole`). Vendedor não vê a aba.

### 8.7 `ScheduleModeSwitcher`
- Segmented control (4 ícones: `▣` Modal, `▦` Lateral, `▤` Inline, `≣` Timeline) no header da Central. `aria-pressed` no ativo.
- Persiste via `useSchedulingViewMode()` → `localStorage` chave **`gallo-scheduling-view-mode`** (adicionar às `LOCALSTORAGE_KEYS`). Default `modal`. Trocar de modo **não** perde o conteúdo em composição (o estado do form vive no núcleo, acima das cascas).

## 9. As 4 cascas (layouts)

### 9.1 `SchedulingModalShell` (padrão) — `Dialog` shadcn
- `DialogContent` `sm:max-w-lg` (~560px). Header: "⏰ Agendar mensagem" + contexto "Conversa com {nome} · {telefone}" + `ScheduleModeSwitcher` (topo dir.) + `×`.
- **Tabs:** `Novo agendamento` · `Agendados · N` · (Owner/Gestor) `Todos · N 🔐`.
- Abertura contextual: ícone → aba "Novo"; clique no badge → aba "Agendados".
- Mobile (<640px): vira **bottom-sheet** (`vaul`/`Drawer`), ~90% altura, footer sticky, tap targets ≥44px.

### 9.2 `SchedulingDrawerShell` — `Sheet`/`vaul` lateral (direita)
- Painel desliza da direita **sem cobrir a conversa**. Topo: `ScheduleComposerForm`; abaixo: `ScheduledQueueList` (+ `GlobalQueueList` p/ Owner/Gestor via toggle). Header com switcher. Bom para volume alto.

### 9.3 `SchedulingInlineShell` — painel acima do composer
- Expande **acima** do `MessageInput` (empurra o histórico, não é overlay). Form compacto + lista compacta, recolhível. Switcher no cabeçalho do painel. Menor disrupção; aperta com mídia/lista longa (aceitável).

### 9.4 `SchedulingTimelineShell` — linha do tempo
- **Fase 1:** visão de **linha do tempo** dos próximos agendamentos (da conversa; Owner/Gestor podem ver da loja) ordenados por horário, com `ScheduledItemCard` ao longo do eixo temporal. Botão "+ Novo" abre o `ScheduleComposerForm` (mesmo núcleo).
- **Fase 2 (§20):** camada de "melhor horário" + recorrência aparece **aqui**.

## 10. Worker / backend (dispatch de mídia)

O worker `scheduled-send-worker` hoje só despacha `snippet`→texto. Estender:

- **Núcleo puro** `src/providers/whatsapp/scheduled/core.ts` → `buildScheduledSendRequest`:
  - `snippet` → `{ kind:"text", text: contextMessage }` (como hoje).
  - **`media`** → `{ kind:"media", mediaPath, mediaType, fileName, text: contextMessage /* legenda */ }`.
  - demais (`asset|combo|product`) → `NOT_SUPPORTED` (como hoje).
  - **Rodar o sync** (`scripts/sync-whatsapp-shared.ts`) e **redeployar** o worker (regra da camada `src/providers/whatsapp/`).
- `processSendRequest` já trata `kind:"media"` (assina o `mediaPath` do bucket via `createSignedMediaUrl`). Nenhuma mudança no `send/core.ts`.
- **Drafts nunca disparam** (claim filtra `status='pending'`).
- **Atualizar o teste** `scheduled/core.test.ts` (caso `media`).

## 11. i18n (microcopy pt-BR)

Estender `QUICK_SEND_STRINGS.schedule` (`src/features/quick-send/i18n/pt-BR.ts`). Chaves novas/ajustadas (acentuação correta):

| Chave | Texto |
|---|---|
| `centerTitle` | `Agendar mensagem` |
| `centerContext` | `(nome, fone) => Conversa com ${nome} · ${fone}` |
| `tabNew` | `Novo agendamento` |
| `tabScheduled` | `(n) => Agendados · ${n}` |
| `tabAll` | `(n) => Todos · ${n}` |
| `entryTooltip` | `Agendar mensagem` |
| `fieldLabel` / `fieldLabelMedia` | `Mensagem` / `Mensagem / legenda` |
| `fieldPlaceholder` | `Escreva a mensagem que será enviada no horário escolhido…` |
| `attach` | `Anexar` (`Imagem`/`Vídeo`/`Documento`/`Áudio`) |
| `whenLabel` | `Quando enviar` |
| presets | `Amanhã 08:00` · `Amanhã 09:00`* · `Segunda 08:00` (revisar conjunto final) |
| `confirmLine` | `(dia,data,hora) => Será enviado ${dia}, ${data} às ${hora} (horário de Brasília).` |
| `window24hWarn` | `Fora da janela de 24h — pode falhar se o cliente não responder antes. Considere um template.` |
| `ctaSchedule` | `Agendar` (NUNCA "Enviar") |
| `ctaSaveDraft` | `Salvar rascunho` |
| `ctaSaveEdit` | `Salvar alterações` |
| `draftNoTime` | `Sem horário definido` · `setTime` → `Definir horário` |
| `discardConfirm` | `Descartar este agendamento? O texto e os anexos serão perdidos.` |
| `disabledEmpty` | `Escreva uma mensagem ou anexe um arquivo.` |
| `scheduledToast` | `(quando) => Mensagem agendada para ${quando}.` (remover o "não precisa clicar em Enviar" — desnecessário sem o caret) |
| empty/undo/status | reusar `emptyList`, `undo`, badges `Pendente/Enviado/Falhou` |

## 12. Acessibilidade e mobile

- **Foco/teclado:** ícone ⏰ focável (`Enter`/`Space` abre, `aria-haspopup="dialog"`). Dentro do `Dialog` (Radix): foco no 1º campo, focus-trap, `Esc` fecha **com guarda** (`AlertDialog` "Descartar?" se houver conteúdo não salvo). Tabs por `←/→`. Footer tab-order: Salvar rascunho → Cancelar → **Agendar**. `Ctrl/Cmd+Enter` = Agendar. Foco retorna ao ícone ao fechar.
- **Mobile:** Modal vira bottom-sheet; presets em `flex-wrap` (2 linhas, sem scroll horizontal escondido); `datetime-local` usa picker nativo; tap targets ≥44px (`h-11/h-12` no sheet).

## 13. Presets (decisão pendente menor)

O consultor sugere trocar `Hoje 18:00` (fim de expediente) por `Amanhã 08:00` (B2B abre cedo). **Decisão:** manter os 3 presets atuais na Fase 1 e revisitar o conjunto com dados de uso — exceto se o dono preferir já trocar. (Anotar como ajuste de microcopy, baixo risco.)

## 14. RBAC detalhado

- **Vendedor:** abas `Novo` + `Agendados` (só da conversa atual). Sem aba `Todos`.
- **Owner/Gestor:** + aba/visão `Todos · N 🔐` (fila global da loja, com destinatário). Gate por `hasRole(["Owner","Gestor"])`.
- Não é fronteira de segurança (RLS store-scoped protege o dado); é organização de produto.

## 15. Estados e regras de borda

| Estado | Tratamento |
|---|---|
| Sem agendados | Empty state + CTA "Criar agendamento"; badge some. |
| Conteúdo vazio | "Agendar"/"Salvar rascunho" desabilitados + tooltip `disabledEmpty`. |
| Horário no passado | `validateFuture` rejeita inline (`pastRejected`), não só toast. |
| Upload falhou | Chip em erro + "Tentar de novo". |
| Janela 24h fechada (Meta) | Aviso `severity-warning`; permite agendar. |
| Item já enviado | Não editável; card mostra `Enviado`, ações desabilitadas. |
| Trocar de modo com form preenchido | Conteúdo preservado (estado no núcleo). |
| Fechar (Esc/×) com conteúdo não salvo | Guarda de descarte. |

### 15.3 Rascunho vs Agendado (inequívoco)
| | Rascunho | Agendado |
|---|---|---|
| Ícone | `mdi:file-edit-outline` | `mdi:clock-outline` |
| Cor status | `text-muted-foreground` | `text-severity-info` |
| Tem horário? | Não ("Sem horário definido") | Sim ("Amanhã, 09:00") |
| Conta no badge ⏰? | Não (ou estilo neutro distinto) | Sim |
| CTA do card | "Definir horário" | "Editar" / "Cancelar" |

## 16. Testes (Vitest)

- **Engine** (`engine/scheduledSend.ts`): `validateFuture`, `isDue`, `formatScheduleLabel` (incl. dia da semana/fuso) — casos novos.
- **Núcleo do worker** (`providers/whatsapp/scheduled/core.ts`): `buildScheduledSendRequest` caso **`media`** (mapeia para `kind:"media"` com path/type/caption) + `snippet` (mantido) + tipos não suportados.
- **Hook de estado** da Central (composição, troca de modo preserva estado, draft↔agendado).
- **Mock providers**: `create` draft, `update` converte draft→pending, `listStore`.
- Gate prático: `bun run test` + `bun run build` + `bunx tsc --noEmit` (delta).

## 17. Estrutura de arquivos

**Criar:**
```
src/features/quick-send/components/scheduling/
  SchedulingCenter.tsx           (orquestrador + escolhe a casca)
  ScheduleButton.tsx             (ícone ⏰ + badge no composer)
  ScheduleModeSwitcher.tsx
  ScheduleComposerForm.tsx
  ScheduleTimePicker.tsx
  MediaAttachField.tsx
  ScheduledQueueList.tsx
  ScheduledItemCard.tsx
  DraftsList.tsx
  GlobalQueueList.tsx
  shells/SchedulingModalShell.tsx
  shells/SchedulingDrawerShell.tsx
  shells/SchedulingInlineShell.tsx
  shells/SchedulingTimelineShell.tsx
src/features/quick-send/hooks/useSchedulingViewMode.ts
src/features/quick-send/hooks/useSchedulingDrafts.ts   (ou estende useConversationScheduled)
src/features/quick-send/hooks/useGlobalScheduled.ts    (Owner/Gestor)
+ migrations: scheduled_for nullable; status check (se houver)
```
**Modificar:**
```
src/features/conversations/components/MessageInput.tsx   (remove split-button; adiciona ScheduleButton; Enviar único)
src/features/quick-send/engine/scheduledSend.ts          (formatScheduleLabel + dia/fuso)
src/features/quick-send/i18n/pt-BR.ts                    (microcopy §11)
src/shared/types/quickSend.ts                            (status draft; scheduledFor nullable; payload media; IScheduledSendWithContext; contrato listStore)
src/providers/data/contracts/scheduledSend.ts            (listStore)
src/providers/data/impl/mock/scheduledSend.ts            (draft/listStore/media)
src/providers/data/impl/supabase/scheduledSend.ts        (draft/listStore/media)
src/providers/whatsapp/scheduled/core.ts (+ .test.ts)    (caso media) → sync → redeploy worker
src/config/themes.ts                                     (LOCALSTORAGE_KEYS: gallo-scheduling-view-mode)
```
**Remover (migrado para a Central):**
```
src/features/quick-send/components/ScheduleSendMenu.tsx   (split-button)
src/features/quick-send/components/ScheduledList.tsx      (barra acima do composer)
```

## 18. Migração / compatibilidade

- Dados existentes em `scheduled_sends` continuam válidos (text/snippet). O worker e o claim não mudam de contrato (só ganham o caso `media`).
- O runner **mock-only** (`useScheduledSendRunner`) permanece, mas o disparo de mídia no mock pode ser simulado como hoje (objeto local). Em supabase o worker dispara.
- Remoção de `ScheduleSendMenu`/`ScheduledList` exige atualizar imports em `MessageInput`/`ConversationPage`.

## 19. Não-objetivos (Fase 1)

- Múltiplos anexos numa mesma mensagem agendada (1 por mensagem na Fase 1).
- Melhor horário e recorrência (Fase 2 — §20).
- Página/rota global dedicada fora do Inbox (a fila global vive na Central).
- Mudança de RLS (gate de papel é de UI).

---

## 20. FASE 2 — documentação para retomada com contexto zero

> **NÃO implementar agora.** Esta seção existe para que uma sessão futura, **sem nenhum contexto prévio**, consiga implementar os extras. Cada item traz: o quê, modelo de dados, backend, UI e armadilhas.

### 20.1 Melhor horário (best-time-to-send)

**O quê:** sugerir, na Central (e destacar no modo Timeline), o melhor horário para falar com aquele cliente, baseado em **quando ele costuma responder/ler**.

**Fonte de dados:** a tabela `messages` já guarda mensagens `direction='in'` (recebidas) com `created_at`/`sent_at`. A heurística deriva do **histograma de horários** das mensagens recebidas daquele `conversationId`/`customerId`.

**Heurística (v1 simples, sem ML):**
1. Buscar timestamps das últimas N (ex.: 50) mensagens `in` do cliente.
2. Converter para hora local (fuso da loja) e agrupar em janelas (ex.: blocos de 1h ou faixas manhã/tarde/noite).
3. Sugerir a faixa com maior contagem (ex.: "Costuma responder 08–10h"). Empate → mais recente.
4. Fallback quando há poucos dados (<5 msgs in): sugerir início de expediente (08:00) e marcar como "sugestão padrão".

**Onde calcular:** RPC `public.best_send_window(p_conversation_id)` (SECURITY INVOKER, store-scoped por RLS) que retorna a faixa + confiança; OU computar no cliente a partir das mensagens já carregadas (mais barato, sem RPC). Preferir **RPC** para não depender do histórico estar carregado.

**UI:** no `ScheduleTimePicker`, um chip extra "💡 Melhor horário: 08–10h" que, ao clicar, pré-seleciona o próximo horário dentro da faixa. No Timeline, um marcador/halo na faixa recomendada.

**Armadilhas:** fuso (sempre normalizar p/ fuso da loja); cliente sem histórico (fallback); não confundir "melhor horário" com "janela de 24h" (são coisas distintas).

### 20.2 Agendamento recorrente

**O quê:** agendar repetição — diária, semanal (dias da semana), mensal (dia do mês) — com fim opcional (data limite ou nº de ocorrências). Ex.: "Lembrete de boleto todo dia 1º".

**Modelo de dados (extensão):**
```sql
-- nova coluna em scheduled_sends, ou tabela scheduled_recurrences
alter table public.scheduled_sends add column recurrence jsonb; -- null = one-shot
-- recurrence: { freq: 'daily'|'weekly'|'monthly', interval:int,
--               byWeekday?:int[], byMonthday?:int, until?:ISO8601, count?:int, sent?:int }
```
Tipo: estender `IScheduledSend` com `recurrence?: IRecurrenceRule | null`.

**Backend (worker):** ao despachar com sucesso uma ocorrência recorrente, o worker **cria a próxima ocorrência** (calcula `nextOccurrence(recurrence, scheduledFor)`), respeitando `until`/`count`. Engine puro `engine/recurrence.ts` (`nextOccurrence`, `isExhausted`) — **testável**, espelhado se for usado server-side. Idempotência: gerar a próxima só após `markSent`, dentro de proteção contra duplicidade (a próxima tem `scheduled_for` futuro, não reentra no mesmo tick).

**UI:** no `ScheduleComposerForm`, um bloco "Repetir" (off por padrão) → `Select` de frequência + controles (dias da semana / dia do mês) + fim ("Nunca" / "Em DD/MM" / "Após N envios"). No card e no Timeline, ícone `↻` + label "Repete semanalmente, seg/qua/sex".

**Armadilhas:** meses curtos (dia 31 → último dia do mês); horário de verão/fuso; parar a recorrência ao cancelar (cancelar deve oferecer "só esta" vs "esta e as próximas"); não criar enxurrada de ocorrências de uma vez (gerar **só a próxima**, lazy).

### 20.3 Sequência sugerida da Fase 2
1. Melhor horário (read-only, baixo risco) — RPC + chip no picker + halo no Timeline.
2. Recorrência (mais pesado) — engine `recurrence.ts` testado → coluna `recurrence` + migration → worker cria próxima → UI de regras. Entregar atrás de feature flag se preciso.

---

## 21. Riscos e armadilhas (Fase 1)

1. **Recriar os dois "enviar".** Nada de "Enviar agora" ao lado de "Agendar". Verbo único.
2. **Confiar só no toast.** Prova persistente = badge + lista; toast é reforço.
3. **Compartilhar textarea do composer.** Estado isolado na Central.
4. **Violar tokens.** Corrigir `red-500` do `ScheduledList` → `severity-critical`. Nada de hex.
5. **Mídia órfã.** O `mediaPath` agendado aponta para um arquivo no bucket; garantir que ele persiste até o disparo (não limpar). Cancelar/excluir um agendamento de mídia pode (opcional) remover o arquivo.
6. **Esc destrutivo.** Guarda de descarte com conteúdo não salvo.
7. **4 cascas divergirem.** Toda lógica no núcleo; cascas só posicionam.
8. **Tap targets 36px no mobile.** Subir para ≥44px no sheet.
9. **Worker sem o caso media.** Atualizar `scheduled/core.ts` + teste + **sync + redeploy** (senão mídia agendada falha com NOT_SUPPORTED).

---

### Referências de código (pontos de partida)
- Composer/split-button atual: `src/features/conversations/components/MessageInput.tsx`
- A remover: `src/features/quick-send/components/ScheduleSendMenu.tsx`, `ScheduledList.tsx`
- Engine (reusar/estender): `src/features/quick-send/engine/scheduledSend.ts`
- Hooks de dados: `src/features/quick-send/hooks/useScheduleSend.ts`, `useConversationScheduled.ts`
- Tipos/contrato: `src/shared/types/quickSend.ts`
- Providers: `src/providers/data/impl/{mock,supabase}/scheduledSend.ts`
- Worker core: `src/providers/whatsapp/scheduled/core.ts` (+ mirror `_shared/`); função `scheduled-send-worker`
- Anexos: `src/features/conversations/hooks/useAttachmentUpload.ts`
- Janela 24h: `src/features/conversations/hooks/useMetaWindow.ts` / `engine/sessionWindow.ts`
- Tokens/localStorage: `src/config/themes.ts`, `src/styles.css`
