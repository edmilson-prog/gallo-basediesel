# Cotação automática de frete — Melhor Envio (Fase A)

> Épico **"Melhor Envio"**. Esta entrega cobre **somente a Fase A — Cotação automática**
> no orçamento, pelo CEP do cliente, com fallback nas regras por região (PRD-033).
> Fases B (compra/etiqueta) e C (rastreamento) ficam para ciclos próprios.

## O que entrega

Ao montar um orçamento para um cliente com CEP, a plataforma cota o frete em tempo
real no Melhor Envio (caixa padrão por loja + peso somado dos itens), aplica markup e
regra de frete grátis, escolhe a opção mais barata e preenche o valor — o vendedor pode
trocar de transportadora ou editar à mão. Sem cobertura/erro/integração desligada, cai
nas **regras por região** (PRD-033); se nem elas casarem, "a combinar".

A cotação real roda **server-side** (Edge Function) com o token OAuth no **Supabase Vault**.
A lógica de negócio (markup → mais barata → frete grátis) é um **engine puro testável**.

## Arquitetura

```
QuoteEditor → useShippingQuote (debounce 700ms)
   │  cliente+CEP+itens+config.melhorEnvio
   ▼
providers/shipping (mock | edge)         features/shipping/engine/quoteEngine (PURO)
   │  quote() → opções CRUAS        ───►  buildQuoteResult: markup → mais barata → frete grátis
   │                                          │ sucesso → opções+selecionada
   │                                          │ vazio/erro → null ⇒ fallback
   ▼                                          ▼
supabase.functions.invoke              calculateShipping (regras PRD-033)
   "melhor-envio-quote"
   │ resolve Vault → refresh → POST /api/v2/me/shipment/calculate → normaliza
```

- **Token nunca no front nem em JSONB de settings** — só no Vault (`_shared/secrets.ts`,
  `createSecretResolver`, Vault-first + fallback env).
- **Config por loja** vive no JSONB `stores.settings.shipping.melhorEnvio` (sem migration de schema).
- Provider de cotação **standalone** (`src/providers/shipping/`, modelo de `src/providers/whatsapp/`),
  **fora** de `providers/data`.

## Arquivos

**Tipos & engine**
- `src/shared/types/shipping.ts` — `IMelhorEnvioConfig`, `IShippingQuoteOption`, `ShippingQuoteSource`,
  `IShippingQuoteResult`, `IShippingQuoteSnapshot`; `melhorEnvio?` em `IShippingConfig`.
- `src/shared/types/commercial.ts` — `shippingQuote?` em `IQuote` e `IOrder`.
- `src/features/shipping/engine/quoteEngine.ts` (+ `.test.ts`) — `applyMarkup`, `selectCheapest`,
  `applyFreeShipping`, `buildQuoteResult`.
- `src/features/shipping/api/calculate.test.ts` — cobertura do fallback PRD-033 (dívida saldada).
- `src/features/shipping/config/defaults.ts` — `DEFAULT_MELHOR_ENVIO_CONFIG` (`enabled:false`).

**Provider**
- `src/providers/shipping/{index,IShippingQuoteProvider,types,factory}.ts`
- `src/providers/shipping/mock/MockShippingQuoteProvider.ts` (+ `.test.ts`) — determinístico, sem rede.
- `src/providers/shipping/edge/EdgeShippingQuoteProvider.ts` — `invoke("melhor-envio-quote")`.

**Orçamento**
- `src/features/quotes/hooks/useShippingQuote.ts` — orquestra cotação + fallback (debounce).
- `src/features/quotes/components/new/QuoteEditor.tsx` — aplica o valor, snapshot, override manual.
- `src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx` — badge de fonte + troca de opção.

**Config & OAuth**
- `src/features/shipping/pages/ShippingConfigPage.tsx` — seção "Melhor Envio" + conexão; regras
  renomeadas para "Fallback por região".
- `src/features/shipping/api/melhorEnvioOAuth.ts` — wrapper do Edge OAuth (status/authorize/exchange/disconnect).
- `src/routes/app.configuracoes.frete.callback.tsx` — callback do OAuth.
- `src/features/admin-settings/engine/integrationKeys.ts` — grupo "Frete — Melhor Envio".

