# Design — Integração WAHA (WhatsApp HTTP API)

- **Data:** 2026-07-10
- **Codinome sugerido:** _(definir no version bump)_
- **Status:** Aprovado (brainstorming) — aguardando plano de implementação
- **Escopo:** WhatsApp / novo engine **WAHA** (self-hosted, `devlikeapro/waha`, engine GOWS/whatsmeow) · camada de provedores · Edge Functions próprias · tela de Chaves · Configurações → WhatsApp

---

## 1. Contexto e problema

A plataforma já tem 3 engines de WhatsApp em produção (Meta Cloud, Evolution v2, Evolution Go/whatsmeow), todos compartilhando a mesma camada `src/providers/whatsapp/` e as mesmas Edge Functions (`whatsapp-connect`, `whatsapp-webhook`, `whatsapp-send`) — código e SQL de acesso ("2 portões": `can_access_conversation` + 3 RPCs cópia + `current_seller_accessible_account_ids`) hoje **congelados** por decisão do dono após incidentes de performance (PR #137 "Aperture") e de concorrência (storm de `statement_timeout`).

Agora o dono deployou um servidor WAHA próprio (`https://waha.ailainteligente.com.br`, imagem `devlikeapro/waha:gows-2026.6.2`, engine GOWS/whatsmeow, tier CORE sem gate de feature) e quer avaliá-lo como mais uma opção de número, **sem tocar em nada do que já está em produção e validado**. O pedido explícito foi por uma implementação "totalmente isolada, como se fosse uma feature inédita".

Uma investigação de arquitetura (ver seção 3) mostrou que isolamento literal — tabela de contas própria (`waha_accounts`) com `conversations.waha_account_id` próprio — obrigaria a reescrever `can_access_conversation`, as 3 RPCs cópia, o helper de acesso por instância e o tick de saúde: exatamente os 4+ objetos congelados. O precedente já em produção (**Evolution Go**, PR #178, registro em `whatsapp_go_servers`) resolve o mesmo dilema sem esse risco: a conta continua sendo uma linha em `whatsapp_accounts` (herda RLS/acesso de graça), e só o que é exclusivo do engine vai para uma tabela satélite. Este design segue o mesmo molde.

## 2. Objetivo

Adicionar WAHA como um 4º engine de WhatsApp, com:

- **Código 100% isolado** — nenhuma Edge Function existente (`whatsapp-connect`/`whatsapp-webhook`/`whatsapp-send`) é editada; WAHA ganha as suas próprias (`waha-connect`, `waha-webhook`, `waha-send`).
- **Zero mudança nos objetos de RLS/acesso congelados** — `can_access_conversation`, as 3 RPCs cópia, `current_seller_accessible_account_ids`, a policy de mídia no Storage e o `whatsapp_health_tick` continuam exatamente como estão.
- **Conversas WAHA aparecendo no mesmo Inbox** — mesmas tabelas `conversations`/`messages`, mesmo bucket `whatsapp-media`, mesma UX de atendimento.
- **Criação de instância parametrizável** — wizard próprio (não um botão fixo) que aceita loja, rótulo e finalidade (`purpose`), no molde do `AddInstanceWizard` atual.
- **Multi-instância desde o início** — o servidor WAHA é nativamente multi-sessão (documentação: escala de 1 a 500 sessões); o registro de servidor já nasce pronto para múltiplos números.

### Não-objetivos (YAGNI, registrados para não esquecer)

- **Sem failover automático** com Meta/Evolution/Evolution Go (matriz do PRD-120 não é estendida).
- **Sem tick de saúde via `pg_cron`** — status é sob demanda (`waha-connect?action=state`), refresh manual na tela.
- **Sem múltiplos servidores WAHA configurados** agora — schema suporta (mesmo padrão de `whatsapp_go_servers`), só existe 1 servidor hoje.
- **Sem eventos além de `message` e `session.status`** — `message.ack` (confirmação de entrega/leitura) fica para uma 2ª fase.
- **Sem janela de 24h** — é uma regra específica do Meta oficial (template obrigatório), não se aplica a um client não-oficial.
- **Sem integração MCP no produto** — o WAHA expõe um servidor MCP (`https://waha.devlike.pro/docs/apps/mcp/`) que permitiria a um agente de IA controlar sessões diretamente; fica **só registrado como direção futura**, não faz parte desta entrega.
- **Sem substituir Evolution** — WAHA nasce como mais uma opção independente; decisão de consolidar fica para depois de validar em produção.

### Critérios de sucesso

1. Owner cadastra o servidor WAHA na tela de Chaves (nome + endpoint + API key global) — a chave entra no Vault uma vez.
2. Wizard próprio (aba dedicada) cria uma sessão WAHA parametrizada (loja, rótulo, finalidade), mostra o QR, faz polling de status até `WORKING` e captura o número.
3. Mensagem inbound recebida via WAHA aparece na conversa certa no Inbox, com controle de acesso por instância idêntico aos outros engines.
4. Mensagem enviada pela conversa (quando a conta é WAHA) chega ao destinatário via `waha-send`.
5. Nenhum arquivo de `_shared/whatsapp/{webhook,send}/core.ts`, `can_access_conversation`, as 3 RPCs cópia, `current_seller_accessible_account_ids` ou `whatsapp_health_tick` é alterado.

## 3. Decisões (confirmadas no brainstorming)

1. **Mesmo Inbox, engine isolado** — não é um produto novo; conversas/mensagens WAHA vivem em `conversations`/`messages` como as demais.
2. **Linha-ponteiro + satélite** (não tabela de contas totalmente separada) — `whatsapp_accounts` ganha `provider='waha'`; tudo exclusivo do engine (endpoint, chave global) vai para `waha_servers`, no molde exato de `whatsapp_go_servers`.
3. **Edge Functions 100% próprias** — `waha-connect`, `waha-webhook`, `waha-send`; podem **consumir** RPCs existentes (ex.: chamar `can_access_conversation` como qualquer outro caller) mas nunca editar os arquivos congelados.
4. **UI em aba dedicada** — nova seção "WAHA" em Configurações → WhatsApp, com wizard próprio (não reaproveita `AddInstanceWizard` visualmente, para refletir o isolamento).
5. **Independente do Evolution por enquanto** — sem decisão de substituição.
6. **Multi-instância desde o v1** — registro de servidor + N sessões.
7. **Escopo completo no v1**: criação/pareamento de instância + recebimento + envio, tudo out-of-the-box.

## 4. Modelo de dados

### 4.1 Nova tabela `waha_servers` (plataforma, Owner-only — molde de `whatsapp_go_servers`)

| coluna | tipo | regras |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `name` | `text` NOT NULL | nome amigável; único |
| `base_url` | `text` NOT NULL | ex.: `https://waha.ailainteligente.com.br` (sem barra final) |
| `api_key_ref` | `text` NOT NULL | ponteiro do secret no Vault (`X-Api-Key` global do servidor); único; `^[A-Z][A-Z0-9_]{2,64}$` |
| `webhook_hmac_ref` | `text` | ponteiro do secret HMAC (SHA-512) usado para validar `waha-webhook`; nullable até ser configurado |
| `created_at` / `updated_at` | `timestamptz` NOT NULL | `default now()` |

### 4.2 `whatsapp_accounts` — extensão aditiva

- `provider` passa a aceitar o valor livre `'waha'` (coluna já é texto sem CHECK de enum — nenhuma mudança de schema aqui).
- `provider_config` CHECK de shape ganha um ramo `waha` exigindo `{"sessionName": "..."}` (aditivo, mesmo padrão usado para adicionar `evolution-go`).
- Nova coluna `waha_server_id uuid REFERENCES waha_servers(id)` — nullable (só contas WAHA preenchem), `ON DELETE RESTRICT` (impede apagar servidor com sessões atreladas, mesma guarda do `go_server_id`).
- Índice único parcial: `unique index on (provider_config->>'sessionName') where provider='waha'` — resolução determinística do webhook por nome de sessão (mesmo padrão de `instanceName`/`phoneNumberId`).
- `credentials_ref` (coluna NOT NULL herdada do schema original): para contas WAHA, grava o mesmo valor de `waha_servers.api_key_ref` do servidor associado — mantém a coluna preenchida sem introduzir uma 2ª cópia de segredo (a resolução real do secret sempre passa por `waha_server_id` → `waha_servers.api_key_ref`).

### 4.3 O que NÃO muda

`conversations`, `messages`, `can_access_conversation`, `count_conversations`, `search_conversations`, `search_conversation_messages`, `current_seller_accessible_account_ids`, `whatsapp_account_access_rules`, a policy `storage_whatsapp_media_select_inbound`/`can_read_conversation_media`, `whatsapp_health_tick` — **zero linhas tocadas**. Contas WAHA herdam o Portão A (por instância) e o Portão B (carteira) automaticamente por serem linhas normais de `whatsapp_accounts`.

### 4.4 `integration_logs`

O CHECK de `integration_name` é lista fechada — precisa de uma migration aditiva incluindo `'whatsapp_waha'` (mesmo tipo de migration que já foi necessária para `evolution-go`, ver `20260626031541_integration_logs_allow_evolution_go.sql`). Sem essa migration, logs de erro do WAHA seriam descartados silenciosamente pelo sink fail-open — lição já aprendida no incidente do evolution-go.

### 4.5 Migrations

Duas migrations versionadas em `supabase/migrations/`:
1. `waha_servers` (tabela + RLS Owner-only, molde de `whatsapp_go_servers`).
2. `whatsapp_accounts` (coluna `waha_server_id` + CHECK de `provider_config` ampliado + índice único) + ampliação do CHECK de `integration_logs.integration_name`.

Aplicadas em produção manualmente via MCP (regra do projeto: todo `apply_migration` é espelhado no Git no mesmo PR).

## 5. Segredos no Vault

- **`WAHA_API_KEY`** (nome final definido na implementação, ex. `WAHA_<SLUG>_API_KEY`) — a chave global `X-Api-Key` do servidor. Gravada uma vez via `integration-secrets` (Edge Function existente, sem mudança), apontada por `waha_servers.api_key_ref`.
- **Webhook HMAC** — segredo próprio para assinar/validar os webhooks WAHA (SHA-512, header `X-Webhook-Hmac`), apontado por `waha_servers.webhook_hmac_ref`.
- **As senhas do dashboard/Swagger do WAHA (basic auth) NÃO entram no Vault nem em nenhum arquivo** — são acesso humano direto ao painel, fora do escopo desta integração; documentação de infra (`/opt/stacks/INVENTORY.md`) já é a fonte da verdade para isso, fora deste repositório.
- Tela **Configurações → Integrações → Chaves & API**: novo grupo estático `"WAHA"` em `src/features/admin-settings/engine/integrationKeys.ts` (mesmo molde do grupo `"llm-providers"`), listando `WAHA_API_KEY` e o secret de HMAC. Zero mudança na Edge Function `integration-secrets` (já é genérica).

## 6. Camada de dados (Provider Pattern)

Novo provider **`wahaServers`** (mock + supabase), contrato `IWahaServersProvider`, no mesmo molde do `whatsappGoServers`:

- `list(): Promise<IWahaServer[]>`
- `create({ name, baseUrl, apiKey }): Promise<IWahaServer>`
- `update(id, { name?, baseUrl? }): Promise<IWahaServer>`
- `rotateKey(id, newKey): Promise<void>`
- `setWebhookHmac(id, secret): Promise<void>`
- `remove(id): Promise<void>` (guardado pela FK `ON DELETE RESTRICT`)

Tipo de domínio `IWahaServer` em `src/shared/types/conversation.ts` (junto de `IWhatsAppAccount`/`IWhatsAppGoServer`). `IWhatsAppAccount` ganha `wahaServerId?`.

Camada de engine `src/providers/whatsapp/waha/` (runtime-agnostic, só Web APIs + imports relativos, mesmo padrão de `evolution-go/`):
- `WahaProvider.ts` — implementa `IWhatsAppProvider` (envio de texto/mídia via `sendText`/`sendImage`/`sendFile`).
- `client.ts` — HTTP client fino (header `X-Api-Key`).
- `session.ts` — ciclo de vida da sessão (`create`, `qr`, `state`, `logout`, `restart`, `delete`), espelha `evolution-go/instance.ts`.
- `parser.ts` — mapeia payload de webhook WAHA → formato interno de mensagem (texto/mídia/`chatId`→telefone).
- `hmac.ts` — geração/validação HMAC SHA-512 do webhook.
- `constants.ts`, `errors.ts` — no molde dos demais engines.

`factory.ts` ganha o case `'waha'` (dispatch de `WhatsAppProviderEngine`, que passa a incluir `"waha"`).

## 7. Wizard de criação/pareamento (UI)

Nova seção **"WAHA"** em Configurações → WhatsApp (aba própria, não reaproveita `AddInstanceWizard` visualmente):

- Formulário: loja, rótulo, finalidade (`purpose`) — parâmetros, não um botão fixo.
- Sem servidor WAHA cadastrado → aviso com CTA "Cadastre o servidor WAHA em Configurações → Chaves", ação de criar desabilitada (mesmo padrão do Evolution Go).
- Ao confirmar: chama `waha-connect?action=create` → exibe QR (polling em `waha-connect?action=qr`) → polling de `waha-connect?action=state` até `WORKING` → sucesso, mostra número capturado.
- Listagem: sessões WAHA existentes (rótulo, número, `sessionName`, status), ações **Reiniciar**, **Logout**, **Excluir** (chamam as ações correspondentes do `waha-connect`).

## 8. Edge Functions próprias

Helper `resolveWahaServer(account, db, resolveSecret): Promise<{ baseUrl, apiKey, hmacSecret? }>` — join em `waha_servers` por `account.waha_server_id`, resolve os secrets no Vault. Erros claros se `waha_server_id` for nulo, o servidor sumir ou o secret faltar (mesmo padrão de `resolveGoServer`).

### `waha-connect` (owner-only, ações administrativas)
- `create`: resolve servidor → `POST {baseUrl}/api/sessions` com `config.webhooks` já apontando para `waha-webhook` (URL pública desta Edge Function) + HMAC → insere linha em `whatsapp_accounts` (`provider='waha'`, `status='connecting'`) + auditoria.
- `qr`: proxy de `GET /api/{session}/auth/qr` (formato `raw` para renderizar no front).
- `state`: proxy de `GET /api/sessions/{session}`; ao virar `WORKING`, faz backfill do `phone_number` a partir do campo `me`.
- `logout` / `restart` / `delete`: espelham os endpoints WAHA (`POST .../logout`, `POST .../restart`, `DELETE /api/sessions/{session}`); `delete` desativa a linha local (mesma política de soft-disable dos outros engines, a decidir na implementação se é soft ou hard delete, respeitando a FK de `conversations.whatsapp_account_id`).

### `waha-webhook` (pública, recebe eventos)
- Valida `X-Webhook-Hmac` (SHA-512) contra `hmacSecret` do servidor antes de processar qualquer coisa (fail-closed).
- Resolve a conta pelo índice único de `sessionName` (payload `session`).
- Evento `message`: parseia `chatId` (`<numero>@c.us` → telefone), resolve/cria cliente, resolve/reabre conversa, insere mensagem (texto ou mídia — mídia baixada e enviada para o bucket `whatsapp-media`, mesmo path `conversations/<conversationId>/<messageId>/media.<ext>` já coberto pela policy existente).
- Idempotência: `payload.id` (`evt_...`) como `eventKey`, **escopado por conta** — mesma lição do incidente de colisão de eco de mídia entre instâncias próprias.
- Evento `session.status`: atualiza `status`/`current_state` local.
- Log em `integration_logs` com `integration_name='whatsapp_waha'`.

### `waha-send`
- Checa permissão **consumindo** a RPC `can_access_conversation(conv_id)` já existente (chamada via `service_role`, sem editar o arquivo) — mesma defesa-em-profundidade que `whatsapp-send` já faz hoje.
- Persist-before-send: insere mensagem `status='queued'` → despacha `POST /api/sendText` (texto) ou `/api/sendImage`/`/api/sendFile` (mídia) → atualiza `status` conforme resposta.
- Sem checagem de janela de 24h (não aplicável a este engine).

Nenhuma dessas três funções importa de `_shared/whatsapp/{webhook,send}/core.ts` nem precisa do script `sync-whatsapp-shared.ts` — são independentes desde o código-fonte.

## 9. Tela de Chaves (`IntegrationKeysPage`)

Nova seção **"Servidor WAHA"**, no mesmo molde da seção "Servidores Evolution Go":
- Cadastro (nome + endpoint + API key, digitada uma vez) → grava no Vault + insere `waha_servers`.
- Editar (nome/endpoint), **Rotacionar chave**, **Definir/rotacionar HMAC do webhook**, **Excluir** (bloqueado por FK se houver sessões atreladas).

## 10. Tratamento de erros

- Wizard sem servidor cadastrado → CTA, sem crash (padrão já usado no Evolution Go).
- `waha-webhook` com HMAC inválido ou ausente → 401, sem processar payload, log em `integration_logs`.
- `waha-connect` com `waha_server_id` nulo / servidor ausente / secret vazio → erro claro traduzido na UI.
- Excluir servidor com sessões atreladas → FK `RESTRICT` traduzida em toast amigável.
- Falha ao criar sessão no WAHA (ex.: limite de sessões do servidor) → erro propagado sem criar linha órfã em `whatsapp_accounts` (só insere após confirmação do WAHA).

## 11. Testes

- **Engines puros e testáveis (Vitest, TDD):** `parser.ts` (payload WAHA → mensagem interna), `hmac.ts` (validação de assinatura), `resolveWahaServer` (account + mapa de servidores → `{baseUrl, apiKey}` ou erro), `session.ts` (transições de estado).
- **Provider mock:** `MockWahaProvider`/`wahaServers` mock — CRUD determinístico + guarda de exclusão.
- **Catálogo de chaves:** `integrationKeys.test.ts` — grupo "WAHA" aparece corretamente.
- **Edge Functions:** sem unit test automatizado (mesmo padrão dos demais engines — rodam server-side); validação via smoke manual contra o servidor WAHA real do dono (criar 1 sessão de teste, parear, mandar/receber 1 mensagem).
- Gate prático: `bun run build` + `bun run test`.

## 12. Cutover / rollout

1. Aplicar as 2 migrations em produção (MCP, idempotente, espelhadas no Git no mesmo PR).
2. Deploy das 3 Edge Functions novas (`waha-connect`, `waha-webhook`, `waha-send`).
3. Cadastrar o servidor WAHA real (`https://waha.ailainteligente.com.br` + `X-Api-Key` já fornecida) na tela de Chaves.
4. Criar 1 sessão de teste pela wizard, parear via QR, validar recebimento e envio de 1 mensagem real (smoke do dono).
5. Sem migração de dados (feature nova, nenhuma conta WAHA preexistente).

## 13. Arquivos afetados (mapa de implementação)

- `supabase/migrations/AAAAMMDDHHMMSS_waha_servers.sql` — tabela `waha_servers` + RLS.
- `supabase/migrations/AAAAMMDDHHMMSS_whatsapp_accounts_waha_provider.sql` — coluna `waha_server_id`, CHECK de `provider_config` ampliado, índice único, ampliação do CHECK de `integration_logs`.
- `src/shared/types/conversation.ts` — `IWahaServer`, `IWhatsAppAccount.wahaServerId`.
- `src/providers/data/contracts/wahaServers.ts` (+ barrel) — contrato.
- `src/providers/data/impl/mock/wahaServers.ts` · `impl/supabase/wahaServers.ts`.
- `src/providers/data/factory.ts` · `hooks/` — registro do novo provider.
- `src/providers/whatsapp/types.ts` — `WhatsAppProviderEngine` ganha `"waha"`.
- `src/providers/whatsapp/waha/` — `WahaProvider.ts`, `client.ts`, `session.ts`, `parser.ts`, `hmac.ts`, `constants.ts`, `errors.ts` (+ testes).
- `src/providers/whatsapp/factory.ts` — case `'waha'`.
- `src/features/admin-settings/components/WahaSection.tsx` (ou nome equivalente) — wizard + listagem, aba própria em Configurações → WhatsApp.
- `src/features/admin-settings/pages/IntegrationKeysPage.tsx` (+ componente da seção) — CRUD do servidor WAHA.
- `src/features/admin-settings/engine/integrationKeys.ts` (+ teste) — grupo `"WAHA"`.
- `supabase/functions/waha-connect/index.ts` — novo, ações create/qr/state/logout/restart/delete.
- `supabase/functions/waha-webhook/index.ts` — novo, recepção + HMAC + persistência.
- `supabase/functions/waha-send/index.ts` — novo, envio.
- `docs/dev/waha-integration.md` — doc da regra de negócio (na implementação, molde de `docs/dev/whatsapp-go-server-registry.md`).

## 14. Riscos & mitigações

- **Limite real de sessões simultâneas do tier CORE** — documentação é vaga ("1 a 500 sessões" sem tabela de planos clara); validar criando 2 sessões de teste antes de assumir multi-instância ilimitada.
- **Formato exato do payload de mídia inbound do WAHA** (URL assinada vs. necessidade de 2ª chamada para baixar o arquivo) não foi confirmado em profundidade — validar cedo na implementação com uma mensagem de mídia real.
- **Esquecer de espelhar as migrations no Git** → seguir a regra do projeto (todo `apply_migration` via MCP é exportado no mesmo PR).
- **`credentials_ref` NOT NULL duplicando o valor de `api_key_ref`** — decisão pragmática para não alterar o schema de `whatsapp_accounts` (tornar a coluna nullable também seria aditivo e seguro, mas desnecessário); revisitar se um engine futuro tornar essa duplicação confusa.
