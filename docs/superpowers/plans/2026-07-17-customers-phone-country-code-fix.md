# Telefones DINTEC sem código do país (55) quebram envio WAHA — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o envio WhatsApp funcionar para os ~1.430 clientes gravados com telefone BR local sem o DDI 55 (import DINTEC de 2026-07-12), sem corromper números internacionais legítimos — via normalização no engine WAHA + backfill assistido de `customers.phone`.

**Architecture:** Duas frentes complementares. (1) **Código:** um helper puro `normalizeBrDialDigits` em `src/providers/whatsapp/phoneBr.ts` (árvore mirror-safe), aplicado dentro de `toChatId` em `waha/send.ts` — ponto único que cobre os 4 consumidores Edge (waha-send, scheduled-send-worker, sdr-respond, waha-connect). (2) **Dados:** backfill assistido (dry-run → revisão do dono → aplicar) que grava `'+55' || phone_digits` nos clientes locais curtos — conserta a raiz para TODOS os providers (Evolution/Meta inclusive), para o `whatsapp-check-number` (que hoje rejeita esses clientes com 422) e para a busca.

**Tech Stack:** TypeScript (engine runtime-agnostic, Vitest), Supabase Edge Functions (Deno), SQL via MCP `execute_sql` (service_role), `scripts/sync-whatsapp-shared.ts`.

## Contexto (causa raiz, evidência já confirmada)

