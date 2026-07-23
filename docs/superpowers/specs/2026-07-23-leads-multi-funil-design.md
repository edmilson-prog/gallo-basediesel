# Leads — múltiplos funis, acesso por usuário e redesign da página

> **Status:** aprovado pelo dono (2026-07-23) · **Branch:** `feat/leads-multi-funil`
> **Escopo:** feature `leads`, nova feature `funnels`, painel direito do Atendimento, tela de administração
> **Consultoria UI/UX:** relatório do agente `design-funis` (skill `ui-ux-pro-max`), incorporado
> **Mocks:** artifact publicado em 2026-07-23 (três padrões de navegação, ficha, admin, card antes/depois)

---

## 1. Problema

A página de Leads opera sobre **um único pipeline por loja**, materializado como
`IPlatformSettings.pipelineStages` (`src/shared/types/platform.ts:248`) — um array de 5 etapas
guardado no jsonb `stores.settings`. Cada lead carrega um **snapshot** dessa etapa em
`ILead.stage` (`src/shared/types/lead.ts:41`), persistido como coluna jsonb `leads.stage`.

A distribuidora trabalha linhas de produto distintas (catalisador, filtros, módulos) com ciclos,
etapas e responsáveis diferentes. Um pipeline só não modela isso, e não existe forma de restringir
que vendedor enxerga que linha.

Somam-se problemas independentes da tela, todos verificados no código:

| Problema | Evidência |
|---|---|
| 903 de 957 leads numa coluna só | dado de produção, visão Kanban |
| Todos os leads carregados e filtrados no cliente | `hooks/useLeadsList.ts:37-52` (`pageSize: 1000`) e `:54-168` |
| Coluna renderiza todos os cards, sem teto | `components/kanban/KanbanColumn.tsx:75-91` |
| Barra de métricas exibe 0/0/0 por construção | `utils/leadMetrics.ts:39-63` calcula sobre `converted`, que `useLeadsList.ts:71` já removeu |
| Etapa de fechamento é constante hardcoded | `utils/leadDisplay.ts:157`, consumida em `kanban/LeadsKanban.tsx:88` e `leadMetrics.ts:43` |
| Sem caminho por teclado para mover lead | `kanban/LeadsKanban.tsx:53-110` usa HTML5 DnD nativo |
| Cor de etapa (hex livre do banco) usada como cor de texto | `LeadProfileFiche.tsx:261`, `LeadsList.tsx:127-129` — o `#5b6b7a` do seed rende ~2,5:1 no modo escuro, reprova WCAG AA |
| Header fora do padrão de UX do projeto | `LeadsHeader.tsx:31` sem glassmorphism; `:46-51` busca sem `/`, sem `type="search"`, largura fixa |

## 2. Decisões

Fechadas com o dono antes do desenho. Cada uma elimina um grau de liberdade.

| # | Decisão | Alternativa descartada |
|---|---|---|
| 1 | **Um lead participa de N funis**, com etapa independente em cada | 1:1 com troca de funil |
| 2 | **Acesso por usuário nominal** por funil; Owner/Gestor sempre veem tudo | por departamento; híbrido |
| 3 | **Funil `Geral`** de triagem recebe todo lead novo e os 957 existentes | bandeja sem funil; regra automática por origem |
| 4 | **Acesso restringe, não amplia** — o funil filtra a carteira do próprio vendedor | funil como espaço compartilhado de time |
| 5 | **Multi-funil e redesign na mesma entrega** | fatiar em duas |
| 6 | **Conversão é por participação** — fechar catalisador não encerra filtros | conversão do lead inteiro |
| 7 | **Os três padrões de navegação são implementados**, escolhíveis pelo usuário e gravados no navegador | eleger um |

Decorrências aprovadas junto:

- **Forecast e analytics contam por participação.** Um lead em catalisador e filtros gera duas
  linhas de previsão, porque são duas receitas distintas.
- **`seller_id` é desnormalizado** na tabela de participação, sincronizado por trigger — performance
  de RLS acima de pureza de modelagem (§3.3).
- **A rota de administração substitui** `configuracoes/atendimento/pipeline`, hoje somente-leitura.

## 3. Modelo de dados

### 3.1 Tabelas

Quatro tabelas novas em `public`. Nenhuma alteração destrutiva em `leads`.

```sql
create table public.lead_funnels (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  name         text not null,
  description  text,
  accent       smallint not null check (accent between 0 and 8),  -- 0 = neutro (Geral)
  icon         text not null,                                     -- id iconify, ex.: "mdi:air-filter"
  position     int  not null,
  is_default   boolean not null default false,
  -- limite de acúmulo da etapa `entrada`, a partir do qual a coluna troca para
  -- o modo triagem (§7.7). Por funil, editável por staff na aba Geral.
  entry_alert_threshold int not null default 50 check (entry_alert_threshold > 0),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index lead_funnels_one_default_per_store
  on public.lead_funnels (store_id)
  where is_default and archived_at is null;

create index lead_funnels_store_position_idx
  on public.lead_funnels (store_id, position)
  where archived_at is null;
```

```sql
create type public.lead_funnel_stage_kind as enum ('entrada','aberta','ganho','perda');

create table public.lead_funnel_stages (
  id         uuid primary key default gen_random_uuid(),
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  name       text not null check (char_length(name) <= 24),
  accent     smallint not null check (accent between 0 and 8),
  position   int  not null,
  kind       public.lead_funnel_stage_kind not null default 'aberta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- exatamente uma etapa de cada tipo terminal por funil
create unique index lead_funnel_stages_one_entrada on public.lead_funnel_stages (funnel_id) where kind = 'entrada';
create unique index lead_funnel_stages_one_ganho   on public.lead_funnel_stages (funnel_id) where kind = 'ganho';
create unique index lead_funnel_stages_one_perda   on public.lead_funnel_stages (funnel_id) where kind = 'perda';
create unique index lead_funnel_stages_unique_name on public.lead_funnel_stages (funnel_id, lower(name));
```

O limite de 24 caracteres é imposto aqui, não na UI: nome longo quebra o cabeçalho da coluna do
kanban, e a restrição precisa valer para qualquer caminho de escrita.

