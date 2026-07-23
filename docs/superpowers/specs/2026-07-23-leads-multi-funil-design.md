# Leads — múltiplos funis, acesso por usuário e redesign da página

> **Status:** aprovado pelo dono (2026-07-23) · revisado após consultoria UI/UX (rev. 2)
> **Branch:** `feat/leads-multi-funil`
> **Escopo:** feature `leads`, nova feature `funnels`, painel direito do Atendimento, tela de administração
> **Consultoria UI/UX:** agente `design-funis` (skill `ui-ux-pro-max`) — recomendações incorporadas e
> revisão da própria spec aplicada (34 achados, todos endereçados)
> **Mocks:** artifact publicado em 2026-07-23

---

## 1. Problema

A página de Leads opera sobre **um único pipeline por loja**, materializado como
`IPlatformSettings.pipelineStages` (`src/shared/types/platform.ts:248`) — array de 5 etapas guardado
no jsonb `stores.settings`. Cada lead carrega um **snapshot** dessa etapa em `ILead.stage`
(`src/shared/types/lead.ts:41`), persistido na coluna jsonb `leads.stage`.

A distribuidora trabalha linhas de produto distintas (catalisador, filtros, módulos) com ciclos,
etapas e responsáveis diferentes. Um pipeline só não modela isso, e não há como restringir que
vendedor enxerga que linha.

Somam-se problemas independentes da tela, todos verificados no código:

| Problema | Evidência |
|---|---|
| 903 de 957 leads numa coluna só | dado de produção, visão Kanban |
| Todos os leads carregados e filtrados no cliente | `hooks/useLeadsList.ts:37-52` (`pageSize: 1000`) e `:54-168` |
| Coluna renderiza todos os cards, sem teto | `components/kanban/KanbanColumn.tsx:75-91` |
| Barra de métricas exibe 0/0/0 por construção | `utils/leadMetrics.ts:39-63` calcula sobre `converted`, que `useLeadsList.ts:71` já removeu |
| Etapa de fechamento é constante hardcoded | `utils/leadDisplay.ts:157`, consumida em `kanban/LeadsKanban.tsx:88` e `leadMetrics.ts:43` |
| Sem caminho por teclado para mover lead | `kanban/LeadsKanban.tsx:53-110` usa HTML5 DnD nativo |
| Cor de etapa (hex livre) usada como cor de texto | `LeadProfileFiche.tsx:261`, `LeadsList.tsx:127-129` — o `#5b6b7a` do seed rende ~2,5:1 no modo escuro, reprova WCAG AA |
| Header fora do padrão de UX do projeto | `LeadsHeader.tsx:31` sem glassmorphism; `:46-51` busca sem `/`, sem `type="search"`, largura fixa |

## 2. Decisões

Fechadas com o dono antes do desenho.

| # | Decisão | Alternativa descartada |
|---|---|---|
| 1 | **Um lead participa de N funis**, com etapa independente em cada | 1:1 com troca de funil |
| 2 | **Acesso por usuário nominal** por funil; Owner/Gestor sempre veem tudo | por departamento; híbrido |
| 3 | **Funil `Geral`** de triagem recebe todo lead novo e os 957 existentes | bandeja sem funil; regra automática por origem |
| 4 | **Acesso restringe, não amplia** — o funil filtra a carteira do próprio vendedor | funil como espaço compartilhado de time |
| 5 | **Multi-funil e redesign na mesma entrega** | fatiar em duas |
| 6 | **Conversão é por participação** — fechar catalisador não encerra filtros | conversão do lead inteiro |
| 7 | **Os três padrões de navegação são implementados**, escolhíveis pelo usuário | eleger um |

Decorrências aprovadas junto:

- **Forecast e analytics contam por participação** — e, por consequência, **o valor estimado passa a
  viver na participação** (§5.1, §11.2). Sem isso a decisão seria inexprimível e o forecast contaria
  a mesma oportunidade duas vezes.
- **`seller_id` é desnormalizado** na participação, derivado por trigger (§3.3).
- **A rota de administração substitui** `configuracoes/atendimento/pipeline`, hoje somente-leitura.
- **O funil `Geral` é o padrão imutável** na v1: irrestrito, inarquivável, inexcluível, e não há
  interruptor para eleger outro funil como padrão (§9.3). Isso elimina a divergência entre "Geral" e
  `is_default`, que apareceriam como sinônimos em quatro seções e podem discordar.

## 3. Modelo de dados

### 3.1 Tabelas

Quatro tabelas novas em `public`. Nenhuma alteração destrutiva em `leads`.

```sql
create table public.lead_funnels (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  name         text not null,
  description  text,
  accent       smallint not null check (accent between 0 and 8),  -- 0 = neutro
  icon         text not null,                                     -- id iconify
  position     int  not null,
  is_default   boolean not null default false,
  -- atalho de acesso: quando true, toda a loja enxerga (§9.2). Não substitui a
  -- lista nominal — soma-se a ela.
  open_to_store boolean not null default false,
  -- limite de acúmulo da etapa `entrada`, a partir do qual a coluna troca para
  -- o modo triagem (§7.7). Por funil, editável por staff na aba Geral.
  entry_alert_threshold int not null default 50 check (entry_alert_threshold > 0),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index lead_funnels_one_default_per_store
  on public.lead_funnels (store_id) where is_default and archived_at is null;

create unique index lead_funnels_unique_name
  on public.lead_funnels (store_id, lower(name)) where archived_at is null;

create index lead_funnels_store_position_idx
  on public.lead_funnels (store_id, position) where archived_at is null;
```

O nome único por loja evita dois "Filtros" indistinguíveis no seletor.

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
  updated_at timestamptz not null default now(),
  -- alvo da FK composta de lead_funnel_entries (garante coerência etapa↔funil)
  unique (id, funnel_id)
);

create unique index lead_funnel_stages_one_entrada on public.lead_funnel_stages (funnel_id) where kind = 'entrada';
create unique index lead_funnel_stages_one_ganho   on public.lead_funnel_stages (funnel_id) where kind = 'ganho';
create unique index lead_funnel_stages_one_perda   on public.lead_funnel_stages (funnel_id) where kind = 'perda';
create unique index lead_funnel_stages_unique_name on public.lead_funnel_stages (funnel_id, lower(name));
```

O limite de 24 caracteres é imposto no banco, não na UI: nome longo quebra o cabeçalho da coluna e a
restrição precisa valer para qualquer caminho de escrita.

**Índice único parcial garante "no máximo uma", não "exatamente uma".** A obrigatoriedade das três
etapas terminais é imposta por *constraint trigger* deferida, avaliada ao fim da transação — só assim
`replaceStages` (§5.2) consegue reordenar sem violar no meio do caminho:

```sql
create constraint trigger lead_funnel_stages_require_terminals
  after insert or update or delete on public.lead_funnel_stages
  deferrable initially deferred
  for each row execute function public.assert_funnel_has_terminal_stages();
