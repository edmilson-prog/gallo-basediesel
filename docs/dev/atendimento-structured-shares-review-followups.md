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
> - **B parcialmente RESOLVIDO** — a faceta "chamada redundante" foi corrigida:
>   `useRealtimeMessages` rastreia o `sentAt` mais recente já aplicado pelo canal
>   rápido (`messages`) e pula (ou cancela um `syncLatest` já agendado) quando o
>   touch do canal `conversations` já está coberto por esse `sentAt`
>   (`touchAlreadyCovered`). A outra faceta (só busca a página 1 / perda em
>   rajada > 50 mensagens) **segue adiada** — ver detalhe abaixo.
> - **E RESOLVIDO** — `PHONE_RE` em `contentFormat.ts` passou a exigir o `+`
>   inicial. Os 3 engines (Meta via `toE164`, Evolution/Evolution Go via
>   `phoneFromVCard` → `toE164`) sempre entregam telefone em E.164 quando
>   presente, então a mudança não quebra nenhuma mensagem já persistida — só
>   deixa de confundir um nome 100% numérico sem telefone resolvível com um
>   telefone. Mudança só de decode (frontend); mirror sincronizado em
>   `_shared/whatsapp/contentFormat.ts`, sem necessidade de redeploy de edge
>   function (decode nunca roda no servidor).
> - **D avaliado e MANTIDO sem mudança de código** — ver justificativa abaixo.

---

## Tradeoffs deliberados (validados pelo dono — não mexer sem motivo)

### A. `recencyKey` re-dispara o `listLastMessages` da página inteira — ✅ RESOLVIDO (4ª rodada)
- **Onde:** `src/features/conversations/hooks/useRelatedEntities.ts`.
- **Fix:** novo helper puro `changedRecencyIds` (mesmo padrão de `missingIds`)
  compara a recência atual de cada conversa contra a última vista
  (`lastSeenRecencyRef`); só as que mudaram entram no `listLastMessages`.
  Testado em `useRelatedEntities.test.ts`.
- **Severidade original:** baixa (eficiência; só pesava em páginas grandes com
  alto volume).

### B. `syncLatest` dispara em todo "touch" e só busca a página 1 — parcialmente RESOLVIDO (4ª rodada)
- **Onde:** `src/features/conversations/hooks/useRealtimeMessages.ts` e
  `src/features/conversations/hooks/useMessages.ts` (`syncLatest`).
- **O quê:** (1) ~~o thread escuta o canal `conversations` e roda `syncLatest` a
  cada toque, redundante com o fast-path do INSERT~~ → **RESOLVIDO**:
  `touchAlreadyCovered` compara o `last_message_at` do touch contra o `sentAt`
  mais recente já aplicado pelo canal `messages`; um touch só dispara/mantém o
  `syncLatest` agendado quando o fast-path ainda não cobriu aquele ponto no
  tempo — nunca pula de forma especulativa, só quando há prova de que já
  convergiu. (2) `syncLatest` só puxa a página mais nova (50 mensagens) — se um
  burst > 50 mensagens for perdido pelo Realtime, o miolo não é recuperado até
  um refetch/scroll. **Segue adiado** — teria que paginar pra trás reconciliando
  o `providerMessageId` mais antigo conhecido, mudança bem mais invasiva na área
  congelada do cache do Atendimento para um cenário que se autocura ao reabrir a
  conversa. ~~(3) ordem fora do `prependNewest`~~ → já corrigido na 3ª rodada.
- **Severidade restante:** baixa (borda de burst-com-perda; auto-cura ao reabrir
  a conversa).

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
