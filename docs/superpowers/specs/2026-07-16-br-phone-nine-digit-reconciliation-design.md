# Design — Reconciliar número BR com/sem o 9º dígito

- **Data:** 2026-07-16
- **Codinome sugerido:** _(definir no version bump)_
- **Status:** Aprovado (brainstorming) — aguardando plano de implementação
- **Escopo:** `src/features/conversations/engine/phoneBR.ts` · fluxo "Nova conversa" (`NewConversationDialog`) · `src/providers/whatsapp/` (novo módulo `phoneBr.ts`, mirror `_shared/whatsapp/phoneBr.ts`) · `whatsapp-webhook/index.ts` · `waha-webhook/index.ts`

---

## 1. Contexto e problema

Smoke test do PR #300 (checagem de número + confirmação de entrega/leitura no WAHA) expôs um problema pré-existente, não coberto por aquele PR: um cliente ("Edmilson Souza", conta "Vendas — WAHA") tinha o telefone salvo como `+555481572275` (12 dígitos — faltando o "9" do celular) em vez de `+5554981572275` (13 dígitos, forma canônica). A mensagem de teste foi enviada para o número errado e nunca chegou — sem nenhum erro visível pro vendedor.

Investigação (`docs/checkpoints/`) mapeou a causa: `normalizeBrPhone`/`samePhone` (`phoneBR.ts`) só validam a **contagem** de dígitos (12 ou 13 são ambos aceitos) — nunca reconciliam a ambiguidade do 9º dígito nem tratam as duas formas como o mesmo número. O único lugar que sabe a verdade é a própria rede WhatsApp (JID confirmado no webhook) — isso já funciona certo para mensagens **recebidas** (`jidToE164`/`pnToE164`). O buraco fica no fluxo de **conversa nova**: se a checagem de número (`whatsapp-check-number`) for pulada (erro, timeout, ou conta Meta — que não tem checagem) ou o vendedor confirmar "Iniciar mesmo assim" após um "sem WhatsApp", o número digitado é salvo cru, sem chance de autocorreção.

Efeito colateral: se esse cliente malformado (12 dígitos) depois mandar mensagem de verdade pelo WhatsApp real (JID de 13 dígitos), `findCustomerByPhone` (comparação exata de dígitos, em `whatsapp-webhook/index.ts` e `waha-webhook/index.ts`) não bate — cria cliente duplicado em vez de reconciliar com o existente.

## 2. Objetivo

1. Números BR com e sem o 9º dígito que representam a mesma pessoa deixam de ser tratados como diferentes na deduplicação de clientes (fluxo de Nova conversa e nos dois webhooks).
2. No fluxo "Nova conversa", quando a checagem inicial de número disser "sem WhatsApp" (ou pular por erro) para um número de 12 dígitos, o app tenta automaticamente a variante de 13 dígitos (com o "9" inserido) antes de bloquear ou deixar o vendedor prosseguir — só usa essa variante se o próprio WhatsApp confirmar (nunca insere o 9 às cegas).

### Não-objetivos (YAGNI)

- **Sem correção retroativa** de números já salvos incorretamente (ex.: o contato "Edmilson Souza") — fica como limpeza manual separada, fora deste escopo.
- **Sem checagem para contas Meta** — Meta não tem endpoint de pré-checagem; comportamento atual (sem checagem) é mantido, como já era antes deste design.
- **Sem a direção inversa** (nunca remove um "9" de um número de 13 dígitos digitado) — é a direção arriscada (perderia um dígito real de fato digitado pelo usuário) e não é o padrão do bug reportado.
- **Sem trocar por lib externa de telefone** (libphonenumber etc.) — não resolveria a ambiguidade de fato (ninguém, nem uma lib, sabe se um número de 12 dígitos é fixo ou celular sem o 9 sem perguntar pro WhatsApp) e seria refactor grande e desnecessário.

### Critérios de sucesso

1. `samePhone("555481572275", "5554981572275")` → `true` (mesma pessoa, uma forma com 12 e outra com 13 dígitos).
2. Iniciar conversa nova com um número de 12 dígitos que, na verdade, tem WhatsApp na forma de 13 dígitos: o app detecta e usa a forma correta automaticamente, sem bloquear nem exigir override manual.
3. Um cliente já cadastrado com telefone de 12 dígitos (forma errada) que manda mensagem real pelo WhatsApp (JID de 13 dígitos) é reconhecido como o mesmo cliente — não cria duplicata.
4. Nenhuma mudança no comportamento de contas Meta, nem na direção 13→12.

## 3. `phoneBR.ts` (frontend) — reconciliação de dedup + candidato com o 9

Novo helper puro:

```ts
/** Se `digits` é um BR de 12 dígitos (55+DDD+8, sem o 9 explícito), retorna a
 *  variante de 13 dígitos com "9" inserido logo após o DDD. Caso contrário
 *  (já tem 13 dígitos, ou não tem o formato 55+12/13), retorna null. Nunca
 *  remove um dígito — só insere, e só na direção 12→13. */
export function buildNineDigitCandidate(digits: string): string | null {
  const d = digitsOf(digits);
  if (!d.startsWith("55") || d.length !== 12) return null;
  const ddi = d.slice(0, 2);
  const ddd = d.slice(2, 4);
  const local8 = d.slice(4);
  return `${ddi}${ddd}9${local8}`;
}
```

