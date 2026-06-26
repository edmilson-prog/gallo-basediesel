# Fluxo de Status das Conversas — Design

> **Data:** 2026-06-14
> **Origem:** brainstorming (visual companion) sobre o fluxo de trabalho do inbox de atendimento.
> **Status:** aprovado pelo dono; pronto para virar plano de implementação.

## Contexto

O inbox de Conversas (WhatsApp) já tem um modelo de status, mas ele está **subutilizado e inconsistente**:

- O tipo `ConversationStatus` (`src/shared/types/conversation.ts`) já define **5 estados**: `aguardando`, `em_andamento`, `aguardando_cliente`, `resolvida`, `arquivada`.
- As cores estão **duplicadas e divergentes** em dois arquivos (`STATUS_TONE` em `ConversationHeader.tsx` × `STATUS_BORDER` em `conversationDisplay.ts`) e usam **cores cruas** (`orange-500`, `emerald-500`) em vez dos tokens semânticos exigidos pelo `docs/dev/ux-guidelines.md` §5.
- Os status se distinguem **apenas por cor** (falha WCAG 1.4.1) e "Aguardando" vs "Aguardando cliente" são fáceis de confundir. O verde de `em_andamento` ainda **briga com o verde do canal WhatsApp**.
- Só dá para **resolver/reabrir e arquivar/desarquivar** pelo menu kebab (`ConversationMenu.tsx`), escondido; **não há** controle para colocar a conversa em `aguardando_cliente` nem para transitar livremente.
- **Nenhuma transição automática** após a criação: o status congela no estado inicial.

## Objetivo

Dar ao atendente **controle visível de troca de status**, automatizar as transições de "de quem é a bola" e **unificar/poluir menos** a linguagem visual — tudo isso **sem inventar status novos** (os 5 atuais são o conjunto certo).

## Não-objetivos (YAGNI)

- **Não** criar status novos (nada de "Novo", "Snooze/Adiada", "Spam", "Aguardando estoque/financeiro" — isso é `tags`, não status).
- **Não** transformar `arquivada` em booleano `isArchived` agora (refactor de modelo adiado; mantemos `arquivada` no enum — "Opção A").
- **Não** automatizar `resolvida` por silêncio, nem `aguardando_cliente` a cada resposta.
- **Não** criar a ação combinada "Responder e aguardar cliente" (refinamento futuro).

---

## 1. Modelo de status (intocado)

Mantém-se `ConversationStatus = "aguardando" | "em_andamento" | "aguardando_cliente" | "resolvida" | "arquivada"`. Sem migração de tipo. `arquivada` permanece no enum, mas é tratada como **eixo separado** na UI (ver §3): nunca aparece no seletor de status; só nas ações de arquivar/desarquivar do kebab.

## 2. Identidade visual (Direção 1 — aprovada)

**Fonte única de verdade** — criar `STATUS_META` em `src/features/conversations/utils/conversationDisplay.ts` e fazer header, lista e filtro consumirem dela. Remover `STATUS_TONE` (`ConversationHeader.tsx`) e `STATUS_BORDER` (`conversationDisplay.ts`) duplicados.

Forma do registro (por status):

```ts
interface IStatusMeta {
  label: string;        // rótulo curto pt-BR exibido na pílula
  ariaLabel: string;    // rótulo acessível, desambiguado
  icon: string;         // nome mdi (Iconify)
  severity: "warning" | "info" | "success" | "primary" | "muted"; // token semântico
  shape: "filled" | "outline" | "check"; // ● cheia / ○ vazada / ✓
}
```

Mapeamento aprovado:

| status | label | ariaLabel | icon (mdi) | token (severity) | forma |
|---|---|---|---|---|---|
| `aguardando` | "Aguardando" | "Aguardando atendimento" | `mdi:account-clock-outline` | `warning` (âmbar) | ● filled |
| `em_andamento` | "Em atendimento" | "Em atendimento" | `mdi:message-processing-outline` | `primary` (dourado) | ● filled |
| `aguardando_cliente` | "Aguardando cliente" | "Aguardando resposta do cliente" | `mdi:account-arrow-left-outline` | `info` (azul) | ○ outline |
| `resolvida` | "Resolvida" | "Resolvida" | `mdi:check-circle-outline` | `success` (verde) | ✓ check |
| `arquivada` | "Arquivada" | "Arquivada" | `mdi:archive-outline` | `muted` (cinza) | — |

Regras:
- Cores **sempre** via tokens semânticos (`severity-*` de `src/styles.css`, com paridade AA no claro/escuro) ou `primary`/`muted`. **Nenhum hex/cor crua.**
- Toda superfície mostra **forma + ícone + rótulo**, não só cor (acessibilidade). `●` cheia = "nossa vez de agir" (`aguardando`, `em_andamento`); `○` vazada = "esperando o cliente" (`aguardando_cliente`).
- Consumidores: **pílula do header** (`ConversationHeader.tsx`), **barra lateral de 3px da lista** (`ConversationListItem.tsx`) e **rótulos do filtro** (`InboxFilters.tsx`). O `aria-label` do item de lista passa a **incluir o status**.