**Server-side**
- `supabase/functions/melhor-envio-quote/index.ts` — cotação (Vault, refresh, normaliza, audita).
- `supabase/functions/melhor-envio-oauth/index.ts` — authorize-url | exchange | status | disconnect.
- `supabase/functions/_shared/melhorEnvio.ts` — bases, nomes de secret, token helpers, normalizer.
- `supabase/migrations/20260617120000_integration_secret_delete.sql` — RPC para a disconnect limpar tokens.
- `supabase/migrations/20260617130000_add_shipping_quote_snapshot.sql` — coluna `shipping_quote jsonb` em `quotes`/`orders`.
- `supabase/migrations/20260617140000_integration_logs_melhor_envio.sql` — permite `melhor_envio` no CHECK de `integration_logs`.

## Segredos no Vault (tela Chaves & API)

As credenciais são **por ambiente**: o `client_id`/`secret` de produção usa o nome
"nu" (`MELHOR_ENVIO_*`) e o de sandbox o prefixo `MELHOR_ENVIO_SANDBOX_*`. O
`REDIRECT_URI` e o `USER_AGENT` são **compartilhados** (iguais nos dois apps). Assim
o seletor "Ambiente" alterna de app em runtime e dá para ficar conectado em sandbox
e produção ao mesmo tempo. A resolução é centralizada em `meSecrets(env)`
(`_shared/melhorEnvio.ts`).

| Secret | kind | Observação |
|--------|------|-----------|
| `MELHOR_ENVIO_CLIENT_ID` | config | app OAuth de **produção** (app.melhorenvio.com.br → Área dev) |
| `MELHOR_ENVIO_CLIENT_SECRET` | secret | segredo do app de produção |
| `MELHOR_ENVIO_SANDBOX_CLIENT_ID` | config | app OAuth de **sandbox** (sandbox.melhorenvio.com.br) |
| `MELHOR_ENVIO_SANDBOX_CLIENT_SECRET` | secret | segredo do app de sandbox |
| `MELHOR_ENVIO_REDIRECT_URI` | config | **compartilhada** — idêntica à cadastrada nos dois apps |
| `MELHOR_ENVIO_USER_AGENT` | config | **compartilhada** — ex.: `GALLO BASE DIESEL (contato@dominio)` (exigido pela API) |

Os tokens `[…]ACCESS_TOKEN` / `[…]REFRESH_TOKEN` / `[…]TOKEN_EXPIRES_AT` (com o mesmo
prefixo por ambiente) são **gravados/renovados pela Edge OAuth** — não entram no
catálogo manual.

## Ordem de deploy (rollout)

> **Estado em produção (2026-06-18):** a v0.106.0 já foi entregue — as **3 migrations
> abaixo estão APLICADAS em produção** e as **2 Edge Functions estão DEPLOYADAS**. As
> partes do dono (apps OAuth + secrets + Conectar) seguem pendentes.

**Migrations da v0.106.0 (já aplicadas em prod — referência para DR / ambiente novo):**
`20260617120000_integration_secret_delete.sql` (RPC de delete),
`20260617130000_add_shipping_quote_snapshot.sql` (coluna `shipping_quote` em quotes/orders),
`20260617140000_integration_logs_melhor_envio.sql` (CHECK do audit).
⚠️ Num ambiente do zero, a migration da coluna `shipping_quote` deve ser aplicada **antes**
do deploy do app, senão o `create` de orçamento quebra.

**Esta entrega (incremento multi-ambiente):** as credenciais passaram a ser resolvidas por
ambiente em `meSecrets(env)`. **NÃO há migration nova** — o único passo técnico é o
**redeploy das 2 Edge Functions**:

```bash
npx supabase functions deploy melhor-envio-quote melhor-envio-oauth --project-ref njizaasajkdqptlxddqn
```

**Partes do dono (conta Melhor Envio):**

1. **Criar o app OAuth** para cada ambiente que for usar (sandbox e/ou produção — são
   contas/apps **separados**, `client_id`/`secret` distintos) e cadastrar em **ambos** a
   mesma `redirect_uri` exata:
   `https://crm.gallobasediesel.com.br/app/configuracoes/frete/callback`.
2. **Cadastrar os secrets por ambiente** em *Configurações → Integrações → Chaves & API*:
   produção em `MELHOR_ENVIO_CLIENT_ID/SECRET`, sandbox em
   `MELHOR_ENVIO_SANDBOX_CLIENT_ID/SECRET`, mais os compartilhados `MELHOR_ENVIO_REDIRECT_URI`
   e `MELHOR_ENVIO_USER_AGENT`.
