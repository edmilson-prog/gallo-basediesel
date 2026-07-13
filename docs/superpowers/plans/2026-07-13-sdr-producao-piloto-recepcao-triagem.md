# SDR em Produção — Piloto de Recepção e Triagem (Design)

> **Status:** design aprovado em 2026-07-13, pendente de plano formal task-by-task (superpowers:writing-plans). Escrito na worktree `D:\claude\gallo-basediesel\.claude\worktrees\sdr-implementation` (branch `worktree-sdr-implementation`).

**Objetivo:** ligar o agente SDR (hoje só uma simulação mock-first, nunca tocado por tráfego real) à inbox de produção, num escopo deliberadamente reduzido — **recepção e triagem, sem valores comerciais** — como piloto controlado antes de qualquer expansão (orçamento automático, LLM com mais autonomia, etc.).

---

## Contexto — o que já existe vs. o gap real

Os PRDs 020 (Simulação SDR), 022 (Orçamento via SDR), 023 (Escalonamento) e 024 (Painel SDR) estão **implementados de verdade** — engine de máquina de estados, geração de orçamento, escalonamento com resumo de contexto, painel `/app/sdr` completo, tabelas reais `sdr_sessions`/`sdr_escalations` com RLS em produção. O campo "Status de Implementação" desses PRDs ficou desatualizado (diz "PENDENTE"), mas o código existe e os testes passam.

O que falta — e é o motivo de "não estar em produção" — são três lacunas concretas, confirmadas por leitura direta do código:

1. **A ativação nunca roda no caminho real.** O engine de distribuição (`src/features/distribution/engine/distribute.ts`, modos `sdr_first` / fora-do-horário / `hybrid`) só é chamado por `conversations.create()` — usado quando a própria equipe inicia uma conversa. O webhook real (`src/providers/whatsapp/webhook/core.ts`) sempre cria conversas novas como `status='aguardando'`, `assigned_seller_id=null`, **sem tocar em `is_sdr_active`** — por desenho, para landar no pool do modelo de "2 portões" (Turnstile). Ou seja: o cenário central do problema ("cliente manda mensagem sábado de manhã") hoje não aciona nada.
2. **O proxy de LLM é Owner-only por desenho.** `supabase/functions/ai-generate/index.ts` exige `requireCaller(req, ["owner"])` — correto para o Playground, mas o webhook não tem usuário logado. O SDR precisa de um caminho que reuse os adaptadores (`_shared/ai/adapters.ts`) sem esse gate.
3. **Não existe onde guardar configuração real.** `IPlatformSettings.sdrEnabled`/`sdrTemplates`/etc. existem no tipo (`src/shared/types/platform.ts:234-259`) mas não na tabela real (`src/providers/data/impl/supabase/settings.ts` não tem essas colunas) — hoje só existem no mock.

O pause-by-human (`useSdrPauseOnHumanIntervention`) também só existe como hook client-side no mock — não é aplicado a dados reais.

---

## Decisões de arquitetura aprovadas

### 1. Motor: híbrido (LLM + regras de código)

O LLM (via adaptadores já existentes em `_shared/ai/adapters.ts`, modelo resolvido pelo roteamento por funcionalidade que já existe em Configurações → IA, que já reserva um slot para "SDR") cuida de entender texto livre e gerar a resposta natural. **Todo o resto é decidido por código determinístico, não por instrução de prompt**: guardrails, trigger de escalonamento, pausa por humano, dados coletados. Isso reaproveita os engines já testados de PRD-023 (`chooseHumanSeller`, `buildContextSummary`) e mantém tudo auditável.

### 2. Ponto de entrada: Edge Function dedicada `sdr-respond`

Nova Edge Function, **não** o `whatsapp-webhook` (código sensível, idempotente, testado — não deve carregar latência de LLM no ack ao provedor). O webhook ganha só uma chamada adicional *fire-and-forget* ao final do processamento (mesmo padrão já usado para `onCustomerAutoCreated`/sync de avatar), passando `conversationId`. `sdr-respond`:

- confere se a loja/instância está no piloto (via `sdr_settings`, ver item 3) — se não estiver, no-op;
- busca contexto (sessão SDR, histórico do cliente, dados já coletados);
- chama o LLM direto via `_shared/ai/adapters.ts` (sem passar pelo `ai-generate` HTTP, que é Owner-gated);
- decide a ação dentro dos guardrails (ver seção de regras);
- grava a mensagem (`authorType='sdr'`) e despacha via `whatsapp-send` — o mesmo pipeline que vendedores humanos usam, para status/Realtime/failover continuarem funcionando sem duplicar lógica;
- grava `ai_usage_events` (`source='routed'`, `feature='sdr'`) para entrar no orçamento/observabilidade de IA já existente.

