# WhatsApp — Fotos de perfil dos contatos (avatares)

> **Status:** entregue e em produção (branch `fix/contact-avatars`, ainda **não mergeada** na `main` no momento desta escrita — 2026-06-13).
> **Codinome sugerido p/ release:** a definir no versionamento.
> **Pendência aberta:** 1 contato específico cuja foto não é resolvida pela Evolution — ver [§7](#7-pendência-aberta-contato-com-fetchprofilepictureurl--null) e a issue de rastreio.

Exibe a foto de perfil do WhatsApp de cada contato na caixa de entrada de Conversas (lista + cabeçalho), com três formas de obtê-la (lote manual, automática no webhook, manual por contato) e um fallback visual robusto quando não há foto.

---

## 1. Visão geral do fluxo

```
WhatsApp (Evolution)  ──fetchProfilePictureUrl──►  URL temporária (pps.whatsapp.net)
        │                                                   │
        │                                            download bytes
        ▼                                                   ▼
  customers.avatar_url  ◄──getPublicUrl──  Storage bucket público `avatars/<storeId>/<customerId>.jpg`
        │
        ▼
  ICustomer.avatarUrl  ──►  ContactAvatar (AvatarImage)  ──►  lista + cabeçalho da conversa
```

- **Bucket `avatars`** — PÚBLICO (URL de CDN, sem assinatura). Escolhido pela escala (754 contatos): URLs assinadas seriam caras/frágeis. Contraste com `whatsapp-media` (privado, signed URL).
- **Idempotência** — `customers.avatar_synced_at` é a chave: `NULL` = nunca tentado. Carimbado em toda tentativa (com ou sem foto), então um re-run do lote nunca re-tenta o que já passou.
- **Caminho estável no Storage** — `<storeId>/<customerId>.jpg`. Como o caminho é fixo por contato, uma foto trocada geraria a mesma URL e o navegador serviria do cache → por isso o **cache-buster `?v=<timestamp>`** na `avatar_url` gravada.

---

## 2. Esquema de dados

Migration `supabase/migrations/20260613001730_add_customers_avatar.sql` (aplicada via MCP e espelhada no Git):

```sql
alter table public.customers
  add column if not exists avatar_url text,
  add column if not exists avatar_synced_at timestamptz;
```

- `avatar_url` — URL pública da foto (bucket `avatars`), com cache-buster `?v=`. `NULL` = sem foto/privada.
- `avatar_synced_at` — última tentativa de sync para o contato. `NULL` = nunca tentado (idempotência do lote).

Tipo de domínio: `ICustomerBase.avatarUrl?: string` (`src/shared/types/customer.ts`). Mapeado no provider Supabase (`src/providers/data/impl/supabase/customers.ts`): coluna em `COLUMNS`, `CustomerRow.avatar_url`, e `rowToCustomerBase` → `avatarUrl: row.avatar_url ?? undefined`.

---

## 3. Camada Evolution — busca da foto

`src/providers/whatsapp/evolution/instance.ts` → `fetchProfilePictureUrl(apiKey, deps, target, number, traceId?)`:

- `POST /chat/fetchProfilePictureUrl/{instance}` com `{ number }` (number = E.164 sem o `+`).
- Lê `body.profilePictureUrl ?? body.profilePicUrl` (a Evolution v2 retorna **`profilePictureUrl`** — palavra completa; ver [§6](#6-bug-corrigido-nome-do-campo-da-evolution)).
- Best-effort: qualquer não-2xx / erro de rede / shape desconhecido → `null` (um sync em massa nunca aborta por um contato).

> Camada **runtime-agnostic** (`src/providers/whatsapp/`): só Web APIs + imports relativos. Espelhada em `supabase/functions/_shared/whatsapp/` via `bun run scripts/sync-whatsapp-shared.ts`. **Regra:** mudou a camada ⇒ rodar o sync + redeployar as edges que a usam (`whatsapp-avatar-sync`, `whatsapp-webhook`).

---

## 4. Helper compartilhado — `syncContactAvatar`

`supabase/functions/_shared/avatar.ts` — fonte única de verdade para os três consumidores (lote, webhook, botão por contato). Deno-específico (usa `SupabaseClient` + Storage), por isso vive em `_shared/` (fora de `_shared/whatsapp/`, que é o espelho runtime-agnostic).

```
syncContactAvatar(admin, deps, target, apiKey, { id, phone, storeId }, { traceId, warn? })
  → "with-photo" | "without-photo" | "failed"
```

Fluxo: `toE164(phone)` → valida `E164_REGEX` → `wire = e164.slice(1)` → `fetchProfilePictureUrl` → se URL: `fetch(url)` → upload bytes em `avatars/<storeId>/<customerId>.jpg` (`upsert:true`) → `getPublicUrl` + **cache-buster `?v=Date.now()`** → grava `avatar_url` + `avatar_synced_at`. Sempre carimba `avatar_synced_at` (mesmo sem foto). **Nunca lança** — o webhook pode disparar fire-and-forget com segurança.

---

## 5. Os três modos de sincronização

### 5.1 Lote manual (Configurações → WhatsApp)
- Edge `supabase/functions/whatsapp-avatar-sync/index.ts`, **owner-only** (`BATCH_ROLES = ["owner"]`).
- `POST { accountId, limit? }` → drena contatos pendentes (`avatar_synced_at IS NULL`, `phone NOT NULL`) em páginas de até 50.
- Resposta `{ processed, withPhoto, withoutPhoto, failed, done, traceId }`. O cliente (`src/features/admin-settings/api/whatsappAvatarSync.ts → runAvatarSync`) repete até `done`.
- UI: `SyncAvatarsDialog` + botão "Sincronizar fotos" em `WhatsAppAccountsPage` (`!isMock`, conta `connected`).
- **Resultado do 1º run real:** 754 processados → **514 com foto, 240 sem**.

### 5.2 Automática no webhook (contato novo)
- Quando um inbound (ou um echo de envio do celular) **cria** um contato, o webhook busca a foto em **segundo plano**.
- `src/providers/whatsapp/webhook/core.ts`: callback opcional `onCustomerAutoCreated?({ customerId, phone, account })`, disparado em ambos os caminhos de criação (inbound RF-040 e outbound-echo), **fire-and-forget** (nunca aguardado, nunca lança).
- `supabase/functions/whatsapp-webhook/index.ts`: `scheduleAvatarFetch(...)` resolve apiKey/target da conta Evolution e roda `syncContactAvatar` via `EdgeRuntime.waitUntil` (mantém o 200 instantâneo do webhook fail-closed). Só contas Evolution.

### 5.3 Manual por contato (menu kebab da conversa)
- Item **"Atualizar foto do contato"** no menu de 3 pontinhos (`src/features/conversations/components/ConversationMenu.tsx`).
- Re-tenta **somente aquele contato**, **forçado** (re-tenta mesmo já carimbado) — é o retry explícito do usuário (ex.: o fetch automático veio cedo demais com `null`).
- Edge ganha param opcional `customerId` → **modo single**: busca o contato (`eq id`, `eq store_id`), `done: true`. Autorizado para `SINGLE_CONTACT_ROLES = ["owner","manager","seller_internal","seller_external"]`; o lote segue owner-only (o papel é escolhido a partir do corpo **antes** do `requireCaller`).
- Cliente: `runContactAvatarSync(accountId, customerId)` → `"with-photo" | "without-photo" | "failed"`.
- Feedback (toasts): sucesso `photoUpdated` + refresh do detalhe (`onMutated`); `photoUnavailable` (info, sem foto pública); `photoSyncFailed` (erro).
- Visível só em conversa WhatsApp com `customer` e `conversation.whatsappAccountId`; oculto em modo demonstração.

---

## 6. Fallback visual — `ContactAvatar`

`src/features/conversations/components/ContactAvatar.tsx` (usado na lista e no cabeçalho):

- Renderiza `AvatarImage` quando há `avatarUrl`; o Radix cai sozinho no `AvatarFallback` se a imagem faltar/falhar.
- Fallback: **ícone de pessoa** (`mdi:account`) para contatos que são só número (`isPhoneLikeName` em `src/shared/utils/avatar.ts`) — elimina o inútil `"+5"` — ou **iniciais reais** para nomes. Cor de fundo estável por hash do id.
- `IConversationDisplay` (`conversationDisplay.ts`) ganhou `avatarUrl?` e `isPhoneName: boolean`.

---

## 6b. Bug corrigido — nome do campo da Evolution

No 1º teste real, **0 fotos** foram encontradas em 754 contatos. Diagnóstico via `integration_logs`: a Evolution responde `"profilePictureUrl"` (palavra completa), mas o código lia `body.profilePicUrl`. Corrigido para `body.profilePictureUrl ?? body.profilePicUrl`. Após re-armar os 754 (`avatar_synced_at = NULL`) e re-deployar, vieram as 514 fotos.

---

## 7. Pendência aberta — contato com `fetchProfilePictureUrl` = null

**Sintoma:** o contato `+55 54 8116-9884` (`555481169884`) não recebe foto, apesar de o dono afirmar que o perfil é **público**.

**Investigação (2026-06-13):**
- A query foi disparada 3× ao longo de ~7 min (botão manual + automática) — sempre `HTTP 200` com `profilePictureUrl: null`. **Timing descartado.**
- **Hipótese do "nono dígito" REFUTADA pelos dados:** a distribuição por nº de dígitos mostra que **466 contatos de 12 dígitos** (mesmo formato, sem o nono dígito) **têm** foto. Logo o formato do número não é a causa.

  | bucket | 11 díg | 12 díg | 13 díg |
  |---|---|---|---|
  | com foto | 1 | 466 | 47 |
  | sem foto | 69 | 151 | 20 |

- **Causa provável:** a query **ao vivo** da Evolution (`profilePictureUrl(jid,'image')` no Baileys, resolução cheia) falha pontualmente para esse contato, enquanto funciona para centenas de outros. A miniatura que o Baileys captura na sincronização **não** é consultada por esse endpoint.

**Próximo passo proposto (NÃO implementado):** fallback em cache de contatos da instância — quando a query direta vier `null`, consultar `POST /chat/findContacts/{instance}` com `where: { id: "<jid>" }` e ler o `profilePicUrl` cacheado. Encadear dentro de `fetchProfilePictureUrl` (ganho automático p/ lote, webhook e botão). Requer sync + redeploy de `whatsapp-avatar-sync` e `whatsapp-webhook`.

**Teste decisivo que desambigua antes de codar (1 min, sem código):** abrir a conversa com esse número **no celular da conta GALLO** (a conectada na Evolution, instância `Agent-GALLO-R9-B1`):
- foto **não aparece** lá → é privacidade/sem-foto real; o fallback não ajuda;
- foto **aparece** → é a query ao vivo falhando; o fallback `findContacts` deve resolver.

> **Limitação geral conhecida:** uma foto **trocada** pelo contato após o sync não atualiza sozinha (o registro já está carimbado). O botão "Atualizar foto do contato" + o cache-buster cobrem o caso quando o usuário aciona manualmente; um refresh periódico automático dependeria de habilitar `pg_net` (não habilitado neste projeto).

---

## 8. Deploys e estado

- **Edges em produção (project `njizaasajkdqptlxddqn`):** `whatsapp-avatar-sync` e `whatsapp-webhook` deployadas com todo o acima.
- **Bucket `avatars`:** público.
- **Branch `fix/contact-avatars`** (commits: áudio → feature de avatares → fix do campo → gatilho automático no webhook → botão por contato no kebab). **Merge na `main` pendente de decisão do dono.**

## 9. Arquivos relevantes

| Camada | Arquivo |
|---|---|
| Migration | `supabase/migrations/20260613001730_add_customers_avatar.sql` |
| Tipo | `src/shared/types/customer.ts` (`avatarUrl`) |
| Provider | `src/providers/data/impl/supabase/customers.ts` |
| Engine Evolution | `src/providers/whatsapp/evolution/instance.ts` (`fetchProfilePictureUrl`) |
| Helper compartilhado | `supabase/functions/_shared/avatar.ts` (`syncContactAvatar`) |
| Edge sync | `supabase/functions/whatsapp-avatar-sync/index.ts` (lote + single) |
| Webhook (gatilho auto) | `supabase/functions/whatsapp-webhook/index.ts` + `src/providers/whatsapp/webhook/core.ts` |
| Cliente | `src/features/admin-settings/api/whatsappAvatarSync.ts` |
| UI lote | `src/features/admin-settings/.../SyncAvatarsDialog.tsx`, `WhatsAppAccountsPage.tsx` |
| UI por contato | `src/features/conversations/components/ConversationMenu.tsx` |
| Fallback visual | `src/features/conversations/components/ContactAvatar.tsx`, `utils/conversationDisplay.ts`, `src/shared/utils/avatar.ts` |
