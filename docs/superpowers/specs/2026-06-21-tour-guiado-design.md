# Tour Guiado — Design Spec

- **Data:** 2026-06-21
- **Status:** Aprovado (design) — aguardando revisão do spec antes do plano
- **Codinome sugerido:** `Compass`
- **Autor:** AILA Sistemas Inteligentes
- **Origem:** `/superpowers:brainstorming` — pedido do dono: "tour guiado pela plataforma, com ênfase no atendimento, disparando em cada item do sidebar na primeira vez que é acessado".

---

## 1. Contexto e objetivo

A plataforma tem ~40 telas no sidebar e usuários muitos deles pouco técnicos (vendedores e gestores). Não existe nenhum onboarding hoje. O objetivo é guiar o usuário na **primeira visita** de cada tela, com **ênfase no módulo de Atendimento** (inbox de WhatsApp), reduzindo a curva de aprendizado sem depender de treinamento presencial.

O tour é uma camada de UI puramente client-side. **Não é fronteira de segurança** — RLS, RBAC e auth seguem governando o acesso real; o tour só explica o que o usuário já pode ver.

## 2. Decisões travadas (do brainstorming)

| Tema | Decisão |
|------|---------|
| Profundidade | Tour **rico** (multi-passo, holofote) só no **Atendimento**; **card de boas-vindas** (1 frase) em todas as demais telas |
| Persistência | `localStorage` **por usuário**, atrás de uma **abstração única** (`tourStorage.ts`) — fácil promover a Supabase depois |
| Controles | (a) Pular sempre; (b) "?" contextual para rever; (c) central em Configurações (rever/resetar); (d) opt-out global |
| Estilo visual | **A (Holofote)** no Atendimento + **C (Card centralizado)** nas demais |
| Dependência | **Nenhuma lib nova** — construção caseira sobre React + Tailwind + portal + posicionador próprio |

## 3. Fora de escopo (não-objetivos)

- Persistência server-side / sincronização entre dispositivos (fica para uma fase 2, ver §15).
- Tours multi-passo nas telas que não são o Atendimento (a fundação suporta, mas o 1º release entrega só o welcome card nelas).
- Tradução/i18n além de português do Brasil.
- Edição de conteúdo dos tours por usuário final (o conteúdo vive no código).
- Tour no storefront B2C (`loja.*`), portal B2B (`portal.*`) e PWA do vendedor externo (`pwa.*`) — escopo é o app logado (`app.*`).

## 4. Arquitetura

### 4.1 Abordagem — caseira, sem dependência

Construção própria, justificada por:
- Evita o guard de 24h do `bunfig.toml` (sem pacote novo a aprovar).
- Integração total com os **tokens semânticos** → herda as 4 paletas (`diesel`/`parts`/`service`/`industrial`) + light/dark sem CSS extra.
- São necessários **dois formatos** (holofote + card) que libs prontas não combinam bem.
- O alvo do holofote vive em outra parte da árvore React, então o Radix Popover (modelo de âncora no mesmo nó) não encaixa; um **posicionador próprio** (função pura) resolve melhor e fica testável.

Alternativa considerada e descartada: `driver.js` (leve, sem deps). Descartada por exigir aprovação no supply-chain guard, estilização fora dos tokens do tema e por não cobrir bem o card de boas-vindas.

### 4.2 Estrutura de pastas (`src/features/tour/`)

```
src/features/tour/
├── engine/                      # lógica pura, testada (Vitest)
│   ├── tourNavigation.ts        # next/prev/clamp de passos
│   ├── autoStart.ts             # shouldAutoStart(tourKey, seen, optOut, registry)
│   └── popoverPlacement.ts      # rect do alvo + viewport → coords + lado + seta
├── storage/
│   └── tourStorage.ts           # ÚNICA abstração de persistência (localStorage hoje)
├── store/
│   └── useTourStore.ts          # Zustand: tour ativo, passo atual, ações
├── components/
│   ├── TourProvider.tsx         # montado no AppLayout; ouve a rota; dispara auto-start
│   ├── Spotlight.tsx            # overlay holofote (estilo A) via portal
│   ├── TourStepCard.tsx         # balão do passo (ícone, título, corpo, progresso, botões)
│   ├── WelcomeCard.tsx          # card de boas-vindas centralizado (estilo C)
│   └── TourHelpButton.tsx       # "?" global context-aware (ver §8)
├── config/
│   └── tours.ts                 # registro de todos os tours (rota → tour → passos)
├── i18n/
│   └── pt-BR.ts                 # todos os textos do tour
├── pages/
│   └── ToursSettingsPage.tsx    # central em Configurações
└── index.ts                     # barrel público da feature
```

