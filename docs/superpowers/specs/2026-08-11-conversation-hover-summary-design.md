# Resumo do contato ao passar o mouse no card da conversa

**Data:** 2026-08-11
**Status:** especificação aprovada, aguardando plano de implementação
**Área:** Atendimento → Inbox (`src/features/conversations/`)

---

## 1. Problema

O card de conversa na lista do Inbox (`ConversationListItem`) trunca praticamente
tudo que mostra, porque vive numa coluna de ~330 px:

- o nome é forçado a **maiúsculas** e cortado com `truncate`;
- a prévia da última mensagem cabe em **uma linha**;
- das tags da conversa, só **duas** aparecem — o resto vira um chip `+N`;
- a instância de origem é apenas uma **barra colorida de 3 px**, e mesmo essa só
  aparece quando a loja tem duas ou mais instâncias;
- a situação da conversa é outra barra colorida, sem rótulo;
- o telefone **não aparece em lugar nenhum**.

Para responder "quem é essa pessoa e sobre o que era mesmo?", o atendente precisa
abrir a conversa — o que marca mensagens como lidas, muda o estado da lista e
custa uma navegação. Isso encarece a triagem: varrer 30 conversas para achar a
certa significa 30 aberturas.

## 2. Solução

Um cartão de resumo que abre ao pousar o mouse sobre a linha, mostrando **sem
truncamento** o que a linha precisou cortar. O cartão é somente-leitura e não faz
nenhuma requisição nova: renderiza exclusivamente dados que a lista já carregou.

### 2.1 Princípio de conteúdo

O cartão **acrescenta**, não repete. Cada campo tem de justificar sua presença
contra o que a linha já diz:

| Campo | Justificativa |
|---|---|
| Nome em caixa natural, sem corte | a linha força maiúsculas e trunca |
| Telefone | a linha não mostra telefone |
| Último recado inteiro (até 4 linhas) | a linha corta em uma |
| Todas as tags | a linha mostra 2 e agrupa o resto |
| Instância de origem por extenso | a linha só tem a barrinha colorida |
| Situação por extenso | a linha só tem a barra colorida |
| Atendente com nome completo | a linha mostra só o primeiro nome no chip |

**Fora**, por exigirem requisição nova: porte do cliente (B2B/B2C), e-mail,
documento, cidade, frota, números do ERP. O RPC `conversation_contacts` devolve
apenas `refId`, `isLead`, `name`, `phone`, `avatarUrl` e `temperature` — a linha
de qualificação é portanto **"Cliente"** ou **"Lead · <temperatura>"**, nunca
"Cliente B2B".

### 2.2 Anatomia

```
┌────────────────────────────────────────┐
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │  faixa 2px — cor da instância
│ (avatar)  Edmilson Souza               │  14px / 600, caixa natural
│           Cliente                      │  11.5px, muted
│           +55 54 99999-1234            │  13.5px, tabular-nums
├────────────────────────────────────────┤
│ ÚLTIMO RECADO · há 18 min              │  label 10px uppercase
│ ▏ Edmilson Souza: Consegue me mandar   │  citação, borda-primary 2px
│ ▏ o orçamento das pastilhas hoje…      │  máx. 4 linhas (line-clamp)
├────────────────────────────────────────┤
│ ● Aguardando · Edmilson Souza · ● Com… │  rodapé, 11.5px muted
│ [Frio] [Orçamento] [VIP]               │  todas as tags
└────────────────────────────────────────┘
```

Largura fixa de **304 px**. A faixa superior de 2 px reusa a cor da instância
(`accountAccent(originAccount)`), amarrando o cartão à barra vertical que a linha
já exibe à esquerda.

### 2.3 Estados

**Cliente ou lead identificado** — anatomia completa acima. Para lead, a
qualificação vira `Lead · Frio` com a temperatura no tom do
`TEMPERATURE_META[t].tone`.

**Nome que é o próprio telefone** (contato não salvo, `display.isPhoneName`) — o
número não se repete na terceira linha; ela passa a mostrar o rótulo do canal
(`CHANNEL_META[conversation.channel].label`).

**Sem acesso ao conteúdo** (`conversation.isAccessible === false`, resultado de
busca por metadados) — o bloco do recado mostra "Prévia indisponível — a conversa
é de outro atendente." em itálico muted. Isso não é uma escolha de produto: o RPC
`last_messages_for_conversations` é barrado por RLS nesse caso, então
`lastMessage` **já chega nulo**. O cartão nomeia o vazio em vez de exibir um bloco
em branco. A faixa superior fica neutra e o rodapé omite a instância.

