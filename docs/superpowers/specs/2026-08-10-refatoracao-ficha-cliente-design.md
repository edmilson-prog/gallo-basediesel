# Refatoração da ficha do cliente — `/app/clientes/$id`

> **Data:** 2026-08-10
> **Fonte da verdade de design:** `ui_kits/crm/index.html` (Claude Design, projeto `0dddcf0e-782d-4f2e-be6c-0a094c427bbe`)
> **Tela alvo:** `CustomerDetailPage` (`src/features/customers/pages/CustomerDetailPage.tsx`)

## Problema

A ficha atual gasta a dobra inteira com blocos que quase sempre estão vazios:

- Três cards de altura fixa e igual (`Evolução de compras`, `Relacionamento`, `Pendências e ações`)
  ocupando ~230 px cada. Num cliente novo, os três estão vazios.
- Faixa de 5 KPIs em largura total mostrando `R$ 0,00`, `—` e `Sem compras`. Uma das cinco
  células é a Curva ABC, que na prática exibe `—` para a maioria.
- As abas ficam depois de tudo isso, e a aba padrão (`Atendimento`) é a que mais vezes está
  vazia — o primeiro clique do vendedor é sempre para sair dela.
- Telefone, CNPJ, razão social, endereço, vendedor da carteira, loja e tags **não aparecem em
  lugar nenhum** sem abrir a aba `Visão geral`.
- `Pendências e ações` é renderizado com borda e fundo de destaque mesmo quando a mensagem é
  "Tudo em dia" — vermelho gasto em não-evento.

## Decisões tomadas

| Decisão | Escolha | Razão |
|---|---|---|
| Direção de layout | **A · Faixas** | Bandas de largura total, cada uma com a altura do próprio conteúdo; some sozinha quando não há dado. Escala melhor em telas largas que a Direção B. |
| Escopo das abas | **Só a página do cliente** | `ProfileTabs` é compartilhado com a ficha lateral do Atendimento (área congelada) e com o painel de preview da lista. Um componente novo isola o risco. |
| Limite de crédito | **Editável + usado derivado** | Escolha do dono, com o custo à vista (ver "Riscos aceitos"). |

## Arquitetura

### Cabeçalho — quatro bandas

Substitui `CustomerDetailHeader` + `CustomerStatStrip` + os três cards.

| Banda | Componente | Conteúdo | Comportamento vazio |
|---|---|---|---|
| 1 · Identidade | `CustomerIdentityBand` | breadcrumb, avatar, nome, selos, 6 ações rápidas, *Criar orçamento*, menu ⋮ | sempre visível |
| 2 · Fatos | `CustomerFactsBand` | telefone, CNPJ/CPF, razão social, endereço, vendedor, loja | campo vazio **é dito** ("Não informado"), não escondido |
| 3 · Comercial | `CustomerCommercialBand` | ticket médio, LTV, última compra, frequência, orçamentos abertos, crédito, sparkline 12m | encolhe e vira convite "Criar o primeiro orçamento" |
| 4 · Alertas | `CustomerAlertsBand` | pendências, cada uma com sua severidade e um CTA que navega para a aba | **não é renderizada** quando não há pendência |

Primitiva compartilhada: `CustomerFact` — rótulo em caixa alta + valor, com botão de copiar
que aparece no hover. Estado vazio em itálico e cor apagada.

**Curva ABC** deixa de ser célula da faixa de KPIs e vira selo no cabeçalho, junto de
B2B/B2C, status e positivado.

### Severidade dos alertas

Vermelho passa a significar crítico real. A tabela abaixo é o contrato de `customerAlerts.ts`:

| Pendência | Severidade | Token |
|---|---|---|
| Veículo aguardando aprovação | crítica | `severity-critical` |
| Recompra atrasada (recência > 1,5× intervalo médio) | crítica | `severity-critical` |
| Orçamento aberto há mais de 3 dias | atenção | `severity-warning` |
| Recomendação não vista | atenção | `severity-warning` |
| Cadastro incompleto (sem documento/e-mail/endereço) | informativa | `severity-info` |

Sem pendência nenhuma, a banda 4 não existe no DOM — nada de card vazio dizendo "tudo em dia".

### Abas — 10 → 6

Componente novo `CustomerTabs`, usado **apenas** por `CustomerDetailPage`. `ProfileTabs`
permanece byte-a-byte igual para os outros dois consumidores.

| Nova aba | Absorve | Sub-abas |
|---|---|---|
| Atendimento | `atendimento` + pendências + timeline de Relacionamento | — |
| Comercial | `orders` + `quotes` | Pedidos / Orçamentos |
| Frota | `vehicles` | — |
| Conversas | `conversations` + `midias` + `historico` | Conversas / Mídias / Histórico |
| Cadastro | `overview` | — |
| Notas | `notes` + `recommendations` | Notas / Recomendações |