## 3. Controle de troca de status (3 modos + switch no header)

Os **três modos coexistem**; o atendente escolhe via um **interruptor discreto no próprio cabeçalho** da conversa. Preferência **salva por dispositivo** (localStorage), **padrão = modo A**.

- **Modo A — Pílula-seletor + botão "Resolver"** (padrão): a pílula de status é um *trigger* (clique → escolhe entre os 4 estados do ciclo: aguardando / em atendimento / aguardando cliente / [resolver]). Botão **"Resolver"** dedicado (vira "Reabrir" quando `resolvida`).
- **Modo B — Menu único**: um único menu concentra as transições do ciclo + Resolver.
- **Modo C — Segmentado**: segmentos visíveis, um por status do ciclo, + botão "Resolver".

Detalhes:
- **Interruptor de modo:** ícone discreto no header (ex.: `mdi:cog-outline` ou `mdi:dots-grid`) abrindo um popover com os 3 modos (mini-preview). Persistência: hook `useStatusControlMode` → `localStorage` chave **`gallo-conversation-status-control-mode`** (valores `pill` | `menu` | `segmented`, default `pill`).
- **Arquivar/Desarquivar:** permanece no **menu kebab** (`ConversationMenu.tsx`) — eixo separado, fora do seletor de status.
- **Mudança manual:** persiste via `useConversationsProvider().update(id, { status })` (contrato já existe). **RBAC:** atendente atribuído + Owner/Gestor (reusar `usePermission`/`hasRole`). Update **otimista** + **invalidação de query** (aprendizado do PR #66) + **Realtime** para refletir nos demais atendentes (anti-regressão do PR #69). `toast.success`/`toast.error` com strings de `CONVERSATION_STRINGS`.

Componentes (novos):
- `src/features/conversations/components/status/StatusControl.tsx` — recebe `mode` + `conversation` + handlers; renderiza A/B/C.
- `.../status/StatusControlModeSwitcher.tsx` — o interruptor discreto.
- `src/features/conversations/hooks/useStatusControlMode.ts` — preferência persistida.

## 4. Automação (server-side)

Regras de transição (o coração do "de quem é a bola"):

| Gatilho | De | Para | Tipo |
|---|---|---|---|
| Cliente escreve (1ª msg, conversa nova) | — | `aguardando` | auto *(já existe)* |
| Atendente humano responde | `aguardando` | `em_andamento` | **auto (novo)** |
| Cliente responde | `em_andamento` / `aguardando_cliente` | `aguardando` | **auto (novo)** |
| Cliente escreve numa conversa resolvida | `resolvida` | `aguardando` + aviso | **auto (novo), gated** (§5) |
| Atendente marca | `em_andamento` | `aguardando_cliente` | manual |
| Botão Resolver | qualquer ativo | `resolvida` | manual |
| Reabrir proativo | `resolvida` | `em_andamento` | manual |
| Arquivar/Desarquivar | qualquer ↔ `arquivada` | — | manual (kebab) |

Localização (camada **runtime-agnostic** → exige espelho em `_shared/` + `scripts/sync-whatsapp-shared.ts` + **redeploy** das Edge Functions):
- **Inbound** (`src/providers/whatsapp/webhook/core.ts` + `supabase/functions/_shared/whatsapp/webhook/core.ts`): ao anexar mensagem do cliente a uma conversa existente, computar o próximo status via engine (§7) e atualizar. Reabertura de `resolvida` só se o parâmetro (§5) estiver ligado.
- **Outbound humano** (`src/providers/whatsapp/send/core.ts` + espelho `_shared`): se a conversa está `aguardando`, mover para `em_andamento`. Aplica-se a `authorType` humano (`seller`); ver interação com SDR abaixo.

**Aviso de reabertura automática:** ao reabrir uma `resolvida`, inserir uma **mensagem de sistema** no thread (`authorType: "system"`, ex.: "Conversa reaberta automaticamente — o cliente respondeu") para o atendente não perder. Leve, reaproveita o tipo `system` já existente.

**Interação com SDR (`isSdrActive`):** enquanto o SDR está conduzindo, é ele quem responde. Para não poluir a fila humana, **suprimir** o auto-`aguardando` em inbound enquanto `isSdrActive` (o SDR trata; ao escalar para humano, o fluxo normal retoma). Detalhe fino a confirmar no plano, mas a decisão de design é: **SDR ativo ⇒ não força `aguardando` automático**.

## 5. Parâmetro configurável — reabertura automática

Novo ajuste de plataforma (pedido do dono no P1):

- Campo em `IPlatformSettings` (`src/shared/types/platform.ts`): **`autoReopenResolvedOnInbound: boolean`**, **default `true`**.
- Persistência: coluna na tabela de settings (migration espelhada em `supabase/migrations/`); exposto pelo `settings` provider (mock + supabase).
- UI: **Configurações da plataforma** (Owner) — toggle **"Reabrir conversas resolvidas automaticamente quando o cliente responde"**, com texto de ajuda.
- Leitura **server-side**: o webhook lê esse parâmetro (store-scoped) antes de reabrir; desligado ⇒ a conversa permanece `resolvida` (sem reabertura, sem aviso).

## 6. Acessibilidade & realtime

- Forma + ícone + rótulo em toda representação; `aria-label` inclui o status (item de lista, pílula do header, trigger do controle: "Alterar status da conversa").
- Contraste AA (validar no `/design-system`); animações (se houver pulse no `em_andamento`) sob `motion-safe:`.
- Troca de status reflete em tempo real para outros atendentes (Realtime já presente no inbox).

## 7. Testes

Engine **puro** (Vitest, co-localizado) — `src/features/conversations/engine/statusTransitions.ts`:
- `nextStatusOnInbound(current, { isSdrActive, autoReopenResolved }): ConversationStatus | null` — cobre: em_andamento→aguardando, aguardando_cliente→aguardando, resolvida→aguardando (só se autoReopen), aguardando→null (no-op), isSdrActive⇒null.
- `nextStatusOnOutboundHuman(current): ConversationStatus | null` — aguardando→em_andamento; demais→null.
- Lógica de preferência de modo (`useStatusControlMode`) — valor inválido cai no default `pill`.

## 8. Arquivos prováveis (para o plano)

**Frontend**
- `utils/conversationDisplay.ts` — `STATUS_META` único (remove duplicação).
- `components/ConversationHeader.tsx` — consumir `STATUS_META`; integrar `StatusControl` + "Resolver" + `StatusControlModeSwitcher`.
- `components/ConversationListItem.tsx` — barra + `aria-label` via `STATUS_META`.
- `components/InboxFilters.tsx` — rótulos via `STATUS_META`.
- `components/ConversationMenu.tsx` — manter resolver/arquivar coerentes.
- **Novos:** `components/status/StatusControl.tsx`, `components/status/StatusControlModeSwitcher.tsx`, `hooks/useStatusControlMode.ts`, `engine/statusTransitions.ts` (+ teste).
- `i18n/pt-BR.ts` — rótulo "Em atendimento", strings do controle, do interruptor de modo e do parâmetro; aviso de reabertura.

**Server / shared**
- `src/providers/whatsapp/webhook/core.ts` + espelho `supabase/functions/_shared/whatsapp/webhook/core.ts` — transições inbound + reabertura gated; rodar `scripts/sync-whatsapp-shared.ts` + redeploy.
- `src/providers/whatsapp/send/core.ts` + espelho `_shared` — outbound humano → em_andamento.

**Settings / dados**
- `src/shared/types/platform.ts` — `autoReopenResolvedOnInbound`.
- `settings` provider (mock + supabase) + migration espelhada + UI em Configurações.
- Contrato `conversations.update(id, { status })` — já existe.

## 9. Riscos & itens abertos

- **Regressão no webhook:** mudar a lógica de status em inbound pode afetar o comportamento atual do inbox — cobrir com testes do engine e revisão cuidadosa; transições só onde especificado.
- **Sync + redeploy obrigatórios** ao mexer na camada `whatsapp/` (regra do projeto).
- **Leitura do parâmetro na edge:** garantir escopo de store/RLS ao ler `autoReopenResolvedOnInbound`.
- **SDR:** confirmar no plano o ponto exato de supressão do auto-`aguardando` quando `isSdrActive`.
- **3 modos** aumentam a superfície de UI — manter atrás de um único `StatusControl` com prop `mode` para baixo custo de manutenção.

## Decisões registradas (resumo)

1. Mantém os 5 status; `arquivada` como eixo separado (Opção A, sem booleano novo).
2. Visual Direção 1: `STATUS_META` único, tokens semânticos, `em_andamento` = `primary` (dourado), forma+ícone+rótulo.
3. 3 modos de controle (pílula-seletor padrão / menu / segmentado), interruptor no header, preferência por dispositivo.
4. Automação: inbound→aguardando, outbound humano→em_andamento, reabertura de resolvida gated; `aguardando_cliente` e resolver/arquivar manuais; SDR ativo suprime auto-aguardando.
5. Parâmetro `autoReopenResolvedOnInbound` (default ligado) em Configurações da plataforma.
