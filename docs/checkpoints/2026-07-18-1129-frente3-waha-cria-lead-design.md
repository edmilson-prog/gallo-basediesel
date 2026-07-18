# Checkpoint — Frente 3: WAHA cria Lead (smoke falhou, design em andamento) — 2026-07-18 11:29 BRT

> **Branch:** `feat/leads-production` (worktree `.claude/worktrees/leads-production`) · **Último commit:** `193cd4d6` docs(checkpoint): atualiza snapshot — rollout de produção concluído
> **Worktree limpa** (nada por commitar) · **`origin/main` em:** `012a2591` (a plataforma avançou — footer de prod mostra v0.151.0 "Backstop")
> **Sessão anterior:** Claude Fable 5 · **Gerado em:** 2026-07-18T14:29Z
> ⚠️ Checkpoint gerado **sem commit/push/PR por instrução explícita do dono** — este arquivo existe só no disco local até alguém commitá-lo.

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-07-18-1129-frente3-waha-cria-lead-design.md`
na íntegra (worktree `.claude/worktrees/leads-production`) e confirme em uma frase:
1) por que a Frente 2 é no-op em produção, 2) o que a auditoria de 4 agentes encontrou,
3) qual é a próxima ação (retomar o brainstorming da Frente 3 na pergunta 1 — destino
dos imports). Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial (Vite/React 19, Supabase, Provider Pattern). Área de trabalho: camada WhatsApp (`src/providers/whatsapp/` espelhada em `supabase/functions/_shared/whatsapp/` via `scripts/sync-whatsapp-shared.ts`) e as edge functions de webhook. Produção roda 100% do tráfego inbound por **3 contas WAHA** (`waha-webhook`, edge isolada); Evolution desconectada, Meta é âncora morta.

## 🎯 Objetivo da sessão

Fechar a "Frente 2" (contato WhatsApp desconhecido → Lead via rodízio, em vez de `customer pending_review`) e, ao descobrir que ela **não funciona em produção**, iniciar o design da **"Frente 3"** que corrige a lacuna de verdade.

## ✅ Progresso (o que foi feito)

- [x] **Frente 2 entregue formalmente:** PR #310 mergeado (`22c8d62f`), migration `20260713190000_assign_next_from_rotation` aplicada em prod, `whatsapp-webhook` redeployado (v45→v49, `verify_jwt=false` preservado), version bump **v0.150.0 "Funnel"** direto na main (`f9decefd` + tag).
- [x] **Smoke test do dono FALHOU (marco da sessão):** 2 contatos reais vindos de anúncio ("Turbo Diesel RS" — Weverson Barbosa `+556696545968`, Stanrlei Paulon `+553798622979`) viraram `customer pending_review` com `seller_id null`, NÃO Lead. Confirmado via SQL que não são mocks.
- [x] **Causa raiz confirmada:** `waha-webhook` é edge **totalmente isolada** ("FULLY ISOLATED: does not import _shared/whatsapp/webhook/core.ts" no próprio cabeçalho) — nunca usou o `resolveContact` da Frente 2. E **100% do tráfego inbound desde o deploy (116 msgs) é WAHA** → o fix da Frente 2 atende rotas sem tráfego; **zero leads criados**.
- [x] **Auditoria exaustiva (workflow 4 agentes paralelos + queries de banco)** — resultados completos na memória `project_webhook_lead_creation_leads_production` e no output `w2ummp2k3`. Síntese na seção seguinte.
- [x] **Frente 3 — brainstorming iniciado** (skill superpowers:brainstorming, 7 tasks criadas): contexto explorado (task 1 ✅); **1ª pergunta de esclarecimento apresentada mas AINDA NÃO RESPONDIDA** (dono pediu para esclarecer e em seguida pediu este checkpoint).

## 🔎 Achados da auditoria (a verdade completa do problema)

**6 produtores de `pending_review` ainda vivos:**
1. `supabase/functions/waha-webhook/index.ts` inbound (L748-761) — o principal, todo o tráfego real
2. `waha-webhook` eco de saída (L534-545)
3. `waha-webhook` caminho @lid não resolvido (tags +`lid_unresolved`, telefone forjado `+<lidDigits>`)
4. `whatsapp-import-history` (ramos Evolution E WAHA) via `_shared/import-db.ts` `createPendingCustomer` (L35-53)
5. `whatsapp-import-history-go` — mesmo adapter
6. `whatsapp-import-contacts` — produtor próprio (L97-108)

**Lacunas de visibilidade/ação** (agravadas pela remoção do `contact-review` na Frente 2): `HIDDEN_CUSTOMER_TAGS` em `src/features/customers/utils/listFilters.ts` esconde `pending_review` da lista de Clientes incondicionalmente; **zero UI de conversão** (`convertPendingContact`/`markContactNotCustomer`/`restorePendingContact` sem chamadores; RPCs órfãs no banco); Ficha mostra pending como cliente normal (só um dot de 1.5px sem ação); pickers (NewConversationDialog/orçamento) **exibem** pendings sem marcação; os 3 dialogs de import ainda prometem "revisão manual" inexistente.

**Lacuna de identidade (2ª ordem):** `waha-webhook` só consulta `customers` → telefone que já é Lead ganha customer duplicado; e `resolveContact` do core acha customer ANTES de lead → pending criado pelo WAHA nunca vira Lead.

**Raio de impacto:** **433 customers pending_review**, todos criados desde 13/07 (dia em que a Frente 1 zerou o backlog de 4.814), todos sem dono. ~160 = rajada do import VendasExterna (14/07); resto orgânico 20-67/dia, crescendo.

**Código morto:** adapter do `whatsapp-webhook` ainda implementa `createPendingCustomer` (L294-316) e `IWebhookDb` ainda o declara — 0 call sites, ressuscitável por engano.

**Nota (não-bug):** `NewConversationDialog` (outbound número inédito) cria customer B2C visível com dono = vendedor atual — by design, mas diverge do modelo "desconhecido→Lead"; decisão de produto futura.

## ⏳ Pendências (próximos passos, em ordem)

1. **Retomar o brainstorming da Frente 3 — pergunta 1 (PARADO AQUI):** o dono ia esclarecer algo sobre a pergunta antes de responder. Pergunta: *o que os IMPORTS (histórico/agenda) devem criar para contatos desconhecidos?* Opções apresentadas: (a) âncora oculta + triagem mínima na lista de Clientes reusando as RPCs órfãs — **recomendada**; (b) imports também criam Leads (inundam o funil); (c) clientes visíveis sem dono. Critério de feito: resposta registrada.
2. **Perguntas 2-3:** destino dos 433 órfãos (orgânicos → Lead via rodízio? os ~160 do import conforme decisão 1); confirmar abordagem técnica do `waha-webhook` (espelho cirúrgico do `resolveContact` na lógica própria — provável recomendação — vs adotar o core como 5º provider). Também decidir @lid não resolvido (recomendação provável: NÃO criar lead para telefone forjado).
3. **Escrever design doc** `docs/superpowers/specs/2026-07-18-frente3-waha-cria-lead-design.md` (worktree leads-production), self-review, commit — seguir o fluxo do brainstorming (tasks 3-6 da lista da sessão).
4. **Gate: dono revisa o spec**, depois invocar `superpowers:writing-plans` para o plano de implementação.
5. **Escopo esperado da implementação (do achado, não decidido ainda):** (a) waha-webhook cria/reusa Lead nos 2 caminhos (inbound + eco), consultando `leads` além de `customers` e chamando `assign_next_from_rotation`; (b) migração assistida dos 433 (padrão Frente 1: dry-run + revisão); (c) resolver precedência customer×lead; (d) limpar `createPendingCustomer` morto + cópias dos dialogs de import; (e) triagem mínima p/ imports (se decisão 1 = opção a).

## ❓ Decisões pendentes

- **Pergunta 1 (imports)** — em aberto, opções acima; inclinação: (a) âncora oculta + triagem mínima.
- **Pergunta 2 (433 órfãos)** — não formulada ainda ao dono.
- **Pergunta 3 (abordagem técnica waha-webhook)** — inclinação: espelho cirúrgico (o isolamento do waha-webhook é decisão recente e deliberada; adotar o core inteiro é refactor grande).
- **@lid não resolvido** — inclinação: manter pending/skip lead (telefone forjado não deve entrar no funil com rodízio).

## 🚧 Bloqueios / Riscos

- Cada dia sem a Frente 3 = +20-67 contatos órfãos invisíveis (e um import do Comercial Lucas pendente na migração WAHA adicionaria outra rajada).
- A plataforma anda rápido em paralelo (main já está em `012a2591`, v0.151.0 "Backstop" — à frente do nosso último merge): **rebasar/mergear main antes de implementar a Frente 3** e re-verificar números de linha citados na auditoria.
- CI `rls-regression` segue vermelho sistemicamente (statement_timeout pré-existente, não relacionado).

## ⚠️ Avisos do usuário (regras desta sessão)

- **Este checkpoint: SEM commit/push/merge/PR** (instrução explícita no comando).
- Regras permanentes: **nunca mergear/aplicar migration/deployar edge em prod sem OK expresso do dono** (memória `feedback_never_merge_pr_only`); toda integração via PR.
- O dono testa a UI manualmente — não abrir browser para validar.
- Trabalhar só dentro do projeto; docs em `/docs`.

## 🛡️ Não regredir

- `whatsapp-webhook` v49 (fluxo Lead para meta/evolution/evolution-go/openwa) — funciona, só não recebe tráfego; não reverter.
- Correção do SDR no merge (`!resolved.created` em `core.ts`) — não reverter.
- Fluxos WAHA existentes (mídia, ack, @lid resolution, dedup por eventKey) — o waha-webhook é sensível e recém-estabilizado; mudanças na resolução de contato não podem quebrar recepção/eco/mídia.
- `assign_next_from_rotation` aplicada em prod — a fila real (1 fila, 4 participantes) é usada por ela; não dropar.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `supabase/functions/waha-webhook/index.ts` — alvo principal da Frente 3 (inbound L~725-807, eco L~528-594, @lid L~698-713)
- `supabase/functions/whatsapp-webhook/index.ts` — referência do fluxo correto (adapter `createLead` L349-373, RPC L77-81)
- `supabase/functions/_shared/whatsapp/webhook/core.ts` — `resolveContact` (L420-440), modelo a espelhar
- `supabase/functions/_shared/import-db.ts` — produtor dos imports (L35-53)
- `src/features/customers/utils/listFilters.ts` — `HIDDEN_CUSTOMER_TAGS` (L28, L94)
- `docs/checkpoints/2026-07-17-1648-leads-production-merge-main-rollout.md` — checkpoint anterior (Frente 2 completa)
- `docs/superpowers/specs/2026-07-13-webhook-cria-lead-design.md` — design da Frente 2 (base conceitual)

## 🧠 Memórias relacionadas

- `project_webhook_lead_creation_leads_production` — memória mestra (atualizada com a auditoria completa)
- `project_sdr_production_foundation`, `feedback_never_merge_pr_only`, `project_statement_timeout_double_rls_incident`, `project_dintec_customer_import` (Frente 1), `project_waha_whatsapp_integration`, `project_whatsapp_waha_lid_resolution`

## 📚 Referências

- PR #310 (mergeado): https://github.com/edmilson-prog/gallo-basediesel/pull/310
- Output da auditoria (4 agentes): `C:\Users\EDMILS~1\AppData\Local\Temp\claude\D--claude-gallo-basediesel\149d5f84-e828-4ef3-93a4-9ad0a40507b7\tasks\w2ummp2k3.output` (temporário — a síntese durável está na memória e neste checkpoint)
- Tag/release: v0.150.0 "Funnel"
