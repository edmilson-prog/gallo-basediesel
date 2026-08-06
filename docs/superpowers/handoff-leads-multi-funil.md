# Handoff — Leads Multi-Funil (Fases 1–2 entregues, 3–7 pendentes)

> **Propósito deste documento:** entregar a um agente executor (contexto zero) o estado real desta feature — o que já está em produção, o que está aberto, e o que precisa acontecer antes de continuar. Este documento existe porque o contexto desta feature foi perdido uma vez: as fases 1–2 rodaram numa sessão longa que terminou sem deixar registro, e a sessão seguinte não conseguiu reconstruir o que havia sido feito.

- **Data da entrega das fases 1–2:** 2026-07-23/24
- **Última auditoria deste documento:** 2026-08-06 (fase 5)
- **Status:** Fases 1–2 em **v0.157.0 `Manifold`** (PR #371) · Fase 3 em **v0.158.0 `Wayfinder`** (mais correções em v0.159.1 e v0.159.2) · Fase 4 em **v0.160.0 `Trellis`** · Fase 5 em **v0.161.0 `Lanyard`** · Fases 6–7 sem plano escrito
- **Worktrees:** `leads-multi-funil` (fases 1–2) · `leads-multi-funil-fase3` (fase 3) · `leads-multi-funil-fase4` (fase 4) · `leads-multi-funil-fase5` (fase 5) — todas mergeadas

---

## 0. Documentos desta feature (ponteiros)

| Documento | Caminho | Conteúdo |
|-----------|---------|----------|
| **Spec (design)** | [`specs/2026-07-23-leads-multi-funil-design.md`](specs/2026-07-23-leads-multi-funil-design.md) | Arquitetura, modelo N:N, RLS, telas, as 7 fases (§13), fora de escopo (§14), riscos (§15). |
| **Plano (execução fases 1–2)** | [`plans/2026-07-23-leads-multi-funil-fase1-2.md`](plans/2026-07-23-leads-multi-funil-fase1-2.md) | 19 tasks TDD. **Já executado por completo.** Serve como registro do que foi feito. |
| **Mocks de decisão (visual)** | [`mockups/leads-multi-funil-decisao-v1.html`](mockups/leads-multi-funil-decisao-v1.html) | **Referência visual das fases 3–7.** Abrir no navegador. Ver §3.1 abaixo. |
| **Handoff (este)** | `docs/superpowers/handoff-leads-multi-funil.md` | Estado real, pendências e caminho para a fase 3. |

> **Fases 3–7 não têm plano.** A convenção desta feature é escrever o plano da fase seguinte **depois** que a anterior roda, para refletir o código como construído.
>
> ⚠️ A spec cita *"Mocks: artifact publicado em 2026-07-23"* **sem informar onde**. Esse artifact foi recuperado e salvo no repositório em 2026-08-04 (arquivo acima), seguindo a convenção que a feature de IA já usava. Ele existia apenas como URL externa em `claude.ai` — se a spec for lida sem este handoff, o ponteiro fica solto.

---

## 1. Por que esta feature existe

Hoje existe **um único pipeline por loja** (`IPlatformSettings.pipelineStages`), com a etapa gravada como snapshot jsonb em cada lead. A GALLO trabalha linhas de produto distintas (catalisador, filtros, módulos) com ciclos de venda e responsáveis diferentes, e não havia como restringir qual vendedor enxerga qual linha.

---

## 2. As 7 decisões do dono que governam o modelo

Este é o contexto de negócio que **não pode se perder**. Toda ambiguidade de implementação se resolve voltando aqui.

1. Um lead participa de **N funis**, com etapa independente em cada.
2. Acesso por **usuário nominal**; Dono/Gestor veem tudo.
3. Funil **`Geral`** de triagem recebe todo lead novo — irrestrito, inarquivável, imutável na v1.
4. **Acesso restringe, nunca amplia** — o funil filtra o board, não a existência do lead. A RLS de `leads` **não muda**.
5. **`estimated_value` vive na participação**, não no lead — um lead em dois funis são duas receitas distintas.
6. Conversão é **por participação**; a segunda **vincula** ao cliente existente, nunca duplica.
7. Cor de funil é um **slot enumerado (0–8)**, nunca hex — componentes seguem consumindo só tokens semânticos.

---

## 3. As 7 fases (spec §13)

| # | Fase | Entrega | Visível ao usuário | Status |
|---|------|---------|--------------------|--------|
| 1 | **Fundação** | 9 slots `funnel-*`; `kind` na etapa; erradicação de hex e paleta crua; grade de contraste no `/design-system` | só o contraste correto | ✅ entregue |
| 2 | **Modelo N:N** | 4 tabelas, RLS, triggers, backfill, tipos, 38º provider, `funnelId` server-side | não | ✅ entregue |
| 3 | **Navegação** | `useFunnelNavigation`, os 3 modos, `?funil=`, "Todos os funis", header em conformidade, remoção da barra de métricas + **formulário mínimo de criar funil** | sim | ✅ entregue |
| 4 | **Kanban** | card de 60px, indicador multi-funil, paginação por coluna, ordenação, colapso, `@dnd-kit` | sim | ✅ entregue (v0.160.0) |
| 5 | **Ficha da conversa** | bloco de participações no painel direito, com atalho para adicionar a um funil | sim | ✅ entregue (v0.161.0) |
| 6 | **Administração** | master-detail, etapas com arraste, acesso com prévia, matriz de auditoria, gate `funnel` | sim | ⬜ pendente |
| 7 | **Triagem** | modo triagem na etapa de entrada, ações em lote na Lista | sim | ⬜ pendente |

> **A criação de funil foi puxada para a fase 3** de propósito: com `funnelCount === 1` os três padrões de navegação degradam para rótulo estático, e entregaríamos três componentes que ninguém consegue exercitar. O mock semeia 3 funis por isso.
>
> Corte natural sugerido pela spec, se precisar dividir: **1–4 num PR, 5–7 noutro.**

### 3.1. O que os mocks de decisão já resolveram (e a fase 3 não deve reabrir)

O arquivo `mockups/leads-multi-funil-decisao-v1.html` é a consultoria de UI/UX que precedeu a spec — **34 achados, todos endereçados**. Ele carrega decisões visuais que o texto da spec resume mas não desenha. Antes de planejar a fase 3, abra-o.

**A escolha de navegação já foi feita, e não é "escolher uma das três":**

| Padrão | Perfil | Veredito |
|--------|--------|----------|
| **A · Abas horizontais** | familiar (Pipedrive) | Quebra a partir de 6–7 funis; `Geral · 903` fica permanentemente ao lado de funis de duas dezenas |
| **B · Seletor no cabeçalho** | escala (HubSpot) | Board com 100% da largura; esconde os outros funis atrás de um clique |
| **C · Trilho lateral** | **recomendada** | Único padrão em que os funis viram **alvo de arraste** — "adicionar a outro funil" vira gesto, não menu |

**Os três são implementados, e cada pessoa escolhe o seu** (gravado no navegador, como o tema). A exigência técnica disso: *um único estado com três projeções* — trilho, seletor e abas são **vistas puras sobre o mesmo dado**, e nenhum pode ter recurso que os outros não tenham.

Regras que acompanham a escolha:

- **O funil ativo vive na URL (`?funil=catalisador`), não na preferência.** Trocar de padrão mantém funil, scroll e filtros — e o link do board pode ser mandado por WhatsApp ao gestor.
- **A preferência é um desejo, não um contrato.** Abaixo de 1024px qualquer preferência resolve para o seletor (B); com 9+ funis, as abas também. **Mas a preferência gravada nunca é reescrita** — ela volta sozinha quando a janela cresce. *"Sobrescrever a escolha de alguém porque girou o tablet é como se perde a confiança do usuário em configurar qualquer coisa."*
- **B é o modo compacto de C**, não um rival.
- O controle fica em **dois lugares apenas**: dentro do próprio seletor de funil, e em Configurações ao lado de tema/modo. **Não** num terceiro botão no cabeçalho — já existe Kanban/Lista ali.

**Outras decisões visuais fechadas:**

- **Card cortado ao osso** — de ~96px/7 dados para **~60px/4 dados** (~9 cards por coluna em vez de ~4). Saem: avatar do lead, telefone, origem (constante na base), próxima ação quando não urgente, borda colorida da etapa (a coluna já diz), nome do vendedor. Vão para o hover.
- **Indicador multi-funil**: `⑃ 2`, discreto e **sem cor** — estar em vários funis é contexto, não urgência, e não pode competir com o aviso de atraso. **Conta apenas funis que a pessoa acessa** — mostrar o total real vazaria a estrutura comercial que o controle de acesso protege.
- **Cabeçalho da coluna** troca "média de dias" (número de relatório) por **soma dos valores** e **"N atrasados" clicável** — o único número que faz alguém agir.
- **Ordenação padrão muda conforme o tipo da etapa**: na etapa de entrada, **mais antigos primeiro** — hoje o board fica em ordem de criação decrescente, ou seja, o lead esquecido é o último dos 903.
- **Modo triagem**: quando a etapa de entrada passa de 50 leads, o cabeçalho **troca de modo** — mostra contagem real, idade do mais antigo, e os botões *Triar em lista* / *Distribuir*. Sem essa saída, o `Geral` vira depósito permanente.
- **Ficha da conversa** (fase 5): bloco de funis logo **abaixo da identidade, antes dos dados** — é a primeira coisa acionável. Uma linha por participação. A linha `🔒 +2 funis que você não acessa` é obrigatória: sem ela ninguém entende por que a lista parece incompleta; **com os nomes, vazaria a estrutura comercial**. Confirmação é toast com desfazer, nunca modal.
- **Cor de funil**: 8 slots + `Geral` em cinza neutro fora dos 8 (com 903 leads, cor forte dominaria a tela). **A cor do funil nunca é a cor de um texto** — vive em pontos, bordas e fundos suaves, superfícies que precisam de 3:1, não 4,5:1. *(Já implementado na fase 1.)*

### 3.2. Os 5 diagnósticos da tela atual — "o que o multi-funil não resolve sozinho"

Dívida da tela de Leads que **existe independentemente** dos funis. Se ficar de fora, o multi-funil nasce sobre uma base já no limite.

| # | Diagnóstico | Onde | Status |
|---|-------------|------|--------|
| 1 | **A tela roda em memória do navegador** — busca 1000 leads e filtra tudo no cliente (temperatura, origem, vendedor, período, valor, busca textual). Com 957 leads a janela já estava quase cheia | `useLeadsList.ts:38–50` | ⚠️ **parcial** — a fase 2 levou o filtro **de funil** para o servidor; os demais filtros seguem no cliente |
| 2 | **903 cards montados no DOM ao mesmo tempo** — sem virtualização nem paginação; a coluna "Novo" sozinha é 94% da base | `kanban/KanbanColumn.tsx:82` | ✅ resolvido na fase 4 — 40/coluna + "Carregar mais 40" |
| 3 | **A barra de métricas mostra zero por construção** — taxa de conversão, tempo médio e valor médio são calculados sobre leads convertidos, que o filtro padrão **já removeu da lista** antes do cálculo. Resultado sempre `0,0% · 0 dias · —`. São 52px permanentes exibindo informação falsa | `leadMetrics.ts:39–63` ← `useLeadsList.ts:71` | ⬜ fase 3 (remoção da barra) |
| 4 | **Nenhum caminho por teclado para mover um lead** — o arraste usa a API nativa do navegador, só mouse. A plataforma **já tem a solução instalada e validada** na tela de Rodízio | `LeadsKanban.tsx:53–110` · solução em `RotationQueueManager.tsx:141–144` | ✅ resolvido na fase 4 — `@dnd-kit` com `KeyboardSensor` e menu "Mover para…". ⚠️ `sortableKeyboardCoordinates` **não** serve: exige `SortableContext`. Ver `boardKeyboardCoordinates.ts` |
| 5 | **A etapa de fechamento é constante no código** — soltar na última coluna dispara o modal de conversão porque o id está fixo | `LeadsKanban.tsx:88` (`CLOSING_STAGE_ID`) | ✅ resolvido na fase 4 — passa a olhar `stage.kind === 'ganho' \| 'perda'` |

### 3.3. O caso de borda que precisa de resposta antes de virar código

**"O lead que sumiria":** Lucas é dono de um lead que está **apenas** no funil `Módulos`, ao qual ele não tem acesso. Com interseção pura, o lead desaparece da tela do próprio dono — sem erro, sem aviso.

**Resolvido assim** (virou a decisão 4 do dono): *o funil filtra o board, nunca a existência do lead.* Na visão **Lista** o vendedor sempre vê tudo que é dele, com a coluna Funis mostrando `Módulos 🔒` em vez do nome clicável — ele sabe que o lead existe e onde está, só não abre aquele board.

> É por isso que `lead_funnel_entries_select` carrega o ramo `seller_handles_lead` e que o filtro de funis acessíveis vive **na query do board, não na policy**. Quem mexer na RLS precisa saber disso: não é descuido, é a decisão.

---

## 4. O que está em produção AGORA

⚠️ **As 6 migrations FORAM aplicadas em produção em 2026-07-24.** O corpo do PR #371 afirma o contrário — ele está desatualizado e não foi corrigido. Não confie nele; confie nesta seção.

Registro em `supabase_migrations.schema_migrations` (a `version` é o timestamp de aplicação, o `name` é o arquivo):

| version | name |
|---------|------|
| `20260723210001` | `20260723120000_lead_funnels_schema` |
| `20260723210002` | `20260723121000_lead_funnels_rls` |
| `20260723210003` | `20260723122000_lead_funnels_backfill` |
| `20260723210004` | `20260723123000_lead_funnels_rpcs` |
| `20260723210005` | `20260723124000_lead_default_membership` |
| `20260723210006` | `20260723125000_lead_funnels_rls_hardening` |

**Estado verificado em 2026-08-04:**

```
funis  etapas  participações  leads  órfãos
  1      6         3262        3262     0
```

Eram 2.801/2.801 em 24/07. Os **461 leads que entraram desde então ganharam participação automática** pelo trigger `leads_assign_default_funnel_membership`, sem intervenção. O modelo está se sustentando sozinho em produção há mais de 10 dias.

**As duas correções de RLS aplicadas depois (migration `20260723125000`) seguem vivas:**

- `lead_funnel_access_select` — com escopo de loja (`current_store_id()`) ✓
- `lead_funnel_entries_guard_update` — **BEFORE UPDATE**, tornando `lead_id` e `funnel_id` imutáveis ✓

> Para conferir o estado a qualquer momento, do worktree:
> ```bash
> supabase db query --linked -o csv "select (select count(*) from public.lead_funnels) funis, (select count(*) from public.lead_funnel_entries) participacoes, (select count(*) from public.leads) leads, (select count(*) from public.leads l where not exists (select 1 from public.lead_funnel_entries e where e.lead_id=l.id)) orfaos"
> ```

### Como migrations chegam em produção neste projeto

**À mão.** O workflow `.github/workflows/db-deploy.yml` existe mas é **decorativo**: os secrets `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF`/`SUPABASE_DB_PASSWORD` estão vazios, e toda execução reporta `Supabase secrets not set — skipping db push (no-op)`. Ele fica verde porque **pula**, não porque aplica.

⚠️ **Não ative esses secrets sem antes reconciliar o histórico.** A tabela grava `version` = timestamp de aplicação, não o prefixo do arquivo — hoje **115 dos 199** arquivos locais não têm version correspondente no remoto. Se o `db push` for habilitado como está, ele tentará reaplicar 115 migrations. Isso é condição antiga do repositório, não desta feature.

---

## 5. Estado do PR #371

| | |
|---|---|
| Estado | **Aberto**, não mergeado · 37 commits · 47 arquivos · +8.888/−64 |
| Testes | 2.348 passando (298 arquivos) — verificado 2026-08-04 |
| Type-check | **zero erros novos**; os 2 que aparecem em arquivos tocados são baseline pré-existente (`leadDisplay.ts` `getInitials`, `mock/leads.ts:66`) |
| Distância de `main` | main **62 commits à frente** (última auditoria) |
| CI `rls-regression` | **vermelho, por causa alheia** — ver abaixo |

### O CI vermelho não é desta branch

O `rls-regression` falha na **linha 127**, na asserção de *customers* (`lucas: must not see other sellers' customers without an accessible conversation`). Era falha **repo-wide** desde ~2026-07-14, atingindo várias branches. **Main já corrigiu** em `6f3fcd35` (PR #376, "aplica o portão de instância na leitura de clientes — destrava o CI rls-regression"). Trazer main para a branch deve deixar o CI verde.

### O merge com main é quase limpo

`git merge-tree` acusa **um único conflito textual**: o fim de `supabase/tests/rls-regression.sql`, onde main anexou o bloco `convert_lead_mark` e a branch anexou os blocos de funil. É **puramente aditivo — a resolução é manter os dois**.

Verificações que dão segurança ao merge:

- Main **não tocou** os tokens `--gallo-sev-*` em `styles.css` → a correção de contraste WCAG da branch não corre risco de ser sobrescrita.
- Main **não adicionou provider novo** ao barrel → a numeração "38º provider" (`leadFunnels`) continua válida.
- As 10 migrations novas de main (`20260723165509` em diante) ordenam **depois** das da branch.
- Em `contracts/leads.ts` os dois lados mexeram em partes diferentes: main adicionou `markConverted` ao `ILeadsProvider`; a branch adicionou `funnelId`/`funnelStageId` ao `IListLeadsParams`.

---

## 6. Pendências antes de considerar as fases 1–2 fechadas

1. **Corrigir o corpo do PR #371.** Ele afirma em destaque que as migrations *não* foram aplicadas — é falso e perigoso, alguém pode tentar aplicá-las de novo. Também cita 5 migrations (são 6, falta a `20260723125000`) e 2.340 testes (são 2.348).
2. **Trazer main para a branch** — destrava o CI e resolve o conflito único.
3. **Version bump + changelog.** A branch está em `0.154.0`; main já foi para `0.155.0` (`Weld`). Não há entrada de changelog para o multi-funil. Coerente com a feature ainda não ser visível ao usuário, mas fica pendente até a fase 3 entregar interface.

---

## 7. Débitos técnicos vivos

| Débito | Onde | Impacto se ignorado | Paga em |
|--------|------|---------------------|---------|
| ~~Sem sincronia de escrita `leads` → participação~~ | `supabase/migrations/20260805120000_lead_stage_membership_sync.sql` | **PAGO na fase 3.** Trigger `AFTER UPDATE OF stage` espelha a etapa na participação do funil padrão. ⚠️ **Versionada e NÃO aplicada** — aplicar exige OK do dono. Doc: `docs/dev/lead-funnel-sync.md` | ✅ fase 3 |
| `CLOSING_STAGE_ID` ainda lido | `ConvertLeadModal.tsx` (2×), `LeadsKanban.tsx:88`, `MarkAsLostModal.tsx:63`, `useLeadsList.ts:171`, `leadMetrics.ts:43` | Etapa terminal presa a um id literal, incompatível com funis donos das próprias etapas | Fase 4 |
| Ponte `hexToAccentSlot` | `LeadDataCard.tsx:69`, `LeadHeader.tsx:73`, `KanbanColumn.tsx:65`, `LeadsList.tsx` | Traduz o hex legado de `IPipelineStage.color` para slot. Morre quando o board passar a ler as etapas do funil | Fase 4 |
| `ILead.stage` e `ILead.estimatedValue` marcados deprecated | vários componentes de leads | `estimatedValue` no lead **dobra a receita** no forecast quando o lead vive em 2 funis — é a razão da decisão 5 | Fase 3+ |
| `markConverted` usa `ILeadStage` legado | `contracts/leads.ts` (veio de main) | Conversão ainda é por lead, não por participação — contraria a decisão 6 | Fase 3+ |

---

## 8. Convenções do projeto a respeitar (obrigatório)

- **Componentes consomem APENAS tokens semânticos.** Nunca hex literal, nunca `--gallo-*` direto, nunca paleta Tailwind crua (`bg-red-500`). Severidades via `text-/bg-/border-severity-{info|success|warning|critical}`.
- **Tailwind v4 não gera classe montada por template string.** `` `bg-funnel-${n}` `` produz CSS inexistente. **Sempre mapa de literais.**
- **O projeto não usa `noUncheckedIndexedAccess`.** Todo acesso a mapa indexado por valor vindo do banco precisa de fallback explícito — incidente 2026-07-18: `origin='import'` derrubou `/app/leads` com `undefined.tone`.
- **Comentários em inglês. UI em português do Brasil com acentuação correta.**
- **Interfaces de domínio prefixadas com `I`**; `camelCase` em TS, `snake_case` no banco.
- **Toda migration aplicada deve ser espelhada em `supabase/migrations/` no mesmo PR.**
- **Features nunca importam `@/mocks` nem `@/providers/data/impl/*`** — ESLint bloqueia. Tudo pelo barrel `@/providers/data`.
- **Commits em Conventional Commits, em inglês, atômicos.**
- Timezone: São Paulo por **offset fixo −03:00** (Brasil sem DST desde 2019), como já faz `workSchedule.ts`. Cliente e servidor devem usar a mesma regra — divergir já causou "atrasado" 3h cedo.
- `bun run build` **não** faz type-check. Type-check é `bunx tsc --noEmit`, com baseline pré-existente — avalie **por delta**.

---

## 9. Lições das fases 1–2 (que custaram caro)

- **Ensaio de migration com `ROLLBACK` antes de aplicar.** O ensaio pegou um `42804` (`CASE` resolve para `text`, e `text → enum` não é cast implícito) que **cinco revisões de código não pegaram**. Um literal solto é `unknown` e o Postgres coage; dentro de `CASE`, não.
- **Verificação de trigger por metadados engana.** Em `pg_trigger`, o bit **2** é BEFORE e o **4** é INSERT — testar o bit errado torna a asserção vacuosa. Prefira `pg_get_triggerdef`, e depois **prova funcional**.
- **Escala de severidade era calibrada para superfície (3:1), não para texto (4.5:1).** Ao trocar cores manuais por tokens semânticos, as quatro severidades reprovaram em modo claro pelo menos sobre o tint de 15%. Foram escurecidas em HSL preservando a matiz.
- **`*/` dentro de comentário CSS encerra o comentário** e trunca a folha de estilo na minificação. Um comentário contendo `bg-severity-*/15` quase quebrou o build.
- **Ids derivados de índice no mock colidem.** `entries.length` só é único enquanto o array cresce; `removeEntry` encolhe. Use `crypto.randomUUID()` para ids pós-seed.

---

## 10. Ponto de partida para a fase 3

```bash
cd .claude/worktrees/leads-multi-funil
git fetch origin
# trazer main (resolve o conflito aditivo em supabase/tests/rls-regression.sql: manter os dois blocos)
bun install
bun run test
```

Antes de escrever o plano da fase 3, ler nesta ordem: **§2 (decisões do dono)** → **spec §6 (navegação) e §13** → **§7 deste documento (o débito de sincronia é pré-requisito da fase 3, não opcional)**.
