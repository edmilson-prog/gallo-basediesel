# Design — PRD-025 Copiloto de Vendas (decisões de implementação)

> **Data:** 2026-05-31
> **Autor:** Claude (Claude Code CLI) + Edmilson Souza
> **Relação:** complementa o `docs/prds/PRD-025-copiloto-vendas.md`, fixando as decisões de **acomodação visual e arquitetura de implementação** que o PRD deliberadamente deixou abertas ("descritivo/aberto na acomodação visual").
> **Status:** aprovado para planejamento (writing-plans).

---

## 1. Objetivo deste documento

O PRD-025 é prescritivo no produto/arquitetura (três variantes, contrato de provider, entidade de sugestão, separação orientação × resposta, privacidade, recorte Fase 1 × Fase 2) e **aberto** no layout fino, na variante default e nas microinterações. Este documento fecha essas pontas com base em:

- Os dois protótipos do arquiteto (`docs/html/gallo-copiloto-mockup*.html`).
- Inteligência de design (skill `ui-ux-pro-max`): densidade, progressive disclosure, cor semântica, acessibilidade.
- Um protótipo navegável evoluído, validado pelo usuário no visual companion (`.superpowers/brainstorm/.../copiloto-variantes.html`).
- O estado real do código (Provider Pattern, tela de atendimento, Ficha, escalonamento SDR).

O desafio central declarado: **muita informação na mesma tela** (já são 4 colunas) sem sobrecarregar o vendedor no momento de responder.

---

## 2. Decisões de design

### D1 — Variante default: `strip` (faixa sobre o input)

As três variantes (`strip` · `tab` · `card`) são implementadas e alternáveis por `VITE_COPILOT_PLACEMENT` (requisito RF-001/RF-002). O **default é `strip`** porque:

- Coloca orientação **e** resposta no ponto exato onde o olho do vendedor está ao responder (o "momento decisivo").
- É a evolução natural da "Sugestões IA" que já existe no `MessageInput`.
- `tab` exige clique → enfraquece o alerta proativo (fica como o lar de _consulta_ aprofundada). `card` dá visibilidade máxima mas fica longe do input e ocupa espaço vertical permanente do chat.

### D2 — Filosofia de densidade: repouso discreto + progressive disclosure

A faixa tem dois estados; **o repouso é quase invisível** e só cresce quando há valor:

- **Repouso (colapsada) — 1 linha:** bot + a sugestão de **maior severidade** + contador `+N` + selo "só você vê" + chevron. Ordenação: `alert › action › opportunity`, e dentro de cada tipo `high › medium › low`.
- **Expandida:** micro-briefing no cabeçalho + resumo (quando houver) + lista de sugestões + resposta pronta + botão "Gerar resposta" (esqueleto).
- **Auto-expande 1×** quando chega um `alert` de severidade alta; respeita o colapso manual do vendedor naquela conversa (não reabre sozinho depois).
- **Briefing não se repete:** a Ficha (coluna direita) já mostra o briefing completo; na faixa ele aparece **condensado em 1 linha** no cabeçalho (`DORMENTE · ABC A · ticket R$34k · recência 85d`). Satisfaz a equivalência de conteúdo (RF-001) sem empilhar caixas.

---

## 3. Especificação visual (tema Black Gold + light/dark)

> Consome **apenas tokens semânticos** (`bg-background`, `text-foreground`, `border-border`, `bg-muted`…) — nunca `--gallo-*` ou hex direto (PRD-001). Ícones via Iconify (`@iconify/react`), nunca emoji.

### 3.1 Cor semântica das sugestões

| Tipo          | Cor                           | Ícone (base)                            | Papel              |
| ------------- | ----------------------------- | --------------------------------------- | ------------------ |
| `alert`       | **âmbar** (`--color-warning`) | `mdi:alert-outline`                     | risco a tratar     |
| `action`      | **azul** (`--color-info`)     | `mdi:receipt-text-outline` (contextual) | próximo passo      |
| `opportunity` | **verde** (`--color-success`) | `mdi:lightbulb-on-outline`              | abertura comercial |

- O **dourado da marca é reservado à "moldura"** do copiloto (cabeçalho, borda, selo) — não pinta as sugestões, evitando competir com o acento da marca.
- **Vermelho fica fora** dos tipos do copiloto (reservado a erro/destrutivo; evita colisão com o tema SERVICE). Por isso `alert` é âmbar, não vermelho.
- **Cor nunca sozinha** (acessibilidade): cada tipo carrega ícone + (opcional) badge de rótulo textual ("Alerta"/"Ação"/"Oportunidade").

### 3.2 Cabeçalho (compartilhado entre variantes)

"Case" dourado-suave com `mdi:robot-outline` + título **Copiloto** + micro-briefing condensado + selo `mdi:lock-outline` **"só você vê"** + chevron de expandir/colapsar.

### 3.3 Item de sugestão (unidade reutilizável)

