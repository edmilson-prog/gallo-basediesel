# Design — Cotação automática de frete via Melhor Envio (Épico "Melhor Envio" · Fase A)

- **Data:** 2026-06-14
- **Status:** Aprovado para planejamento (brainstorming concluído)
- **Feature alvo:** `src/features/shipping/` (estende) + `src/providers/shipping/` (nova camada) + Edge Functions `melhor-envio-*`
- **Origem:** brainstorming com o dono do produto, a partir da tela de Frete já existente (PRD-033) e da exigência de que o frete apareça **automaticamente no orçamento pelo CEP do cliente**, com **tudo parametrizável**.
- **Codinome de release sugerido:** `Freight` (bump MINOR ao concluir).

---

## 1. Contexto e objetivo

Hoje o GALLO tem um cálculo de frete **local e puro** (PRD-033, `_DONE`): regras por região (cidade / UF / multi-UF / nacional) configuráveis em `/app/configuracoes/frete`, com simulador. No orçamento, o vendedor clica **"Calcular"** e o frete é resolvido por essas regras — usando apenas **cidade + UF** (ignora o CEP). A própria tela tem um card: *"Próxima fase — integração com transportadoras... cálculo real por CEP origem/destino, dimensões e peso"*.

**Objetivo (Fase A):** materializar a integração com o **Melhor Envio** para que, ao montar um orçamento para um cliente com CEP, a plataforma **cote o frete em tempo real** (caixa padrão por loja + peso somado dos itens), **escolha automaticamente a opção mais barata**, aplique **markup** e **frete grátis**, e **preencha o valor** — deixando o vendedor trocar entre as opções retornadas ou editar à mão. Se a cotação falhar ou não cobrir o CEP, **cai nas regras por região** (PRD-033 vira o fallback); se nem elas casarem, "a combinar".

A cotação real é uma chamada autenticada (OAuth2, token secreto) → roda **server-side em Edge Function**, com credenciais no **Supabase Vault** (padrão "Keyring" já existente: inserir/substituir sem redeploy). A lógica de negócio (markup, seleção, frete grátis) fica em **engine puro testável**.

> Este design cobre **somente a Fase A — Cotação**. As Fases B (compra/etiqueta) e C (rastreamento) ficam registradas na §12 para ciclos próprios.

## 2. Decisões do brainstorming

| Tema | Decisão |
|------|---------|
| Escopo | Épico completo; **implementar só a Fase A (cotação)** agora. |
| Dimensões dos produtos | **Caixa padrão por loja** + peso real somado dos itens (catálogo `IPart` só tem `weightKg`, sem dimensões). |
| Seleção automática | **Mais barata** entre os serviços habilitados (vendedor pode trocar). |
| Fallback | **Regras por região atuais** (PRD-033) → se nada casar, "a combinar". |
| Gatilho no orçamento | **Automático com debounce**; re-cota quando cliente/CEP/itens mudam. |
| Autenticação | **OAuth2 completo com botão "Conectar"** + refresh automático na Edge; credenciais no Vault. |
| Ajuste comercial | **Markup (% ou R$) + frete grátis acima de X**, por loja. |
| Token "por parâmetro" | client_id/secret colados na tela de Chaves (Vault); tokens de acesso gravados/renovados pela Edge — substituíveis sem redeploy. |

## 3. Arquitetura e estrutura de pastas

Segue o padrão feature-driven + camada de provider externa (modelo de `src/providers/whatsapp/`) + Edge Functions com `_shared/` do projeto.

