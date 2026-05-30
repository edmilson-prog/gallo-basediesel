# Design — Redistribuição de layout do detalhamento do veículo

- **Data:** 2026-05-29
- **Rota afetada:** `/app/veiculos/$id`
- **Branch:** dedicada (`feat/vehicle-detail-layout`)
- **Tipo:** melhoria de UI/UX (sem mudança de dados, rotas ou providers)

## Problema

No detalhamento do veículo sobra muito espaço lateral em telas largas (1680–1920px) e os elementos ficam mal distribuídos. Diagnóstico do especialista de UI/UX:

1. **Container estreito + header largo.** O corpo está em `max-w-5xl` (1024px) centralizado, mas o header é full-bleed. Em 1900px sobram ~440px de cada lado e o header não alinha verticalmente com o conteúdo — o desalinhamento é o que mais evidencia o vazio.
2. **Grade 2:1 dentro de container estreito** = duas colunas estreitas; Dados Técnicos ainda subdivide em 2 colunas → cards minúsculos (três níveis de afunilamento).
3. **Blocos "altos e magros"** (histórico vazio, recomendações curtas, owner de uma linha) → página comprida e esparsa, o oposto do que telas largas pedem.
4. **5 cards cinza idênticos** em Dados Técnicos sem hierarquia (Km e VIN, acionáveis, têm o mesmo peso de "Cadastrado em").

## Decisão

Adotar **bento de 12 colunas + faixa de stats** sobre container `max-w-7xl`, com 4 polimentos aprovados. Abordagem de App-shell com rail fixo foi descartada (prematura para Fase 1; revisitar na Fase 2 quando o histórico tiver volume real).

## Solução detalhada

### 1. Trilho de largura unificado (`max-w-7xl`)
- Header e corpo compartilham `mx-auto w-full max-w-7xl px-4 sm:px-6`.
- O header permanece full-bleed na borda (`border-b bg-card`), mas o **conteúdo interno** ganha o mesmo trilho → back link, identidade e ações (Editar / Adicionar manutenção) alinham com o corpo.
- `max-w-7xl` (1280px) alinha o veículo às páginas de loja/catálogo/carrinho já existentes no projeto, removendo a inconsistência de ser a única página operacional presa em 5xl.

### 2. Header com hierarquia (`VehicleDetailHeader.tsx`)
- **Placa** → chip mono: `rounded border border-border bg-muted px-1.5 font-mono uppercase`.
- **Badge de status** → `text-xs`, posicionado logo após o H1 (estado de cadastro legível à distância). Mantém `STATUS_BADGE_CLASSES`.
- **Ícone da marca** → `bg-primary/10 text-primary` no lugar do quadrado `bg-muted` cinza.

### 3. Faixa de stats — Dados Técnicos (`VehicleTechSpecs.tsx`)
- O `dl` deixa de ser 5 cards soltos (`sm:grid-cols-2`) e vira **faixa full-width** entre header e corpo:
  - `grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden sm:grid-cols-3 lg:grid-cols-5`.
  - Cada célula: `bg-card px-4 py-3`; label `text-[10px] uppercase tracking-wide text-muted-foreground`; valor `text-sm`.
  - Hairlines de 1px via o truque `gap-px` + pai `bg-border` + células `bg-card`.
  - Células na ordem: **Motor · Chassi/VIN · Placa · Km atual · Cadastrado em**.
  - Km mantém edição inline + `tabular-nums`; VIN mantém o toggle revelar/ocultar e o AlertDialog de mudança grande de Km permanece intacto.
- O `SpecRow` atual é substituído por um subcomponente de célula da faixa (`StatCell`).