- Import DINTEC (2026-07-12, scripts na branch não mergeada dos PRs #263/#266) gravou o telefone **cru do ERP** em clientes novos: 470 com 10 dígitos e 941 com 11 (hoje 1.430 no total com linhas orgânicas). A regra de normalização existia no PRD-124 RF-011 ("Se length ∈ {10,11}: prefixa +55") mas o PRD foi deferido e os scripts assistidos não a aplicaram.
- O webhook WAHA casa inbound por sufixo de 8 dígitos + `phoneDigitsMatchBr` (55 opcional) e anexa a conversa ao cliente DINTEC. O envio então lê `customers.phone` e `toChatId` monta `49988184540@c.us` = número da **Alemanha** (+49) → servidor WAHA responde **HTTP 500 sem corpo** → mensagem `failed` ("Erro WAHA não mapeado").
- Caso observado: conversa `23a0803c-c644-4ad6-b4eb-d0f9cf453069` (RODAWE TRANSPORTES LTDA, customer `1a11db4d`, phone `49988184540`, codcli 2622), 5 mensagens `failed` em 2026-07-17. Segunda conversa no mesmo perfil de risco: GILBERTO FISCHER LTDA (customer `0e179d08`, phone `53999511127`).
- O pipeline não-WAHA **não protege**: `assertE164` aceita `+49988184540` (é E.164 válido) — Evolution/Meta discariam o país errado em silêncio.
- Armadilha regional: DDD **55** é a região da loja (Frederico Westphalen/RS) — 734 dos curtos começam com "55" sendo DDD, não DDI. Qualquer heurística `startsWith('55')` é PROIBIDA; o critério é **comprimento** (10–11 = local; 12–13 = com DDI).
- Falso-positivo real em prod: `+56995070445` (Chile) e `+59173626401` (Bolívia) têm 11 dígitos e **enviam corretamente hoje** — a regra deve **confiar no `+`** (nunca prefixar quando o valor cru começa com `+`).

## Global Constraints

- **Mirror rule (CLAUDE.md):** mudou `src/providers/whatsapp/**` ⇒ rodar `bun run scripts/sync-whatsapp-shared.ts` e redeployar as Edge Functions consumidoras. O espelho `_shared/whatsapp/**` é AUTO-GENERATED — nunca editar à mão.
- **Consumidores do espelho de `waha/send.ts` (redeploy obrigatório):** `waha-send`, `scheduled-send-worker`, `sdr-respond` (import direto em `sdr-respond/dispatch.ts:23` — fácil de esquecer), `waha-connect` (consistência).
- **Gates do dono (memória do projeto):** NUNCA mergear PR sem OK; NUNCA deploy de Edge Function em prod sem OK; NUNCA escrita em prod (backfill) sem dry-run revisado + OK explícito.
- **NUNCA inserir o 9º dígito às cegas** (lição PR #302) — este plano só prefixa `55`, jamais toca no miolo do número.
- **Caminhos congelados do Atendimento** (signing lote #137, realtime, query keys, RPCs gated-once, `webhook/core.ts`/`send/core.ts` compartilhados) — **zero linhas tocadas** por este plano.
- **Formato do backfill:** `'+55' || phone_digits` sem pontuação — o pre-filtro do webhook é `LIKE` textual nos últimos 8 dígitos da coluna crua; separadores quebrariam o attach.
- Sem migration (é dado + código; nenhum schema muda). Sem bump de versão (fix direto; bump só quando solicitado — antes de eventual bump, `git fetch origin main` + ler a versão real, lição da corrida de versão).
- Comentários de código em inglês; commits Conventional Commits; UI não é tocada.
- Worktree de trabalho: `.claude/worktrees/fix-waha-lid-send`, branch `worktree-fix-waha-lid-send` (base `origin/main` 48e0de2b). Baseline verde: 256 files / 1996 tests.
- Deploy: `npx supabase functions deploy <fn> --project-ref njizaasajkdqptlxddqn`.

---

### Task 1: Helper `normalizeBrDialDigits` em `phoneBr.ts` (TDD)

**Files:**
- Modify: `src/providers/whatsapp/phoneBr.ts` (append ao fim; hoje tem 47 linhas)
- Test: `src/providers/whatsapp/phoneBr.test.ts` (append novo `describe`)

**Interfaces:**
- Consumes: nada novo (módulo puro já existente, mirror-safe).
- Produces: `export function normalizeBrDialDigits(rawPhone: string): string` — recebe o telefone CRU (com `+`/pontuação) e devolve os dígitos de discagem; Task 2 importa exatamente esse nome via `../phoneBr`.

- [ ] **Step 1: Escrever os testes que falham**

Append em `src/providers/whatsapp/phoneBr.test.ts` (ajustar o import existente no topo para incluir `normalizeBrDialDigits`):

```ts
describe("normalizeBrDialDigits", () => {
  it("prefixes 55 on a bare 11-digit BR local number (DINTEC import shape)", () => {
    expect(normalizeBrDialDigits("49988184540")).toBe("5549988184540");
  });

  it("prefixes 55 on a bare 10-digit BR local number (no 9th digit — never inserts it)", () => {
    expect(normalizeBrDialDigits("4988184540")).toBe("554988184540");
  });

  it("keeps 55-prefixed 12-13 digit numbers unchanged", () => {
    expect(normalizeBrDialDigits("5549988184540")).toBe("5549988184540");
    expect(normalizeBrDialDigits("554988184540")).toBe("554988184540");
  });

  it("prefixes 55 when the DDD itself is 55 (Frederico Westphalen region)", () => {
    expect(normalizeBrDialDigits("5537461083")).toBe("555537461083");
  });

  it("trusts an explicit + as E.164 and never prefixes (Chile/Bolivia are also 10-11 digits)", () => {
    expect(normalizeBrDialDigits("+56995070445")).toBe("56995070445");
    expect(normalizeBrDialDigits("+59173626401")).toBe("59173626401");
    expect(normalizeBrDialDigits("+5549988184540")).toBe("5549988184540");
  });

  it("leaves 10-11 digit values with an invalid BR DDD untouched (fail-open)", () => {
    expect(normalizeBrDialDigits("57996445339")).toBe("57996445339");
    expect(normalizeBrDialDigits("5996902510")).toBe("5996902510");
  });

  it("leaves trunk-zero values untouched (fail-open)", () => {
    expect(normalizeBrDialDigits("04998818454")).toBe("04998818454");
  });

  it("strips punctuation before deciding", () => {
    expect(normalizeBrDialDigits("(49) 98818-4540")).toBe("5549988184540");
  });

  it("passes empty/garbage through unchanged", () => {
    expect(normalizeBrDialDigits("")).toBe("");
    expect(normalizeBrDialDigits("+0")).toBe("0");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `bunx vitest run src/providers/whatsapp/phoneBr.test.ts`
Expected: FAIL — `normalizeBrDialDigits is not exported` / não definido.

- [ ] **Step 3: Implementar o helper**

Append em `src/providers/whatsapp/phoneBr.ts`:

```ts
/** Valid Brazilian area codes (Anatel allocation). Gaps (23, 25-26, 29-30,
 *  36, 39-40, 50, 52, 56-60, 70, 72, 76, 78, 80, 90) are unassigned. */
const VALID_BR_DDD = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

/**
 * Dial digits for outbound sends: prefixes Brazil's DDI (55) on bare local
 * numbers (10-11 digits, valid DDD, no trunk zero) stored without it — the
 * 2026-07-12 DINTEC import wrote ERP phones verbatim. An explicit leading
 * "+" is TRUSTED as E.164 and never prefixed: Chile (+56 9…) and Bolivia
 * (+591 7…) mobiles are also 10-11 digits and must not be corrupted. The
 * length rule (not a startsWith("55") check) is deliberate — DDD 55 is the
 * store's own region. Everything else passes through unchanged (fail-open;
 * the provider rejects bad numbers loudly).
 */
export function normalizeBrDialDigits(rawPhone: string): string {
  const digits = digitsOf(rawPhone);
  if (rawPhone.trim().startsWith("+")) return digits;
  if (
    (digits.length === 10 || digits.length === 11) &&
    !digits.startsWith("0") &&
    VALID_BR_DDD.has(digits.slice(0, 2))
  ) {
    return `55${digits}`;
  }
  return digits;
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `bunx vitest run src/providers/whatsapp/phoneBr.test.ts`
Expected: PASS (todos, incluindo os pré-existentes de `buildNineDigitCandidate`/`phoneDigitsMatchBr`).

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/phoneBr.ts src/providers/whatsapp/phoneBr.test.ts
git commit -m "feat(whatsapp): add normalizeBrDialDigits BR DDI helper"
```

---

### Task 2: Aplicar no `toChatId` do engine WAHA (TDD)

**Files:**
- Modify: `src/providers/whatsapp/waha/send.ts:11-13` (função `toChatId`)
- Test: `src/providers/whatsapp/waha/send.test.ts` (append 3 casos)

**Interfaces:**
- Consumes: `normalizeBrDialDigits(rawPhone: string): string` de `../phoneBr` (Task 1).
- Produces: comportamento — `sendWahaText`/`sendWahaMedia` passam a discar `5549988184540@c.us` para `toPhone: "49988184540"`. Nenhuma assinatura muda.

- [ ] **Step 1: Escrever os testes que falham**

Append em `src/providers/whatsapp/waha/send.test.ts` (dentro dos `describe` existentes ou num novo bloco; `toChatId` não é exportado — testa-se pelo corpo do POST, padrão do arquivo):

```ts
describe("toChatId country-code normalization", () => {
  it("prefixes Brazil's DDI on a bare local phone stored without it (DINTEC import shape)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_1@c.us_X" }));
    await sendWahaText("key", fetchFn, target, { toPhone: "49988184540", text: "oi" });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chatId).toBe("5549988184540@c.us");
  });

  it("does not prefix an explicit E.164 foreign phone (Chile mobile is also 11 digits)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_2@c.us_Y" }));
    await sendWahaText("key", fetchFn, target, { toPhone: "+56995070445", text: "hola" });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chatId).toBe("56995070445@c.us");
  });

  it("normalizes the chatId on media sends too (same toChatId path)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_3@c.us_Z" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "49988184540",
      mediaType: "image",
      mediaUrl: "https://storage.example.com/signed.jpg",
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chatId).toBe("5549988184540@c.us");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `bunx vitest run src/providers/whatsapp/waha/send.test.ts`
Expected: FAIL — chatId `49988184540@c.us` ≠ `5549988184540@c.us` (2 casos; o do Chile já passa hoje e continua passando).

