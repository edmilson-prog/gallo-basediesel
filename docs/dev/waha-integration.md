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

Três Edge Functions próprias, **nenhuma delas importa** de `_shared/whatsapp/build.ts`, `_shared/whatsapp/webhook/core.ts` ou `_shared/whatsapp/send/core.ts` — isolamento total do pipeline compartilhado Meta/Evolution/Evolution Go desde o código-fonte. O que elas importam é o próprio engine WAHA, espelhado em `_shared/whatsapp/waha/*` a partir de `src/providers/whatsapp/waha/` pelo mesmo `scripts/sync-whatsapp-shared.ts` da Onda 5 (runtime-agnostic, só Web APIs + imports relativos). ⚠️ **Regra:** qualquer mudança em `src/providers/whatsapp/waha/**` (ex.: `session.ts`, `client.ts`, `parser.ts`, `contacts.ts`) exige rodar `bun run scripts/sync-whatsapp-shared.ts` **e** redeployar as 3 funções (`waha-connect`, `waha-webhook`, `waha-send`) — o espelho em `supabase/functions/_shared/whatsapp/waha/` não atualiza sozinho. A resolução de `@lid` (ver subseções abaixo) introduziu `contacts.ts` nesse mesmo engine (`resolveWahaLid`/`getWahaContactName`) — qualquer mudança ali segue a mesma regra, cobrindo obrigatoriamente o redeploy de **`waha-webhook`** (usa os dois na recepção) **e** `waha-connect` (usa os dois na ação `backfillLids`).

### `waha-connect` (Owner-only, POST, `verify_jwt: true`)

Ações administrativas: `create` (cria sessão no WAHA + insere a linha em `whatsapp_accounts`; aceita `sessionConfig` opcional no corpo — quando presente, é gravado em `provider_config.waha` e já usado para montar o `config` da sessão na criação), `ping` (checagem de conectividade/credenciais de um servidor cadastrado — `GET /api/sessions`, que não exige nome de sessão, então valida a chave sem criar nada; usada pelo botão "Testar conexão" na tela de Chaves), `backfillLids` (correção one-off de clientes-fantasma `@lid`; Owner-only, store-scoped — ver subseção "Backfill de `@lid`" abaixo), `qr` (proxy do QR em base64), `state` (proxy de status + backfill do `phone_number`; retorna tanto o `state` mapeado para o vocabulário interno da plataforma quanto o `rawState` bruto devolvido pela WAHA — ex. `SCAN_QR_CODE` — útil para diagnóstico e para a UI), `test-message` (validação ad-hoc: `{ accountId, action: 'test-message', to }` envia um texto via `sendWahaText` direto para um número — sem persistir em `messages` nem em `conversations`; a resposta retorna `providerMessageId`. Mesmo contrato de auditoria (`whatsapp_test_message_sent`, telefone mascarado) e texto padrão que a Evolution já usa para a ação de mesmo nome), `logout`, `restart`, `delete` (chama a RPC `delete_whatsapp_account` — a mesma usada pelos outros engines — e só então tenta o teardown remoto no WAHA; se o teardown remoto falhar, apenas loga um warning, a linha local já foi removida), `updateConfig` (body `{ accountId, action: 'updateConfig', sessionConfig }` — persiste `sessionConfig` em `provider_config.waha`, mesclado com o `sessionName` já existente na linha, e chama `PUT /api/sessions/{name}` com o `config` **completo** da sessão; a WAHA para e reinicia sozinha uma sessão em execução ao aplicar um config novo — o pareamento/autenticação é preservado, **não é preciso ler o QR de novo**. Depois de disparar o update remoto, marca a linha local com `status='pending'` até o próximo poll de `state` confirmar `WORKING`. Audita `whatsapp_instance_config_updated`).

### Mapeamento `sessionConfig` (UI/`provider_config.waha`) → `config` da WAHA

