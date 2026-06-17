# Rodízio / Fila de Atendimento (PRD-213)

Fila de atendimento por loja que governa o **revezamento de rotina** das conversas novas. Mecanismo próprio, integrado ao motor de distribuição (PRD-013) por um contrato de fronteira — sem reescrever o motor e sem atribuição dupla.

## Modelo

Uma fila por loja (`IRotationQueue`, 1:1 com `IStore`). O `targetMode` vive **na própria fila** (não em `IPlatformSettings`):

- `direct` — a fila reveza entre **usuários**.
- `department` — a fila reveza entre **departamentos** e, dentro do escolhido, entre seus **membros** (dois níveis, ponteiros independentes).

Participantes (`IRotationParticipant`) têm dois escopos:

- **topo** — `scopeDepartmentId = null` (`refType: 'seller'` no modo direct; `'department'` no modo department).
- **interno** — `scopeDepartmentId` preenchido → membro do rodízio interno daquele departamento.

Ponteiros (justiça temporal): `rotation_queues.last_assigned_ref_id` (topo) e, por departamento, `last_assigned_member_id` **na linha do participante-departamento**.

DELTA em `ISeller.rotation = { enabled }` — liga/desliga rápido na aba "Rodízio" do cadastro; espelha o `enabled` do participante.

## Engines (puros, testados — `src/features/rotation/engine/`)

- `eligibility.ts` → `isSellerEligible(seller, { enabled }, now)`: `enabled` E ativo E `availability==='online'` E **dentro do horário** (reusa `isWithinWorkSchedule` do PRD-212; sem agenda = sempre dentro).
- `selectNextFromRotation.ts` → seleção determinística (sem `Math.random()`): ordena por `order`, inicia **após** o ponteiro (wrap-around), pula não-elegíveis registrando o motivo, e no modo department resolve departamento → membro com ponteiros independentes. Resultado vazio = ninguém elegível → o fluxo segue o fallback do PRD-013.
- `applyRotationOverride.ts` → contrato de fronteira: a fila só governa quando o 013 caiu em `round_robin | carga | fallback_fila`; **carteira/especialidade têm precedência** (decisão devolvida intacta). Quando governa, reescreve a decisão (`status='em_andamento'`, `isSdrActive=false`, `criterionMatched='round_robin'` — a fila É o revezamento, sem novo enum) e devolve os ponteiros a persistir.

## Integração (ponto único)

Em `conversations.create()` (mock e supabase), **após** `distributeConversation()`: chama `applyRotationOverride`, usa a decisão efetiva para a conversa/mensagens/trace e persiste os ponteiros. **Uma atribuição por conversa.**

> ⚠️ O **webhook real** (`src/providers/whatsapp/webhook/core.ts`) **não é tocado**: em produção a conversa nova recebe `assignedSellerId = customer.sellerId` direto (cliente conhecido → seu vendedor; cliente novo → `aguardando`). Ativar a fila no webhook (distribuir clientes novos em produção) exige presença online/offline confiável **server-side** e fica como passo futuro deliberado — espelha o deferimento do enforcement server-side do PRD-212.

Trace: reaproveita `IDistributionTrace` (sem nova tabela/enum), com os pulados detalhados em `candidatesEvaluated[].reason` ("rodízio: pulado — offline" etc.).

## UI

- **Tela** `/app/configuracoes/rodizio` (Owner/Gestor, gate `seller/edit/store`): seletor de `targetMode`, lista ordenável por **drag-and-drop** (`@dnd-kit`, com alternativa por teclado), liga/desliga por participante, add/remove, navegação de dois níveis no modo department, e **visão ao vivo** ("Agora": próximo elegível + estado/pulados de cada um, rodando o engine em runtime). Link cruzado a partir da tela de Distribuição.
- **Aba "Rodízio"** no cadastro de usuário: switch de participação + indicador de elegibilidade; salva junto com o botão único do formulário (controlado, como a aba Horário do 212).

## Camada de dados

Providers `rotationQueues` (`getByStore`/`getState`/`update`) e `rotationParticipants` (`listTop`/`listByDepartment`/`add`/`remove`/`setEnabled`/`reorder`/`setMemberPointer`). Mock-first (seed determinístico: fila da loja em `direct` com os vendedores ativos). Supabase: tabelas `rotation_queues`/`rotation_participants` (RLS espelhando `departments` — leitura autenticada, escrita `is_staff()`), mapper snake↔camel, `sellers.rotation` mapeado.

Migration: `supabase/migrations/20260616180000_rotation_queues.sql` — aditiva/idempotente.

## Seguir / pendências

- Ativação no webhook (presença server-side) — futuro.
- `reorder` no supabase é por-linha (não atômico); follow-up = RPC `SECURITY DEFINER` se houver contenção.