**Sem última mensagem por outro motivo** (conversa recém-criada) — o bloco do
recado é omitido inteiro, junto com sua régua separadora.

### 2.4 Comportamento

- `HoverCard` do Radix (`src/components/ui/hover-card.tsx`, já existente).
- `openDelay={500}` — meio segundo impede que o cartão pisque em cadeia enquanto
  o ponteiro atravessa a lista rumo à barra de rolagem.
- `closeDelay={120}` — tolera o micro-desvio do ponteiro entre a linha e o cartão.
- `side="right"` `align="start"` `sideOffset={8}`, com `collisionPadding={12}`
  para que a última linha da lista não empurre o cartão para fora da viewport.
- Conteúdo **interativo** (sem `pointer-events-none`): permite selecionar e copiar
  o telefone. Como o cartão nasce fora da coluna da lista, o ponteiro nunca
  precisa cruzar os botões de ação da linha para alcançá-lo.
- Animação de entrada de 160 ms com `ease-out`, via as classes que o
  `HoverCardContent` já traz. Sob `prefers-reduced-motion` a animação é
  suprimida (`motion-reduce:animate-none`) — o cartão continua abrindo.

### 2.5 Quando o cartão não abre

Três portas, todas concentradas numa função pura:

1. **Linha selecionada** (`isSelected`) — o atendente já está dentro daquela
   conversa; o resumo seria ruído sobre a tela que ele está lendo.
2. **Ponteiro sem hover real** — `matchMedia("(hover: hover) and (pointer: fine)")`
   falso. Este é o teste honesto de "existe hover neste dispositivo"; um limiar de
   largura seria um proxy que erra nos dois sentidos — um notebook com tela de
   toque é largo e não tem hover confiável, um tablet com trackpad é estreito e
   tem. Nenhum hook desse tipo existe ainda no projeto (só proxies por largura,
   como `use-mobile` e `useFicheLayout`), então ele nasce aqui.
3. **Modo "busca dentro das mensagens"** (`conversation.matchedMessage` presente)
   — a linha ali exibe o trecho que casou com a busca; um cartão mostrando a
   *última* mensagem contradiria o que está logo ao lado.

`prefers-reduced-motion` deliberadamente **não** é uma porta: quem pede menos
movimento quer menos animação, não menos informação. O cartão continua abrindo,
apenas sem transição.

Qualquer porta futura — suprimir sobre conversas arquivadas, por exemplo — entra
nessa mesma função e ganha teste, em vez de virar mais um `&&` no JSX.

### 2.6 Conflito conhecido e aceito

A linha já hospeda três `Tooltip`: o cadeado de instância desconectada, o selo do
SDR e o chip "Em fila". Pousar o mouse sobre um desses abrirá o tooltip **e** o
cartão de resumo. Como o tooltip nasce acima do alvo e o cartão à direita da
lista, eles não se sobrepõem.

A decisão é **aceitar** a coexistência. Suprimir o cartão sobre esses alvos criaria
buracos mortos no meio da linha — o usuário passaria o mouse e nada aconteceria,
sem entender por quê —, o que é pior que duas camadas de informação simultâneas e
não conflitantes.

## 3. Arquitetura

### 3.1 Arquivos

| Arquivo | Papel |
|---|---|
| `src/features/conversations/components/ConversationSummaryCard.tsx` | **novo** — apresentação pura do cartão |
| `src/features/conversations/engine/summaryCardVisibility.ts` | **novo** — as três portas do §2.5 |
| `src/features/conversations/engine/summaryCardVisibility.test.ts` | **novo** — Vitest |
| `src/features/conversations/engine/summaryFooter.ts` | **novo** — monta o rodapé omitindo campos ausentes |
| `src/features/conversations/engine/summaryFooter.test.ts` | **novo** — Vitest |
| `src/shared/hooks/useHoverCapable.ts` | **novo** — `matchMedia("(hover: hover) and (pointer: fine)")` reativo |
| `src/features/conversations/components/ConversationListItem.tsx` | envolve o `<Link>` com `HoverCard` |
| `src/features/conversations/i18n/pt-BR.ts` | strings novas |

### 3.2 Contrato do componente

```ts
export interface IConversationSummaryCardProps {
  conversation: IConversation;
  /** Já resolvido pelo item via displayFromContact — não recalcular. */
  display: IConversationDisplay;
  lastMessage: IMessage | null;
  originAccount?: IWhatsAppAccount | null;
  assignedSeller?: ISeller | null;
  /** Tags já resolvidas contra o catálogo pelo item. */
  tags: IConversationTag[];
}
```