- [ ] **Step 3: Implementar**

Em `src/providers/whatsapp/waha/send.ts`, trocar:

```ts
function toChatId(phone: string): string {
  return `${phone.replace(/\D/g, "")}@c.us`;
}
```

por:

```ts
import { normalizeBrDialDigits } from "../phoneBr";
// (import junto aos existentes no topo do arquivo)

function toChatId(phone: string): string {
  // customers.phone may be a bare BR local number (DINTEC import wrote ERP
  // values verbatim) — without the DDI the JID resolves to the wrong country.
  return `${normalizeBrDialDigits(phone)}@c.us`;
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `bunx vitest run src/providers/whatsapp/waha/send.test.ts`
Expected: PASS (novos + os 7 pré-existentes, que usam `+5511988887777` → inalterados).

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/waha/send.ts src/providers/whatsapp/waha/send.test.ts
git commit -m "fix(whatsapp): prefix BR DDI on bare local phones in WAHA chatId"
```

---

### Task 3: Sync do espelho `_shared` + gates completos

**Files:**
- Regenerate (via script, nunca à mão): `supabase/functions/_shared/whatsapp/phoneBr.ts`, `supabase/functions/_shared/whatsapp/waha/send.ts`

**Interfaces:**
- Consumes: código das Tasks 1–2.
- Produces: espelho atualizado que as 4 Edge Functions consumidoras embarcam no deploy (Task 6).

