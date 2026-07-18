# Checkpoint — Reimport DINTEC + Correlação Inbox × DINTEC (2026-07-17, noite)

Retomada do procedimento de importação interrompido por crash em 2026-07-12 — a etapa final (correlação por telefone entre a Inbox de Atendimento e a base DINTEC) ficou pela metade e produziu o rastro corrigido nos checkpoints anteriores do dia (DDI, 9º dígito, `nome_fantasia`, merges).

## 1. Extração fresca do Firebird — reproduzida byte-idêntica

`export-full-fields.sql` via `isql` FB4 (FarolTI, embedded, WIN1252) contra `D:\claude\dintec\TURBO_DIESEL.FDB` (snapshot 25/06, o único existente — dono confirmou que não há export mais novo). Raws **byte-idênticos** aos de 11/07; conversão WIN1252→UTF-8 (sem BOM, LF) + header reproduziu os CSVs **hash-idênticos** aos consumidos pela Fase 3. Pipeline de extração validado ponta a ponta.

## 2. Endurecimento do telefone no pipeline (commit `dd8b2de7`)

Novo engine `dintecDialPhone` (`src/features/dintec-import/engine/phoneKey.ts`, 9 testes): aplica a regra obrigatória de `docs/dev/dintec-providers.md` — `'+' + dígitos` com DDI 55 para número local BR válido; `+` explícito confiado; valor não-normalizável mantido **verbatim** para triagem (nunca `+` para país errado); 9º dígito jamais inserido/removido. Ligado em `run-full-import.ts` e `run-pilot-write.ts` — **era o bug que gravou fones crus em 2026-07-12**.

## 3. Re-import completo — dry-run provou que NADA faltou

`DINTEC_DRY_RUN=yes run-full-import.ts`: 3.166 clientes no export → **3.165 já importados + 1 excluído por design** (CODCLI 2831, vazio absoluto). **0 a criar, 0 a vincular** — o crash não deixou nenhum cliente de fora; nenhuma escrita necessária.

## 4. Correlação Inbox × DINTEC — refeita do zero (`run-inbox-correlation.ts`, novo script versionado)

O dry-run antigo (`docs/db/dintec-phone-match-dryrun.csv`, 10/07) foi computado **antes da limpeza dos seeds demo** e está **OBSOLETO** (nomes faker) — mantido só como histórico dos scripts da Fase 2/3. A correlação nova cruza a chave tolerante `normalizePhoneKey` (DDD + últimos 8 — DDI e 9º dígito irrelevantes) contra **os dois fones do ERP** (celular E fixo — cobertura que o cruzamento por `customers.phone` não tem).

**2.489 alvos** (clientes com conversa sem codcli + contatos `pending_review` + leads de conversa):

| Classe | Total | Ação |
|---|---|---|
| `sem_match` | 2.453 | **Não são clientes DINTEC** — prospects legítimos; nenhuma escrita |
| `merge_candidato` + `ambiguo_merge` | 6 | Mesclados (ambíguos → codcli de maior LTV, spec original) |
| `conflito_dois_com_conversa` | 2 | Mesclados com aprovação (ex.: "Chico Pecas" × "CHICO PECAS LTDA", mesmo nome) |
| `fone_invalido` | 28 | Sem chave comparável (@lid/vazio) — só relatório |

Relatório completo versionado: `docs/db/2026-07-17-inbox-correlation-report.csv`.

## 5. Os 8 merges aplicados (audit `40d23d22`, aprovados pelo dono)

Política idêntica ao batch `0583ef29` (mesma manhã): titular da conversa adota identidade ERP + bloco `dintec_*`, FKs repontadas (**17 veículos, 2 conversas, 2 activities**), `pending_review` removida, registro criado pelo import apagado. Verificado: `CHICO PECAS LTDA` com 2 conversas; total com codcli permanece **3.165** (nenhum vínculo perdido).

## Estado final

- Import de clientes DINTEC: **completo e verificado** (0 pendências de import).
- Correlação Inbox × DINTEC: **completa** — 496 conversas de clientes DINTEC; 2.453 contatos confirmados como não-clientes.
- Por que só 8 matches novos: a limpeza da manhã (DDI + 9º dígito + 38 merges + 51 normalizações) já ERA a maior parte da correlação; os 8 são a cobertura extra do fixo/celular do ERP.

## Pendências

1. Import de **produtos** (parts) — segundo esforço do PR #266, parado desde 13/07, sem execução em prod confirmada. Retomar como próximo bloco.
2. Estrutural: webhook `@lid` adotar número canônico (PR próprio).