`samePhone` passa a tratar como iguais dois números cujos `localPart` diferem só pela inserção do "9" (10 dígitos `DDD+local8` vs. 11 dígitos `DDD+9+local8`):

```ts
export function samePhone(a: string, b: string): boolean {
  const la = localPart(a);
  const lb = localPart(b);
  if (la.length === 0) return false;
  if (la === lb) return true;
  const [shortLocal, longLocal] = la.length < lb.length ? [la, lb] : [lb, la];
  if (shortLocal.length !== 10 || longLocal.length !== 11) return false;
  return longLocal[2] === "9" && shortLocal === longLocal.slice(0, 2) + longLocal.slice(3);
}
```

Comparação simétrica (não importa qual dos dois argumentos é o de 12 ou 13 dígitos).

## 4. Fluxo "Nova conversa" — reconsulta automática com o 9

Em `NewConversationDialog` (`startNewNumber`), depois que `checkWhatsAppNumber` retorna:

- `no_whatsapp` **e** o número normalizado tem 12 dígitos (`buildNineDigitCandidate` retorna não-nulo) → chama `checkWhatsAppNumber` de novo com a variante de 13 dígitos, uma única vez (sem loop).
  - Se a variante confirmar `has_whatsapp` → usa o `canonicalPhone` dessa resposta silenciosamente (mesmo caminho que já existe hoje quando o número original confirma na 1ª tentativa) e mostra um aviso curto: "Número ajustado — o WhatsApp confirmou o número com o 9º dígito."
  - Se a variante também não tiver WhatsApp (ou erro) → segue o comportamento atual (bloqueio + "Iniciar mesmo assim").
- Checagem pulada por erro (`status: "skipped"`) com 12 dígitos → mesma reconsulta automática antes de decidir. Se a checagem original já é `skipped` por a conta ser Meta, a reconsulta também será `skipped` (Meta não tem endpoint) — sem mudança de comportamento (não-objetivo).
- Número já com 13 dígitos (ou fora do padrão BR 12/13) → nenhuma mudança, comportamento atual mantido.

Zero mudança de contrato em `checkWhatsAppNumber.ts` — é só uma segunda chamada opcional orquestrada pelo componente, reaproveitando a função existente.

## 5. Dedup nos webhooks (Evolution/Meta + WAHA)

Novo módulo runtime-agnostic `src/providers/whatsapp/phoneBr.ts` (mirror: `supabase/functions/_shared/whatsapp/phoneBr.ts`, gerado por `bun run scripts/sync-whatsapp-shared.ts`) com a mesma lógica de `buildNineDigitCandidate` + uma função `phoneDigitsMatchBr(a, b): boolean` (mesmo algoritmo tolerante de `samePhone`, mas standalone — este módulo não importa de `src/features/**`, que não é mirror-safe).

`findCustomerByPhone` em `supabase/functions/whatsapp-webhook/index.ts:257-269` e o closure homônimo em `supabase/functions/waha-webhook/index.ts:261-269` trocam o predicado final de:

```ts
(candidate) => String(candidate.phone).replace(/\D/g, "") === phoneDigits
```

por:

```ts
(candidate) => phoneDigitsMatchBr(String(candidate.phone).replace(/\D/g, ""), phoneDigits)
```

O pré-filtro SQL (`LIKE %${phoneDigits.slice(-8)}`) já usa só os últimos 8 dígitos — continua válido, pois os últimos 8 dígitos (`local8`) são idênticos nas duas formas (a diferença fica no 9º dígito, que vem *antes* desses 8).

## 6. Testes

- `phoneBR.test.ts`: `buildNineDigitCandidate` (12 dígitos → 13; já 13 → null; menos de 12/13 → null); `samePhone` (par 12x13 iguala; par 12x13 de pessoas diferentes não iguala; casos existentes continuam passando).
- Novo `phoneBr.test.ts` (mirror source): mesmos casos de `buildNineDigitCandidate`/`phoneDigitsMatchBr`, formato standalone.
- `NewConversationDialog` (ou hook equivalente): mock de `checkWhatsAppNumber` retornando `no_whatsapp` na 1ª chamada e `has_whatsapp` na 2ª (variante de 13) → confirma que a 2ª chamada acontece automaticamente, uma única vez, só quando o número original tem 12 dígitos.
- `whatsapp-webhook`/`waha-webhook`: caso de teste (se já existir suíte para essas funções) cobrindo cliente cadastrado com 12 dígitos recebendo mensagem inbound com 13 dígitos → resolve pro cliente existente, não cria duplicata.

## 7. Riscos & mitigações

- **Falso positivo de dedup:** dois clientes DIFERENTES onde um tem fixo de 8 dígitos cujo valor coincide com os últimos 8 dígitos do celular do outro, no mesmo DDD. Risco residual muito baixo (faixas de numeração fixo/móvel normalmente não colidem) e é uma comparação (não uma escrita automática) — pior caso é uma mensagem cair na conversa errada, detectável e corrigível manualmente. Aceito.
- **Reconsulta dobra as chamadas ao endpoint de checagem** quando o número é ambíguo e a 1ª tentativa falha — mesmo padrão fail-open já usado hoje (uma chamada extra, sequencial, nunca bloqueante).
- **Duplicação da lógica de 9º dígito em dois módulos** (`phoneBR.ts` frontend + `phoneBr.ts` mirror) — intencional, mesmo padrão já usado no projeto (regex de dígito hand-rolled em ~15 arquivos); o módulo mirror não pode importar de `src/features/**`.
