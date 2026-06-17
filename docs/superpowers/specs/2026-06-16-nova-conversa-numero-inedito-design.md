# Nova conversa com número inédito + validação de WhatsApp — Design

> **Data:** 2026-06-16
> **Status:** Aprovado (brainstorming) — pronto para writing-plans
> **Feature folder:** `src/features/conversations/`
> **Origem:** solicitação do dono — o modal "Nova conversa" só permite iniciar atendimento
> com cliente já cadastrado; falta o caso principal: iniciar conversa com um **número
> inédito** (não está nas conversas nem cadastrado). Requisito adicional: **validar se o
> número está vinculado a uma conta de WhatsApp** antes de criar.

---

## 1. Problema

O modal `NewConversationDialog` ([src/features/conversations/components/NewConversationDialog.tsx](../../../src/features/conversations/components/NewConversationDialog.tsx))
hoje:

1. Busca **apenas clientes já cadastrados** (`customersProvider.list({ search })`).
2. Quando nada casa, exibe um beco sem saída: *"Nenhum cliente encontrado. Cadastre o
   contato em Clientes para iniciar a conversa."*
3. `createOutbound` exige `customerId` obrigatório
   ([contracts/conversations.ts:64](../../../src/providers/data/contracts/conversations.ts)),
   então sem cliente não há fluxo possível.

Falta o fluxo natural do WhatsApp: **digitar um número novo e disparar**, criando o
contato na hora.

## 2. Objetivo e não-objetivos

**Objetivo.** Permitir iniciar uma conversa de saída para um número que não está
cadastrado, criando um contato mínimo no ato, **validando antes se o número tem conta de
WhatsApp** (quando a origem é Evolution).

**Não-objetivos (YAGNI).**

- Não criar tela nova nem mexer em RLS (a policy `conversations_insert` já permite o
  vendedor criar conversa própria na sua loja).
- Não enviar a primeira mensagem automaticamente — abre no composer (respeita anti-ban
  Evolution e janela 24h / template HSM no Meta).
- Não pedir CPF/endereço — cadastro mínimo, completável na ficha depois.
- Não fazer varredura/validação em lote de números (risco de ban na Evolution).
- Não construir UI nova para `whatsapp_status` — reusa badge/gate/override do PRD-118.

## 3. Decisões (todas confirmadas pelo dono)

| # | Tema | Decisão |
|---|------|---------|
| D1 | Tratamento do contato inédito | **Você escolhe na hora**: mini-form com **Nome opcional** + telefone. Com nome → contato nomeado; sem nome → contato com o número como nome. |
| D2 | Acionamento da UX | **Automático ao digitar o número**: quando a busca não acha cliente e o texto parece telefone (≥10 dígitos), aparece o card "número novo". |
| D3 | Nome em branco | `fullName` recebe o **próprio número** (espelha `createPendingCustomer` do webhook; o `applyInboundContactName` cura depois com o `pushName`). |
| D4 | Dedupe de cliente | **Sim** — antes de criar, busca cliente existente por telefone (tolerante a presença/ausência do `55`) e **reusa**. |
| D5 | Dedupe de conversa | **Sim** — se o cliente já tem conversa aberta naquela instância, **abre a existente** (espelha `findOpenConversation`). |
| D6 | Número sem WhatsApp | **Bloquear, mas permitir forçar**: mensagem clara + botão secundário "Iniciar mesmo assim". |
| D7 | 9º dígito | **Usar o número canônico que o WhatsApp confirma** (`jid` da resposta Evolution), em vez de adivinhar. |

## 4. Achados da investigação técnica (workflow `wf_ab1d1b6d-40c`)

- **Não existe nenhuma checagem de número** hoje, nem na camada `src/providers/whatsapp/`
  nem nas Edge Functions. A interface `IWhatsAppProvider` é estritamente de mensageria
  (9 métodos: send/receive/media/health).
- **Validade de número é reativa (PRD-118):** `customers.whatsapp_status`
  (`unknown|valid|invalid|blocked`, default `unknown`) só vira `invalid` após o Meta
  devolver `131026` num envio.
  ([migration 20260610164815](../../../supabase/migrations/20260610164815_whatsapp_118_status_tracking.sql))
