# WhatsApp Evolution Go — Server Registry

> **Spec:** `docs/superpowers/specs/2026-06-26-whatsapp-go-server-registry-design.md`
> **Version:** v0.122.0 (see CHANGELOG)

---

## 1. O problema

Antes deste modelo, cada número Evolution Go criado pelo wizard gravava:
- `provider_config.baseUrl` — endpoint do servidor (mesmo para todos os números do mesmo servidor)
- `{credentials_ref}_API_KEY` — chave global do servidor no Vault (uma cópia idêntica por número)

A chave global é **do servidor**, não do número. Guardar uma cópia por conta gera:
- **Duplicação no Vault** (encontradas 8 cópias órfãs `WA_EVO_GO_TESTE_*_API_KEY`).
- **Rotação cara**: trocar a chave requer atualizar N segredos.
- **Lixo acumulado**: excluir uma conta não apagava o segredo.

O `{credentials_ref}_INSTANCE_TOKEN` (token por instância) é legítimo por-conta e permanece inalterado.

---

## 2. O modelo

### Tabela `whatsapp_go_servers`

Cadastro único de servidores Evolution Go (plataforma, Owner-only):

| coluna | tipo | descrição |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `name` | `text` NOT NULL UNIQUE | Nome amigável |
| `base_url` | `text` NOT NULL | Endpoint normalizado (sem barra final) |
| `api_key_ref` | `text` NOT NULL UNIQUE | Ponteiro para o segredo no Vault (padrão `^[A-Z][A-Z0-9_]{2,64}$`) |
| `created_at` / `updated_at` | `timestamptz` | auditoria |

A **chave** nunca vive na tabela — só o `api_key_ref` (nome do segredo). O valor real fica no Vault.

### FK em `whatsapp_accounts`

```sql
go_server_id uuid REFERENCES whatsapp_go_servers(id) ON DELETE RESTRICT
```

- Preenchido **apenas** em contas `evolution-go`.
- `ON DELETE RESTRICT` impede excluir um servidor com números atrelados (retorna erro amigável na UI).
- `null` para contas Meta e Evolution v2 (inalteradas).

### RLS

`whatsapp_go_servers`: Owner-only (mesmo padrão de `ai_settings`). Edge Functions leem via `service_role` (ignoram RLS).

---

## 3. Fluxo de cadastro de um número Go

```
Owner
  └─→ Configurações → Integrações & Chaves → Servidores Evolution Go
        └─→ Adicionar (nome + endpoint + chave global)
              ├─→ integration-secrets Edge: grava chave no Vault
              └─→ whatsappGoServers.create(): grava tabela (sem a chave)

Owner
  └─→ Configurações → WhatsApp → Adicionar número → Evolution Go
        └─→ Seletor de servidor (auto-seleciona quando só há um)
              └─→ whatsappAccounts.create(): go_server_id preenchido,
                  provider_config.baseUrl VAZIO (veio do servidor)
```

---

## 4. Resolução em runtime (Edge Functions)

### `whatsapp-connect` (QR / test-message / state / logout / restart / delete)

O helper `supabase/functions/whatsapp-connect/goServer.ts` exporta:

```ts
resolveGoServer(admin, resolveSecret, account): Promise<{ baseUrl: string; globalKey: string }>
```

Chamado **no início de cada ramo Go** (qr, state, logout, restart, delete teardown e test-message). Recebe `account.go_server_id`, faz um SELECT em `whatsapp_go_servers`, resolve a chave do Vault e retorna `{ baseUrl, globalKey }`.

- O `baseUrl` substituiu o antigo `provider_config.baseUrl`.
- O `globalKey` substituiu o antigo `{credentials_ref}_API_KEY`.
- O `instanceToken` (`{credentials_ref}_INSTANCE_TOKEN`) permanece por-conta e é resolvido separadamente pelo ramo.

### `whatsapp-send` (envio outbound)

O `buildProvider` em `whatsapp-send/index.ts` é síncrono (`(account) => IWhatsAppProvider`), mas `IAccountRecord` (interface compartilhada) não inclui `go_server_id`. Por isso, a função resolve o `base_url` de **forma assíncrona antes** de chamar `processSendRequest`:

```ts
const goBaseUrls = await resolveGoBaseUrls(admin, conversationId);
// → Map<accountId, baseUrl>
```

O helper `resolveGoBaseUrls` (inline em `whatsapp-send/index.ts`):
1. Busca o `whatsapp_account_id` da conversa
2. Carrega a conta principal (e o fallover se presente)
3. Para cada conta `evolution-go` sem `provider_config.baseUrl`, consulta `whatsapp_go_servers`
4. Retorna em ~2 queries para conversas não-Go (fast exit)

O `buildProvider` injeta o `baseUrl` no `providerConfig` antes de chamar `buildWhatsAppEngine`.

### Credenciais usadas por tipo de operação

| Operação | Chave necessária | Fonte |
|---|---|---|
| Criar/deletar instância (`/instance/create`, `/instance/delete`) | Chave **global** do servidor | `whatsapp_go_servers.api_key_ref` → Vault |
| Parear, enviar, estado, logout, restart | Token **por instância** | `{credentials_ref}_INSTANCE_TOKEN` → Vault |
| Envio outbound (`whatsapp-send`) | Token **por instância** + `base_url` | Token: Vault por-conta; `base_url`: servidor |

---

## 5. Rotação da chave global

Para rotacionar a chave de um servidor:

1. `Configurações → Integrações & Chaves → Servidores Evolution Go` → Rotacionar chave
2. A tela chama `integration-secrets` Edge com a **mesma** `api_key_ref` e o novo valor
3. O Vault sobrescreve o segredo — todos os números do servidor passam a usar a nova chave **imediatamente**, sem redeploy

O `api_key_ref` nunca muda; só o valor no Vault é trocado.

---

## 6. Cutover

1. **Aplicar migration** (manual via MCP, idempotente): `20260626190000_whatsapp_go_servers`
2. **Deploy das Edge Functions**: `whatsapp-connect` e `whatsapp-send`
3. **Cadastrar o servidor real** na tela de Chaves (nome + endpoint + chave global)
4. **Smoke** (dono): adicionar número Go pelo wizard → parear → confirmar `LoggedIn: true` em `integration_logs`

---

## 7. Call sites fora do escopo desta tarefa

Os seguintes call sites também chamam `buildWhatsAppEngine` com `account.providerConfig` e sofrem o mesmo problema para contas Go do novo modelo. Foram deixados fora do escopo por estarem fora das fronteiras da Task 8; devem ser corrigidos antes de ativar contas Go nesses fluxos:

| Arquivo | Uso | Impacto |
|---|---|---|
| `supabase/functions/whatsapp-webhook/index.ts` (linha ~723) | Echos outbound e respostas via webhook | Envios de eco falham para contas Go do registro |
| `supabase/functions/scheduled-send-worker/index.ts` (linha ~95) | Envios agendados | Envios agendados falham para contas Go do registro |

A correção segue o mesmo padrão do `whatsapp-send`: pre-resolver `base_url` via `whatsapp_go_servers` antes de construir o engine. O `_shared/whatsappSendAdapter.ts` é outra opção (enriquecer `providerConfig` no `getSendContext`/`getAccountRecord`), já que não é um arquivo espelhado.