```sql
create table public.lead_funnel_entries (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  stage_id   uuid not null references public.lead_funnel_stages(id),

  -- desnormalizados para RLS barata (ver 3.3); sincronizados por trigger
  store_id   uuid not null,
  seller_id  uuid,

  converted_to_customer_id uuid references public.customers(id),
  loss_reason text,
  loss_notes  text,

  entered_stage_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index lead_funnel_entries_unique on public.lead_funnel_entries (lead_id, funnel_id);
create index lead_funnel_entries_board_idx     on public.lead_funnel_entries (funnel_id, stage_id, seller_id);
create index lead_funnel_entries_lead_idx      on public.lead_funnel_entries (lead_id);
create index lead_funnel_entries_owner_idx     on public.lead_funnel_entries (store_id, seller_id);
```

`entered_stage_at` existe porque hoje "dias na etapa" é derivado de `updatedAt`
(`utils/leadDisplay.ts`, `leadMetrics.ts:27-36`), o que é um proxy ruim: qualquer edição do lead
zera a conta. Com a participação, o dado passa a ser real e por funil.

```sql
create table public.lead_funnel_access (
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  seller_id  uuid not null references public.sellers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (funnel_id, seller_id)
);

create index lead_funnel_access_seller_idx on public.lead_funnel_access (seller_id);
```

### 3.2 RLS

`lead_funnels` e `lead_funnel_stages` — leitura para toda a loja, escrita só para staff:

```sql
-- select
store_id = (select public.current_store_id())

-- insert / update / delete
store_id = (select public.current_store_id()) and (select public.is_staff())
```

Ler a existência de um funil não é sigiloso — o que é sigiloso são os leads dentro dele. Manter a
leitura aberta simplifica a resolução de nomes na ficha e evita um join gated para cada rótulo.

`lead_funnel_entries` — espelha exatamente a semântica de `leads`:

```sql
-- select
store_id = (select public.current_store_id())
and (
  (select public.is_staff())
  or seller_id = (select public.current_seller_id())
)

-- insert / update / delete: mesma expressão em using + with check
```

**O filtro por funil acessível não entra na policy.** Ele é aplicado na consulta do board
(§5.2). Essa é a tradução literal da decisão 4: o funil restringe a *visualização*, não a
existência. A consequência desejada é que o vendedor dono de um lead num funil que ele não acessa
**continua enxergando esse lead** na visão Lista, com a participação marcada como bloqueada — o
lead nunca some sem explicação. Nenhum dado de terceiro vaza, porque a cláusula de dono não foi
alterada.

`lead_funnel_access` — leitura da própria linha para todos, leitura completa e escrita para staff:

```sql
-- select
seller_id = (select public.current_seller_id()) or (select public.is_staff())

-- insert / delete
(select public.is_staff())
```

### 3.3 Desnormalização e trigger

`store_id` e `seller_id` em `lead_funnel_entries` duplicam colunas de `leads`. É deliberado.

O projeto já pagou duas vezes o preço de RLS que resolve por linha: o modelo de acesso a conversas
(`docs/dev/conversation-access-model.md`, v0.110.0 `Turnstile`) e a assinatura de mídia
(v0.111.0 `Aperture`, 2.375 ms → 7 ms). Uma policy em `lead_funnel_entries` que consultasse `leads`
por linha repetiria o erro no board inteiro, onde a consulta devolve centenas de linhas por
carregamento.

**Risco:** dessincronização quando `leads.seller_id` muda (transferência de carteira, atribuição
pela fila de rodízio). **Mitigação:**

```sql
create or replace function public.sync_lead_funnel_entries_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.seller_id is distinct from old.seller_id or new.store_id is distinct from old.store_id then
    update public.lead_funnel_entries
       set seller_id = new.seller_id, store_id = new.store_id, updated_at = now()
     where lead_id = new.id;
  end if;
  return new;
end $$;

create trigger leads_sync_funnel_entries
  after update of seller_id, store_id on public.leads
  for each row execute function public.sync_lead_funnel_entries_owner();
```

A suíte `supabase/tests/rls-regression.sql` ganha um caso que troca o dono de um lead e verifica que
todas as participações acompanharam.

### 3.4 Migração dos dados existentes

Uma migration, uma transação, idempotente:

1. **Cria o funil `Geral`** por loja: `accent = 0` (neutro), `icon = 'mdi:inbox-outline'`,
   `is_default = true`, `position = 0`.
2. **Materializa as etapas** lendo `stores.settings->'pipelineStages'` de cada loja — não depende do
   frontend. Mapeamento de `kind`:
   - menor `order` → `entrada`
   - a etapa cujo id é `stage-fechado` (o `CLOSING_STAGE_ID` atual) → **desdobra em duas**:
     `Convertido` (`ganho`) e `Perdido` (`perda`), porque hoje uma única etapa acumula os dois
     desfechos
   - demais → `aberta`
   - `color` hex → `accent` pelo mapa de aproximação em `scripts/`; lojas sem `pipelineStages`
     recebem o conjunto padrão
3. **Cria uma participação por lead**, preservando: etapa (pelo `stage.id` do snapshot),
   `seller_id`, `store_id`, `converted_to_customer_id`, `loss_reason`, `loss_notes`.
   Lead convertido → etapa `ganho`; lead com `loss_reason` → etapa `perda`.
   `entered_stage_at = leads.updated_at` (melhor aproximação disponível).
4. **`leads.stage` vira legado**: permanece na tabela, deixa de ser escrito. Remoção fica para uma
   migration posterior, depois de um ciclo de produção estável.

Verificação obrigatória ao fim: `count(lead_funnel_entries) = count(leads)` por loja.

## 4. Sistema de cor por funil e por etapa

### 4.1 O problema e o reenquadramento

O projeto proíbe cor literal em componente (PRD-001): tudo consome tokens semânticos, porque a
mesma tela roda em `data-theme` × `data-mode` (4 × 2). Mas a cor do funil é escolha do usuário.

A tensão é aparente. O usuário não escolhe *uma cor*; escolhe **qual das identidades do sistema**
aquele funil ocupa. O dado persistido é um **slot enumerado**, não um hex:

```ts
accent: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8   // 0 = neutro, reservado ao funil Geral
```

O componente continua consumindo apenas tokens. O que é dinâmico é *qual* token, não o valor dele.

### 4.2 Implementação em `src/styles.css`

Nas três camadas já existentes:

