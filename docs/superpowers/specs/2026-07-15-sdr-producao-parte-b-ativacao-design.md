# SDR em Produção — Parte B (Ativação Real) — Design

> **Status:** design aprovado em 2026-07-15. Segue a arquitetura macro já aprovada em `docs/superpowers/plans/2026-07-13-sdr-producao-piloto-recepcao-triagem.md` (Parte A, mergeada — PR #287, v0.144.0 "Usher"). Este documento cobre especificamente a **ativação real** e a decisão nova desta sessão: **concentrar toda a configuração em `/app/configuracoes/ia`**, em vez de criar uma tela dedicada separada. Escrito na worktree `D:\claude\gallo-basediesel\.claude\worktrees\sdr-implementation` (branch `worktree-sdr-implementation`).

**Objetivo:** ligar de fato o agente SDR à inbox de produção — Edge Function que responde, tick de ativação, wiring no webhook para continuidade — mantendo o kill-switch por loja (`sdr_settings.sdr_enabled`) desligado por padrão em todas as lojas ao final desta entrega. Nenhuma loja é ativada como parte deste trabalho; ativar uma loja piloto é uma ação manual e posterior, feita pelo dono na UI.

---

## Contexto — o que a Parte A já deixou pronto

A Parte A (PR #287, mergeada em 2026-07-15) entregou, 100% inerte:

- `supabase/functions/sdr-respond/{guardrails,llmDecision,enforceGuardrails,systemPrompt,enrichment}.ts` — módulos puros, testados, mas **sem `index.ts`** (não existe handler HTTP ainda).
- `sdr_settings` (tabela per-loja: `store_id`, `sdr_enabled`, `backstop_timeout_minutes`, `system_prompt`, `updated_at`, `updated_by`) — aplicada em produção.
- `sdr_pause_on_human_message` (trigger em `messages`, aplicada em produção) — já funcional e "sagrada": qualquer resposta humana desliga `conversations.is_sdr_active` atomicamente, sem depender de nenhum código novo desta Parte B.
- `qualified_handoff` como novo motivo de escalonamento (tipo + label).
- `scripts/sync-sdr-shared.ts` — espelha os engines de `src/features/sdr-escalation/` para `_shared/sdr-escalation/` (runtime Deno).

## Decisão desta sessão: concentrar a configuração em `/app/configuracoes/ia`

O hub de IA (`AiSettingsPage`, 4 abas: Visão geral / Provedores & chaves / Funcionalidades / Playground) **já reserva um slot de roteamento para `"sdr"`** em `ai_settings.routing` — provedor, modelo, temperatura e **prompt de sistema**, editável na aba Funcionalidades desde a v0.100.0 "Synapse". O `copilot-generate/index.ts` (mesma família de Edge Function que o `sdr-respond` vai seguir) já lê esses três campos direto de `ai_settings.routing`, nunca de uma tabela dedicada por feature.

Duas decisões resultam disso:

1. **A coluna `sdr_settings.system_prompt` é eliminada** (nunca foi escrita — zero risco de perda de dado). O prompt de sistema do SDR passa a ter uma única fonte: `ai_settings.routing[feature='sdr'].systemPrompt`, igual a qualquer outra feature de IA.
2. **`sdr_settings` fica só com o que é genuinamente operacional e por-loja** — algo que não existe em `ai_settings` (que é um singleton global): `sdr_enabled` (kill-switch do piloto) e `backstop_timeout_minutes`. Isso ganha uma **5ª aba "SDR"** no mesmo hub, em vez de uma tela `/app/configuracoes/sdr` separada.

---

## Componentes

### 1. Migration de ajuste

`ALTER TABLE public.sdr_settings DROP COLUMN system_prompt;` — nova migration, aplicada em produção junto com o restante desta entrega. Sem impacto de dado (coluna vazia desde a criação).

### 2. Aba "SDR" em `/app/configuracoes/ia`

- Nova `AiSdrTab.tsx` em `src/features/ai-settings/pages/`, registrada como 5ª `TabsTrigger`/`TabsContent` em `AiSettingsPage.tsx`.
- Usa `useCurrentStore()` — mesmo padrão de `/app/configuracoes/rodizio` (`RotationQueueManager.tsx`): a aba mostra e edita a configuração **da loja selecionada no seletor global do TopBar**, sem seletor de loja próprio.
- Campos: `Switch` liga/desliga (label "SDR ativo nesta loja"), input numérico `backstop_timeout_minutes` (min 1, max 60 — sensato para um piloto; sem necessidade de configurar em segundos).
- Aviso de contexto no topo da aba, linkando para a aba Funcionalidades: *"Provedor, modelo e prompt de sistema do SDR são configurados na aba Funcionalidades, junto com as demais funcionalidades de IA."*
- Novo provider `sdrSettings` no Provider Pattern (mock-first + supabase): `get(storeId)` / `update(storeId, patch)`. RLS Owner-only já coberta pela migration da Parte A (`sdr_settings_owner_read`/`sdr_settings_owner_write`).
- Segue `docs/dev/ux-guidelines.md` como qualquer tela nova (mas aqui é uma aba dentro de uma página já conforme às diretrizes — sem header/scroll-progress próprios).

### 3. `sdr-respond/index.ts` — o handler que falta

Nova Edge Function real (a próxima do catálogo, após `ai-generate`/`copilot-generate`). Pública (`verify_jwt off`), protegida por shared secret `x-worker-secret` — **mesmo padrão de `scheduled-send-worker`**, porque quem chama é sempre server-to-server (tick ou webhook), nunca um usuário logado.

Fluxo:

1. Recebe `{ conversationId }`.
2. Lê `sdr_settings` da loja da conversa (via `conversations.store_id` ou equivalente) — se `sdr_enabled=false` ou linha ausente, no-op (200, sem custo).
3. Lê `ai_settings` — `master_enabled`, e `routing` com `feature='sdr'` para `providerId`/`model`/`params`/`systemPrompt`. Mesmo teto de orçamento best-effort (`ai_usage_events`) e mesmo padrão de erro do `copilot-generate`.
4. Monta contexto: sessão SDR (estado, `collected_data`), histórico do cliente reaproveitando `chooseHumanSeller`/`buildContextSummary` (já mirrorados em `_shared/sdr-escalation/`), enriquecimento não-destrutivo (`enrichment.ts`, já pronto da Parte A).
5. Chama o LLM via `_shared/ai/adapters.ts` (mesmos adaptadores do `copilot-generate`/`ai-generate` — Anthropic/OpenAI/OpenRouter).
6. Roda `enforceGuardrails` (já pronto da Parte A) sobre a decisão antes de agir — guardrails são código, não confiança no prompt.
7. Grava a mensagem (`author_type='sdr'`) e despacha via `whatsapp-send` — mesmo pipeline usado por vendedores humanos (status/Realtime/failover continuam funcionando sem duplicar lógica).
8. Se a ação for `handoff`/`close`: atualiza a sessão SDR e, no caso de handoff, cria a `ISdrEscalation` com `reason` apropriado (incluindo o novo `qualified_handoff`), reaproveitando `escalateToHuman` já mirrorado.
9. Grava `ai_usage_events` (`source='routed'`, `feature='sdr'`, `store_id`).

### 4. Ativação — dois mecanismos, sem conflito

**a) `sdr-backstop-tick`** (Edge Function nova, agendada via `pg_cron`+`pg_net` a cada 1 minuto — mesmo padrão de `scheduled-send-tick`→`scheduled-send-worker`, já em produção, incluindo o shared-secret via Vault):

- Varre `conversations` em fila (`isQueuedConversation`: sem `assigned_seller_id`, `is_sdr_active=false`, `status='aguardando'`) das lojas com `sdr_settings.sdr_enabled=true`.
- Calcula o threshold aplicável por loja: `0` (imediato) se **fora do horário comercial** da loja, `sdr_settings.backstop_timeout_minutes` se **dentro**. Reaproveita `isWithinBusinessHours` (`src/features/distribution/engine/utils.ts`) via um novo `scripts/sync-distribution-shared.ts`, no mesmo padrão do `sync-sdr-shared.ts` já existente.
- Para conversas com `now() - queued_at >= threshold`: `UPDATE conversations SET is_sdr_active = true` (isso zera `queued_at` automaticamente via trigger já existente) e dispara `sdr-respond` via `fetch` fire-and-forget, passando `conversationId`.
- Precisa de um índice parcial novo em `conversations` para a varredura não fazer scan completo (não existe hoje) — algo como `(store_id, queued_at) WHERE assigned_seller_id IS NULL AND is_sdr_active = false AND status = 'aguardando'`.

**b) Webhook (`whatsapp-webhook`)** — ganha uma chamada fire-and-forget adicional ao `sdr-respond` **quando a mensagem inbound cai numa conversa com `is_sdr_active=true`** (continuidade de uma conversa que o SDR já está conduzindo). Mesmo padrão de extensão já usado para `onCustomerAutoCreated`/sync de avatar (callback injetado no core `_shared/whatsapp/webhook/core.ts`, runtime-agnostic). **Zero mudança no caminho crítico de ack ao provedor** — é best-effort, depois do processamento normal da mensagem.

