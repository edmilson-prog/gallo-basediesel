# Checkpoint — Backfill DDI 55 em `customers.phone` (2026-07-17)

## O que foi feito

Operação assistida (dry-run → revisão do dono → aplicar), conforme `docs/superpowers/plans/2026-07-17-customers-phone-country-code-fix.md`. Contexto: o import DINTEC de 2026-07-12 gravou telefones BR locais sem o DDI 55; o envio WAHA discava o país errado (`49988184540@c.us` = Alemanha → HTTP 500). O fix de runtime (PR #321, mergeado + 4 Edge Functions deployadas em 2026-07-17) normaliza no envio; este backfill corrigiu o dado na fonte.

## Números

- **Aplicado (Lote A): 1.387 clientes** — `phone = '+55' || phone_digits`, predicado: `length(phone_digits) IN (10,11)`, sem `+`, sem zero-tronco, DDD BR válido (Anatel), sem colisão na mesma loja. Verificação pós-UPDATE: residual de curtos = exatamente 20 colisões + 4 anomalias (DINTEC) + 19 internacionais com `+` (intocados, correto).
- **Skip (Lote B): 20 pares de colisão** — todos os 20 clientes curtos tinham 0 conversas; o histórico vive no registro `+55` existente. Merge (dados DINTEC → registro longo + apagar o curto) fica como follow-up sem urgência. Lista completa: `docs/db/2026-07-17-phone-ddi-backfill-dryrun.md`.
- **Fora (Lote C): 4 anomalias** (prefixos 57/599/595/59 sem `+` — prováveis internacionais de fronteira/typo do ERP; ids no relatório) **+ 1 lixo** (`+0`).
- **Não aprovado nesta rodada (Lote D): 67 leads** com o mesmo defeito — decisão do dono pendente (relevante para o PR #310, webhook-cria-Lead).

## Auditoria

`audit_logs` id `7ede8cd8-d3e3-47b3-b902-74a4aaa28ee6`, ação `customers_phone_ddi_backfill`, actor = seller do admin (`admin@ailainteligente.com`), payload com contagens/critério/plano.

## Sentinelas verificadas

- RODAWE TRANSPORTES (`1a11db4d`): `49988184540` → `+5549988184540` ✔
- GILBERTO FISCHER (`0e179d08…`): `53999511127` → `+5553999511127` ✔

## Pendências

1. **Smoke do dono/vendedor**: mensagem nova na conversa da RODAWE deve sair `sent`/`delivered` (as 5 failed históricas permanecem — ramo WAHA sem retry vinculado, by design v1).
2. Lote D (67 leads) — aguardando decisão.
3. Follow-ups do plano: merge dos 20 pares do Lote B; passe opcional de 9º dígito via `check-exists` para os 452 números de 10 dígitos; reset de `avatar_synced_at` dos atualizados se o dono quiser re-sincronizar avatares; triagem manual das 4 anomalias.
