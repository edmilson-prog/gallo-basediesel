# Spec — Ficha de Lead: detalhe rico, edição inline e rastreabilidade

> **Status:** aprovado pelo dono (2026-07-20) · segue para plano de implementação
> **Rota:** `/app/leads/:id` (`LeadDetailPage`)
> **Origem:** consulta de design (2026-07-20) sobre a página de detalhe do lead —
> "quanto mais rico e mais rastreabilidade melhor; prefiro edições inline com
> botão flutuante para salvar". Mockup de leitura aprovado antes desta spec.

## Problema

A página de detalhe do lead entrega pouco para o volume de leads que a Funnel
Frente 3 trouxe (~2.5k conversas ancoram em lead). Três lacunas concretas:

1. **Card "Dados do lead" plano.** Grade rótulo→valor de peso uniforme; temperatura
   e origem viram texto cinza (o header e a ficha lateral já as mostram como badges
   coloridos — o card é um downgrade). As **tags somem por completo quando o lead
   não tem nenhuma** (`lead.tags.length > 0`), então o lead nunca "convida" a
   etiquetar.
2. **Edição pobre.** O modo de edição atual cobre só temperatura, valor estimado e
   próxima ação, num bloco único dentro do card; não edita tags nem e-mail.
3. **Rastreabilidade crua.** A aba Histórico lê `audit_logs`, mas renderiza um diff
   de JSON bruto (`{...} → {...}`). A aba Notas é um placeholder vazio.

## Objetivos

- Card de dados **rico, hierárquico e colorido** (leitura), reaproveitando a
  linguagem visual da ficha lateral (`LeadProfileFiche`) e do header.
- **Edição inline** de temperatura, valor estimado, próxima ação, **tags** e e-mail,
  com **barra flutuante de salvar** — o mesmo padrão do detalhe de produto
  (v0.153.0 "Emend").
- **Timeline de rastreabilidade** legível na aba Histórico, com cada alteração de
  campo como sua própria linha ("Campo: antes → depois"), autor e tempo relativo.
- **Aba Notas** funcional (listar + adicionar), backed por armazenamento próprio.

## Não-objetivos (v1)

- @menção em notas de lead (o `conversation_notes` tem; aqui fica como follow-up).
- Edição inline de nome, telefone e estágio (estágio já tem o fluxo do kanban;
  nome/telefone são identidade — fora do conjunto "de trabalho").
- Timeline unificada mesclando conversas/notas no mesmo fluxo do histórico (o
  dono escolheu a "timeline completa" de auditoria, não a unificada).