- Chip de ícone colorido por tipo (com fallback contextual por regra).
- Título em 1 linha com **negrito no termo-chave** ("prazo **2×**", "**em nome da empresa**"); detalhe longo só ao expandir.
- Badge de tom à direita; botão **dispensar** (`mdi:close`, no hover) → remove da superfície na sessão (estado local — RF-010).

### 3.4 Resposta pronta × orientação (separação obrigatória — RF-003)

- Bloco separado por divisória tracejada, rótulo "RESPOSTA", chip com o texto e botão **"Inserir ↑"** → escreve no campo de digitação, **nunca auto-envia**.
- Botão **"Gerar resposta · EM BREVE (IA Fase 2)"** inerte (`aria-disabled`, cursor `not-allowed`) — esqueleto da capacidade futura (RF-012).
- A orientação privada permanece visualmente distinta da resposta destinada ao cliente.

### 3.5 Estados

| Estado              | Comportamento                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Repouso (colapsado) | 1 linha (descrito em D2)                                                                          |
| Sem sugestões       | faixa permanece (hospeda a resposta); micro-texto "Sem alertas no momento" — não vira caixa vazia |
| Carregando          | skeleton de 1–2 linhas (`animate-pulse`)                                                          |
| Erro do provider    | superfície **some graciosamente**; conversa 100% utilizável (RNF-002)                             |

### 3.6 Microinterações & acessibilidade

- Expandir/colapsar 150–250 ms; **respeita `prefers-reduced-motion`**.
- Região com `aria-label="Copiloto — orientação privada"`; botão com `aria-expanded`; sugestões como lista; foco visível; contraste ≥ 4.5:1; navegação por teclado.
- Escala de z-index do projeto — a faixa/card não competem com os popovers de emoji/template existentes.

---

## 4. Arquitetura técnica

### 4.1 Estrutura de arquivos

O provider segue o padrão do projeto e vive em `src/providers/data/` (junto dos 24 providers existentes), para que o drop-in Supabase da Fase 2 caia no mesmo trilho. A UI e as regras ficam na feature.

```
src/providers/data/
  contracts/copilot.ts          # ICopilotProvider
  impl/mock/copilot.ts          # MockCopilotProvider — compõe o painel + roda regras
  impl/mock/copilotRules.ts     # R1/R2/R3 como funções PURAS (testáveis isoladas)
  impl/supabase/copilot.ts      # stub Fase 2 (AICopilotProvider + generateReply)
  hooks/useCopilotProvider.ts
  # registrar em factory.ts (mock+supabase bundles) e em contracts/index.ts (IDataProviders)

src/features/copilot/
  components/
    CopilotSurface.tsx          # resolve o placement e delega à variante
    CopilotStrip.tsx            # faixa (repouso + expandida)  ← default
    CopilotCard.tsx             # card colapsável no topo do chat
    CopilotFicheTab.tsx         # aba dedicada na Ficha
    CopilotHeader.tsx           # cabeçalho compartilhado (bot + título + selo + briefing)
    CopilotSuggestionItem.tsx   # item de sugestão (ícone/cor/texto/dismiss)
    CopilotSummary.tsx          # resumo da conversa (recolhível)
    CopilotReply.tsx            # resposta pronta + Inserir ↑ + botão Gerar (esqueleto)
  hooks/
    useCopilotPanel.ts          # orquestra painel + placement + dismiss local
    useCopilotPlacement.ts      # resolve VITE_COPILOT_PLACEMENT
  config.ts                     # aliases + resolvePlacement()
  i18n/pt-BR.ts
  index.ts

src/shared/types/copilot.ts     # ICopilotSuggestion · ICopilotBriefing · ICopilotPanelData · ICopilotSummary
```

### 4.2 Contrato do provider (fiel ao PRD)

```typescript
interface ICopilotProvider {
  getPanelData(conversationId: ID): Promise<ICopilotPanelData>;
  dismissSuggestion(id: ID): Promise<void>;
  // Fase 2 (AICopilotProvider): generateReply(conversationId: ID): Promise<string>;
}
```

`MockCopilotProvider.getPanelData` compõe a partir das **fontes únicas existentes** (sem recomputar métricas):

1. **Briefing** ← campos já materializados do `ICustomer` (`status`, `abcClass`, `purchaseStats.ticketMedio/ltv`, `lastPurchaseAt`) — exatamente os que a Ficha (PRD-012) exibe.
2. **Resumo** ← `ISdrEscalation.summary` (produzido pelo PRD-023) quando a conversa foi escalada; resumo mockado caso contrário.
3. **Sugestões** ← `copilotRules(conversation, messages, customer)` (R1/R2/R3), todas `source: 'rule'`.

### 4.3 Fluxo de dados no front

`useCopilotPanel(conversationId)`:

