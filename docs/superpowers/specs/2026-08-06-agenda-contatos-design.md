# Agenda — catálogo de contatos da operação (Fase 1)

**Data:** 2026-08-06
**Autor:** sessão de brainstorming com o dono
**Kit de referência:** `ui_kits/agenda/index.html` no projeto Claude Design
`0dddcf0e-782d-4f2e-be6c-0a094c427bbe` (arquivos `agd-ui.jsx`, `agd-shell.jsx`,
`agd-views.jsx`, `agd-panels.jsx`, `colors_and_type.css`)
**Branch:** `worktree-feat-agenda-contatos`

---

## 1. Problema

Hoje os contatos da operação não existem como registro próprio. Eles vivem espalhados:

- `customers.contact_name` — **um** nome de pessoa por cliente, preenchido em apenas
  700 dos 3.172 clientes;
- `leads` — 3.386 registros (3.385 não convertidos), que na prática já são "número que
  conversou com a gente e ainda não é cliente";
- na agenda do WhatsApp de cada vendedor, fora da plataforma.

Isso produz três buracos concretos:

1. **Não cabe mais de uma pessoa no mesmo cliente.** Uma transportadora tem comprador,
   gerente de frota e financeiro — o schema atual guarda um só. O kit escancara o caso:
   Marlene (Compras) e Volnei (Gerente de frota) na mesma Transportes Fronteira Oeste.
2. **Não há dono, etiqueta nem opt-out por pessoa.** Tudo isso hoje é por cliente ou por
   lead, nunca pela pessoa que efetivamente atende o telefone.
3. **Não há LGPD por pessoa.** Opt-out é um atributo de quem recebe a mensagem, não da
   empresa.

## 2. Objetivo

Criar a **Agenda**: o catálogo de contatos da operação, onde o contato é a **pessoa ou o
número**, vinculado a um cliente ou solto, com dono, etiquetas, histórico e opt-out.

Não-objetivos desta fase (ver §10): triagem dos soltos, importação de CSV, mesclagem de
duplicados, envio em massa e sincronização com a agenda do WhatsApp.

## 3. Decisões tomadas

Três decisões governam o resto do documento. Todas foram tomadas pelo dono durante o
brainstorming.

### 3.1 Tabela `contacts` própria, `leads` intactos

O contato vira entidade de primeira classe, com N contatos por cliente. `customers` e
`leads` **não mudam de forma alguma** — nenhuma coluna, nenhuma policy, nenhum consumidor.

Alternativas descartadas e por quê:

- *Agenda como visão de leitura sobre `customers` + `leads`* — não suporta duas pessoas no
  mesmo cliente, que é exatamente o caso que motiva a tela, nem etiqueta/dono/opt-out por
  pessoa.
- *`contacts` absorve `leads`* — modelo mais limpo no destino, mas obrigaria a mexer em
  webhook de criação de lead, funis, SDR e na RLS do pool: áreas em produção, com
  histórico de incidentes. Custo desproporcional para a Fase 1.

**Consequência aceita:** o mesmo número aparece na Agenda e na tela de Leads. O dono
aprovou explicitamente. `contacts.lead_id` mantém a origem rastreável, o que deixa a porta
aberta para unificar depois sem migração cega.

### 3.2 Fase 1 = núcleo navegável

Entra: tabela + RLS + backfill + provider + tela principal (cards e tabela, filtros,
busca, colunas, paginação) + gaveta de detalhe + vincular a cliente + etiquetas +
responsável + opt-out + ações em massa.

### 3.3 Backfill de clientes **e** leads

A Agenda nasce com ~5.363 contatos, e o escopo "Sem cliente" já nasce com fila para a
Triagem da Fase 2.

## 4. Números reais da base (apurados em 2026-08-06, produção)