```
src/providers/shipping/                 # NOVA camada (modelo: src/providers/whatsapp/)
├── IShippingQuoteProvider.ts           # contrato quote(input): Promise<IShippingQuoteOption[]>
├── types.ts                            # IShippingQuoteInput
├── factory.ts                          # getShippingQuoteProvider() por VITE_DATA_SOURCE
├── mock/MockShippingQuoteProvider.ts   # determinístico (seed CEP+peso), sem rede
├── edge/EdgeShippingQuoteProvider.ts   # supabase.functions.invoke("melhor-envio-quote")
└── index.ts                            # barrel

src/features/shipping/
├── engine/
│   ├── quoteEngine.ts (+ .test.ts)     # markup → mais barata → frete grátis (PURO)
│   └── ... 
├── api/
│   ├── calculate.ts                    # existente — vira o FALLBACK
│   ├── calculate.test.ts               # NOVO (dívida do PRD-033; sem testes hoje)
│   └── index.ts
├── config/defaults.ts                  # + bloco melhorEnvio (enabled:false)
└── pages/ShippingConfigPage.tsx        # + seção "Melhor Envio" + OAuth + simulador real

src/features/quotes/
├── hooks/useShippingQuote.ts           # NOVO — orquestra cotação + fallback (debounce)
└── components/new/
    ├── QuoteEditor.tsx                 # instancia o hook; setShipping; snapshot
    └── summary/QuoteSummaryPanel.tsx   # UI de opções/fonte abaixo do campo Frete

src/shared/types/
├── shipping.ts                         # + IMelhorEnvioConfig, IShippingQuoteOption/Result/Snapshot
└── commercial.ts                       # + shippingQuote? em IQuote e IOrder

src/features/admin-settings/engine/integrationKeys.ts  # + grupo "Frete — Melhor Envio"
src/features/orders/api/createOrderFromQuote.ts        # copia shippingQuote
src/routes/app.configuracoes.frete.callback.tsx        # callback OAuth (ou query ?me_oauth=1)

supabase/functions/
├── melhor-envio-quote/index.ts         # cotação (resolve Vault, refresh, normaliza)
└── melhor-envio-oauth/index.ts         # authorize-url | exchange | status | disconnect
```

**Princípios reaproveitados do repo:**
- Token **nunca** no front nem em JSONB de settings → só no **Vault** (`supabase/functions/_shared/secrets.ts`, `createSecretResolver` — Vault-first + fallback env).
- Edge segue o esqueleto de `whatsapp-send`: `servePost` + `requireCaller` + `parseJsonBody` + `json`/`HttpError` + audit em `integration_logs`.
- Engine de negócio **puro** (sem rede), testado com Vitest, igual aos cores do WhatsApp.
- Provider de cotação **standalone** em `src/providers/shipping/` (espelha `src/providers/whatsapp/`; **não** entra em `providers/data` nem no ESLint boundary de `impl/*`).
- Toda `apply_migration` via MCP **deve ser exportada** para `supabase/migrations/` no mesmo PR.

## 4. Modelo de dados (`src/shared/types/shipping.ts`)

Estende `IShippingConfig` (campos **opcionais**, retrocompatíveis — config vive no JSONB `stores.settings`, **sem migration de schema**):

```ts
export interface IMelhorEnvioConfig {
  enabled: boolean;                       // liga a cotação automática
  environment: "sandbox" | "production";  // base URL + qual app OAuth
  originZip: string;                      // CEP de origem da loja (from.postal_code)
  defaultBox: { heightCm: number; widthCm: number; lengthCm: number };
  enabledServices: number[];              // ex. [1,2,3,4]; vazio = todos
  selectionCriterion: "cheapest";         // fixo na Fase A (preparado p/ fastest/preferred)
  markup: { type: "percent" | "fixed"; value: number };  // value 0 = sem markup
  freeAboveSubtotal?: number;             // zera frete quando subtotal ≥ X
  userAgentContact?: string;              // e-mail do header User-Agent (fallback p/ secret/const)
}

export interface IShippingConfig {        // já existe — acrescentar:
  // ...campos atuais (strategy, rates, defaultWhenNoMatch, defaultFallbackValue)...
  melhorEnvio?: IMelhorEnvioConfig;
}
```

