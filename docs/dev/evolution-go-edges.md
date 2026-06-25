# Evolution Go — Edge Deploy & e2e Smoke Runbook

> **Status:** Phase 2 complete — awaiting owner approval to deploy + smoke.
> **Project ref:** `njizaasajkdqptlxddqn`
> **Runbook author:** AILA / Task 6 (2026-06-25)

---

## (a) Deploy Order — todas as três edges juntas

As três edges compartilham o mirror `supabase/functions/_shared/whatsapp/`, por isso **todas devem ser redeployadas juntas** — mesmo que só uma tenha mudanças visíveis no `index.ts`.

### 1. `whatsapp-webhook` — deploy sem verificação de JWT (webhook público)

```bash
npx supabase functions deploy whatsapp-webhook \
  --project-ref njizaasajkdqptlxddqn \
  --no-verify-jwt
```

Alternativa via MCP Supabase:
```
deploy_edge_function(name="whatsapp-webhook", verify_jwt=false)
```

Nova rota Evolution Go aceita:
```
POST /functions/v1/whatsapp-webhook/evolution-go
```

### 2. `whatsapp-connect` — JWT verificado (chamada autenticada pelo app)

```bash
npx supabase functions deploy whatsapp-connect \
  --project-ref njizaasajkdqptlxddqn
```

Alternativa via MCP:
```
deploy_edge_function(name="whatsapp-connect")
```

### 3. `whatsapp-send` — JWT verificado

```bash
npx supabase functions deploy whatsapp-send \
  --project-ref njizaasajkdqptlxddqn
```

Alternativa via MCP:
```
deploy_edge_function(name="whatsapp-send")
```

> **Por que redeploy do `whatsapp-send`?** A union de `provider` foi alargada para incluir `"evolution-go"` em `_shared/whatsapp/send/core.ts` e `_shared/whatsapp/whatsappSendAdapter.ts`. O failover matrix já cobre `evolution-go` (template → non-meta retorna `FAILOVER_INCOMPATIBLE`).

---

## (b) Pré-requisitos do Dono — configuração one-time antes do pareamento

### 1. Salvar a chave global do servidor Evolution Go no Vault

Acesse **Configurações → Integrações → Chaves & API** e salve:

| Campo | Valor |
|---|---|
| Nome | `{CREDENTIALS_REF}_API_KEY` |
| Valor | A GLOBAL API key do servidor `evogo.ailainteligente.com.br` (a chave do painel do servidor, não por instância) |

> O `CREDENTIALS_REF` deve ser `UPPERCASE`, pattern `^[A-Z][A-Z0-9_]{2,64}$`, ex.: `WA_GALLO_GO`.
> Esta chave é usada APENAS para criar instâncias (`/instance/create`) — chamada só pelo edge durante o primeiro pareamento (`qr` action). NÃO é a chave de envio/recepção.

### 2. Criar a linha em `whatsapp_accounts`

Inserir via Supabase Dashboard ou SQL:

```sql
INSERT INTO public.whatsapp_accounts (
  store_id,
  provider,
  label,
  credentials_ref,
  provider_config,
  status
) VALUES (
  '<store_uuid>',
  'evolution-go',
  'Número Principal (Evolution Go)',
  'WA_GALLO_GO',                          -- MAIÚSCULO, igual ao prefixo da chave no Vault
  '{"baseUrl": "https://evogo.ailainteligente.com.br", "instanceId": ""}'::jsonb,
  'disconnected'
);
```

> **ATENÇÃO — check constraint:** A migration `20260625120000` requer que `provider_config` contenha **AMBOS** `baseUrl` E `instanceId` para o provider `evolution-go` (ou que seja `NULL`). Por isso o INSERT acima já inclui o placeholder `"instanceId": ""`: o operador `?` do jsonb testa **existência da chave**, não o valor, então `"instanceId": ""` satisfaz a constraint. O fluxo `qr` da edge trata o valor vazio como "instância ainda não criada" (`if (!instanceId)`), chama `/instance/create`, captura o `instanceId` real e sobrescreve o `provider_config` automaticamente.
>
> **Alternativa:** inserir com `provider_config = NULL` (a constraint também aceita `provider_config IS NULL`) e deixar o `qr` preencher tudo — mas o placeholder acima é o caminho recomendado por ser um único INSERT copy-paste válido.

### 3. Token da instância (`{CREDENTIALS_REF}_INSTANCE_TOKEN`)