| Medida | Valor |
|---|---|
| Clientes | 3.172 |
| Clientes com telefone **não vazio** | 1.978 |
| Clientes com `contact_name` preenchido | 700 |
| Clientes marcados `pending_review` | 2 |
| Leads | 3.386 |
| Leads não convertidos | 3.385 |
| Leads com e-mail | 41 |
| Números distintos entre leads | 3.374 |
| Conversas | 4.253 (só 1 sem vínculo) |

Verificações que mudam o desenho do backfill:

- **Leads que colidem exatamente com o telefone de um cliente: 0.** O backfill nasce sem
  duplicata cruzada.
- **Leads que colidem por variação do 9º dígito: 4.** Volume irrisório; não bloqueia o
  backfill, entra na fila de duplicados da Fase 3.
- **Clientes que compartilham o mesmo telefone: 70.** Cada um vira seu próprio contato
  (são clientes distintos) e o par vai para a fila de duplicados da Fase 3.

> Atenção a uma armadilha já encontrada: `phone is not null` devolve 3.170, mas 1.192
> desses são string vazia. O critério do backfill é **telefone não vazio** — 1.978.

## 5. Modelo de dados

### 5.1 Tabela `public.contacts`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `store_id` | `uuid` NOT NULL → `stores` | multi-loja desde o modelo |
| `name` | `text` NOT NULL | número cru quando não há nome de perfil |
| `role` | `text` NULL | cargo/função ("Compras", "Gerente de frota") |
| `phone` | `text` NULL | formatado para exibição |
| `phone_digits` | `text` NULL | só dígitos; alimenta busca e dedupe |
| `email` | `text` NULL | |
| `city` / `uf` | `text` NULL | |
| `customer_id` | `uuid` NULL → `customers` `ON DELETE SET NULL` | **NULL = contato solto** |
| `lead_id` | `uuid` NULL → `leads` `ON DELETE SET NULL` | origem quando veio de lead |
| `owner_seller_id` | `uuid` NULL → `sellers` `ON DELETE SET NULL` | responsável |
| `tags` | `text[]` NOT NULL DEFAULT `'{}'` | |
| `source` | `text` NOT NULL DEFAULT `'manual'` | `whatsapp \| dintec \| manual \| csv \| balcao \| portal_b2b \| storefront` |
| `opt_out` | `boolean` NOT NULL DEFAULT `false` | LGPD |
| `opt_out_at` | `timestamptz` NULL | |
| `opt_out_by` | `uuid` NULL → `sellers` | quem marcou |
| `next_contact_at` | `timestamptz` NULL | agendar retorno |
| `next_contact_note` | `text` NULL | motivo do retorno |
| `last_contact_at` | `timestamptz` NULL | |
| `has_whatsapp` | `boolean` NOT NULL DEFAULT `false` | |
| `division` | `text` NOT NULL DEFAULT `'parts'` | padrão transversal do projeto |
| `created_at` / `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

`phone_digits` é mantido por trigger na escrita, espelhando o que `customers` já faz —
não por coluna gerada, para permitir correção manual em backfill.

### 5.2 Índices

- `(store_id)` — toda query é store-scoped
- `(store_id, phone_digits)` — busca por dígitos e futura dedupe
- `(customer_id)` — aba de contatos na ficha do cliente e escopo "Vinculados"
- `(owner_seller_id)` — filtro Responsável e o branch de dono na RLS
- `(store_id, opt_out)` — escopo Opt-out
- `(lead_id)` — rastreabilidade da origem

### 5.3 RLS

Espelha `customers` **exatamente**, inclusive na forma:

```sql
-- SELECT
store_id = (SELECT current_store_id())
AND (
  (SELECT is_staff())
  OR owner_seller_id = (SELECT current_seller_id())
  OR customer_id IN (SELECT seller_accessible_customer_ids())
)

