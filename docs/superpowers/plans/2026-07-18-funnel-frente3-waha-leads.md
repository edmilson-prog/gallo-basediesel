# Funnel Frente 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `waha-webhook` cria/reusa Lead para número desconhecido (estanca a fonte de customers-fantasma) e o acervo de 5.246 órfãos é migrado para o modelo definitivo (lead vivo / lead dormente / delete / revisão).

**Architecture:** espelho cirúrgico da ordem de resolução `customer → lead existente (reabre) → lead novo` dentro da lógica própria do `waha-webhook` (isolamento preservado); migração de dados assistida via script bun com gates dry-run/confirm (padrão DINTEC); régua de vitalidade de 7 dias como engine puro testado.

**Tech Stack:** Deno Edge Functions (Supabase), bun scripts com service role, SQL migrations, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-funnel-frente3-waha-leads-design.md` (TODAS as decisões de produto fechadas — ler antes de qualquer task).

## Global Constraints

- Decisões do dono (2026-07-18): variante **(b+)**; régua de vitalidade = **7 dias** (`last_message_at >= now()-interval '7 days'`); leads do acervo/import **sem dono** (`seller_id null`); rodízio **só em inbound vivo**; motivo de perda para dormentes = **`'Importado sem interação'`**; `@lid` não resolvido **NÃO** vira lead (mantém âncora mínima atual).
- Lead novo por inbound vivo: `temperature='morno'`, dono via `assign_next_from_rotation`, estágio inicial do pipeline da loja — shape EXATO do adapter em `supabase/functions/whatsapp-webhook/index.ts` L340-373 (helpers L74-100).
- Eco de saída cria/reusa lead **sem** rodízio.
- Reabertura de lead perdido/casamento de lead sem dono em **inbound vivo** ⇒ atribuir dono via rodízio naquele momento; reabertura restaura estágio inicial (padrão `reopenLostLead` v0.150).
- `conversations.lead_id` é **TEXT** — gravar `String(lead.id)`; RPCs fazem join `l.id::text = c.lead_id`.
- CONGELADOS: modelo de acesso 2 portões/RPCs gated-once (única mudança permitida nas RPCs = coalesce de avatar, transcrição verbatim verificada por diff), cache/realtime do Atendimento, fluxos WAHA sensíveis (mídia/ack/@lid/dedup/adoção canônica PR #329), `whatsapp-webhook` v49 (não reverter fluxo lead nem o fix SDR `!resolved.created`), RPC `assign_next_from_rotation`.
- Escritas em prod (migration/deploy/dados) SEMPRE com OK explícito do dono; migração de dados com dry-run nominal antes.
- `bun run build` + `bun run test` verdes por task; tsc por delta (baseline suja).

---

### Task 1: Engine puro — classificação do acervo e régua de vitalidade

**Files:**
- Create: `src/features/leads/engine/orphanClassification.ts`
- Test: `src/features/leads/engine/orphanClassification.test.ts`
- Modify: `src/features/leads/index.ts` (barrel, se exportar engine; senão import relativo no script)

**Interfaces (Produces):**
```ts
export type OrphanClass = "lead_ativo" | "lead_dormente" | "delete" | "review";
export interface IOrphanInput {
  hasConversation: boolean;
  lastMessageAt: string | null; // ISO, max entre as conversas do contato
  hasManualData: boolean;       // cpf/cnpj/email/nota/veículo
  hasCommercialRelation: boolean; // pedido/orçamento/ex-lead (esperado false; guarda)
}
export const IMPORT_LOSS_REASON = "Importado sem interação";
export function classifyOrphan(input: IOrphanInput, nowIso: string): OrphanClass;
```
Regras: `hasCommercialRelation || hasManualData` → `review`; sem conversa → `delete`; conversa com `lastMessageAt >= now-7d` → `lead_ativo`; senão → `lead_dormente`. Threshold 7 dias como constante exportada `VITALITY_WINDOW_DAYS = 7`.

- [ ] Testes primeiro (mínimo 8 casos: cada classe, borda exata de 7d, lastMessageAt null com conversa → dormente, guarda review) → implementar → `bunx vitest run src/features/leads/engine` verde → commit.

### Task 2: Frente A — `waha-webhook` resolve/cria Lead

**Files:**
- Modify: `supabase/functions/waha-webhook/index.ts` (inbound ~L725+, eco ~L528+, helpers junto de `findCustomerByPhone` ~L263)
- Referência a espelhar (NÃO importar): `supabase/functions/whatsapp-webhook/index.ts` L74-100 (`assignNextFromRotation`, `getFirstPipelineStage`, `DEFAULT_FIRST_STAGE`) e L340-373 (`createLead`/`reopenLostLead`), `_shared/whatsapp/webhook/core.ts` L420-440 (`resolveContact` — ordem de resolução).

**Interfaces (Produces, locais à função):**
```ts
async function findLeadByPhone(phoneDigits: string): Promise<{ id: string; sellerId: string | null; lossReason: string | null } | undefined>
// suffix pre-filter em leads.phone_digits (`like %last8`) + phoneDigitsMatchBr, mesmo padrão do findCustomerByPhone
async function resolveLeadForInbound(phoneDigits, fromPhone, contactName): Promise<{ leadId: string }>
// achou lead: se lossReason != null → reabre (loss_reason/loss_notes null + stage inicial) e atribui rodízio;
//   se sellerId null (lead do acervo/import) → atribui rodízio; senão só reusa.
// não achou: createLead espelho v0.150 (morno, rodízio, estágio inicial, origin 'whatsapp', name=pushName??fromPhone)
async function resolveLeadForEcho(...) // idem SEM rodízio (nem na criação nem na reabertura)
```

Mudanças nos caminhos:
1. Inbound: `findCustomerByPhone` (inalterado, com adoção canônica) → miss ⇒ **se `lidUnresolved` → manter caminho atual de customer-âncora**; senão `resolveLeadForInbound` → conversa: busca aberta por `lead_id` (novo lookup, espelho do `findOpenConversationForLead` L374+ do whatsapp-webhook), insert com `lead_id: String(leadId)`, `customer_id: null`, `author_id` = leadId nos inserts de mensagem que hoje usam customerId.
2. Eco: idem com `toLidUnresolved` e `resolveLeadForEcho`.
3. Remover a criação de customer `pending_review` desses 2 caminhos (fica APENAS no ramo `@lid` não resolvido).
4. Log estruturado por criação/reabertura de lead (`"waha webhook: lead created|reopened|matched"`, com leadId e origem inbound/echo).

- [ ] Implementar; conferir que mídia/ack/dedup/processed_events NÃO mudam de lugar; sem testes Deno unitários — o gate é revisão + smoke pós-deploy. Commit.

### Task 3: Migration — `leads.avatar_url` + coalesce de avatar nas RPCs

**Files:**
- Create: `supabase/migrations/<ts>_leads_avatar_and_rpc_avatar_coalesce.sql`

Conteúdo: `alter table public.leads alter column seller_id drop not null;` (**achado da Task 2**: a coluna é NOT NULL em prod e TODO o desenho aprovado — eco sem dono, acervo B1 sem dono, imports sem dono — depende dela nullable; o inbound vivo continua sempre atribuindo via rodízio) + `alter table public.leads add column if not exists avatar_url text;` + `CREATE OR REPLACE` de `conversation_contacts` e `search_conversations` **reproduzidas verbatim das definições vivas** (buscar via `pg_get_functiondef` na hora — elas mudaram em 20260717190620), alterando SOMENTE: `cu.avatar_url as avatar_url` → `coalesce(cu.avatar_url, l.avatar_url) as avatar_url` (conversation_contacts; search_conversations não expõe avatar — verificar e, se não expõe, NÃO tocar nela). Verificação por diff de transcrição (mesmo método de 2026-07-17: normalizar whitespace, reverter a expressão, comparar).

- [ ] Escrever migration + verificador de transcrição no scratchpad; NÃO aplicar (gate do dono no rollout). Commit.

### Task 4: Frente B — script de migração assistida do acervo

**Files:**
- Create: `scripts/funnel/migrate-orphans-to-leads.ts` (padrão DINTEC: `FUNNEL_DRY_RUN=yes` / `FUNNEL_CONFIRM_WRITE=yes`, `.env.local` service role)

Pipeline do script:
1. Fetch paginado (teto 1000, `.range()+.order()`): customers (codcli null), conversations (customer_id, last_message_at, status), refs (orders/quotes/notes/vehicles/leads.converted_to_customer_id, media, traces, sdr_escalations, activity).
2. Classificar cada órfão com `classifyOrphan` (Task 1).
3. **Dry-run**: relatório CSV nominal (`scratchpad/funnel-orphans-report.csv`: id, nome, fone, classe, last_msg, convs, refs) + MD com contagens por classe (esperado ≈ 588/1.864/2.791/4 — números podem derivar com o tráfego; o relatório é a verdade do dia).
4. **Apply B1** (lead_ativo + lead_dormente), em lotes de 100, por contato: insert lead (`origin='import'`, `temperature='frio'`, `seller_id null`, `name` = full_name não-fone-like ?? whatsapp_name ?? null, `phone` do customer, `avatar_url` copiado, dormente ⇒ `loss_reason=IMPORT_LOSS_REASON`, stage inicial da loja); update conversations set `lead_id=String(newId)`, `customer_id=null` where customer_id=órfão; delete customer. Guardas: rowcount de conversas repontadas == esperado; abortar lote se divergir.
5. **Apply B2** (delete): backup JSONL (`scratchpad/funnel-b2-backup.jsonl`) → delete em lotes. Pré-check: zero FKs bloqueantes (conversations/orders/quotes/vehicles/notes) — media/activity são SET NULL.
6. **B3**: só lista os `review` no relatório (zero escrita).
7. `audit_logs`: 1 linha por fase (`funnel_orphans_to_leads_b1`, `funnel_orphans_deleted_b2`) com contagens + amostra; actor `622d1d2c-...` (Edmilson), store matriz.
8. Verificação pós (embutida, roda no fim do apply): Clientes visíveis == 3.165+4(+conversões); zero conversas órfãs (`customer_id null and lead_id null`); contagem leads ativos/dormentes.

- [ ] Escrever script (reusa `parseCsv`? não precisa — tudo via Supabase) + rodar `FUNNEL_DRY_RUN=yes` como teste de fumaça local (read-only). Commit. **Execução real fica para o rollout (gates).**

### Task 5: Produtores 4-6 — imports criam lead / agenda só enriquece

**Files:**
- Modify: `supabase/functions/_shared/import-db.ts` (`createPendingCustomer` L35-53 → `createImportLead`): recebe `lastMessageAt` do chat importado; cria lead com régua b+ (ativo frio sem dono OU dormente `IMPORT_LOSS_REASON`); dedup ANTES: customer tolerante → âncora customer; lead tolerante → reusa.
- Modify: `supabase/functions/whatsapp-import-history/index.ts` e `whatsapp-import-history-go/index.ts` (call sites do adapter + a conversa importada ancora em `lead_id` quando o anchor é lead).
- Modify: `supabase/functions/whatsapp-import-contacts/index.ts` (L97-108): **para de criar registros** — passa a só enriquecer customer/lead existente casado por telefone (nome se fone-like, avatar se null); contatos desconhecidos são pulados e contados no relatório da função.
- Modify: textos dos 3 dialogs de import no frontend que prometem "revisão manual" (localizar por grep `revisão`/`pending` em `src/features/*/components/*Import*`): descrever o comportamento novo (lead/enriquecimento).

- [ ] Implementar + `bun run build` verde. Commit. (Redeploy dessas 3 funções listado no rollout.)

### Task 6: Código morto — `createPendingCustomer` do pipeline compartilhado

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts` (remover `createPendingCustomer` de `IWebhookDb` — confirmar 0 usos restantes com grep) + testes `core.test.ts` se referenciarem.
- Modify: `supabase/functions/whatsapp-webhook/index.ts` (remover a implementação morta L294-316).
- Run: `bun run scripts/sync-whatsapp-shared.ts` (core.ts é espelhado) — ⚠️ implica redeploy de `whatsapp-webhook` no rollout.

- [ ] Grep de call sites == 0 → remover → sync → `bun run test` verde → commit.

### Task 7: Verificação de UI para conversa-lead (checklist, correções pontuais)

**Mudança obrigatória descoberta na Task 2:** `ILead.sellerId` vira `ID | null` (`src/shared/types/lead.ts:27`) + mapeamento do provider supabase de leads + tolerância nos consumidores (`KanbanColumn.tsx:86` `sellersById.get(...)` já tolera undefined — verificar LeadCard/LeadDetailPage/LeadsList renderizando dono vazio com placeholder "Sem dono"). Leads sem dono passarão a existir em massa (eco/acervo/imports).

Sem outros arquivos novos previstos — verificar (as 23 conversas-lead da v0.150 já exercitam):
- [ ] Ficha lateral da conversa-lead (painel reduzido de lead), badge de temperatura na lista, `ConvertLeadModal` acessível.
- [ ] Criar orçamento a partir de conversa-lead exige conversão (fluxo `ConvertLeadModal` → customer).
- [ ] `NewConversationDialog` outbound: NÃO tocar (divergência registrada na spec §4-bis.4 como decisão futura).
- [ ] Se um gap pequeno aparecer (ex.: ficha quebra com lead), corrigir na própria task; gap grande → reportar ao dono antes.

### Task 8: Docs + PR

- [ ] `docs/dev/funnel-frente3.md` (as-built: resolução no waha-webhook, régua b+, migração, o que sobrou da espécie oculta — só âncoras @lid), atualizar `docs/dev/waha-integration.md` (seção do webhook) e o doc do projeto paralelo se citado.
- [ ] PR único: spec + plano + Tasks 1-7. Body com a ordem de rollout e os gates.

## Ordem de execução

1 → 2 → 3 → 4 (dry-run local) → 5 → 6 → 7 → 8. Tasks 1-4 são o núcleo; 5-6 podem ser paralelas após a 2.

## Rollout (gates do dono, na ordem)

1. Merge do PR.
2. `apply_migration` (Task 3) em prod — **OBRIGATORIAMENTE antes do deploy do `waha-webhook`** (gate crítico da revisão T2: sem o `drop not null` de `leads.seller_id`, o eco-cria-lead entra em loop de falha).
3. Deploy: `waha-webhook` (Frente A), `whatsapp-webhook` (Task 6), `whatsapp-import-history`, `whatsapp-import-history-go`, `whatsapp-import-contacts` (Task 5).
4. **Smoke Frente A**: mensagem de número inédito → lead criado com dono via rodízio (log + linha em `leads`); mensagem de lead dormente de teste → reabertura.
5. **Frente B**: `FUNNEL_DRY_RUN=yes` → relatório nominal → OK do dono → `FUNNEL_CONFIRM_WRITE=yes` (B1, depois B2) → verificação pós + checkpoint.
6. Atualizar memória do projeto paralelo (`project_webhook_lead_creation_leads_production`) — a Frente 3 é esta entrega; encerrar a branch `feat/leads-production` (worktree `leads-production`) como superada.