Propriedades da barra:

- `position: sticky` logo abaixo do cabeçalho — as abas acompanham o scroll.
- Contador por aba, renderizado só quando `> 0`.
- **Aba padrão com conteúdo:** abre em `Atendimento` quando há pendência; senão, `Comercial`.
- Os painéis são os componentes **já existentes** (`OrdersTab`, `QuotesTab`, `VehiclesTab`,
  `ConversationsTab`, `NotesTab`, `RecommendationsTab`, `OverviewTab`, `AtendimentoTab`,
  `CustomerMediaTab`, `AttendanceHistoryPanel`), montados sem alteração. Muda o agrupamento,
  não o conteúdo.
- Renderização preguiçosa preservada: o painel só monta quando a aba está ativa.

### Crédito

`dintec_credit_limit` **já existe** na tabela `customers` (migration
`20260625130000_customers_dintec_codcli.sql`), populado pelo import do DINTEC a partir do
campo `credito`. Não existe, em lugar nenhum, um valor de "usado".

**Migration nova:** `customers.credit_limit numeric`, semeada de `dintec_credit_limit` onde
este não for nulo. O campo DINTEC continua sendo o snapshot do ERP; `credit_limit` passa a ser
o valor da plataforma, editável.

**Usado derivado** — `engine/customerCredit.ts`, função pura:

```
usado = Σ order.total  onde  paymentStatus ∈ {pendente, parcial, vencido}
                        e     canceledAt == null
livre = max(0, limite - usado)
```

**Edição inline** protegida pela permissão de edição de cliente que já existe. Não será criado
recurso RBAC novo: um recurso ausente de `rbac_resources` faz o controle sumir para todos os
papéis, e o seed exigiria migration adicional.

## Lógica de negócio isolada

Dois engines puros, testados com Vitest, seguindo o padrão do projeto:

- `engine/customerAlerts.ts` — recebe contadores já resolvidos (orçamentos abertos, veículos
  pendentes, recomendações não vistas) mais o próprio cliente, e devolve a lista de alertas
  ordenada por severidade. Sem React, sem fetch.
- `engine/customerCredit.ts` — recebe limite e pedidos, devolve `{ limite, usado, livre, pct }`.

A UI fica sem regra: renderiza o que os engines devolvem.

Reaproveitamento: `buildMonthlyPurchaseSeries` (`utils/purchaseSeries.ts`) já agrega pedidos
pagos em 12 buckets mensais e é pura — alimenta a sparkline sem código novo.

## Tokens e tema

O kit é dark-only e usa hex direto. A tradução para tokens semânticos é obrigatória
(`CLAUDE.md`) e a ficha precisa funcionar nos dois temas:

| Kit | Token |
|---|---|
| `CRM.bg` `#141011` | `bg-background` |
| `CRM.card` `#1c1819` | `bg-card` |
| `CRM.sunk` `#171314` | `bg-muted/40` |
| `CRM.line` / `line2` | `border-border` |
| `CRM.gold` `#E0BB4E` | `text-primary` / `bg-primary` |
| `CRM.red` `#E23A40` | `severity-critical` |
| `CRM.green` `#5BB07A` | `severity-success` |
| `CRM.blue` `#5B9BD5` | `severity-info` |
| `CRM.t1…t4` | `text-foreground` / `text-muted-foreground` |

Nenhum primitivo `--gallo-*` e nenhum hex direto no código novo.

## Riscos aceitos

1. **A migration trava o merge.** `credit_limit` entra na string `COLUMNS` do
   `select` em `providers/data/impl/supabase/customers.ts`. Se o PR mergear antes da migration
   ser aplicada em produção, **toda** consulta de clientes passa a devolver 400 do PostgREST —
   não só a ficha. A ordem obrigatória é: aplicar a migration (com OK explícito do dono) →
   depois mergear. Mergear o PR não aplica a migration.
2. **O "usado" renderiza R$ 0 para praticamente todos.** Levantamento em produção em
   2026-08-10: 1 cliente de 3.173 tem `dintec_credit_limit`; nenhum tem portal provisionado; e
   a base não tem pedidos. O dono aprovou com esse custo à vista.
3. **Dois componentes de abas convivem.** `CustomerTabs` (6) e `ProfileTabs` (10) coexistem até
   a ficha do Atendimento ser descongelada. Duplicação consciente, trocada por risco zero na
   área congelada.

## Fora de escopo

- Direção B (painel de duas colunas) do kit.
- Qualquer alteração em `ProfileTabs` e, por consequência, na ficha lateral do Atendimento e no
  painel de preview da lista.
- Módulo financeiro de contas a receber — o "usado" é derivado de pedidos, não de títulos.