```css
/* 1 — primitivos */
:root { --gallo-accent-1: …; /* … */ --gallo-accent-8: …; }

/* 2 — @theme inline (gera as utilities) */
--color-accent-1: var(--accent-1);
/* … */
--color-accent-8: var(--accent-8);

/* 3 — cada [data-theme] × .light|.dark reescreve os 8 semânticos */
```

São 8 × 4 × 2 = **64 valores calibrados uma vez**. Trabalho finito e auditável, ao contrário de hex
livre, que é infinito e inauditável.

No componente, **mapa de literais é obrigatório** — Tailwind v4 não gera classe montada por
template string:

```ts
// src/features/funnels/utils/accentClasses.ts
export const ACCENT_CLASSES: Record<number, { dot: string; chip: string; border: string; bar: string }> = {
  0: { dot: "bg-muted-foreground", chip: "bg-muted",      border: "border-border",   bar: "bg-muted-foreground" },
  1: { dot: "bg-accent-1",         chip: "bg-accent-1/12", border: "border-accent-1", bar: "bg-accent-1" },
  // … 2 a 8
};
```

### 4.3 A regra que garante acessibilidade

> **O accent nunca é a cor de um texto que precise passar em contraste AA.**

| Superfície | Uso | Limiar | Como passa |
|---|---|---|---|
| Ponto de 8px | `bg-accent-N` sólido | 3:1 (não-textual) | calibração |
| Borda / barra 2–3px | `border-accent-N` | 3:1 | calibração |
| Chip de funil | `bg-accent-N/12` + `text-foreground` | 4,5:1 | o texto é `foreground` |
| Nome do funil | **`text-foreground`, sempre** | 4,5:1 | por construção |
| Ícone ≥16px com rótulo ao lado | `text-accent-N`, `aria-hidden` | decorativo | não se aplica |

**Redundância não-cromática:** o ícone é **obrigatório** por funil e é o portador do significado; a
cor é reforço periférico. Quem não distingue cores lê pelo ícone e pelo nome.

A rota `/design-system`, que já tem validador de contraste WCAG, ganha a grade dos 8 accents × 4
temas × 2 modos como caso de teste visual.

### 4.4 Regras de uso

**Faz:**
- 8 slots é teto proposital. O nono funil repete um accent — o ícone diferencia. Não aumentar para
  12 ou 16: acima de 8 os tons ficam indistinguíveis em visão periférica e a calibração salta para
  128 valores.
- Sugestão automática do primeiro slot livre na criação.
- Picker de ~24 ícones `mdi:` curados do domínio de peças pesadas (filtro, turbo, injeção, freio,
  correia, suspensão, elétrica, módulo…).
- Funil `Geral` com `accent = 0` (neutro) e `mdi:inbox-outline`. Com 903 leads, um accent forte
  faria o Geral dominar cromaticamente trilho, abas, seletor, cards e ficha, afogando os funis que
  importam.

**Não faz:**
- Persistir hex, em funil ou etapa.
- `style={{ color }}` / `style={{ borderColor }}` — mata tema, modo escuro e contraste. É o bug que
  existe hoje em `LeadCard.tsx:53-55`, `KanbanColumn.tsx:55-59`, `LeadsList.tsx:127-129`,
  `LeadProfileFiche.tsx:261`.
- Classe por template string (`` `bg-accent-${n}` ``).
- Color picker livre.
- Reaproveitar as cores de severidade como accent de funil — elas significam estado; um funil
  "vermelho-crítico" mata a força de todo alerta real da tela.
- Colorir superfície grande por funil (fundo do board, header).
- Colorir o nome do funil, em lugar nenhum.
- Sinalizar item ativo só por cor: peso tipográfico + barra indicadora + `aria-current`; cor é o
  terceiro reforço.

### 4.5 Dívida paga junto

`IPipelineStage.color` é hex livre já em produção, usado como cor de **texto** em
`LeadProfileFiche.tsx:261` e `LeadsList.tsx:127-129`. O `#5b6b7a` do seed rende ~2,5:1 sobre o card
no modo escuro — reprova AA sem correção possível. A migração para `accent` conserta funil e etapa
com a mesma mudança.

Também sai a paleta Tailwind crua de `utils/leadDisplay.ts:15-29` (temperatura), `:42-70` (origem) e
`:115-139` (próxima ação), que usa `sky-500`/`amber-500`/`red-500`/`emerald-500` com `dark:` manual
e ignora os 4 temas. Passa a usar `text-severity-{info,success,warning,critical}`, que já existem em
`styles.css:138-141`.

## 5. Camada de dados

### 5.1 Tipos

`src/shared/types/funnel.ts` (novo, exportado pelo barrel):

```ts
export type FunnelAccent = 0|1|2|3|4|5|6|7|8;
export type LeadFunnelStageKind = "entrada" | "aberta" | "ganho" | "perda";

export interface ILeadFunnel {
  id: ID; storeId: ID; name: string; description?: string;
  accent: FunnelAccent; icon: string; position: number;
  isDefault: boolean; archivedAt?: ISO8601;
  createdAt: ISO8601; updatedAt: ISO8601;
}

export interface ILeadFunnelStage {
  id: ID; funnelId: ID; name: string; accent: FunnelAccent;
  position: number; kind: LeadFunnelStageKind;
  createdAt: ISO8601; updatedAt: ISO8601;
}

export interface ILeadFunnelEntry {
  id: ID; leadId: ID; funnelId: ID; stageId: ID;
  storeId: ID; sellerId: ID | null;
  convertedToCustomerId?: ID; lossReason?: string; lossNotes?: string;
  enteredStageAt: ISO8601; createdAt: ISO8601; updatedAt: ISO8601;
}
```

`ILead.stage` é marcado `@deprecated` e deixa de ser lido. Os ~20 consumidores mapeados migram para
a participação; a lista completa está em §11.

### 5.2 Provider

`leadFunnels` — o **38º** provider, seguindo o Provider Pattern (mock + supabase, selecionados por
`VITE_DATA_SOURCE`):