Novos tipos de cotação (**não** mexer em `IShippingResult`, que continua sendo do `calculateShipping` puro/fallback):

```ts
export interface IShippingQuoteOption {
  serviceId: number; serviceName: string;
  companyId: number; companyName: string; companyPicture?: string;
  basePrice: number;            // price cru do ME (R$)
  finalPrice: number;           // após markup (preenchido pelo engine)
  deliveryDays: number; deliveryRange?: { min: number; max: number };
}
export type ShippingQuoteSource = "melhor_envio" | "region_rules" | "to_negotiate";
export interface IShippingQuoteResult {
  source: ShippingQuoteSource;
  options: IShippingQuoteOption[];        // [] quando source != melhor_envio
  selected?: IShippingQuoteOption;        // a escolhida (mais barata, pós-markup)
  value: number;                          // valor final aplicado ao orçamento (0 = a combinar)
  isToNegotiate: boolean;
  freeShippingApplied?: boolean;
  notes?: string; error?: string;
}
// Snapshot leve gravado no orçamento/pedido (reuso na Fase B):
export interface IShippingQuoteSnapshot {
  source: ShippingQuoteSource; serviceId?: number; serviceName?: string;
  companyName?: string; price: number; deliveryDays?: number; quotedAt: string;
}
```

Default em `src/features/shipping/config/defaults.ts`: `melhorEnvio` com `enabled:false`, `environment:"sandbox"`, `originZip:""`, `defaultBox:{ heightCm:20, widthCm:30, lengthCm:40 }`, `enabledServices:[1,2,3,4]`, `selectionCriterion:"cheapest"`, `markup:{ type:"percent", value:0 }`. (`enabled:false` ⇒ comportamento PRD-033 intacto.)

## 5. Contrato do provider de cotação (`IShippingQuoteProvider`)

```ts
export interface IShippingQuoteInput {
  originZip: string; destZip: string;
  box: { heightCm: number; widthCm: number; lengthCm: number };
  weightKg: number; declaredValue: number;
  environment: "sandbox" | "production"; services?: number[];
}
export interface IShippingQuoteProvider {
  // Opções CRUAS (sem markup). Engine aplica markup/seleção/frete grátis depois.
  quote(input: IShippingQuoteInput): Promise<IShippingQuoteOption[]>;
}
```

- **Mock (`MockShippingQuoteProvider`):** determinístico (seed por CEP+peso) → 2–3 opções plausíveis (PAC/SEDEX/Jadlog) com preços e prazos. Usado quando `VITE_DATA_SOURCE=mock` (demo/testes), **sem rede**.
- **Edge (`EdgeShippingQuoteProvider`):** `getSupabaseClient().functions.invoke("melhor-envio-quote", { body })`. Trata `{ scaffold: true }` (não conectado) como `[]` ⇒ o hook cai no fallback.
- **Factory:** seleção por `VITE_DATA_SOURCE` (reusar o helper de mock já existente). **Não** registrar em `IDataProviders`.

## 6. Edge Functions

### 6.1 `melhor-envio-quote`
- `servePost` + `requireCaller(req, ["owner","manager","seller"])` (vendedores cotam) → `admin` (service_role) + `resolveSecret = createSecretResolver(admin)`.
- Resolve `MELHOR_ENVIO_ACCESS_TOKEN/REFRESH_TOKEN/TOKEN_EXPIRES_AT/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI/USER_AGENT`.
- **Inert mode:** sem access_token → `json({ scaffold:true }, 200)`.
- **Refresh proativo/reativo:** se `expires_at` passou ou a chamada der 401 → `POST {base}/oauth/token grant_type=refresh_token` → grava novos tokens no Vault via RPC `integration_secret_set` → refaz a cotação **uma vez**.
- Monta o body modo `package`, header `User-Agent`, chama `POST {base}/api/v2/me/shipment/calculate`; normaliza → `IShippingQuoteOption[]` (descarta itens com `error`; filtra por `services`); audita `integration_logs`; retorna `{ options }`.

