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

1. **~~A migration trava o merge.~~ RESOLVIDO em 2026-08-10.** `credit_limit` entra na string
   `COLUMNS` do `select` em `providers/data/impl/supabase/customers.ts`, então mergear antes da
   migration faria **toda** consulta de clientes devolver 400 do PostgREST — não só a ficha.
   A migration `20260810150000_customers_credit_limit.sql` **foi aplicada em produção** com OK
   explícito do dono, antes do merge. Verificado: a coluna existe, o único cliente com
   `dintec_credit_limit` foi semeado (divergência zero) e o PostgREST aceita
   `select=id,credit_limit` com HTTP 200 — contra 400/`42703` para uma coluna inexistente,
   provando que o teste discrimina.

   ⚠️ O arquivo foi **renomeado** de `20260810120000_` para `20260810150000_`: o PR #438
   (responder/citar mensagem) já tinha aplicado no mesmo dia uma migration cujo arquivo usa o
   prefixo `20260810120000_`, e dois arquivos com o mesmo timestamp disputariam a mesma
   `version` no diretório assim que aquele PR mergeasse.
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

---

# Segunda passada — fidelidade ao kit (2026-08-13)

A primeira entrega acertou a **arquitetura** (4 bandas, 6 abas, severidade, colapso da banda
comercial) e ficou devendo o **acabamento** e dois pontos de comportamento. Revisão linha a linha
de `ui_kits/crm/*` contra a implementação encontrou 10 divergências, todas corrigidas aqui.

| # | Divergência | Correção |
|---|---|---|
| 1 | A tela não usava **nenhuma** tipografia de marca — o kit é Saira Condensed (`--font-display`) em tudo que é estrutural, a ficha era 100% Barlow | `font-display` no nome, nas abas, nos KPIs, nos valores mono dos fatos, no crédito, no botão *Criar orçamento*, nos títulos de painel, nos empty states e nas iniciais do avatar |
| 2 | A aba *Atendimento* fazia o oposto do kit: alertas sumiam quando vazios e o `AtendimentoTab` sempre caía no empty de "sem conversa" (a página nunca passa `conversation`) | Painel **Pendências deste cliente** com empty real (título + CTA *Agendar follow-up*); `AtendimentoTab` sai da página e fica só no `ProfileTabs`; a aba ganha contador de alertas |
| 3 | A **data** da última compra havia sumido (valor mostrava "há N dias", hint vazio) | Valor = data, hint = recência, como no kit |
| 4 | Curva ABC exibia só a letra; a string `abcShare` estava órfã no i18n | Chip "Curva B · 2,4%" (`ProfileBadges variant="detail"`) |
| 5 | 5 ações rápidas ghost, sem *Agendar* e sem *Transferir carteira* | As 6 do kit, com contorno e separadores em 3+2+1. *E-mail* sai da barra (segue clicável na banda de fatos) |
| 6 | Sub-abas flutuando acima de um bloco sem título | Movidas para o slot direito do header do painel |
| 7 | Chips mais fracos que o kit; positivado com `●/○` | Peso 700, tracking `.07em`, ícone `check-circle`/`circle-outline` |
| 8 | Avatar redondo tingido por hash do id | Quadrado `rounded-lg` com iniciais em `text-primary` (`shape="square"`) |
| 9 | Empty states de uma linha em caixa tracejada | `CustomerEmptyState`: ícone em caixa, título display uppercase, texto e CTA |
| 10 | Conteúdo das abas sem moldura | `CustomerPanel` — borda, header com título display e slot à direita |

## Primitivas novas

- `components/detail/CustomerPanel.tsx` — equivalente do `CrmPanel`: moldura, título em display e
  slot `right` (onde vivem as sub-abas). `flush` desliga o padding do corpo.
- `components/detail/CustomerEmptyState.tsx` — equivalente do `CrmEmpty`. **Não** substitui
  `TabEmptyState`, que continua servindo a ficha lateral e o preview da lista.

## Como a área congelada foi protegida

`ProfileBadges`, `CustomerAvatar`, `ProfileMenu`, `CustomerVehiclesList` e as quatro tabs
(`Quotes`, `Notes`, `Conversations`, `Recommendations`) são compartilhados com o `ProfileTabs` da
ficha do Atendimento. Nenhum teve o comportamento padrão alterado: todo o tratamento do kit entrou
por **prop opt-in** — `variant="detail"`, `shape="square"`, `headless`, `transferSignal` — com o
default byte-a-byte igual ao anterior.