```ts
export interface ILeadFunnelsProvider {
  listFunnels(storeId: ID, opts?: { includeArchived?: boolean }): Promise<ILeadFunnel[]>;
  createFunnel(input: Omit<ILeadFunnel, "id"|"createdAt"|"updatedAt">): Promise<ILeadFunnel>;
  updateFunnel(id: ID, patch: Partial<ILeadFunnel>): Promise<ILeadFunnel>;
  archiveFunnel(id: ID): Promise<void>;

  listStages(funnelId: ID): Promise<ILeadFunnelStage[]>;
  replaceStages(funnelId: ID, stages: ILeadFunnelStage[]): Promise<ILeadFunnelStage[]>;

  listAccess(funnelId: ID): Promise<ID[]>;
  replaceAccess(funnelId: ID, sellerIds: ID[]): Promise<void>;
  /** Funis que o usuário corrente alcança. Staff recebe todos. */
  listAccessibleFunnelIds(storeId: ID): Promise<ID[]>;

  listEntriesByLead(leadId: ID): Promise<ILeadFunnelEntry[]>;
  /** Participações da conversa, gated pela conversa (espelha getViaConversation). */
  listEntriesViaConversation(conversationId: ID): Promise<ILeadFunnelEntry[]>;
  addEntry(leadId: ID, funnelId: ID, stageId: ID): Promise<ILeadFunnelEntry>;
  moveEntry(entryId: ID, stageId: ID): Promise<ILeadFunnelEntry>;
  removeEntry(entryId: ID): Promise<{ movedToDefault: boolean }>;
}
```

`ILeadsProvider.list` ganha `funnelId?: ID` e `stageId?: ID` em `IListLeadsParams`, resolvidos
**server-side** por join com `lead_funnel_entries`. Isso é obrigatório: hoje `useLeadsList.ts:46`
puxa 1000 linhas e filtra tudo no cliente, com 957 leads na base — o teto já está encostado, e sem
o filtro no servidor a paginação por coluna (§7.1) nunca seria honesta.

`funnelId` entra na `queryKey`, não só no closure da `queryFn` — mesmo cuidado que
`useLeadsList.ts:39-40` já tem com `excludeLost`.

### 5.3 Regra de integridade

**Um lead nunca fica sem participação.** `removeEntry` da última participação cria automaticamente
uma no funil `Geral`, na etapa de entrada, e devolve `{ movedToDefault: true }` para a UI avisar. Um
lead com zero participações desapareceria de toda a interface sem deixar rastro.

## 6. Navegação entre funis

### 6.1 Um estado, três projeções

Os três padrões são implementados e escolhíveis pelo usuário (decisão 7). Para que não virem três
produtos diferentes na mesma tela, existe **uma única fonte de estado**:

```ts
// src/features/funnels/hooks/useFunnelNavigation.ts
useFunnelNavigation() → {
  funnels,            // já filtrados por acesso
  activeFunnelId,     // vem da URL
  setActiveFunnel,
  preferredLayout,    // 'rail' | 'header' | 'tabs'  ← localStorage
  effectiveLayout,    // resolveLayout(preferred, breakpoint, funnelCount)
  setPreferredLayout,
}
```

`FunnelRail`, `FunnelSwitcher` e `FunnelTabs` são **views puras** sobre esse estado. Nenhuma tem
lógica, ordem, rótulo ou recurso próprio.

### 6.2 Contrato de paridade

Todo padrão oferece, sem exceção: trocar de funil, contagem por funil, ícone + accent,
`Todos os funis`, `Gerenciar funis` (Owner/Gestor), atalhos `[` e `]`, `aria-current` no ativo e o
controle de troca de padrão. **Se um padrão não consegue oferecer algo, nenhum oferece** — é o que
impede o usuário de descobrir que "no trilho dá para fazer X e nas abas não".

### 6.3 Fonte da verdade

- **`?funil=<id>` na URL** (via `useLeadsUrlState`) é a seleção corrente. Deep-link funciona, F5
  preserva, gestor manda o link do board pelo WhatsApp.
- **`localStorage`** guarda apenas `gallo-leads-funnel-layout` (padrão preferido) e
  `gallo-leads-last-funnel` (por loja, usado só na entrada sem `?funil=`).
- **Trocar de padrão não muda funil ativo, scroll nem filtros.** É o que faz os três parecerem o
  mesmo produto.
- **Resolução do funil inicial:** `?funil=` → `gallo-leads-last-funnel` → funil padrão da loja →
  `Geral`.

### 6.4 Onde fica o controle de troca

Dois lugares, e apenas dois:

1. **Dentro do próprio seletor de funil** — rodapé do popover (header), `⋮` do rodapé (trilho), `⋮`
   ao fim da tira (abas): item `Exibição dos funis ▸` com submenu de 3 opções e marca no ativo.
2. **`Configurações → Preferências → Aparência`**, ao lado de tema e modo, como `RadioGroup` de 3
   cartões com miniatura esquemática.

**Não** um terceiro `ToggleGroup` no header ao lado de Kanban/Lista: dois controles de "modo" lado a
lado, um mudando conteúdo e outro navegação, confunde — e o header já tem 5 grupos.

### 6.5 Degradação

`resolveLayout(preferred, breakpoint, funnelCount)` — função pura, testada:

| Condição | Resultado | Motivo |
|---|---|---|
| `< 1024px` | sempre `header` | trilho não cabe; abas + board = dois scrolls horizontais aninhados |
| `1024–1279px` + `rail` | trilho colapsado (56px, só ícone) | 176px de trilho num board de colunas de 288px é caro |
| `funnelCount === 1` | rótulo estático nos três | uma aba solitária é ruído; Owner/Gestor mantêm o chevron para "Gerenciar funis" |
| `funnelCount >= 9` + `tabs` | resolve para `header` | tira com scroll horizontal empilhada ao scroll do board |
| `funnelCount === 0` | estado vazio dedicado | "Você ainda não tem acesso a nenhum funil" |

**A degradação nunca reescreve o `localStorage`.** A preferência volta sozinha quando a janela volta
a ser grande. Sobrescrever a escolha de alguém porque girou o tablet é como se perde a confiança do
usuário em configurar qualquer coisa.

### 6.6 Acessibilidade e semântica

- Só um dos três renderiza por vez; quem renderiza é dono do `aria-current`.
- Sempre existe um `<h1>` nomeando o funil ativo. No modo `header` é o gatilho do switcher; em
  `rail` e `tabs`, o nome do funil no topo do board (podendo ser `sr-only`).
- Semântica por forma: trilho = `<nav>` + `<ul>` + `aria-current="page"`; abas = `role="tablist"` +
  `aria-selected` + setas; seletor = `aria-haspopup="listbox"` + `aria-expanded`.
- Trilho colapsado exige `aria-label` no item — tooltip não é nome acessível.