### 4. Corpo em bento de 12 colunas (`VehicleDetailPage.tsx`)
```
<div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
  <div className="space-y-6 lg:col-span-8">        {/* lane de trabalho */}
    <ServiceHistoryTimeline />
    <MaintenanceRecommendations />
  </div>
  <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-6 lg:self-start"> {/* contexto */}
    <VehicleOwnerCard />
    <CompatiblePartsPlaceholder />
  </aside>
</div>
```
- **Ordem vertical dentro do trilho do corpo:** (1) `VehicleStatusBanner` quando pendente/rejeitado, full-width; (2) faixa de stats (Dados Técnicos), full-width; (3) bento 12-col. O banner vem antes da faixa por ser alerta de ação prioritária.
- `MaintenanceRecommendations` mantém `md:grid-cols-2` — agora com folga na lane de ~830px.
- O rail `sticky` absorve o desbalanço vertical enquanto o histórico estiver curto (sem `items-stretch`).
- Abaixo de `lg`, tudo empilha em coluna única (`grid-cols-1`).

### 5. Estado vazio do histórico mais rico (`ServiceHistoryTimeline.tsx`)
- Mantém o container, mas renderiza a **espinha da timeline (`border-l`) + 2–3 nós fantasma** (dots low-opacity + linhas skeleton `bg` translúcido).
- CTA `+ Registrar manutenção` que reusa o fluxo existente (`onAddService`). Isso exige passar `onAddService` (e `canEdit` para condicionar) ao componente — hoje ele só recebe `vehicle`.
- Dica: "O histórico também é preenchido automaticamente a partir de pedidos."
- O estado **preenchido** (com `serviceHistory`) permanece exatamente como está.

### 6. Ritmo de espaçamento
- Padding de card unificado em `px-4 py-3` (hoje mistura `px-3 py-2` / `px-3 py-3` / `px-2 py-1.5`).
- `space-y-6` entre seções; `space-y-3` interno às seções.

## Strings (i18n pt-BR)
Adicionar a `VEHICLE_STRINGS.detail` apenas:
- `history.emptyCta`: "Registrar manutenção"
- `history.emptyAutoHint`: "O histórico também é preenchido automaticamente a partir de pedidos."

Todas com acentuação correta (UTF-8).

## Não-objetivos (fora de escopo)
- Sem mudança de dados, rotas, providers, RBAC ou regras de manutenção.
- Sem App-shell de rail fixo (Fase 2).
- Sem alterar o estado preenchido do histórico, os modais (Edit/AddService), nem o fluxo de aprovação/rejeição.
- Sem novos pacotes.

## Arquivos afetados
- `src/features/vehicles/pages/VehicleDetailPage.tsx` — container, alinhamento, faixa de stats no topo, bento 12-col, passar `onAddService`/`canEdit` ao histórico.
- `src/features/vehicles/components/detail/VehicleDetailHeader.tsx` — trilho interno + hierarquia (placa-chip, badge, ícone tintado).
- `src/features/vehicles/components/detail/VehicleTechSpecs.tsx` — `dl` → faixa de stats; `SpecRow` → `StatCell`.
- `src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx` — empty-state com nós fantasma + CTA; novas props.
- `src/features/vehicles/i18n/pt-BR.ts` — 2 strings novas.
- (Possível ajuste leve de padding em `MaintenanceRecommendations.tsx` / `CompatiblePartsPlaceholder.tsx` / `VehicleOwnerCard.tsx` para o ritmo `px-4 py-3`.)

## Verificação
- `bun run build` (gate real — vite + tsc noEmit) deve passar.
- `bunx eslint` nos arquivos tocados, sem erros.
- Filtrar `tsc --noEmit` apenas aos arquivos tocados (o projeto tem erros pré-existentes não relacionados).
- Validação visual manual pelo usuário (não abrir browser/preview automaticamente).

## Consistência
`max-w-7xl` casa com as páginas de loja/catálogo/carrinho/produto já existentes. As páginas tipo documento (pedido/orçamento) usam `max-w-5xl` por serem document-like; o detalhe de veículo é operacional/content-rich, logo `max-w-7xl` é a família correta.
