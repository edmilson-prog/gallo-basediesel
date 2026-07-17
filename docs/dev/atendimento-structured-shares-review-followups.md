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

> **3ª rodada (review do PR #205, 2026-06-30) — também já no código:** a faceta
> de **ordem** do item B foi **corrigida** (`syncLatest`/`applyRealtimeRow` agora
> inserem por `sentAt` via helper puro `insertSortedDesc`, não mais `prependNewest`
> cego); o campo `address` da localização vira rótulo quando não há `name` (3
> parsers); **C (DRY dos parsers Baileys) e F (`MEDIA_TYPES` triplicado) RESOLVIDOS**
> — encoders `encodeBaileysLocation`/`encodeBaileysContact` e const único
> `MEDIA_DISCRIMINATOR_TYPES`; emoji do preview numa fonte só (`STRUCTURED_PREVIEW_ICON`);
> comentário do guard em `conversationMedia` corrigido.

> **4ª rodada (2026-06-30, embutida na investigação do dashboard "Carga por
> vendedor") — fechamento dos itens restantes:**
> - **A RESOLVIDO** — `useRelatedEntities` agora só refaz `listLastMessages` para
>   as conversas cuja recência realmente mudou (`changedRecencyIds` + um
>   `useRef<Map<ID,string>>` com a última recência vista), em vez da página
>   inteira a cada mudança.
> - **B parcialmente RESOLVIDO (tentativa)** — a faceta "chamada redundante" foi
>   "corrigida" com `touchAlreadyCovered`. **Revertido na 5ª rodada** — ver abaixo.
> - **E RESOLVIDO** — `PHONE_RE` em `contentFormat.ts` passou a exigir o `+`
>   inicial. Os 3 engines (Meta via `toE164`, Evolution/Evolution Go via
>   `phoneFromVCard` → `toE164`) sempre entregam telefone em E.164 quando
>   presente, então a mudança não quebra nenhuma mensagem já persistida — só
>   deixa de confundir um nome 100% numérico sem telefone resolvível com um
>   telefone. Mudança só de decode (frontend); mirror sincronizado em
>   `_shared/whatsapp/contentFormat.ts`, sem necessidade de redeploy de edge
>   function (decode nunca roda no servidor).
> - **D avaliado e MANTIDO sem mudança de código** — ver justificativa abaixo.

> **5ª rodada (2026-06-30, code review xhigh do PR #207) — correções pós-review:**
> um review multi-agente encontrou 5 problemas reais na 4ª rodada, 4 CONFIRMED e
> 1 PLAUSIBLE:
> - **B da 4ª rodada REVERTIDO** — `touchAlreadyCovered` tinha DOIS defeitos que
>   podiam **perder mensagem de verdade** na conversa aberta (o oposto do que a
>   Gap B deveria fazer): (1) cancelar o timer pendente com base só no touch MAIS
>   RECENTE, sem checar se esse timer tinha sido armado por um touch ANTERIOR
>   ainda não coberto; (2) tratar timestamps IGUAIS como prova de cobertura,
>   mas os 3 parsers truncam `sentAt`/`last_message_at` para o segundo inteiro —
>   duas mensagens no mesmo segundo ficam indistinguíveis. Um review adicional
>   também apontou (PLAUSIBLE) que `bumpConversation` no webhook não tem a
>   guarda de avanço que `touchConversation` tem, então uma entrega fora de
>   ordem poderia fazer `last_message_at` andar pra trás e disparar o mesmo bug
>   por outro caminho. Correção real exigiria identificar a mensagem por id no
>   touch (que o payload de `conversations` não carrega) — dado o risco de
>   perder mensagem de verdade, a otimização foi **revertida por completo**:
>   `useRealtimeMessages` voltou a rodar `syncLatest` incondicionalmente a cada
>   touch (debounce de 250ms), sem tentar detectar cobertura pelo fast-path.
> - **A da 4ª rodada — bug de retry corrigido.** `lastSeenRecencyRef` marcava a
>   conversa como "vista" de forma síncrona, **antes** do `listLastMessages`
>   resolver — se o RPC falhasse (timeout transitório, RPC com histórico de
>   `statement_timeout` neste projeto), a conversa ficava presa como "vista" pra
>   sempre, sem nunca mais tentar de novo. Corrigido: o `set` no
>   `lastSeenRecencyRef` só acontece dentro do `.then()` de sucesso, mesmo padrão
>   já usado por `missingIds`/`contactsRef` para os contatos.
> - **Item novo (5ª rodada) — perda do refresh incidental de status.**
>   Antes da 4ª rodada, qualquer mudança de recência refazia a página inteira de
>   `listLastMessages`, pegando de carona atualizações de status (delivered→read)
>   de OUTRAS conversas que não bumpam `last_message_at`. Com o fetch escopado só
>   às conversas que mudaram, esse refresh incidental some — o check da Inbox de
>   uma conversa parada fica congelado até ela mesma receber mensagem nova (ou a
>   página recarregar). Severidade cosmética (ícone de check desatualizado), não
>   perda de dado. **✅ RESOLVIDO na 6ª rodada** — ver abaixo.

> **6ª rodada (2026-07-10) — fecha o item novo da 5ª rodada:** nova função pura
> `applyLastMessageStatusUpdate` em `useRelatedEntities.ts` + um `useEffect`
> independente do efeito de resolução por recência (não altera `recencyKey`,
> `changedRecencyIds` nem `lastSeenRecencyRef` — só ADICIONA uma subscription).
> Reusa o canal `messages` já aberto (ref-counted, `useRealtimeConversations`
> já assina esse canal — zero socket extra) e reaproveita `rowToMessage`/
> `IMessageRealtimeRow` de `useRealtimeMessages.ts` (agora exportados) para não
> triplicar o mapper snake_case→IMessage. Em cada evento: se a linha bate com o
> `id` da preview atualmente em cache daquela conversa, o status é aplicado com
> a MESMA guarda anti-regressão de `useMessages`' `applyRealtimeRow`
> (`statusAdvances` — um ack fora de ordem não pode fazer o ícone andar pra
> trás); se a conversa ainda não tem preview em cache, ou o evento é de uma
> mensagem NOVA (id diferente da preview — o caminho normal de recência cuida
> dela) ou de uma mensagem antiga sem efeito visível na linha, a função retorna
> `null` e o efeito não faz nada — sem fetch, sem risco de corrida com o efeito
> de recência (pior caso: um fetch sobrescreve um patch recém-aplicado com dado
> igualmente fresco). 5 testes novos em `useRelatedEntities.test.ts`.

---

## Tradeoffs deliberados (validados pelo dono — não mexer sem motivo)

### A. `recencyKey` re-dispara o `listLastMessages` da página inteira — ✅ RESOLVIDO (4ª/5ª/6ª rodadas)
- **Onde:** `src/features/conversations/hooks/useRelatedEntities.ts`.
- **Fix (4ª rodada):** novo helper puro `changedRecencyIds` (mesmo padrão de
  `missingIds`) compara a recência atual de cada conversa contra a última vista
  (`lastSeenRecencyRef`); só as que mudaram entram no `listLastMessages`.
  Testado em `useRelatedEntities.test.ts`.
- **Fix (5ª rodada, pós-review):** o `lastSeenRecencyRef.set(...)` só roda dentro
  do `.then()` de sucesso do `listLastMessages` — na versão original da 4ª
  rodada rodava síncrono antes do fetch resolver, então um RPC que falhasse
  (`.catch(() => undefined)`) deixava a conversa marcada como "vista" pra sempre,
  sem nunca mais tentar de novo. Agora, falha = fica elegível pro próximo retry
  na próxima mudança de recência de qualquer conversa (mesma garantia de
  retry-safety que `missingIds`/`contactsRef` já tinham para os contatos).
- **Fix (6ª rodada):** o refresh incidental de STATUS (delivered→read) que o
  fetch escopado por conversa tinha perdido (ver item novo na 5ª rodada acima)
  foi fechado por uma subscription independente (`applyLastMessageStatusUpdate`)
  em vez de voltar a refazer a página inteira — ver 6ª rodada acima.
- **Severidade original:** baixa (eficiência; só pesava em páginas grandes com
  alto volume).

### B. `syncLatest` dispara em todo "touch" e só busca a página 1 — tentativa de fix REVERTIDA (5ª rodada)
- **Onde:** `src/features/conversations/hooks/useRealtimeMessages.ts` e
  `src/features/conversations/hooks/useMessages.ts` (`syncLatest`).
- **O quê:** (1) o thread escuta o canal `conversations` e roda `syncLatest` a
  cada toque, redundante com o fast-path do INSERT quando este já aplicou a
  mesma linha. (2) `syncLatest` só puxa a página mais nova (50 mensagens) — se
  um burst > 50 mensagens for perdido pelo Realtime, o miolo não é recuperado
  até um refetch/scroll. ~~(3) ordem fora do `prependNewest`~~ → já corrigido na
  3ª rodada.
- **Tentativa de fix (4ª rodada) e por que foi revertida:** `touchAlreadyCovered`
  comparava o `last_message_at` do touch contra o `sentAt` mais recente aplicado
  pelo fast-path, pulando/cancelando o `syncLatest` quando já "coberto". O code
  review xhigh do PR #207 confirmou DOIS jeitos de essa lógica **perder
  mensagem de verdade** — o oposto do objetivo da Gap B: (a) cancelar o timer
  pendente com base só no touch mais recente, sem provar que um touch ANTERIOR
  (que armou aquele mesmo timer) já tinha sido coberto; (b) tratar timestamps
  IGUAIS como cobertura, quando os 3 parsers truncam para o segundo inteiro —
  duas mensagens no mesmo segundo (comum: legenda + texto, ou dois envios
  rápidos) ficam indistinguíveis. Um achado PLAUSIBLE adicional: `bumpConversation`
  no webhook não tem a guarda de avanço que `touchConversation` tem, então uma
  entrega fora de ordem poderia andar `last_message_at` pra trás e disparar o
  mesmo bug por um caminho diferente. Corrigir de verdade exigiria o touch
  carregar o id da mensagem (que o payload de `conversations` não tem) — dado
  que o risco (perder mensagem na conversa aberta) é pior que o ganho (evitar
  uma chamada redundante), a otimização foi **revertida por completo**:
  `useRealtimeMessages` voltou ao comportamento original, incondicional,
  debounce de 250ms a cada touch, sem tentar detectar cobertura.
- **Correção futura (se algum dia compensar o esforço):** paginar pra trás
  reconciliando o `providerMessageId` mais antigo conhecido (item 2) e/ou incluir
  o id da mensagem no touch para permitir uma detecção de cobertura exata (item
  revertido) — ambas mudanças bem mais invasivas na área congelada do cache do
  Atendimento, para bordas que se autocuram ao reabrir a conversa.
- **Severidade:** baixa (ineficiência aceita; sem perda de dado com o
  comportamento original restaurado).

---

## Limpezas / convenção (sem impacto funcional)

### C. Mapeamento Baileys de location/contact duplicado entre os parsers — ✅ RESOLVIDO (3ª rodada)
> Extraídos `encodeBaileysLocation`/`encodeBaileysContact` em `contentFormat.ts`,
> reusados pelos dois parsers. Mantido como registro histórico.

### D. `decodeLocation` aceita um nome com cara de `num,num` como coordenada — avaliado, mantido sem mudança (4ª rodada)
- **Onde:** `src/providers/whatsapp/contentFormat.ts` (`decodeLocation`, ~linha 78).
- **O quê:** o decode varre as linhas de trás pra frente e trata a primeira que
  casa `COORD_RE` como coordenada. Uma localização **sem** coords cujo nome seja
  exatamente `"-27.3,-53.4"` viraria um pin de mapa falso.
- **Por que NÃO foi corrigido:** reavaliado na 4ª rodada — permanece
  **inalcançável** pelos 3 providers reais (Meta/Evolution/Evolution Go): uma
  mensagem de localização do WhatsApp sempre carrega coordenadas verdadeiras
  quando existe; não há como o app do usuário compartilhar uma "localização sem
  coordenadas" pela função nativa. Diferente do item E, aqui **não existe** um
  invariante equivalente ao `+` do E.164 que permita desambiguar sem mudar o
  formato de wire — a única correção real exigiria marcar explicitamente a
  presença de coordenada (ex.: prefixo na linha), o que quebra a leitura de
  mensagens **já persistidas** sem essa marca e exige suporte permanente a dois
  formatos no decode. Custo/risco não compensa para uma borda "desprezível" e
  contrived.
- **Correção futura (se algum dia importar texto cru de fonte externa que não
  garanta essa invariante):** marcar a presença de coords explicitamente em vez
  de inferir por shape, com decode retrocompatível para o formato antigo.
- **Severidade:** desprezível.

### E. `decodeContact` de uma única linha 100% numérica vira "telefone" — ✅ RESOLVIDO (4ª rodada)
> `PHONE_RE` passou a exigir `+` inicial — ver resumo da 4ª rodada acima. Mantido
> como registro histórico.
- **Onde:** `src/providers/whatsapp/contentFormat.ts` (`decodeContact`, ramo de 1
  linha).
- **O quê (antes do fix):** quando o contato compartilhado tinha **só** o nome
  (sem telefone resolvível) e esse nome era uma string numérica (ex.: contato
  não salvo), o encode produzia uma única linha e o decode classificava por
  shape → `PHONE_RE` casava → virava `{ phone }`, e o card mostrava o nome como
  número com "Copiar número".
- **Como foi resolvido:** todo telefone que chega em `encodeContact` já é E.164
  (com `+`) nos 3 engines — confirmado lendo `meta/parser.ts` (`toE164`) e os dois
  parsers Baileys (`phoneFromVCard` → `toE164`). Apertar `PHONE_RE` para exigir o
  `+` inicial resolve a ambiguidade sem tocar no formato de wire nem afetar
  mensagens já persistidas (que, quando eram telefone de verdade, sempre tinham
  `+`). Teste novo em `contentFormat.test.ts`.

### F. O conjunto "tipo estruturado sem bytes" (`location|contact`) vive em 4+ lugares — ✅ PARCIALMENTE RESOLVIDO (3ª rodada)
> O `MEDIA_TYPES` triplicado virou um const único `MEDIA_DISCRIMINATOR_TYPES` em
> `providers/whatsapp/types.ts`. Ainda separados (não unificados):
> `NON_ARCHIVABLE_MEDIA_TYPES` (subconjunto sem-bytes, no front) e o `Exclude<>`
> em `mediaDownload.ts` — propósitos distintos, baixa prioridade. Mantido como
> registro histórico.

---

## Refutados na verificação (registro, sem ação)

Não sobreviveram à verificação adversarial — listados só para fechar o ciclo:
predicado `STRUCTURED_MEDIA_TYPES` compartilhado (decisão: inline por engine);
"over-scan" no decode; memoização do decode na bolha; `toMediaType` com array
hardcoded; `useRealtimeMessages` duplicando a subscription de `conversations`;
e uma suspeita de ordem-fora no `syncLatest`/`applyRealtimeRow` (prepend) —
**refutada** (a ordenação se mantém).
