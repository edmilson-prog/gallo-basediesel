# Cotação automática de frete (Melhor Envio) — Implementation Plan · Fase A

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar task-by-task. Steps usam checkbox (`- [ ]`).

**Goal:** No orçamento, o frete deve aparecer **automaticamente pelo CEP do cliente**, cotado em tempo real no **Melhor Envio** (caixa padrão por loja + peso somado), escolhendo a opção **mais barata**, com **markup + frete grátis** parametrizáveis. Se a cotação falhar/não cobrir o CEP, cai nas **regras por região** (PRD-033) → "a combinar". Autenticação por **OAuth2 (botão Conectar)** com refresh automático; credenciais no **Vault**.

**Architecture:** Edge `melhor-envio-quote` (resolve token no Vault, refresh, chama a API, normaliza) + Edge `melhor-envio-oauth` (authorize/exchange/status/disconnect). Camada `src/providers/shipping/` (mock+edge, modelo de `src/providers/whatsapp/`). Lógica de negócio em `src/features/shipping/engine/` **pura** (Vitest). Hook `useShippingQuote` orquestra cotação + fallback no `QuoteEditor`. Config nova em `IShippingConfig.melhorEnvio` (JSONB `stores.settings`, sem migration).

**Tech Stack:** React 19, TanStack Router (file-based), Tailwind v4 + shadcn/ui, Vitest, Supabase Edge Functions (Deno). Spec de origem: `docs/superpowers/specs/2026-06-14-melhor-envio-frete-design.md`. Plano-fonte (sessão de brainstorming): `~/.claude/plans/o-token-tem-que-functional-adleman.md`.

---

## Pré-requisito de execução (git)

Brainstorming feito em `main` (working tree sujo, com PRDs untracked não relacionados). **Antes da Task 1**, isole o trabalho:

```bash
git checkout main && git checkout -b feat/melhor-envio-cotacao
git add docs/superpowers/specs/2026-06-14-melhor-envio-frete-design.md \
        docs/superpowers/plans/2026-06-14-melhor-envio-frete-fase-a.md
git commit -m "docs: spec and plan for Melhor Envio freight quote (phase A)"
```

> Se preferir worktree isolado, use `superpowers:using-git-worktrees`. **Não** commitar em `main`. Não dar `git add .` (há muitos untracked não relacionados no working tree).

## Confirmar com o dono antes de codar (decisões em aberto — §14 do spec)

1. **Scopes OAuth:** só `shipping-calculate` ou já o conjunto de B/C (`cart-read cart-write shipping-checkout shipping-generate shipping-print shipping-tracking`) para evitar reconexão.
2. **Ambiente:** um conjunto de secrets por vez (reconectar ao trocar) vs sufixo `_PROD_/_SANDBOX_`.
3. **Snapshot:** `shipping_quote` jsonb agora vs texto em `carrier` até a Fase B.
4. **User-Agent / e-mail de contato** real para o header.
5. **Conta + app sandbox do Melhor Envio** criados e `redirect_uri` cadastrada (destrava o e2e).

## API quick reference (detalhe completo na §11 do spec)

- Base sandbox `https://sandbox.melhorenvio.com.br` · prod `https://www.melhorenvio.com.br`.
- Header obrigatório `User-Agent: GALLO BASE DIESEL (email)` + `Accept`/`Content-Type: application/json` + `Authorization: Bearer`.
- OAuth: `GET /oauth/authorize` · `POST /oauth/token` (token 30d, refresh 45d).
- Cotação: `POST /api/v2/me/shipment/calculate` modo `package` (`from.postal_code`, `to.postal_code`, `package{height,width,length,weight}`, `options{insurance_value,receipt,own_hand}`, `services:"1,2,3,4"`). Resposta = array de serviços com `error?`.
- IDs: PAC=1, SEDEX=2, Jadlog .Package=3, .Com=4, Mini Envios=17.

---

## File Structure