**c) Pausa por humano** — já resolvida pela Parte A (trigger em produção). Nada novo aqui.

### 5. `ai_usage_events` e orçamento

Nenhuma mudança de schema — `feature='sdr'` já é um valor válido de `AiFeatureKey`. O teto best-effort já existente (`ai_settings.budget`) passa a também cobrir o tráfego do SDR automaticamente, assim que o primeiro `sdr-respond` rodar.

---

## Rollout

- `sdr_enabled=false` em todas as lojas por padrão (default já vem assim da migration da Parte A) — nada muda para ninguém até o dono ligar manualmente na aba "SDR".
- Nenhuma loja é escolhida como piloto nesta rodada de trabalho — decisão e cronograma ficam com o dono, feitos diretamente na UI quando quiser testar.
- Deploy de `sdr-respond` e `sdr-backstop-tick`, e o `pg_cron`/wiring do webhook, **acontecem nesta entrega** (não ficam pendentes) — mas com todas as lojas desligadas, o comportamento observável em produção não muda em nada até a ativação manual.

## Fora de escopo (mantido da Parte A)

- Geração automática de orçamento (PRD-022).
- Qualquer menção a preço, desconto, disponibilidade de estoque ou prazo de entrega.
- Backstop para conversas já atribuídas a um vendedor (só fila sem dono no v1).
- Disclosure de "assistente virtual" na persona.
- Métricas/dashboard dedicados ao piloto SDR (pode virar uma entrega própria depois, se o piloto validar).

## Riscos e mitigação (herdados da Parte A + novos desta parte)

| Risco | Mitigação |
|---|---|
| LLM alucina preço/peça/promessa | Guardrail de código (`enforceGuardrails`), não de prompt. |
| Latência do LLM atrasa o cliente | Resposta fora do caminho crítico do webhook (fire-and-forget); backstop tem threshold próprio. |
| Custo foge do controle | Reaproveita o teto de orçamento best-effort já existente (`ai_settings.budget`). |
| Tick dispara em duplicidade | Idempotente pela própria condição (`is_sdr_active=false` antes de agir + `UPDATE` como primeira ação). |
| Trigger de pausa e backstop em race condition | Eventos diferentes (`INSERT messages` vs. `queued_at`), sem sobreposição de escrita na mesma linha no mesmo instante. |
| Nova aba "SDR" confundir com a aba "Funcionalidades" (onde vive o modelo/prompt) | Aviso de contexto explícito linkando uma à outra. |
| `sdr_settings.system_prompt` já em produção, sendo removida | Coluna nunca foi escrita — `DROP COLUMN` é seguro, sem migração de dado necessária. |

---

**AILA — Sistemas Inteligentes**
