# Funnel Frente 3 — WAHA cria Lead + migração do acervo de contatos-fantasma

> **Spec:** `docs/superpowers/specs/2026-07-18-funnel-frente3-waha-leads-design.md` (todas as decisões de produto, incluindo a variante **(b+)** escolhida pelo dono).
> **Plano:** `docs/superpowers/plans/2026-07-18-funnel-frente3-waha-leads.md` (Tasks 1-8).
> **Status desta entrega:** código (Frente A + Frente C) e script de migração (Frente B) implementados, revisados e com `bun run build`/`bun run test` verdes. **Nada foi aplicado em produção ainda** — migration, deploys de Edge Function e a execução real da migração de dados ficam atrás dos gates do dono descritos em "Rollout" abaixo.

## 1. Contexto — por que isso existe

A v0.150 ("Funnel") fixou a regra de produto: **quem só tem uma conversa na Inbox não é cliente — é Lead. Cliente é quem tem relação** (vínculo `dintec_codcli`, venda/orçamento na plataforma, ou cadastro manual deliberado). Essa regra já valia para o webhook compartilhado (Meta/Evolution), mas **100% do tráfego real da plataforma passa pelo `waha-webhook`**, que é isolado por design e continuava criando `customers` fantasma com `tags:["pending_review"]` a cada número desconhecido. Uma auditoria de 2026-07-18 encontrou **6 produtores vivos** dessa espécie (inbound e eco do `waha-webhook`, os 3 imports, e o caminho `@lid` não resolvido) e um acervo de **5.246 contatos-fantasma** acumulados (nenhum deles é cliente ERP — cruzamento por telefone tolerante contra os 3.166 clientes DINTEC deu zero matches).

A Funnel Frente 3 fecha essa fonte na origem (Frente A), migra o acervo existente para o modelo definitivo (Frente B) e alinha os demais produtores — imports de histórico e de agenda (Frente C).

## 2. O modelo (b+) — decisão do dono, 2026-07-18

- **Régua de vitalidade = 7 dias** (`last_message_at >= now() - interval '7 days'`), engine puro testado em `src/features/leads/engine/orphanClassification.ts` (`VITALITY_WINDOW_DAYS = 7`).
- **Leads criados sem interação viva (acervo, imports) nascem sem dono** (`seller_id = null`) — "rodízio só com interesse vivo": não desperdiça a fila de rotação (`assign_next_from_rotation`) com histórico morto.
- **Reabertura automática com rodízio no 1º inbound vivo**: quando um lead (do acervo, de import, ou perdido) recebe uma mensagem de entrada real, o `waha-webhook`:
  - se o lead estava perdido (`loss_reason != null`) → reabre (limpa `loss_reason`/`loss_notes`, volta ao estágio inicial do pipeline);
  - se o lead estava ativo mas sem dono (`seller_id = null`) → atribui via `assign_next_from_rotation` nesse momento;
  - se já tinha dono → só reusa.
  - **Eco de saída** (`fromMe: true`) faz o mesmo casamento/criação de lead, mas **nunca** atribui rodízio — a plataforma não sabe quem respondeu do celular, então o dono só é resolvido quando o próprio contato responder.
- **`@lid` não resolvido nunca vira lead** — um identificador de privacidade sem telefone real por trás não pode entrar no funil nem no rodízio; mantém a âncora mínima atual (`customers` com tag `lid_unresolved`, telefone placeholder), corrigível depois via `backfillLids` (`docs/dev/waha-integration.md` §4).
- **Um contato de agenda sem nenhuma interação não é nem lead** — é ruído; se a pessoa chamar um dia, o webhook cria o lead na hora.

## 3. Frente A — `waha-webhook` resolve/cria Lead

Implementado em `supabase/functions/waha-webhook/index.ts` (espelho cirúrgico local — **não importa** `src/providers/whatsapp/webhook/core.ts`; o isolamento da edge WAHA é decisão deliberada e anterior a esta frente).

**Ordem de resolução** (inbound e eco, idêntica até o ramo `@lid`):