- **Evolution pré-valida de verdade:** `POST /chat/whatsappNumbers/{instance}`
  (header `apikey`, body `{ numbers: ["55DDD..."] }`) retorna um array de
  `OnWhatsAppDto { jid, exists, number, name?, lid? }`.
  - `exists` = tem conta de WhatsApp.
  - **`jid` traz o número normalizado pelo WhatsApp** (corrige/confirma o 9º dígito).
    A verdade canônica está no `jid`, não no input.
  - Ressalvas: a normalização BR pode, raramente, dar **falso-positivo de 9º dígito**
    (Evolution issue #2062); JIDs `@lid` podem retornar `exists:false` espúrio; **lote
    em massa tem risco de ban** (issue #2228) → checar **sob demanda**.
- **Meta Cloud API não tem pré-checagem:** o `/contacts` era da API On-Premises,
  **descontinuada (sunset 23/10/2025)**. Na Cloud API só se descobre reativamente, pelo
  `131026` (que nem é sinal limpo — "undeliverable" por vários motivos). **Produção roda
  Evolution**, então o caminho real é coberto.
- **Padrão server-side maduro para clonar:** `whatsapp-avatar-sync` já faz POST
  autenticado → `requireCaller`/`resolveSender` → lê a conta Evolution → resolve secret
  Vault-first (`createSecretResolver`, `${credentials_ref}_API_KEY`) → chama
  `/chat/...` via `evolutionRequest` (header `apikey`). A credencial **nunca** passa pelo
  browser.
- **Invocação client→edge:** `getSupabaseClient().functions.invoke('<fn>', { body })`
  anexa o JWT da sessão automaticamente; erros vêm em `error.context.json()` como
  `{ error, code }`.
- **🐛 Bug pré-existente que a feature precisa resolver:** o `IListCustomersParams`
  declara `search` ([contracts/customers.ts:26](../../../src/providers/data/contracts/customers.ts)),
  e o **mock implementa** (nome/email/telefone/documento, `mocks/api/customers.ts:189`),
  mas o **`supabaseCustomersProvider.list` ignora `search`** (sem `ilike`/`or`). Em
  produção a busca de cliente do modal **nunca filtra** — devolve os primeiros N da loja.
  Isso quebra a detecção do card "número novo" (que depende de **resultado vazio** quando
  nada casa) e o dedupe por telefone. **Corrigir o `search` no provider Supabase é
  pré-requisito**, e de quebra conserta a busca de clientes em toda tela que usa
  `list({ search })`.

## 5. Arquitetura

```
NewConversationDialog (UI)
  └─ digita número → card "número novo" → mini-form (nome opcional)
       └─ ao confirmar:
            1. normaliza telefone        → engine puro phoneBR.ts
            2. (Evolution + conectada?)  → useCheckWhatsAppNumber()
                                            └─ invoke('whatsapp-check-number', { accountId, phone })
                                                 └─ EDGE: resolve conta+apikey (Vault)
                                                      └─ checkWhatsAppNumbers() → Evolution /chat/whatsappNumbers
            3. resolve telefone canônico (jid quando exists=true)
            4. dedupe cliente (por telefone) → reusa ou cria B2C mínimo
            5. dedupe conversa aberta        → abre existente ou createOutbound
            6. abre a conversa no composer
```

### 5.0 Pré-requisito: `search` no `customers.list` (Supabase)

`src/providers/data/impl/supabase/customers.ts` — adicionar tratamento de
`params.search` (hoje ausente), em paridade com o mock (`mocks/api/customers.ts:189`):
quando presente, filtrar por `OR` de `ilike` sobre `full_name`, `razao_social`,
`nome_fantasia`, `contact_name`, `email`, `phone`, `cnpj`, `cpf` (notes ficam de fora —
tabela separada). Aditivo: sem `search`, o comportamento atual é preservado. Habilita
(a) a busca real do modal, (b) a detecção do card "número novo" (resultado vazio confiável)
e (c) o dedupe por telefone.

### 5.1 Engine puro de telefone — `src/features/conversations/engine/phoneBR.ts`

Runtime-agnostic, testado com Vitest (TDD). Responsável por transformar o input livre do
vendedor no formato canônico do projeto.

- `normalizeBrPhone(input: string): { ok: true; digits: string } | { ok: false; reason }`
  - `onlyDigits(input)`.
  - 12–13 dígitos começando com `55` → já tem DDI, usa.
  - 10–11 dígitos (DDD + número) → prefixa `55`.
  - fora disso → `{ ok: false }` (mensagem "informe DDD + número").
  - **Não adiciona/remove o 9º dígito** — quem faz isso é o WhatsApp (jid). O engine só
    garante DDI e formato.
  - Saída: dígitos `55DDDNNNNNNNN` (12 ou 13), idêntico ao formato gravado pelo
    `createPendingCustomer` do webhook → casa o match exato na recepção e o envio correto
    (`+55…`).
- `samePhone(a, b): boolean` — compara dois telefones **ignorando a presença/ausência do
  `55`** (compara DDD+número), para o dedupe encontrar clientes antigos salvos pelo
  `NewCustomerModal` sem DDI.
- `formatBrPhoneDisplay(digits): string` — exibição amigável `(55) 54 99999-8888`.

### 5.2 Checagem Evolution — `src/providers/whatsapp/evolution/instance.ts`

Função **standalone Evolution-specific** (mesmo precedente de `findContacts` /
`fetchProfilePictureUrl`), **fora** de `IWhatsAppProvider` (Meta não tem equivalente):

```ts
// runtime-agnostic: só Web APIs + imports relativos
export async function checkWhatsAppNumbers(
  apiKey: string,
  deps: IEngineDeps,
  target: { baseUrl: string; instanceName: string },
  numbers: string[],     // E.164 sem '+', via toWireNumber
  traceId?: string,
): Promise<Array<{ input: string; exists: boolean; jid: string | null; number: string | null }>>
```

- Chama `POST /chat/whatsappNumbers/{instance}` via `evolutionRequest`.
- **Parser defensivo** (shapes Evolution v1/v2 variam): aceita `{ jid, exists, number }`
  e tolera ausências; `exists` ausente → tratar como `false`.
- Espelhar com `bun run scripts/sync-whatsapp-shared.ts` → `_shared/whatsapp/...`.

### 5.3 Nova Edge Function — `supabase/functions/whatsapp-check-number/`

Clone do esqueleto de `whatsapp-avatar-sync`:

- **Entrada (POST, autenticada):** `{ accountId: ID, phone: string }`.
- **Autorização:** `resolveSender` (qualquer usuário perfilado — iniciar conversa é ação
  de vendedor; **não** restringir a staff). Delegar checagem de loja: o `accountId` tem de
  pertencer à `store_id` do caller (owner é cross-store).
- **Provider:** exige `provider === 'evolution'`. Conta Meta → responde
  `{ code: 'UNSUPPORTED_PROVIDER' }` (o client trata como "pular checagem", não erro).
- **Instância desconectada** (`status !== 'connected'`) → `{ code: 'INSTANCE_OFFLINE' }`
  (client degrada: segue sem checar).
- Resolve apikey Vault-first (`createSecretResolver`, `${credentials_ref}_API_KEY`),
  normaliza com `assertE164`/`toWireNumber`, chama `checkWhatsAppNumbers`.
- **Saída:** `{ exists: boolean, canonicalPhone: string | null }` onde `canonicalPhone`
  são os dígitos extraídos do `jid` (`55..@s.whatsapp.net` → `55..`) quando `exists=true`.
- Após implementar/alterar a camada: **rodar o sync e redeployar** (regra do projeto).

### 5.4 Hook client — `src/features/conversations/hooks/useCheckWhatsAppNumber.ts`

- `checkNumber(accountId, phone): Promise<CheckResult>` via
  `getSupabaseClient().functions.invoke('whatsapp-check-number', { body })`.
- Trata `error.context.json()` → ramifica por `code`
  (`UNSUPPORTED_PROVIDER` / `INSTANCE_OFFLINE` / erro genérico) retornando um resultado
  neutro `{ status: 'skipped' }` em vez de explodir a UX.
- Resultados possíveis: `has_whatsapp` (com `canonicalPhone`), `no_whatsapp`, `skipped`.

### 5.5 UX no `NewConversationDialog`

Mantém os 3 blocos atuais (origem → cliente → dica). Muda só o bloco "Cliente":

1. Busca de cliente segue igual.
2. Sem resultado **e** texto parece telefone (≥10 dígitos) → **card de ação**:
   `➕ Falar com (55) 54 99999-8888 — número novo`.
3. Clique no card → **mini-form inline**: campo **Nome (opcional)** + telefone editável
   (pré-preenchido).
4. Botão **Iniciar conversa** dispara o fluxo da §6. Estados visuais:
   - "Verificando se o número tem WhatsApp…" (durante o check).
   - `no_whatsapp` → alerta + botão secundário **"Iniciar mesmo assim"** (D6).
   - `skipped` (Meta/offline/erro) → segue silencioso (a dica provider-aware já avisa
     sobre template/anti-ban).
5. Texto não-numérico sem resultado → mantém o aviso atual de cadastrar em Clientes.

## 6. Fluxo de criação (orquestração no handler do modal)

```
phone = normalizeBrPhone(input)            // inválido → erro inline, para aqui
check  = (origem Evolution && conectada)    // senão → skipped
          ? checkNumber(accountId, phone)
          : skipped
se check.no_whatsapp e NÃO forçado:
    bloqueia + oferece "Iniciar mesmo assim" (re-roda forçando)   // para aqui
phoneFinal = check.has_whatsapp ? check.canonicalPhone : phone     // jid é canônico (D7)
customer = dedupe por samePhone(phoneFinal) → existente ?? cria B2C mínimo
           // status WhatsApp: exists=true → 'valid'
           //                  exists=false forçado / skipped → deixa 'unknown'  (ver §7)
conv = conversa aberta desse customer nessa instância
        ? abre a existente
        : createOutbound({ storeId, whatsappAccountId, assignedSellerId: self, customerId })
abre conv no composer
```

`createOutbound` **não muda** — continua exigindo `customerId`, que agora sempre existe.

### 6.1 Contato B2C mínimo (espelha `createPendingCustomer`)

Via `customersProvider.create` (contrato já existente, sem mudança):

```
type: 'B2C', cpf: '', fullName: nome.trim() || phoneFinal,
phone: phoneFinal, sellerId: <self>, storeId: <atual>,
status: 'ativo', tags: []
```

## 7. Integração com o gate `whatsapp_status` (sutileza crítica)

- `exists: true` → grava `whatsapp_status: 'valid'` no contato (via
  `customersProvider.update`, gancho ESLint-safe já usado na revalidação do
  `ConversationHeader`).
- `exists: false` **com força** (D6) **ou** `skipped` → **deixa `unknown`**. Marcar
  `invalid` aqui **trancaria o composer** logo em seguida (o gate de envio do PRD-118
  lança `CUSTOMER_INVALID_WHATSAPP` 422 para `invalid` sem override). O vendedor forçou
  conscientemente; o fluxo reativo (`131026`) marca `invalid` se o envio realmente falhar.
- Respeita RF-052 do PRD-118: automação **nunca** rebaixa um `valid` manual.

## 8. Mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| `src/providers/data/impl/supabase/customers.ts` | **+** tratamento de `params.search` (pré-requisito §5.0) |
| `src/features/conversations/engine/phoneBR.ts` (+ `.test.ts`) | **novo** — normalização/comparação/exibição BR |
| `src/providers/whatsapp/evolution/instance.ts` | **+** `checkWhatsAppNumbers` |
| `supabase/functions/_shared/whatsapp/evolution/instance.ts` | espelho (via sync) |
| `supabase/functions/whatsapp-check-number/index.ts` | **nova** Edge Function |
| `src/features/conversations/hooks/useCheckWhatsAppNumber.ts` | **novo** — invocação client |
| `src/features/conversations/components/NewConversationDialog.tsx` | card "número novo" + mini-form + estados de checagem + bloqueio com override + orquestração |
| Reuso sem alteração | `customersProvider.create`/`update`, `conversationsProvider.createOutbound`/`list` |

## 9. Testes

- **`phoneBR.test.ts`** (TDD): com/sem `55`; 10 vs 11 dígitos; lixo; `samePhone`
  tolerante a DDI; display.
- **Decisão de dedupe** (unitário do helper puro que decide reusar vs criar).
- **Parser de `checkWhatsAppNumbers`** (unitário): shapes v1/v2, `exists` ausente,
  `jid` ausente, `@lid`.
- Build (`bun run build`) + `bun run test` verdes (gate prático de CI).

## 10. Riscos e validações empíricas pendentes (resolver na implementação)

- Confirmar o **shape real** da resposta `/chat/whatsappNumbers` no build Evolution em
  produção (parser defensivo já mitiga).
- **Falso-positivo de 9º dígito** (#2062) e **`@lid` com `exists:false`** — o botão
  "Iniciar mesmo assim" (D6) é a válvula de escape para esses casos.
- Confirmar que `whatsapp-check-number` deve aceitar **vendedores** (não só staff) —
  alinhado ao modo SINGLE do `whatsapp-avatar-sync`.
- Não persistir resultado além de `whatsapp_status` (sem cache novo) no MVP — checagem é
  sob demanda, 1 número.

## 11. Fora de escopo / futuro

- Validação proativa em lote da base de clientes (rotina de saneamento populando
  `whatsapp_status`) — explicitamente evitada (risco de ban).
- Pré-checagem para contas Meta — inviável na Cloud API; permanece reativo (`131026`).
- Uso do valor `blocked` de `whatsapp_status` (hoje não utilizado).