**Padrão de fábrica:** `header`. É o único que funciona em 100% das larguras e contagens e custa
zero pixel vertical. Quando o usuário alcança ≥4 funis, um toast dispensável sugere o trilho.

## 7. Kanban

### 7.1 Carga por coluna: paginação incremental

**40 cards por coluna, `Carregar mais 40` ao fim, total real vindo do servidor no cabeçalho.**

Virtualização foi avaliada e descartada:
- virtualização e arraste se hostilizam — alvo fora da janela renderizada exige auto-scroll e
  remedição, classe de bug que reincide a cada release;
- quebra o `Ctrl+F` do navegador, que é como as pessoas acham um nome numa coluna longa;
- **não resolve o problema humano**: 903 cards virtualizados continuam sendo 903 cards que ninguém
  vai olhar.

Se em produção alguma coluna legítima passar de ~300 renderizados, virtualiza-se **aquela coluna**,
e apenas quando não houver arraste ativo.

### 7.2 Cabeçalho de coluna

Substitui "N leads · Média X dias" (`KanbanColumn.tsx:65-68`) por:

- **soma dos valores** da coluna — o número que o gestor procura;
- **"N atrasados"** em `text-severity-warning`, **clicável**, aplicando `nextAction=overdue`;
- média de dias vai para o `Tooltip`;
- menu `⋮`: *Ordenar por* (`Mais antigos` · `Mais recentes` · `Próxima ação` · `Maior valor` ·
  `Parados há mais tempo`) · `Recolher coluna` · `Ver em lista`. Na etapa `entrada` e apenas para
  staff, soma-se `Limite de acúmulo…`, que navega para a aba Geral do funil — o limite é
  `lead_funnels.entry_alert_threshold`, por funil, não por coluna.

**Ordenação padrão por tipo de etapa:** em `entrada`, mais antigos primeiro — o lead velho é o que
apodrece; nas demais, próxima ação. Hoje o board fica em `createdAt desc`, ou seja, o lead esquecido
é o último dos 903. Persistência em `gallo-leads-column-sort`.

**Colapso** para 44px com nome em `writing-mode: vertical-rl`, persistido em
`gallo-leads-collapsed-columns`.

### 7.3 Arraste

Migração de HTML5 DnD (`kanban/LeadsKanban.tsx:53-110`) para `@dnd-kit`, já instalado e validado em
`RotationQueueManager.tsx:141-144`:

- `PointerSensor` com `activationConstraint: { distance: 6 }` — hoje `cursor-grab` está sempre ativo
  (`LeadCard.tsx:76`) e clique compete com arraste;
- `KeyboardSensor` com `sortableKeyboardCoordinates` — `Space` pega, setas movem, `Space` solta,
  `Esc` cancela. **Hoje não existe forma de mover um lead sem mouse.**
- `DragOverlay` com `scale 1.02` e sombra, sem deslocamento de layout;
- `announcements` em pt-BR: `"{lead} movido para {etapa} em {funil}."`;
- alternativa sem arraste: `Enter` no card abre `DropdownMenu` "Mover para…". A string
  `LEADS_STRINGS.kanban.quickMove` (`i18n/pt-BR.ts:90`) já existe e não tem consumidor.

**Com N:N, o drop altera apenas a participação do funil corrente.** Nunca as outras. E `handleDrop`
deixa de comparar com `CLOSING_STAGE_ID` (`LeadsKanban.tsx:88`) e passa a olhar
`stage.kind === 'ganho' | 'perda'`.

### 7.4 O card

De ~96px para ~60px, duas linhas.

**Sai:** avatar do lead (`LeadCard.tsx:83-87`), telefone (`:92`), chip de origem com fundo
(`:124-132`), fundo do chip de temperatura (`:95-103`, vira ponto de 8px com `aria-label`), borda
esquerda colorida (`:53-55`), chip de próxima ação quando não é urgente (`:112-120`), nome do
vendedor (`:143`, fica só o avatar — e some quando o board já está filtrado por vendedor único, que
é o caso do vendedor comum forçado em `LeadsPage.tsx:68-74`).

**Fica:** nome (13px, `truncate`), ponto de temperatura, valor (`tabular-nums`), atraso **só quando
`overdue`/`today`**, indicador multi-funil, avatar do vendedor (condicional).

**`HoverCard`** (400ms, componente já existente) com o que foi cortado: telefone, origem, tags, dias
na etapa, criado em, e a lista de funis com a etapa em cada.

**Correções obrigatórias:** `focus-visible:ring-2` no lugar de `focus:ring-2` (`:75`),
`min-h-[56px]` preservado (o card é alvo de arraste e clique), e `aria-label` migrando de
`estágio ${lead.stage.name}` (`:71`) para `etapa ${stageName} no funil ${funnelName}`.

Ganho: de ~4 para ~9 cards visíveis por coluna em 768px de altura, contando a barra de métricas
removida (§7.6).

### 7.5 Indicador de multi-funil

`⑃ N` — ícone `mdi:source-branch` de 11px + número, em `text-muted-foreground`, sem fundo e sem
accent.

- Aparece só quando há participação além da do board corrente. **N é o número de *outros* funis.**
- Deliberadamente discreto: estar em vários funis é contexto, não urgência; não pode competir com o
  aviso de atraso, que é o único sinal que faz alguém agir.
- `aria-label="Também está em N outros funis"`.
- `HoverCard` lista os funis com ponto de accent, nome e etapa; cada linha navega para aquele board
  com `?funil=X&highlight=<leadId>` (`scrollIntoView` + `ring-2 ring-primary` por 2s).
- **Conta apenas funis que o usuário acessa.** Se o lead está em 4 e a pessoa alcança 2, mostra
  `⑃ 1` — o total real vazaria a estrutura comercial que o controle de acesso protege.

Descartados: chips com nome de cada funil no card (não cabem em 288px), pilha de pontos coloridos
(vira confete e falha para daltônicos), mudar borda/fundo do card (sequestra a superfície que
deveria sinalizar urgência).

Na **visão Lista** há largura: coluna "Funis" com até 2 chips (ponto + nome) + `+N`, tooltip com o
resto, e `🔒` para participação em funil sem acesso (§3.2).

### 7.6 Barra de métricas: removida

