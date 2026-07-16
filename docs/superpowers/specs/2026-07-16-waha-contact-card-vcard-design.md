# Design — WAHA: reconhecer card de contato compartilhado (vCard)

- **Data:** 2026-07-16
- **Codinome sugerido:** _(definir no version bump)_
- **Status:** Aprovado (brainstorming) — aguardando plano de implementação
- **Escopo:** engine **WAHA** apenas · `src/providers/whatsapp/waha/parser.ts` · `src/providers/whatsapp/contentFormat.ts` · backfill one-off

---

## 1. Contexto e problema

Duas mensagens recebidas na conta "Vendas — WAHA" (08:50 e 08:52) apareceram vazias na plataforma — só o horário, sem texto nem mídia. Investigação (`docs/checkpoints/` desta sessão) confirmou, direto no payload bruto salvo em `webhook_deliveries`, que são **cards de contato compartilhado (vCard)** de verdade:

- 08:50 → "Lurival Spuldaro - Loja do Basculante Binotto Group", `+55 54 9900-5499`
- 08:52 → "Posto Cavalinho", `+55 54 9225-1083`

**Causa raiz:** o payload do WAHA pra esse tipo de mensagem traz `hasMedia:false`, `body` vazio e um campo `vCards: string[]` com o vCard bruto — mas `IWahaMessagePayload` (`src/providers/whatsapp/waha/parser.ts`) nunca declarou esse campo, e `extractContent()` só sabe reconhecer mídia binária (`hasMedia && media.url`) ou cai pro texto genérico. Resultado: `{contentType: "text", text: ""}` — mensagem gravada 100% vazia.

**Não é lacuna de arquitetura** — os outros 3 engines (Meta, Evolution, Evolution Go) já tratam contato compartilhado corretamente, todos via o módulo compartilhado `src/providers/whatsapp/contentFormat.ts` (`phoneFromVCard` + `encodeContact`, mais `encodeBaileysContact` pros dois engines Baileys-shaped). O frontend já tem `ContactBubble.tsx` renderizando esse tipo (`media_type: "contact"`). É só o parser do WAHA que nunca foi ligado nesse pipeline já existente.

## 2. Objetivo

1. Uma mensagem WAHA de card de contato passa a virar `{contentType: "contact", text: "<nome>\n<telefone>"}` (mesmo formato canônico que os outros 3 engines já produzem), aparecendo na Inbox com o card de contato em vez de vazia.
2. As mensagens **já gravadas vazias** nas últimas ~48h (desde que `webhook_deliveries` existe) são corrigidas com o dado exato — não é um chute, é reler o payload bruto que a plataforma já guardou.

### Não-objetivos (YAGNI)

- **Multi-contato compartilhado:** WAHA manda `vCards` como array; se vier mais de um card na mesma mensagem, só o **primeiro** é usado — mesma simplificação que o Evolution já aplica (`contactsArrayMessage.contacts[0]`), documentada, não nova.
- **Sem correção retroativa além da janela de `webhook_deliveries`** (~48h) — antes disso o payload bruto não existe mais, não tem como recuperar (mesmo limite já visto no caso do 9º dígito e na recuperação de mídia WAHA).
- **Sem mudança nos outros 3 engines** — já funcionam.
- **Sem novo tipo de conteúdo** — `"contact"` já existe em `InboundContentType`/`ContactBubble`; só o parser WAHA que precisa preencher.

### Critérios de sucesso

1. Uma nova mensagem WAHA com `vCards` populado grava `media_type='contact'` e `text` no formato `nome\ntelefone` (ou só o que existir).
2. As mensagens de 08:50/08:52 (e qualquer outra achada na mesma janela) passam a mostrar nome+telefone do contato compartilhado.
3. Nenhuma mudança em Meta/Evolution/Evolution Go.

## 3. Parser (`src/providers/whatsapp/waha/parser.ts`)

`IWahaMessagePayload` ganha `vCards?: string[]`.

`extractContent()` passa a checar, entre o branch de mídia e o fallback de texto:

```ts
if (payload.vCards?.[0]) {
  const vcard = payload.vCards[0];
  return {
    contentType: "contact",
    text: encodeContact({ name: nameFromVCard(vcard), phone: phoneFromVCard(vcard) }),
  };
}
```