### 4.3 Camadas e responsabilidades

- **engine/** — funções puras, sem React nem DOM (exceto receber um `DOMRect` já medido). Onde mora o peso dos testes.
- **storage/** — fronteira de persistência. Lê/grava `localStorage`. É o único arquivo a trocar para migrar a Supabase.
- **store/** — estado do runtime (qual tour está ativo, em qual passo). Zustand, em memória.
- **components/** — apresentação + efeitos (medir alvo, portal, foco, teclado).
- **config/ + i18n/** — dados (registro de tours e textos), sem lógica.

## 5. Modelo de dados

### 5.1 Tipos

```ts
type TourKey = string;                 // ex.: "atendimento-inbox"

interface TourStep {
  target?: string;                     // valor de data-tour; ausente => passo centralizado
  icon: string;                        // nome Iconify (mdi:*)
  title: string;
  body: string;
  placement?: "auto" | "top" | "bottom" | "left" | "right"; // default "auto"
}

interface TourDef {
  key: TourKey;
  kind: "rich" | "welcome";            // rich = holofote multi-passo; welcome = card único
  route: string;                       // rota de disparo (first-visit), formato TanStack
  label: string;                       // nome exibido na central de tours
  steps: TourStep[];                   // welcome => exatamente 1
}
```

O registro (`config/tours.ts`) exporta `TOURS: TourDef[]` e um índice `byRoute` para resolução rápida na navegação.

### 5.2 Persistência (`tourStorage.ts`)

Chaves `localStorage`, escopadas por `currentUser.id`:

- `gallo-tour-seen:<userId>` → `string[]` (JSON) de `TourKey` já concluídos/pulados
- `gallo-tour-optout:<userId>` → `"1" | "0"`

API exposta (toda síncrona):

```ts
getSeen(userId): Set<TourKey>
markSeen(userId, key): void
isSeen(userId, key): boolean
getOptOut(userId): boolean
setOptOut(userId, value): void
resetAll(userId): void                 // limpa APENAS o seen (tours voltam a aparecer); NÃO altera o opt-out
```

Defensivo: parse de JSON inválido cai em conjunto vazio (nunca lança). Sem `userId` (não autenticado) o tour não dispara.

## 6. Fluxo de disparo (first-visit)

1. `TourProvider` (montado no `AppLayout`) assina a localização do TanStack Router.
2. Em cada mudança de rota, resolve `byRoute[pathname]` → `TourDef | undefined`.
3. Chama `shouldAutoStart(key, seen, optOut, registry)`:
   - dispara só se **não visto** e **opt-out off**.
4. **Espera os alvos:** para tours `rich`, faz poll via `requestAnimationFrame` até os `data-tour` do 1º passo existirem no DOM (telas carregam dados async), com **timeout (~3s)**. Se o alvo nunca aparece, o passo é **pulado** (não trava o tour); se nenhum passo tem alvo, segue como centralizado.
5. Inicia o tour no `useTourStore`. Concluir ou pular chama `markSeen`.
6. **Anti-StrictMode/duplo disparo:** guarda por `key` para não iniciar duas vezes no double-mount de dev nem em re-render.
7. Não rouba foco no meio de digitação: o tour da conversa dispara no **1º open** (composer vazio).

## 7. Conteúdo dos tours

### 7.1 `atendimento-inbox` (rich) — dispara em `/app/atendimento`

| # | Alvo (`data-tour`) | Título | Corpo |
|---|--------------------|--------|-------|
| 1 | — (centralizado) | Bem-vindo ao Atendimento | Em 1 minuto você aprende a receber, responder e organizar suas conversas. |
| 2 | `inbox-filters` | Encontre conversas | Filtre por status, não lidas ou número, e busque por nome ou telefone. |
| 3 | `inbox-list` | Sua caixa de conversas | Cada conversa mostra o contato, a última mensagem e o status. As não lidas ficam no topo. |
| 4 | `inbox-new` | Comece uma conversa | Inicie um atendimento novo, mesmo para um número ainda não cadastrado. |

Estado vazio (sem conversas): o passo 3 aponta para o empty-state / botão de nova conversa.

### 7.2 `atendimento-conversa` (rich) — dispara na 1ª abertura de `/app/atendimento/$id`

| # | Alvo (`data-tour`) | Título | Corpo |
|---|--------------------|--------|-------|
| 1 | `conversation-header` | Quem é o cliente | No topo aparece o contato e por qual número você está respondendo. |
| 2 | `message-list` | O histórico | Todas as mensagens ficam aqui. Cada uma mostra se foi enviada, entregue ou lida. |
| 3 | `composer` | Responda por aqui | Digite e envie. Use o anexo para mandar foto da peça ou o PDF do orçamento. |
| 4 | `conversation-menu` | Ações da conversa | Transfira o atendimento, adicione notas internas e abra a ficha do cliente. |
| 5 | — (centralizado) | Pronto! | Você pode rever este tour quando quiser no ícone ? no topo da tela. |

### 7.3 Welcome cards (estilo C) — um por item do sidebar

Cada tela dispara um card único (centralizado) na 1ª visita. Copy de uma frase, em PT-BR. Só dispara para quem tem permissão de acessar a tela (o RBAC já filtra a navegação).

| Rota | Tour key | Copy |
|------|----------|------|
| `/app/inicio` | `welcome-inicio` | Seu ponto de partida: resumo do dia, conversas recentes e atalhos rápidos. |
| `/app/clientes` | `welcome-clientes` | Sua base B2B e B2C: busque, filtre e abra a ficha completa de cada cliente. |
| `/app/leads` | `welcome-leads` | Oportunidades em andamento: acompanhe o funil e mova os leads entre etapas. |
| `/app/veiculos` | `welcome-veiculos` | A frota dos clientes: cadastre caminhões e use o modelo para achar a peça certa. |
| `/app/carteira` | `welcome-carteira` | Sua carteira de clientes: quem é seu, responsáveis e transferências. |
| `/app/catalogo` | `welcome-catalogo` | Catálogo de peças: busque por código, aplicação ou modelo de veículo. |
| `/app/kits` | `welcome-kits` | Kits prontos por modelo de caminhão para montar orçamentos mais rápido. |
| `/app/orcamentos` | `welcome-orcamentos` | Monte orçamentos com peças do catálogo e envie direto pelo WhatsApp. |
| `/app/pedidos` | `welcome-pedidos` | Acompanhe seus pedidos do rascunho até a entrega. |
| `/app/storefront-admin` | `welcome-storefront-admin` | Configure a loja online: produtos, categorias e destaques da vitrine. |
| `/app/sdr` | `welcome-sdr` | Qualificação automática de leads: acompanhe sessões e escalações. |
| `/app/gestao/copiloto` | `welcome-copiloto` | Seu assistente de IA: peça resumos, análises e ajuda nas conversas. |
| `/app/gestao` | `welcome-gestao` | Panorama do negócio: os principais números da operação num só lugar. |
| `/app/gestao/vendas` | `welcome-vendas` | Análise de vendas: evolução, ranking e desempenho por período. |
| `/app/gestao/forecast` | `welcome-forecast` | Projeção de vendas: o que está previsto para fechar no período. |
| `/app/gestao/metas` | `welcome-metas` | Metas da equipe: defina, acompanhe e bata os objetivos do mês. |
| `/app/gestao/indicadores` | `welcome-indicadores` | Indicadores de desempenho da operação comercial. |
| `/app/gestao/ranking` | `welcome-ranking` | Ranking dos vendedores: gamificação e disputa saudável. |
| `/app/gestao/positivacao` | `welcome-positivacao` | Clientes que compraram no período: acompanhe a positivação da carteira. |
| `/app/gestao/abc` | `welcome-abc` | Classifique clientes e produtos por relevância (A, B e C). |
| `/app/gestao/carteira-analitica` | `welcome-carteira-analitica` | Saúde da carteira: quem está ativo, em risco ou inativo. |
| `/app/gestao/comissoes` | `welcome-comissoes` | Apuração de comissões por vendedor e período. |
| `/app/gestao/dre` | `welcome-dre` | Demonstração de resultados: receitas, custos e lucro. |
| `/app/gestao/rentabilidade` | `welcome-rentabilidade` | Margem e rentabilidade por produto, cliente e venda. |
| `/app/gestao/despesas` | `welcome-despesas` | Lance e acompanhe as despesas da operação. |
| `/app/gestao/caixa` | `welcome-caixa` | Entradas e saídas: a saúde financeira ao longo do tempo. |
| `/app/gestao/estoque` | `welcome-estoque` | Posição de estoque: o que tem, onde e quanto. |
| `/app/gestao/estoque-movimentacao` | `welcome-estoque-mov` | Entradas e saídas de estoque, item a item. |
| `/app/insights` | `welcome-insights` | Recomendações automáticas para agir sobre clientes e vendas. |
| `/app/gestao/saude` | `welcome-saude` | Status técnico da plataforma: integrações, WhatsApp e serviços. |
| `/app/configuracoes` | `welcome-config` | Configurações gerais da loja, equipe e plataforma. |
| `/app/configuracoes/perfil` | `welcome-perfil` | Seus dados, disponibilidade e preferências de conta. |
| `/app/configuracoes/aparencia` | `welcome-aparencia` | Tema, cores e modo claro/escuro. |

> O copy acima é o ponto de partida; refinável depois sem mudança estrutural. Itens do sidebar adicionados no futuro precisam de uma nova entrada aqui — caso contrário, simplesmente não disparam (degradação silenciosa, sem erro).

## 8. Controles

- **Pular** — botão `Pular` em todo passo + tecla `Esc`. Ambos marcam o tour como visto e fecham.
- **"?" para rever (context-aware, global)** — `TourHelpButton` no **TopBar**, que resolve a rota atual → tour registrado e o reabre ignorando o "visto". Refinamento sobre o brainstorming ("? no header de cada tela"): um único botão global context-aware entrega a mesma UX por tela sem editar ~40 headers. Se a rota atual não tem tour, o botão fica oculto/desabilitado.
- **Central em Configurações** — nova rota `/app/configuracoes/tours` (item de nav "Tours & Ajuda", visível a todos os papéis logados): lista os tours do registro, com "rever" por tour, **"Resetar todos os tours"** (limpa o histórico de vistos; faz tudo reaparecer) e o **toggle de opt-out global** (controle à parte, não é tocado pelo reset).
- **Opt-out global** — boolean por usuário (`tourStorage`); desliga apenas o **auto-start**. O "?" e a central continuam funcionando.

## 9. Visual, acessibilidade e movimento

Direção do especialista de design (ui-ux-pro-max), tudo em **tokens semânticos**:

- **Realce do alvo:** `ring-2 ring-primary` (herda a paleta ativa) + leve elevação. Sem `pulse` infinito.
- **Holofote (A):** caixa sobre o alvo com `box-shadow: 0 0 0 9999px <overlay>` (escurece o resto em um elemento) + camada transparente que **captura cliques de fundo** (bloqueia interação durante o passo). `position: fixed` via portal.
- **Card de boas-vindas (C):** card centralizado (`bg-popover`, `border-border`, `rounded-lg`) com leve backdrop; sem holofote.
- **Anatomia do passo:** ícone em círculo + título (`text-foreground`, peso 500) + corpo curto (`text-muted-foreground`) + progresso (dots "● de N") + botões `Voltar`/`Pular`/`Próximo`/`Concluir`.
- **Movimento:** entrada `ease-out` 150–300ms, saída `ease-in`; transição suave entre passos. **`prefers-reduced-motion` ⇒ instantâneo**, sem animação.
- **Teclado/foco:** focus-trap no balão; `→`/`Enter` = próximo, `←` = voltar, `Esc` = pular; `focus-visible:ring-2` nos botões. Botões reais (`<button>`).
- **Leitor de tela:** balão como `role="dialog"` com `aria-labelledby`/`aria-describedby`; corpo com `aria-live="polite"` para anunciar transições.
- **Mobile:** sidebar vira BottomNav e o Atendimento colapsa em 1 coluna. Holofote é **desktop-first**; passos cujo alvo não existe no mobile caem para card centralizado; toques ≥44px.

## 10. Âncoras `data-tour` a adicionar

Só o tour rico do Atendimento precisa de âncoras (welcome cards são centralizados). Adicionar o atributo `data-tour="<id>"` em:

| `data-tour` | Componente |
|-------------|------------|
| `inbox-filters` | `src/features/conversations/components/InboxFilters.tsx` |
| `inbox-list` | container da lista em `InboxPage.tsx` (ou wrapper de `ConversationListItem`) |
| `inbox-new` | botão de nova conversa em `InboxHeader.tsx` |
| `conversation-header` | `src/features/conversations/components/ConversationHeader.tsx` |
| `message-list` | `src/features/conversations/components/MessageList.tsx` |
| `composer` | `src/features/conversations/components/MessageInput.tsx` |
| `conversation-menu` | `src/features/conversations/components/ConversationMenu.tsx` |

Atributos são aditivos e não afetam comportamento existente. Se um alvo sumir num refactor, o passo é pulado.

## 11. z-index e portal

- Overlay e balão renderizam via **portal** no `body`.
- Escala: overlay/balão **acima** do TopBar sticky e dos banners globais (DemoMode/DataSource/WhatsApp/OutsideHours), **abaixo** dos toasts (sonner). Definir constantes alinhadas ao uso atual de z-index do projeto (sem `z-[9999]`).

## 12. Riscos e casos de borda

| Caso | Tratamento |
|------|------------|
| Alvo ausente (feature off, lista vazia) | passo pulado, tour continua |
| Carga async / layout shift | espera o alvo com timeout; reposiciona em `resize` |
| Sem permissão para a tela | tour nunca dispara (RBAC filtra a navegação) |
| Temas (4 paletas) + light/dark | coberto pelos tokens semânticos |
| Foco no meio de digitação | tour da conversa dispara no 1º open (composer vazio) |
| StrictMode / re-render | guarda anti-duplo-disparo por key |
| `localStorage` corrompido/indisponível | parse defensivo → conjunto vazio; nunca lança |
| Usuário não autenticado | sem `userId` ⇒ não dispara |
| Rolagem que tira o alvo da viewport | `scrollIntoView` do alvo ao ativar o passo + lock de scroll de fundo durante o holofote |

## 13. Testes (Vitest, co-localizados)

- `engine/tourNavigation.test.ts` — next/prev/clamp nos limites.
- `engine/autoStart.test.ts` — matriz visto × opt-out × rota registrada.
- `engine/popoverPlacement.test.ts` — escolha de lado e flip nas bordas da viewport.
- `storage/tourStorage.test.ts` — get/mark/isSeen/optout/resetAll com `localStorage` mockado e JSON inválido.
- Componentes: testes leves (render do passo, ação de pular). O peso fica nos engines puros.

## 14. Escopo do 1º release

Entrega completa do que foi pedido:
1. Framework do tour (engine + storage + store + provider + componentes).
2. Tours ricos do Atendimento: `atendimento-inbox` e `atendimento-conversa` (com âncoras `data-tour`).
3. Welcome cards para **todos** os itens do sidebar (§7.3).
4. Controles: pular, "?" global context-aware, central em Configurações, opt-out global.
5. Testes dos engines e do storage.
6. Item de nav "Tours & Ajuda" + rota da central.

## 15. Migração futura para Supabase (fora do 1º release)

A persistência está isolada em `tourStorage.ts`. Promover a server-side = reimplementar essa API contra um provider novo (ex.: `onboarding`, o 38º) + tabela `tour_completed` (`seller_id`/`user_id`, `tour_key`, `completed_at`, opt-out) com RLS por usuário, migration espelhada em `supabase/migrations/`. Nenhum consumidor do tour muda. Gate de adoção: quando a reincidência entre dispositivos virar problema real.
