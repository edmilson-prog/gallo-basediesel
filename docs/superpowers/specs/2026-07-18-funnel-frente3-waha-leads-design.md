# Funnel Frente 3 — WAHA cria Lead + migração do acervo de contatos-fantasma

> **Status:** APROVADA pelo dono (2026-07-18) — todas as decisões fechadas, incluindo a pergunta 1: variante **(b+)** com régua de **7 dias** e leads do acervo **sem dono**.
> **Consolidação:** esta spec ABSORVE e SUPERSEDE o design da Frente 3 iniciado na sessão `leads-production` (checkpoint `docs/checkpoints/2026-07-18-1129-frente3-waha-cria-lead-design.md`, worktree `leads-production` — brainstorming parado na pergunta 1). Incorpora a auditoria de 4 agentes daquela sessão (6 produtores de `pending_review`, lacuna de identidade, vácuo de UI de conversão, código morto).
> **Contexto de produto:** conclusão da direção da v0.150 "Funnel" — *"quem fica só na conversa da Inbox não é cliente; é lead. Cliente é quem tem relação (ERP ou venda/orçamento)"* (dono, 2026-07-18).

## 1. Problema

A tela de Clientes exibe 7.966 registros, mas só 3.165 são clientes de verdade (DINTEC). Os outros **4.801 visíveis + 445 ocultos = 5.246 são contatos-fantasma do WhatsApp** criados como `customers` provisórios:

- A v0.150 mudou o webhook **compartilhado** (Meta/Evolution) para criar **Lead** em número desconhecido — mas **100% do tráfego real passa pelo `waha-webhook`** (isolado por design), que continua criando `customers` B2C com `tags:["pending_review"]` (fonte viva) ou, no caso do lote de 02/07 (importação de agenda/histórico da migração WAHA), sem tag nenhuma (por isso visíveis). Smoke da Frente 2 reprovado em produção: 2 contatos reais de anúncio viraram `pending_review` sem dono, não Lead.
- A tela "Contatos pendentes" foi aposentada na v0.150 → os tagged viraram órfãos invisíveis sem UI de triagem.

**Auditoria consolidada (sessão `leads-production`, 4 agentes, 2026-07-18) — os 6 produtores de `pending_review` vivos:**

1. `waha-webhook` inbound (principal — todo o tráfego real)
2. `waha-webhook` eco de saída
3. `waha-webhook` caminho `@lid` não resolvido (tag extra `lid_unresolved`, fone placeholder)
4. `whatsapp-import-history` (ramos Evolution e WAHA) via `_shared/import-db.ts` `createPendingCustomer`
5. `whatsapp-import-history-go` (mesmo adapter)
6. `whatsapp-import-contacts` (produtor próprio)

**Lacunas de 2ª ordem auditadas:** o `waha-webhook` só consulta `customers` (telefone que já é Lead ganharia customer duplicado); o `resolveContact` do core acha customer ANTES de lead (um pending criado pelo WAHA nunca vira Lead); **zero UI de conversão** (RPCs `convertPendingContact`/`markContactNotCustomer`/`restorePendingContact` órfãs, sem chamadores); ficha exibe pending como cliente normal; pickers (NewConversationDialog/orçamento) exibem pendings sem marcação; os 3 dialogs de import prometem "revisão manual" que não existe; código morto ressuscitável (`createPendingCustomer` no adapter do `whatsapp-webhook` + declaração em `IWebhookDb`, 0 call sites).

**Prova de que a separação é segura (correlação estendida de 2026-07-18, read-only):** os 5.246 foram cruzados contra os DOIS telefones (celular+fixo) de todos os 3.166 clientes do export DINTEC com chave tolerante a DDI/9º dígito → **zero matches**. Nenhum órfão é cliente ERP.

**Perfil do acervo (query de 2026-07-18):**

| Segmento | Qtde | Destino |
|---|---|---|
| Com pedido/orçamento/ex-lead | 0 | — (não existe) |
| Com dados manuais (cpf/cnpj/email/nota/veículo) | 4 | Revisão caso a caso com o dono |
| Puros COM conversa | 2.451 | **Virar Lead** (Frente B1) |
| Puros SEM NADA (sem conversa, mídia, nota, dado) | 2.791 | **Apagar com backup** (Frente B2) |

## 2. Decisões de produto (fronteira Lead × Cliente)