Sem mudança no `waha-webhook/index.ts` — ele já grava `media_type: parsed.contentType` (exceto `text`/`unknown` → `null`) e `text: parsed.text` genericamente pros dois pontos de escrita (inbound e eco outbound), então `"contact"` flui sem tocar nada ali.

## 4. Novo helper `nameFromVCard` (`src/providers/whatsapp/contentFormat.ts`)

`phoneFromVCard` já existe e extrai o telefone do vCard bruto; falta o nome. vCard puro (o que o WAHA manda) não separa nome como um campo próprio do payload — igual aos outros engines Baileys-shaped fazem (`contactMessage.displayName`) — o nome só existe DENTRO do texto do vCard, na linha `FN:`. Novo helper, mesmo estilo defensivo de `phoneFromVCard`:

```ts
/**
 * Best-effort display name from a vCard's FN (Formatted Name) line — the
 * only place a bare vCard (WAHA) carries a name; Baileys-shaped engines get
 * it from a separate proto field instead (see encodeBaileysContact).
 */
export function nameFromVCard(vcard: string | undefined | null): string | undefined {
  if (!vcard) return undefined;
  const fn = vcard.match(/^FN:(.+)$/m);
  return fn ? oneLine(fn[1]) || undefined : undefined;
}
```

Reaproveita `oneLine` (já existe no arquivo). `encodeContact`/`decodeContact`/`ContactBubble` não mudam — já são genéricos.

## 5. Sync do mirror

`contentFormat.ts` e `waha/parser.ts` são ambos espelhados (`_shared/whatsapp/contentFormat.ts`, `_shared/whatsapp/waha/parser.ts`). Depois da mudança: `bun run scripts/sync-whatsapp-shared.ts`. Deploy da `waha-webhook` necessário pra produção passar a usar o mirror atualizado (o `index.ts` da function não muda, mas importa o `parser.ts` mirror que muda).

## 6. Backfill das mensagens já quebradas

Script one-off (`scripts/waha-backfill-contact-cards.ts`, mesmo padrão do `scripts/waha-resubscribe-message-ack.ts` da sessão anterior — `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` via env, rodado pelo dono):

1. Busca em `webhook_deliveries` (`integration_name='whatsapp_waha'`, `event_type in ('message','message.any')`) as entregas cujo `request_payload.payload.vCards` é um array não-vazio.
2. Pra cada uma, pega `provider_message_id` (`request_payload.payload.id`) e o primeiro vCard.
3. Busca a linha correspondente em `messages` por `provider_message_id`; **só mexe se a linha ainda estiver no estado quebrado** (`text = ''` e `media_type is null`) — nunca sobrescreve uma mensagem que já tem conteúdo certo.
4. Calcula o `text`/`media_type` corretos chamando **as mesmas funções de produção** (`nameFromVCard`, `phoneFromVCard`, `encodeContact`, importadas direto de `src/providers/whatsapp/contentFormat.ts`) — zero risco de a lógica do backfill divergir da lógica do parser.
5. Roda em modo **dry-run por padrão** (só imprime o que mudaria); uma flag `--apply` faz o `UPDATE` de fato. Sequencial, best-effort (erro numa linha não trava as demais), log por linha.

## 7. Testes

- `contentFormat.test.ts`: `nameFromVCard` — extrai `FN:`, retorna `undefined` quando ausente/vazio, ignora conteúdo depois da linha (multi-linha).
- `waha/parser.test.ts`: mensagem inbound com `vCards: [<vcard completo>]` → `contentType: "contact"`, `text` bate com `encodeContact(...)` pro mesmo vcard; array com mais de um item usa só o primeiro; mensagem sem `vCards` continua caindo no comportamento atual (regressão).

## 8. Riscos & mitigações

- **vCard sem `FN:`** (raro, mas possível) → `nameFromVCard` retorna `undefined`, `encodeContact` já lida com "só telefone" (mesmo caminho que hoje existe pra um contato sem nome resolvível).
- **Backfill sobrescrever algo errado** → mitigado pela condição "só se ainda estiver vazio" (nunca eco de sobrescrita) + dry-run obrigatório antes do apply.
- **Mensagens fora da janela de `webhook_deliveries`** (mais antigas) → aceitas como irrecuperáveis, mesma postura já usada no incidente de recuperação de mídia WAHA desta mesma conta.