Sem hooks de dados, sem provider, sem `useQuery`. Tudo chega por prop, já
resolvido pelo item — que por sua vez já tinha esses valores para renderizar a
própria linha. É isso que garante o custo zero.

### 3.3 Fronteiras

`ConversationListItem` continua sendo o único a saber de dados; o cartão só sabe
desenhar. A visibilidade sai do componente e vira engine testável, porque a regra
das quatro portas é exatamente o tipo de condicional que apodrece silenciosamente
quando mora num JSX.

O item permanece sob `memo`. O `HoverCard` só mantém estado de abertura, que já
é local ao Radix — não há prop nova instável que quebre a memoização.

## 4. Tema e tokens

Somente tokens semânticos, conforme `.claude/rules/temas.md`:

- fundo e texto: `bg-popover` / `text-popover-foreground`;
- réguas: `border-border`;
- rótulos e rodapé: `text-muted-foreground`;
- borda da citação: `border-primary/55`;
- pontos de situação: as classes de `STATUS_META[...].dotClass`, que já são
  `severity-*`;
- temperatura: `TEMPERATURE_META[t].tone`, mantida como exceção conhecida ao
  padrão de severidade (ver `project_severity_token_migration`).

A cor da faixa de instância é a única exceção legítima ao "sem hex direto": vem de
`accountAccent(originAccount)`, que já é um valor calculado por instância e é
aplicado via `style`, exatamente como a linha faz hoje.

Ícones via `@/components/Icon` (Iconify), nunca emoji.

## 5. Testes

**`summaryCardVisibility.test.ts`** — matriz das três portas: linha selecionada,
dispositivo sem hover real, `matchedMessage` presente, mais o caminho feliz. E as
combinações, para garantir que qualquer porta fechada basta para bloquear. A
função recebe a capacidade de hover como parâmetro booleano, não lê `matchMedia`
por dentro — é o que a mantém pura e testável sem mock de ambiente.

**`summaryFooter.test.ts`** — o rodapé com os três campos; sem instância (loja de
instância única); sem atendente (conversa na fila); só a situação. Nunca deve
sobrar um separador `·` solto na ponta.

Gate prático: `bun run build` + `bun run test`. Type-check por delta com
`bunx tsc --noEmit`, avaliando apenas os arquivos criados nesta branch — há
baseline de erros pré-existentes (`project_tsc_baseline_errors`).

Validação visual fica com o dono do projeto, conforme prática estabelecida.

## 6. Fora de escopo

- **Ações dentro do cartão** — copiar telefone, abrir ficha, ligar. O pedido foi
  "exibir um resumo"; botões transformam um preview passivo num menu, e obrigam a
  repensar o fechamento por hover.
- **Qualquer dado que exija requisição** — porte, e-mail, cidade, frota, ticket
  médio, LTV. Decisão explícita do dono nesta rodada.
- **PWA do vendedor externo** (`pwa.*`) — é superfície de toque; hover não existe.
- **Portal B2B e storefront** — não têm lista de conversas.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Cartão sai da tela nas últimas linhas | `collisionPadding={12}`; o Radix vira para `side="left"` sozinho quando não cabe |
| Duas camadas ao pousar sobre um badge com tooltip | Aceito e documentado (§2.6) |
| Recado muito longo estica o cartão | `line-clamp-4` no bloco de citação |
| Nome longo quebra o cabeçalho | `min-w-0` no container flex + quebra em duas linhas no máximo |
| Regressão de performance na lista | Nenhum dado novo, nenhum hook novo, `memo` preservado |

## 8. Decisões registradas

1. **Custo zero de dados** — o resumo usa só o que a lista já carregou. Alternativas
   com busca sob demanda (dados comerciais do ERP, frota) foram apresentadas e
   recusadas nesta rodada.
2. **Linha inteira como gatilho, cartão à direita, 500 ms** — sobre disparar só
   pelo avatar (alvo de 40 px, recurso indescobrível) ou abrir em 200 ms (pisca em
   cadeia na varredura).
3. **Layout "Conversa"** — o último recado inteiro como protagonista, metadados
   recuados para um rodapé de uma linha. Sobre o layout "Retrato" (ficha com o
   telefone em destaque, ~300 px) e o "Denso" (grade de dois campos, ~185 px).
   Mockups comparados no companion visual em 2026-08-11.