### 6.2 `melhor-envio-oauth`
- `servePost` + `requireCaller(req, ["owner"])`. Body `{ action }`:
  - `authorize-url` → gera `state` (CSRF), monta `GET {base}/oauth/authorize?...`; retorna `{ url, state }`.
  - `exchange` → `{ code, state }` → `POST /oauth/token grant_type=authorization_code` → grava tokens no Vault → audita `melhor_envio_connected`; retorna `{ connected:true }`.
  - `status` → presença/expiração dos tokens → `{ connected, expiresAt, environment }` (nunca devolve o token).
  - `disconnect` → sobrescreve os 3 tokens → audita; retorna `{ connected:false }`.

## 7. Engine puro + fallback (`src/features/shipping/engine/quoteEngine.ts`)

Funções puras, 100% testáveis:
- `applyMarkup(price, markup)` · `selectCheapest(options)` · `applyFreeShipping(price, subtotal, freeAbove)`.
- `buildQuoteResult(rawOptions, config, subtotal): IShippingQuoteResult` → aplica markup em cada opção (`finalPrice`), seleciona a mais barata, aplica frete grátis, monta o resultado. Lista vazia ⇒ deixa o orquestrador cair no fallback.

**Orquestração de fallback** (no hook `useShippingQuote`): cota via provider → se `[]`/erro/sem cobertura → `calculateShipping({ address, items, config })` (regras PRD-033) → mapeia para `IShippingQuoteResult` (`source: "region_rules" | "to_negotiate"`).

## 8. Hook + integração no orçamento

- **`useShippingQuote.ts`** (novo): entrada `{ customer, items, partsById, settings, currentStore, subtotal }`; debounce ~700ms (alinhado a `useQuoteDraft`); pré-condições `melhorEnvio.enabled` + `customer.address.zipCode` + `originZip` + `defaultBox` + peso (`quoteAggregates(...).totalWeightKg`). Retorna `{ loading, result, refetch }` — **não** muta o editor.
- **`QuoteEditor.tsx`:** instancia o hook; em `result` novo, `setShipping(result.value)` + guarda `shippingQuoteSnapshot`; `handleCalcShipping` vira **refetch manual**; override manual do input preservado; passa `shippingQuote` ao `provider.create`.
- **`QuoteSummaryPanel.tsx`:** abaixo do input "Frete (R$)" → badge de fonte (Melhor Envio / Regra regional / A combinar), opção selecionada (transportadora + prazo), spinner no loading e popover/select para trocar de opção. Renderiza nos modos `compact` e normal.

## 9. UI de configuração + OAuth (`ShippingConfigPage.tsx`)

Nova seção **"Melhor Envio"** (card antes do simulador):
- **Conexão (OAuth):** status via `melhor-envio-oauth status` (Conectado/Desconectado + "expira em"); botões **Conectar/Reconectar/Desconectar**. "Conectar" pega `authorize-url`, guarda `state` em `sessionStorage`, redireciona. Callback (rota `app.configuracoes.frete.callback.tsx` ou query `?me_oauth=1`) lê `code`+`state`, valida, chama `exchange`, mostra toast, volta. `MELHOR_ENVIO_REDIRECT_URI` deve bater **exatamente** com a cadastrada no painel do ME.
- **Parâmetros (por loja, em `settings.shipping.melhorEnvio` via `usePlatformSettings.update`):** toggle "Ativar cotação automática"; select ambiente; CEP de origem; caixa padrão (3 inputs cm); serviços habilitados (checkboxes PAC/SEDEX/Jadlog/.Com); markup (tipo % ou R$ + valor); frete grátis acima de R$.
- Renomear a seção de regras para **"Fallback por região"**; o **simulador** passa a cotar de verdade (via hook/edge) com fallback visível; atalho para `/app/configuracoes/chaves`.

