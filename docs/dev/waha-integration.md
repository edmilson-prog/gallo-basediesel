# WAHA (WhatsApp HTTP API) — Integração

> **Spec:** `docs/superpowers/specs/2026-07-10-waha-whatsapp-integration-design.md`
> **Versão:** ver CHANGELOG (version bump pendente)

---

## 1. O problema/objetivo

A plataforma já tinha 3 engines de WhatsApp em produção (Meta Cloud, Evolution v2, Evolution Go/whatsmeow), todos compartilhando a mesma camada `src/providers/whatsapp/` e as mesmas Edge Functions (`whatsapp-connect`, `whatsapp-webhook`, `whatsapp-send`) — código e SQL de acesso ("2 portões": `can_access_conversation` + 3 RPCs cópia + `current_seller_accessible_account_ids`) **congelados** por decisão do dono após incidentes de performance (PR #137 "Aperture") e de concorrência (storm de `statement_timeout`).

O dono deployou um servidor WAHA próprio (`https://waha.ailainteligente.com.br`, imagem `devlikeapro/waha:gows-2026.6.2`, engine GOWS/whatsmeow) e quis avaliá-lo como mais uma opção de número, **sem tocar em nada do que já está em produção e validado** — pedido explícito por uma implementação "totalmente isolada, como se fosse uma feature inédita".

Isolamento literal (tabela de contas própria, `conversations.waha_account_id` próprio) obrigaria a reescrever `can_access_conversation`, as 3 RPCs cópia, o helper de acesso por instância e o tick de saúde — exatamente os objetos congelados. O precedente já em produção, **Evolution Go** (PR #178, registro em `whatsapp_go_servers`), resolve o mesmo dilema sem esse risco: a conta continua sendo uma linha em `whatsapp_accounts` (herda RLS/acesso de graça), e só o que é exclusivo do engine vai para uma tabela satélite. O WAHA segue o mesmo molde (ver seção 3 do design spec).

Detalhes completos de contexto, decisões e não-objetivos: ver o design spec linkado acima.

---

## 2. O modelo

### Tabela `waha_servers`

Cadastro único de servidores WAHA (plataforma, Owner-only):

| coluna | tipo | descrição |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `name` | `text` NOT NULL UNIQUE | nome amigável |
| `base_url` | `text` NOT NULL | endpoint normalizado (sem barra final) |
| `api_key_ref` | `text` NOT NULL UNIQUE | ponteiro para o segredo `X-Api-Key` global no Vault (`^[A-Z][A-Z0-9_]{2,64}$`) |
| `webhook_hmac_ref` | `text` | ponteiro para o segredo HMAC do webhook no Vault; nullable até ser configurado |
| `created_at` / `updated_at` | `timestamptz` | auditoria |

Nem a chave `X-Api-Key` nem o segredo HMAC vivem na tabela — só os `*_ref` (nomes dos segredos). Os valores reais ficam no Vault.

### Ponteiro em `whatsapp_accounts`

```sql
waha_server_id uuid REFERENCES waha_servers(id) ON DELETE RESTRICT
```

- Preenchido **apenas** em contas `provider='waha'`.
- `ON DELETE RESTRICT` impede excluir um servidor com sessões atreladas (erro amigável traduzido na UI).
- `null` para contas Meta, Evolution v2, Evolution Go e OpenWA (inalteradas).

### Por que um ponteiro e não uma tabela de contas separada

O ponteiro é a peça central do isolamento: uma conta WAHA continua sendo **uma linha comum em `whatsapp_accounts`**, então herda de graça todo o modelo de acesso já validado ("2 portões" — Atendimento por instância + Carteira por dono) sem que nenhuma policy, RPC ou helper congelado precise saber que o provider `'waha'` existe. Só o que é exclusivo do engine (endpoint do servidor, chave global, HMAC do webhook) mora na tabela satélite `waha_servers`, resolvida em runtime pelas Edge Functions via `waha_server_id`. Uma tabela de contas própria (`waha_accounts` + `conversations.waha_account_id`) exigiria reescrever `can_access_conversation`, as 3 RPCs cópia, `current_seller_accessible_account_ids` e a policy de mídia no Storage — o oposto do pedido de isolamento sem risco.

### Extensões aditivas em `whatsapp_accounts` / `integration_logs`

- `provider_config` CHECK de shape ganha o ramo `waha` exigindo `{"sessionName": "..."}` (aditivo, mesmo padrão de `evolution-go`/`openwa`).
- Índice único parcial `(provider_config->>'sessionName') where provider='waha'` — resolução determinística do webhook por nome de sessão (mesmo padrão de `instanceName`/`phoneNumberId`).
- `credentials_ref` (coluna NOT NULL herdada do schema original): contas WAHA gravam o mesmo valor de `waha_servers.api_key_ref` do servidor associado — mantém a coluna preenchida sem introduzir uma 2ª cópia de segredo; a resolução real sempre passa por `waha_server_id → waha_servers.api_key_ref`.
- `integration_logs.integration_name` CHECK (lista fechada) ganha `'whatsapp_waha'` — sem essa migration, logs de erro do WAHA seriam descartados silenciosamente pelo sink fail-open (lição já aprendida no incidente do `evolution-go`).

### O que NÃO muda

`conversations`, `messages`, `can_access_conversation`, `count_conversations`, `search_conversations`, `search_conversation_messages`, `current_seller_accessible_account_ids`, `whatsapp_account_access_rules`, a policy `storage_whatsapp_media_select_inbound`/`can_read_conversation_media`, `whatsapp_health_tick` — **zero linhas tocadas**. Contas WAHA herdam o Portão A (por instância) e o Portão B (carteira) automaticamente por serem linhas normais de `whatsapp_accounts`.

### Migrations (aplicadas em produção)

1. `supabase/migrations/20260710150000_waha_servers.sql` — tabela `waha_servers` + RLS Owner-only.
2. `supabase/migrations/20260710150100_whatsapp_accounts_waha_provider.sql` — coluna `waha_server_id`, CHECK de `provider_config` ampliado, índice único por `sessionName`, ampliação do CHECK de `integration_logs.integration_name`.

> Nota registrada na própria migration 2: no momento de aplicar, a constraint `whatsapp_accounts_provider_config_shape` já ao vivo em produção incluía um ramo `openwa` e uma versão simplificada do ramo `evolution-go` (só `instanceId`, sem `baseUrl`) que não estavam refletidos em nenhuma migration deste repositório — sinal de uma migration aplicada direto em prod e nunca exportada para o Git. A migration do WAHA foi escrita de forma aditiva contra a definição **real** ao vivo (confirmada via `pg_get_constraintdef` antes de aplicar), não contra a cópia stale em `20260625120000_whatsapp_evolution_go_provider.sql`. A reconciliação dessa migration ausente (suporte a `openwa` + simplificação do `evolution-go`) fica pendente, fora do escopo desta feature.

---

## 3. Fluxo de cadastro

```
Owner
  └─→ Configurações → Integrações & Chaves → seção "Servidor WAHA"
        └─→ Cadastrar (nome + endpoint + API key + HMAC do webhook, opcional na criação)
              ├─→ integration-secrets Edge: grava chave(s) no Vault
              └─→ wahaServers.create() / setWebhookHmacRef(): grava a tabela satélite (sem os segredos)
        └─→ Ações por servidor: Editar (nome/endpoint), Rotacionar chave,
              Rotacionar/Remover HMAC do webhook, Excluir (bloqueado por FK se houver sessões)

Owner
  └─→ Configurações → WhatsApp → aba "WAHA" (dedicada, não reaproveita o AddInstanceWizard visualmente)
        └─→ "Nova sessão WAHA" → wizard próprio
              ├─→ Formulário: loja, rótulo, finalidade (atendimento/campanha/ambos), servidor
              │     (auto-seleciona quando só há 1; CTA + link para Chaves quando não há nenhum)
              ├─→ Confirmar → waha-connect?action=create → linha inserida em whatsapp_accounts
              │     (status='pending')
              ├─→ Pareamento: polling de waha-connect?action=qr (QR renderizado) +
              │     polling de waha-connect?action=state em paralelo, a cada 3s
              └─→ status='WORKING' → status='connected' localmente, número capturado, wizard fecha
```

A aba "Contas" (fluxo Meta/Evolution/Evolution Go) filtra `provider='waha'` para fora da sua listagem — sessões WAHA só aparecem na aba "WAHA" dedicada. O filtro foi aplicado em `supabaseWhatsAppAccountsProvider.list()` (não só na página), porque essa função alimenta ~12 outros consumidores (filtro de instância do Inbox, `useWhatsAppConnectionStatus`, `TemplatesSettingsPage`, etc.) que não têm nenhum tratamento para o valor `'waha'`.

---

## 4. Resolução em runtime

Três Edge Functions próprias, **nenhuma delas importa** de `_shared/whatsapp/build.ts`, `_shared/whatsapp/webhook/core.ts` ou `_shared/whatsapp/send/core.ts` — isolamento total desde o código-fonte, sem depender do script `scripts/sync-whatsapp-shared.ts` para ficar em sincronia com nada compartilhado.

### `waha-connect` (Owner-only, POST, `verify_jwt: true`)

Ações administrativas: `create` (cria sessão no WAHA + insere a linha em `whatsapp_accounts`), `qr` (proxy do QR em base64), `state` (proxy de status + backfill do `phone_number`), `logout`, `restart`, `delete` (chama a RPC `delete_whatsapp_account` — a mesma usada pelos outros engines — e só então tenta o teardown remoto no WAHA; se o teardown remoto falhar, apenas loga um warning, a linha local já foi removida).

### `waha-webhook` (pública, POST, `verify_jwt: false`, HMAC-gated internamente)

Recebe eventos `message` e `session.status`. Fail-closed: nenhuma escrita no banco acontece antes da verificação HMAC (SHA-512, header `X-Webhook-Hmac`). Resolve a conta pelo índice único de `sessionName`. Para `message`: resolve/cria cliente, resolve/reabre/cria conversa, insere a mensagem (mídia é um passo separado após o insert, nunca no mesmo insert), baixa mídia quando presente e sobe para o bucket `whatsapp-media` no mesmo path já coberto pela policy existente. Idempotência via `processed_events`, chave `whatsapp:waha:<accountId>:<eventId>` escopada por conta (lição do incidente de colisão de eco de mídia entre instâncias). A marcação do evento como processado é **diferida** até o trabalho correspondente ter de fato sido persistido — uma checagem (SELECT) acontece cedo para rejeitar retries genuínos rápido, mas o `INSERT`/`upsert` em `processed_events` só ocorre depois que a escrita que ele protege teve sucesso; isso evita que uma falha transitória no insert de cliente/conversa/mensagem trave permanentemente um retry legítimo do WAHA (corrigido durante a implementação — ver `.superpowers/sdd/task-11-report.md`).

### `waha-send` (POST, `verify_jwt: true`)

Permissão verificada **consumindo** a RPC `can_access_conversation` já existente, chamada com o JWT do próprio chamador (para que `auth.uid()` resolva corretamente dentro da função `SECURITY DEFINER`) — reaproveita o portão congelado em vez de reimplementar uma cópia paralela da lógica. Persist-before-send: insere a mensagem com `status='queued'`, despacha via `sendText`/`sendImage`/`sendFile`, atualiza `status` conforme o resultado. Sem checagem de janela de 24h (regra específica do Meta oficial, não aplicável a este engine) e sem transição automática de status da conversa no envio — ambas deferidas por design, documentadas no design spec.

### Status de deploy

As 3 funções foram deployadas e confirmadas `ACTIVE`: `waha-connect` (`verify_jwt: true`), `waha-webhook` (`verify_jwt: false`, pública, gated internamente por HMAC), `waha-send` (`verify_jwt: true`).

---

## 5. Formato da API WAHA

- **Estados de sessão** (`WAHA_SESSION_STATES`): `STOPPED`, `STARTING`, `SCAN_QR_CODE`, `WORKING`, `FAILED`. Mapeados para o status interno da plataforma (`wahaStateToAccountStatus`): `WORKING` → `connected`; `STOPPED`/`FAILED` → `disconnected`; `STARTING`/`SCAN_QR_CODE`/desconhecido → `pending`.
- **Envio**: `POST /api/sendText` (texto, `{session, chatId, text}`), `POST /api/sendImage` (mídia tipo imagem) e `POST /api/sendFile` (demais tipos de mídia — áudio/vídeo/documento), ambos com `{session, chatId, file: {mimetype, url, filename}, caption?}`. `chatId` é o telefone normalizado (`<dígitos>@c.us`). A resposta é lida por `id` como `providerMessageId`.
- **Webhook**: eventos assinados via `X-Webhook-Hmac` (HMAC-SHA512 sobre o corpo bruto da requisição, chave = segredo do Vault apontado por `waha_servers.webhook_hmac_ref`), verificação em tempo constante (`timingSafeEqualStrings`). Eventos assinados no v1: `message` e `session.status` (a lista completa de eventos subscritos na criação da sessão é `WAHA_DEFAULT_EVENTS = ["message", "session.status"]`; `message.ack` fica para uma 2ª fase — ver seção 7).

---

## Cutover

1. ✅ Migrations 1–2 aplicadas em produção via MCP (verificadas: tabela `waha_servers`, coluna `whatsapp_accounts.waha_server_id`, CHECK constraints, índice único por `sessionName`).
2. ✅ Deploy das 3 Edge Functions confirmado (`waha-connect` verify_jwt=true, `waha-webhook` verify_jwt=false, `waha-send` verify_jwt=true — todas ACTIVE).
3. ⬜ Cadastrar o servidor WAHA real na tela de Chaves:
   - Nome: (ex.: "WAHA — VPS AILA")
   - Endpoint: `https://waha.ailainteligente.com.br`
   - API key: valor de `WAHA_API_KEY` do `/opt/stacks/waha/.env` (a chave REST, header `X-Api-Key` — NÃO as senhas de dashboard/Swagger, que ficam fora da plataforma).
   - HMAC do webhook: gerar um novo segredo aleatório (ex. `openssl rand -hex 32`) e cadastrá-lo — é um segredo NOSSO, não algo que já existe no WAHA.
4. ⬜ Criar 1 sessão de teste pela aba WAHA → parear via QR → confirmar `status='WORKING'`.
5. ⬜ Enviar 1 mensagem de teste (via `waha-send`, chamado pela conversa no Inbox) e confirmar entrega no celular pareado.
6. ⬜ Enviar 1 mensagem do celular pareado para o número de teste e confirmar que ela aparece no Inbox (mesma tela de Atendimento).
7. ⬜ Confirmar em `integration_logs` (Owner, tela de saúde ou SQL direto) que `integration_name='whatsapp_waha'` está sendo gravado sem erro de CHECK.

---

## 7. Fora de escopo

Copiado verbatim do design spec (seção "Não-objetivos"):

- **Sem failover automático** com Meta/Evolution/Evolution Go (matriz do PRD-120 não é estendida).
- **Sem tick de saúde via `pg_cron`** — status é sob demanda (`waha-connect?action=state`), refresh manual na tela.
- **Sem múltiplos servidores WAHA configurados** agora — schema suporta (mesmo padrão de `whatsapp_go_servers`), só existe 1 servidor hoje.
- **Sem eventos além de `message` e `session.status`** — `message.ack` (confirmação de entrega/leitura) fica para uma 2ª fase.
- **Sem janela de 24h** — é uma regra específica do Meta oficial (template obrigatório), não se aplica a um client não-oficial.
- **Sem integração MCP no produto** — o WAHA expõe um servidor MCP (`https://waha.devlike.pro/docs/apps/mcp/`) que permitiria a um agente de IA controlar sessões diretamente; fica **só registrado como direção futura**, não faz parte desta entrega.
- **Sem substituir Evolution** — WAHA nasce como mais uma opção independente; decisão de consolidar fica para depois de validar em produção.