**Criar:**
- `src/providers/shipping/{index.ts,IShippingQuoteProvider.ts,types.ts,factory.ts}`
- `src/providers/shipping/mock/MockShippingQuoteProvider.ts`
- `src/providers/shipping/edge/EdgeShippingQuoteProvider.ts`
- `src/features/shipping/engine/quoteEngine.ts` (+ `quoteEngine.test.ts`)
- `src/features/shipping/api/calculate.test.ts` (dívida do PRD-033 — hoje sem testes)
- `src/features/quotes/hooks/useShippingQuote.ts`
- `src/routes/app.configuracoes.frete.callback.tsx` (ou query `?me_oauth=1` na rota de frete)
- `supabase/functions/melhor-envio-quote/index.ts`
- `supabase/functions/melhor-envio-oauth/index.ts`
- `docs/dev/melhor-envio-cotacao.md` (doc operacional + checklist de teste manual)

**Modificar:**
- `src/shared/types/shipping.ts` — `IMelhorEnvioConfig`, `IShippingQuoteOption/Result/Snapshot`; barrel `index.ts` se necessário.
- `src/shared/types/commercial.ts` — `shippingQuote?: IShippingQuoteSnapshot` em `IQuote` e `IOrder`.
- `src/features/shipping/config/defaults.ts` — bloco `melhorEnvio` (`enabled:false`).
- `src/features/shipping/pages/ShippingConfigPage.tsx` — seção "Melhor Envio" + OAuth + simulador real + renomear "Fallback por região".
- `src/features/quotes/components/new/QuoteEditor.tsx` — hook + `setShipping` + snapshot.
- `src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx` — UI de opções/fonte.
- `src/features/admin-settings/engine/integrationKeys.ts` (+ `integrationKeys.test.ts`) — grupo "Frete — Melhor Envio".
- `src/features/orders/api/createOrderFromQuote.ts` — copiar `shippingQuote`.
- (se persistir snapshot) provider supabase de quotes/orders + migration `add column shipping_quote jsonb` (espelhada em `supabase/migrations/`).

> Convenção: features acessam dados só via `@/providers/data`/`@/providers/shipping` e tipos via `@/shared/types`. Comentários em inglês; UI em pt-BR com acentos. Edge core runtime-agnostic (só Web APIs).

---

## Tasks

### A1 — Tipos + engine + testes (sem rede)
- [ ] Adicionar `IMelhorEnvioConfig`, `IShippingQuoteOption`, `IShippingQuoteResult`, `IShippingQuoteSnapshot`, `ShippingQuoteSource` em `src/shared/types/shipping.ts` (+ `melhorEnvio?` em `IShippingConfig`). Re-exportar no barrel.
- [ ] Default `melhorEnvio` (`enabled:false`) em `config/defaults.ts`.
- [ ] `engine/quoteEngine.ts`: `applyMarkup`, `selectCheapest`, `applyFreeShipping`, `buildQuoteResult`.
- [ ] `engine/quoteEngine.test.ts`: markup % e R$; mais barata; frete grátis no limite (`>=`); lista vazia; opções com `error` filtradas.
- [ ] `api/calculate.test.ts`: cobrir `calculateShipping` (match cidade/UF/multi-UF, fallback `to_negotiate`/`fixed_value`, peso) — vira o fallback oficial.
- [ ] **Gate:** `bun run test` verde.

### A2 — Edge Functions + Vault
- [ ] `integrationKeys.ts`: grupo "Frete — Melhor Envio" (`MELHOR_ENVIO_CLIENT_ID`/`CLIENT_SECRET`/`REDIRECT_URI`/`USER_AGENT`) + atualizar `integrationKeys.test.ts`.
- [ ] `supabase/functions/melhor-envio-oauth/index.ts`: `authorize-url` | `exchange` | `status` | `disconnect` (Owner-only); grava tokens via RPC `integration_secret_set`; audita.
- [ ] `supabase/functions/melhor-envio-quote/index.ts`: resolve secrets, inert-mode, refresh proativo/reativo (401), monta `package`, chama `/calculate`, normaliza, audita `integration_logs`, retorna `{ options }`.
- [ ] Deploy sandbox: `npx supabase functions deploy melhor-envio-quote melhor-envio-oauth --project-ref njizaasajkdqptlxddqn`.
- [ ] Validar `status`/`exchange` manualmente (após o dono cadastrar o app sandbox + redirect_uri).

