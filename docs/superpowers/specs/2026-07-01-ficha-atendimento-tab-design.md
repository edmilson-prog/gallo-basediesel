# Spec — Aba "Atendimento" na ficha do cliente (nova aba padrão + contato pendente realocado)

**Data:** 2026-07-01
**Feature:** `src/features/customers` (ficha do cliente) — reaproveita `src/features/contact-review` e `src/features/conversations`
**Tipo:** Entrega 100% frontend (sem migration, sem RLS nova, sem RPC, sem Edge — todos os campos consumidos já existem)
**Status:** Design aprovado — pronto para plano de implementação
**Worktree:** `.claude/worktrees/ficha-atendimento-tab` (branch `worktree-ficha-atendimento-tab`, a partir da `main`)

---

## 1. Problema / motivação

A ficha do cliente (`ProfileTabs`) tem hoje a aba **"Visão geral"** como padrão, e o
card de contato pendente (`PendingContactBanner`, feature `contact-review`) fica
sempre visível **acima das abas**, mas só no contexto de coluna/gaveta usado dentro
da tela de Atendimento (`ProfileHeader.tsx`). A página completa `/app/clientes/:id`
usa um header diferente (`CustomerDetailHeader.tsx`) que **nunca** renderiza esse
banner — hoje um contato pendente de revisão fica **invisível** para quem abre a
ficha pela rota direta.

**Regra de negócio desejada:** consolidar a operação de atendimento (revisão de
contato pendente + status da conversa + quem atende + por qual número) numa aba
própria, dedicada e descobrível, que se torna a aba padrão da ficha — nos dois
contextos onde a ficha existe.

## 2. Decisões tomadas (Q&A)

| Decisão | Escolha |
|---|---|
| **Onde a aba aparece** | Nos dois lugares: coluna/gaveta do Atendimento **e** página completa `/app/clientes/:id` (mesmo `ProfileTabs` compartilhado) |
| **Escopo de conteúdo** | Além do banner realocado, inclui 3 blocos de contexto: status da conversa, atendente responsável, conta/número do WhatsApp em uso |
| **Ícone e posição** | `mdi:face-agent`, primeira aba (antes de "Visão geral") |
| **Nome da aba** | "Atendimento" |
| **Aba padrão** | Sim — troca "Visão geral" como aba ativa ao abrir a ficha |
| **Indicador de pendência no gatilho** | Sim — ponto de destaque sobre o ícone da aba quando `customer.tags` inclui `pending_review` (não aparece em `reviewed_not_customer`, que é estado resolvido/neutro) |
| **Layout do conteúdo** | Cartão de lista (rótulo à esquerda, valor à direita, com divisores) — mesmo padrão visual do card "Status & Carteira" já existente na Visão geral |
| **Status da conversa: ler ou editar** | **Interativo** — embute o `StatusControl` já existente (não um badge somente-leitura novo) |

## 3. Estrutura de código (unidades)

### 3.1 Nova `TabKey` + ordem + ícone — `src/features/customers/components/ProfileTabs.tsx`

- `TabKey` (linhas 35–44) ganha `"atendimento"`.
- `TAB_ORDER` (linhas 45–54): `"atendimento"` entra **primeiro**, antes de `"overview"`.
- `TAB_ICONS` (linhas 56–66): `atendimento: "mdi:face-agent"`.
- Aba padrão: `useState<string>("overview")` (linha 130) → `useState<string>("atendimento")`.
- Novo `TabsContent value="atendimento"` (mesmo padrão lazy-mount dos demais, linhas 172–199) renderizando o novo `AtendimentoTab`, recebendo `customer` e `conversation` (já disponível no componente — hoje só é repassado para `ConversationsTab`).

### 3.2 Novo componente — `src/features/customers/components/tabs/AtendimentoTab.tsx`

Segue o mesmo padrão dos demais arquivos de `tabs/` (ex.: `OverviewTab.tsx`). Props:
`{ customer: ICustomer; conversation?: IConversation | null }`.

Composição:

1. **Zona de atenção** — `<PendingContactBanner customer={customer} conversation={conversation} />`
   quando `customer.tags` inclui `pending_review` ou `reviewed_not_customer` (mesma
   condição usada hoje em `ProfileHeader.tsx`).