1. **Cliente** = tem relação: vínculo ERP (`dintec_codcli`) OU venda/orçamento na plataforma OU cadastro manual deliberado.
2. **Lead** = conversa na Inbox sem relação ainda. Vive no funil de Leads (tabela `leads`, telas de Leads), com dono via fila de rodízio.
3. **Promoção Lead → Cliente** acontece pelo fluxo de conversão **já existente** (`converted_to_customer_id`/`converted_from_lead_id`), disparado quando a negociação avança (orçamento/pedido exigem cliente).
4. Contato de agenda sem nenhuma interação **não é nem lead** — é ruído; se a pessoa chamar um dia, o webhook cria o lead na hora.

## 3. Frente A — `waha-webhook` cria Lead (código; ESTANCA A FONTE)

Portar para o `waha-webhook` a ordem de resolução que a v0.150 já implementou no core compartilhado (`resolveContact` em `src/providers/whatsapp/webhook/core.ts` — replicar o PADRÃO localmente, mantendo o isolamento WAHA; **não** importar o core):

1. `findCustomerByPhone` (tolerante, com adoção canônica do PR #329) → achou? conversa ancora em `customer_id` (comportamento atual, inalterado).
2. **`findLeadByPhone`** (mesmo padrão tolerante: sufixo-8 + `phoneDigitsMatchBr` sobre `leads.phone_digits`) → achou? reusar; se `loss_reason != null`, **reabrir** o lead perdido. Conversa ancora em `lead_id`.
3. **`createLead`** — novo lead com: `phone` no formato canônico `'+'+dígitos`, `name` = pushName do contato (best-effort, mesmo `getWahaContactName` atual; nunca os dígitos de um `@lid` como nome), `origin='whatsapp'`, `temperature='morno'`, estágio inicial do pipeline da loja, `seller_id` **via `assign_next_from_rotation`** (espelhar o adapter do `whatsapp-webhook`, `index.ts` L340-373 — a conversa em si continua indo ao pool, invariante do PRD-213).

Refinamentos aprovados (decisão b+ do dono):

- **Reabertura ganha dono**: ao reabrir um lead perdido (ou casar um lead ativo **sem dono** — os do acervo/import) num **inbound vivo**, atribuir `seller_id` via rodízio **naquele momento** — "rodízio só com interesse vivo". A reabertura também restaura o estágio inicial (padrão do `reopenLostLead` da v0.150).
- **Eco de saída** cria/reusa lead igualmente, mas **sem** atribuir rodízio (quem puxou a conversa fomos nós; dono do lead só em inbound do contato).

Regras transversais:

- **Ambos os caminhos**: inbound E eco de saída (mesma lição da v0.150 — o eco para número desconhecido também deixa de criar customer).
- **`@lid` não resolvido**: **NÃO cria lead** — telefone placeholder forjado não entra no funil nem no rodízio (decisão herdada do brainstorming da sessão `leads-production`). Mantém o contrato atual (âncora mínima com tag `lid_unresolved`, corrigível pelo `backfillLids`); vira lead só quando o telefone real for resolvido.
- **`conversations`**: inserir com `lead_id` (TEXT — gravar `lead.id::text`) e `customer_id=null`; busca de conversa aberta keyed por lead (mesmo contrato `findOpenConversationByLead` do core compartilhado).
- **Abordagem técnica**: **espelho cirúrgico** da ordem de resolução na lógica própria do `waha-webhook` (o isolamento da edge é decisão recente e deliberada; adotar o core inteiro como "5º provider" seria refactor grande sem ganho) — mesma conclusão do brainstorming da sessão `leads-production`.
- **Lacuna de identidade fechada**: o `waha-webhook` passa a consultar `leads` além de `customers` (dedup tolerante), e a extinção da espécie "customer oculto" elimina o caso patológico "customer-pending encontrado antes do lead".
- **Nada muda** para números que casam com customer existente; RLS/2 portões intactos (acesso é por instância/carteira, agnóstico à âncora).

## 4. Frente B — migração do acervo (dados; assistida, dry-run → OK → apply)

**Pré-requisito: Frente A deployada.** (Senão o webhook antigo recria o customer-fantasma no primeiro inbound de um migrado.)

### B1 — ~2.452 contatos puros com conversa → Leads (regra b+ aprovada: régua de 7 dias, sem dono)

Por contato, em transação única com guardas:

1. Criar `leads`: `name` = `full_name` se não for fone-like (senão `whatsapp_name`, senão null), `phone` canônico do customer, `origin='import'`, `temperature='frio'`, **`seller_id = null`** (decisão do dono: "rodízio só com interesse vivo" — dono chega no primeiro inbound, via Frente A), `avatar_url` copiado do customer.
2. **Régua de vitalidade (7 dias)**: `max(last_message_at)` das conversas do contato ≥ now−7d → lead **ativo** no estágio inicial (~588 na medição de 2026-07-18); senão → lead criado **já perdido** (`loss_reason = 'Importado sem interação'`, ~1.864) — invisível no kanban ativo, **auto-reaberto pelo webhook** (Frente A) no primeiro sinal de vida.
3. Repontar `conversations`: `lead_id = lead.id::text`, `customer_id = null`.
4. Apagar o customer (FKs restantes: `media_assets`/`conversation_activity` são ON DELETE SET NULL — aceitável, a mídia pertence à conversa; `distribution_traces`/`sdr_escalations` verificados no dry-run e repontados/anulados se existirem).
5. Snapshot completo em backup local (fora do git) + `audit_logs` por lote.

### B2 — 2.791 contatos puros sem nada → apagar

Backup JSONL local → DELETE. Se a pessoa chamar um dia, a Frente A cria o lead na hora (o número não se perde: está no WhatsApp, não precisamos de linha morta em `customers`).

### B3 — 4 com dados manuais → lista nominal para o dono

Sem escrita automática.

## 4-bis. Frente C — produtores de import, código morto e vácuo de UI (gaps da auditoria)

1. **Imports (produtores 4-6)** — destino de contato desconhecido nos imports de histórico/agenda: **DECISÃO PENDENTE (pergunta 1 ao dono)**; opções e recomendação na seção 10.
2. **Código morto**: remover `createPendingCustomer` do adapter do `whatsapp-webhook` e da interface `IWebhookDb` (0 call sites; ressuscitável por engano) + espelho `_shared`.
3. **Vácuo de UI**: com a extinção da espécie "customer pendente", as RPCs órfãs (`convert_pending_contact`/`mark_contact_not_customer`/`restore_pending_contact`) e o `HIDDEN_CUSTOMER_TAGS` deixam de ter população-alvo — remover/depreciar conforme a decisão da pergunta 1; corrigir os 3 dialogs de import que prometem "revisão manual" inexistente; pickers passam a não ter pendings para exibir.
4. **`NewConversationDialog` (outbound número inédito)**: hoje cria customer visível com dono = vendedor — divergência registrada; decisão de produto separada (fora do escopo mínimo desta entrega, listada em aberto).

## 5. Ajustes de apoio (mesma entrega)

- **Avatar na Inbox**: `leads` não tem `avatar_url` — migration aditiva `leads.avatar_url` + `conversation_contacts`/`search_conversations` passam a `coalesce(cu.avatar_url, l.avatar_url)`; na migração B1, copiar o avatar do customer para o lead (senão 2.451 conversas perdem a foto). O job `whatsapp-avatar-sync` aprende a carimbar leads (ou fica deferido com registro — decidir no plano).
- **Verificações de UI** (podem já estar prontas da v0.150; confirmar, não reconstruir): ficha reduzida de lead na conversa, CTA de conversão, criação de orçamento a partir de conversa-lead exige converter antes.
- **`leads.conversations` (ARRAY)**: coluna legada da era mock — NÃO manter em sincronia; link real é `conversations.lead_id` (registrar no doc).

## 6. O que NÃO muda (fronteiras congeladas + lista "não regredir" da auditoria)

- Modelo de acesso "2 portões" e RPCs gated-once do Atendimento (**CONGELADO** — a mudança na `conversation_contacts` é só o `coalesce` de avatar, mesma cirurgia do fallback B2B de 2026-07-17, verificada por diff verbatim).
- Cache/realtime/query keys do Atendimento.
- Pipeline compartilhada Meta/Evolution — `whatsapp-webhook` v49 com fluxo Lead correto (funciona, só não tem tráfego; **não reverter**), incluindo a correção do SDR (`!resolved.created` no core).
- Fluxos WAHA sensíveis e recém-estabilizados (mídia, ack, resolução `@lid`, dedup por eventKey, adoção canônica do PR #329) — a mudança na resolução de contato não pode quebrar recepção/eco/mídia.
- RPC `assign_next_from_rotation` aplicada em prod (usada pela fila real: 1 fila, 4 participantes) — reusar, não dropar.
- Dados DINTEC (clientes e produtos).

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| RLS do pool para conversas de lead (dor histórica "Lead anônimo") | Caminho de leitura já passa por RPCs SECURITY DEFINER; e2e com usuário não-staff no plano de testes |
| Webhook recriar fantasma durante a migração | Ordem obrigatória: Frente A em prod ANTES da B; migração fora do horário de pico |
| `lead_id` é TEXT (cast `::text` nos joins) | Padrão já existente nas RPCs; testes cobrem |
| Perda de avatar/nome nas 2.451 conversas migradas | `leads.avatar_url` + coalesce na RPC; nome vem de `leads.name` (já coberto pela RPC) |
| Duplicação lead×lead (dedup tolerante) | `findLeadByPhone` tolerante ANTES de criar; lição do import-contacts (bug de dedup conhecido) não se repete |
| SDR/rodízio/alertas ociosos em conversa-lead | São conversation-scoped (agnósticos à âncora); smoke no plano |
| Fluxo "Nova conversa" outbound para número inédito | Verificar se cria customer; se sim, alinhar à mesma regra (lead) — escopo pequeno, decidir no plano |

## 8. Critérios de aceite

1. Tela de **Clientes = 3.169** (3.165 DINTEC + 4 manuais) e cresce só por conversão/cadastro deliberado.
2. Tela de **Leads**: kanban ganha só os **vivos ≤7d** (~588 na medição) — frios, sem dono; os demais ~1.864 ficam como perdidos-dormentes ("Importado sem interação"), fora do kanban ativo, auto-reabertos (com dono via rodízio) no primeiro inbound.
3. **Inbox visualmente idêntica**: mesmos nomes, avatares e acessos nas 2.451 conversas migradas (validação por amostra antes/depois).
4. Mensagem nova de número desconhecido cria **Lead** (log do webhook + linha em `leads`), nunca mais `customers` fantasma.
5. Zero conversas órfãs (toda conversa com `customer_id` OU `lead_id` válido).
6. Backups + `audit_logs` de cada lote da Frente B; rollback documentado.

## 10. Decisões em aberto (pergunta 1 do brainstorming consolidado)

**RESOLVIDA (dono, 2026-07-18): variante (b+)** — histórico importado cria **lead** com a mesma régua de vitalidade de 7 dias (vivo → ativo frio sem dono; morto → já perdido "Importado sem interação", auto-reaberto no primeiro inbound); agenda pura **não cria nada** (o `whatsapp-import-contacts` vira enriquecedor de nome/foto de registros existentes). Registro da discussão abaixo.

**Pergunta 1 — o que os IMPORTS (histórico/agenda) devem criar para contato desconhecido?**

Dados que dimensionam a escolha (2026-07-18): das 2.452 conversas do acervo sem vínculo ERP, **588 tiveram atividade nos últimos 7 dias, 856 entre 8-30 dias** (1.444 vivas) e 1.008 estão mortas há 30+ dias; 1.973 estão com status aberto; 242 têm atendente. Import pendente conhecido: histórico do "Comercial Lucas" (migração WAHA) — nova rajada esperada.

- **(a) Âncora oculta + triagem mínima** (recomendação original da sessão `leads-production`): imports continuam criando customer oculto por tag + triagem manual reusando as RPCs órfãs. Contra (visão consolidada): mantém viva a espécie "customer oculto" — exatamente a patologia auditada (órfãos invisíveis, UI extra a construir, e reabre a lacuna de identidade: o inbound vivo acha o customer oculto antes do lead e a pessoa nunca entra no funil).
- **(b) Import de HISTÓRICO cria Lead frio sem dono; import de AGENDA não cria nada** (recomendação desta spec): conversa importada ancora em lead `frio`, `seller_id null` (rodízio é só para inbound vivo — não desperdiça a fila com história), origem `import`; agenda pura (sem conversa) deixa de criar registro — o `whatsapp-import-contacts` passa a apenas **enriquecer** registros existentes (nome/foto), princípio idêntico ao B2 do acervo. Um modelo só, sem espécie oculta; o risco de "inundar o funil" é tratável por UX (filtro padrão por dono/atividade na tela de Leads) e é o MESMO já aceito na migração B1.
- **(c) Cliente visível sem dono**: descartada — é o problema atual.

**Pergunta 2 (consolidada):** o destino dos 433 órfãos originais está ABSORVIDO pela Frente B (fazem parte dos 5.246).

**Pergunta 3 (técnica):** respondida — espelho cirúrgico no `waha-webhook` (seção 3).

## 11. Rollout

1. **PR único** (spec + plano + código Frente A + migration `leads.avatar_url` + RPCs) — lição do PR #263: spec nunca viaja separada da implementação.
2. Merge + deploy `waha-webhook` (gate do dono) + smoke: mensagem de número inédito → lead criado.
3. Frente B assistida (dry-run com relatório nominal → OK do dono → apply por lotes, B1 depois B2), no padrão DINTEC.
4. Encerramento: atualizar o projeto paralelo "webhook cria Lead" (este trabalho É a Frente 3 dele) e o checkpoint.
