# WAHA — Card de instância rico + Parâmetros de sessão — Design

> **Status:** aprovado para plano (2026-07-10) · **Escopo:** aba Configurações → WhatsApp → WAHA
> **Continuação de:** `docs/superpowers/specs/2026-07-10-waha-whatsapp-integration-design.md` (integração base, PR #265)
> **Apoio de design:** crítica do agente `design-specialist` + comparação visual (3 modelos no visual companion) — modelo escolhido: **Espelho fiel** (Opção 1).

**Goal:** Elevar o card de sessão WAHA (hoje um `<li>` minimalista) a um card rico espelhado no card Meta/Evolution — com acesso, status/saúde, cor, métricas e ações — e expor os parâmetros úteis da sessão WAHA (filtros de chat, debug, proxy, dispositivo) num wizard "Avançado" + diálogo editável, mantendo webhooks gerenciados pela plataforma.

**Arquitetura (resumo):** As sessões WAHA já são linhas `whatsapp_accounts` (`provider='waha'`) completas. O card reaproveita `useWhatsAppAccountsProvider` para acesso/métricas/cor (via `get`/`getMetrics`/`getAccessRules`/`update`, que não filtram por provider) e um novo método aditivo `listWaha`, sem tocar no `list()` genérico que exclui WAHA de propósito. O ciclo de vida (qr/state/restart/logout/delete) e a nova gravação de config seguem 100% pelo Edge `waha-connect`. Nenhuma migration — a config nova vive em `provider_config` (jsonb).

**Tech stack:** React 19 + TanStack, shadcn/ui, Tailwind v4 (tokens semânticos diesel-dark), provider pattern, Edge Function Deno + engine `waha/*` espelhado em `_shared/`.

---

## Global Constraints

- **Tokens semânticos apenas** (`bg-card`, `text-foreground`, `border-border`, `text-primary`, `text-severity-{success|warning|critical}`) — nunca hex nem `--gallo-*` (PRD-001 / ux-guidelines §5). Corrigir os `bg-emerald-500/10`/`text-emerald-600` crus do card atual.
- **pt-BR com acentuação correta** em toda UI; comentários/código em inglês.
- **Motion** sempre `motion-safe:`/`motion-reduce:transition-none`; decorativos `aria-hidden`; controles com `aria-label` pt-BR.
- **Sem migration** e **sem tocar** no `whatsappAccounts.list()` (load-bearing: Contas, filtro da Inbox, connection status) nem no cache/realtime do Atendimento.
- **Engine `src/providers/whatsapp/waha/**` é runtime-agnostic** (só Web APIs + imports relativos); toda mudança lá roda `bun run scripts/sync-whatsapp-shared.ts` e redeploy do `waha-connect`.
- **Isolamento WAHA preservado:** `waha-connect` não importa o pipeline compartilhado Meta/Evolution.
- **Não porta** do card antigo: failover, templates HSM, chips de capacidade — nenhum se aplica ao WAHA.

---

## 1. Estado atual (o que existe)

- **`WahaSection.tsx`** — card `<li>` minimalista: avatar, nome + finalidade, `telefone · sessão`, um badge de status, dropdown (Parear novamente [se `!== connected`] / Reiniciar / Logout / Excluir). Lê via `fetchWahaAccounts` (query direta `.eq("provider","waha")`), tipo parcial `IWahaAccountRow`. Já contém o `WahaQrPairingPane` reutilizável e o `WahaPairingDialog` (re-pareamento) + `WahaWizard`.
- **`WhatsAppAccountsPage.tsx`** — card rico de referência (Meta/Evolution): badges provider/status/health/failover/alertas, chips de capacidade, pill de acesso → `InstanceAccessSheet`, color picker `INSTANCE_PALETTE`, grid `<dl>`, ações, métricas 4-up, banner inline de reconexão.
- **Provider `whatsappAccounts` (supabase)** — `list()` faz `neq("provider","waha")` (exclui WAHA de propósito). `get(id)`/`getMetrics(id)`/`getAccessRules(id)`/`update(id,…)` **não** filtram por provider → válidos para linhas WAHA.
- **`InstanceAccessSheet`** — recebe `IWhatsAppAccount`, usa `provider.getAccessRules(id)`; **agnóstico de provider**.
- **Engine `waha/session.ts`** — `createWahaSession` monta só `config.webhooks`. Estados: `WORKING→connected`, `STOPPED|FAILED→disconnected`, `STARTING|SCAN_QR_CODE→pending` (`constants.ts`).
- **Edge `waha-connect`** — ações `create|ping|qr|state|logout|restart|delete`. Insere a linha com `provider_config: { sessionName }`.

---

## 2. Modelo escolhido: **Espelho fiel** (Opção 1) + 2 enxertos

Card irmão do card Meta/Evolution (consistência é regra dura — vivem na mesma tela, abas irmãs; cliente é loja única com poucos números). Enxertos da direção "console" só onde a realidade WAHA exige:

**Anatomia do card (topo→base), tudo à vista:**
1. **Header:** avatar (`aria-hidden`) + nome + pill de finalidade │ cluster direito = badge `WAHA` → status → saúde (derivada) → `Alertas silenciados` (condicional) → kebab (`Silenciar alertas` / `Excluir`).
2. **Pill de acesso** — `severity-warning` "Ninguém vê — configurar acesso" quando vazio, senão "N pessoas • configurar acesso" → abre `InstanceAccessSheet`.
3. **Color picker** — `INSTANCE_PALETTE` + swatch "auto", persistido em `provider_config.accentColor` (via `provider.update`), idêntico ao antigo.
4. **Divisor → grid `<dl>`** (Servidor WAHA / Sessão `mono` / Número) + ações: **Reconectar/Parear** (herói quando `!== connected`), **Reiniciar**, **Parâmetros**, **Editar**.
5. **Métricas 4-up** — Enviadas (30d) / Falhas (30d) / Taxa de falha / Último envio (`getMetrics`, decorativo, nunca bloqueia render).

**Enxerto 1 — status protagonista:** banner inline `role="alert"` (montado 1×/episódio) quando `disconnected` (`severity-critical`, CTA Reconectar herói) e quando `SCAN_QR_CODE` (`severity-warning`, "Aguardando leitura do QR" → abre `WahaPairingDialog`). Ler o **estado cru** da sessão (não só o mapeado) para separar `SCAN_QR_CODE` (acionável) de `STARTING` (passivo). Requer o `state` action retornar o estado bruto (hoje mapeia para `accountStatus`) — adicionar `rawState` ao retorno do `state`.

**Enxerto 2 — parâmetros num diálogo dedicado**, nunca na face do card.

**Punch-list herdado (aplicar):** matar tokens emerald; `p-4`→`p-5` + bandas `border-t` entre seções; empty-state com CTA "Nova sessão WAHA"; surfaçar `HAS_LINKED_DATA` inline (além do toast); linha "visto por último" (liveness, pois `WORKING` pode estar stale); guardas de motion/aria.

---

## 3. Parâmetros de sessão

**Escopo (decisão do dono — "úteis + webhooks travados"):**

| Grupo | Controle | Default | Observação |
|---|---|---|---|
| Tipos de conversa | Grupos / Status / Canais / Broadcast (toggles) | **todos OFF** (só 1:1) | Higiene da Inbox comercial |
| Depuração | Debug (toggle) | OFF | Troubleshooting |
| Proxy | server/username/password (aninhado) | OFF/vazio | Avançado |
| Dispositivo | Nome do aparelho / navegador | — | **Read-only + aviso amber** no GOWS (aplica via env, não por sessão — fiel ao painel WAHA) |
| Webhooks/HMAC | URL + HMAC | — | **Read-only** "Gerenciado pela plataforma" |
| Metadata / Engine store | — | — | **Fora de escopo** (não exibir) |

**Onde:**
- **Wizard `WahaWizard`** — nova seção **"Avançado"** colapsada (default fechada) abaixo de Nome/Finalidade/Servidor. Happy-path continua 3 campos.
- **Card** — botão **"Parâmetros"** abre `WahaParamsDialog` com o mesmo form.

**UX de "exige reiniciar":**
- Nota persistente `severity-info`: "Alterar parâmetros exige reiniciar a sessão — há uma breve desconexão, mas o pareamento é preservado (não será preciso ler o QR de novo)."
- Botão primário **"Salvar e reiniciar"** (nunca "Salvar" pelado).
- Ao salvar: toast "Parâmetros salvos — reiniciando…"; `status` otimista → `pending`; o poll existente (`state`) reconcilia. **Não** reabrir QR automaticamente; só se o `state` cair em `SCAN_QR_CODE` (auth perdida).

---

## 4. Modelo de dados

Config nova em `provider_config` (jsonb, sem migration), tipada:

```ts
// src/shared/types/conversation.ts (junto de IWhatsAppProviderConfig)
export interface IWahaSessionConfig {
  chatFilters: { groups: boolean; status: boolean; channels: boolean; broadcast: boolean };
  debug: boolean;
  proxy?: { server: string; username?: string; password?: string };
  device?: { name?: string; browser?: string }; // no-op em GOWS; exibido read-only
}
// IWhatsAppProviderConfig ganha:  waha?: IWahaSessionConfig
```

`provider_config` da linha WAHA passa a ser `{ sessionName, accentColor?, waha?: IWahaSessionConfig }`. Ausência de `waha` ⇒ defaults (todos OFF / debug OFF).

---

## 5. Backend (engine + edge)

**Engine `src/providers/whatsapp/waha/session.ts`** (+ mirror `_shared/…`):
- **`createWahaSession`** ganha um parâmetro `sessionConfig?: IWahaSessionConfig` e monta o `config` da WAHA a partir dele — além dos `webhooks` já existentes: `debug` (bool), `proxy` (quando preenchido), e os filtros de chat. ⚠️ **As chaves JSON exatas dos filtros de chat no engine GOWS serão fixadas no plano** contra o swagger do servidor-alvo (`GET /{base}/api/server/version` + `/swagger`); `debug`/`proxy` são campos WAHA documentados. Knobs sem mapeamento confiável degradam (persistidos em `provider_config` para exibição, mas não enviados até confirmação).
- **`updateWahaSessionConfig(apiKey, fetchFn, target, sessionConfig)`** (novo): tenta `PUT /api/sessions/{name}` (atualiza config) e então `restart`. **Fallback** se `PUT` não existir nessa build: mecanismo **sem apagar a auth** (a decisão exata — ex.: update-via-`POST` idempotente ou stop+start com config nova sob o mesmo `sessionName`) é fixada no plano após checar a API (ver Riscos). Nunca `delete` (destruiria o pareamento). Retorna estado pós-restart.

**Edge `waha-connect`:**
- **`create`** aceita `sessionConfig` no body → passa a `createWahaSession` e grava em `provider_config.waha`.
- **`state`** passa a retornar `rawState` (estado bruto) além de `state`/`phoneNumber` (para o enxerto 1 distinguir `SCAN_QR_CODE`).
- Nova ação **`updateConfig`**: `{ accountId, action:'updateConfig', sessionConfig }` — grava `provider_config.waha` (merge), chama `updateWahaSessionConfig`, audita (`whatsapp_instance_config_updated`), retorna estado. Owner-only (já é).
- Atualizar o JSDoc de `Input` e `ACTIONS`.

**Provider `whatsappAccounts` (contract + mock + supabase):**
- Novo **`listWaha(params:{storeId:string}): Promise<IWhatsAppAccount[]>`** — supabase: mesmo `COLUMNS` + `.eq("provider","waha").eq("store_id",storeId).order(created_at)`; mock: filtra o store por `provider==='waha'`. Aditivo, não altera `list()`.

---

## 6. Frontend (arquivos)

- **`WahaSection.tsx`** — reescreve o corpo do row para o card rico (reusa badges/`<dl>`/métricas/color/access do padrão antigo, adaptado ao WAHA); usa `useWhatsAppAccountsProvider().listWaha()` + `getMetrics`/`getAccessRules`; mantém `invokeWaha` para ciclo de vida; adiciona `WahaParamsDialog`; adiciona seção "Avançado" no `WahaWizard`; adiciona banner de status (enxerto 1). Reaproveita `InstanceAccessSheet`, `INSTANCE_PALETTE`, `WahaPairingDialog`/`WahaQrPairingPane` já existentes.
- **`WahaParamsDialog`** (novo, mesmo arquivo ou co-localizado) — form agrupado (§3), "Salvar e reiniciar", nota `severity-info`, chama `invokeWaha({action:'updateConfig',…})`.
- **`accessRecipients`/`InstanceAccessSheet`** — reuso direto, sem mudança.

---

## 7. Fora de escopo (explícito)

Metadata, engine store settings, webhooks/HMAC editáveis, failover, templates HSM, chips de capacidade, detecção automática de engine por servidor (Dispositivo fica read-only com aviso genérico no v1).

---

## 8. Riscos & itens a fixar no plano

1. **Chaves do `config` WAHA para filtros de chat (GOWS):** verificar no swagger do servidor-alvo antes de enviar; sem confirmação, persistir mas não enviar (degrade com aviso). `debug`/`proxy` são seguros.
2. **`PUT /api/sessions/{name}` existe nessa build?** Se sim → update+restart; se não → stop/recreate preservando pareamento. Fixar após checar a API.
3. **Dispositivo em GOWS é no-op por sessão** → exibir read-only com aviso, não oferecer input que engana.
4. **`listWaha` no mock** deve refletir o mesmo shape para o modo demonstração não quebrar.

---

## 9. Estratégia de testes

- **Engine (Vitest, TDD):** `session.test.ts` ganha casos para `createWahaSession` com `sessionConfig` (monta `config.debug`/`proxy`/filtros conforme mapeamento fixado) e para `updateWahaSessionConfig` (endpoint correto + restart). Espelhar no `_shared` via sync.
- **Provider:** teste do `listWaha` mock (filtra por provider/store).
- **Gate prático:** `bun run build` + `bun run test` verdes; `bunx tsc --noEmit` avaliado por delta (baseline pré-existente). e2e real segue **gated** nas credenciais/servidor WAHA do dono (smoke manual).
- **Sync obrigatório:** `bun run scripts/sync-whatsapp-shared.ts` após mexer no engine + redeploy `waha-connect` (passo de rollout, com OK do dono).

---

## 10. Rollout

Migration: nenhuma. Deploy: **redeploy do `waha-connect`** (novas ações `updateConfig` + `create` com config + `state.rawState`) — Owner-gated, com OK do dono (memória: confirmar antes de deploy de edge em prod). Frontend via PR/push (nunca merge direto).