-- INSERT / UPDATE / DELETE
store_id = (SELECT current_store_id())
AND ((SELECT is_staff()) OR owner_seller_id = (SELECT current_seller_id()))
```

Dois cuidados que já custaram incidente neste projeto e por isso são requisito, não estilo:

1. Os helpers ficam envoltos em `(SELECT …)` para o planner tratá-los como InitPlan e
   avaliá-los **uma vez**, não por linha. Um helper booleano solto na policy roda por
   linha e já provocou storm de `statement_timeout` (o `authenticated` tem timeout de 8s).
2. O acesso derivado usa `seller_accessible_customer_ids()`, que é **SET-RETURNING**,
   consumido via `IN`. Não substituir por um helper booleano por contato.

## 6. Arquitetura da aplicação

### 6.1 Estrutura de arquivos

Código em inglês, UI em português — a convenção do repositório. Pasta `contacts`, tela
"Agenda", rota `/app/agenda`.

```
src/features/contacts/
├── index.ts                          barrel público
├── pages/ContactsPage.tsx            estado: filtros, seleção, gaveta, modais, toasts
├── components/
│   ├── list/
│   │   ├── ContactsHeader.tsx        header em vidro, busca "/", cards|tabela, Novo contato
│   │   ├── ContactsFiltersBar.tsx    escopo com contagem + 5 selects
│   │   ├── ContactsBulkBar.tsx       ações em massa
│   │   ├── ContactCard.tsx           card de 11 campos
│   │   ├── ContactsGrid.tsx          grade auto-fill
│   │   ├── ContactsTable.tsx         tabela densa
│   │   ├── ContactsColumnsMenu.tsx   colunas visíveis (botão + clique-direito)
│   │   ├── ContactsPagination.tsx    "Mostrando x–y de N"
│   │   └── ContactsEmptyState.tsx    vazio por filtro
│   ├── detail/ContactDrawer.tsx      gaveta: contato, vínculo, etiquetas, dono,
│   │                                 agendar retorno, interações, LGPD
│   └── modals/
│       ├── NewContactModal.tsx
│       ├── LinkCustomerModal.tsx
│       ├── AddTagModal.tsx · RemoveTagModal.tsx
│       ├── TransferOwnerModal.tsx
│       ├── OptOutModal.tsx
│       └── ExportContactsModal.tsx
├── engine/                           lógica pura, testada com Vitest
│   ├── contactFilters.ts   (+ .test.ts)
│   ├── contactInitials.ts  (+ .test.ts)
│   └── contactScopes.ts    (+ .test.ts)
├── hooks/useContacts.ts
└── i18n/pt-BR.ts
```

Integrações fora da feature:

- `src/shared/types/contacts.ts` — `IContact`, exportado pelo barrel de types
- `src/providers/data/contracts/contacts.ts` — `IContactsProvider`
- `src/providers/data/impl/mock/contacts.ts` e `impl/supabase/contacts.ts`
- registro em `src/providers/data/factory.ts` + barrel `@/providers/data`
- `src/mocks/api/contacts.ts` + generator determinístico por seed
- `src/features/rbac/permissions/resources.ts` — novo literal `"contact"`, mais as
  entradas por papel em `matrix.ts` e no `seed.ts`
- `src/features/shell/config/routes.ts` — `APP_AGENDA`
- `src/features/shell/config/navigation.ts` — item no grupo **Atendimento**, entre
  Clientes e Leads, `permission: { resource: "contact" }`
- `src/routes/app.agenda.tsx` — rota file-based (`routeTree.gen.ts` é **gerado**, nunca
  editado à mão)

### 6.2 Contrato do provider

```ts
export interface IContactsProvider {
  list(params?: IListContactsParams): Promise<IPaginatedResult<IContact>>;
  get(id: ID): Promise<IContact>;
  create(input: Omit<IContact, "id" | "createdAt" | "updatedAt">): Promise<IContact>;
  update(id: ID, patch: Partial<IContact>): Promise<IContact>;
  delete(id: ID): Promise<void>;