- [ ] **Step 1: Rodar o sync**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: script termina sem erro, regravando `supabase/functions/_shared/whatsapp/**`.

- [ ] **Step 2: Guarda anti-drift — conferir que SÓ os espelhos esperados mudaram**

O script APAGA e regrava o espelho inteiro (`rmSync`, linha 49) — houve caso real de drift embarcado. Run:

```bash
git status --short supabase/functions/_shared/whatsapp/
git diff --stat supabase/functions/_shared/whatsapp/
```

Expected: exatamente 2 arquivos modificados — `_shared/whatsapp/phoneBr.ts` e `_shared/whatsapp/waha/send.ts`. Se aparecer QUALQUER outro arquivo, PARAR e investigar o drift antes de commitar (não embarcar mudanças não relacionadas).

- [ ] **Step 3: Gates completos do repo**

```bash
bun run test
bun run build
```

Expected: teste 100% verde (≥1996 + os novos), build sem erro. (`tsc` tem baseline de erros pré-existentes — avaliar só por delta se rodar.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/whatsapp/phoneBr.ts supabase/functions/_shared/whatsapp/waha/send.ts
git commit -m "chore(whatsapp): sync _shared mirror (phoneBr + waha/send)"
```

---

### Task 4: Documentação (regra de redeploy stale + prevenção no import)

**Files:**
- Modify: `docs/dev/waha-integration.md` (~linha 100 — lista de redeploy desatualizada)
- Modify: `docs/dev/dintec-providers.md` (append seção nova de normalização de telefone)

**Interfaces:** nenhuma (docs).

- [ ] **Step 1: Corrigir a lista de redeploy em `waha-integration.md`**

Localizar a frase na ~linha 100 que manda "redeployar as 3 funções `waha-connect`/`waha-webhook`/`waha-send`" (anterior a `scheduled-send-worker` e `sdr-respond`) e substituí-la por:

```markdown
Mudou `src/providers/whatsapp/**` ⇒ rodar `bun run scripts/sync-whatsapp-shared.ts` e redeployar as funções que embarcam o módulo alterado. Consumidores do espelho WAHA hoje: `waha-webhook` (parser/contacts), `waha-connect` (session/contacts/send — test-message), `waha-send` e `scheduled-send-worker` (send, via `_shared/wahaSendAdapter.ts`) e `sdr-respond` (send, import direto em `dispatch.ts` — não passa pelo adapter; fácil de esquecer). Em caso de dúvida, `grep` do módulo em `supabase/functions/` decide a lista.
```

- [ ] **Step 2: Seção de prevenção em `dintec-providers.md`**

Append ao final do arquivo:

```markdown
## Normalização de telefone em cargas DINTEC (obrigatória)

O import assistido de 2026-07-12 gravou telefones **crus do ERP** (10–11 dígitos, sem o DDI 55) em ~1.411 clientes novos. Consequência: o envio WhatsApp montava o JID do país errado (`49988184540@c.us` = Alemanha) e falhava com HTTP 500 — corrigido por backfill em 2026-07-17 (ver `docs/superpowers/plans/2026-07-17-customers-phone-country-code-fix.md`). Toda carga futura DEVE aplicar a regra do PRD-124 RF-011 antes de gravar `customers.phone`:

1. Reduzir a dígitos; se o valor original tem `+` inicial, é E.164 explícito — gravar `'+' + dígitos` sem mais transformação (protege números estrangeiros: Chile/Bolívia também têm 10–11 dígitos).
2. Sem `+`: se `length ∈ {10, 11}`, sem zero-tronco e com DDD BR válido (Anatel), gravar `'+55' + dígitos`. A decisão é por **comprimento**, nunca por `startsWith('55')` — DDD 55 é a região da loja.
3. **NUNCA inserir o 9º dígito** (lição PR #302 — só o WhatsApp confirma essa variante).
4. Gravar sempre `'+' + dígitos` **sem pontuação** — o attach do webhook usa `LIKE` textual nos últimos 8 dígitos da coluna crua.
5. Antes de gravar, checar colisão com cliente existente da mesma loja (`phone_digits` igual ou variante de 9º dígito) e tratar caso a caso, não sobrescrever.

Helper de referência no código: `normalizeBrDialDigits` em `src/providers/whatsapp/phoneBr.ts`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/waha-integration.md docs/dev/dintec-providers.md
git commit -m "docs: update WAHA redeploy list + DINTEC phone normalization rule"
```

---

### Task 5: PR (GATE: OK do dono para merge)

**Files:** nenhum novo.

- [ ] **Step 1: Push e abrir PR**

```bash
git push -u origin worktree-fix-waha-lid-send
gh pr create --title "fix(whatsapp): BR DDI normalization on WAHA dial path (DINTEC bare phones)" --body "$(cat <<'EOF'
## Problema
O import DINTEC (2026-07-12) gravou ~1.430 clientes com telefone BR local sem o DDI 55. O envio WAHA monta o chatId com os dígitos crus — `49988184540@c.us` resolve para a Alemanha (+49) e o servidor WAHA falha com HTTP 500 ("Erro WAHA não mapeado"). Caso observado: conversa RODAWE TRANSPORTES (5 mensagens failed em 2026-07-17).

## Fix (código)
- Novo helper puro `normalizeBrDialDigits` (`src/providers/whatsapp/phoneBr.ts`): prefixa 55 apenas quando o valor cru NÃO tem `+`, tem 10–11 dígitos, sem zero-tronco e com DDD BR válido. `+` explícito é confiado (protege Chile/Bolívia, 11 dígitos, em prod). Decisão por comprimento — nunca `startsWith('55')` (DDD 55 é a região da loja).
- Aplicado em `toChatId` (`waha/send.ts`) — ponto único que cobre waha-send, scheduled-send-worker, sdr-respond e waha-connect.
- Espelho `_shared` regenerado via sync script; docs atualizadas (lista de redeploy stale + regra de normalização para cargas DINTEC futuras).

## Pós-merge (gates separados, cada um com OK do dono)
1. Redeploy: waha-send, scheduled-send-worker, sdr-respond, waha-connect.
2. Backfill assistido de `customers.phone` (dry-run → revisão → aplicar) — conserta a raiz para todos os providers.

Plano completo: `docs/superpowers/plans/2026-07-17-customers-phone-country-code-fix.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: PARAR — aguardar OK do dono**

NÃO mergear. Regra do projeto: merge só com aprovação explícita.

---

### Task 6: Deploy das 4 Edge Functions (GATE: OK explícito do dono ANTES)

**Files:** nenhum (operação de deploy).

- [ ] **Step 1: Confirmar OK do dono para o deploy**

Sem OK, não prosseguir. (Sem migration neste plano — a regra "migration antes do deploy" não se aplica.)

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy waha-send --project-ref njizaasajkdqptlxddqn
npx supabase functions deploy scheduled-send-worker --project-ref njizaasajkdqptlxddqn
npx supabase functions deploy sdr-respond --project-ref njizaasajkdqptlxddqn
npx supabase functions deploy waha-connect --project-ref njizaasajkdqptlxddqn
```

Expected: 4 deploys com sucesso.

- [ ] **Step 3: Verificação imediata pós-deploy**

Enviar (ou pedir ao dono/vendedor que envie) UMA mensagem nova na conversa da RODAWE (`23a0803c-c644-4ad6-b4eb-d0f9cf453069`) e verificar:

```sql
select id, status, failure_reason, provider_message_id, created_at
from messages
where conversation_id = '23a0803c-c644-4ad6-b4eb-d0f9cf453069' and direction = 'out'
order by created_at desc limit 3;
```

Expected: a mensagem nova com `status = 'sent'` (depois `delivered`) e `provider_message_id` preenchido — mesmo ANTES do backfill, pois o engine agora prefixa o 55 em runtime.

---

### Task 7: Backfill — dry-run (SELECT only) + documento de revisão

**Files:**
- Create: `docs/db/2026-07-17-phone-ddi-backfill-dryrun.md` (relatório para revisão do dono)

**Interfaces:**
- Consumes: MCP `mcp__supabase__execute_sql` (somente SELECT nesta task).
- Produces: relatório com Lote A (aplicáveis), Lote B (20 colisões), Lote C (anomalias) — insumo do OK do dono na Task 8.

- [ ] **Step 1: Lote A — candidatos ao UPDATE (a lista completa vai no relatório)**

```sql
select c.id, c.store_id, c.phone, '+55' || c.phone_digits as new_phone,
       coalesce(c.nome_fantasia, c.full_name) as name,
       (c.dintec_codcli is not null) as dintec
from customers c
where length(c.phone_digits) in (10, 11)
  and c.phone not like '+%'
  and c.phone_digits not like '0%'
  and substring(c.phone_digits, 1, 2) in (
    '11','12','13','14','15','16','17','18','19','21','22','24','27','28',
    '31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49',
    '51','53','54','55','61','62','63','64','65','66','67','68','69',
    '71','73','74','75','77','79','81','82','83','84','85','86','87','88','89',
    '91','92','93','94','95','96','97','98','99')
  and not exists (
    select 1 from customers b
    where b.store_id = c.store_id and b.id <> c.id
      and b.phone_digits = '55' || c.phone_digits)
order by dintec desc, name;
```

Expected: ~1.406 linhas (1.430 curtos − 20 colisões − 4 prefixos não-BR; conferir a contagem exata no resultado). Registrar o total e segmentar por `dintec` no relatório (o dono decide separadamente sobre as ~19 linhas não-DINTEC).

- [ ] **Step 2: Lote B — as 20 colisões diretas (tratamento caso a caso, NÃO entram no UPDATE)**

```sql
select a.id as short_id, a.phone as short_phone, coalesce(a.nome_fantasia, a.full_name) as short_name,
       b.id as long_id, b.phone as long_phone, coalesce(b.nome_fantasia, b.full_name) as long_name,
       (select count(*) from conversations cv where cv.customer_id = a.id) as short_convs,
       (select count(*) from conversations cv where cv.customer_id = b.id) as long_convs
from customers a
join customers b on b.store_id = a.store_id and b.id <> a.id
  and b.phone_digits = '55' || a.phone_digits
where length(a.phone_digits) in (10, 11);
```

Expected: 20 pares (já confirmados no dry-run preliminar — ex.: NILLO JOSE BELLENZIER × COMERCIO DE COMBUSTIVEL SEBERI). No relatório, recomendar por par: merge (repontar conversas e apagar o curto) ou skip — decisão do dono.

- [ ] **Step 3: Lote C — anomalias (ficam de fora, listadas para transparência)**

```sql
-- prefixo não-BR sem '+' (4 esperados: 57996445339, 59996557765, 59598352065, 5996902510)
select id, phone, coalesce(nome_fantasia, full_name) as name from customers
where length(phone_digits) in (10, 11) and phone not like '+%'
  and substring(phone_digits, 1, 2) not in (
    '11','12','13','14','15','16','17','18','19','21','22','24','27','28',
    '31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49',
    '51','53','54','55','61','62','63','64','65','66','67','68','69',
    '71','73','74','75','77','79','81','82','83','84','85','86','87','88','89',
    '91','92','93','94','95','96','97','98','99');
-- lixo fora de faixa
select id, phone from customers where phone_digits <> '' and length(phone_digits) not between 8 and 14;
-- duplicatas internas entre os curtos (36 grupos/84 clientes esperados — só nota, o UPDATE não falha, não há unique)
select phone_digits, count(*) from customers
where length(phone_digits) in (10, 11) group by 1 having count(*) > 1 order by 2 desc;
-- leads com o mesmo defeito (coluna phone_digits idêntica em public.leads)
select length(phone_digits) as len, count(*) from leads
where phone_digits is not null and phone_digits <> '' group by 1 order by 1;
```

Expected: registrar tudo no relatório. Se `leads` tiver linhas de 10–11 dígitos, incluir um Lote D espelhado (mesmo critério) para decisão do dono.

- [ ] **Step 4: Escrever `docs/db/2026-07-17-phone-ddi-backfill-dryrun.md`**

Conteúdo: contagens por lote, amostra de 20 linhas do Lote A, os 20 pares do Lote B com recomendação, Lote C na íntegra, o SQL exato do UPDATE da Task 8, e a nota: "9º dígito NÃO é inserido — os ~470 números de 10 dígitos podem ainda ser celulares sem o 9 e não entregar; follow-up opcional via check-exists do WAHA".

- [ ] **Step 5: Commit + PARAR para revisão do dono**

```bash
git add docs/db/2026-07-17-phone-ddi-backfill-dryrun.md
git commit -m "docs(db): dry-run report for customers.phone BR DDI backfill"
```

NÃO executar a Task 8 sem o OK explícito do dono sobre este relatório.

---

### Task 8: Backfill — aplicar (GATE: OK do dono sobre o dry-run) + auditoria

**Files:** nenhum no repo (escrita em prod via MCP); checkpoint em `docs/checkpoints/`.

**Interfaces:**
- Consumes: relatório aprovado da Task 7; MCP `execute_sql` (service_role).
- Produces: `customers.phone` corrigido (`phone_digits` é generated column — se auto-atualiza junto com o índice trgm).

- [ ] **Step 1: Confirmar o OK do dono** (sem OK, não prosseguir)

- [ ] **Step 2: UPDATE (mesmo predicado do Lote A, verbatim)**

```sql
update customers c
set phone = '+55' || c.phone_digits
where length(c.phone_digits) in (10, 11)
  and c.phone not like '+%'
  and c.phone_digits not like '0%'
  and substring(c.phone_digits, 1, 2) in (
    '11','12','13','14','15','16','17','18','19','21','22','24','27','28',
    '31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49',
    '51','53','54','55','61','62','63','64','65','66','67','68','69',
    '71','73','74','75','77','79','81','82','83','84','85','86','87','88','89',
    '91','92','93','94','95','96','97','98','99')
  and not exists (
    select 1 from customers b
    where b.store_id = c.store_id and b.id <> c.id
      and b.phone_digits = '55' || c.phone_digits);
```

Expected: rowcount = total do Lote A aprovado. (No RHS/WHERE, `phone_digits` lê o valor ANTIGO da linha — semântica padrão do Postgres; o generated recomputa após o SET.)

- [ ] **Step 3: Verificação imediata**

```sql
-- os 2 casos-sentinela
select id, phone from customers where id in ('1a11db4d-8705-406e-ab5f-144ab0a550d4', '0e179d08-0000-0000-0000-000000000000'::uuid) or id::text like '0e179d08%';
-- deve sobrar apenas Lote B (20) + Lote C nas faixas curtas
select length(phone_digits) as len, count(*) from customers
where length(phone_digits) in (10, 11) and phone not like '+%' group by 1;
```

Expected: RODAWE = `+5549988184540`; GILBERTO FISCHER = `+5553999511127`; contagem residual ≈ 20 colisões + 4 anomalias.

- [ ] **Step 4: Trilha de auditoria (precedente do `whatsapp_lid_backfill`: audita só na aplicação)**

Primeiro conferir colunas: `select column_name from information_schema.columns where table_name = 'audit_logs';` — então inserir 1 linha por padrão da casa (ajustar às colunas reais):

```sql
insert into audit_logs (store_id, actor_id, action, resource, resource_id, after)
select p.store_id, p.seller_id, 'customers_phone_ddi_backfill', 'customer', null,
       jsonb_build_object('updated', <ROWCOUNT_DO_STEP_2>, 'criteria',
         'len 10-11, sem +, DDD BR valido, sem zero-tronco, sem colisao', 'plan',
         'docs/superpowers/plans/2026-07-17-customers-phone-country-code-fix.md')
from profiles p join auth.users u on u.id = p.auth_user_id
where u.email = 'edmilson@ailainteligente.com';
```

- [ ] **Step 5: Checkpoint commitado**

Criar `docs/checkpoints/2026-07-17-phone-ddi-backfill.md` com: contagens antes/depois, rowcount aplicado, os 20 pares do Lote B com a decisão tomada em cada um, pendências (Lote C, 9º dígito). Commitar:

```bash
git add docs/checkpoints/2026-07-17-phone-ddi-backfill.md
git commit -m "docs(checkpoints): customers.phone BR DDI backfill applied"
git push
```

---

### Task 9: Smoke final + expectativas

**Files:** nenhum.

- [ ] **Step 1: Smoke funcional (dono/vendedor testa a UI — não abrir browser)**

Pedir ao dono/vendedor: enviar mensagem nova na conversa RODAWE e, se possível, na GILBERTO FISCHER. Verificar via SQL que as novas saem `sent`/`delivered`.

- [ ] **Step 2: Registrar expectativas explícitas para o dono**

- As **5 mensagens `failed` históricas da RODAWE permanecem `failed` para sempre** — o ramo WAHA não tem retry tracking (`useMessageSend.ts:169-173`, "no retry tracking there yet"); o botão "Tentar novamente" dispara um envio NOVO sem vínculo. Não é regressão.
- Dos ~470 números de 10 dígitos, os que forem celulares sem o 9º dígito podem ainda não entregar (agora discam um número BR válido, só que sem o 9). O 9 nunca é inserido às cegas — follow-up opcional na seção abaixo.

- [ ] **Step 3: Encerramento**

Resumo final para o usuário: entrega, desvios, validação, gates cumpridos (padrão de encerramento do projeto).

---

## Fora de escopo / Follow-ups (registrados, NÃO fazer neste plano)

1. **9º dígito dos ~470 números de 10 dígitos** — passe opcional via `checkWahaNumberExists` (adotar a variante com 9 só quando o WhatsApp confirmar, como `checkWhatsAppNumber.ts:78-89` faz no frontend). Nunca às cegas.
2. **20 pares de colisão (Lote B)** — merge/skip caso a caso com o dono (repontar `conversations.customer_id` exige cuidado; fora do UPDATE em massa).
3. **`whatsapp-avatar-sync`** — monta `<wire>@c.us` inline (não via `toChatId`) e **carimba `avatar_synced_at` mesmo consultando o contato errado**; após o backfill, os avatares desses clientes só voltam se `avatar_synced_at` for resetado para os ids atualizados (cosmético; decidir com o dono).
4. **Pipeline não-WAHA (`send/core.ts`)** — `assertE164` aceita `+49...` e discaria o país errado; NÃO tocar (árvore congelada) — o backfill conserta o dado na fonte, que é o que esses engines leem.
5. **Scripts de import DINTEC** (branch não mergeada, PRs #263/#266) — aplicar a regra da seção nova de `dintec-providers.md` quando aquela branch for retomada.
6. **`ProfileSettingsPage` / validação de telefone no cadastro da UI** — lacuna pré-existente, fora deste fix.

## Self-review (executado na escrita do plano)

- Cobertura: causa raiz (código + dado) ✔; 4 consumidores Edge ✔; falso-positivo internacional protegido (`+` confiado + whitelist DDD) ✔; DDD 55 regional protegido (regra por comprimento) ✔; zero-tronco fail-open ✔; colisões excluídas do UPDATE ✔; leads verificados no dry-run ✔; auditoria + checkpoint ✔; docs de prevenção ✔; smoke reformulado (sem "retry", que não existe no ramo WAHA) ✔.
- Sem placeholders: todo step tem código/SQL/comando completo (única exceção intencional: `<ROWCOUNT_DO_STEP_2>` no audit, preenchido com o número real da execução imediatamente anterior).
- Consistência de nomes: `normalizeBrDialDigits` idêntico nas Tasks 1, 2 e docs ✔.