## 10. Chaves no Vault (`integrationKeys.ts`)

Grupo fixo **"Frete — Melhor Envio"** (depois de `whatsapp-webhook`):

| Secret | kind |
|--------|------|
| `MELHOR_ENVIO_CLIENT_ID` | config |
| `MELHOR_ENVIO_CLIENT_SECRET` | secret |
| `MELHOR_ENVIO_REDIRECT_URI` | config (idêntica à do painel ME) |
| `MELHOR_ENVIO_USER_AGENT` | config (ex.: `GALLO BASE DIESEL (contato@dominio)`) |

Os 3 tokens (`ACCESS_TOKEN`/`REFRESH_TOKEN`/`TOKEN_EXPIRES_AT`) **não** entram no catálogo manual — são gravados pela Edge OAuth. Todos os nomes casam `SECRET_NAME_PATTERN` (`/^[A-Z][A-Z0-9_]{2,64}$/`). Atualizar `integrationKeys.test.ts`.

## 11. Referência da API Melhor Envio (verificada na doc oficial)

- **Bases:** sandbox `https://sandbox.melhorenvio.com.br` · produção `https://www.melhorenvio.com.br` (OAuth + API na mesma base). Sandbox: saldo fictício R$ 10.000, **só Correios + Jadlog**.
- **Header obrigatório:** `User-Agent: GALLO BASE DIESEL (email)` — sem ele a API rejeita. Também `Accept`/`Content-Type: application/json`, `Authorization: Bearer`.
- **OAuth2:** `access_token` 30 dias, `refresh_token` 45 dias. Authorize `GET {base}/oauth/authorize?client_id&redirect_uri&response_type=code&scope&state`; token `POST {base}/oauth/token` (`grant_type=authorization_code|refresh_token`). App criado em `app.melhorenvio.com.br/integracoes/area-dev` (redirect_uri exata). Scope da Fase A: `shipping-calculate`.
- **Cotação** `POST /api/v2/me/shipment/calculate` (cm/kg), modo `package`:
  ```json
  { "from": { "postal_code": "96020360" }, "to": { "postal_code": "01018020" },
    "package": { "height": 4, "width": 12, "length": 17, "weight": 1.5 },
    "options": { "insurance_value": 320.0, "receipt": false, "own_hand": false },
    "services": "1,2,3,4" }
  ```
  Resposta: array `{ id, name, price, custom_price, discount, currency, delivery_time, delivery_range{min,max}, company{id,name,picture}, error? }`. Serviços indisponíveis vêm com `error` e sem `price` → filtrar.
