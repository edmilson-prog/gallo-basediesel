# WAHA — Resolução de `@lid` → telefone real — Design

> **Status:** aprovado para plano (2026-07-11) · **Escopo:** webhook WAHA (recepção) + backfill
> **Contexto:** integração WAHA base (PR #265) + card/parâmetros (v0.139.0 `Dial`). Achado no smoke do dono: conversas WAHA aparecem com o `@lid` (identificador de privacidade do WhatsApp) exibido como se fosse telefone.

**Goal:** Quando o remetente de uma mensagem WAHA chega como `@lid` (número oculto pela privacidade do WhatsApp), resolver para o telefone real via a API da WAHA — em vez de fabricar um "+telefone" a partir dos dígitos do `@lid` — para que a deduplicação de cliente, a exibição e o histórico usem o número correto. Semear também o nome do contato (`pushname`). Backfill das conversas já criadas com telefone-fantasma.

**Arquitetura (resumo):** A WAHA (engine GOWS) mantém o mapa `lid ↔ telefone` e o expõe: `GET /api/{session}/lids/{lid}` → `{ lid, pn }`. O `parser.ts` passa a marcar `@lid` (hoje ele transforma cegamente os dígitos em telefone); o `waha-webhook` resolve o `@lid`→telefone **antes** da resolução de cliente e semeia o nome via a API de contatos. Um backfill one-off (Owner-gated, dry-run) conserta o que já entrou, por **sonda** (`/lids`). Nenhuma migration — o telefone real vai para a coluna `phone` existente.

**Tech stack:** engine `waha/*` runtime-agnostic (espelhado em `_shared/`), Edge Functions Deno, Supabase, Vitest.

---

## Global Constraints

- **Engine `src/providers/whatsapp/waha/**`** só Web APIs + imports relativos; após mudar: `bun run scripts/sync-whatsapp-shared.ts` + redeploy das funções afetadas (`waha-webhook`; `waha-connect` se ganhar a ação de backfill). Owner-gated.
- **`waha-webhook`/`waha-connect` isolados** — não importam o pipeline compartilhado Meta/Evolution (`_shared/whatsapp/{build,webhook/core,send/core}.ts`).
- **NÃO tocar** nos caminhos congelados do Atendimento (signing lote #137, realtime, query keys, RPC gated-once). O backfill mexe em `customers`/`conversations`/`messages` mas **fora** desses caminhos, e sempre **dry-run + revisão** antes de aplicar.
- **Sem migration** (o telefone real usa a coluna `phone`; o `@lid` é reconstruível a partir dos dígitos salvos — nada novo a persistir).
- **pt-BR com acentos** em UI/mensagens; código/comentários em inglês. Tokens semânticos se houver UI.
- **Nenhum segredo no repo** — a chave da WAHA continua resolvida do Vault server-side.

---

## 1. Estado atual (a causa)

`src/providers/whatsapp/waha/parser.ts`:
```ts
const NON_INDIVIDUAL_JID = /@(g\.us|broadcast|newsletter)$/;   // não trata @lid
function jidToE164(jid) {
  const digits = (jid ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? `+${digits}` : "";               // dígitos do JID + "+"
}
// parseWahaMessageEvent → return { ..., fromPhone: jidToE164(payload.from) }
```
`supabase/functions/waha-webhook/index.ts`: usa `parsed.fromPhone` para achar/criar o cliente; se cria, grava `phone: fromPhone` e `full_name: fromPhone` (linha ~239, comentário: "WAHA v1 has no contact-name field to seed from; phone is the placeholder").

⇒ Um remetente `<lid>@lid` vira um cliente-fantasma com `phone` = `+<lid-digits>` (14–15 dígitos, prefixo impossível) e `full_name` idêntico. Cada `@lid` distinto cria um cliente novo.

**Fato confirmado (doc oficial WAHA — contatos):**
- `GET /api/{session}/lids/{lid}` → `{ "lid": "123@lid", "pn": "5548...@c.us" }` (resolve `@lid`→telefone)
- `GET /api/{session}/lids/pn/{phone}` → reverso
- `GET /api/contacts?session=…&contactId=…` → `{ id, number, name, pushname, shortName }` (nome do contato)

---

## 2. Parte A — Fix na recepção (indo pra frente)

### 2.1 Engine (`src/providers/whatsapp/waha/`, + mirror `_shared/`)
- **`resolveWahaLid(apiKey, fetchFn, { baseUrl, sessionName, lid }): Promise<{ phone?: string }>`** — `GET /{sessionName}/lids/{lid}` (encode do `lid`); converte `pn` (`<digits>@c.us`) → E.164; retorna `{ phone }` ou `{ phone: undefined }` se não resolver (404/sem `pn`). Erros de rede propagam via `wahaRequest`.
- **`getWahaContactName(apiKey, fetchFn, { baseUrl, sessionName, contactId }): Promise<string | undefined>`** — best-effort; tenta a API de contatos e devolve `pushname ?? name ?? shortName`. Nunca lança para o chamador (retorna `undefined` no erro). ⚠️ **Os parâmetros exatos do endpoint de contatos serão confirmados no plano contra o servidor-alvo** (query `session`+`contactId` vs. path); enquanto não confirmado, degrada para `undefined` (fallback telefone).

### 2.2 Parser (`parser.ts`)
- Detectar `@lid`: se `payload.from` termina em `@lid`, **não** fabricar telefone. Novo campo no retorno de mensagem inbound: `fromLid?: string` (o JID cru `<x>@lid`) e `fromPhone` vazio nesse caso; para `@c.us`, `fromPhone` como hoje e `fromLid` ausente.
- `NON_INDIVIDUAL_JID` inalterado (`@lid` continua passando — é 1:1, só oculto).
- Tipo `IInboundMessage` (`../types`) ganha `fromLid?: string`.

### 2.3 Webhook (`waha-webhook/index.ts`)
- Após `parseWahaMessageEvent`, se `parsed.fromLid`:
  1. `resolveWahaLid(...)` → telefone real. Se resolveu, usa esse telefone daqui pra frente (resolução/criação de cliente).
  2. Se **não** resolveu (fallback): não fabricar "+telefone"; criar/achar o cliente com uma identidade estável derivada do `@lid` (o telefone-placeholder atual como último recurso) **porém** com `full_name` = `pushname` (se houver) e uma `tag` `"lid_unresolved"` para triagem — nunca exibir os dígitos do `@lid` como se fosse número validado. (Detalhe de exibição: o card/inbox já mostram o `full_name`; o telefone-placeholder fica secundário.)
- Ao **criar** cliente novo (qualquer origem WAHA), semear `full_name` com `getWahaContactName(...)` (best-effort) em vez do telefone; fallback = telefone.
- Resolução de cliente/conversa/mensagem: **inalterada** a jusante (só muda a *origem* do telefone/nome).
- Custo: 1 GET `/lids` por mensagem `@lid` + 1 GET de contato só no caminho de cliente novo. Aceitável (Owner-only, baixa cardinalidade).

### 2.4 Sync + deploy
`bun run scripts/sync-whatsapp-shared.ts` + **redeploy `waha-webhook`** (Owner-gated).

---

## 3. Parte B — Backfill (one-off, dry-run, Owner-gated)

**Identificação por sonda (sem heurística de tamanho):** para cada cliente com ao menos uma conversa numa conta WAHA da loja, reconstruir o `@lid` a partir dos dígitos de `phone` (`<digits>@lid`) e chamar `resolveWahaLid`. Se retorna `pn` → **era `@lid`** (corrige); se 404/sem `pn` → era telefone real (deixa quieto).

**Ação por cliente resolvido:**
- Buscar cliente existente com o **telefone real** na mesma loja (mesmo match suffix+exato do webhook).
  - **Não existe** → `UPDATE customers SET phone = <real>, full_name = <pushname ?? real>` no próprio cliente-fantasma; remover a tag de fantasma se aplicável.
  - **Existe (colisão)** → **merge**: repontar `conversations.customer_id` e `messages.author_id` do fantasma para o cliente real, depois `DELETE` do cliente-fantasma. (Conversas duplicadas na mesma conta ficam coexistindo sob o cliente real — aceitável; o dry-run lista cada colisão para revisão.)

**Entrega:** ação Owner-only **`backfillLids`** no `waha-connect` com `{ storeId, dryRun: boolean }`:
- `dryRun: true` → **não escreve**; retorna o relatório (quantos `@lid` detectados, quantos update-in-place, quantas colisões/merges, com telefones antes→depois).
- `dryRun: false` → aplica; auditar `whatsapp_lid_backfill` em `audit_logs`.
- Execução: dono roda dry-run → revisa → aprova → aplica.

⚠️ **Sensível:** o merge mexe em `customers`/`conversations`/`messages` (domínio do Atendimento) como `service_role` (RLS bypass). Não toca signing/realtime/query-keys. Dry-run + revisão são obrigatórios. Idempotente (rodar de novo não re-mescla — o fantasma já não existe / o telefone já é real e o probe `/lids` do telefone real dá 404).

---

## 4. Fora de escopo

Participantes `@lid` de **grupos** (grupos já são rejeitados — sem cliente 1:1); cache da resolução `lid→phone` (dedup por telefone já evita recriar cliente; otimização futura); coluna dedicada `customers.waha_lid` (o `@lid` é reconstruível dos dígitos — sem migration); alteração no `whatsapp-webhook` dos outros engines (isolamento).

---

## 5. Riscos & itens a fixar no plano

1. **Parâmetros exatos do endpoint de contatos** (`pushname`) — confirmar contra o servidor GOWS-alvo; degradar para `undefined` sem confirmação (fallback telefone). O `/lids/{lid}` está documentado e é o caminho crítico.
2. **Merge do backfill** — repontar FKs com cuidado; dry-run mostra cada colisão; idempotência garantida pela sonda.
3. **Fallback `lid_unresolved`** — caso raro; não fabricar telefone validado. Decidir no plano o rótulo exibido.
4. **Latência do webhook** — +1 GET por `@lid`; aceitável, mas o `resolveWahaLid` usa timeout curto (~10 s) e falha graciosamente (cai no fallback, nunca derruba a recepção).

---

## 6. Estratégia de testes

- **Engine (Vitest, TDD):** `resolveWahaLid` (monta URL `/lids/{lid}`, parseia `pn`→E.164, `undefined` em 404); `getWahaContactName` (extrai `pushname`, `undefined` no erro); `parser` (`@lid` → `fromLid` setado + `fromPhone` vazio; `@c.us` → comportamento atual). Espelhar no `_shared` via sync.
- **Webhook & backfill:** sem harness Deno local — gate = revisão + `bun run build` verde + **smoke do dono** (mensagem `@lid` real → telefone/nome certos; dry-run do backfill revisado antes de aplicar).
- **Gate:** `bun run build` + `bun run test` verdes; `tsc` por delta (baseline).

---

## 7. Rollout

Sem migration. **Redeploy `waha-webhook`** (fix) + **`waha-connect`** (ação `backfillLids`) — Owner-gated (confirmar antes). Frontend: nenhum (a exibição já usa `full_name`/`phone`). Backfill: **dry-run → revisão do dono → aplicar**. Depois, smoke: uma mensagem `@lid` nova deve entrar com telefone real + nome.
