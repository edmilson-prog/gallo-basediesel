# Evolution Go — Estado da migração, smoke pendente e plano da Fase 3 (paridade)

> **Versão do app na escrita:** v0.121.0 `Conduit` · **Data:** 2026-06-25
> **Branch de referência:** `main` @ `758ccf0` (PR #173 + release #174 já mergeados)
> **Escopo deste documento:** consolidar o que já foi entregue na migração WhatsApp
> Evolution v2 → Evolution Go, descrever o **smoke e2e pendente** (gate do dono) e
> deixar o **plano detalhado da Fase 3 (paridade)** pronto para execução.
>
> Documentos irmãos: [`evolution-go-edges.md`](./evolution-go-edges.md) (runbook das Edge
> Functions + roteiro de smoke), [`evolution-go-api-contracts.md`](./evolution-go-api-contracts.md)
> (contratos da API Go), `docs/integracoes/evo-go/doc.json` (swagger), specs/planos em
> `docs/superpowers/`.

---

## 1. Sumário executivo

A migração do motor WhatsApp de **Evolution API v2.3.7 (Baileys)** para **Evolution Go
(whatsmeow)** — servidor `https://evogo.ailainteligente.com.br` — está **implementada e em
produção** no caminho crítico (criar/parear/enviar/receber por um número Go). Restam apenas:

1. **Smoke e2e real** — gate do dono; valida em produção e resolve 2 contratos ainda abertos.
2. **Fase 3 (paridade)** — refinamentos cosméticos/de conveniência, **deferidos e não-bloqueantes**.

### Estado das fases

| Fase | Conteúdo | Status |
|---|---|---|
| **0 + 1** | Engine `evolution-go` (camada pura, runtime-agnostic, testável) | ✅ Completa (PR #173) |
| **2** | Edge Functions — `whatsapp-connect` + `whatsapp-webhook` + `whatsapp-send` | ✅ Completa, **deployada em produção** (PR #173) |
| **4** | Failover Meta ↔ Evolution ↔ Go | ✅ **Absorvida na Fase 2** (matriz de failover alargada para Go na Task 5; não é fase pendente) |
| **5** | UI de pareamento (wizard provider-aware + QR) | ✅ Completa, mergeada e lançada em **v0.121.0 `Conduit`** (PR #173 + release #174) |
| **3** | **Paridade** (avatar, número próprio, lifecycle/audit, half-create) | ⏳ **Deferida — este documento é o plano** |

> **Por que a numeração pula 3 → 5:** o **failover** era a "Fase 4" no plano original
> (`docs/superpowers/plans/2026-06-25-evolution-go-engine-phase-1.md`), mas foi incorporado
> à Fase 2 (whatsapp-send já agnóstico + matriz de failover estendida). A Fase 5 (UI) foi
> priorizada porque é o que **destrava o smoke** — sem UI não há como parear um número Go de
> verdade. A Fase 3 ficou por último porque é polimento.

---

## 2. Recap de arquitetura (para contexto zero)

- **Três motores (`provider`):** `meta` (Cloud API), `evolution` (v2/Baileys), `evolution-go`
  (whatsmeow). A coluna é `whatsapp_accounts.provider`.
- **Camada pura + espelho:** a lógica do engine vive em `src/providers/whatsapp/**` (só Web
  APIs + imports relativos, deps injetadas) e é **espelhada** em
  `supabase/functions/_shared/whatsapp/**` por `bun run scripts/sync-whatsapp-shared.ts`.
  ⚠️ **Nunca editar `_shared/` à mão.** Mudou a camada ⇒ rodar o sync **e** commitar os
  arquivos do mirror que realmente mudaram (inclusive os arquivos-raiz, não só subpastas).
- **Modelo de segredo do Go** (confirmado no smoke de contrato de 2026-06-25):
  - `{credentialsRef}_API_KEY` = chave **global** do servidor Go — usada **só** para endpoints
    admin (`/instance/create`, `/instance/all`).
  - `{credentialsRef}_INSTANCE_TOKEN` = **token por instância** — usado como header `apikey` em
    **toda** chamada escopada (status/send/download/connect/qr/logout) **e** como auth do
    webhook (o servidor Go autoriza a instância por esse token; o header `instanceId` é
    ignorado).
  - Cada conta Go tem um `credentialsRef` **único** (senão os nomes `_INSTANCE_TOKEN` colidem).
    A chave global é colada **por número** na UI (write-only no Vault).
- **Resolução de conta:** o webhook resolve a conta Go por `provider_config->>instanceId`
  (`findEvolutionGoAccount`); a UI/Edge persistem `provider_config = { baseUrl, instanceId }`
  (o CHECK `whatsapp_accounts_provider_config_shape` exige ambas as chaves; `instanceId:""`
  satisfaz a checagem de existência enquanto não pareado).
- **Diferenças de contrato vs v2:** auth por token-da-instância (não global); webhook sem HMAC
  (autentica por `instanceToken`); `/send/media` flat por URL; `/message/downloadimage` envolve
  o `Message` whatsmeow completo; eventos em **PascalCase** (`Connection`, `Message`, …).

### Regras transversais (valem para toda a Fase 3)

- **NUNCA mergear sem autorização expressa do dono** — toda integração via PR.
- **NÃO tocar no cache do atendimento** (signing em lote #137, Realtime de mensagens, query
  keys, RPC gated-once). A Fase 3 mexe em conexão/contas, não no thread de mensagens.
- **Segredos vivem no Vault**, nunca no banco nem no código.
- **Deploy de Edge** preferencialmente via CLI Supabase autenticada
  (`npx supabase functions deploy <fn> --project-ref njizaasajkdqptlxddqn`; o
  `whatsapp-webhook` é público → `--no-verify-jwt`).
- **Mudou `src/providers/whatsapp/` ⇒ sync do mirror + redeploy** das edges afetadas.
- **Gate de código:** `bun run build` + `bun run test` (o `build` não faz type-check; rodar
  `bunx tsc --noEmit` e avaliar **por delta** sobre o baseline ~329 erros). TDD nos `engine/`.

---

## 3. Smoke e2e pendente (gate do dono)

A UI e as 3 edges Go estão **no ar**, mas o pareamento real ainda não foi exercitado em
produção. O smoke é o que **valida tudo** e resolve os contratos não-verificáveis por probe
read-only. Roteiro completo em [`evolution-go-edges.md`](./evolution-go-edges.md) (6 smokes +
checklist); resumo aqui:

### Passos
1. **Configurações → WhatsApp → "Adicionar número"** → escolher **Evolution Go** → informar
   `baseUrl` do servidor + a **chave global** → criar.
2. Ler o **QR code** pelo celular → confirmar status **"Conectada"** no banco e na UI.
3. Enviar **texto** (outbound) → conferir badge de status.
4. Receber **inbound** real → conferir que cai na Inbox.
5. Receber/enviar **mídia** (imagem) → conferir renderização.
6. Exercitar o **lifecycle**: test / logout / restart / delete.

### Contratos que o smoke resolve
| # | Contrato em aberto | Onde isola | Se divergir |
|---|---|---|---|
| 1 | Corpo do `POST /message/downloadimage` (mediaKey **base64** vs `[]int`) | `evolution-go/media.ts` (download) | fix pontual no parser de download + sync + redeploy `whatsapp-webhook` |
| 2 | Shape exato do webhook **e onde vem o `instanceToken`** | `evolution-go/parser.ts` + gate em `whatsapp-webhook` | ajustar parser/gate + sync + redeploy |
| 3 | Idempotência do `connectGoInstance` em **re-QR** (sessão já logada → 400 "session already logged in") | `whatsapp-connect` ramo Go | tratar 400 como no-op no re-connect |

> **Importante:** qualquer divergência é **hotfix pontual de Edge Function** (novo PR +
> redeploy), **não** uma fase nova. Cada contrato já está isolado num único ponto.

---

## 4. Plano da Fase 3 — Paridade

A Fase 3 traz o motor Go ao nível do v2 em quatro frentes (A–D) + uma melhoria opcional (E).
Nenhuma bloqueia o uso; todas espelham comportamento que o v2 **já tem**.

### Visão geral e ordem recomendada

| Item | O que entrega | Depende do smoke? | Esforço | Risco |
|---|---|---|---|---|
| **A** | Avatar de contato (foto de perfil) para contatos Go | **Sim** (shape de `/user/avatar`) | Médio | Baixo |
| **B** | Captura do número próprio (`phone_number`) da conta Go | Não (jid vem de `/instance/all`) | Baixo–médio | Baixo |
| **C** | Recuperação de half-create por find-by-name | Não | Baixo | Médio |
| **D** | `Connection` lifecycle no webhook + audit no poll | Parcial (valores de `State`) | Médio | Médio |
| **E** | Realtime de status em `whatsapp_accounts` (opcional, afeta v2 também) | Não | Baixo | Baixo |

**Ordem sugerida:** B → C → D → A → (E opcional). B e C não dependem de nada do smoke e
endurecem o pareamento; D melhora a fidelidade do status; A fica por último porque depende de
confirmar o shape de `/user/avatar` no smoke.

> ⚠️ Todos os itens que mexem em `src/providers/whatsapp/` exigem **sync do mirror + redeploy**.
> Itens A e D tocam `whatsapp-webhook`; A, B, C tocam `whatsapp-connect`/engine.

---

### Item A — Avatar de contato (Evolution Go)

**Objetivo:** quando um inbound Go cria um novo contato, buscar a foto de perfil e persistir,
como o v2 já faz (hoje o contato Go fica com fallback de iniciais).

**Como o v2 faz (paridade-alvo):**
- `fetchProfilePictureUrl` em `src/providers/whatsapp/evolution/instance.ts:374-396` →
  `POST /chat/fetchProfilePictureUrl/{instanceName}` body `{ number }` → retorna **URL**
  (`profilePictureUrl`/`profilePicUrl`).
- Helper central `syncContactAvatar` em `supabase/functions/_shared/avatar.ts:44-104`:
  valida E.164 → fetch URL → download bytes → upload no bucket público `avatars`
  (`<storeId>/<customerId>.jpg`) → grava `customers.avatar_url` com cache-buster `?v=<ts>` →
  carimba `customers.avatar_synced_at` (idempotência). Nunca lança.
- Acionamento: callback `onCustomerAutoCreated` (interface `IProcessArgs` no webhook core) →
  `scheduleAvatarFetch` em `supabase/functions/whatsapp-webhook/index.ts:619-654`, disparado em
  `index.ts:732-733` via `EdgeRuntime.waitUntil()` (fire-and-forget).

**Gap exato:**
- `whatsapp-webhook/index.ts:628`: `if (account.provider !== "evolution") return;` — o Go é
  descartado.
- Engine Go não tem função de avatar (`instance.ts`/`client.ts`/`EvolutionGoProvider.ts` — só
  `goRequest` genérico disponível).

**Dado/endpoint Go disponível:**
- Swagger: `POST /user/avatar`, body `{ number: "<E.164 sem +>", preview: false }`.
- ⚠️ **Shape da resposta NÃO documentado** — pode ser **URL** (como v2) ou **base64** (como
  `/message/downloadimage` no whatsmeow). **A confirmar no smoke** antes de codar o parser.

**Abordagem proposta:**
1. **Confirmar no smoke** o shape de `/user/avatar` (chamar com um número conhecido e inspecionar
   o JSON). Anotar o campo exato (`url`/`image`/`picture`/`data`) e se é URL ou base64.
2. Criar no engine Go a função de fetch (TDD):
   ```ts
   // src/providers/whatsapp/evolution-go/instance.ts
   // Retorna a URL pública OU os bytes da foto, conforme o shape confirmado no smoke.
   export async function fetchGoContactAvatar(
     instanceToken: string,
     deps: IEngineDeps,
     target: IGoInstanceTarget,
     number: string,
     traceId?: string,
   ): Promise<{ url?: string; bytes?: Uint8Array; mimeType?: string } | null>
   ```
3. Tornar `syncContactAvatar` (`_shared/avatar.ts`) capaz de aceitar **bytes já em mãos** (caso
   Go retorne base64) além do fluxo "fetch URL → download". Opções:
   - **Preferida:** generalizar `syncContactAvatar` para receber um "source resolver" que devolve
     `{ url } | { bytes, mimeType }`; v2 passa o resolver de URL, Go passa o de bytes/URL.
   - **Alternativa mais barata:** criar `syncContactAvatarGo` paralelo (duplicação controlada) se
     a generalização ficar invasiva — decidir no momento, preferindo DRY.
4. Em `scheduleAvatarFetch` (`whatsapp-webhook/index.ts`), trocar o gate `!== "evolution"` por um
   `switch (account.provider)` com ramo `evolution-go`: resolver `baseUrl` + `instanceId` de
   `providerConfig`, resolver `_INSTANCE_TOKEN` do Vault, chamar `fetchGoContactAvatar` e delegar
   a `syncContactAvatar`.

**Arquivos a tocar:** `src/providers/whatsapp/evolution-go/instance.ts` (+ `.test.ts`),
`supabase/functions/_shared/avatar.ts`, `supabase/functions/whatsapp-webhook/index.ts`;
mirror sync; redeploy `whatsapp-webhook`.

**Critério de "feito":** novo contato criado por inbound Go aparece com foto no avatar (quando o
número tem foto pública); `avatar_synced_at` carimbado; sem regressão no v2; `integration_logs`
sem erro inesperado. Teste de unidade do parser de `/user/avatar` cobrindo "com foto" e "sem foto"
(null).

**Riscos:** shape da resposta incerto até o smoke; foto privada → null (degradação honesta para
iniciais, igual v2).

---

### Item B — Captura do número próprio (`phone_number`) da conta Go

**Objetivo:** popular `whatsapp_accounts.phone_number` ao parear um número Go (hoje fica vazio),
para a UI exibir o telefone na Origem/Configurações como faz o v2.

**Como o v2 faz (paridade-alvo):**
- `markConnected` (`whatsapp-connect/index.ts:104-143`) chama `fetchInstanceProfile`
  (`_shared/whatsapp/evolution/instance.ts:118-145`, `GET /instance/fetchInstances?instanceName=`),
  extrai o número via `jidToPhone(ownerJid|owner)` e grava `phone_number` (+ `profileName` em
  `provider_config`). Roda na transição not-connected→connected.
- Self-heal `backfillMissingProfile` (`whatsapp-connect/index.ts:156-181`): só v2, dispara no poll
  (actions `test`/`state`) **enquanto `!phone_number`** — cobre o lag de 1–2 s da Evolution.

**Gap exato:**
- Ramo Go (`whatsapp-connect/index.ts:475-686`): actions `qr` (500-599) e `state`/`test`
  (601-632) gravam **só** `{ status: "connected" }`. Comentário em `:479` — "Profile/phone capture
  is deferred to Phase 3 (status sync only here)".
- Engine Go não tem `fetchGoInstanceProfile`/`getGoInstanceAll`; `getGoInstanceStatus` retorna só
  `{ connected, loggedIn }` (sem jid).

**Dado/endpoint Go disponível:**
- `GET /instance/all` (admin, chave **global**) → `data[].jid` (ex.: `5511...@s.whatsapp.net`)
  quando conectado; também `data[].id`, `name`, `token`, `connected`. (`GET /instance/get/{id}`
  é equivalente para uma instância.)
- `GET /instance/status` **não** traz jid (só `Connected`/`LoggedIn`/`Name`) — **não serve** aqui.

**Abordagem proposta:**
1. Criar no engine Go (TDD):
   ```ts
   // src/providers/whatsapp/evolution-go/instance.ts
   // Usa a chave GLOBAL (endpoint admin). Filtra /instance/all por id (ou name) e extrai o jid.
   export async function fetchGoInstanceProfile(
     apiKey: string,            // chave GLOBAL (admin)
     deps: IEngineDeps,
     input: { baseUrl: string; instanceId: string },
     traceId?: string,
   ): Promise<{ phoneNumber?: string }>
   ```
   Reusar um helper `jidToPhone` (existe no lado v2 em `evolution/instance.ts:48-53`; extrair para
   um util compartilhável ou replicar no Go — preferir extrair para `evolution-go` evitando import
   cruzado entre engines).
2. No ramo Go do `whatsapp-connect`:
   - Na action `qr`, **após** confirmar conexão (ou na primeira vez que o poll vê `connected`),
     chamar `fetchGoInstanceProfile` com a **chave global** e gravar `phone_number` se vier.
   - Adicionar um **backfill Go** espelhando `backfillMissingProfile`: no poll (`state`/`test`),
     enquanto `!phone_number`, tentar resolver o jid. (O jid só aparece após o login completar —
     daí o backfill.)

**Arquivos a tocar:** `src/providers/whatsapp/evolution-go/instance.ts` (+ `.test.ts`),
`supabase/functions/whatsapp-connect/index.ts`; mirror sync; redeploy `whatsapp-connect`.

**Critério de "feito":** parear um número Go popula `phone_number` (no pareamento ou em até alguns
polls); a UI mostra o telefone na Origem como no v2; sem regressão no v2.

**Riscos:** o jid pode demorar a aparecer no `/instance/all` logo após o QR (mitigado pelo
backfill); a função usa a **chave global** (admin) — garantir que o ramo resolve o
`_API_KEY` correto, não o `_INSTANCE_TOKEN`.

---

### Item C — Recuperação de half-create por find-by-name

**Objetivo:** tornar a criação de instância Go resiliente a um "half-create" — quando o servidor
Go já criou a instância (token gravado no Vault) mas a gravação do `instanceId` no Supabase
falhou. Hoje o próximo pareamento tenta recriar, recebe **403 "already in use"** e **lança sem
recovery**.

**Como o v2 faz (paridade-alvo):**
- `createInstance` (`evolution/instance.ts:225-248`) tem **try/catch idempotente**: "already in
  use"/"already exists" → **no-op** (`:245`). `mapEvolutionError` (`evolution/errors.ts`) preserva
  a mensagem (não colapsa em UNAUTHORIZED — correção do PR #147).

**Gap exato:**
- `createGoInstance` (`evolution-go/instance.ts:40-64`) **não** tem guarda de idempotência — 403
  "already in use" propaga.
- `mapEvolutionGoError` (`evolution-go/errors.ts:26-31`) **preserva** a mensagem (bom), mas
  ninguém a intercepta.
- `whatsapp-connect/index.ts:552-553` admite o gap: "Full recovery from a half-create (token in
  Vault, instanceId not persisted) via find-by-name is deferred to Phase 3".
- **Nota:** o token Go é emitido **uma única vez** por `/instance/create` e **não** é
  re-fetchável; por isso o create é **token-first** (grava o token no Vault antes do `instanceId`).
  A recuperação não pode recriar — precisa **achar** a instância existente.

**Dado/endpoint Go disponível:** `GET /instance/all` (chave global) → filtrar por `name`
(== `instanceName` derivado do `credentialsRef`/label) para obter o `id` da instância já criada.

**Abordagem proposta:**
1. Criar no engine Go (TDD):
   ```ts
   // src/providers/whatsapp/evolution-go/instance.ts
   export async function findGoInstanceByName(
     apiKey: string,           // chave GLOBAL (admin)
     deps: IEngineDeps,
     input: { baseUrl: string; name: string },
     traceId?: string,
   ): Promise<{ instanceId: string; token?: string } | null>
   ```
2. No ramo `qr` do `whatsapp-connect`, ao capturar 403 "already in use" de `createGoInstance`
   (a mensagem já é preservada por `mapEvolutionGoError`):
   - chamar `findGoInstanceByName` → obter `instanceId`;
   - persistir `instanceId` em `provider_config` (o token já deve estar no Vault pelo token-first;
     se `/instance/all` devolver o token, reconciliar);
   - seguir para connect/QR normalmente.
   - Manter os **dois writes checados** (Vault + linha) já existentes, para não divergir.

**Arquivos a tocar:** `src/providers/whatsapp/evolution-go/instance.ts` (+ `.test.ts`),
`supabase/functions/whatsapp-connect/index.ts`; mirror sync; redeploy `whatsapp-connect`.

**Critério de "feito":** simular half-create (criar a linha sem `instanceId` mas com a instância
existente no servidor) e reparear → a UI recupera o `instanceId` por find-by-name e conecta, sem
403 não-tratado. Teste de unidade do `findGoInstanceByName` (achou / não achou).

**Riscos:** depende de `name` único e estável por instância (garantido pelo `credentialsRef`); se
`/instance/all` não devolver o token, e o Vault não tiver (caso raro de falha antes do token-first),
o número precisa ser recriado do zero — documentar como caminho de exceção.

---

### Item D — `Connection` lifecycle no webhook + audit no poll (Go)

**Objetivo:** refletir conexões/desconexões proativas do servidor Go no `whatsapp_accounts.status`
(como o v2 faz via webhook) e **auditar** as transições de status do Go (hoje o poll Go atualiza
status **sem** audit).

**Como o v2 faz (paridade-alvo):**
- Webhook core (`_shared/whatsapp/webhook/core.ts:274-300`): trata `connection.update`, resolve a
  conta, chama `db.setAccountConnectionStatus(accountId, status)` (`:202-209`, update idempotente
  com `neq`) e **audita** (`whatsapp_instance_connected`/`disconnected`) quando a linha muda.
- Poll v2 (`whatsapp-connect`): `markConnected`/`markDisconnected` atualizam **e auditam**.

**Gap exato:**
- Webhook core Go (`:307-311`): detecta o evento `Connection` (PascalCase, whatsmeow) mas
  **ignora** (`outcome: "ignored"`) — não faz UPDATE. Parser em
  `_shared/whatsapp/evolution-go/parser.ts:125-145`.
- Poll Go (`whatsapp-connect/index.ts:600-632`): faz `update({ status: "connected" })` **sem
  audit** (v2 audita via `markConnected`).

**Esclarecimento de impacto (importante):** a UI **não** usa Realtime para status — o hook
`useEvolutionStatusSync` (`src/features/admin-settings/hooks/useEvolutionStatusSync.ts`) faz
**polling de 30 s** para **ambos** os providers (já filtra `isEvolutionFamily`). Logo o ganho do
Item D **não** é "tempo real": é (1) o banco refletir desconexões/reconexões **proativas** do Go
sem depender do poll, e (2) **paridade de auditoria**. O "tempo real" de verdade é o Item E.

**Abordagem proposta:**
1. **Confirmar os valores de `State`** do evento `Connection` do Go no smoke (ex.: `"CONNECTED"`,
   `"DISCONNECTED"`, `"connecting"`-equivalente) — checar parser/contratos.
2. No ramo `evolution-go` do webhook core, em vez de `ignored`:
   - mapear `State` → `"connected"`/`"disconnected"` (ignorar estados transientes);
   - resolver a conta por `instanceId` (já há `findEvolutionGoAccount`/`AnyStatus`);
   - chamar `db.setAccountConnectionStatus` + `db.audit` (reusando o mesmo caminho do v2).
3. No poll Go do `whatsapp-connect`, trocar o `update` cru por `markConnected`/`markDisconnected`
   (ou um equivalente Go que também audite) para **fechar a paridade de auditoria**.

**Arquivos a tocar:** `supabase/functions/_shared/whatsapp/webhook/core.ts` (origem em
`src/providers/whatsapp/webhook/core.ts`), `supabase/functions/whatsapp-connect/index.ts`;
mirror sync; redeploy `whatsapp-webhook` + `whatsapp-connect`.

**Critério de "feito":** desconectar o número no celular gera evento `Connection` que marca a conta
`disconnected` no banco (visível no próximo poll) **e** registra audit; reconectar volta a
`connected` + audit; sem regressão no v2.

**Riscos:** valores de `State` do whatsmeow precisam ser confirmados; evitar flapping (estados
transientes não devem auditar) — reusar a guarda idempotente `neq` do `setAccountConnectionStatus`.

---

### Item E — Realtime de status em `whatsapp_accounts` (opcional)

**Objetivo (melhoria, afeta v2 também):** empurrar mudanças de `whatsapp_accounts.status` por
WebSocket para a UI, eliminando a latência de até 30 s do polling.

**Estado atual:** a tabela `whatsapp_accounts` **não** está na publication Realtime (não há
`ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_accounts`); o provider supabase
`whatsappAccounts.list()` é query simples, sem subscription.

**Abordagem proposta (se priorizado):**
1. Migration aditiva: `ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_accounts;`
   (versionar em `supabase/migrations/` e aplicar via MCP com confirmação do dono).
2. No frontend (Configurações → WhatsApp), assinar mudanças da tabela (escopadas por loja/RLS) e
   invalidar a query da lista — **sem** tocar no cache do **atendimento** (escopo congelado).
3. Manter o polling de 30 s como fallback.

**Critério de "feito":** conectar/desconectar reflete na tela em segundos, sem refresh manual.

**Riscos:** baixo; é puramente aditivo. Garantir que a RLS de `whatsapp_accounts` cobre o canal
Realtime (não vazar contas entre lojas).

---

## 5. Checklist consolidado de execução

Sequência recomendada (cada item: TDD no engine → wire na Edge → `bun run test` + `bun run build`
+ `tsc` por delta → **sync do mirror** → commit atômico → redeploy da(s) edge(s) com "ok" do dono
→ smoke do item):

- [ ] **Pré:** smoke e2e do dono concluído (resolve contratos 1–3 e confirma shapes de
      `/user/avatar` e `Connection.State`).
- [ ] **B** — `fetchGoInstanceProfile` + wire no `whatsapp-connect` (pareamento + backfill).
- [ ] **C** — `findGoInstanceByName` + recovery de half-create no `whatsapp-connect`.
- [ ] **D** — `Connection` lifecycle no webhook core + audit no poll Go.
- [ ] **A** — `fetchGoContactAvatar` + `syncContactAvatar` Go-aware + wire no `whatsapp-webhook`.
- [ ] **E** (opcional) — Realtime em `whatsapp_accounts` (migration + subscription).
- [ ] Atualizar `docs/dev/evolution-go-edges.md` §(d) (remover itens concluídos) e
      `docs/fase2-pendencias.md`.
- [ ] Version bump (MINOR) + codinome + CHANGELOG ao fechar a Fase 3.

---

## 6. Referências

- **Engine/edges:** `src/providers/whatsapp/evolution-go/**`,
  `supabase/functions/{whatsapp-connect,whatsapp-webhook,whatsapp-send}/`,
  `supabase/functions/_shared/whatsapp/**`.
- **Runbook + smoke:** `docs/dev/evolution-go-edges.md` (§(d) lista os deferrals da Fase 3).
- **Contratos da API Go:** `docs/dev/evolution-go-api-contracts.md` · swagger
  `docs/integracoes/evo-go/doc.json` (endpoints `/user/avatar`, `/instance/all`, `/instance/status`).
- **Specs/planos:** `docs/superpowers/specs/2026-06-25-evolution-go-engine-design.md`,
  `docs/superpowers/specs/2026-06-25-evolution-go-pairing-ui-design.md` (§"Fora de escopo" lista a
  Fase 3), `docs/superpowers/plans/2026-06-25-evolution-go-engine-phase-{1,2}.md`,
  `docs/superpowers/plans/2026-06-25-evolution-go-pairing-ui.md`.
- **PRs base:** [#173](https://github.com/edmilson-prog/gallo-basediesel/pull/173) (Fases 0+1+2+5,
  merge `29ea456`), [#174](https://github.com/edmilson-prog/gallo-basediesel/pull/174) (release
  v0.121.0 `Conduit`, merge `758ccf0`).
- **Checkpoint da sessão:** `docs/checkpoints/2026-06-25-2302-conduit-release.md`.

> Quando o smoke confirmar os shapes (Contratos 1–3 + `/user/avatar` + `Connection.State`),
> atualizar as seções A e D deste documento com os campos exatos antes de implementar.