1. `findCustomerByPhone` (tolerante, com adoção canônica do PR #329) → achou → comportamento **inalterado** (conversa ancora em `customer_id`).
2. Miss → se `lidUnresolved`/`toLidUnresolved` → **mantém o caminho customer-âncora `pending_review` byte-for-byte** (ver §2 acima).
3. Senão → `findLeadByPhone` (mesmo padrão tolerante — sufixo de 8 dígitos + `phoneDigitsMatchBr` — sobre `leads.phone_digits`) → achou → reusa/reabre (ver regras do §2); não achou → `insertLead` (novo lead, `temperature='morno'` no inbound / `'frio'` no eco, `origin='whatsapp'`, estágio inicial do pipeline, `name` = `getWahaContactName` best-effort ?? o telefone).

A conversa insere com `customer_id`/`lead_id` mutuamente exclusivos (`lead_id: String(leadId)` — a coluna é `text`); a busca de conversa aberta por lead espelha a busca por customer (inbound: reusa/reabre/cria com `order("last_message_at")`; eco: OPEN-ONLY). Nos inserts de mensagem inbound, `author_id` passa a ser o id do anchor resolvido (customer OU lead); `author_type` continua `"customer"` em ambos os casos. Mídia, ack, dedup por `processed_events`, HMAC gate e a resolução de `@lid` (`docs/dev/waha-integration.md` §4) **não mudam**.

**Divergência registrada (decisão do dono):** a conversa de um lead novo/casado fica no **pool** (`assigned_seller_id: null`) mesmo quando o lead já tem dono — a Carteira (dono do lead) e o Atendimento (dono da conversa) podem divergir nesse caso, espelhando o comportamento local pré-existente do `waha-webhook` em vez do `whatsapp-webhook`/core compartilhado (que atribui os dois juntos). Ver `.superpowers/sdd/task-2-report.md` CONCERN 2 se o dono quiser revisitar.

## 4. Frente B — migração assistida do acervo

**Script:** `scripts/funnel/migrate-orphans-to-leads.ts` (1 arquivo, padrão idêntico aos scripts DINTEC — dry-run por padrão, escrita real exige confirmação explícita).

### Gates de execução

| Env var | Efeito |
|---|---|
| `FUNNEL_DRY_RUN=yes` | Modo padrão de investigação — **read-only comprovado** (early return antes de qualquer escrita; `assertCanWrite()` lança se algum código de escrita for alcançado por engano). Gera o relatório CSV nominal (`scratchpad/funnel-orphans-report.csv`) e o resumo MD (contagens por classe + alertas). |
| `FUNNEL_CONFIRM_WRITE=yes` | Habilita a escrita real (B1 depois B2). **Exige** `FUNNEL_EXPECT` também setado — sem ela o script lança pedindo a variável. |
| `FUNNEL_EXPECT="ativo,dormente,delete,review"` | Circuit-breaker: o script re-classifica o acervo do zero no momento do apply e compara contra esses números; se qualquer classe (ou o total) divergir **mais de 10%** do dry-run revisado, aborta pedindo para rodar um novo dry-run. Existe porque o acervo tem tráfego real entre o dry-run e o apply (conversas novas chegando) — o valor **precisa vir do dry-run do próprio dia do apply**, não de um número fixo neste doc. |

Pré-flight adicional: o apply confere `select avatar_url from leads limit 1` antes de escrever — se a coluna não existir, aborta com a mensagem explícita "aplicar a migration 20260718150000 antes" (ver §6, gate crítico de ordem).

### O que o script faz, por classe (`classifyOrphan`, engine da Task 1)

- **`lead_ativo`** (~592 na medição de 2026-07-18) e **`lead_dormente`** (~1.865) → **B1**: cria um lead por contato (`origin='import'`, `temperature='frio'`, `seller_id=null`, `avatar_url` copiado do customer; dormente ganha `loss_reason='Importado sem interação'` e nasce já fora do kanban ativo — reaberto automaticamente pela Frente A no primeiro inbound vivo, com dono via rodízio nesse momento). `name` = `full_name` não-fone-like ?? `whatsapp_name` ?? **o telefone** (nunca `null` — `leads.name` é `NOT NULL`; um contato sem nenhum telefone utilizável é reclassificado para `review` em vez de virar lead sem match possível no webhook). Repontam as `conversations` do contato (`lead_id = String(newId)`, `customer_id = null`, com asserção de rowcount == esperado, aborta o lote se divergir) e o `customer` é apagado. Lotes de 100, log por lote.
  - **Idempotência**: antes de cada insert, o script procura um lead `origin='import'` já existente com o mesmo `phone_digits` na store — se achar, reusa o id em vez de criar um segundo lead (contador `reused_leads` no audit/summary). Numa colisão de telefone real (dois "órfãos" que na verdade são o mesmo contato), **`reused_leads` ~5 num run limpo é esperado**, não um sinal de bug.
- **`delete`** (~2.793) → **B2**: backup JSONL local (`scratchpad/funnel-b2-backup.jsonl`, linha por customer completo via `select *`) → delete em lotes de 100, com pré-check de que nenhum tem FK bloqueante (ver abaixo).
- **`review`** (~3-4) → **B3**: só relatado (contatos com dado manual — cpf/cnpj/email/nota/veículo — ou sem telefone utilizável); **zero escrita automática**, lista nominal para o dono decidir caso a caso.

Backup simétrico de B1 também é gravado (`scratchpad/funnel-b1-backup.jsonl`, `select *` completo do customer) **antes** da fase de escrita — rollback sem depender de PITR. FKs verificadas como bloqueantes (`NO ACTION`, abortam o lote se um órfão as carregar): `distribution_traces.customer_id`, `sdr_escalations.customer_id`, `recommendations.subject_id` (medidas em 0 no dry-run de 2026-07-18 — o pré-check existe para o caso de aparecer tráfego novo até o apply). `media_assets`/`conversation_activity` são `SET NULL` — seguros, não bloqueiam.

`audit_logs` recebe 1 linha por fase (`funnel_orphans_to_leads_b1`, `funnel_orphans_deleted_b2`) com contagens e amostra, ator = Edmilson, store matriz.

### Números do dry-run de referência (2026-07-18, pós todos os fixes)

`lead_ativo=592 / lead_dormente=1865 / delete=2793 / review=3` (total 5253). **Estes números são o baseline de auditoria desta doc, não o `FUNNEL_EXPECT` a usar no rollout** — o dono deve rodar um dry-run novo no dia do apply e usar esses números frescos (o acervo recebe tráfego real continuamente).

### Retomada pós-crash

Se o apply for interrompido no meio (crash, timeout, Ctrl-C), a retomada correta é: **rodar um novo dry-run** (não simplesmente re-rodar o apply com o `FUNNEL_EXPECT` antigo) e atualizar a variável com os números frescos antes de confirmar a escrita de novo — o circuit-breaker existe exatamente para pegar essa divergência. Os lotes já aplicados (B1/B2) não se repetem por engano graças à idempotência por `phone_digits` (B1) e ao fato de B2 já ter apagado as linhas (um segundo apply simplesmente não as encontra mais).

## 5. Frente C — imports (produtores 4-6) e agenda

Os 3 produtores de import pararam de criar `customers pending_review`:

- **Histórico** (`whatsapp-import-history` — Evolution REST e Go HistorySync — e o branch WAHA em `whatsapp-import-history`) ancora contato desconhecido em **lead** (mesma régua de vitalidade de 7 dias do acervo, `seller_id=null`, `origin='import'`). O adapter Deno (`supabase/functions/_shared/import-db.ts`) reimplementa a régua **inline** (Deno não importa o engine de `src/`), com comentário de proveniência explícito.
- **Agenda** (`whatsapp-import-contacts`) virou **enrich-only**: nunca cria registro novo — só substitui um nome placeholder (vazio ou "fone-like", `isPlaceholderName`) num `customer`/`lead` já existente casado por telefone tolerante. Números sem match são pulados e contados no relatório (`skippedUnknown`). Um candidato que também é placeholder (ex.: trocar um telefone formatado por outro) nunca substitui o nome existente.
- **Nome importado do histórico** (fix de round 2): quando a fonte carrega um `pushName`/`contact_name` (Go HistorySync sempre; Evolution REST quando o build da instância manda; **WAHA não** — `GET /chats` só devolve nome quando o próprio servidor decide incluir o campo, sem chamada dedicada por custo de orçamento de tempo do batch), ele é usado **apenas** na criação de um lead novo — nunca renomeia um lead/customer já existente por reuso.

**Nota operacional (runbook):** há uma importação de histórico pendente conhecida — o "Comercial Lucas" (migração WAHA). Se o `/chats` desse servidor **não** trouxer nomes (campo `name` ausente na resposta), os leads criados por essa importação nascem com `name` = telefone. Rodar **depois** uma passada de `whatsapp-import-contacts` (enrich) sobre a agenda desse número cura os nomes — o enrich casa por telefone e substitui o placeholder assim que a agenda estiver disponível. Também: o nome se autocura no primeiro inbound vivo desses contatos (o `waha-webhook` grava o `pushName` via `applyInboundContactName`).

## 6. Ordem de rollout (gates do dono)

1. Merge do PR desta entrega (Tasks 1-8).
2. **`apply_migration`** de `supabase/migrations/20260718150000_funnel_leads_ownerless_avatar.sql` em produção — **antes** de qualquer deploy do `waha-webhook`. Gate crítico: sem o `alter column seller_id drop not null`, o caminho de eco-cria-lead (que grava `seller_id: null`) viola a constraint e falha em loop (a mensagem cai em erro logado, não marca `processed_events`, e falha de novo no próximo retry).
3. Deploy das Edge Functions tocadas: `waha-webhook` (Frente A), `whatsapp-webhook` (Task 6 — remoção do código morto `createPendingCustomer`), `whatsapp-import-history`, `whatsapp-import-history-go`, `whatsapp-import-contacts` (Frente C).
4. **Smoke da Frente A**: mensagem de um número inédito → lead criado com dono via rodízio (log estruturado `"waha webhook: lead created"` + linha nova em `leads`); mensagem de um lead dormente de teste → reabertura (log `"lead reopened"`).
5. **Frente B**: `FUNNEL_DRY_RUN=yes` no dia → relatório nominal revisado pelo dono → `FUNNEL_CONFIRM_WRITE=yes` com `FUNNEL_EXPECT` dos números frescos (B1, depois B2) → verificação pós-execução embutida no próprio script (contagem de clientes visíveis, zero conversas órfãs, leads ativos vs. dormentes) + checkpoint da sessão.
6. Atualizar a memória do projeto paralelo `project_webhook_lead_creation_leads_production` — esta entrega **é** a Frente 3 dele; encerrar a branch `feat/leads-production` (worktree `leads-production`) como superada por esta.

### Rollback

- **Frente A (código)**: reverter o deploy da Edge Function para a versão anterior — sem efeito em dados já escritos (leads criados continuam existindo; conversas continuam ancoradas neles). Não há "desfazer" automático de leads já criados por tráfego real — não deveria ser necessário, já que o comportamento não regride dado nenhum.
- **Frente B (dados)**: os backups JSONL (`scratchpad/funnel-b1-backup.jsonl`, linha por customer antes da migração para lead; `scratchpad/funnel-b2-backup.jsonl`, linha por customer antes do delete) permitem reconstruir manualmente um customer apagado por engano — não existe script de undo automatizado; é restauração assistida (reinserir o customer do JSONL, repontar as conversas do lead correspondente de volta para `customer_id`, apagar o lead criado). Último recurso: PITR (habilitado em produção desde o go-live).

## 7. O que sobrou da "espécie oculta"

Depois de Frente A + B + C, o único produtor remanescente de uma âncora que **não** é nem cliente real nem lead é o caminho **`@lid` não resolvido** (§2 e §4 acima): um `customer` com telefone placeholder e tag `lid_unresolved`. É uma decisão deliberada, não um resíduo esquecido — sem telefone real por trás não há como casar contra `leads.phone_digits`, e forçar uma entrada no funil fabricaria um lead com telefone forjado. Esses registros são corrigidos individualmente pela ação `backfillLids` (`docs/dev/waha-integration.md` §4, "Backfill de `@lid`") quando o número real se resolve — nesse momento eles ainda **não** viram lead automaticamente (o backfill só corrige o telefone/nome do customer existente); a promoção para lead segue as regras normais desta doc a partir da próxima interação.

## 8. Impacto no frontend (Task 7)

`ILead.sellerId` deixou de ser `ID` e virou **`ID | null`** (`src/shared/types/lead.ts`) — reflete que leads criados pelo acervo, por imports, ou por eco de saída nascem sem dono. Consumidores ajustados (sem mudança de comportamento visível, só tolerância de tipo):

- `src/providers/data/impl/supabase/leads.ts` — `LeadRow.seller_id` passa a `string | null` (a coluna já é nullable em produção após a migration do §6).
- `src/features/leads/components/kanban/KanbanColumn.tsx`, `LeadsList.tsx`, `hooks/useLeadsList.ts`, `pages/LeadDetailPage.tsx` — todos já seguiam o padrão estabelecido para `ICustomer.sellerId` (nullable desde `20260628120000_customers_seller_id_nullable.sql`): quando não há dono, a UI mostra **"—"** em vez do nome do vendedor (`LeadsList.tsx`/`LeadDataCard.tsx` já faziam `seller?.fullName ?? "—"`; nenhuma tela precisou de um placeholder novo — o padrão já existia).
- `src/mocks/generators/bootstrap.ts` — leads mock continuam sempre com dono (o acervo/eco/import só existe em dados reais); o ajuste é só de tipo (`?? undefined`).
- `src/providers/whatsapp/webhook/core.test.ts`/`core.ts` — já usavam `sellerId: string | null` localmente desde a Task 2 (interface própria do webhook, não a `ILead` do app); não precisaram de mudança.

### Verificação da UI de conversa-lead (checklist da Task 7)

- **Badge de temperatura** (lista e header da conversa) — ✅ já genérico: vem de `IConversationContact.temperature`, resolvido pela RPC `conversation_contacts` independente da âncora ser customer ou lead.
- **Avatar da conversa-lead** — ✅ já genérico: a RPC (migration do §6) faz `coalesce(cu.avatar_url, l.avatar_url)`; o frontend (`avatarUrl: r.avatar_url ?? undefined` em `impl/supabase/conversations.ts`) já consumia um único campo sem saber a origem — zero mudança de frontend foi necessária para o avatar de lead aparecer.
- **`ConvertLeadModal` acessível a partir da conversa** — ✅, indiretamente: o menu "⋮" da conversa oferece "Ver lead" (`getLeadMenuAction`) quando `conversation.leadId` está setado, que navega para `/app/leads/$id`; a página de detalhe do lead tem o botão "Marcar como convertido" que abre o `ConvertLeadModal`. Não há atalho de conversão inline dentro da conversa — é o mesmo fluxo que já existia antes desta frente.
- **Orçamento a partir de conversa-lead exige conversão** — ✅ por construção: não existe nenhum atalho de "criar orçamento" dentro da tela de conversa (nem manual, nem do SDR) que não dependa de um `ICustomer` resolvido; o próprio SDR (`useSdrResponder.ts`) só persiste um orçamento gerado quando `customer` está presente, o que só é verdade depois da conversão.
- **`NewConversationDialog`**: não tocado (decisão registrada na spec §4-bis.4 como divergência futura, fora do escopo desta entrega).
- **Gap encontrado, não corrigido nesta task**: **não existe um painel de ficha lateral para conversas-lead.** `CustomerProfileFiche` (o painel "Ficha" da conversa) exige `customerId: ID` e só é montado quando `conversation.customerId` está presente (`ConversationPage.tsx`); numa conversa ancorada em lead, o botão "Ficha" do header continua visível e clicável, mas não abre nada — nenhum erro, só nenhuma reação visível. Isso já era verdade antes da Frente 3 (as 23 conversas-lead da v0.150 já exercitavam esse estado), mas a escala muda: eco/acervo/imports vão gerar muitas mais conversas-lead. Construir um "painel reduzido de lead" é trabalho de tela nova — fora do escopo declarado desta task ("sem outros arquivos novos previstos") e é uma decisão de produto (o que mostrar: estágio do pipeline, próxima ação, valor estimado, botão de conversão inline?) que cabe ao dono, não a uma correção pontual.

## 9. `leads.conversations` (coluna legada)

A coluna `leads.conversations` (array) é da era mock e **não é mantida em sincronia** pelo modelo atual — o vínculo real é `conversations.lead_id`. Não usar essa coluna para nada nesta frente nem em trabalho futuro sem primeiro popular/migrar seu conteúdo.