  /** Vincula/desvincula um contato a um cliente. customerId null = desvincular. */
  linkToCustomer(id: ID, customerId: ID | null): Promise<IContact>;
  /** Alterna opt-out registrando autor e data (LGPD). */
  setOptOut(id: ID, optOut: boolean): Promise<IContact>;
  /** Agenda retorno: data + motivo. */
  scheduleFollowUp(id: ID, at: string, note?: string): Promise<IContact>;

  /** Ações em massa — retornam a contagem efetivamente afetada. */
  bulkAddTag(ids: ID[], tag: string): Promise<number>;
  bulkRemoveTag(ids: ID[], tag: string): Promise<number>;
  bulkTransferOwner(ids: ID[], ownerSellerId: ID | null): Promise<number>;
  bulkSetOptOut(ids: ID[], optOut: boolean): Promise<number>;

  /** Contagem por escopo para os chips da barra de filtros. */
  counts(params?: IListContactsParams): Promise<IContactScopeCounts>;
}
```

`IListContactsParams` cobre: `storeId`, `scope` (`todos | vinculados | soltos | optout`),
`search`, `ownerSellerIds`, `tags`, `city`, `uf`, `sources`, `lastContactBucket`,
`orderBy`, `orderDir`, `page`, `pageSize`.

**Paginação é server-side.** Com 5.363 registros e `statement_timeout` de 8s no papel
`authenticated`, trazer tudo para o cliente é o caminho conhecido para o timeout. As
contagens por escopo vêm de `counts()`, não de contar o array carregado.

**Truncamento silencioso:** o provider e o consumidor são as duas metades desse bug. O
`list()` respeita `pageSize` e devolve `total` real; a tela usa `total` para a paginação e
para o "Selecionar todos os N filtrados", nunca `rows.length`.

### 6.3 Auditoria

Registram trilha via `auditLogger`: vínculo/desvínculo, transferência de responsável,
opt-out (individual e em massa) e exportação. O opt-out e a exportação são exigências de
LGPD e a própria UI promete o registro ao usuário — a promessa precisa ser verdadeira.

## 7. Fidelidade à UI de referência

O kit foi desenhado no tema **Black Gold**, que é o codename do tema `diesel` — o tema
padrão do app (`src/config/themes.ts:44`, accent `#C9A24A`). Por isso não há conflito
entre fidelidade visual e a regra de tokens semânticos do projeto:

- **layout, densidade, hierarquia, espaçamento e comportamento** saem 1:1 do kit;
- **cores** vêm exclusivamente de tokens semânticos (`bg-card`, `text-foreground`,
  `border-border`, `text-severity-*`). Nenhum hex do kit, nenhuma referência a `--gallo-*`,
  nenhuma constante `AGD`.

Itens replicados, com o detalhe que precisa sobreviver à tradução:

**Grade e card**
- grade `repeat(auto-fill, minmax(330px, 1fr))`, gap 14px, padding 16px
- avatar 40px com iniciais; número puro vira `#`
- nome em fonte display, uppercase; abaixo, `cargo · origem`
- checkbox em opacidade 0,32 que sobe para 1 no hover ou quando selecionado
- faixa vertical vermelha de 3px à esquerda quando `opt_out`
- bloco de vínculo: dourado sólido com nome do cliente **ou** tracejado azul "Sem cliente"
  com ação **Vincular** no próprio card
