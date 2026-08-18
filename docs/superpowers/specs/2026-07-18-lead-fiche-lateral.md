# Spec — Ficha lateral de lead no Atendimento

> **Status:** rascunho para aprovação do dono · 2026-07-18
> **Origem:** gap aberto pela Funnel Frente 3 (registrado em `docs/dev/funnel-frente3.md` §7)
> e confirmado em produção: em conversas ancoradas em lead (anúncios novos + acervo
> repontado — 1.573 das 1.825 conversas ativas em 30 dias), os botões **Ficha** e
> **Histórico** do atendimento não fazem nada.

## Problema

`ConversationPage.tsx` monta `CustomerProfileFiche` (L325) e `AttendanceHistoryPanel`
(L351) somente quando `conversation.customerId` existe. Antes da Frente B toda conversa
do pool tinha um cliente-placeholder (`pending_review`) e a ficha abria; depois da
migração, a maioria ancora só em `lead_id` — o clique no botão muda o estado, mas nenhum
painel existe. Sem erro, sem feedback: clique morto.

Agravante já registrado: a RLS `leads_select` esconde lead **sem dono** de usuários
não-staff — exatamente o perfil (atendente) que mais opera o pool. Mesmo uma ficha
frontend-only ficaria vazia para eles: `useConversationDetail` resolve o lead via
`leadsProvider.get()` direto (L125), fail-soft para `null`.

## Decisão (aprovada pelo dono em 2026-07-18)

**Ficha lateral própria de lead**, no mesmo padrão de acesso da ficha de cliente do
pool: leitura **gated pela conversa** (RPC `SECURITY DEFINER` que valida
`can_access_conversation` **uma vez**), não pela RLS per-linha de `leads`.
Sem band-aid: o botão Ficha passa a funcionar em 100% das conversas.

## Escopo v1

### 1. RPC `lead_via_conversation` (migration nova)

Espelho do `conversation_customer` (RPC por trás de
`customersProvider.getViaConversation`):

```sql
create or replace function public.lead_via_conversation(p_conversation_id uuid)
returns setof public.leads
language sql
security definer
set search_path = ''
stable
as $$
  select l.*
  from public.conversations c
  join public.leads l on l.id = c.lead_id   -- ambos TEXT
  where c.id = p_conversation_id
    and public.can_access_conversation(c.id);
$$;

revoke all on function public.lead_via_conversation(uuid) from public, anon;
grant execute on function public.lead_via_conversation(uuid) to authenticated;
```

- Gate **uma única vez** (`can_access_conversation`), padrão do modelo de 2 portões
  (`docs/dev/conversation-access-model.md`). Nenhuma policy de `leads` é alterada.
- Cobertura em `supabase/tests/rls-regression.sql`: atendente com acesso à instância
  lê o lead sem dono via RPC; usuário sem acesso à conversa recebe vazio.

### 2. Contrato e providers

- `ILeadsProvider.getViaConversation(conversationId: ID): Promise<ILead | null>`
  - **supabase:** `.rpc("lead_via_conversation", …)` → `mapRowToLead` | `null`.
  - **mock:** resolve a conversa no mockStore e devolve o lead vinculado | `null`.
- `ILead` ganha `avatarUrl?: string` (a coluna `leads.avatar_url` já existe desde a
  migration `20260718202917`; hoje só o RPC `conversation_contacts` a consome).
  Mapper supabase atualizado; mock pode omitir (campo opcional).

### 3. `useConversationDetail`

Trocar a L125: `leadsProvider.get(conversation.leadId)` →
`leadsProvider.getViaConversation(id)` (mantém o `.catch(() => null)` fail-soft).
Nada mais muda no hook — mesma query key, mesmo shape. ⚠️ Zona congelada de cache do
atendimento **não é tocada** (query keys/realtime/signing intactos).

### 4. Componente `LeadProfileFiche`

`src/features/leads/components/LeadProfileFiche.tsx` (+ export no barrel), seguindo os
modos de layout da ficha de cliente (`useFicheLayout`):