**NÃO provisionar manualmente.** O token é:
1. Capturado automaticamente pela resposta de `/instance/create` no primeiro `qr`.
2. Gravado no Vault pelo edge via `integration_secret_set`.
3. Usado como `apikey` em TODAS as chamadas da instância (send/status/connect/qr/logout/restart/delete) e como gate de autenticação do webhook.

---

## (c) Roteiro de Smoke e2e

> Este smoke valida os critérios de aceitação da spec §9 **e resolve os 2 contratos ainda abertos** da Fase 2.
> Capturar logs via **Supabase Dashboard → Logs → Edge Functions** (filtrar por `whatsapp-webhook` e `whatsapp-connect`).

### Smoke 1 — Pareamento / Scan QR

1. Abrir **Configurações → WhatsApp** no app.
2. Selecionar/abrir a conta `evolution-go` recém-criada → clicar **Conectar**.
3. A edge `whatsapp-connect` (action `qr`) deve:
   - Ler a chave global `WA_GALLO_GO_API_KEY` do Vault.
   - Chamar `/instance/create` → capturar `instanceId` + `instanceToken`.
   - Gravar `instanceId` em `provider_config`.
   - Gravar `instanceToken` no Vault como `WA_GALLO_GO_INSTANCE_TOKEN`.
   - Chamar `/instance/connect` (webhook apontando para `.../whatsapp-webhook/evolution-go` + `EVOLUTION_GO_DEFAULT_SUBSCRIBE`).
   - Retornar o QR ou `state: open`.
4. Escanear o QR com o celular.
5. Confirmar que o status da conta vira **"connected"** na tela.

**Confirma:** create → token → Vault → connect → QR → status flip.

---

### Smoke 2 — Mensagem Inbound (texto)

1. De um celular externo, enviar uma mensagem de texto para o número pareado.
2. Confirmar que a mensagem aparece na **Inbox** com o contato correto.

**Confirma:** rota `POST /whatsapp-webhook/evolution-go` → gate de `instanceToken` → parser `parseEvolutionGoInbound` (event `Message`, PascalCase) → resolução de conta por `instanceId`.

**Investigar durante este smoke — OPEN CONTRACT #2 (shape do webhook):**

Durante o recebimento, capturar o payload raw nos logs da edge (ou em `public.integration_logs`). Verificar:
- O evento usa PascalCase: `{ event: "Message", data: { Info: { Chat, Sender, IsFromMe, PushName, ID, Timestamp }, Message: {...} } }` — se for camelCase ou estrutura diferente, o parser precisará de ajuste pontual.
- **Onde o `instanceToken` aparece no payload:** o gate lê `payload.instanceToken` (campo top-level). Se o Go server coloca o token em outra posição (ex.: header `Authorization`), identificar e corrigir a extração na linha:
  ```ts
  // whatsapp-webhook/index.ts ~linha 581
  const token = (payload as { instanceToken?: string } | null)?.instanceToken ?? "";
  ```
- O `instanceId` lido para resolução de conta também é top-level: `(payload as { instanceId?: string } | null)?.instanceId`.

---

### Smoke 3 — Mensagem Outbound (texto)

1. No app, abrir a conversa do contato do Smoke 2.
2. Digitar uma resposta e enviar.
3. Confirmar que a mensagem aparece com badge de status correto (`sent` → `delivered` → `read`).

**Confirma:** `whatsapp-send` → `EvolutionGoProvider.sendText` → delivery status via Realtime.

---

### Smoke 4 — Mídia Inbound (imagem ou áudio) — **OPEN CONTRACT #1**

1. Do celular externo, enviar uma imagem (ou áudio) para o número pareado.
2. Confirmar que a mídia renderiza na conversa (balão de imagem/áudio com player).

**Este smoke RESOLVE o Open Contract #1 — corpo do `/message/downloadimage`:**

O provider envia `mediaKey` como **string base64** (valor entregue pelo webhook). O código atual:
```ts
// EvolutionGoProvider.ts — downloadInboundMedia
json: {
  url: ref.url,
  directPath: ref.directPath,
  mediaKey: ref.mediaKey,      // base64 string
  fileEncSHA256: ref.fileEncSHA256,
  fileSHA256: ref.fileSHA256,
  fileLength: ref.fileLength,
  mimetype: ref.mimetype,
}
```