Construído por `buildWahaConfig()` em `src/providers/whatsapp/waha/session.ts` (usado tanto por `create` quanto por `updateConfig` — mesma função, mesmo shape de `config` enviado à WAHA):

- **`chatFilters`** (`groups`/`status`/`channels`/`broadcast`, booleanos) expressam **"processar este tipo"** na UI (rótulo/hint em `WahaParamsForm`, tela Configurações → WhatsApp → aba WAHA). O engine **inverte** cada flag para preencher `config.ignore.{groups,status,channels,broadcast}` da WAHA, cujo vocabulário é **"ignorar este tipo"** (confirmado contra a doc oficial da WAHA) — `processar=true ⇒ ignore=false`. Sem `sessionConfig` (default), tudo que não é DM 1:1 é ignorado (perfil de inbox comercial). Conversas 1:1 (`@c.us`) **sempre passam** — não existe chave `ignore` para elas, o filtro só se aplica a grupos/status/canais/broadcast.
- **`debug`** mapeia 1:1 para `config.debug` (só incluído quando `true`).
- **`proxy`** (`{server, username?, password?}`) mapeia 1:1 para `config.proxy` (só incluído quando `server` está preenchido; limpar o campo servidor na UI descarta o objeto `proxy` inteiro, mantendo `provider_config` limpo). As credenciais de proxy vivem em `provider_config.waha` — uma coluna `jsonb` **não secreta** — junto do resto do `sessionConfig`, e **não** passam pelo Vault; ou seja, a senha do proxy (quando informada) não é cofrada.
- **`device`** (`{name, browser}`, formulário "Dispositivo" na UI) é exibido **somente leitura** (`disabled`) e é **no-op no engine GOWS** — o único em produção hoje. `buildWahaConfig()` não lê nem envia `device` no `config` da WAHA; identidade de dispositivo no GOWS é resolvida por variáveis de ambiente do servidor, não por sessão. O campo fica reservado para um engine futuro que suporte a configuração por sessão.

### Backfill de `@lid` (ação `backfillLids`)

Correção one-off, Owner-only, para clientes **criados antes** do fix descrito na subseção "Resolução de `@lid`" abaixo — aqueles que ficaram com o placeholder `+<dígitos-do-lid>` em `phone`. A identificação não usa heurística de tamanho de telefone: para cada cliente candidato, o backfill **sonda** `GET /api/{session}/lids/{digits}` usando os próprios dígitos do `phone` salvo como se fossem um `@lid` — se o servidor responde com um `pn` válido, o telefone salvo *era* um `@lid`-fantasma (corrige); um 404/`pn` vazio confirma que já era um telefone real (não mexe). A mesma sonda torna o backfill idempotente: rodar de novo sobre um cliente já corrigido dá 404 (o telefone real não é conhecido do endpoint de `@lid`), então não há dupla-aplicação.

**Corpo:** `POST { action: "backfillLids", storeId, dryRun?: boolean, cursor?: string }`. `dryRun` **tem default `true`** — qualquer escrita exige `dryRun: false` explícito no corpo; sem isso, a ação só sonda e relata (nunca escreve).

**Pré-check de sessão:** antes de sondar, o handler verifica o estado de cada conta WAHA da loja via `getWahaSessionStatus` — só contas com sessão `WORKING` entram na sondagem. Isso evita que uma sessão morta/renomeada, que responderia 404 em **toda** sonda, seja mal-interpretada como "não há fantasmas" (`resolved: 0` falso-positivo); clientes de contas fora do ar são contados em `skipped`.

**Iteração por cursor (não por offset):** os candidatos são os `customer_id` distintos de todas as conversas nas contas WAHA da loja, ordenados. Cada execução processa até **200** (`CAP`) e devolve `nextCursor` (o maior id processado no lote, ou `null` quando não sobra nada); a próxima chamada deve passar `cursor: nextCursor` para retomar estritamente depois dele. É esse mecanismo — e não um `OFFSET` — que garante convergência: repetir a chamada com o cursor devolvido sempre avança a janela, então uma varredura completa termina em `ceil(N/CAP)` execuções, independentemente de quantos itens em cada lote viram `update`/`merge`/`skip`/`failure`.

