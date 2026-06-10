# Janela de 24h — session window Meta (PRD-117)

> A Meta Cloud API permite texto livre por **24h após a última mensagem do
> cliente**; passado isso, apenas templates HSM aprovados (PRD-116). A regra é
> imposta pela Meta — não existe bypass. Referência:
> https://developers.facebook.com/docs/whatsapp/pricing#conversations
> Evolution API **não tem janela** (sessão de aparelho) — a UI nem exibe o banner.

## Peças

| Peça | Onde |
| --- | --- |
| Engine puro | `src/features/conversations/engine/sessionWindow.ts` — `computeSessionWindow({ provider, lastInboundAt, nowMs })`; `nowMs` injetado (8 testes de boundary: 24h exatas, 23h59, sem inbound, Evolution) |
| RPC `public.last_inbound_at(uuid)` | migration `20260610143952` — `max(sent_at)` das mensagens `direction='in'`; **SECURITY INVOKER** (RLS aplica: conversa invisível ⇒ `null` ⇒ janela fechada); EXECUTE só `authenticated` |
| Provider | `IMessagesProvider.getLastInboundAt(conversationId)` — supabase via RPC; mock deriva da lista |
| Hook reativo | `useMetaWindow(conversation, account)` — tick de 30s + stream de mensagens em memória + seed da RPC (só fonte `supabase`) |
| Banner | `MetaWindowIndicator` — verde (>12h) / âmbar (≤12h) / vermelho (≤1h) / fechado, com CTA **Selecionar template** quando fechada |
| Input | `MessageInput` — textarea/Enviar/agendar desabilitados fora da janela, tooltip explica, bounce abre o `TemplatePicker` |

## Como o estado é calculado

```
lastInboundAt (fonte supabase) = max( RPC last_inbound_at , última inbound em memória )
lastInboundAt (fonte mock)     = última inbound em memória ?? conversation.lastMessageAt  (Fase 1 intacta)

msRemaining = max(0, lastInboundAt + 24h − now)
estado: open-fresh (>12h) · open-soon (≤12h) · open-closing (≤1h) · closed
```

- **Sem inbound nenhum (supabase):** a janela **nunca abriu** — contato
  outbound-first exige template (é o comportamento real da Meta).
- **Tick:** 30s via `setInterval`; precisão de minuto (sem segundos — ruído).
- **Realtime:** inbound nova chega pelo stream de mensagens (PRD-105/114) →
  o hook recomputa na hora e o banner reabre sem reload.
- A RPC é **best-effort**: se falhar, o stream em memória continua mandando.

## Camadas de defesa (UI ⇒ servidor ⇒ Meta)

1. UI desabilita texto livre e oferece o picker (este PRD).
2. `whatsapp-send` pre-checa `is_within_24h_window` e devolve 422
   `TEMPLATE_REQUIRED` (PRD-115) — vale mesmo se a UI estiver defasada.
3. A própria Meta rejeita com erro 131047 (mapeado em PRD-112).

## Desvios do PRD (registrados)

1. Schema `public` (não `crm`); coluna `sent_at` (não `created_at`); direction `'in'` (não `'inbound'`).
2. Helper/UX reaproveitam a Fase 1: `useMetaWindow` + `MetaWindowIndicator` já existiam — o PRD-117 extraiu o engine puro, trocou o fallback impreciso (`lastMessageAt` contava outbound) pela RPC na fonte `supabase` e adicionou o CTA. Nomes da casa mantidos (não `SessionBanner`/`session.ts`).
3. Thresholds da casa preservados: âmbar a ≤12h e vermelho a ≤1h (PRD sugeria âmbar ≤2h) — já eram o padrão visual da Fase 1.
4. Audit de transições window_opened/closed: **não implementado** (o próprio PRD marca como bonus opcional de Onda 8/9).
5. Fonte `mock` byte-idêntica à Fase 1 (fallback `lastMessageAt` mantido para a demo).
