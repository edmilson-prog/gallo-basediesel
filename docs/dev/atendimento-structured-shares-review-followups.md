# Atendimento — apontamentos adiados (code review 2026-06-30)

Registro dos achados do code review do stack **inbox preview + thread realtime
fallback + compartilhamento de contato/localização** que **NÃO** foram corrigidos
na rodada de fixes (decisão: corrigir 1–8 + #12, adiar o restante). Mantido aqui
para não se perder — cada item traz `arquivo:linha`, o quê, por que foi adiado e
a correção sugerida.

> Os fixes aplicados na rodada (marker-hijack, swap nome/telefone, regressão de
> tipo em `conversationMedia`, divergência import↔live, multi-contato no Evolution
> clássico, `phoneFromVCard` normalizado, gate em `resolveInboundAsset`, notação
> exponencial em `encodeLocation`, prefixo `I` nos tipos) já estão no código.

---

## Tradeoffs deliberados (validados pelo dono — não mexer sem motivo)

### A. `recencyKey` re-dispara o `listLastMessages` da página inteira
- **Onde:** `src/features/conversations/hooks/useRelatedEntities.ts` (efeito de
  resolução das últimas mensagens, dep `recencyKey`).
- **O quê:** o fix do preview da Inbox passou a incluir `lastMessageAt` na chave
  do efeito (`recencyKey = id:lastMessageAt`). Resultado correto (o preview deixa
  de ficar uma mensagem atrás), mas qualquer mensagem nova em **qualquer** conversa
  visível re-dispara o RPC `listLastMessages` para a página inteira.
- **Por que adiado:** é o tradeoff que **conserta** o bug; validado pelo dono no
  dev server. Otimizar mexe na camada que já foi aprovada.
- **Correção futura (se virar gargalo):** buscar a última mensagem só da conversa
  que mudou (RPC pontual por `conversationId`) em vez de refazer a página toda;
  ou debounce/coalescer por janela curta.
- **Severidade:** baixa (eficiência; só pesa em páginas grandes com alto volume).

### B. `syncLatest` dispara em todo "touch" e só busca a página 1
- **Onde:** `src/features/conversations/hooks/useRealtimeMessages.ts` (~linha 119)
  e `src/features/conversations/hooks/useMessages.ts` (~linha 236, `syncLatest`).
- **O quê:** (1) o thread escuta o canal `conversations` e roda `syncLatest` a
  cada toque de `last_message_at`, **redundante** com o fast-path do INSERT em
  `messages` quando este chega; (2) `syncLatest` só puxa a página mais nova (50
  mensagens) — se um burst > 50 mensagens for perdido pelo Realtime, o miolo não
  é recuperado até um refetch/scroll.
- **Por que adiado:** é o tradeoff do fix do thread (PR #204) — entrega
  convergência confiável mesmo quando o canal `messages` não entrega (custo de
  RLS). Validado pelo dono ("o thread atualiza agora"). Faz parte do **cache do
  Atendimento congelado** — não tocar fora de escopo autorizado.
- **Correção futura:** só rodar `syncLatest` quando o fast-path não aplicou nada
  numa janela curta; e, para gaps profundos, paginar para trás até reconciliar o
  `providerMessageId` mais antigo conhecido.
- **Severidade:** baixa (eficiência + borda de burst-com-perda).

---

## Limpezas / convenção (sem impacto funcional)

### C. Mapeamento Baileys de location/contact duplicado entre os parsers
- **Onde:** `src/providers/whatsapp/evolution-go/parser.ts` (`extractContent`,
  ~linha 117) e `src/providers/whatsapp/evolution/parser.ts`
  (`extractEvolutionContent`, ~linha 87).
- **O quê:** os dois parsers (whatsmeow/Go e Evolution clássico) repetem o mesmo
  mapeamento `locationMessage`/`contactMessage`/`contactsArrayMessage` → texto
  canônico (via `encodeLocation`/`encodeContact`/`phoneFromVCard`).
- **Por que adiado:** funciona e está coberto por testes nos dois lados; extrair
  um helper compartilhado é refino, não correção. O reviewer **refutou** exigir
  um predicado compartilhado de tipos.
- **Correção futura:** extrair um `extractBaileysStructured(node)` em
  `contentFormat.ts` (runtime-agnostic) e reusar nos dois parsers.
- **Severidade:** muito baixa (DRY).

### D. `decodeLocation` aceita um nome com cara de `num,num` como coordenada
- **Onde:** `src/providers/whatsapp/contentFormat.ts` (`decodeLocation`, ~linha 64).
- **O quê:** o decode varre as linhas de trás pra frente e trata a primeira que
  casa `COORD_RE` como coordenada. Uma localização **sem** coords cujo nome seja
  exatamente `"-27.3,-53.4"` viraria um pin de mapa falso.
- **Por que adiado:** **não alcançável** pelos payloads reais — `encodeLocation`
  só emite a linha de coordenadas quando há coords de verdade, e nesse caso o nome
  vai numa linha própria acima. Cenário contrived.
- **Correção futura (se algum dia importar texto cru de fonte externa):** marcar
  a presença de coords explicitamente (ex.: prefixo na linha) em vez de inferir
  por shape.
- **Severidade:** desprezível.

---

## Refutados na verificação (registro, sem ação)

Não sobreviveram à verificação adversarial — listados só para fechar o ciclo:
predicado `STRUCTURED_MEDIA_TYPES` compartilhado (decisão: inline por engine);
"over-scan" no decode; memoização do decode na bolha; `toMediaType` com array
hardcoded; `useRealtimeMessages` duplicando a subscription de `conversations`;
e uma suspeita de ordem-fora no `syncLatest`/`applyRealtimeRow` (prepend) —
**refutada** (a ordenação se mantém).