### A3 — Camada provider (mock + edge)
- [ ] `IShippingQuoteProvider.ts` + `types.ts` (`IShippingQuoteInput`).
- [ ] `mock/MockShippingQuoteProvider.ts` (determinístico por CEP+peso; 2–3 opções).
- [ ] `edge/EdgeShippingQuoteProvider.ts` (`functions.invoke("melhor-envio-quote")`; `{scaffold:true}` → `[]`).
- [ ] `factory.ts` (seleção por `VITE_DATA_SOURCE`) + `index.ts` barrel.

### A4 — Hook + orçamento
- [ ] `useShippingQuote.ts`: debounce ~700ms; pré-condições; provider → `buildQuoteResult`; fallback `calculateShipping`. Retorna `{ loading, result, refetch }`.
- [ ] `QuoteEditor.tsx`: instanciar o hook; `setShipping(result.value)` + snapshot; `handleCalcShipping` = refetch manual; preservar override; passar `shippingQuote` ao `provider.create`.
- [ ] `QuoteSummaryPanel.tsx`: estender props; badge de fonte + opção selecionada + spinner + popover de troca (modos `compact` e normal).
- [ ] **Verificar em `VITE_DATA_SOURCE=mock`:** frete automático via mock, troca de opção, markup e frete grátis refletindo; `enabled:false` ⇒ comportamento PRD-033 intacto.

### A5 — UI de configuração + OAuth
- [ ] `ShippingConfigPage.tsx`: seção "Melhor Envio" — conexão (status + Conectar/Reconectar/Desconectar), toggle ativar, ambiente, CEP origem, caixa padrão, serviços habilitados, markup, frete grátis; atalho p/ Chaves; renomear regras → "Fallback por região".
- [ ] Callback OAuth (`app.configuracoes.frete.callback.tsx` ou query): lê `code`+`state`, valida `state` (sessionStorage), chama `exchange`, toast, volta.
- [ ] Simulador passa a cotar de verdade (hook/edge) com fallback visível.

### A6 — Snapshot no pedido + docs + verificação
- [ ] `commercial.ts`: `shippingQuote?` em `IQuote`/`IOrder`; `createOrderFromQuote.ts` copia. (Se persistir: migration `shipping_quote jsonb` + mapper supabase, espelhada em `supabase/migrations/`. Senão, gravar texto em `carrier` e adiar jsonb p/ Fase B.)
- [ ] `docs/dev/melhor-envio-cotacao.md`: visão geral, secrets, fluxo OAuth, runbook de rotação/reconexão, **checklist de teste manual** (para o dono).
- [ ] Version bump MINOR (codinome `Freight`) + `CHANGELOG.md` + tag, via skill `versionamento`.

---

## Verification

- **Automatizada (gate de CI):** `bun run test` (engine de cotação + `calculate` + catálogo de chaves) e `bun run build` (Vite). `bunx tsc --noEmit` avaliado **por delta** dos arquivos novos (baseline pré-existente ~315 erros — ver memória `tsc baseline errors`).
- **Mock (sem credenciais):** `VITE_DATA_SOURCE=mock` → orçamento com cliente que tem CEP → frete automático via mock; trocar opção; ajustar markup/frete grátis; desligar `melhorEnvio.enabled` ⇒ PRD-033 intacto.
- **e2e sandbox (gated em credenciais — análogo ao WhatsApp):** dono cria conta + app sandbox no ME e cadastra `redirect_uri`. Então: tela de Frete → Conectar (OAuth) → "Conectado"; cotar CEP coberto (Correios/Jadlog) → opções reais; CEP/cenário sem cobertura → fallback regras; simular expiração → validar refresh; conferir `integration_logs`.
- **Teste manual de UI** fica com o dono (preferência registrada) — entregar via checklist no `docs/dev/melhor-envio-cotacao.md`; **não** abrir browser/preview pelo agente.

## Out of scope (épico — ciclos próprios)

- **Fase B — Compra/etiqueta:** carrinho → checkout → geração/impressão de etiqueta, saldo da conta ME, declaração de conteúdo. Reusa o snapshot. Novos scopes.
- **Fase C — Rastreamento:** `/me/shipment/tracking` (polling) ou webhook; timeline na ficha do pedido; notificação ao cliente.