- Re-ancoragem de conversa na conversão (follow-up herdado do PR #339, à parte).

## Abordagem geral

Reaproveitar padrões existentes — consistência acima de invenção:

- **Edição inline** espelha `PartDetailPage` (catálogo): estado `editing` + objeto
  `draft` na página; os cards renderizam inputs quando `editing`; uma **barra fixa
  no rodapé** (`sticky bottom-0 z-10 border-t bg-card/95 backdrop-blur`) com
  Cancelar / Salvar (spinner enquanto salva). Um único "Salvar" persiste o draft
  inteiro, audita e invalida as queries.
- **Notas** espelham `customer_notes`: tabela nova `lead_notes` com RLS derivada da
  visibilidade do `leads` (quem enxerga o lead, enxerga/escreve suas notas).
- **Rastreabilidade** enriquece a aba Histórico já existente (que já consome o
  `auditsProvider`) — sem novo subsistema.

## Componentes e dados

### Parte 1 — `LeadDataCard` rico (leitura)

Materializa o mockup aprovado. Estrutura:

- **Faixa de status** (topo, separada por borda): badge de estágio (borda na cor
  `stage.color`), temperatura (`TEMPERATURE_META.tone`), origem (`ORIGIN_META.tone`),
  e badges de **Convertido**/**Perdido** quando aplicável.
- **Bloco de tags** sempre presente: chips legíveis; quando vazio, um estado vazio
  discreto ("Sem tags" + affordance de adicionar no modo edição).
- **Fatos agrupados** em três clusters com micro-eyebrows:
  - **Comercial:** valor estimado (com affordance "+ definir" quando vazio e
    editável), próxima ação como **chip de urgência** (`getNextActionInfo.tone`).
  - **Contato:** telefone, e-mail.
  - **Gestão:** vendedor responsável (chip com avatar-iniciais), criado em,
    **no estágio há** (`daysInStage`, util já existente sem uso na tela). Nota:
    não se exibe um "última atividade" separado — ele derivaria do mesmo
    `updatedAt` de `daysInStage` e seria redundante; a atividade real vive no
    timeline da aba Histórico (Parte 3).

Somente tokens semânticos; nenhuma cor bruta nova. `getOriginMeta` já é null-safe.

### Parte 2 — Edição inline + barra flutuante

- Novo util **`src/features/leads/utils/leadDraft.ts`** (testado, espelha
  `catalog/utils/draft.ts`):
  - `toLeadDraft(lead): ILeadDraft` — campos editáveis como strings de formulário.
  - `validateLeadDraft(draft): ILeadDraftErrors` — valor numérico válido, e-mail
    bem-formado quando preenchido, tag não vazia/duplicada.
  - `buildLeadPatch(lead, draft): Partial<ILead>` — só os campos que mudaram.
- **`ILeadDraft`** cobre: `temperature`, `estimatedValue` (string), `nextActionAt`
  (yyyy-mm-dd), `email`, `tags` (string[]).
- A página (`LeadDetailPage`) passa a **dono** de `editing`/`draft`/`errors`/`saving`
  e renderiza a barra fixa (mesmas classes do `PartDetailPage`). O `LeadDataCard`
  recebe `editing`/`draft`/`onDraftChange`/`errors` e renderiza inputs inline:
  - temperatura → `Select` (com ícones do `TEMPERATURE_META`);
  - valor estimado → `Input` decimal;
  - próxima ação → `Input type=date`;
  - e-mail → `Input`;
  - **tags → editor de chips**: cada tag com `×` para remover; um `Input` que
    adiciona no Enter/vírgula (normaliza trim, ignora duplicada/vazia).
- **Salvar** chama `provider.update(id, buildLeadPatch(...))`, audita (Parte 3),
  invalida `["lead", id]` e `["leads-list"]`, sai do modo edição. **Cancelar**
  descarta o draft. Gate: `usePermission("lead","edit")` **e** não convertido/perdido
  (a RLS `leads_update` cobre staff/dono; a página só abre para eles).
- Remove-se o antigo bloco de edição embutido no `LeadDataCard` (substituído pelos
  inputs inline + barra flutuante).

### Parte 3 — Timeline de rastreabilidade (aba Histórico)

- **Renderização legível** substitui `formatDelta` (JSON cru). Novo engine puro
  **`src/features/leads/engine/leadHistory.ts`** (testado):
  `describeLeadAudit(entry): { icon, title, lines: string[] }` — traduz `action`
  para título + ícone e o par `before`/`after` em linhas por campo, formatadas por
  tipo:
  - temperatura → rótulo (`TEMPERATURE_META`);
  - valor estimado → `formatBRL`;
  - próxima ação → data BR;
  - tags → diff "+ adicionada X" / "− removida Y";
  - e-mail/estágio → texto "antes → depois".
  Campos desconhecidos degradam para `chave: valor` (nunca quebra — lição do
  incidente `origin='import'`).
- **Auditoria completa no save.** O save inline passa a auditar **todos** os campos
  alterados (hoje só temperatura/valor/próxima ação, e ignora tags/e-mail): um
  evento `lead.updated` com `before`/`after` cobrindo cada campo do patch. Os marcos
  de ciclo de vida (mudança de estágio pelo kanban, conversão, perda) permanecem
  eventos próprios com ícones distintos. Verificar na implementação que a mudança
  de estágio pelo kanban de fato emite `lead.stage_changed`; se não, adicionar.
- O timeline exibe cada campo alterado como **sua própria linha**, com autor
  (resolvido do `actorId` → seller) e tempo relativo.

### Parte 4 — Aba Notas

- **Tabela nova `lead_notes`** (migration versionada, espelha `customer_notes`):
  `id text pk`, `lead_id text not null references leads(id) on delete cascade`,
  `author_id text not null references sellers(id)`, `content text not null`,
  `created_at timestamptz default now()`. Índices em `lead_id` e `created_at`.
  **RLS**: SELECT/INSERT derivados da visibilidade do `leads` (quem pode ler o lead
  pode ler/inserir notas dele) — mesmo mecanismo derivado do `customer_notes`.
  INSERT exige `author_id = current_seller_id()`.
- **Provider**: métodos `listNotes(leadId): Promise<ILeadNote[]>` e
  `addNote(leadId, content, authorId): Promise<ILeadNote>` no `ILeadsProvider`
  (mock + supabase). Tipo `ILeadNote` novo em `shared/types/lead.ts`.
- **UI**: a `NotesTab` lista as notas (autor + tempo relativo, mais recente no topo)
  e um composer (textarea + "Adicionar") faz o append otimista + invalida a query.

## Testes e gates

- **Vitest (engines puros):** `leadDraft` (validação, patch só-mudanças, tags
  dedup/trim), `leadHistory.describeLeadAudit` (cada tipo de campo + degradação
  segura).
- **Dry-run da migration `lead_notes`** contra o schema real de produção dentro de
  `begin; … rollback;`, impersonando staff e não-staff via `set_config` do JWT —
  confirmar que a visibilidade das notas espelha a do lead.
- **`rls-regression.sql`** ganha cobertura de `lead_notes` (dono lê/insere; sem
  acesso ao lead → vazio).
- Suíte completa (`bun run test`) + `bun run build` verdes; `tsc --noEmit` sem erros
  novos por delta.
- Revisão adversarial multi-agente do diff antes do merge.

## Rollout (gates do dono)

1. PR com a migration `lead_notes` **versionada** + frontend juntos.
2. `apply_migration` em prod **só com OK do dono** — frontend fail-soft: a aba Notas
   mostra vazio se a tabela ainda não existir (nunca quebra).
3. Smoke: abrir um lead, editar temperatura/valor/próxima ação/tags/e-mail e salvar
   pela barra flutuante; conferir o timeline do Histórico com as linhas por campo;
   adicionar uma nota.

## Follow-ups registrados (fora de escopo)

- @menção em notas de lead.
- Edição inline de estágio/nome/telefone.
- Re-ancoragem de conversa na conversão lead→cliente (herdado do PR #339).
- Copiloto em conversa-lead (gated em `customerId` — decisão de produto).