### 3. Configuração: tabela `sdr_settings` nova

No padrão de `ai_settings` (singleton/por-loja, RLS Owner-only) — **não** emendada em `platform_settings`. Guarda: toggle `sdr_enabled` por loja/instância (piloto), `sdr_backstop_timeout_minutes` (default 2), textos/system prompt editáveis sem redeploy.

### 4. Pausa por intervenção humana: trigger de Postgres

Em vez do hook client-side atual (só existe no mock, sujeito a race condition e só cobre um cliente por vez): **trigger em `messages`** — `INSERT` com `author_type='seller'` numa conversa com `is_sdr_active=true` seta `is_sdr_active=false` atomicamente. Cobre qualquer caminho de envio (presente ou futuro) sem depender de código de aplicação. "Pausa por humano é sagrada" (princípio já escrito no PRD-020) vira garantia de banco, não de aplicação.

### 5. Ativação: um único mecanismo — tick de fila com threshold sensível ao horário

Como o webhook real nunca chama `distributeConversation` (achado #1 acima), **este design não reativa esse caminho** — ele fica como está, intocado, servindo só quando a própria equipe inicia uma conversa manualmente via `conversations.create()`. Para conversas reais chegando pelo webhook, a ativação do SDR passa a ter **uma única fonte da verdade**: o tick de fila.

Reaproveita a definição de fila **já existente e testada**: `isQueuedConversation` (`src/features/inbox-alerts/engine/isQueuedConversation.ts:13-15`) = `status='aguardando' AND assigned_seller_id IS NULL AND is_sdr_active=false`, e a coluna `conversations.queued_at` (mantida por trigger desde `20260703140000_conversation_queued_at.sql`, zera automaticamente quando a conversa sai da fila).

- **Escopo v1: só fila sem dono.** Conversas já atribuídas a um vendedor ficam de fora, mesmo que demorem — não queremos o SDR interrompendo um atendimento que já tem responsável.
- Novo `pg_cron` job (`sdr-backstop-tick`, a cada 1 minuto — granularidade já usada em produção por `reconcile-derived-notifications` e `scheduled-send-tick`, nenhuma novidade arquitetural): varre conversas em fila e calcula o threshold aplicável por loja — `0` (imediato) se **fora do horário comercial** da loja, `sdr_backstop_timeout_minutes` (default 2) se **dentro** do horário comercial. Reaproveita o mesmo cálculo de horário comercial que `distribute.ts` já usa, só que chamado a partir do tick em vez de a partir de `distributeConversation`. Conversas com `now() - queued_at >= threshold` recebem `UPDATE is_sdr_active=true` (isso automaticamente zera `queued_at` via trigger existente — a conversa sai da fila visualmente porque agora tem alguém, o SDR, cuidando) e disparam `sdr-respond` via `pg_net.http_post`, no mesmo padrão do `scheduled-send-tick` já em produção.
- Fora do horário comercial o threshold zerado reproduz o efeito pretendido pelo "modo fora-do-horário" do PRD-013/020 sem precisar de um segundo mecanismo — mesmo código, parâmetro diferente.
- Precisa de índice parcial novo em `conversations` para o tick não fazer scan completo — não existe hoje.
- Se um vendedor responder depois (mesmo que o SDR já tenha começado a falar), o trigger da seção 4 tira o SDR normalmente — sem conflito entre os dois mecanismos.

---

## Regras de interação

### Persona

O SDR se apresenta como **"Fernando Gallo"** — nome próprio, tom natural, **sem disclosure de que é assistente virtual/automatizado** (decisão explícita do dono). Tom informal PT-BR, alinhado à voz já usada nos templates existentes (emojis moderados, "GALLO BASE DIESEL").

### Escopo: recepção e triagem — nunca decide nada comercial

O SDR v1 **não cota, não negocia, não confirma preço/desconto/prazo**. Função: acolher, entender a necessidade, coletar dados, dar contexto, e entregar para um humano.

**Fluxo:**

1. **Saudação** — personalizada se reconhece o telefone (cliente/lead já existente no cadastro).
2. **Coleta de identidade** — como prefere ser chamado, de onde é (cidade/UF).
3. **Qualificação** — necessidade em texto livre (peça/marca/serviço/dúvida), **sem** tentar identificar item específico do catálogo nem cotar.
4. **FAQ sem risco comercial** — horário de atendimento, região de entrega, formas de pagamento em geral: responde direto, sem escalar, e continua a triagem. Qualquer coisa com valor monetário (preço, desconto, frete) está fora — vira gatilho de escalonamento.
5. **Contexto** — verifica se é cliente novo ou recorrente (`customer` já existe? tem `sellerId`/carteira?) e resume conversas anteriores relevantes do mesmo cliente para dar continuidade.
6. **Entrega** — havendo necessidade real, escala sempre para humano (reaproveita `chooseHumanSeller` do PRD-023: carteira → especialidade → cascata), com resumo rico (nome preferido, localização, necessidade, recorrência, resumo do histórico). Sem necessidade real identificada (a pessoa só bateu papo ou perguntou algo e não retornou), a sessão pode encerrar sem escalar.

### Guardrails de código (não ficam a critério do LLM)

- Nunca menciona preço, desconto ou prazo de entrega específico — qualquer pedido desse tipo é gatilho de escalonamento imediato, não uma pergunta que o modelo tenta responder.
- Nunca continua respondendo depois que um humano assume — garantido pelo trigger de banco (seção de arquitetura, item 4), não pelo prompt.
- Nunca inventa dado — só usa o que veio de consulta real (histórico/cadastro); nunca alucina preço, peça ou prazo.
- Fora do escopo comercial de peças pesadas (concorrentes, assuntos não relacionados, tentativas de "ignore suas instruções anteriores") → escala, não improvisa.

### Motivos de escalonamento

Reaproveita o enum existente de `ISdrEscalation.reason` (`customer_requested`, `sdr_failed`, `complexity`, `out_of_scope`, `negotiation_detected` — este último sem uso prático no v1 já que não há orçamento) **mais um motivo novo**: `qualified_handoff` — o desfecho normal de uma triagem concluída com necessidade real identificada (não é mais uma exceção, é o caminho principal).

### Enriquecimento de dados — não-destrutivo

Nome preferido e localização coletados ficam em `sdr_sessions.collected_data` e aparecem no resumo de handoff. Só enriquecem o cadastro real do cliente (`customer.name`/endereço) se o campo já estiver vazio — nunca sobrescreve dado existente.

---

## Rollout — piloto controlado

- Toggle explícito por loja/instância em `sdr_settings` — só as lojas/instâncias marcadas participam. Fora do piloto, comportamento atual não muda em nada (kill-switch trivial: desmarcar a loja).
- Loja(s) piloto e cronograma de expansão ficam a critério do dono no momento do rollout — não travados nesta spec.
- Ativação 100% via `sdr-backstop-tick` (seção de arquitetura, item 5) — mesmo mecanismo dentro e fora do horário comercial, threshold diferente. Nenhum outro gatilho de ativação entra em jogo para conversas reais do webhook.

---

## Fora de escopo (v1)

- Geração automática de orçamento (PRD-022) — depende de identificação de peça nunca validada com LLM real; entra numa fase 2 do rollout, depois de validar qualificação/escalonamento.
- Qualquer menção a preço, desconto, disponibilidade de estoque ou prazo de entrega.
- Backstop para conversas já atribuídas a um vendedor (só fila sem dono no v1).
- Disclosure de "assistente virtual" na persona.
- Multi-idioma, memória cross-conversa além do resumo de histórico já descrito, aprendizado contínuo.

---

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| LLM alucina preço/peça/promessa | Guardrail de código, não de prompt — SDR nunca tem acesso a ferramenta de cotação no v1; qualquer pedido de valor escala. |
| Latência do LLM atrasa a percepção do cliente | Resposta gerada fora do caminho crítico do webhook (Edge Function separada, fire-and-forget); backstop tem threshold próprio, não depende do webhook responder rápido. |
| Custo de LLM foge do controle | Reaproveita o teto de orçamento best-effort já existente (`ai_settings.budget`, `ai_usage_events`) — mesma trilha do restante da área de IA. |
| Tick dispara em duplicidade (execuções concorrentes do cron) | A condição do próprio tick (`is_sdr_active=false` antes de agir) mais o `UPDATE` sendo a primeira ação tornam o disparo idempotente — a segunda execução não encontra mais a conversa em fila. |
| Trigger de pausa e backstop entram em race condition | Trigger de pausa reage a `INSERT` em `messages`; backstop reage a `queued_at` — eventos diferentes, sem sobreposição de escrita na mesma linha no mesmo instante (a pior situação é o backstop ligar o SDR e, segundos depois, um vendedor responder — o trigger de pausa cobre isso normalmente). |
| Confusão entre "Fernando Gallo" (persona) e o Fernando real (dono/vendedor) | Sinalizado ao dono durante o design; decisão consciente de manter o nome. |

---

**AILA — Sistemas Inteligentes**
