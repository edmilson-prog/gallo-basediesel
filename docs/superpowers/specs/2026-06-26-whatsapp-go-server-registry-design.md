# Design — Registro de Servidores Evolution Go

- **Data:** 2026-06-26
- **Codinome sugerido:** _(definir no version bump)_
- **Status:** Aprovado (brainstorming) — aguardando plano de implementação
- **Escopo:** WhatsApp / Evolution Go (whatsmeow) · camada de provedores · Edge Functions · tela de Chaves

---

## 1. Contexto e problema

Hoje, ao adicionar um número Evolution Go pela `AddInstanceWizard`, a plataforma guarda **por conta** tanto o endpoint do servidor (`whatsapp_accounts.provider_config.baseUrl`) quanto a **chave global** do servidor (segredo `{credentials_ref}_API_KEY` no Vault). A chave global, porém, é uma credencial **do servidor** (a `AUTHENTICATION_API_KEY` do evo-go, idêntica para todas as instâncias daquele servidor) — não da conta.

Consequências observadas (2026-06-26):

- **Duplicação:** a mesma chave do servidor vira N cópias no Vault (uma por número). Foram encontradas 8 cópias órfãs (`WA_EVO_GO_TESTE_*_API_KEY`).
- **Lixo acumulado:** excluir a conta não apaga o segredo → cópias órfãs ficam no Vault.
- **Rotação cara:** trocar a chave exige atualizar N segredos; qualquer conta esquecida quebra.
- **Ops sem âncora:** limpar/listar instâncias precisa da chave, mas não há um lugar "do servidor" para buscá-la sem uma conta.

> O `{credentials_ref}_INSTANCE_TOKEN` (token por instância) é legitimamente por-conta e **não** é o problema — só o `_API_KEY` (global) está modelado no lugar errado.

## 2. Objetivo

Cadastrar o **servidor Evolution Go uma única vez** (nome amigável + endpoint + chave global), de modo que:

- criar uma instância **não peça mais chave nem URL** — só escolhe o servidor;
- **rotacionar a chave** se faça num só lugar, uma vez, sem redeploy e sem quebrar instâncias;
- excluir uma conta **não deixe cópia de chave órfã**.

### Não-objetivos (YAGNI)

- **Não** cobre Evolution v2 (legado) nem Meta — registro é **Go-only**. As contas v2 atuais (`WA_EVO_CAMPANHAS`) e a conta Meta ficam intocadas.
- **Não** há migração de dados de contas Go (produção está zerada de contas Go).
- **Não** inclui healthcheck/monitoramento do servidor nesta entrega.

### Critérios de sucesso

1. Owner cadastra um servidor Go na tela de Chaves (nome + endpoint + chave) — a chave entra no Vault uma vez.
2. A wizard de novo número Go mostra um seletor de servidor (auto-seleciona quando só há um) e **não** pede URL nem chave.
3. Criar/parear/excluir um número Go funciona resolvendo endpoint e chave global a partir do servidor.
4. Rotacionar a chave do servidor mantém todos os números daquele servidor funcionando, sem redeploy.
5. Excluir um servidor com números atrelados é **bloqueado** com mensagem amigável.

## 3. Decisões (confirmadas no brainstorming)

1. **Registro com lista (1+ servidores).** Tabela suporta N; a wizard mostra seletor (auto-seleciona com um só).
2. **Go-only.** v2/Meta fora de escopo.
3. **Servidores são globais (nível de plataforma), Owner-only** — não escopados por loja. É infra; qualquer loja aponta para qualquer servidor.
4. **Corte seco** do modelo de chave por-conta Go (sem fallback) — seguro porque não há conta Go viva em produção.

## 4. Modelo de dados

### 4.1 Nova tabela `whatsapp_go_servers` (plataforma, Owner-only)

| coluna | tipo | regras |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `name` | `text` NOT NULL | nome amigável; **único** (`unique`) |
| `base_url` | `text` NOT NULL | endpoint normalizado (sem barra final) |
| `api_key_ref` | `text` NOT NULL | nome do segredo no Vault (ponteiro); **único**; casa com `^[A-Z][A-Z0-9_]{2,64}$` |
| `created_at` | `timestamptz` NOT NULL | `default now()` |
| `updated_at` | `timestamptz` NOT NULL | `default now()` (trigger de atualização opcional) |