## "Agendar retorno" ganhou destino real

O kit prevê a ação, mas o app não tinha para onde mandá-la: a data de retorno é campo do contato
da **Agenda** (`IContact.nextContactAt`), não do cliente, e `/app/agenda` não aceitava deep-link.
A rota passou a validar `?q=` e a `ContactsPage` consome o parâmetro como busca inicial — mesmo
padrão que `/app/atendimento` já usava. Sem isso, o botão seria mais um beco.

## Desvios conscientes do kit

1. **E-mail continua na banda de fatos** (o kit tem 6 fatos, a implementação tem 7). Decisão do
   dono: a informação vale o aperto da linha.
2. **Cores da Curva ABC preservadas** (A verde / B âmbar / C neutro). O kit pinta a curva de azul
   em todos os casos; a escala por classe informa mais e já era decisão da plataforma. O que foi
   adotado do kit é o **rótulo**, não a cor.
3. **Aba Cadastro não recebeu `CustomerPanel`** — `OverviewTab` já entrega os quatro painéis do
   kit (cadastrais, status/carteira, tags, portal); enquadrar de novo aninharia painel em painel.
4. **IDs de pedido/orçamento seguem em `font-mono`**, não em display. Eles são renderizados por
   `CustomerOrdersList`/`QuotesTab`, compartilhados com outras telas.
5. **O contador "5 de 12" saiu do header de Orçamentos** ao ligar `headless` — a contagem já
   aparece na aba e a lista tem paginação própria.

---

# Terceira passada — Direção B alternável (2026-08-13)

O kit oferece **duas** direções de cabeçalho e uma barra no rodapé do protótipo para alternar
entre elas. Essa barra é chrome do `CrmApp`, nunca foi para virar tela — mas a escolha de A sobre
B, feita em 10/08, foi feita **no protótipo, não na tela real com dados reais**. O dono pediu para
ver a B no app. A linha "Direção B — fora de escopo" acima está, portanto, **revogada**: ela
existe agora, alternável.

## Como alternar

Botão ao lado do menu ⋮, **visível apenas para Owner e Gestor** (`CustomerLayoutToggle`). A
escolha é persistida por navegador em `localStorage` (`gallo-customer-detail-layout`), então
atravessa clientes e reloads. É controle de avaliação, não configuração por vendedor: quando uma
direção for escolhida em definitivo, o toggle e o cabeçalho perdedor saem juntos.

## O que muda de uma para outra

| | A · Faixas (default) | B · Painel |
|---|---|---|
| Cabeçalho | 4 bandas empilhadas de largura total | 1 bloco de 2 colunas |
| Fatos | linha única com divisores | grade 2×4 sob o nome |
| Comercial | banda horizontal com sparkline na ponta | coluna direita: gráfico → 5 KPIs em grade → crédito |
| Altura | só a do conteúdo; bandas somem sozinhas | fixa — as colunas seguram a altura mesmo com pouco a dizer |
| Alertas | faixa de largura total | faixa de largura total (igual) |

## Como as duas não divergem

O risco óbvio de manter dois cabeçalhos é um dizer uma coisa e o outro dizer outra. Os dois
consomem **os mesmos construtores**, espelhando o `crmKpiCells` do kit:

- `detail/CustomerKpi.tsx` — `buildCustomerKpiCells(customer, openQuotes)` + a célula visual.
- `detail/customerFactCells.ts` — `buildCustomerFactCells(customer, sellerName, storeName)`.
- `detail/CustomerBreadcrumb.tsx` — a trilha, antes inline na banda de identidade.

A e B diferem em **arranjo**, nunca em conteúdo — que é exatamente o que o kit faz. As primitivas
(`CustomerFact`, `CustomerCreditCell`, `CustomerSparkline`, `CustomerAlertsBand`,
`CustomerQuickActions`, `ProfileBadges`, `ProfileMenu`) são as mesmas nas duas.

## Custo de manter as duas

Enquanto o toggle existir, toda mudança no cabeçalho precisa ser feita nos dois — mitigado pelos
construtores compartilhados, mas real no arranjo. **A decisão deveria ser tomada e o perdedor
removido**; não é estado final.