**Resultado por cliente:**
- **`update`** — nenhum outro cliente já possui o telefone real; o cliente-fantasma é corrigido no lugar (`phone` → telefone real; `full_name` só é sobrescrito se ainda for igual ao placeholder anterior — nunca um nome editado manualmente; a tag `lid_unresolved`, se presente, é removida).
- **`merge`** — já existe um cliente com o telefone real (colisão): `messages.author_id` é repontado primeiro, depois `conversations.customer_id`, e só então o cliente-fantasma é `DELETE`ado — ordem crash-safe: se o processo cair no meio, o fantasma continua existindo e continua sendo candidato no próximo run, porque a candidatura vem das `conversations` ainda apontando para ele. Se o `DELETE` falhar por FK de outra tabela (lead/pedido/nota), o merge é contado normalmente mas reportado como `merged-ghost-kept` — o fantasma fica retido, sinalizado para revisão manual.
- **`skipped`** — telefone vazio, ou a conta WAHA do cliente não está numa sessão `WORKING` (ver pré-check acima).
- **`probe-failed` / `update-failed` / `merge-failed`** — contados em `failures`; a sonda ou a escrita daquele cliente falhou sem abortar o lote inteiro.

**Resposta:** `{ ok, dryRun, probed, resolved, updatedInPlace, merged, failures, skipped, remaining, nextCursor, entries, traceId }`. `entries` lista **toda** mudança planejada (dry-run) ou aplicada (apply) — sem truncar — para que o dono revise linha a linha antes de autorizar `dryRun: false`.

**Divergência residual dry-run × apply:** dois clientes-fantasma que resolvem para o **mesmo** telefone real dentro do mesmo lote são reportados de forma consistente via um mapa de telefones planejados (`plannedPhoneOwner`) — o primeiro aparece como `update`, e o segundo já enxerga o primeiro como dono do telefone real e aparece como `merge` **mesmo em dry-run**, exatamente como aconteceria numa aplicação real (paridade entre os dois modos). Um relatório com `resolved: 0` enquanto há fantasmas `@lid` conhecidos na base é sinal de que o endpoint `/lids` do servidor não respondeu no shape esperado (ex.: path vs. `%40lid` codificado) — **investigar antes de rodar `dryRun: false`**, nunca assumir que "não há mais fantasmas" a partir de um `resolved: 0`.

Auditado como `whatsapp_lid_backfill` em `audit_logs` — só nas execuções de aplicação (`dryRun: false`); o dry-run não grava auditoria.

⚠️ **Nota operacional:** um `merge` apaga linha em `customers` e reponta `conversations`/`messages` — sempre `dryRun: true` primeiro, revisar **cada** linha de `entries` com o dono, só então `dryRun: false`, repetindo com `cursor: nextCursor` até `nextCursor: null`.

### `waha-webhook` (pública, POST, `verify_jwt: false`, HMAC-gated internamente)

Recebe eventos `message` e `session.status`. Fail-closed: nenhuma escrita no banco acontece antes da verificação HMAC (SHA-512, header `X-Webhook-Hmac`). Resolve a conta pelo índice único de `sessionName`. Para `message`: resolve/cria cliente, resolve/reabre/cria conversa, insere a mensagem (mídia é um passo separado após o insert, nunca no mesmo insert), baixa mídia quando presente e sobe para o bucket `whatsapp-media` no mesmo path já coberto pela policy existente. Idempotência via `processed_events`, chave `whatsapp:waha:<accountId>:<eventId>` escopada por conta (lição do incidente de colisão de eco de mídia entre instâncias). A marcação do evento como processado é **diferida** até o trabalho correspondente ter de fato sido persistido — uma checagem (SELECT) acontece cedo para rejeitar retries genuínos rápido, mas o `INSERT`/`upsert` em `processed_events` só ocorre depois que a escrita que ele protege teve sucesso; isso evita que uma falha transitória no insert de cliente/conversa/mensagem trave permanentemente um retry legítimo do WAHA (corrigido durante a implementação — ver `.superpowers/sdd/task-11-report.md`).