- A chave **não** vive na tabela — só o ponteiro (`api_key_ref`). O valor fica no Vault.

### 4.2 Coluna nova em `whatsapp_accounts`

- `go_server_id uuid REFERENCES whatsapp_go_servers(id)` — **nullable** (só contas Go preenchem; v2/Meta ficam `null`).
- FK **`ON DELETE RESTRICT`** → é a guarda que impede excluir um servidor com números atrelados.

### 4.3 RLS

- `whatsapp_go_servers`: Owner-only para `SELECT/INSERT/UPDATE/DELETE` (mesmo padrão de `ai_settings`).
- As Edge Functions usam `service_role` (ignoram RLS) para ler `base_url` + resolver a chave.

### 4.4 Migração

- Versionada em `supabase/migrations/AAAAMMDDHHMMSS_whatsapp_go_servers.sql`.
- Aplicada em produção **manualmente via MCP** (idempotente; `version` = nome do arquivo) — o workflow de CI é no-op.
- **Sem backfill** (0 contas Go em produção).

## 5. Segredos no Vault

- **Chave global do servidor:** gravada uma vez como `WA_GO_SERVER_<SLUG>_API_KEY`; `api_key_ref` aponta para ela.
  - Engine puro `generateGoServerKeyRef(name, existingRefs, suffix)` — `slugUpper(name)` + sufixo curto para unicidade (espelha `utils/goCredentials.ts`).
- **Token por instância:** continua por-conta (`{account.credentials_ref}_INSTANCE_TOKEN`), inalterado.
- O `{credentials_ref}_API_KEY` por-conta **deixa de existir** no caminho Go.

## 6. Camada de dados (Provider Pattern)

Novo provider **`whatsappGoServers`** (o 38º), contrato `IWhatsAppGoServersProvider`:

- `list(): Promise<IWhatsAppGoServer[]>`
- `create({ name, baseUrl, apiKey }): Promise<IWhatsAppGoServer>`
- `update(id, { name?, baseUrl? }): Promise<IWhatsAppGoServer>`
- `rotateKey(id, newKey): Promise<void>`
- `remove(id): Promise<void>`

Regras:

- `create`/`rotateKey` gravam a chave via a Edge `integration-secrets` (write-only, auditada) e fazem upsert da linha. Ordem: gera `api_key_ref` → grava o segredo → insere a linha.
- `remove` é guardado pela FK (`ON DELETE RESTRICT`); o erro é traduzido em mensagem amigável; em seguida apaga o segredo do Vault.
- Implementações **mock** (determinística) + **supabase**; registrado em `factory.ts`, no barrel de contratos e nos hooks `useWhatsAppGoServersProvider()`.
- Tipo de domínio `IWhatsAppGoServer` em `src/shared/types/conversation.ts` (junto de `IWhatsAppAccount`).

## 7. Wizard (`AddInstanceWizard`)

No ramo `evolution-go`:

- **Removidos** os campos "URL do servidor Evolution Go" e "Chave global da API".
- **Adicionado** um seletor de servidor (lista do provider `whatsappGoServers`); auto-seleciona quando há exatamente um.
- Sem servidor cadastrado → aviso com CTA "Cadastre um servidor Go em Configurações → Chaves" (link para a tela), botão "Criar e conectar" desabilitado.
- No `create`, a conta grava `goServerId` e **não** grava `providerConfig.baseUrl` nem a chave. O `credentials_ref` por-conta e o token por-instância (no pareamento) seguem como hoje.

## 8. Edge Functions

Helper compartilhado **`resolveGoServer(account, db, resolveSecret): Promise<{ baseUrl, globalKey }>`** — faz join em `whatsapp_go_servers` por `account.go_server_id` e resolve `api_key_ref` no Vault. Erros claros se `go_server_id` for nulo, o servidor sumir ou o segredo faltar.

- **`whatsapp-connect`** (ações create/qr/status/logout/delete): substitui `account.provider_config.baseUrl` por `server.base_url` e a chave global `{ref}_API_KEY` por `resolveSecret(server.api_key_ref)`. O token por-instância (`{ref}_INSTANCE_TOKEN`) **não muda**.
- **`whatsapp-send` / engine Go:** usa o mesmo helper para o `base_url`; o token segue por-conta. **Touchpoint a verificar** na implementação (confirmar como o envio Go lê base_url/token hoje).
- Redeploy das edges tocadas após a mudança (com OK do dono).