`KanbanMetricsBar` ocupa ~52px permanentes exibindo **0,0% · 0 dias · —** na configuração padrão:
`computeGlobalMetrics` (`utils/leadMetrics.ts:39-63`) calcula sobre `converted`, que
`useLeadsList.ts:71` já removeu da lista antes do cálculo. É informação falsa ocupando espaço fixo.

Os 3 KPIs vão para um `Popover` "Métricas" no header, calculados **sem** o filtro de
convertidos/perdidos. Os 52px devolvidos compensam exatamente os ~40px que a tira de abas custa
quando o usuário escolhe esse padrão.

### 7.7 Triagem da etapa de entrada

É o que efetivamente esvazia o `Geral` — sem isso ele vira depósito permanente e o problema volta
com outro nome.

Quando a etapa `entrada` passa de `lead_funnels.entry_alert_threshold` leads (padrão 50, editável
por staff na aba Geral do funil), o cabeçalho **troca de modo**: em
vez da pilha de cards, mostra contagem real, há quanto tempo está o mais antigo, e dois CTAs —
**`Triar em lista`** (abre a Lista já filtrada por essa etapa, com seleção múltipla) e
**`Distribuir`**.

Ações em lote na Lista: `Adicionar ao funil…` · `Atribuir vendedor` · `Marcar perdido`. No `Geral` a
ação canônica é **adicionar**, não mover — coerente com N:N.

### 7.8 Conformidade com as regras de UX do projeto

A refatoração instala três controles novos de alta frequência exatamente no crômio que está fora do
padrão. Trazer o header à conformidade **antes** (`docs/dev/ux-guidelines.md`):

- §1 header glassmorphism — `LeadsHeader.tsx:31` usa `bg-card` sem `backdrop-blur`;
- §2 `ScrollProgressBar` na divisa do bloco fixo — ausente, e nem `LeadsPage` nem `LeadsKanban`
  expõem `scrollRef`;
- §3 busca padrão — `:46-51` tem largura fixa `w-[260px]`, sem `max-w-2xl` no foco, sem atalho `/`,
  sem badge `kbd`, sem `Escape`, sem `type="search"`, sem debounce;
- §5 tokens — §4.5 desta spec.

Também na barra de filtros: os dois `ToggleChip` (`LeadsFiltersBar.tsx:156-169`) **expandem** o
conjunto em vez de filtrar, e quando ativos ficam `variant="default"` (`:477`), mais proeminentes
que qualquer filtro real. Passam a ter tratamento visual distinto dos filtros.

## 8. Ficha da conversa

O bloco entra em `LeadProfileFiche.tsx` **entre os badges de estado (`:258-299`) e a `<dl>`
(`:302-343`)**, e **substitui** o chip de etapa de `:259-264` — que é justamente um dos usos de
`stage.color` como cor de texto. Um bug de contraste a menos.

Com N:N não é um par "Funil ▾ / Etapa ▾", e sim uma **lista de participações**:

```
Funis                                    [+]
┌──────────────────────────────────────────┐
│ ⚗ Catalisador   [Em negociação   ▾]   ⋮ │
│ ⚙ Filtros       [Novo            ▾]   ⋮ │
│ ▣ Geral         [Triagem         ▾]   ⋮ │
│ 🔒 +2 funis que você não acessa           │
└──────────────────────────────────────────┘
```

Layout em 360px: nome do funil `max-w-[110px] truncate`, `Select` de etapa `w-[150px]`, `⋮` 24px.

**Estados:**

| Estado | Comportamento |
|---|---|
| Sem participação (não deveria ocorrer, §5.3) | `Este lead não está em nenhum funil.` + `[Adicionar a um funil]` |
| Sem permissão de mover | etapa vira texto estático + `mdi:lock-outline` + tooltip `Você não pode mover leads neste funil.` |
| Mudança em andamento | chevron vira `mdi:loading` com `animate-spin motion-reduce:animate-none`, controles `disabled`. **Sem skeleton** — o painel não pode piscar durante um atendimento |
| Já convertido naquele funil | selo `Convertido` + atalho para a ficha do cliente; as outras participações seguem editáveis |
| Funis inacessíveis | `🔒 +N funis que você não acessa` — **sem revelar nomes**, senão vaza a estrutura comercial que o acesso protege |

**Confirmação:** toast com `Desfazer` (6s), não diálogo modal — mudar etapa é reversível e frequente
demais. Remoção de participação, por ser destrutiva, usa `AlertDialog`.

A leitura das participações na conversa passa pela RPC gated pela conversa
(`listEntriesViaConversation`), espelhando `ILeadsProvider.getViaConversation` — o atendente do pool
precisa ver a ficha sem ser dono do lead.

## 9. Administração

**Rota:** `/app/configuracoes/atendimento/funis`, **substituindo** `…/pipeline` (hoje somente-leitura,
com o aviso "edição visual disponível na Fase 2" em `PipelineSettingsPage.tsx:36`).

**Gate RBAC:** novo recurso `funnel` em `RESOURCES` (`src/features/rbac/permissions/resources.ts`) e
em `rbac_resources`, grupo "Comercial", rótulo "Funis". `create` restrito a Owner/Gestor; `edit`
scope `store`. Mesmo padrão de `manage_roles` (PRD-211).

**Layout:** master-detail clonado do `RolesPage` — que já resolve exatamente esta forma de problema
neste produto: rail de 260px + painel + barra de ação persistente + guarda de rascunho sujo
(`dirtyRef` + `pendingSwitchId` + `AlertDialog`; trocar item no rail é estado React, não navegação,
então `useBlocker` não pega). `< 1024px`: rail vira `Select` no topo, como o `RoleRail` faz via
`useIsMobile`.

`Geral` sempre no topo, visualmente separado, sem opção de excluir, com etapas mínimas travadas.

### 9.1 Aba Etapas

Lista com arraste (`@dnd-kit`, sensores idênticos a `RotationQueueManager.tsx:141-144`):

- **handle `⠿` dedicado** (`cursor-grab`, `touch-none`, `aria-label="Reordenar etapa"`) — a linha
  inteira não é arrastável, senão o campo de nome fica inutilizável;
- cor: grade de 8 swatches de accent, **sem color picker**;
- nome: `Input` inline, obrigatório, único no funil, ≤24 caracteres;
- tipo: `Entrada` · `Aberta` · `Ganho` · `Perda`, com exatamente uma de cada tipo terminal,
  obrigatórias e não excluíveis;
- excluir etapa com leads é **bloqueado**: `AlertDialog` com `Select` de destino.

