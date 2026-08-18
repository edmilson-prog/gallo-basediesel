# Checkpoint — Funnel Frente 3: rollout completo em produção (2026-07-18, noite)

Execução integral do rollout do PR #331 (spec `2026-07-18-funnel-frente3-waha-leads-design.md`), todos os gates aprovados pelo dono na sequência.

## Sequência executada

1. **PR #331 mergeado** (20:26 UTC, merge `9c741130`) — 15 commits, 7 tasks com revisão por task + revisão final de branch (CONFIRMED).
2. **Migration aplicada** (registrada no remoto como `20260718202917`; arquivo do repo renomeado neste checkpoint para casar): `leads.seller_id` nullable ✓, `leads.avatar_url` ✓, coalesce de avatar na `conversation_contacts` ✓ — verificado em prod.
3. **5 Edge Functions deployadas**: `waha-webhook`, `whatsapp-webhook`, `whatsapp-import-history`, `whatsapp-import-history-go`, `whatsapp-import-contacts`.
4. **Smoke com tráfego real de anúncio** (24 min pós-deploy): "Wilson Dutra" (+556199494585, "vim do anúncio") → lead `b529104b` criado com nome do pushName, morno, estágio Novo, **dono via rodízio (Lucas Costa)**, conversa ancorada em `lead_id` no pool. Zero customer-fantasma.
5. **Frente B aplicada** (`FUNNEL_CONFIRM_WRITE`, circuit-breaker `FUNNEL_EXPECT=592,1866,2793,3` OK):

| Métrica | Valor |
|---|---|
| Leads ativos criados (acervo vivo ≤7d) | 589 |
| Leads dormentes ("Importado sem interação") | 1.864 |
| Leads reusados (colisão de telefone — esperado ~5) | 5 |
| Conversas repontadas customer→lead | 2.693 |
| Customers convertidos apagados (B1) | 2.458 |
| Customers ruído de agenda apagados (B2) | 2.793 |
| Revisão manual (intocados) | 3 (AILA, Ivan Burille, antigo "+0") |

## Estado final verificado (SQL)

- `customers` = **3.168** (3.165 DINTEC + 3 review) — a tela de Clientes agora é 100% relação real.
- Conversas órfãs (`customer_id` e `lead_id` nulos) = **0**.
- `leads` = 2.534 (589 import-ativos + 1.864 import-dormentes + orgânicos, incl. o smoke).
- Conversas ancoradas em lead = 2.722.
- Auditoria: 2 lotes em `audit_logs` (`funnel_orphans_to_leads_b1`, `funnel_orphans_deleted_b2`).

## Backups / rollback (locais, PII fora do git)

`scratchpad/funnel-b1-backup.jsonl` (2.458 customers convertidos) e `funnel-b2-backup.jsonl` (2.793 apagados) no worktree `funnel-frente3`; leads da migração identificáveis por `origin='import'` + timestamp do audit.

## Follow-ups registrados (docs/dev/funnel-frente3.md §7-8)

1. `whatsapp-avatar-sync` não carimba leads (avatar de lead novo só via cópia da migração).
2. Ficha lateral de conversa-lead não existe (gap pré-v0.150; decisão de produto).
3. RLS `leads_select` oculta lead sem dono de não-staff ("Ver lead" falha para atendente).
4. Clamp de 1000 nas agregações de analytics (funil/forecast) — pós-migração há 2.5k+ leads.
5. Nome de lead no import WAHA depende do `/chats`; alternativa bounded documentada.
6. Version bump (MINOR) pendente de decisão do dono.

## Incidente de processo (registrado para reuso)

Watcher de processo desanexado no Windows: `kill -0` do MSYS **não enxerga** processos lançados pelo PowerShell (namespaces distintos) — reportou "terminou" com o processo vivo. Usar `tasklist //FI "PID eq N"`.