- `column` (≥1280px): coluna lateral de 360px; `drawer` (768–1279): Sheet overlay;
  `route` (<768): o botão Ficha navega para `/app/leads/$id`.
- **Conteúdo (somente leitura):**
  - Avatar (`lead.avatarUrl` ?? `contact.avatarUrl`), nome, telefone formatado, e-mail.
  - Badges: estágio (cor do pipeline), temperatura (`TEMPERATURE_META`), origem
    (`getOriginMeta` — null-safe), e estado **Perdido**/**Convertido** quando houver.
  - Dono do lead (seller) ou **"Em fila"** quando `sellerId` nulo.
  - Tags, criado em, valor estimado, próxima ação (`getNextActionInfo`).
- **Ações:**
  - **Ver lead** → navega para `/app/leads/$id` (visível conforme permissão `lead/view`).
  - **Converter em cliente** → reusa `ConvertLeadModal` existente; ao concluir,
    `detail.refresh()`.
- Fallback: se o RPC devolver `null` (corrida rara: lead excluído), renderiza o cartão
  mínimo a partir de `detail.contact` (nome/telefone/avatar) com aviso.
- Strings novas em `LEADS_STRINGS.fiche.*` (pt-BR com acentos corretos).

### 5. `ConversationPage`

- Ficha: `customerId` → `CustomerProfileFiche` (inalterada); senão, `leadId` →
  `LeadProfileFiche`; senão (nem cliente nem lead — hoje 0 conversas) → botão
  desabilitado.
- **Histórico:** quando `!customerId`, botão **desabilitado** com tooltip
  "Disponível quando o contato virar cliente" (histórico de atendimento é por cliente).
- Consultor e Mídias: intocados (já funcionam).

## Fora de escopo (v2 / follow-ups)

- **Edição inline** de estágio/temperatura na ficha (exigiria RPC de **escrita** gated;
  qualificação continua na página do lead).
- Histórico de atendimento por lead.
- Notas de lead na ficha.
- **Verificar na execução:** se a conversão lead→cliente re-ancora a conversa
  (`conversations.customer_id`). Se não re-ancorar, registrar follow-up — não expandir
  o escopo deste projeto silenciosamente.

> **Verificado na execução (2026-07-20, PR #339): NÃO re-ancora.** O
> `ConvertLeadModal` cria o customer e marca o lead (`convertedToCustomerId`),
> mas nada escreve em `conversations.customer_id` — a conversa continua
> ancorada no lead após a conversão (ficha de lead com badge "Convertido";
> Histórico/Copiloto/ficha de cliente seguem indisponíveis nela). **Follow-up
> registrado:** re-ancorar a conversa na conversão (destrava os três de uma
> vez); candidato natural ao v2 junto com a RPC de escrita gated.
>
> **Desvios do v1 registrados (round 2 da revisão adversarial):**
> (a) §4 modo `route` — o mobile abre o mesmo Sheet do modo drawer em vez de
> navegar para `/app/leads/:id`: a PÁGINA de lead lê sob a RLS per-owner e
> daria "Lead não encontrado" para o atendente de pool; só a ficha é gated
> pela conversa. (b) As ações "Ver lead" e "Converter em cliente" são gated
> pelo predicado RLS-real (staff-store / dono do lead / responsável da
> conversa), não só pela permissão de papel — a conversão por não-staff em
> lead sem dono falharia com 42501 (`customers_insert`/`leads_update`); a
> RPC de escrita gated fica no v2.

## Rollout

1. PR com migration **versionada no repo** + frontend juntos.
2. `apply_migration` em prod (com OK do dono) **antes** do merge/deploy — mas o
   frontend é fail-soft (`catch → null`), então não há janela quebrada em nenhuma ordem.
3. Smoke: como atendente não-staff, abrir conversa de anúncio (lead sem dono) → Ficha
   abre com dados; Histórico desabilitado com tooltip; conversa de cliente inalterada.

## Gates de qualidade

- `bun run build` + `bun run test` (suite completa) verdes.
- tsc por delta nos arquivos novos.
- Regressão RLS coberta no `rls-regression.sql`.