- **IDs de serviço:** PAC=1, SEDEX=2, Jadlog .Package=3, Jadlog .Com=4, Mini Envios=17. Listáveis em `GET /api/v2/me/shipment/services`. Usar **IDs numéricos**.
- Fontes: [Introdução](https://docs.melhorenvio.com.br/reference/introducao-api-melhor-envio) · [Autenticação](https://docs.melhorenvio.com.br/docs/autenticacao-1) · [Sandbox](https://docs.melhorenvio.com.br/docs/sandbox) · [Cálculo por produtos](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos) · [Listar serviços](https://docs.melhorenvio.com.br/reference/listar-servicos) · [llms.txt](https://docs.melhorenvio.com.br/llms.txt)

## 12. Escopo Fase A × deferido

**Entra agora (Fase A):** cotação automática no orçamento (auto + debounce + fallback), seleção mais barata, markup + frete grátis, UI de config + OAuth (Conectar/refresh), provider mock+edge, engine puro testado, catálogo de chaves, snapshot leve no pedido. Mock cobre demo/testes sem credenciais; e2e real **gated** em conta + app sandbox do ME.

**Deferido (épico, ciclos próprios):**
- **Fase B — Compra/etiqueta:** carrinho (`/api/v2/me/cart`) → checkout (`/me/shipment/checkout`) → geração/impressão (`/generate`,`/print`), saldo da conta ME, remetente/destinatário, declaração de conteúdo. Reusa o snapshot. Novos scopes.
- **Fase C — Rastreamento:** `/me/shipment/tracking` (polling) ou webhook, timeline na ficha do pedido (`trackingCode` já existe), notificação ao cliente.
- Múltiplas caixas / dimensões por peça; múltiplas contas ME por loja; critérios de seleção "mais rápido"/"preferencial".

## 13. RBAC, multistore, estados, acessibilidade

- **RBAC:** painel de Frete segue o atual — Owner edita, Gestor lê, Vendedor sem acesso ao painel; a cotação no orçamento é consumida por vendedores (Edge aceita `seller`). OAuth (conectar/desconectar) é Owner-only.
- **Multistore:** parâmetros de cotação **por loja** (`settings.shipping.melhorEnvio`, inclui `originZip`); conexão ME **única/global** no MVP (tokens app-level no Vault).
- **Estados:** skeleton/loading na cotação automática; erro com fallback transparente; badge de fonte sempre visível; override manual sempre disponível.
- **UX/a11y:** segue `docs/dev/ux-guidelines.md`; `aria-label` nos botões de ícone; cor nunca é o único indicador (badge = ícone+texto).

## 14. Riscos e decisões em aberto

1. **Scopes na conexão:** só `shipping-calculate` (Fase A) ou já o conjunto de B/C para evitar reconexão? (Recomendado: já o conjunto do épico.)
2. **Ambiente sandbox↔produção:** Fase A assume **um** conjunto de secrets por vez (reconectar ao trocar). Simultâneo exigiria sufixo de ambiente (`MELHOR_ENVIO_PROD_*`/`_SANDBOX_*`).
3. **Persistência do snapshot** (`shipping_quote` jsonb) na Fase A vs início da Fase B (texto em `carrier`).
4. **Caixa padrão única** por loja; múltiplas caixas / dimensões por peça ficam para evolução.
5. **Conta ME única** (tokens globais) + CEP de origem por loja; multi-conta-ME é evolução.
6. **User-Agent / e-mail de contato** real (a API exige).

## 15. Referências (arquivos do projeto)

- Frete atual (vira fallback): `src/features/shipping/api/calculate.ts`, `config/defaults.ts`, `pages/ShippingConfigPage.tsx`; tipos em `src/shared/types/shipping.ts`.
- Orçamento: `src/features/quotes/components/new/QuoteEditor.tsx`, `.../summary/QuoteSummaryPanel.tsx`, `hooks/useQuoteDraft.ts`, `utils/quoteItemDisplay.ts` (`quoteAggregates`), `utils/quoteTotals.ts` (`recalculateQuote`).
- Settings: `src/features/admin-settings/hooks/usePlatformSettings.ts`; provider supabase de settings (merge in-app no JSONB `stores.settings`).
- Vault/chaves: `src/features/admin-settings/engine/integrationKeys.ts`, `pages/IntegrationKeysPage.tsx`, `api/integrationSecrets.ts`; Edge `supabase/functions/integration-secrets/index.ts`; helper `_shared/secrets.ts`; migration `20260610190000_integration_secrets_vault.sql`.
- Padrão de camada externa + Edge: `src/providers/whatsapp/`, `supabase/functions/whatsapp-send/index.ts`, `supabase/functions/_shared/{serve,http,auth,secrets,env,logger}.ts`.
- Pedido: `src/features/orders/api/createOrderFromQuote.ts`; tipos `src/shared/types/commercial.ts` (`IQuote`/`IOrder`, `carrier`/`trackingCode`).
- Multistore: `src/features/multistore` (`useCurrentStore`), `src/shared/types/platform.ts` (`IStore`, `IPlatformSettings`).
- Plano de implementação: `docs/superpowers/plans/2026-06-14-melhor-envio-frete-fase-a.md`.
