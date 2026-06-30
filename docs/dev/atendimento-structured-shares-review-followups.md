# Atendimento — apontamentos adiados (code review 2026-06-30)

Registro dos achados do code review do stack **inbox preview + thread realtime
fallback + compartilhamento de contato/localização** que **NÃO** foram corrigidos
na rodada de fixes (decisão: corrigir 1–8 + #12, adiar o restante). Mantido aqui
para não se perder — cada item traz `arquivo:linha`, o quê, por que foi adiado e
a correção sugerida.

> Os fixes aplicados na 1ª rodada (marker-hijack, swap nome/telefone, regressão de
> tipo em `conversationMedia`, divergência import↔live, multi-contato no Evolution
> clássico, `phoneFromVCard` normalizado, gate em `resolveInboundAsset`, notação
> exponencial em `encodeLocation`, prefixo `I` nos tipos) já estão no código.

> **2ª rodada (review do PR #205, 2026-06-30) — também já no código:** preview da
> Inbox mostra o nome decodificado (👤/📍) em vez do rótulo genérico; Meta
> `parser` normaliza o telefone do contato via `toE164` + `||` no fallback
> `wa_id`; `phoneFromVCard` não vaza entre linhas do vCard (`[ \t]` no lugar de
> `\s`); `LocationBubble` usa `coordStr` no link/tela; o guard inline de
> location/contact no `ConversationPage` foi **removido** (gate único em
> `resolveInboundAsset`); testes do parser Meta para location/contact adicionados.
> Restam adiados os itens abaixo (A–F).

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
  é recuperado até um refetch/scroll; (3) **ordem** — `syncLatest` alimenta a
  página em `applyRealtimeRow`, cujo caminho de inserção (`prependNewest`) coloca
  toda linha nova no topo (mais recente) **sem checar `sentAt`**; se uma mensagem
  perdida **não for a mais nova**, ela entra fora de ordem (renderiza no fim do
  thread). *(2ª revisão, PR #205 — PLAUSIBLE; distinta da suspeita refutada na 1ª,
  que era sobre o caminho fast-path.)*
- **Por que adiado:** é o tradeoff do fix do thread (PR #204→#205) — entrega
  convergência confiável mesmo quando o canal `messages` não entrega (custo de
  RLS). Validado pelo dono ("o thread atualiza agora"). Faz parte do **cache do
  Atendimento congelado** — não tocar fora de escopo autorizado.
- **Correção futura:** só rodar `syncLatest` quando o fast-path não aplicou nada
  numa janela curta; para gaps profundos, paginar para trás até reconciliar o
  `providerMessageId` mais antigo conhecido; e o merge inserir por `sentAt`
  ordenado (não `prependNewest` cego) para fechar o item (3).
- **Severidade:** baixa-média (eficiência + bordas de burst-com-perda e ordem;
  ambas se auto-curam ao reabrir a conversa). A 2ª revisão **elevou** este cluster.

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

### E. `decodeContact` de uma única linha 100% numérica vira "telefone"
- **Onde:** `src/providers/whatsapp/contentFormat.ts` (`decodeContact`, ramo de 1
  linha). *(2ª revisão, PR #205 — PLAUSIBLE.)*
- **O quê:** quando o contato compartilhado tem **só** o nome (sem telefone
  resolvível) e esse nome é uma string numérica (ex.: contato não salvo), o encode
  produz uma única linha e o decode classifica por shape → `PHONE_RE` casa → vira
  `{ phone }`, e o card mostra o nome como número com "Copiar número".
- **Por que adiado:** **ambiguidade inerente** de uma única linha — sem um 2º
  campo não há como distinguir "nome numérico" de "telefone". O fix da 1ª rodada
  resolveu o caso de 2 linhas (não troca mais nome↔telefone); este resíduo de 1
  linha é de baixíssimo alcance.
- **Correção futura (se incomodar):** marcar o tipo do campo no encode (prefixo)
  quando houver só um, em vez de inferir por shape no decode.
- **Severidade:** muito baixa.

### F. O conjunto "tipo estruturado sem bytes" (`location|contact`) vive em 4+ lugares
- **Onde:** `NON_ARCHIVABLE_MEDIA_TYPES` (`useEnsureInboundMedia.ts`), os arrays
  `MEDIA_TYPES` (`import/core`, `import/history-core`, `webhook/core` `toMediaType`),
  o `Exclude<MessageMediaType, …>` em `mediaDownload.ts`, ao lado de
  `MessageMediaType` em `shared/types/conversation.ts`. *(2ª revisão — PLAUSIBLE.)*
- **O quê:** ao adicionar um 3º tipo estruturado (enquete/reação), é preciso editar
  cada lista; esquecer uma roteia o tipo para arquivamento/assinatura de mídia (linha
  `media_assets` lixo / `createSignedUrl` em path nulo) ou o renderiza como texto cru.
- **Por que adiado:** as listas estão **corretas hoje** e cobertas; é generalização,
  não correção. (O guard inline duplicado no `ConversationPage` — antes item à parte
  — já foi **removido** na 2ª rodada.)
- **Correção futura:** um `const`/predicado exportado único (`isStructuredShare`)
  ao lado de `MessageMediaType`, consumido por todos os sites.
- **Severidade:** muito baixa (manutenção/drift).

---

## Refutados na verificação (registro, sem ação)

Não sobreviveram à verificação adversarial — listados só para fechar o ciclo:
predicado `STRUCTURED_MEDIA_TYPES` compartilhado (decisão: inline por engine);
"over-scan" no decode; memoização do decode na bolha; `toMediaType` com array
hardcoded; `useRealtimeMessages` duplicando a subscription de `conversations`;
e uma suspeita de ordem-fora no `syncLatest`/`applyRealtimeRow` (prepend) —
**refutada** (a ordenação se mantém).