```

A função conta as três `kind` do funil afetado e levanta exceção se faltar alguma.

```sql
create table public.lead_funnel_entries (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  stage_id   uuid not null,

  -- coerência etapa↔funil garantida no banco: impossível guardar uma etapa de
  -- outro funil, o que renderizaria um card sem coluna correspondente
  foreign key (funnel_id, stage_id)
    references public.lead_funnel_stages (funnel_id, id),

  -- desnormalizados para RLS barata (§3.3); DERIVADOS por trigger, nunca aceitos do cliente
  store_id   uuid not null,
  seller_id  uuid,

  -- valor da oportunidade NAQUELE funil (§5.1). Herda de leads.estimated_value
  -- na criação da participação e pode ser editado por funil.
  estimated_value numeric,

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

`entered_stage_at` existe porque hoje "dias na etapa" deriva de `updatedAt` (`leadMetrics.ts:27-36`),
proxy ruim: qualquer edição do lead zera a conta. Com a participação, o dado é real e por funil.

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

Ler a existência e o nome de um funil **não é sigiloso** — o que é sigiloso são os leads dentro dele.
Manter a leitura aberta evita um join gated para cada rótulo. **Consequência a assumir
explicitamente:** esconder nomes de funil na UI (§7.5, §8) é **redução de ruído cognitivo, não
fronteira de segurança** — qualquer autenticado da loja lê a lista pela API. A spec não deve sugerir
o contrário.

`lead_funnel_entries` — espelha exatamente a semântica de `leads`:

```sql
-- select / update / delete
store_id = (select public.current_store_id())
and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))

-- insert: with check idêntico, MAS store_id/seller_id são sobrescritos pelo
-- trigger before insert (§3.3), então a expressão é verdade por construção e
-- não há como forjar participação sobre lead de terceiro.
```

**O filtro por funil acessível não entra na policy.** Ele é aplicado na consulta do board (§5.2).
É a tradução literal da decisão 4: o funil restringe a *visualização*, não a existência. Assim o
vendedor dono de um lead num funil que não acessa **continua enxergando esse lead** na visão Lista,
com a participação marcada como bloqueada — nenhum lead some sem explicação. Nada de terceiro vaza,
porque a cláusula de dono não foi tocada.

`lead_funnel_access` — leitura da própria linha para todos, leitura completa e escrita para staff:

```sql
-- select
seller_id = (select public.current_seller_id()) or (select public.is_staff())
-- insert / delete
(select public.is_staff())
```

### 3.3 Desnormalização e triggers

`store_id` e `seller_id` em `lead_funnel_entries` duplicam colunas de `leads`. É deliberado.

O projeto já pagou duas vezes o preço de RLS que resolve por linha: o modelo de acesso a conversas
(`docs/dev/conversation-access-model.md`, v0.110.0 `Turnstile`) e a assinatura de mídia
(v0.111.0 `Aperture`, 2.375 ms → 7 ms). Uma policy que consultasse `leads` por linha repetiria o erro
no board inteiro, onde a consulta devolve centenas de linhas por carregamento.

**Dois triggers, não um.** O de UPDATE mantém a sincronia; o de INSERT fecha o buraco de segurança de
aceitar `seller_id` do cliente:

```sql
-- INSERT: deriva store/seller do lead, ignorando o que o cliente enviou
create or replace function public.derive_lead_funnel_entry_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select l.store_id, l.seller_id into new.store_id, new.seller_id
    from public.leads l where l.id = new.lead_id;
  if not found then raise exception 'lead % not found', new.lead_id; end if;
  if new.estimated_value is null then
    select l.estimated_value into new.estimated_value from public.leads l where l.id = new.lead_id;
  end if;
  return new;
end $$;

create trigger lead_funnel_entries_derive_owner
  before insert on public.lead_funnel_entries
  for each row execute function public.derive_lead_funnel_entry_owner();

-- UPDATE em leads: propaga troca de dono/loja para todas as participações
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

`supabase/tests/rls-regression.sql` ganha: troca de dono propaga; tentativa de inserir participação
sobre lead de terceiro com `seller_id` próprio resulta em linha derivada para o dono real (e portanto
invisível a quem inseriu).

### 3.4 Migração dos dados existentes

Uma migration, uma transação, idempotente:

1. **Cria o funil `Geral`** por loja: `accent = 0`, `icon = 'mdi:inbox-outline'`, `is_default = true`,
   `open_to_store = true`, `position = 0`.
2. **Materializa as etapas** lendo `stores.settings->'pipelineStages'` — não depende do frontend.
   Mapeamento de `kind` **por heurística, nunca por id literal** (o `stage-fechado` de
   `usePipelineSettings.ts:21` é fallback do frontend e pode não existir em produção):
   - menor `order` → `entrada`;
   - etapa de fechamento identificada por nome contendo `fechad`/`convertid`/`perdid`, ou, na
     ausência, a de maior `order` → **desdobrada em duas**: `Convertido` (`ganho`) e `Perdido`
     (`perda`), porque hoje uma única etapa acumula os dois desfechos;
   - demais → `aberta`;
   - `color` hex → `accent` por mapa de aproximação; loja sem `pipelineStages` recebe o conjunto
     padrão.
   - **Falha alta** se algum funil terminar sem as três etapas terminais.
3. **Cria uma participação por lead**, preservando etapa, `seller_id`, `store_id`,
   `converted_to_customer_id`, `loss_reason`, `loss_notes`, e copiando `estimated_value`.
   `entered_stage_at = leads.updated_at` (melhor aproximação disponível).
   Destino da etapa:
   - convertido → `ganho`;
   - com `loss_reason` → `perda`;
   - **na etapa de fechamento sem nenhum dos dois** → **última etapa `aberta`**, nunca `perda`.
     Marcar como perdido fabricaria uma perda que não aconteceu e contaminaria a taxa de conversão
     histórica. (Caso possível: `NewLeadModal` permite escolher a etapa inicial.)
4. **Não popula `lead_funnel_access`** — desnecessário, porque o `Geral` nasce `open_to_store` e é
   irrestrito por definição (§9.2).
5. **`leads.stage` vira legado**: permanece, deixa de ser escrito. Remoção fica para migration
   posterior, após um ciclo estável em produção.

Verificação obrigatória ao fim: `count(lead_funnel_entries) = count(leads)` por loja, **e** todo
funil com as três etapas terminais.

## 4. Sistema de cor por funil e por etapa

### 4.1 O reenquadramento

O projeto proíbe cor literal em componente (PRD-001): tudo consome tokens semânticos, porque a mesma
tela roda em `data-theme` × `data-mode` (4 × 2). Mas a cor do funil é escolha do usuário.

A tensão é aparente. O usuário não escolhe *uma cor*; escolhe **qual das identidades do sistema**
aquele funil ocupa. O dado persistido é um **slot enumerado**:

```ts
accent: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8   // 0 = neutro
```

O componente continua consumindo apenas tokens. O que é dinâmico é *qual* token, não o valor dele.

### 4.2 Implementação em `src/styles.css`

**Nomenclatura: `funnel-1..8`, não `accent-1..8`.** O token `--color-accent` já existe
(`styles.css:107`) e alimenta `hover:bg-accent` / `text-accent-foreground` em toda a base;
`bg-accent-3` seria lido como "um tom do accent do shadcn". `bg-funnel-3` é inequívoco e dá grep
limpo. O slot neutro é `funnel-0`.

**Os slots seguem o padrão já estabelecido da escala de severidade**, não o dos temas. `styles.css:71`
descreve `--gallo-sev-*` como "escala dedicada (**constante nos 4 temas**; tratamento tonal)":
declarada uma vez em `:root` e sobrescrita apenas em `.dark` (`:199-203`). Identidade de funil tem a
mesma natureza — é um eixo próprio, ortogonal à identidade de marca, e não deve mudar quando o
usuário troca de tema.

```css
/* 1 — primitivos, constantes nos 4 temas */
:root { --gallo-funnel-0: …; --gallo-funnel-1: …; /* … */ --gallo-funnel-8: …; }

/* variante dark (paridade AA), ao lado das severidades já existentes */
.dark { --gallo-funnel-0: …; /* … */ --gallo-funnel-8: …; }

/* 2 — @theme inline (gera as utilities) */
--color-funnel-0: var(--gallo-funnel-0);
/* … */
--color-funnel-8: var(--gallo-funnel-8);
```

São 9 × 2 = **18 valores calibrados uma vez** — não 72. Finito, auditável e coerente com o
precedente do projeto.

No componente, **mapa de literais tipado + acesso null-safe**:

```ts
// src/features/funnels/engine/accentClasses.ts
const FUNNEL_CLASSES: Record<FunnelAccent, { dot: string; chip: string; border: string; bar: string }> = {
  0: { dot: "bg-funnel-0", chip: "bg-muted",        border: "border-border",   bar: "bg-funnel-0" },
  1: { dot: "bg-funnel-1", chip: "bg-funnel-1/12",  border: "border-funnel-1", bar: "bg-funnel-1" },
  // … 2 a 8
};

/** Null-safe: accent inesperado (vindo do banco, de migration ou de import) cai no neutro. */
export function getAccentClasses(accent: number) {
  return FUNNEL_CLASSES[accent as FunnelAccent] ?? FUNNEL_CLASSES[0];
}
```

O acesso null-safe **não é zelo abstrato**: é o mesmo padrão que `getOriginMeta`
(`utils/leadDisplay.ts:73-82`) passou a usar depois do incidente de 2026-07-18, quando
`origin='import'` sem entrada no META derrubou `/app/leads` com `undefined.tone`. O projeto não usa
`noUncheckedIndexedAccess`; `Record<number, …>` com acesso direto reabriria a mesma porta.

Tailwind v4 **não gera classe montada por template string** — daí o mapa, nunca `` `bg-funnel-${n}` ``.

O arquivo mora em `engine/` (é lógica pura testada), não em `utils/`.

### 4.3 A regra que garante acessibilidade

> **O accent nunca é a cor de um texto que precise passar em contraste AA.**

| Superfície | Uso | Limiar | Como passa |
|---|---|---|---|
| Ponto de 8px | `bg-funnel-N` sólido | 3:1 (não-textual) | calibração |
| Borda / barra 2–3px | `border-funnel-N` | 3:1 | calibração |
| Chip de funil | `bg-funnel-N/12` + `text-foreground` | 4,5:1 | o texto é `foreground` |
| Nome do funil | **`text-foreground`, sempre** | 4,5:1 | por construção |
| Ícone ≥16px com rótulo ao lado | `text-funnel-N`, `aria-hidden` | decorativo | não se aplica |

**Redundância não-cromática:** o ícone é **obrigatório** por funil e é o portador do significado; a
cor é reforço periférico. Quem não distingue cores lê pelo ícone e pelo nome.

A rota `/design-system`, que já tem validador de contraste WCAG, ganha a grade 9 × 2.

### 4.4 Regras de uso

**Faz:**
- 8 slots coloridos é teto proposital; o nono funil repete um — o ícone diferencia. Não aumentar:
  acima de 8 os tons ficam indistinguíveis em visão periférica e a calibração salta para 128 valores.
- Sugestão automática do primeiro slot livre na criação.
- Picker de ~24 ícones `mdi:` curados do domínio de peças pesadas.
- Funil `Geral` em `funnel-0` (neutro) com `mdi:inbox-outline`. Com 903 leads, um accent forte faria
  o Geral dominar cromaticamente trilho, abas, seletor, cards e ficha.
- **Etapas usam os mesmos slots**, inclusive o `0` — uma etapa neutra é legítima (ex.: "Aguardando").

**Não faz:**
- Persistir hex, em funil ou etapa.
- `style={{ color }}` / `style={{ borderColor }}` — é o bug que existe hoje em `LeadCard.tsx:53-55`,
  `KanbanColumn.tsx:55-59`, `LeadsList.tsx:127-129`, `LeadProfileFiche.tsx:261`.
- Classe por template string.
- Color picker livre.
- Reaproveitar cores de severidade como accent de funil — significam estado; um funil
  "vermelho-crítico" mata a força de todo alerta real da tela.
- Colorir superfície grande por funil (fundo do board, header).
- Colorir o nome do funil, em lugar nenhum.
- Sinalizar item ativo só por cor: peso tipográfico + barra + `aria-current`; cor é o terceiro
  reforço.

### 4.5 Dívida paga junto

`IPipelineStage.color` é hex livre já em produção, usado como cor de **texto** em
`LeadProfileFiche.tsx:261` e `LeadsList.tsx:127-129`. O `#5b6b7a` do seed rende ~2,5:1 sobre o card
no modo escuro — reprova AA sem correção possível.

Sai também a paleta Tailwind crua de `utils/leadDisplay.ts:15-29` (temperatura), `:42-70` (origem) e
`:115-139` (próxima ação), que usa `sky-500`/`amber-500`/`red-500`/`emerald-500` com `dark:` manual e
ignora os 4 temas. Passa a `text-severity-{info,success,warning,critical}` (`styles.css:138-141`).

## 5. Camada de dados

### 5.1 O que é do lead e o que é da participação

**A divisão mais importante da spec.** Sem ela, cada um dos ~17 arquivos de §11.4 vira decisão
individual do implementador.

| Campo | Vive em | Por quê |
|---|---|---|
| `name`, `phone`, `email`, `avatarUrl` | **lead** | é a pessoa |
| `sellerId` | **lead** (espelhado na participação) | a carteira é do lead, não da linha de produto |
| `temperature` | **lead** | é a leitura do contato, não da oportunidade. O ponto do card é igual nos três funis — deliberado |
| `origin` | **lead** | como o contato chegou; não muda por funil |
| `tags` | **lead** | rotulagem do contato |
| `nextActionAt` | **lead** | há um único próximo contato agendado com a pessoa. O "N atrasados" (§7.2) marca o mesmo lead em todos os boards — deliberado |
| **`estimatedValue`** | **participação** | são receitas distintas (decisão do dono, §11.2). No lead vira campo **legado/agregado**, não lido pela UI |
| `stageId` | **participação** | o núcleo do N:N |
| `enteredStageAt` | **participação** | dias na etapa, por funil |
| `convertedToCustomerId` | **participação** | conversão por funil (decisão 6) |
| `lossReason`, `lossNotes` | **participação** | perder em um funil não perde nos outros |

### 5.2 Tipos

`src/shared/types/funnel.ts` (novo, exportado pelo barrel):

```ts
export type FunnelAccent = 0|1|2|3|4|5|6|7|8;
export type LeadFunnelStageKind = "entrada" | "aberta" | "ganho" | "perda";

export interface ILeadFunnel {
  id: ID; storeId: ID; name: string; description?: string;
  accent: FunnelAccent; icon: string; position: number;
  isDefault: boolean; openToStore: boolean; entryAlertThreshold: number;
  archivedAt?: ISO8601; createdAt: ISO8601; updatedAt: ISO8601;
}

export interface ILeadFunnelStage {
  id: ID; funnelId: ID; name: string; accent: FunnelAccent;
  position: number; kind: LeadFunnelStageKind;
  createdAt: ISO8601; updatedAt: ISO8601;
}

export interface ILeadFunnelEntry {
  id: ID; leadId: ID; funnelId: ID; stageId: ID;
  storeId: ID; sellerId: ID | null;
  estimatedValue?: Money;
  convertedToCustomerId?: ID; lossReason?: string; lossNotes?: string;
  enteredStageAt: ISO8601; createdAt: ISO8601; updatedAt: ISO8601;
}

/** Resumo por etapa para o cabeçalho da coluna (§7.2), calculado no servidor. */
export interface IFunnelBoardSummary {
  stageId: ID; count: number; sumValue: Money; overdueCount: number;
}
```

`ILead.stage` e `ILead.estimatedValue` são marcados `@deprecated`.

### 5.3 Provider

`leadFunnels` — o **38º** provider (mock + supabase, por `VITE_DATA_SOURCE`):

```ts
export interface ILeadFunnelsProvider {
  listFunnels(storeId: ID, opts?: { includeArchived?: boolean }): Promise<ILeadFunnel[]>;
  createFunnel(input: Omit<ILeadFunnel, "id"|"createdAt"|"updatedAt">): Promise<ILeadFunnel>;
  updateFunnel(id: ID, patch: Partial<ILeadFunnel>): Promise<ILeadFunnel>;
  archiveFunnel(id: ID): Promise<void>;

  listStages(funnelId: ID): Promise<ILeadFunnelStage[]>;
  /** Upsert por id + delete apenas das órfãs. NÃO é delete-all + insert: stage_id
   *  tem FK sem cascade, e apagar etapa com participações levantaria 23503. */
  replaceStages(funnelId: ID, stages: ILeadFunnelStage[]): Promise<ILeadFunnelStage[]>;

  listAccess(funnelId: ID): Promise<ID[]>;
  replaceAccess(funnelId: ID, sellerIds: ID[]): Promise<void>;
  /** Funis que o usuário corrente alcança. Staff recebe todos; `open_to_store`
   *  e o funil padrão entram sempre. */
  listAccessibleFunnelIds(storeId: ID): Promise<ID[]>;

  /** Agregações — servidor, nunca cliente (§7.1, §7.2, §11.1). */
  countLeadsByFunnel(storeId: ID): Promise<Record<ID, number>>;
  getBoardSummary(funnelId: ID): Promise<IFunnelBoardSummary[]>;

  listEntriesByLead(leadId: ID): Promise<ILeadFunnelEntry[]>;
  /** Gated pela conversa, espelhando ILeadsProvider.getViaConversation. */
  listEntriesViaConversation(conversationId: ID): Promise<ILeadFunnelEntry[]>;
  addEntry(leadId: ID, funnelId: ID, stageId: ID): Promise<ILeadFunnelEntry>;
  moveEntry(entryId: ID, stageId: ID): Promise<ILeadFunnelEntry>;
  updateEntry(entryId: ID, patch: Pick<ILeadFunnelEntry, "estimatedValue">): Promise<ILeadFunnelEntry>;
  removeEntry(entryId: ID): Promise<{ movedToDefault: boolean }>;
}
```

`ILeadsProvider.list` ganha `funnelId?: ID` e `stageId?: ID` em `IListLeadsParams`, resolvidos
**server-side** por join com `lead_funnel_entries`. Obrigatório: hoje `useLeadsList.ts:46` puxa 1000
linhas e filtra no cliente, com 957 leads na base — o teto já está encostado, e sem o filtro no
servidor a paginação por coluna (§7.1) nunca seria honesta. `funnelId` entra na `queryKey`, não só no
closure, como `useLeadsList.ts:39-40` já faz com `excludeLost`.

### 5.4 Regra de integridade

**Um lead nunca fica sem participação.** `removeEntry` da última cria automaticamente uma no funil
**padrão** (que na v1 é o `Geral`, imutavelmente — §2), na etapa de entrada, e devolve
`{ movedToDefault: true }` para a UI avisar. Lead com zero participações desapareceria de toda a
interface sem deixar rastro.

## 6. Navegação entre funis

### 6.1 Um estado, três projeções

```ts
// src/features/funnels/hooks/useFunnelNavigation.ts
useFunnelNavigation() → {
  funnels, activeFunnelId, setActiveFunnel,
  preferredLayout,   // 'rail' | 'header' | 'tabs'  ← localStorage
  effectiveLayout,   // resolveLayout(preferred, breakpoint, funnelCount)
  setPreferredLayout,
}
```

`FunnelRail`, `FunnelSwitcher` e `FunnelTabs` são **views puras**. Nenhuma tem lógica, ordem, rótulo
ou recurso próprio.

### 6.2 Contrato de paridade

Todo padrão oferece: trocar de funil, contagem por funil, ícone + accent, `Todos os funis`,
`Gerenciar funis` (staff), atalhos `[` e `]`, `aria-current` no ativo e o controle de troca de
padrão. **Se um padrão não consegue oferecer algo, nenhum oferece.**

### 6.3 "Todos os funis"

Cada funil tem etapas próprias, logo **não existe eixo X comum e kanban unificado é impossível**.
Selecionar "Todos os funis":

- força `view=list` (o `ToggleGroup` Kanban/Lista fica desabilitado, com tooltip);
- adiciona a coluna "Funis" à tabela (§7.5);
- exibe um toast único por sessão explicando por quê.

Sem esta especificação, alguém tentaria construir o board unificado.

### 6.4 Fonte da verdade

- **`?funil=<id>` na URL** (via `useLeadsUrlState`) é a seleção corrente. Deep-link, F5 preserva,
  gestor manda o link pelo WhatsApp.
- **`localStorage`** guarda `gallo-leads-funnel-layout` e `gallo-leads-last-funnel` (por loja).
- **Trocar de padrão não muda funil ativo, scroll nem filtros.**
- **Resolução do funil inicial:** `?funil=` → `gallo-leads-last-funnel` → funil padrão → `Geral`.

**Fallback de link inválido** (caso provável, já que §6.4 estimula compartilhar links): `?funil=`
inexistente, arquivado ou sem acesso → abre o funil padrão + toast
`Você não tem acesso ao funil desse link. Abrimos o {nome}.` A chave `gallo-leads-last-funnel` é
limpa quando aponta para funil arquivado ou inexistente.

### 6.5 Onde fica o controle de troca

Dois lugares, e apenas dois:

1. **Dentro do próprio seletor** — rodapé do popover (header), `⋮` do rodapé (barra lateral), `⋮` ao
   fim da tira (abas): `Exibição dos funis ▸` com submenu de 3 opções e marca no ativo.
2. **`Configurações → Preferências → Aparência`**, ao lado de tema e modo, como `RadioGroup` de 3
   cartões com miniatura esquemática.

**Não** um terceiro `ToggleGroup` no header ao lado de Kanban/Lista: dois controles de "modo" lado a
lado, um mudando conteúdo e outro navegação, confunde — e o header já tem 5 grupos.

### 6.6 Degradação

`resolveLayout(preferred, breakpoint, funnelCount)` — função pura, testada. A barra lateral tem
**208px** expandida e **56px** colapsada:

| Condição | Resultado | Motivo |
|---|---|---|
| `< 1024px` | sempre `header` | barra não cabe; abas + board = dois scrolls horizontais aninhados |
| `1024–1279px` + `rail` | colapsada (56px) | 208px de barra num board de colunas de 288px é caro |
| `funnelCount === 1` | rótulo estático nos três | uma aba solitária é ruído; staff mantém o chevron para "Gerenciar funis" |
| `funnelCount >= 9` + `tabs` | resolve para `header` | tira com scroll horizontal empilhada ao scroll do board |
| `funnelCount === 0` | estado vazio dedicado | só alcançável para não-staff se o padrão for restrito — impossível na v1 (§9.2) |

**A degradação nunca reescreve o `localStorage`.** A preferência volta sozinha quando a janela volta
a ser grande.

### 6.7 Acessibilidade e semântica

- Só um dos três renderiza por vez; quem renderiza é dono do `aria-current`.
- Sempre existe um `<h1>` nomeando o funil ativo. No modo `header` é o gatilho do switcher; em `rail`
  e `tabs`, o nome do funil no topo do board (podendo ser `sr-only`).
- Semântica por forma: barra = `<nav>` + `<ul>` + `aria-current="page"`; abas = `role="tablist"` +
  `aria-selected` + setas; seletor = `aria-haspopup="listbox"` + `aria-expanded`.
- Barra colapsada exige `aria-label` no item — tooltip não é nome acessível.

**Padrão de fábrica:** `header` — único que funciona em 100% das larguras e contagens e custa zero
pixel vertical.

## 7. Kanban

### 7.1 Carga por coluna: paginação incremental

**40 cards por coluna, `Carregar mais 40` ao fim, total real do servidor no cabeçalho.**

Virtualização foi avaliada e descartada: hostiliza o arraste (alvo fora da janela renderizada exige
auto-scroll e remedição — bug que reincide a cada release); quebra o `Ctrl+F` do navegador; e **não
resolve o problema humano** — 903 cards virtualizados continuam sendo 903 cards que ninguém vai
olhar. Se alguma coluna legítima passar de ~300 renderizados, virtualiza-se **aquela coluna**, apenas
quando não houver arraste ativo.

### 7.2 Cabeçalho de coluna

Substitui "N leads · Média X dias" (`KanbanColumn.tsx:65-68`) por dados de `getBoardSummary`:

- **soma dos valores** da coluna — somando `entry.estimatedValue`, não o valor do lead, o que evita
  contar a mesma oportunidade em dois funis;
- **"N atrasados"** em `text-severity-warning`, **clicável**, aplicando `nextAction=overdue`;
- média de dias vai para o `Tooltip`;
- menu `⋮`: *Ordenar por* (`Mais antigos` · `Mais recentes` · `Próxima ação` · `Maior valor` ·
  `Parados há mais tempo`) · `Recolher coluna` · `Ver em lista`. Na etapa `entrada` e apenas para
  staff, soma-se `Limite de acúmulo…`, que navega para a aba Geral do funil.

**Ordenação padrão por tipo de etapa:** em `entrada`, mais antigos primeiro — o lead velho é o que
apodrece; nas demais, próxima ação. Hoje o board fica em `createdAt desc`, ou seja, o lead esquecido
é o último dos 903.

**Persistência por etapa, não global:** `gallo-leads-column-sort` e `gallo-leads-collapsed-columns`
guardam **mapas indexados por `stageId`** — com N funis, uma chave única sobrescreveria a preferência
de todos os boards. Colapso reduz a coluna a 44px com nome em `writing-mode: vertical-rl`.

### 7.3 Arraste

Migração de HTML5 DnD (`kanban/LeadsKanban.tsx:53-110`) para `@dnd-kit`, já instalado e validado em
`RotationQueueManager.tsx:141-144`:

- `PointerSensor` com `activationConstraint: { distance: 6 }` — hoje `cursor-grab` está sempre ativo
  (`LeadCard.tsx:76`) e clique compete com arraste;
- `KeyboardSensor` com `sortableKeyboardCoordinates` — `Space` pega, setas movem, `Space` solta, `Esc`
  cancela. **Hoje não existe forma de mover um lead sem mouse.**
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
esquerda colorida (`:53-55`), chip de próxima ação quando não é urgente (`:112-120`), nome do vendedor
(`:143`, fica só o avatar — e some quando o board já está filtrado por vendedor único, caso do
vendedor comum forçado em `LeadsPage.tsx:68-74`).

**Fica:** nome (13px, `truncate`), ponto de temperatura, valor **da participação**
(`tabular-nums`), atraso **só quando `overdue`/`today`**, indicador multi-funil, avatar do vendedor
(condicional).

**Selo Convertido/Perdido** (`:148-161`) **passa a ler a participação do board corrente**, não o
lead — com N:N o lead pode estar convertido em Catalisador e aberto em Filtros, e o selo atual diria
"Convertido" nos dois. Deixa de ser `absolute right-2 top-2` (hoje cobre o chip de temperatura de
`:95`, e no card novo cobriria o ponto): vira `opacity-60` no card + faixa lateral, sem sobreposição.

**`HoverCard`** (400ms, componente já existente) com o que foi cortado: telefone, origem, tags, dias
na etapa, criado em, e a lista de funis com etapa em cada.

**Correções obrigatórias:** `focus-visible:ring-2` no lugar de `focus:ring-2` (`:75`),
`min-h-[56px]` preservado (o card é alvo de arraste e clique), e `aria-label` migrando de
`estágio ${lead.stage.name}` (`:71`) para `etapa ${stageName} no funil ${funnelName}`.

Ganho: de ~4 para ~9 cards visíveis por coluna em 768px, contando a barra de métricas removida (§7.6).

### 7.5 Indicador de multi-funil

Ícone `mdi:source-branch` de 11px + número, em `text-muted-foreground`, sem fundo e sem accent.

- Aparece só quando há participação além da do board corrente. **N é o número de *outros* funis.**
- Deliberadamente discreto: estar em vários funis é contexto, não urgência; não pode competir com o
  aviso de atraso, que é o único sinal que faz alguém agir.
- `aria-label="Também está em outro funil"` / `"…em N outros funis"`.
- `HoverCard` lista os funis com ponto de accent, nome e etapa; cada linha navega com
  `?funil=X&highlight=<leadId>` (`scrollIntoView` + `ring-2 ring-primary` por 2s).
- **Conta apenas funis que o usuário acessa** — reduz ruído e evita expor linhas de negócio que não
  são da alçada dele. (Não é fronteira de segurança: §3.2 deixa os nomes legíveis pela API.)

Descartados: chips com nome de cada funil no card (não cabem em 288px), pilha de pontos coloridos
(vira confete e falha para daltônicos), mudar borda/fundo do card (sequestra a superfície que
sinaliza urgência).

Na **visão Lista** há largura: coluna "Funis" com até 2 chips (ponto + nome) + `+N`, tooltip com o
resto, e cadeado para participação em funil sem acesso. A coluna aparece sempre que o usuário
alcança mais de um funil, e obrigatoriamente em "Todos os funis" (§6.3).

### 7.6 Barra de métricas: removida

`KanbanMetricsBar` ocupa ~52px permanentes exibindo **0,0% · 0 dias · —** na configuração padrão:
`computeGlobalMetrics` (`utils/leadMetrics.ts:39-63`) calcula sobre `converted`, que
`useLeadsList.ts:71` já removeu antes do cálculo. É informação falsa em espaço fixo.

Os 3 KPIs vão para um `Popover` "Métricas" no header, calculados **sem** o filtro de
convertidos/perdidos. Os 52px devolvidos compensam os ~40px que a tira de abas custa.

### 7.7 Triagem da etapa de entrada

É o que efetivamente esvazia o `Geral` — sem isso ele vira depósito permanente e o problema volta com
outro nome.

Quando a etapa `entrada` passa de `lead_funnels.entry_alert_threshold` (padrão 50, editável por staff
na aba Geral), o cabeçalho **troca de modo**: em vez da pilha de cards, mostra contagem real, há
quanto tempo está o mais antigo, e dois CTAs — **`Triar em lista`** (abre a Lista filtrada por essa
etapa, com seleção múltipla) e **`Distribuir`**.

**O painel de triagem continua sendo alvo de soltura**, com estado de hover próprio e a mensagem
`Solte para devolver à triagem` — devolver um lead à entrada é movimento legítimo (colocaram no funil
errado, o cliente sumiu) e o modo triagem não pode bloqueá-lo.

Ações em lote na Lista: `Adicionar ao funil…` · `Atribuir vendedor` · `Marcar perdido`. No `Geral` a
ação canônica é **adicionar**, não mover — coerente com N:N.

### 7.8 Leads sem dono no board

`lead.ts:31` documenta `sellerId: ID | null` para lead criado por import/eco aguardando o primeiro
inbound. A policy de §3.2 (`seller_id = current_seller_id()`) **nunca casa com NULL**, logo
**participações de lead sem dono são visíveis apenas para staff no kanban**. Não é regressão: é o
comportamento atual de `leads`. O atendente do pool alcança a ficha pela conversa
(`listEntriesViaConversation`, §8), e a fila de rodízio atribui dono no primeiro inbound.

### 7.9 Conformidade com as regras de UX do projeto

A refatoração instala três controles novos de alta frequência no crômio que está fora do padrão.
Trazer o header à conformidade **antes** (`docs/dev/ux-guidelines.md`):

- §1 header glassmorphism — `LeadsHeader.tsx:31` usa `bg-card` sem `backdrop-blur`;
- §2 `ScrollProgressBar` na divisa do bloco fixo — ausente, e nem `LeadsPage` nem `LeadsKanban`
  expõem `scrollRef`;
- §3 busca padrão — `:46-51` tem largura fixa `w-[260px]`, sem `max-w-2xl` no foco, sem atalho `/`,
  sem badge `kbd`, sem `Escape`, sem `type="search"`, sem debounce;
- §5 tokens — §4.5 desta spec.

Na barra de filtros: os dois `ToggleChip` (`LeadsFiltersBar.tsx:156-169`) **expandem** o conjunto em
vez de filtrar, e quando ativos ficam `variant="default"` (`:477`), mais proeminentes que qualquer
filtro real. Passam a ter tratamento visual distinto.

## 8. Ficha da conversa

O bloco entra em `LeadProfileFiche.tsx` **entre os badges de estado (`:258-299`) e a `<dl>`
(`:302-343`)**, e **substitui** o chip de etapa de `:259-264` — um dos usos de `stage.color` como cor
de texto. Um bug de contraste a menos.

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

**Orçamento vertical.** O painel já rola e o bloco acrescenta ~35px por participação. Para não
empurrar o `ConversationManagementCard` (`:352`) para muito abaixo da dobra: **máximo de 3
participações visíveis + "ver todas"**, e a `<dl>` de dados (`:302-343`) passa a `Collapsible`
fechado por padrão — quem atende precisa de funil, etapa e status; "criado em" é consulta ocasional.

**Estados:**

| Estado | Comportamento |
|---|---|
| Sem participação (não deveria ocorrer, §5.4) | `Este lead não está em nenhum funil.` + `[Adicionar a um funil]` |
| Sem permissão de mover | etapa vira texto estático + `mdi:lock-outline` + tooltip |
| Mudança em andamento | chevron vira `mdi:loading` com `animate-spin motion-reduce:animate-none`, controles `disabled`. **Sem skeleton** — o painel não pode piscar durante um atendimento |
| Já convertido naquele funil | selo `Convertido` + atalho para a ficha do cliente; as outras participações seguem editáveis |
| Funis inacessíveis | `🔒 +N funis que você não acessa` — sem nomes, para reduzir ruído |

**Confirmação:** toast com `Desfazer` (6s), não diálogo modal — mudar etapa é reversível e frequente.
Remoção de participação, por ser destrutiva, usa `AlertDialog`.

A leitura na conversa passa pela RPC gated (`listEntriesViaConversation`), espelhando
`ILeadsProvider.getViaConversation` — o atendente do pool precisa ver a ficha sem ser dono do lead.

## 9. Administração

**Rota:** `/app/configuracoes/atendimento/funis`, **substituindo** `…/pipeline` (hoje somente-leitura,
com o aviso "edição visual disponível na Fase 2" em `PipelineSettingsPage.tsx:36`).

**Gate RBAC:** novo recurso `funnel` em `RESOURCES` (`src/features/rbac/permissions/resources.ts`) e
em `rbac_resources`, grupo "Comercial", rótulo "Funis". `create` restrito a Owner/Gestor; `edit`
scope `store`. Mesmo padrão de `manage_roles` (PRD-211).

**Layout:** master-detail clonado do `RolesPage` — rail de 260px + painel + barra de ação persistente
+ guarda de rascunho sujo (`dirtyRef` + `pendingSwitchId` + `AlertDialog`; trocar item no rail é
estado React, não navegação, então `useBlocker` não pega). `< 1024px`: rail vira `Select` no topo,
como o `RoleRail` faz via `useIsMobile`.

### 9.1 Aba Etapas

Lista com arraste (`@dnd-kit`, sensores idênticos a `RotationQueueManager.tsx:141-144`):

- **handle `⠿` dedicado** (`cursor-grab`, `touch-none`, `aria-label="Reordenar etapa"`) — a linha
  inteira não é arrastável, senão o campo de nome fica inutilizável;
- cor: grade de 9 swatches (`funnel-0..8`), **sem color picker**;
- nome: `Input` inline, obrigatório, único no funil, ≤24 caracteres;
- tipo: `Entrada` · `Aberta` · `Ganho` · `Perda`, exatamente uma de cada tipo terminal, obrigatórias
  e não excluíveis — imposto pela *constraint trigger* de §3.1, não só pela UI;
- excluir etapa com leads é **bloqueado**: `AlertDialog` com `Select` de destino.

### 9.2 Aba Acesso

Lista com **prévia reativa**, no padrão do `InstanceAccessSheet.tsx:110-180`:

```
┌──────────────────────────────────────────────────┐
│ 👥 4 pessoas enxergam este funil                 │
├──────────────────────────────────────────────────┤
│ Donos e gestores enxergam todos os funis.         │
├──────────────────────────────────────────────────┤
│ [🏪 Todos da loja                  Desativado ]  │
├──────────────────────────────────────────────────┤
│ ☑ Lucas Cardoso   ☑ Wellington Nunes             │
│ ☐ Tiago Ribeiro   ☐ Ramon Silveira               │
└──────────────────────────────────────────────────┘
```

**"Todos da loja"** (`open_to_store`) é atalho, não contradiz a decisão 2 — que descartou acesso por
*departamento*, não a liberação para a loja inteira. Sem ele, admitir um vendedor exigiria editar
todos os funis à mão, um a um, e ninguém lembraria. O precedente existe em
`InstanceAccessSheet.tsx:132-142`. As duas dimensões somam (OU); pessoa é contada uma vez.

O contador recalcula a cada clique. Conjunto vazio → `border-severity-warning/40
bg-severity-warning/10` + "Ninguém enxerga este funil", e o botão de salvar vira
`variant="destructive"` com rótulo **`Salvar sem acesso`**.

Owner/Gestor aparecem como **linha informativa fixa**, não checkbox travado — o acesso vem do papel.

**O funil padrão (`Geral`) não tem aba Acesso.** Ele é irrestrito por definição: recebe todo lead
novo (§11.5), é o destino de `removeEntry` (§5.4) e é onde a triagem acontece (§7.7). Permitir
restringi-lo trancaria a operação inteira. A aba é substituída por uma nota explicando isso.

**Matriz usuários × funis existe, mas somente-leitura**, como auditoria: botão `Visão geral de
acesso`, `Table` com primeira coluna sticky, `mdi:check` ou `—`, célula clicável levando à aba Acesso
daquele funil. Um lugar para editar, outro para conferir. Matriz editável foi descartada: célula
ambígua, save parcial, inviável em mobile.

### 9.3 Aba Geral

Nome · ícone (grade de ~24 `mdi:` curados) · accent (9 swatches) · descrição · limite de acúmulo ·
Arquivar.

**Não há interruptor "funil padrão".** Na v1 o `Geral` é o padrão imutável (§2) — mover o padrão
criaria divergência com §5.4, §7.7 e §11.5, que dependem de um destino estável e irrestrito.

**Arquivar, nunca excluir** — funil com histórico não some, os relatórios dependem dele. Arquivado
sai do seletor, permanece em auditoria e relatórios, leads ficam onde estão, com aviso no rail
("3 funis arquivados contêm 47 leads ativos") e CTA de migração em lote. **O `Geral` não pode ser
arquivado nem excluído.**

**Estado vazio:** três templates de criação rápida no vocabulário do cliente — **Catalisador**,
**Filtros**, **Módulos** — cada um com etapas sugeridas.

## 10. Microcopy

Em `src/features/funnels/i18n/pt-BR.ts` e nas adições a `src/features/leads/i18n/pt-BR.ts`.
Vocabulário alinhado ao mercado brasileiro (RD Station, Kommo): **funil**, **etapa**, **motivo de
perda**. Toda string com contagem tem forma singular e plural, como `pt-BR.ts:8` e `:86` já fazem.

| Contexto | Texto |
|---|---|
| Gatilho do seletor (`aria-label`) | `Trocar de funil. Funil atual: {nome}` |
| Busca no seletor | `Buscar funil…` |
| Item consolidado | `Todos os funis` |
| Aviso ao entrar em "Todos os funis" | `Cada funil tem etapas próprias, então a visão de todos abre em lista.` |
| Ação administrativa | `Gerenciar funis` |
| Troca de padrão | `Exibição dos funis` ▸ `Barra lateral` · `Seletor no cabeçalho` · `Abas` |
| Contagem | `1 lead` / `{n} leads` · com urgência `{n} leads · {m} atrasados` |
| Funil de triagem | `Geral` — `Todo lead novo entra aqui até ser direcionado.` |
| Paginação da coluna | `Carregar mais 40` · `Mostrando {n} de {total}` |
| Modo triagem (título) | `{n} leads aguardando triagem` |
| Modo triagem (corpo) | `O mais antigo está parado há {n} dias.` |
| Modo triagem (CTAs) | `Triar em lista` · `Distribuir` |
| Modo triagem (soltura) | `Solte para devolver à triagem` |
| Adicionar (ficha) | `+` com `aria-label="Adicionar este lead a um funil"` |
| Diálogo de adicionar | `Adicionar a um funil` · campos `Funil` / `Etapa inicial` · `Cancelar` / `Adicionar` |
| Menu da participação | `Ver neste funil` · `Remover deste funil` |
| Funis ocultos | `+1 funil que você não acessa` / `+{n} funis que você não acessa` |
| Indicador multi-funil (`aria-label`) | `Também está em outro funil` / `Também está em {n} outros funis` |
| Sucesso — mover | `Movido para {etapa} em {funil}.` + `Desfazer` |
| Sucesso — adicionar | `Adicionado ao funil {funil}.` + `Desfazer` |
| Remoção | `Remover deste funil?` · `{lead} sai de {funil} · {etapa}. Ele continua no outro funil e no histórico.` / `…nos outros {n} funis…` |
| Remoção da última | `{lead} sai de {funil} e volta para o funil Geral.` |
| Link de funil inválido | `Você não tem acesso ao funil desse link. Abrimos o {nome}.` |
| Erro ao mover | `Não foi possível mover o lead.` + `[Tentar novamente]` |
| Sem permissão de criar | `Apenas donos e gestores criam funis.` |
| Sem permissão de mover | `Você não pode mover leads neste funil.` |
| Lead em funil sem acesso | `Este lead está em um funil que você não acessa.` |
| Etapas obrigatórias | `Todo funil precisa de uma etapa de entrada, uma de ganho e uma de perda.` |
| Excluir etapa com leads | `Esta etapa tem 1 lead. Escolha para onde movê-lo.` / `…{n} leads… movê-los.` |
| Acesso do funil padrão | `O funil Geral é visível para toda a equipe — ele recebe todo lead novo e não pode ser restrito.` |
| Arquivar com leads | `Arquivar {nome}? Ele some do seletor, mas continua nos relatórios. Os {n} leads permanecem onde estão.` |
| Marcar perdido (título) | `Marcar como perdido em {funil}?` |
| Marcar perdido (corpo) | `O lead sai deste funil, mas continua nos outros em que estiver.` |
| Nenhuma pessoa com acesso | `Ninguém enxerga este funil` — `Inclua ao menos uma pessoa ou ative "Todos da loja".` |
| Dica de N:N (uma vez) | `Um lead pode estar em vários funis, com etapa própria em cada um.` (`gallo-leads-nn-hint-seen`) |

O detalhe "mover aqui não muda a posição dele nos outros" sai do toast — que o sonner truncaria — e
vai para o `HoverCard` do indicador multi-funil, onde a dúvida realmente aparece.

## 11. Impactos fora da feature

### 11.1 Contagem com N:N

**Nunca exibir número que some funis.** Um lead em 3 funis seria contado 3 vezes. Cada funil mostra o
seu total; o total da base é sempre "leads distintos". O contador do header (`LeadsPage.tsx:84-87`),
hoje calculado sobre a lista pós-filtro cliente com teto de 1000, passa a vir do servidor como
contagem de leads distintos.

### 11.2 Forecast

`sales-forecast/engine/computeForecast.ts:31` faz
`sum + (lead.estimatedValue ?? 0) * leadWeight(lead, config)`.

**Decisão do dono:** conta **por participação** — catalisador e filtros do mesmo cliente são duas
receitas. Isso só é exprimível com `estimated_value` na participação (§5.1); sem ele, um lead de
R$ 12.400 em 2 funis produziria R$ 24.800 de pipeline, a mesma oportunidade contada duas vezes.

- `IForecastConfig.stageWeights` (`forecast.ts:74`) já é `Record<ID, number>` por id de etapa — o
  **formato não muda**; a migração reescreve as chaves dos 5 ids antigos para os das novas etapas.
- `leadWeight(lead, config)` (`:18`) vira `entryWeight(entry, lead, config)`. O modo `temperature`
  segue lendo do lead; `stage` e `hybrid` leem `entry.stageId`.
- `computeWeightedPipeline` itera participações abertas, multiplicando `entry.estimatedValue`.
- Etapa sem peso continua valendo 0 no modo `stage` e caindo para temperatura no `hybrid` —
  comportamento atual preservado, para que funil novo não zere a previsão antes de alguém configurar.

### 11.3 Funil de vendas (analytics)

`sales-analytics/hooks/useFunnelMetrics.ts:120` usa `QUALIFICATION_STAGES.has(l.stage.id)`. Como as
etapas agora são por funil, "qualificado" passa a ser: **lead distinto com ao menos uma participação
em etapa `kind !== 'entrada'`**. Contagem por lead distinto, não por participação — senão o relatório
agregado infla, e ele mede o funil comercial da empresa, não a receita por linha.

Este relatório (lead → qualificado → orçamento → pedido) **não se confunde** com os funis desta spec:
os nomes colidem, os conceitos não. A UI mantém a distinção chamando o daqui de "funil de leads".

### 11.4 Consumidores de `lead.stage`, `isConverted` e `isLost`

Migram para a participação:

`ConvertLeadModal.tsx:209,219,279,289` · `detail/LeadDataCard.tsx:66-68` ·
`detail/LeadHeader.tsx:70-72` · `kanban/LeadsKanban.tsx:37,39,86,99` · `LeadCard.tsx:54,71,148-161` ·
`LeadProfileFiche.tsx:261-263` · `LeadsList.tsx:127-131` · `MarkAsLostModal.tsx:63,76` ·
`NewLeadModal.tsx:278` · `hooks/useLeadsList.ts:68-73,77` · `utils/leadDisplay.ts:161,167,171` ·
`utils/leadMetrics.ts:27,43` · `mocks/api/leads.ts:36` · `impl/supabase/leads.ts:67`.

Dois merecem descrição, por mudarem a tela:

- **`MarkAsLostModal`** passa a operar sobre a **participação do board corrente**: perder em
  Catalisador não perde em Filtros. Copy nova em §10.
- **`NewLeadModal`** troca o campo "Estágio inicial" (`pt-BR.ts:177`) por **"Funil" + "Etapa
  inicial"**, com o funil padrão pré-selecionado.
- **`useLeadsList.ts:68-73`** — os toggles "Incluir perdidos"/"Incluir convertidos" passam a filtrar
  por estado **da participação**, não do lead.

### 11.5 Criação automática de lead

O webhook do WhatsApp cria lead para número desconhecido (v0.150.0 `Funnel`), com dono pela fila de
rodízio. Passa a criar também a participação no funil padrão da loja, etapa `entrada`. O núcleo
runtime-agnostic em `src/providers/whatsapp/` é espelhado por `scripts/sync-whatsapp-shared.ts` —
**mudou lá, roda o sync e redeploy**.

### 11.6 Segunda conversão não pode duplicar cliente

Com conversão por participação, um lead convertido em Catalisador e depois arrastado para `ganho` em
Filtros reabriria `ConvertLeadModal` — que hoje abre em modo `new` (`LeadProfileFiche.tsx:175`),
criando **um segundo `customers` para a mesma pessoa**.

**Regra:** se qualquer participação do lead já tem `converted_to_customer_id`, a segunda conversão
**vincula àquele cliente**, sem oferecer criação. O modo "vincular a cliente existente" já existe
(`pt-BR.ts:196`). Imposto em `stageTransition.ts` (§12), não só na UI.

## 12. Engines e testes

Lógica de negócio em `src/features/funnels/engine/`, testada com Vitest (TDD, padrão do projeto):

| Engine | Responsabilidade | Casos-chave |
|---|---|---|
| `resolveLayout.ts` | preferência × largura × nº de funis → layout efetivo | não reescreve preferência; `<1024` força header; `>=9` + tabs → header; 1 funil → estático |
| `accessibleFunnels.ts` | funis que o usuário alcança | staff recebe todos; funil padrão e `open_to_store` sempre incluídos; arquivado nunca; usuário sem acesso ainda alcança o padrão |
| `stageTransition.ts` | regras de mudança de etapa | `ganho` exige conversão; **segunda conversão vincula ao cliente existente** (§11.6); `perda` exige motivo; drop só afeta a participação corrente |
| `membershipRules.ts` | integridade das participações | remover a última devolve ao padrão; adicionar em funil onde já está é no-op; nova participação herda `estimatedValue` do lead |
| `funnelMetrics.ts` | métricas por funil | nunca soma funis; soma de valor usa `entry.estimatedValue`; conversão por participação; dias na etapa de `enteredStageAt` |
| `accentClasses.ts` | mapa slot → classes | os 9 slots mapeados; **valor inesperado cai no neutro** (incidente 2026-07-18) |

Regressão de RLS em `supabase/tests/rls-regression.sql`: vendedor não lê participação de terceiro;
vendedor lê a própria participação em funil sem acesso; troca de dono propaga; INSERT com `seller_id`
forjado é derivado para o dono real; não-staff não escreve em `lead_funnels`; participação com etapa
de outro funil é rejeitada pela FK composta.

## 13. Fases

| # | Fase | Entrega | Visível ao usuário |
|---|---|---|---|
| 1 | **Fundação** | 9 slots `funnel-*` nos 4 temas × 2 modos; `kind` na etapa; erradicação de hex e paleta crua em 6 arquivos; grade de contraste no `/design-system` | só o contraste correto |
| 2 | **Modelo N:N** | 4 tabelas, RLS, 2 triggers, constraint trigger, migração dos 957, tipos, 38º provider, `funnelId` server-side | não |
| 3 | **Navegação** | `useFunnelNavigation`, os 3 modos, `?funil=`, "Todos os funis", header em conformidade, remoção da barra de métricas — **mais o formulário mínimo de criar funil** | sim |
| 4 | **Kanban** | card de 60px, indicador multi-funil, paginação por coluna, ordenação, colapso, `@dnd-kit` | sim |
| 5 | **Ficha da conversa** | bloco de participações no painel direito | sim |
| 6 | **Administração** | master-detail, etapas com arraste, acesso com prévia, matriz de auditoria, gate `funnel` | sim |
| 7 | **Triagem** | modo triagem na etapa de entrada, ações em lote na Lista | sim |

A fase 1 é pré-requisito real: sem ela o multi-funil não fecha em acessibilidade.

**A criação de funil é puxada para a fase 3** — de outro modo, entre a fase 3 e a 6 existiria apenas
o `Geral`, e com `funnelCount === 1` os três padrões de navegação degradam para rótulo estático
(§6.6): entregaríamos três componentes que ninguém consegue exercitar. A camada mock também semeia
3 funis.

Se for preciso cortar, a linha natural é **1–4 num PR e 5–7 noutro**.

## 14. Fora de escopo

- Automação por etapa (gatilhos, mensagens automáticas ao mudar de etapa).
- Funis por divisão (`parts`/`service`/`industrial`) — o campo segue dormente.
- Ativar a fila de rodízio no webhook — segue deferido, como em PRD-213.
- Remoção física de `leads.stage` e `leads.estimated_value` — migration posterior.
- Regras automáticas de entrada por origem/número — descartado na decisão 3.
- Matriz de acesso editável — decidido somente-leitura (§9.2).
- Eleger outro funil como padrão — na v1 o `Geral` é imutável (§2, §9.3).
- **Motivos de perda por funil** — o catálogo `IPlatformSettings.lossReasons` segue único por loja e
  a tela `configuracoes/atendimento/motivos-perda` não é tocada. O que **entra** é a perda **por
  participação**: perder em um funil não fecha os outros, e `MarkAsLostModal` passa a operar sobre a
  participação do board corrente (§11.4).

## 15. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Dessincronização de `seller_id` nas participações | média | triggers de INSERT e UPDATE + casos na regressão de RLS |
| Migração com etapa terminal não identificada | média | heurística por nome com fallback, criação forçada das terminais e **falha alta** se faltar |
| Usuário estranha o mesmo lead em vários boards | **alta** | dica no primeiro uso; indicador no card; hover listando os funis |
| Funil `Geral` vira depósito permanente | **alta** | fase 7 (triagem + lote) é parte da entrega, não opcional |
| Valor estimado divergente entre lead e participações | média | participação herda na criação; `leads.estimated_value` marcado legado e não lido pela UI |
| Regressão de contraste ao introduzir os slots | média | grade 9 × 2 no `/design-system` com o validador WCAG existente |
| PR grande demais para revisão | média | corte natural em 1–4 / 5–7, decidido pelo dono |