### Resolução de `@lid` (remetente com número oculto)

`@lid` é o identificador de privacidade do WhatsApp: quando o remetente tem essa configuração de privacidade ativa, a WAHA entrega o evento com `from` no formato `<dígitos>@lid` em vez de `<telefone>@c.us` — os dígitos do `@lid` **não são o telefone** (convertê-los cegamente para "+telefone" fabrica um cliente-fantasma com prefixo de país impossível). O parser (`parser.ts`) sinaliza esse caso via `IInboundMessage.fromLid` (o JID cru), deixando `fromPhone` vazio em vez de tentar converter.

O `waha-webhook` resolve o `@lid` para o telefone real **antes** da resolução/criação de cliente:

1. **`resolveWahaLid`** (`src/providers/whatsapp/waha/contacts.ts`, espelhado em `_shared/`) chama `GET /api/{session}/lids/{digits}` — o segmento de path recebe **só os dígitos** do `@lid` (sem o sufixo `@lid`, sem escape) — e converte o `pn` retornado (`<dígitos>@c.us`) para E.164. Um 404 (lid desconhecido) ou `pn` vazio volta como "não resolvido"; outros erros (rede, autenticação) propagam e são capturados pelo webhook, que degrada para o fallback abaixo — a resolução nunca derruba a recepção.
2. **Timeout de 5 s** (mais curto que os 10 s default do engine): a chamada acontece **antes** da marcação de idempotência (`processed_events`), então não pode ultrapassar o próprio timeout de entrega/retry da WAHA — um lookup lento aqui travaria o retry do lado do servidor, não só a resposta ao chamador.
3. **Semeadura do nome em cliente novo:** `getWahaContactName` (mesmo arquivo) chama `GET /api/contacts?contactId=<id>&session=<sessionName>` e tenta, em ordem, `pushname` → `name` → `shortName` (cada valor `trim()`ado; valores só-espaço são descartados). É usada tanto para remetentes `@lid` quanto para `@c.us` normais — todo cliente novo criado pelo `waha-webhook` agora tenta semear `full_name`/`whatsapp_name` a partir do contato, em vez do telefone puro como antes.
4. **Fallback quando o `@lid` não resolve:** `phone` recebe um placeholder `+<dígitos-do-lid>` — **nunca um telefone validado**, mantido só para a conversa continuar encadeando de forma consistente (o mesmo `@lid` sempre gera o mesmo placeholder, logo o mesmo cliente); `full_name` tenta primeiro o nome do contato (passo 3, que ainda funciona mesmo sem o telefone real — o endpoint de contatos aceita `@lid` diretamente) e só cai para o rótulo fixo **"Contato do WhatsApp (número oculto)"** quando nem isso resolve — os dígitos do `@lid` **nunca** aparecem como se fossem um nome; e `tags` ganha `"lid_unresolved"` para triagem manual (ver ação `backfillLids` acima, que corrige esses registros depois).

### Espelhamento de eco de saída (`fromMe: true`)