### 9.2 Aba Acesso

Lista com **prévia reativa**, no padrão do `InstanceAccessSheet.tsx:110-180`:

```
┌──────────────────────────────────────────────────┐
│ 👥 4 pessoas enxergam este funil                 │
├──────────────────────────────────────────────────┤
│ Donos e gestores enxergam todos os funis.         │
├──────────────────────────────────────────────────┤
│ ☑ Lucas Cardoso   ☑ Wellington Nunes             │
│ ☐ Tiago Ribeiro   ☐ Ramon Silveira               │
└──────────────────────────────────────────────────┘
```

O contador recalcula a cada clique. Conjunto vazio → `border-severity-warning/40
bg-severity-warning/10` + "Ninguém enxerga este funil", e o botão de salvar vira
`variant="destructive"` com rótulo **`Salvar sem acesso`** — consentimento explícito para uma
configuração que quebra o dia de alguém.

Owner/Gestor aparecem como **linha informativa fixa**, não como checkbox travado — o acesso deles
vem do papel.

**Matriz usuários × funis existe, mas somente-leitura**, como auditoria: botão `Visão geral de
acesso` no nível da lista, `Table` com primeira coluna sticky, `mdi:check` ou `—`, célula clicável
levando à aba Acesso daquele funil. Um lugar para editar, outro para conferir. Matriz editável foi
descartada: célula ambígua, save parcial, inviável em mobile.

### 9.3 Aba Geral

Nome · ícone (grade de ~24 `mdi:` curados) · accent (8 swatches) · descrição · `Switch` "Funil
padrão para novos leads" (exclusivo, com aviso) · Arquivar.

**Arquivar, nunca excluir** — funil com histórico não some, os relatórios dependem dele. Arquivado
sai do seletor, permanece em auditoria e relatórios, leads ficam onde estão, com aviso no rail
("3 funis arquivados contêm 47 leads ativos") e CTA de migração em lote.

**Estado vazio:** três templates de criação rápida no vocabulário do cliente — **Catalisador**,
**Filtros**, **Módulos** — cada um com etapas sugeridas.

## 10. Microcopy

Consolidada em `src/features/funnels/i18n/pt-BR.ts` e nas adições a
`src/features/leads/i18n/pt-BR.ts`. Vocabulário alinhado ao mercado brasileiro (RD Station, Kommo):
**funil**, **etapa**, **motivo de perda**.

| Contexto | Texto |
|---|---|
| Gatilho do seletor (`aria-label`) | `Trocar de funil. Funil atual: {nome}` |
| Busca no seletor | `Buscar funil…` |
| Item consolidado | `Todos os funis` |
| Ação administrativa | `Gerenciar funis` |
| Troca de padrão | `Exibição dos funis` ▸ `Trilho lateral` · `No cabeçalho` · `Em abas` |
| Contagem | `{n} leads` · com urgência `{n} leads · {m} atrasados` |
| Funil de triagem | `Geral` — `Todo lead novo entra aqui até ser direcionado.` |
| Adicionar (ficha) | `+` com `aria-label="Adicionar este lead a um funil"` |
| Diálogo de adicionar | `Adicionar a um funil` · campos `Funil` / `Etapa inicial` · `Cancelar` / `Adicionar` |
| Menu da participação | `Ver neste funil` · `Remover deste funil` |
| Funis ocultos | `+{n} funis que você não acessa` |
| Sucesso — mover | `Movido para {etapa} em {funil}.` + `Desfazer` |
| Sucesso — adicionar | `Adicionado ao funil {funil}.` + `Desfazer` |
| Remoção | `Remover deste funil?` · `{lead} sai de {funil} · {etapa}. Ele continua nos outros {n} funis e no histórico.` |
| Remoção da última | `{lead} sai de {funil} e volta para o funil Geral.` |
| Erro ao mover | `Não foi possível mover o lead.` + `[Tentar novamente]` |
| Sem permissão de criar | `Apenas donos e gestores criam funis.` |
| Sem permissão de mover | `Você não pode mover leads neste funil.` |
| Lead em funil sem acesso | `Este lead está em um funil que você não acessa.` |
| Etapas obrigatórias | `Todo funil precisa de uma etapa de ganho e uma de perda.` |
| Excluir etapa com leads | `Esta etapa tem {n} leads. Escolha para onde movê-los.` |
| Excluir o Geral | `O funil Geral não pode ser excluído — ele recebe todo lead novo.` |
| Arquivar com leads | `Arquivar {nome}? Ele some do seletor, mas continua nos relatórios. Os {n} leads permanecem onde estão.` |
| Usuário sem funis | `Você ainda não tem acesso a nenhum funil` — `Peça ao gestor para liberar os funis em que você trabalha.` |
| Nenhuma pessoa com acesso | `Ninguém enxerga este funil` — `Inclua ao menos uma pessoa.` |
| Dica de N:N (uma vez) | `Um lead pode estar em vários funis ao mesmo tempo, com etapa própria em cada um. Mover aqui não muda a posição dele nos outros.` (`gallo-leads-nn-hint-seen`) |

## 11. Impactos fora da feature

### 11.1 Contagem com N:N

**Nunca exibir número que some funis.** Um lead em 3 funis seria contado 3 vezes. Cada funil mostra
o seu total; o total da base é sempre "leads distintos". O contador do header
(`LeadsPage.tsx:84-87`) hoje calcula `activeCount` sobre a lista pós-filtro cliente com teto de 1000
— passa a vir do servidor, como contagem de leads distintos.

### 11.2 Forecast

`src/features/sales-forecast/engine/computeForecast.ts:22` usa `stageWeights[lead.stage.id]`.

**Decisão do dono:** conta **por participação**. Os pesos passam a ser por etapa de cada funil, e um
lead em catalisador e filtros gera duas linhas de previsão — são duas receitas distintas, não uma
contada em dobro.

`IForecastConfig.stageWeights` (`src/shared/types/forecast.ts:74`) já é `Record<ID, number>`
indexado por id de etapa, então o **formato não muda** — a migração apenas reescreve as chaves dos
5 ids antigos para os ids das novas etapas do funil `Geral`. O que muda é a **assinatura**:
`leadWeight(lead, config)` (`computeForecast.ts:18`) passa a `entryWeight(entry, lead, config)`,
recebendo a participação. O modo `temperature` continua lendo do lead; os modos `stage` e `hybrid`
passam a ler de `entry.stageId`.

