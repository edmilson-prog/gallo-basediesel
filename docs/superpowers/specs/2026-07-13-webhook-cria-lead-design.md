# Webhook cria Lead para contatos novos (Frente 2) — Design

## Contexto

Frente 1 (migração do backlog de clientes importados da plataforma antiga, tag `pending_review`) está concluída: 4.814 registros convertidos em `ICustomer` confirmado, 0 pendências residuais (`docs/superpowers/plans/2026-07-13-migracao-backlog-pending-review.md`).

Esta é a Frente 2: reestruturar o fluxo de **conversas novas** do WhatsApp. Hoje, todo número desconhecido gera automaticamente um `customer` placeholder (tag `pending_review`) no webhook — o mesmo mecanismo que gerou o backlog da Frente 1. Isso está errado para contato genuinamente novo: um número desconhecido que manda a primeira mensagem é um **lead desconhecido**, não um cliente. Ele deve passar pelo funil de qualificação (já existente em Leads) e só virar `ICustomer` ao converter no fim do funil (`ConvertLeadModal`, já existente e funcional).

## Resolução de contato no webhook

Local: `src/providers/whatsapp/webhook/core.ts`, etapa 5 ("Customer resolution"). Nova ordem de resolução por telefone:

1. **Telefone bate com um `customer` real existente** → comportamento inalterado. Vira `conversation.customerId`, exatamente como hoje.
2. **Senão, telefone bate com um `lead` já existente** (qualquer estágio, incluindo perdido) → reusa esse lead em vez de criar um novo.
   - Se o lead estava marcado como perdido (`lossReason` setado, `convertedToCustomerId` vazio — mesma checagem que `isLost()` em `src/features/leads/utils/leadDisplay.ts`), **reabre**: limpa `lossReason`/`lossNotes`, volta ao estágio inicial do funil. O histórico anterior (mensagens, notas) continua visível — só o estado "perdido" é desfeito, mesmo espírito do reopen de conversa fechada já existente (`reopenOnInbound`).
3. **Senão, cria um lead novo:**
   - `origin = 'whatsapp'`
   - `stage` = primeiro estágio por `order` entre os estágios configurados da loja
   - `temperature = 'morno'`
   - `sellerId` = resolvido pela nova função de rodízio em SQL (ver seção seguinte)

Em todos os casos do passo 2/3, a conversa nasce com `leadId = lead.id`, `customerId = null`, e `assignedSellerId` = o mesmo vendedor dono do lead — mantendo consistentes os dois portões de acesso já existentes (Atendimento por instância, Carteira por dono) sem precisar de nenhuma mudança em `can_access_conversation` ou nas RLS de `leads`/`conversations` (já espelham o padrão de `customers` por `seller_id`).

## Segundo caminho: eco de saída

O webhook tem uma segunda rotina de resolução de contato, estruturalmente idêntica: o "eco de saída" (`parsed.type === "outbound-echo"`, `src/providers/whatsapp/webhook/core.ts` por volta da linha 541), disparado quando alguém da equipe manda mensagem **do próprio celular** para um número que ainda não existe no CRM (fora do app). Hoje esse caminho também chama `createPendingCustomer`. A mesma regra de resolução (customer real → lead existente, reabrindo se perdido → lead novo) se aplica aqui — sem deixar um segundo caminho ainda gerando `pending_review`. O dono do lead nesse caso também vem da função de rodízio (o webhook não sabe qual vendedor específico mandou a mensagem do celular compartilhado).

Isso implica extrair a lógica de resolução (passos 1-3 da seção anterior) para uma função compartilhada dentro de `core.ts`, chamada pelos dois pontos (inbound customer-message e outbound-echo) — evita duplicar a mesma lógica duas vezes.

## Atribuição de dono: rodízio em SQL

A fila de rodízio real (PRD-213) hoje só roda no cliente (`src/features/rotation/engine/`) — inacessível para o webhook, que roda como Edge Function no servidor. Nova função Postgres `SECURITY DEFINER`, ex. `public.assign_next_from_rotation(p_store_id text) returns uuid`, espelhando fielmente `selectNextFromRotation` + `isSellerEligible`:

- Lê `rotation_queues` e `rotation_participants` da loja (`targetMode` `direct` ou `department`, dois níveis de ponteiro com wrap-around, mesma lógica de "começa depois do último atribuído").
- Elegibilidade de cada vendedor candidato, na ordem: participação habilitada (`rotation_participants.enabled`) → `sellers.active` → `sellers.availability = 'online'` (coluna simples, sem lógica extra) → dentro do horário de atendimento.
- Horário de atendimento: `sellers.work_schedule` (array de janelas `{weekday, openAt, closeAt, enabled}`) e `sellers.schedule_overrides` (exceções por data), calculado com "agora" em horário de São Paulo por **offset fixo −03:00** (Brasil sem DST desde 2019 — não precisa de lookup de fuso horário IANA completo, só aritmética de intervalo).
- Se nenhum participante for elegível (fila vazia, mal configurada, ou todo mundo offline/fora de horário) → **fallback final: o Owner da loja** (papel "Dono"). Garante que `leads.seller_id` (coluna `not null`) nunca fique sem valor.
- Avança o(s) ponteiro(s) (`rotation_queues.last_assigned_ref_id` e, no modo department, `rotation_participants.last_assigned_member_id` do departamento escolhido) atomicamente na mesma chamada.

Esta função é nova infraestrutura — não reescreve nem substitui `selectNextFromRotation` (que continua sendo a fonte de verdade para a UI de rodízio no app, incluindo a visão "Agora" ao vivo). As duas implementações (TS no cliente, SQL no webhook) precisam ficar comportamentalmente equivalentes; qualquer mudança futura na regra de elegibilidade ou wrap-around deve ser replicada nas duas.

## Aposentar `contact-review`

Sem novas conversas gerando `pending_review` (a partir do deploy desta frente, e com o backlog já zerado pela Frente 1), a tela deixa de ter propósito:

- Removidos do frontend: rota/página `PendingContactsPage`, `PendingContactBanner`, `ConvertContactDialog`, `MarkNotCustomerDialog`, hooks `usePendingContacts`/`useContactConversion`, e os pontos de entrada que os referenciam (ex. na ficha do cliente/conversa).
- As RPCs de banco (`convert_pending_contact`, `mark_contact_not_customer`, a de restore) **ficam no banco, sem chamador** — não vale o risco de dropar função em produção só por limpeza; código morto inofensivo, documentado como tal.
- O filtro `excludeTags` que hoje esconde `pending_review` da lista de Clientes (`src/features/customers/utils/listFilters.ts`) deixa de encontrar qualquer registro (não precisa ser removido, só fica sem efeito prático).

## Fora de escopo

- Redistribuição de carteira dos leads criados por esta frente (a mesma ferramenta de transferência de carteira já usada na Frente 1 se aplica).
- Mudanças em `ConvertLeadModal`, `MarkAsLostModal` ou qualquer tela do funil de Leads — já funcionam e são reaproveitadas como estão.
- Ativar a fila de rodízio real (client-side) para qualquer outro fluxo além deste — o escopo da função SQL nova é estritamente "atribuir dono a um lead novo/reaberto no webhook".
- Espelhar essa lógica para canais não-WhatsApp (a resolução de contato por telefone já é específica do WhatsApp; outros canais não são afetados).

## Testes e rollout

- A função SQL nova precisa de uma suíte de casos equivalente à de `selectNextFromRotation.test.ts` (mesmos cenários: modo direct, modo department, wrap-around, todos offline, fila vazia, fallback Owner) — rodada via `supabase/tests/` ou um script de verificação manual pós-deploy, já que é lógica de banco, não Vitest.
- Rollout gated: a mudança em `core.ts` é espelhada em `_shared/whatsapp/` (regra já existente do projeto — mudou `src/providers/whatsapp/` ⇒ rodar `scripts/sync-whatsapp-shared.ts` e redeployar `whatsapp-webhook`). Deploy da function SQL nova (`apply_migration`) precisa vir **antes** do redeploy do webhook, já que o webhook passa a depender dela.
- Após o deploy, confirmar com números de teste reais (não simulados) que: (a) um número totalmente novo gera um Lead, não mais um Customer; (b) o mesmo número mandando de novo reaproveita o lead; (c) um lead marcado perdido reabre corretamente ao receber nova mensagem.