Quando alguém responde uma conversa **direto pelo celular pareado** (fora da plataforma), a WAHA entrega uma mensagem com `fromMe: true` — mas **não** no evento `message` (esse é só para recebidas de terceiros). O parser (`parser.ts`, retorna `IOutboundEcho`) já reconhecia o payload desde a implementação inicial, mas o evento nunca chegava: a lista de eventos assinados (`WAHA_DEFAULT_EVENTS`) só incluía `message`/`session.status`, e a WAHA (engine GOWS) só emite `fromMe: true` no evento `message.any`. Descoberto em 2026-07-12 via um webhook de depuração que o usuário registrou manualmente no n8n (capturando o payload bruto de outra sessão) — até então o sintoma parecia "mensagens não chegam" de forma intermitente, mas na verdade **nenhum** eco de saída jamais tinha chegado (200 silencioso descartado em `envelope.event !== "message"`), e as mensagens recebidas de terceiros sempre funcionaram normalmente. Corrigido assinando `message.any` também (`WAHA_DEFAULT_EVENTS = ["message", "message.any", "session.status"]`) e, no webhook, processando `message.any` **somente** quando `parsed.type === "outbound-echo"` — o resto é ignorado para não reprocessar uma mensagem recebida que já chegou via `message`. Sessões já criadas antes da correção precisam de `updateConfig` (reenviar a config completa) para a WAHA passar a assinar `message.any` nelas. O espelhamento em si segue o mesmo desenho já validado em produção pela pipeline compartilhada (`_shared/whatsapp/webhook/core.ts`, seção "3.5 Outbound echoes" — **não importada** aqui, só o padrão foi replicado localmente por isolamento):

1. **Dedup por `provider_message_id` ANTES de qualquer escrita:** uma mensagem enviada pela própria plataforma (via `waha-send`) também ecoa de volta — sem essa checagem viraria uma segunda linha duplicada. `waha-send` carimba o mesmo `id` que a WAHA depois reporta como `payload.id` no eco.
2. **`@lid` do lado do destinatário:** o `to` de um eco também pode vir como `<dígitos>@lid` (a pessoa pra quem se respondeu tem a privacidade ativa) — resolvido com o mesmo `resolveWahaLid`/fallback/rótulo neutro do lado de entrada (achado e corrigido numa revisão adversarial antes do deploy; sem isso repetiria o bug de cliente-fantasma corrigido mais cedo no mesmo dia).
3. **Busca só em conversa ABERTA** (exclui `resolvida`/`arquivada`): um eco nunca reabre uma conversa fechada — abre uma nova, mesma regra do design de 2026-07-03 §1.5 da pipeline compartilhada.
4. **Conversa nova fica SEM DONO** (`assigned_seller_id: null`, `status: "aguardando"`): o webhook não tem como saber qual atendente respondeu do celular, então cai na fila para alguém assumir pelo app.
5. **Mensagem:** `direction: "out"`, `author_type: "seller"`, `author_id: null` (autor desconhecido), `status: "sent"`. Mídia é baixada como passo separado (best-effort, nunca derruba a resposta do webhook), reaproveitando o mesmo helper do caminho de entrada.

Três blocos que antes só existiam inline no caminho de entrada (busca de cliente por telefone, download+upload de mídia, log de sucesso em `integration_logs`) foram extraídos em closures locais (`findCustomerByPhone`/`attachMedia`/`logWebhookSuccess`) reaproveitadas pelos dois caminhos — refatoração puramente mecânica, confirmada byte-a-byte na revisão.

**Achados da revisão adversarial que ficaram registrados como dívida técnica, não corrigidos** (pré-existentes na plataforma inteira, não introduzidos por esta mudança) — ver `docs/fase2-pendencias.md` §C4 (corrida rara entre o carimbo de `provider_message_id` do envio e o eco do próprio envio, pode deixar uma mensagem presa em `queued` com uma duplicata) e §C5 (o caminho de entrada, em qualquer engine, não retorna cedo numa falha de INSERT de mensagem — baixa mídia órfã e loga sucesso falso; o novo caminho de eco já trata isso certo).

### `waha-send` (POST, `verify_jwt: true`)