- chama `getPanelData` (via `useCopilotProvider`);
- injeta o `placement` resolvido por `useCopilotPlacement`;
- mantém o **estado local de dispensa** (Set de ids) na sessão;
- degrada para estado vazio em caso de erro do provider.

`CopilotSurface` lê o placement e renderiza a variante: `strip` acima do `MessageInput`, `card` no lugar do banner de escalação no topo do chat, `tab` na Ficha.

### 4.4 `VITE_COPILOT_PLACEMENT`

`resolvePlacement()` é o espelho fiel de `resolveDataSource()` (em `src/providers/data/factory.ts`): valida contra `['strip','tab','card']`, fallback **`strip`**, `console.warn` em DEV quando inválido. Cobre o cenário de erro "valor inválido → variante default".

### 4.5 Integração e absorção da "Sugestões IA" atual

- Na variante **`strip`**, a `buildAiSuggestions` atual do `MessageInput` é absorvida pela faixa (vira a "resposta pronta"), removendo a duplicação.
- Nas variantes **`card`/`tab`**, a resposta pronta continua junto ao input (a "Sugestões IA" simples permanece), pois a orientação está em outro lugar.
- A feature **não altera** o comportamento das colunas existentes além de hospedar a superfície (RNF-006).

### 4.6 DELTAs obrigatórios

- **PRD-002 (modelo conceitual):** adicionar `ICopilotSuggestion` (+ agregados `ICopilotBriefing`, `ICopilotPanelData`, `ICopilotSummary`); registrar em `docs/prds/DELTAS-PRDs-Gallo-Base-Diesel.md`.
- **PRD-004 (mocks):** gerador determinístico de sugestões e de resumo mockado.

### 4.7 Regras determinísticas (Fase 1)

| Regra                    | `kind`        | Gatilho                                                                                                 |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------- |
| R1 `unanswered_deadline` | `alert`       | ≥2 mensagens do cliente sobre prazo/entrega sem resposta posterior do vendedor e conversa não resolvida |
| R2 `billing_mismatch`    | `action`      | cliente pede NF/faturamento "em nome da empresa" mas o cadastro é B2C (CPF)                             |
| R3 `dormant_opportunity` | `opportunity` | ciclo de vida `dormente` + sinal de intenção de compra na conversa atual                                |

Termos/limiares fixos no mock; ponto de extensão deixado para parametrização futura (PRD-019 na Fase 2).

### 4.8 Testing

R1/R2/R3 são funções puras → validáveis com fixtures de conversa/cliente. O projeto não tem suíte automatizada (type-check via `bun run build`); a verificação final é **manual**, conforme o fluxo do usuário.

---

## 5. Rastreabilidade (RF → design)

| RF                                      | Onde é atendido                            |
| --------------------------------------- | ------------------------------------------ |
| RF-001/002 (3 variantes + parâmetro)    | §4.1 componentes + §4.4 `resolvePlacement` |
| RF-003 (privada, distinta da resposta)  | §3.2 selo + §3.4 separação                 |
| RF-004 (briefing espelha a Ficha)       | §4.2 item 1                                |
| RF-005 (resumo conforme origem)         | §4.2 item 2                                |
| RF-006–009 (sugestões + regras)         | §3.3 + §4.7                                |
| RF-010 (dispensar)                      | §3.3 + §4.3 estado local                   |
| RF-011 (provider + Fase 2)              | §4.2 contrato                              |
| RF-012 (botão gerar resposta esqueleto) | §3.4                                       |
| RNF-002 (resiliência)                   | §3.5 erro                                  |
| RNF-003/005 (tema/a11y)                 | §3 cabeçalho + §3.6                        |
| RNF-006 (isolamento)                    | §4.5                                       |

---

## 6. O que NÃO fazer (reforço do PRD)

- Nenhuma chamada a LLM/IA real (motor é Fase 2).
- Não duplicar a Ficha nem recalcular métricas.
- Nunca inserir orientação automaticamente como mensagem ao cliente.
- Não remover variantes (as três permanecem alternáveis por parâmetro).
- Não persistir sugestões/auditoria de verdade (Fase 1 = local/mock).
- Não acoplar o copiloto de modo que sua falha quebre a conversa.

---

## 7. Referências

- PRD: `docs/prds/PRD-025-copiloto-vendas.md`
- Protótipos do arquiteto: `docs/html/gallo-copiloto-mockup.html`, `gallo-copiloto-mockup2.html`
- Protótipo evoluído (companion, validado): `.superpowers/brainstorm/2181-1780264417/content/copiloto-variantes.html`
- Padrões de código: `src/providers/data/factory.ts`, `src/features/conversations/`, `src/features/customers/`, `src/features/sdr-escalation/`
- Tipos: `src/shared/types/customer.ts`

---

## 8. Próximo passo

Plano de implementação detalhado via skill `writing-plans`, fase a fase conforme o PRD (5 fases: contrato+DELTAs → superfície+variantes → briefing+resumo → regras+provider+esqueleto → validação).