2. **Zona de contexto** (só quando `conversation` existe — ver §5) — cartão com 3 linhas:
   - **Status da conversa** → `<StatusControl conversation={conversation} mode="menu" onChanged={...} />`
     (mesmo componente do cabeçalho da conversa, `src/features/conversations/components/status/StatusControl.tsx`;
     já degrada sozinho para somente-leitura via `usePermission("conversation","edit","own")`
     quando o usuário não pode editar — nenhum trabalho extra de permissão aqui).
   - **Atendente responsável** → `<AssigneeChip seller={seller} variant="compact" />`
     (`src/features/conversations/components/AssigneeChip.tsx`), resolvendo
     `conversation.assignedSellerId` → `ISeller` via `useSellersProvider().get(id)`
     (mesmo padrão de `StatusWalletCard.tsx`, `useQuery` com `staleTime` e `enabled`
     guardando o caso `assignedSellerId` nulo).
   - **Respondendo por** (origem WhatsApp) → `<OriginChip account={account} variant="label" />`
     (`src/features/conversations/components/OriginChip.tsx`), resolvendo
     `conversation.whatsappAccountId` → `IWhatsAppAccount` via
     `useWhatsAppAccountsProvider().get(id)` (mesmo padrão de query).

Nenhum bloco novo aparece quando não há dado — cartão de contexto inteiro é omitido
sem `conversation`; cada linha some se o respectivo id for nulo (ex.: conversa ainda
sem atendente atribuído).

### 3.3 Indicador de pendência no gatilho da aba — `ProfileTabs.tsx`

`ProfileTabTrigger` (linhas 78–110) ganha uma prop opcional `showPendingDot` — um
`<span>` `aria-hidden` posicionado sobre o ícone (`bg-warning`, círculo pequeno),
renderizado só quando `customer.tags.includes("pending_review")`. O rótulo
acessível (`aria-label`/`TooltipContent`, hoje só `CUSTOMER_STRINGS.tabs.atendimento`)
ganha um sufixo condicional (ex.: `` `${label} — pendência de revisão` ``) para que
o leitor de tela saiba do estado mesmo sem ver o dot.

### 3.4 Remoção do banner de `ProfileHeader.tsx`

Remove o bloco condicional (linhas 71–73) e o import de `PendingContactBanner`
(linha 16) — o header volta a conter só avatar, badges, contato e `CoverageBanner`.
Nenhuma outra responsabilidade do header muda.

### 3.5 Aba padrão na página completa — `src/features/customers/pages/CustomerDetailPage.tsx`

`useState<TabKey>("overview")` (linha 27) → `useState<TabKey>("atendimento")`.

### 3.6 i18n — `src/features/customers/i18n/pt-BR.ts`

Bloco `tabs` (linha ~47) ganha `atendimento: "Atendimento"`. Novo bloco (ou extensão
do existente) para os rótulos do cartão de contexto: "Status da conversa",
"Atendente responsável", "Respondendo por".

## 4. UX

- **Descoberta:** por ser a aba padrão, o primeiro paint da ficha já mostra o
  banner (quando aplicável) sem nenhuma ação do usuário. O dot no gatilho cobre o
  caso de o usuário ter navegado para outra aba.
- **Consistência visual:** o cartão de contexto reaproveita o mesmo padrão de linhas
  rótulo/valor com divisor (`border-t border-border`) já usado em
  `StatusWalletCard.tsx` — sem inventar um novo idioma visual.
- **Reuso, não duplicação:** `StatusControl`, `AssigneeChip` e `OriginChip` já
  existem e já são usados juntos no cabeçalho da conversa
  (`ConversationHeader.tsx`, linhas ~178–190) — a aba só os recompõe em outro lugar.
- **Acessibilidade:** dot é `aria-hidden` + reforço textual no `aria-label`/tooltip
  (§3.3); navegação por teclado entre abas (setas) já é nativa do Radix e não muda;
  `StatusControl` já cuida de `aria-label`/tooltip/permissão sozinho.
- **Modo do `StatusControl`:** fixado em `mode="menu"` na aba (mais compacto),
  independente da preferência pessoal salva em `localStorage`
  (`gallo-conversation-status-control-mode`) usada no cabeçalho da conversa — a
  aba tem menos espaço horizontal que o header, então não herda esse ajuste.

## 5. Comportamento por contexto (coluna/gaveta × página completa)