- três linhas ícone+texto: telefone (com ícone verde quando há WhatsApp), e-mail ("sem
  e-mail" apagado quando ausente), cidade/UF
- chips: Opt-out, Duplicado?, e até 3 etiquetas — **1 só** quando em opt-out; "sem
  etiquetas" quando não houver nenhuma
- rodapé: avatar do responsável + último contato à esquerda; à direita as 4 ações rápidas
  (conversa, ligar, agendar retorno, mais). A ação de conversa fica **desabilitada** em
  opt-out
- hover: `translateY(-2px)` + sombra

**Header em vidro** (§1 das ux-guidelines)
- fundo translúcido com `backdrop-blur`, título, contagem total
- busca com largura dinâmica 280px → 520px no foco, atalho `/`, `kbd` que some no foco,
  `Escape` para desfocar
- alternância cards/tabela, menu Manutenção, botão dourado **Novo contato**

**Filtros**
- escopos Todos · Vinculados · Sem cliente · Opt-out, cada um com contagem
- selects Responsável, Etiqueta, Cidade/UF, Origem, Último contato — que ficam dourados
  quando ativos; "Limpar filtros" aparece só quando há filtro

**Tabela densa** (§4 das ux-guidelines)
- as 11 colunas do kit, cabeçalho sticky
- **delimitadores verticais somente no header**
- ordenação por clique no cabeçalho
- menu de colunas visíveis no **clique-direito do cabeçalho** (`ContextMenu` com "Colunas
  visíveis" + "Exibir todas") e também pelo botão do header
- colunas redimensionáveis via `@/shared/hooks/useResizableColumns`, persistidas em
  `gallo-contacts-column-widths`

**Demais**
- `ScrollProgressBar` na divisa do bloco fixo (§2 das ux-guidelines)
- paginação "Mostrando x–y de N" + seletor de tamanho de página
- gaveta lateral de 440px com as seções Contato, Vínculo, Etiquetas, Responsável, Agendar
  retorno, Últimas interações e LGPD
- barra de ações em massa que só aparece com seleção, com "Selecionar todos os N filtrados"

### 7.1 Desvios conscientes do kit

Alguns elementos do kit dependem de infraestrutura de fases posteriores. Em vez de
renderizar botão morto, eles ficam fora da Fase 1:

| Elemento do kit | Decisão | Volta em |
|---|---|---|
| **Envio em massa** na barra de ações | omitido; as outras 5 ações ficam | Fase 4 |
| Menu **Manutenção** → Importar CSV | omitido; menu fica só com Exportar | Fase 3 |
| Menu **Manutenção** → Sincronizar WhatsApp | omitido | Fase 4 |
| Botão **Triar N sem cliente** | omitido; o escopo "Sem cliente" cobre o caminho | Fase 2 |
| Botão **N duplicados prováveis** | omitido; não há detecção ainda | Fase 3 |

O dono pode inverter para "visível porém desabilitado" se preferir o kit pixel-a-pixel.

## 8. Backfill

Migration própria, idempotente, rodando em duas fontes:

**Fonte A — clientes (1.978 contatos vinculados)**
Um contato por cliente com telefone não vazio:
- `name` = `contact_name` quando preenchido (700 casos, pessoa real); senão o nome de
  exibição do cliente (`nome_fantasia` → `razao_social` → `full_name`), entrando como
  contato da empresa
- `customer_id` = cliente; `owner_seller_id` = `customers.seller_id`
- `source` = `dintec` quando `dintec_codcli` presente, senão `manual`
- `phone`, `email`, cidade/UF vindos do cliente; `last_contact_at` = `last_purchase_at`
- `has_whatsapp` = `whatsapp_status` indica número válido

**Fonte B — leads (3.385 contatos soltos)**
Um contato por lead não convertido:
- `customer_id` NULL, `lead_id` = lead, `owner_seller_id` = `leads.seller_id`
- `name`, `phone`, `email` do lead; `source` derivado de `leads.origin`
- `last_contact_at` = `leads.updated_at`

**Regras de segurança do backfill**
- idempotente: reexecutar não duplica (guarda por `customer_id`/`lead_id` já materializado)
- os 4 casos de colisão por 9º dígito e os 70 clientes com telefone repetido **não** são
  mesclados nem descartados: entram normalmente e ficam marcados para a fila de duplicados
  da Fase 3. Mesclar automaticamente sem revisão humana é como se perde histórico
- os 2 `pending_review` entram como qualquer outro cliente; volume irrelevante

> **Regra de infra do projeto:** todo `apply_migration` via MCP precisa ser exportado para
> `supabase/migrations/` no mesmo PR. **Mergear o PR não aplica a migration** — a aplicação
> em produção é manual e exige OK explícito do dono. O backfill toca 5.363 linhas novas e
> por isso é candidato a rodar com o dono acompanhando.

## 9. Testes

Lógica de negócio pura em `engine/`, com Vitest, escrita antes da implementação:

- `contactFilters` — escopo × busca × filtros combinados; busca casa nome, telefone
  (formatado **e** só dígitos), e-mail, empresa, cargo e cidade
- `contactInitials` — nome comum, nome único, nome com parênteses, número puro → `#`,
  string vazia
- `contactScopes` — contagens por escopo, incluindo o caso "opt-out também é vinculado"
  (um contato pode contar em mais de um escopo, exceto Todos)

Gate de CI: `bun run build` + `bun run test`. `bun run build` **não** faz type-check;
`bunx tsc --noEmit` roda à parte e é avaliado por *delta*, já que existe baseline de erros
pré-existentes no repositório.

## 10. Fora de escopo (fases seguintes)

| Fase | Conteúdo |
|---|---|
| 2 | **Triagem** — fila dos soltos um a um, sugestão de vínculo com motivo e confiança, mensagem que originou o contato, atalhos de teclado, abas Sem cliente/Duplicados/Ignorados |
| 3 | **Importar CSV** com mapeamento de colunas e duplicados para revisão; **mesclagem de duplicados** (9º dígito, e-mail repetido, telefone compartilhado) |
| 4 | **Envio em massa** com respeito a opt-out e janela de 24h; **sincronizar WhatsApp** reaproveitando `providers/whatsapp/import/contacts-core.ts` (que enriquece nome, nunca cria registro) |

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Mesmo número visível na Agenda e em Leads confunde o usuário | Aceito pelo dono. `lead_id` mantém a origem explícita; a gaveta mostra que o contato veio de um lead |
| Timeout na listagem com 5.363 registros | Paginação server-side, contagens via `counts()`, índices em `store_id`/`phone_digits`/`customer_id`/`owner_seller_id` |
| RLS com helper por linha degradando a query | Helpers em `(SELECT …)` e acesso derivado SET-RETURNING via `IN`, espelhando `customers` |
| Backfill criar contato indevido | Idempotente, com guarda por origem; nenhuma mesclagem automática |
| Migration mergeada mas não aplicada dar impressão de entrega | Migration exportada para `supabase/migrations/`; aplicação em produção anunciada como passo manual do dono |
| Tradução do kit trazer hex hardcoded | Revisão final varrendo a feature por hex e por constantes de paleta; só tokens semânticos |

## 12. Critérios de aceite

1. `/app/agenda` lista contatos reais com paginação server-side, em cards e em tabela.
2. Busca por `/` encontra por nome, telefone formatado, telefone só dígitos, e-mail,
   empresa, cargo e cidade.
3. Escopos Todos/Vinculados/Sem cliente/Opt-out exibem contagem correta vinda do servidor.
4. Um cliente com duas pessoas mostra **duas** entradas distintas na Agenda.
5. Vincular um contato solto a um cliente reflete no card, na gaveta e na contagem dos
   escopos, e grava trilha de auditoria.
6. Opt-out marca o contato, aplica a faixa vermelha, desabilita a ação de conversa e grava
   auditoria com autor e data.
7. Ações em massa (etiquetar, remover etiqueta, transferir, opt-out, exportar) operam sobre
   a seleção e sobre "todos os N filtrados".
8. Colunas visíveis abrem no clique-direito do cabeçalho e as larguras persistem entre
   sessões.
9. Um vendedor não-staff enxerga apenas contatos que possui ou cujos clientes estão na sua
   carteira.
10. `bun run build` e `bun run test` passam; `bunx tsc --noEmit` não acrescenta erro novo.