## 9. Tela de Chaves (`IntegrationKeysPage`)

Nova seção **"Servidores Evolution Go"**:

- Lista de servidores (nome · `base_url` · status da chave: definida/ausente).
- Ações: **Adicionar** (nome + endpoint + chave, digitada uma vez), **Editar** (nome/endpoint), **Rotacionar chave** (re-grava o segredo no mesmo `api_key_ref` — instantâneo, sem redeploy), **Excluir** (guardado pela FK; bloqueia com "N números usam este servidor").
- O grupo per-conta `_API_KEY` de contas Go **sai** do catálogo (`buildIntegrationKeyCatalog`). Os grupos Evolution v2 e Meta ficam inalterados.

## 10. Tratamento de erros

- Wizard sem servidor cadastrado → CTA, sem crash.
- Excluir servidor com contas atreladas → FK `RESTRICT` traduzida em toast amigável.
- Edge com `go_server_id` nulo / servidor ausente → erro claro ("conta sem servidor configurado").
- `resolveSecret(api_key_ref)` vazio → erro claro ("chave do servidor não definida").

## 11. Testes

- **Engines puros:** `generateGoServerKeyRef` (slug + unicidade), `resolveGoServer` (account + mapa de servidores → `{baseUrl, key}` ou erro).
- **Provider mock:** CRUD + guarda de exclusão (remover servidor com conta atrelada falha).
- **Catálogo:** atualizar `integrationKeys.test.ts` — contas Go não emitem mais o grupo `_API_KEY`.
- Gate prático: `bun run build` + `bun run test`.

## 12. Cutover / rollout

1. Aplicar a migração em produção (MCP, idempotente).
2. Redeploy das Edge Functions tocadas (`whatsapp-connect` [+ `whatsapp-send` se tocado]).
3. Sem migração de dados (0 contas Go).
4. **Corte seco:** remove o uso da chave por-conta Go (`{ref}_API_KEY`). O sufixo `_INSTANCE_TOKEN` permanece.
5. Cadastrar o servidor Go real na tela de Chaves e validar criação + pareamento de um número (smoke do dono).

## 13. Arquivos afetados (mapa de implementação)

- `supabase/migrations/AAAAMMDDHHMMSS_whatsapp_go_servers.sql` — tabela + coluna FK + RLS.
- `src/shared/types/conversation.ts` — `IWhatsAppGoServer`, `IWhatsAppAccount.goServerId`.
- `src/providers/data/contracts/whatsappGoServers.ts` — contrato + barrel.
- `src/providers/data/impl/mock/whatsappGoServers.ts` · `impl/supabase/whatsappGoServers.ts`.
- `src/providers/data/factory.ts` · `hooks/` — registro do 38º provider.
- `src/features/admin-settings/engine/goServerKeyRef.ts` (+ teste) — `generateGoServerKeyRef`.
- `src/features/admin-settings/components/AddInstanceWizard.tsx` — seletor de servidor.
- `src/features/admin-settings/pages/IntegrationKeysPage.tsx` (+ componente da seção) — CRUD de servidores.
- `src/features/admin-settings/engine/integrationKeys.ts` (+ teste) — remove grupo `_API_KEY` de contas Go.
- `supabase/functions/_shared/whatsapp/...` + `whatsapp-connect/index.ts` (+ `whatsapp-send` se aplicável) — `resolveGoServer`.
- `docs/dev/whatsapp-go-server-registry.md` — doc da regra de negócio (na implementação).

## 14. Riscos & mitigações

- **`whatsapp-send` lê base_url/token de forma diferente** → verificar cedo na implementação (touchpoint explícito).
- **Segredo gravado mas linha não inserida** (orphan) → ordem grava-segredo-depois-linha; segredo órfão é inócuo e re-aproveitável; opcionalmente limpar no catch.
- **Esquecer de espelhar a migração no Git** → seguir a regra do projeto (todo `apply_migration` via MCP é exportado no mesmo PR).