3. Em *Configurações → Frete → Melhor Envio*: selecionar o ambiente, **Conectar** (OAuth),
   preencher CEP de origem / caixa padrão / serviços / markup / frete grátis, ligar
   "Ativar cotação automática" e **Salvar alterações**. Trocar o seletor "Ambiente" alterna
   o app e a conexão — cada ambiente tem o seu token, dá para ficar conectado nos dois (a
   seção mostra o estado de Sandbox e Produção lado a lado).

> **Notas técnicas (multi-ambiente):**
> - O front **sempre** envia `environment`; quando ausente, as Edges caem em `sandbox`
>   (seguro — modo inerte se não há token, caindo no fallback por região PRD-033).
> - O `state` CSRF + o env atravessam o redirect OAuth via **`localStorage`** (compartilhado
>   por origem entre abas), não `sessionStorage` (por aba): o consentimento do Melhor Envio
>   pode retornar em **outra aba**, e um store por aba perderia o `state` lá → o callback
>   rejeitaria como "state divergente" antes de trocar o `code` (v0.107.1).
> - O env só é amarrado ao `state` CSRF no cliente; o `exchange` (owner-only) confia no
>   `environment` do corpo. Resíduo aceito: trocar o env exigiria XSS, e o ME rejeita um
>   `code` trocado com credenciais de outro ambiente (pior caso = token no env errado,
>   reversível por reconectar).
> - **Tokens órfãos da v0.106.0:** se alguém conectou em **dev/staging** na v0.106.0 (nomes
>   "nus"), após este incremento o ambiente *sandbox* procura `MELHOR_ENVIO_SANDBOX_*` e não
>   acha o token antigo → basta reconectar. Produção mantém os nomes nus (retrocompatível).

## Verificação

**Automatizada (gate de CI):** `bun run test` (engine + calculate + catálogo de chaves +
mock provider) e `bun run build`. `bunx tsc --noEmit` avaliado por delta dos arquivos novos.

**Mock (sem credenciais — `VITE_DATA_SOURCE=mock`):**
- [ ] Ligar `melhorEnvio.enabled`, definir CEP de origem; criar orçamento e selecionar cliente com CEP.
- [ ] Frete preenchido automaticamente; badge "Melhor Envio"; trocar de transportadora altera o valor.
- [ ] Markup % e R$ refletem no valor; frete grátis acima de X zera o frete (badge "frete grátis").
- [ ] Editar o campo Frete à mão trava o override (auto não sobrescreve); "Calcular" recota e destrava.
- [ ] Desligar `melhorEnvio.enabled` ⇒ comportamento PRD-033 intacto (botão "Calcular" = regra regional).

**e2e sandbox (gated em credenciais — análogo ao WhatsApp):**
- [ ] Cadastrar app + `redirect_uri` no sandbox do ME; cadastrar secrets; **Conectar** → status "Conectado".
- [ ] Cotar CEP coberto (Correios/Jadlog) → opções reais; CEP sem cobertura → fallback regional.
- [ ] Conferir `integration_logs` (integration_name `melhor_envio`).

## Decisões e itens deferidos

- **Snapshot persistido (mock + Supabase):** `IQuote.shippingQuote`/`IOrder.shippingQuote` gravam em
  `quotes.shipping_quote`/`orders.shipping_quote` (jsonb) — coluna criada pela migration
  `20260617130000` e mapeada nos providers supabase (create/patch/rowTo/COLUMNS). Inclui
  `basePrice` e `freeShippingApplied` para a Fase B reconciliar quando o frete grátis zera o valor.
- **Scopes OAuth:** a Edge pede o conjunto do épico inteiro
  (`shipping-calculate cart-* shipping-*`) para evitar reconexão nas Fases B/C.
- **Ambiente sandbox↔produção:** um conjunto de secrets por vez (reconectar ao trocar).
- **Conta ME única (global)** + CEP de origem por loja; caixa padrão única por loja.
- **User-Agent** real (e-mail de contato) a confirmar com o dono — a API exige o header.

## Referência da API

- Bases: sandbox `https://sandbox.melhorenvio.com.br` · produção `https://www.melhorenvio.com.br`.
- Header obrigatório `User-Agent: GALLO BASE DIESEL (email)`.
- OAuth2: access_token 30 dias, refresh_token 45 dias.
- Cotação: `POST /api/v2/me/shipment/calculate` (modo `package`, cm/kg).
- Serviços: PAC=1, SEDEX=2, Jadlog .Package=3, Jadlog .Com=4, Mini Envios=17.
- Spec/plano: `docs/superpowers/specs/2026-06-14-melhor-envio-frete-design.md`,
  `docs/superpowers/plans/2026-06-14-melhor-envio-frete-fase-a.md`.
```
