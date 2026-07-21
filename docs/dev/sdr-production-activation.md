# SDR em Produção — ativação real (Parte B)

> Fecha a cadeia Fundação → Ativação: liga de fato o agente SDR (recepção e
> triagem, sem valores comerciais) à inbox de produção. `sdr_enabled=false`
> em todas as lojas por padrão — nada muda no comportamento observável até o
> dono ligar manualmente uma loja piloto na UI.

## Contexto — o que a Fundação (Parte A) já deixou pronto

A Parte A (PR #287, v0.144.0 `Usher`, mergeada em 2026-07-15) entregou 100%
inerte: os módulos puros de `supabase/functions/sdr-respond/` (`guardrails`,
`llmDecision`, `enforceGuardrails`, `systemPrompt`, `enrichment` — sem
`index.ts`, sem handler HTTP), a tabela `sdr_settings` (per-loja), o trigger
`sdr_pause_on_human_message` em `messages` ("pausa por humano é sagrada" —
garantia de banco, não de aplicação) e o motivo de escalonamento
`qualified_handoff`. Esta Parte B liga tudo isso a tráfego real.

## Arquitetura — dois workers

Duas Edge Functions novas, **públicas** (`verify_jwt off`), protegidas por
shared secret `x-worker-secret` (`SDR_WORKER_SECRET`, Vault) — mesmo padrão
de `scheduled-send-worker`. Nunca chamadas por usuário logado, só server-to-
server.

| Worker | Papel | Disparo |
| --- | --- | --- |
| `sdr-respond` | Roda **um turno** do agente (contexto → LLM → guardrails → envio → handoff/close) | Chamado pelo `sdr-backstop-tick` **e** pelo `whatsapp-webhook` |
| `sdr-backstop-tick` | Varre a fila e **ativa** conversas paradas (`is_sdr_active=false → true`) | `pg_cron` a cada 1 min (mesmo padrão de `scheduled-send-tick`) |

### `sdr-respond` — o turno

1. Autentica por `x-worker-secret`; carrega a conversa — no-op (200) se não
   existir ou se `is_sdr_active=false`.
2. `sdr_settings.sdr_enabled` (kill-switch por loja) — no-op se desligado.
3. `ai_settings` — `master_enabled` + `routing[feature='sdr']` (provedor,
   modelo, parâmetros, `systemPrompt` opcional) — mesmo slot que o hub de IA
   já reserva desde a v0.100.0 `Synapse`. Teto de orçamento best-effort
   (`SUM(cost_brl)` do mês em `ai_usage_events`) antes de gastar.
4. Monta o contexto: cliente + detecção de "cliente recorrente", sessão
   `sdr_sessions` (find-or-create), últimas 30 mensagens como transcript.
5. Monta o **system prompt estrutural** (`buildSdrSystemPrompt`, persona
   "Fernando Gallo", regras e o contrato JSON de saída) e, se o dono
   configurou algo na aba Funcionalidades, anexa como **sufixo suplementar**
   — nunca substitui o prompt estrutural.
6. Chama o LLM (`_shared/ai/adapters.ts` — Anthropic/OpenAI/OpenRouter,
   timeout de 60s), interpreta a resposta (`parseSdrLlmDecision`) e roda
   `enforceSdrGuardrails` sobre a decisão — guardrail de código, não confiança
   no prompt.
7. Loga `ai_usage_events` (`source='routed'`, `feature='sdr'`) sempre, mesmo
   quando a ação é `close`/`handoff`.
8. Enriquecimento não-destrutivo do cadastro do cliente (nome/localização só
   se o campo já estiver vazio).
9. **Re-checa `is_sdr_active` imediatamente antes de enviar** — o LLM pode
   levar até 60s, e o trigger de pausa-por-humano pode ter desligado o SDR
   nesse meio-tempo; sem essa checagem, um vendedor que assumiu a conversa
   durante a chamada ao LLM ainda receberia uma resposta do SDR por cima da
   dele.
10. `handoff` → escalona para um vendedor humano via `chooseHumanSeller`/
    `buildContextSummary`/`escalateToHuman` (mesmos engines do PRD-023).
    `close` → só desliga `is_sdr_active`, sem escalar.

### `sdr-backstop-tick` — a ativação

Reescrito em 2026-07-20 depois do incidente de disparo em massa (ver seção
"Incidente 2026-07-20 (disparo em massa)" abaixo) — a elegibilidade deixou de
varrer a fila inteira e passou a exigir **seis condições, todas ao mesmo
tempo**, resolvidas num único round-trip pela RPC `sdr_backstop_candidates`
(`security invoker`, `service_role`-only):

| # | Regra |
| --- | --- |
| 1 | Loja com `sdr_settings.sdr_enabled = true` |
| 2 | Instância com `whatsapp_accounts.sdr_enabled = true` |
| 3 | Em fila: `status='aguardando'` ∧ `assigned_seller_id is null` ∧ `is_sdr_active=false` ∧ `queued_at not null` (índice parcial `conversations_sdr_backstop_queue_idx`) |
| 4 | Última mensagem da conversa é do cliente (`direction='in'`) — evita o SDR "se meter" numa conversa em que um vendedor (ou o próprio SDR) já respondeu por último |
| 5 | Essa última mensagem é posterior ao marco de ativação — `greatest(sdr_settings.sdr_activated_at, whatsapp_accounts.sdr_activated_at)`, carimbado por trigger toda vez que o toggle de loja ou de instância vira `true` |
| 6 | Essa última mensagem tem menos de 24h (proteção contra downtime de cron/instância) |

**O timer de espera passou a contar a partir de `last_inbound_at` (a última
mensagem do cliente), não mais de `queued_at`** — `queued_at` não atualiza
enquanto a conversa permanece em fila (pode ficar parada por meses), e usá-lo
como base do `elapsed` foi a raiz do incidente. Com a base corrigida,
`elapsed = now − last_inbound_at ≥ threshold` volta a significar "o cliente
falou e ninguém respondeu há X minutos".

Para cada loja com candidatas, o tick calcula o horário comercial
(`isWithinBusinessHours`, mesmo engine de `src/features/distribution/engine/`,
espelhado para `_shared/distribution/engine/businessHours.ts`) e o threshold:
**0 minutos fora do horário** (ativação imediata — agora seguro, porque as
regras 4–6 já garantem que só sobra conversa nova com o cliente aguardando),
`sdr_settings.backstop_timeout_minutes` **dentro** do horário. Loja sem
`businessHours` parseável resolve para o ramo "dentro do horário" (threshold
configurado, nunca 0) — default conservador, ao contrário do `?? false`
antigo que resolvia direto pra "fora do horário".

Um cap por tick (`MAX_ACTIVATIONS_PER_TICK = 10`, constante no código, FIFO
por `last_inbound_at` — nunca corta em silêncio, loga
`{ eligible, activated, capped }` a cada tick com atividade) protege contra
qualquer acúmulo residual. Conversas dentro do cap são ativadas
(`UPDATE is_sdr_active = true`, guardado contra corrida entre execuções
sobrepostas do tick) e disparam `sdr-respond` via `fetch` fire-and-forget.

As ~1.620 conversas do backlog histórico da loja piloto (paradas antes da
correção, algumas desde 30/01/2025) **não são tocadas** — ficam
permanentemente inelegíveis pela regra 5 (marco de ativação), sem nenhuma
mutação de dado.

O webhook real (`whatsapp-webhook`) ganhou o callback `onSdrTurn` — quando
uma mensagem inbound cai numa conversa já com `is_sdr_active=true`, dispara
`sdr-respond` em background pra continuar o turno. **Zero mudança no caminho
crítico de ack ao provedor** (best-effort, depois do processamento normal). O
webhook **não** ativa o SDR do zero — só o backstop tick faz isso; o webhook
só dá continuidade a uma conversa que o SDR já está conduzindo.

## Dual-pipeline de dispatch — e por quê

`sdr-respond/dispatch.ts` isola dois caminhos de envio isolados que já
existiam no codebase, sem tocar em nenhum dos dois:

- **Legado** (`meta`/`evolution`/`evolution-go`/`openwa`): reusa
  `processSendRequest` (`_shared/whatsapp/send/core.ts`) — o mesmo núcleo que
  `scheduled-send-worker` já roda sem usuário logado (`sender` com
  `role: "owner"`, permissão de staff via bypass).
- **WAHA**: `waha-send/index.ts` é deliberadamente **"FULLY ISOLATED"** —
  exige JWT de usuário real logado, sem porta de entrada por worker-secret.
  Em vez de forçar uma exceção ali, `dispatch.ts` chama diretamente as
  funções de baixo nível (`sendWahaText`) e persiste a mensagem ele mesmo,
  **espelhando** o que `waha-send/index.ts` faz internamente — sem chamá-lo
  e sem alterá-lo.

`dispatchSdrReply` resolve a conta da conversa e roteia pelo `provider`.

## Onde fica cada peça de configuração

| Aba | O que configura | Escopo |
| --- | --- | --- |
| **Funcionalidades** (hub de IA, `/app/configuracoes/ia`, já existente desde a `Synapse`) | Provedor, modelo, temperatura, **prompt de sistema** do SDR (`ai_settings.routing[feature='sdr']`) | Global (singleton) |
| **Configurações** (dentro de `/app/sdr` — painel dedicado do SDR) | Kill-switch `sdr_enabled` + `backstop_timeout_minutes` (1–60 min) por loja, e o escopo por instância (`whatsapp_accounts.sdr_enabled`) | Por loja + por instância WhatsApp |

A Parte C (2026-07-16) moveu o liga/desliga operacional da 5ª aba "SDR" do
hub de IA (removida) para dentro do painel `/app/sdr` — que já existia como
simulação client-side da Fase 1 e ganhou uma aba "Configurações" real. O
modelo/prompt do SDR **continua** na aba Funcionalidades, sem mudança.

A Parte C também adicionou um **segundo gate obrigatório**: além do
kill-switch por loja, cada instância WhatsApp precisa ser marcada
individualmente em `/app/sdr` → Configurações → Instâncias — nenhuma vem
marcada por padrão, mesmo com a loja inteira ligada. **Atenção:** conversas
sem `whatsapp_account_id` (fila legada pré-multi-instância, ainda existe em
produção — ver `20260620120000_access_model_two_gates.sql`) nunca são
atendidas pelo SDR sob este gate, porque não há instância contra a qual
validar o opt-in. Confira se a loja piloto tem esse tipo de conversa parada
na fila antes de assumir cobertura total do backstop.

## Escalonamento (Parte D)

Se um handoff SDR→humano fica sem resposta, ou se `chooseHumanSeller` não encontrou ninguém
disponível, o tick `sdr-escalation-timeout-tick` (pg_cron, a cada 1 minuto) dispara um broadcast
in-app para todo vendedor com acesso à instância WhatsApp da conversa. Os limiares (minutos até
o broadcast, por modo urgente/normal) ficam em `/app/sdr` → Configurações → bloco
"Escalonamento" — mesma tela e mesma tabela `sdr_settings` do piloto (Parte B/C).

O primeiro vendedor a clicar "Atender agora" no painel flutuante assume a conversa via RPC
atômica (`claim_sdr_escalation`) — sem essa RPC, dois cliques simultâneos colidiam sem detecção
(era um `.patch()` direto do navegador).

**Limitação conhecida, aceita por decisão do dono (2026-07-17):** os hooks client-side legados do
PRD-023 (`useUrgentBroadcastTimer`, `useEscalationQueueTimeoutMonitor`) continuam ativos e
independentes deste tick — rodam com limiares diferentes (`IPlatformSettings.escalation*`, não
`sdr_settings`) sempre que um Owner/Gestor tem o app aberto. Não foram desligados nem retirados
nesta entrega.

## Incidente 2026-07-20 (disparo em massa)

Na primeira ativação real do piloto, fora do horário comercial, o
`sdr-backstop-tick` antigo disparou 16 mensagens do SDR num único burst —
incluindo conversas paradas há meses e casos em que um vendedor já tinha
respondido por último. Causa raiz: threshold 0 fora do horário comercial
fazia **toda** conversa em fila virar elegível instantaneamente, sem corte de
recência, sem checar quem falou por último e sem cap de batch. O dono
desligou os toggles e pausou os 2 crons do SDR; as 16 mensagens já entregues
ficam como estão (decisão do dono, sem remediação junto aos clientes).

A elegibilidade de 6 condições descrita acima é a correção. Causa raiz
completa e decisões do dono em
`docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md`.

## Checklist manual — (re)ativar uma loja piloto

Nenhum destes passos foi executado por este plano; ficam para quando o dono
autorizar. Checklist atualizado pós-incidente (seção acima) — a migration da
correção dentro do passo 1, o passo 2 (checagem dos crons) e a nota de ordem
no passo dos toggles são novos.

1. **Aplicar as migrations, na ordem:**
   - `supabase/migrations/20260715130000_sdr_activation_schema.sql` primeiro
     — remove `sdr_settings.system_prompt`, cria o índice parcial
     `conversations_sdr_backstop_queue_idx` e mint o secret
     `SDR_WORKER_SECRET` no Vault.
   - `supabase/migrations/20260715150000_sdr_backstop_cron_trigger.sql`
     **só depois** de `sdr-backstop-tick` estar deployado — ela já agenda o
     `pg_cron` que chama a function a cada minuto, então aplicar antes do
     deploy faria o primeiro tick bater num endpoint inexistente.
   - `supabase/migrations/20260720210000_sdr_backstop_eligibility.sql` —
     cria os carimbos de marco de ativação (`sdr_activated_at` em
     `sdr_settings` e `whatsapp_accounts`), o trigger compartilhado que os
     grava e a RPC `sdr_backstop_candidates` que o `sdr-backstop-tick`
     reescrito (ver "Incidente 2026-07-20" acima) já espera encontrar.
     **Aplicar antes de re-armar os crons** (próximo passo) — re-armar antes
     dela faria o primeiro tick seguinte falhar (RPC inexistente) em vez de
     simplesmente não achar candidatas.
   - (As duas migrations da Fundação — `sdr_settings` e
     `sdr_pause_on_human_message` — já estão aplicadas em produção desde o
     merge da Parte A.)
2. **Conferir que os crons do SDR estão ativos** — ambos foram pausados
   (`cron.alter_job(..., active := false)`) depois do incidente. Re-armar
   (`cron.alter_job(..., active := true)`) e confirmar com:
   ```sql
   select jobname, active from cron.job where jobname like 'sdr%';
   ```
   Esperado: `sdr-backstop-tick` e `sdr-escalation-timeout-tick` com
   `active=true`. Seguro fazer isso com todos os toggles `sdr_enabled`
   ainda desligados — os dois gates (loja + instância) fazem o tick virar
   no-op integral.
3. **Deploy das Edge Functions:** `sdr-respond`, `sdr-backstop-tick` (RPC +
   engine de elegibilidade reescritos) e `sdr-escalation-timeout-tick`
   (ganhou os mesmos dois gates nesta correção).
4. **Redeploy do `whatsapp-webhook`** — esta Parte B modificou essa function
   (já em produção) pra adicionar o callback `onSdrTurn` (ver seção
   "Arquitetura — dois workers" acima). **Não é opcional e não é só o
   primeiro turno**: o backstop tick ativa a conversa e dispara `sdr-respond`
   uma única vez; toda mensagem seguinte do cliente depende do
   `whatsapp-webhook` já deployado reconhecer `is_sdr_active=true` e
   disparar `onSdrTurn` pra continuar o turno. Sem este redeploy, o SDR
   responde a primeira mensagem da conversa e nunca mais — parece "morto"
   depois de um turno, mas na verdade é o webhook rodando a versão antiga
   sem o callback.
5. **Configurar o roteamento de IA** na aba Funcionalidades (provedor, modelo,
   opcionalmente um prompt suplementar) para `feature='sdr'`, se ainda não
   estiver.
6. **Escolher a loja piloto** e ligar o toggle "SDR ativo nesta loja" em
   `/app/sdr` → aba **Configurações** (não mais na aba SDR do hub de IA,
   removida na Parte C), ajustando `backstop_timeout_minutes` se o padrão
   (2 min) não servir. **Em seguida, marcar explicitamente cada instância
   WhatsApp** que deve receber o SDR, na mesma aba — nenhuma vem marcada por
   padrão. Conversas sem instância associada (fila legada) não são
   atendidas por este mecanismo. **Ligar os toggles por último, depois de
   todos os passos anteriores** — o trigger da migration carimba
   `sdr_activated_at` no instante exato em que o toggle (de loja ou de
   instância) vira `true`, e só mensagem de cliente **posterior** a esse
   carimbo conta para elegibilidade (regra 5 da tabela acima). No tick
   seguinte à religada, esperado nos logs: `activated=0` — só volta a
   ativar quando chegar uma conversa nova do cliente.
7. **Smoke manual** com uma conversa real — fora de escopo deste plano,
   fica a cargo do dono.

Com todas as lojas desligadas, aplicar as migrations e deployar as functions
**não muda nada observável em produção** — o kill-switch por loja é a única
coisa que liga o comportamento nas conversas reais.

## Gaps encontrados durante a implementação (não estavam no plano original)

Cinco bugs reais foram achados e corrigidos ao longo da implementação desta
Parte B — vale documentá-los para quem for mexer nesse código depois não
precisar redescobrir na marra.

### 1. `author_type` hardcoded "seller" desligaria o próprio SDR

O pipeline legado de envio (`processSendRequest` → `insertQueuedMessage` em
`_shared/whatsappSendAdapter.ts`) gravava `author_type: "seller"`
incondicionalmente para toda mensagem outbound. Como o trigger
`sdr_pause_on_human_message` (Parte A, já em produção) desativa o SDR
automaticamente ao ver `author_type='seller'`, isso faria o **próprio SDR se
desligar sozinho logo depois da primeira resposta**, em qualquer conta
`meta`/`evolution`/`evolution-go`/`openwa` — silenciosamente, sem erro visível.

**Fix:** um campo dedicado `ISender.isAutomatedSdr?: boolean`
(`src/providers/whatsapp/send/core.ts`), **não** sobrecarregando o campo
`role` existente. Reaproveitar `role: "sdr"` foi tentado e rejeitado por dois
motivos: (a) o gate de permissão do `processSendRequest`
(`STAFF_ROLES = ["owner", "manager"]`) não inclui `"sdr"` — o envio falharia
com 403 em **toda** chamada; (b) `"sdr"` já é um valor real e distinto de
`profiles.role` para atendentes humanos de SDR — derivar `author_type` de
`role === "sdr"` faria uma mensagem legítima de um humano SDR também ser
gravada como `author_type='sdr'`, desligando a proteção do trigger
exatamente para esse papel. `dispatchLegacy` monta o `sender` como
`{ sellerId: null, role: "owner", storeId, isAutomatedSdr: true }` —
`role: "owner"` preserva o bypass de permissão de staff, `isAutomatedSdr`
é o sinal dedicado que vira `author_type='sdr'` na persistência.

### 2. Contas WAHA não podem passar pelo pipeline legado

`waha-send/index.ts` é deliberadamente **"FULLY ISOLATED"** — exige JWT de
usuário logado e não tem porta de entrada por worker-secret, por desenho. Por
isso `sdr-respond/dispatch.ts` tem dois caminhos de despacho separados: o
legado via `processSendRequest` para `meta`/`evolution`/`evolution-go`/
`openwa`, e uma chamada direta a `sendWahaText` (espelhando, não chamando,
`waha-send/index.ts`) para contas `waha` — ver seção "Dual-pipeline" acima.

### 3. Migrations desatualizadas em relação ao schema real de produção

Vários arquivos de migration versionados em `supabase/migrations/` estão
desatualizados em relação ao schema real de produção (hábito antigo de
migrations de POC alteradas diretamente, nem sempre re-registradas em
arquivo). `sdr-respond/index.ts` precisou de três correções contra o schema
**vivo**, confirmadas via consulta direta ao banco de produção:

- `sdr_escalations.id` é `uuid` em produção — mas o engine puro de
  escalonamento (`escalateToHuman`) minta um id no formato
  `escalation-<sessionId>-<timestamp>` (texto, não uuid). O insert usa um
  `crypto.randomUUID()` recém-gerado para a linha real; nada mais no handler
  depende do valor de `escalation.id` do engine. (O mesmo bug latente existe
  no consumidor client-side `supabaseSdrEscalationsProvider.create` — nunca
  foi exercitado contra uma tabela `uuid` real até este plano; não corrigido
  ali, fora de escopo.)
- `customers` não tem coluna `city` — a localização real fica em
  `customers.address->city` (jsonb, `ICustomerAddress`). Leitura e escrita
  do enriquecimento passam pelo objeto `address` inteiro (merge, não
  sobrescrita).
- Um bug de captura de id de sessão (não relacionado a schema): o id de uma
  linha `sdr_sessions` recém-criada estava sendo descartado e re-sorteado
  aleatoriamente na hora do handoff — gerando um `session_id` órfão na
  escalação e perdendo o `started_at` real (o "tempo em atendimento SDR"
  mostrado ao vendedor sempre lia ~0). Corrigido capturando `sessionId`/
  `sessionStartedAt` em variáveis mutáveis, gerando o id uma única vez e
  reusando-o em todo o handler.

### 4. Corrida entre execuções sobrepostas do tick

`sdr-backstop-tick` roda a cada minuto; se uma execução levar mais de 60s
(fila grande o suficiente), a próxima pode começar antes da anterior
terminar. O guard original (`UPDATE ... WHERE is_sdr_active = false`, sem
inspecionar quantas linhas foram afetadas) protegia a linha no banco — só uma
das duas escritas concorrentes realmente flipa `is_sdr_active` — mas **não**
protegia o disparo do `sdr-respond`: as duas execuções viam `error: null` e
as duas disparavam `fetch` para a mesma conversa, resultando em duas
respostas do SDR pro mesmo turno do cliente.

**Fix:** encadear `.select("id")` depois do `.update()` e checar se a linha
retornada é não-vazia antes de incrementar `activated` e disparar o fetch —
um array vazio significa que esta execução perdeu a corrida (uma concorrente
já flipou a linha), e o loop simplesmente pula pra próxima conversa sem
disparar nada.

### 5. Reatribuição do handoff sem guarda contra retomada humana no meio do turno

O Step 14 do `sdr-respond` já reconferia `is_sdr_active` direto do banco
imediatamente antes de enviar a resposta — porque a chamada ao LLM pode levar
até 60s, tempo em que um humano real pode assumir a conversa. Essa guarda só
protegia o *envio*: o Step 15 (branch de handoff) continuava reatribuindo a
conversa (`assigned_seller_id`/`is_sdr_active=false`) incondicionalmente,
podendo sobrescrever a retomada humana.

**Fix:** acrescentado `.eq("is_sdr_active", true)` na atualização de
reatribuição (espelhando a guarda de idempotência do `sdr-backstop-tick`) +
`.select("id")` para distinguir "falhou de verdade" (`ctx.log.error`) de
"perdeu a corrida pra uma retomada humana" (`ctx.log.warn`, não é erro).

**Resíduo aceito, não corrigido:** no cenário de corrida, o registro em
`sdr_escalations` ainda é inserido com `status='assigned'` apontando pro
vendedor que a cascata escolheu, mesmo que a reatribuição da conversa em si
tenha virado no-op. Verificado que isso é só cosmético — a tabela não tem
trigger de inserção (ninguém é notificado), e nenhum consumidor usa
`sdr_escalations.assigned_seller_id` pra guiar a posse real da conversa
(`conversations.assigned_seller_id`, a fonte da verdade, fica intacta). Vale
uma limpeza futura (status "superseded" nesse cenário), fora de escopo desta
entrega.

## Gaps herdados da Parte A (conhecidos, não endurecidos nesta entrega)

Dois pontos de hardening que já existiam na Fundação e seguem como estão —
documentados aqui para não serem redescobertos:

- **Delimitador anti-injection sem escaping.** `systemPrompt.ts` e o sufixo
  de `routing.systemPrompt` em `index.ts` cercam todo texto de origem externa
  (nome preferido, resumo de histórico, orientação do dono) entre marcadores
  `<<< ... >>>`, com uma instrução explícita ao modelo pra tratar o conteúdo
  como dado, nunca como instrução nova. É uma cerca de prompt (soft fence),
  não uma garantia estrutural: o conteúdo cercado não tem os caracteres
  `<<<`/`>>>` escapados, então um cliente cujo nome ou mensagem contenha
  literalmente essa sequência poderia, em teoria, "fechar" o cercado
  antecipadamente e anexar texto que o modelo interpretasse como instrução
  nova. Mitigado na prática pelos guardrails de código que rodam depois
  (`enforceSdrGuardrails`), que não dependem do modelo ter obedecido a cerca
  — mas o escaping em si não foi implementado.
- **Guardrail de valor comercial não pega valor por extenso.**
  `containsCommercialValue` (`guardrails.ts`) é um scanner de regex
  deliberadamente simples — pega `R$ 95,00`, `10%`, e palavras como
  "desconto"/"frete"/"promoção"/"prazo" + dias. Ele **não** pega um preço
  escrito por extenso ("custa noventa e cinco reais"), porque nenhum padrão
  depende de dígitos nem inclui as palavras "real"/"reais" isoladas — um
  valor assim escaparia do guardrail de pós-processamento. O system prompt
  já instrui o modelo a nunca mencionar preço (regra estrutural), então esse
  gap depende do modelo desobedecer ativamente a instrução para ser
  explorado — mas, sendo um guardrail de código e não de confiança no
  prompt, vale endurecer antes de expandir o piloto além da fase inicial.

## Fora de escopo (mantido da Fundação)

- Geração automática de orçamento (PRD-022).
- Qualquer menção a preço, desconto, disponibilidade de estoque ou prazo de
  entrega — o SDR v1 é só recepção e triagem.
- Backstop para conversas já atribuídas a um vendedor (só fila sem dono).
- Disclosure de "assistente virtual" na persona (decisão explícita do dono).
- Métricas/dashboard dedicados ao piloto SDR (entrega própria, se o piloto
  validar).

## Troubleshooting

- **SDR não responde numa loja piloto ativada** → confira, nesta ordem:
  `sdr_settings.sdr_enabled=true` pra loja certa; `ai_settings.master_enabled`
  e `routing[feature='sdr'].enabled`; se a chave do provedor está resolvendo
  no Vault; teto de orçamento mensal não estourado.
  `sdr-respond` responde `{ skipped: "..." }` em 200 pra cada uma dessas
  condições — não é erro, é no-op — então checar os logs da function primeiro.
- **SDR respondeu duas vezes pro mesmo turno** → sintoma do gap #4 acima, se
  a correção não tiver sido deployada; ou uma corrida entre backstop-tick e
  webhook (mitigada pela re-checagem de `is_sdr_active` no passo 9 de
  `sdr-respond`, mas não elimina 100% a janela).
- **SDR "morreu" depois de responder uma vez, numa conta não-WAHA** →
  sintoma do gap #1 acima, se a correção (`isAutomatedSdr`) não estiver
  presente no `dispatchLegacy` atual.
- **Handoff sem registro em `sdr_escalations`** → checar os logs por
  `"sdr-respond escalation insert failed"` — o handler não lança erro nesse
  caso (a resposta já foi enviada ao cliente no passo anterior), só loga.

## Desvios do plano original (registrados)

1. **Config concentrada em `/app/configuracoes/ia`** em vez de uma tela
   `/app/configuracoes/sdr` dedicada — decisão desta sessão, documentada em
   `docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md`.
2. **4 bugs reais encontrados e corrigidos durante a implementação** (seção
   acima) — nenhum estava previsto no plano original; todos documentados
   inline no código com comentários `NOTE (schema drift...)` ou equivalente.
3. **2 gaps de hardening conhecidos, não endurecidos** (delimitador sem
   escaping, guardrail sem cobertura de valor por extenso) — herdados da
   Fundação, avaliados como aceitáveis para o escopo de piloto controlado,
   mas registrados para revisão antes de expandir.

---

**AILA — Sistemas Inteligentes**