**Se a mídia falhar:** checar `integration_logs` ou os logs da edge. O servidor Go pode esperar `mediaKey` como `[]int` (array de bytes) em vez de string base64. Se for o caso, o fix é uma linha em `EvolutionGoProvider.downloadInboundMedia`:
```ts
// Antes: mediaKey: ref.mediaKey  (string base64)
// Depois (se o servidor espera []int):
mediaKey: ref.mediaKey ? Array.from(base64ToBytes(ref.mediaKey)) : undefined,
```
`EvolutionGoProvider.downloadInboundMedia` roda no caminho **inbound**, executado pela edge `whatsapp-webhook` (não `whatsapp-send`, que é só outbound). Aplicar o fix e redeployar `whatsapp-webhook`; como as 3 edges compartilham o mirror `_shared/`, vale a regra da §a — redeployar as três juntas. Retestar.

---

### Smoke 5 — Idempotência do Re-pareamento (Smoke Item do Task 4 Review)

1. Com a instância já **conectada** (após Smoke 1), abrir novamente o fluxo de conexão no app.
2. Clicar em **Conectar** de novo (re-`qr` de conta já pareada).
3. Comportamento esperado:
   - A edge lê `instanceId` existente (não chama `/instance/create`).
   - Chama `/instance/connect` novamente (configura webhook).
   - Chama `/instance/qr`: se o Go server retornar `state: open` (já conectado), a edge retorna `{ state: "open" }` e o app exibe "conectado" — **OK**.
   - **Risco:** se o Go server rejeitar `/instance/connect` com erro quando já conectado (ex.: 409/400), a edge vai lançar exceção. Neste caso, o fix é adicionar um guard antes de `connectGoInstance`:
     ```ts
     // whatsapp-connect/index.ts — qr action, antes do connectGoInstance
     const currentStatus = await getGoInstanceStatus(instanceToken, deps, goTarget, ctx.traceId);
     if (!currentStatus.connected) {
       await connectGoInstance(...);
     }
     ```
   Documentar o comportamento real observado.

---

### Smoke 6 — Controles de Ciclo de Vida (test-message / logout / restart / delete)

1. **test-message:** Usar o botão "Enviar mensagem de teste" na tela de configuração da conta — confirmar que chegou no celular.
2. **logout:** Clicar em **Desconectar** — confirmar que o status vira `disconnected`.
3. **restart:** Clicar em **Reiniciar** — confirmar que a instância reconecta.
4. **delete:** Excluir a conta (kebab ⋮ → Excluir) — confirmar que a instância é removida no servidor Go e a linha é deletada do banco.

---

## (d) Deferrals Conhecidos — Fase 3

Os itens abaixo **não bloqueiam o smoke** e serão tratados na Fase 3:

| Item | Detalhe |
|---|---|
| Avatar de contato (Go) | `scheduleAvatarFetch` declina `evolution-go` (sem endpoint Go de avatar). Os contatos ficam com o fallback de iniciais. |
| Captura de número próprio no connect | O `phone_number` da conta Evolution Go não é populado no pareamento (diferente do Evolution v2, que busca o ownerJid). O campo fica vazio. O self-heal `backfillMissingProfile` (PR #161) só cobre Evolution v2. |
| Webhook `Connection` lifecycle server-side | A mudança de status via evento `Connection` do Go server é processada no webhook core, mas a atualização de `whatsapp_accounts.status` em tempo real (Realtime) não está wired para Go — segue via `whatsapp-connect` action `state`. |

---

## Checklist de Verificação Pós-Deploy

Após os 6 smokes:

- [ ] Smoke 1: QR gerado, conta `connected` no banco
- [ ] Smoke 2: Mensagem inbound na Inbox (shape do webhook confirmada — Contract #2 resolvido)
- [ ] Smoke 3: Outbound com status badge
- [ ] Smoke 4: Mídia renderiza (Contract #1 resolvido; se falhou, fix documentado e aplicado)
- [ ] Smoke 5: Re-connect idempotente (comportamento anotado; fix aplicado se necessário)
- [ ] Smoke 6: Lifecycle completo (test/logout/restart/delete)
- [ ] `integration_logs` sem erros inesperados
- [ ] Nenhum `FAILOVER_INCOMPATIBLE` espúrio em `integration_logs`

> Após smoke verde, atualizar a linha de pendências em `docs/fase2-pendencias.md` e marcar o PR como pronto para merge.