| | Coluna/gaveta (`CustomerProfile variant="column"`, dentro do Atendimento) | Página completa (`/app/clientes/:id`) |
|---|---|---|
| `conversation` disponível? | Sim (vem de `ConversationPage` → `CustomerProfileFiche`) | Não (`CustomerDetailPage` não passa `conversation` a `ProfileTabs`) |
| Banner de contato pendente | Aparece (baseado em `customer.tags`, independe de conversa) | Aparece (mesma condição) |
| Cartão de contexto (status/atendente/origem) | Aparece | **Não aparece** — não há uma "conversa atual" para descrever |

Essa assimetria é intencional e já era esperada desde o brainstorming — a página
completa não perde nada que tinha hoje (ela nunca mostrou o banner nem o cartão);
ela ganha o banner.

## 6. Erros / estados

- `customer.tags` sem `pending_review`/`reviewed_not_customer` → sem banner (aba só
  mostra o cartão de contexto, se houver `conversation`).
- `conversation` nulo/ausente → cartão de contexto inteiro omitido (não renderiza
  scaffolding vazio).
- `assignedSellerId`/`whatsappAccountId` nulos, ou query falhando → a linha
  correspondente do cartão some (mesmo padrão de fallback silencioso já usado em
  `StatusWalletCard` para o vendedor da carteira).
- Usuário sem permissão de editar status → `StatusControl` já renderiza só o
  `StatusPill` estático (comportamento existente do componente, nada a construir).

## 7. Testes (Vitest)

Não há engine puro novo — é composição de componentes existentes. Cobertura via:

- `bun run build` (delta de tipos no código novo) + `bun run test` (suíte completa,
  sem regressão nos arquivos tocados).
- Verificação manual pelo dono (padrão do projeto — ver `docs/dev/ux-guidelines.md`)
  nos dois contextos (coluna do Atendimento e página completa), cobrindo: cliente
  com `pending_review`, cliente com `reviewed_not_customer`, cliente sem tag,
  conversa com/sem atendente atribuído, conversa com/sem conta WhatsApp.

## 8. Não-objetivos (escopo fechado)

- **Sem** novo componente de status somente-leitura (`ConversationStatusBadge`) —
  decisão final foi reaproveitar o `StatusControl` interativo.
- **Sem** mudanças na Visão geral além de deixar de ser a aba padrão — nenhum card
  seu (`MetricsCard`, `CadastraisCard`, `StatusWalletCard`, `TagsCard`, `PortalCard`)
  é alterado.
- **Sem** SLA, sem indicadores de tempo de resposta — fora do que foi decidido
  nesta rodada; blocos futuros ficam para uma próxima entrega.
- **Sem** mudança no comportamento de `PendingContactBanner` em si (Converter /
  Descartar / Restaurar) — só muda **onde** ele é renderizado.
- **Sem** correção do problema pré-existente de a aba ativa não resetar ao trocar
  de cliente sem desmontar o componente (ver §9) — fora de escopo desta entrega.

## 9. Riscos / observações

- **Estado de aba ativa entre clientes:** `ProfileTabs` guarda a aba ativa em
  `useState` interno; ao navegar de uma conversa/cliente para outro **sem
  desmontar** `CustomerProfile` (não há `key={customerId}` em
  `CustomerProfileFiche`/`ConversationPage.tsx`), a aba ativa persiste do cliente
  anterior. Esse comportamento **já existe hoje** com `"overview"` como padrão —
  não é uma regressão introduzida por esta mudança, só um registro para não ser
  confundido com bug novo durante a validação manual.
- **Resolução de `ISeller`/`IWhatsAppAccount`:** feita dentro do próprio
  `AtendimentoTab` via `useQuery` (mesmo padrão de `StatusWalletCard`), não
  repassada como prop desde `ConversationPage` — mantém `AtendimentoTab`
  autocontido, ao custo de uma query adicional por ficha aberta (aceitável: mesma
  troca já feita por `StatusWalletCard` para o vendedor da carteira).
- **`STATUS_META`/`StatusControl` já existem em `main`** (não é WIP de outra
  branch) — confirmado lendo o código desta worktree, que parte de `origin/main`.
  Não há conflito esperado com a branch `feat/unify-conversation-status-control`
  (trabalho anterior, não relacionado a este escopo).