Permissão verificada **consumindo** a RPC `can_access_conversation` já existente, chamada com o JWT do próprio chamador (para que `auth.uid()` resolva corretamente dentro da função `SECURITY DEFINER`) — reaproveita o portão congelado em vez de reimplementar uma cópia paralela da lógica. Persist-before-send: insere a mensagem com `status='queued'`, despacha via `sendText`/`sendImage`/`sendFile`, atualiza `status` conforme o resultado. Sem checagem de janela de 24h (regra específica do Meta oficial, não aplicável a este engine) e sem transição automática de status da conversa no envio — ambas deferidas por design, documentadas no design spec.

### Paridade de ações de conta (`whatsapp-import-history` / `whatsapp-avatar-sync`)

Diferente das 3 edges acima, `whatsapp-import-history` e `whatsapp-avatar-sync` **não são isoladas** — já eram compartilhadas entre Evolution e Evolution Go antes da WAHA existir, com um core de aterrissagem (`landNormalizedChat`, em `_shared/whatsapp/import/core.ts`) engine-agnóstico. A WAHA entra como 3º branch em ambas:

- **`whatsapp-import-history`** — `processWahaImportBatch` (`_shared/whatsapp/import/waha-history-core.ts`, espelhado de `src/providers/whatsapp/import/waha-history-core.ts`) pagina `GET /api/{session}/chats` e `GET /api/{session}/chats/{chatId}/messages`, resolve `@lid` via `resolveWahaLid` (mesmo helper do webhook/backfill) e aterrissa via `landNormalizedChat`. Mesmo contrato de lote/cursor (`{done, nextCursor, stats}`) que a Evolution já usa — o diálogo `ImportConversationsDialog` não sabe qual engine está por trás.
- **`whatsapp-avatar-sync`** — novo `fetchPicUrl` via `fetchWahaProfilePictureUrl` (`GET /api/contacts/profile-picture`), mesmo mecanismo de injeção que o branch Evolution Go já usa.
- Ambas resolvem servidor/chave via um `wahaServer.ts` local por edge (mesma convenção do `goServer.ts` — sem `_shared/wahaServer.ts` ainda).

Spec: `docs/superpowers/specs/2026-07-12-waha-account-actions-parity-design.md`.

### Status de deploy

As 3 funções foram deployadas e confirmadas `ACTIVE`: `waha-connect` (`verify_jwt: true`), `waha-webhook` (`verify_jwt: false`, pública, gated internamente por HMAC), `waha-send` (`verify_jwt: true`).

---

## 5. Formato da API WAHA

- **Estados de sessão** (`WAHA_SESSION_STATES`): `STOPPED`, `STARTING`, `SCAN_QR_CODE`, `WORKING`, `FAILED`. Mapeados para o status interno da plataforma (`wahaStateToAccountStatus`): `WORKING` → `connected`; `STOPPED`/`FAILED` → `disconnected`; `STARTING`/`SCAN_QR_CODE`/desconhecido → `pending`.
- **Envio**: `POST /api/sendText` (texto, `{session, chatId, text}`), `POST /api/sendImage` (mídia tipo imagem) e `POST /api/sendFile` (demais tipos de mídia — áudio/vídeo/documento), ambos com `{session, chatId, file: {mimetype, url, filename}, caption?}`. `chatId` é o telefone normalizado (`<dígitos>@c.us`). A resposta é lida por `id` como `providerMessageId`.
- **Webhook**: eventos assinados via `X-Webhook-Hmac` (HMAC-SHA512 sobre o corpo bruto da requisição, chave = segredo do Vault apontado por `waha_servers.webhook_hmac_ref`), verificação em tempo constante (`timingSafeEqualStrings`). Lista de eventos subscritos na criação/atualização da sessão: `WAHA_DEFAULT_EVENTS = ["message", "message.any", "session.status"]` (`message.ack` fica para uma 2ª fase — ver seção 7). `message` cobre só mensagens recebidas de terceiros; `message.any` é o único canal por onde a WAHA entrega `fromMe: true` (eco de saída, seção "Espelhamento de eco" acima) — os dois nunca se sobrepõem no mesmo envelope, então não há double-processing por assinar ambos.

---

## 6. Cutover

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