Etapa sem peso configurado continua valendo 0 no modo `stage` e caindo para temperatura no
`hybrid` — comportamento atual preservado, o que evita que funis novos zerem a previsão antes de
alguém configurar seus pesos.

### 11.3 Funil de vendas (analytics)

`src/features/sales-analytics/hooks/useFunnelMetrics.ts:120` usa
`QUALIFICATION_STAGES.has(l.stage.id)` — `Set` de ids fixos. Como as etapas agora são por funil, a
etapa ganha a flag derivada: `kind !== 'entrada'` conta como qualificado. Sem nova coluna.

Este relatório de analytics é sobre o funil comercial agregado (lead → qualificado → orçamento →
pedido) e **não** se confunde com os funis desta spec — nomes colidem, conceitos não. A UI mantém a
distinção chamando o daqui de "funil de leads".

### 11.4 Consumidores de `lead.stage`

Migram para a participação: `ConvertLeadModal.tsx:209,219,279,289`, `detail/LeadDataCard.tsx:66-68`,
`detail/LeadHeader.tsx:70-72`, `kanban/LeadsKanban.tsx:37,39,86,99`, `LeadCard.tsx:54,71`,
`LeadProfileFiche.tsx:261-263`, `LeadsList.tsx:127-131`, `MarkAsLostModal.tsx:63,76`,
`NewLeadModal.tsx:278`, `hooks/useLeadsList.ts:77`, `utils/leadDisplay.ts:161`,
`utils/leadMetrics.ts:27,43`, `mocks/api/leads.ts:36`, `impl/supabase/leads.ts:67`.

### 11.5 Criação automática de lead

O webhook do WhatsApp cria lead para número desconhecido (v0.150.0 `Funnel`), com dono pela fila de
rodízio. Passa a criar também a participação no funil `is_default` da loja, etapa `entrada`. O
núcleo runtime-agnostic em `src/providers/whatsapp/` é espelhado por
`scripts/sync-whatsapp-shared.ts` — **mudou lá, roda o sync e redeploy**.

## 12. Engines e testes

Lógica de negócio em `src/features/funnels/engine/`, testada com Vitest (TDD, padrão do projeto):

| Engine | Responsabilidade | Casos-chave |
|---|---|---|
| `resolveLayout.ts` | preferência × largura × nº de funis → layout efetivo | não reescreve preferência; `<1024` força header; `>=9` + tabs → header; 1 funil → estático |
| `accessibleFunnels.ts` | funis que o usuário alcança | staff recebe todos; `Geral` sempre incluído; usuário sem acesso → lista vazia |
| `stageTransition.ts` | regras de mudança de etapa | `ganho` exige conversão; `perda` exige motivo; drop só afeta a participação corrente |
| `membershipRules.ts` | integridade das participações | remover a última devolve ao `Geral`; adicionar em funil onde já está é no-op |
| `funnelMetrics.ts` | métricas por funil | nunca soma funis; conversão por participação; dias na etapa vindos de `enteredStageAt` |
| `accentClasses.ts` | mapa slot → classes | todos os 9 slots mapeados; nenhuma classe construída por template |

Regressão de RLS em `supabase/tests/rls-regression.sql`: vendedor não lê participação de terceiro;
vendedor lê a própria participação em funil sem acesso; troca de dono do lead propaga para as
participações; não-staff não escreve em `lead_funnels`.

## 13. Fases

| # | Fase | Entrega | Visível ao usuário |
|---|---|---|---|
| 1 | **Fundação** | 8 accents nos 4 temas × 2 modos; `kind` na etapa; erradicação de hex e paleta crua em 6 arquivos; grade de contraste no `/design-system` | só o contraste correto |
| 2 | **Modelo N:N** | 4 tabelas, RLS, trigger, migração dos 957, tipos, 38º provider, `funnelId` server-side | não |
| 3 | **Navegação** | `useFunnelNavigation`, os 3 modos, `?funil=`, header em conformidade, remoção da barra de métricas | sim |
| 4 | **Kanban** | card de 60px, indicador `⑃`, paginação por coluna, ordenação, colapso, `@dnd-kit` | sim |
| 5 | **Ficha da conversa** | bloco de participações no painel direito | sim |
| 6 | **Administração** | master-detail, etapas com arraste, acesso com prévia, matriz de auditoria, gate `funnel` | sim |
| 7 | **Triagem** | modo triagem na etapa de entrada, ações em lote na Lista | sim |

A fase 1 é pré-requisito real: sem ela o multi-funil não fecha em acessibilidade. Se for preciso
cortar, a linha natural é **1–4 num PR e 5–7 noutro**.

## 14. Fora de escopo

- Automação por etapa (gatilhos, mensagens automáticas ao mudar de etapa).
- Funis por divisão (`parts`/`service`/`industrial`) — o campo segue dormente.
- Ativar a fila de rodízio no webhook — segue deferido, como em PRD-213.
- Remoção física da coluna `leads.stage` — migration posterior.
- Regras automáticas de entrada por origem/número — descartado na decisão 3.
- Matriz de acesso editável — decidido somente-leitura (§9.2).
- **Motivos de perda por funil.** `IPlatformSettings.lossReasons` continua sendo um catálogo único
  por loja, configurado em `configuracoes/atendimento/motivos-perda`. A participação guarda
  `loss_reason` livre, como o lead guarda hoje. Motivos específicos por linha de produto (um funil
  de catalisador teria motivos que o de filtros não tem) são uma evolução natural, mas não entram
  aqui — a tela de motivos de perda não é tocada.

## 15. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Dessincronização de `seller_id` nas participações | média | trigger + caso na suíte de regressão de RLS |
| Migração dos 957 leads com etapa não mapeada | baixa | conjunto padrão para loja sem `pipelineStages`; verificação de contagem ao fim |
| Usuário estranha o mesmo lead em vários boards | **alta** | dica dispensável no primeiro uso; indicador `⑃` no card; hover listando os funis |
| Funil `Geral` vira depósito permanente | **alta** | fase 7 (triagem + lote) é parte da entrega, não opcional |
| Regressão de contraste ao introduzir accents | média | grade 8 × 4 × 2 no `/design-system` com o validador WCAG existente |
| PR grande demais para revisão | média | corte natural em 1–4 / 5–7, decidido pelo dono |
