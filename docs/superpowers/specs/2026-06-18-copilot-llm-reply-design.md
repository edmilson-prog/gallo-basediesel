# Design — Copiloto: Gerar resposta com IA (Sub-projeto 1)

> **Data:** 2026-06-18
> **Status:** aprovado (brainstorming) — aguardando revisão da spec
> **Feature key de IA:** `conversation_copilot`
> **Antecede:** sub-projetos 2 (resumo via LLM) e 3 (sugestões via LLM), deferidos

## 1. Contexto

A área **Configurações → Inteligência artificial** já entregou a integração LLM real
(`Cortex` v0.102.0 / `Polyglot` v0.103.0 / `Manifest` v0.104.0): a Edge Function
`ai-generate` (Owner-only) chama Anthropic/OpenAI/OpenRouter com a chave do Vault,
aplica teto de orçamento e grava `ai_usage_events`. Em produção a infra está **de pé e
ativa**: `ai-generate` v4 ACTIVE, `master_enabled = true`, chaves de **OpenAI** e
**OpenRouter** configuradas no Vault, e o routing `conversation_copilot` já existe e está
habilitado (`openai / gpt-5.2`, `temperature 0.4`, `maxTokens 1024`,
systemPrompt: *"Você é o copiloto de atendimento da GALLO. Sugira respostas claras e
comerciais."*).

O **Copiloto de Vendas** (PRD-025) é, hoje, **100% determinístico**: um rules engine puro
(3 regras) gera as sugestões e uma heurística monta o resumo. O contrato `ICopilotProvider`
já antecipa `generateReply()` (comentado, "Fase 2"), e a UI tem um botão **"Gerar
resposta"** desabilitado com o badge *"Em breve · IA Fase 2"*
(`src/features/copilot/components/CopilotReply.tsx`). Este é o gancho que este
sub-projeto ativa.

**Decisão central de produto (brainstorming):** conectar a LLM ao copiloto inteiro é o
alvo, mas será **faseado**. Sub-projeto 1 = **gerar resposta sugerida, sob demanda**.
Resumo e sugestões via LLM ficam para sub-projetos 2 e 3 — reusando esta fundação. Nada
dispara LLM automaticamente: o custo só ocorre quando o atendente clica.

## 2. Escopo

### Entra
- Ativar o botão **"Gerar resposta"** do copiloto. Sob demanda, o atendente clica → a LLM
  lê o contexto da conversa → devolve **um rascunho de resposta** em pt-BR. O atendente
  revisa e insere no composer com **"Inserir"**.
- Disponível nos **três placements** do copiloto: `strip`, `card` e `tab` (aba na ficha).
- Nova Edge Function `copilot-generate` (a 12ª) — proxy de produção gated, consumível por
  qualquer atendente autenticado (não Owner-only).
- RPC `ai_feature_enabled(feature)` para o gating do botão no front.

### Não entra (deferido)
- Resumo da conversa via LLM (sub-projeto 2) — permanece heurístico.
- Sugestões via LLM (sub-projeto 3) — o rules engine determinístico permanece intacto.
- Disparo automático ao abrir conversa (decisão: tudo sob demanda).
- Streaming de tokens (resposta volta completa; rascunho é curto).
- Persistência da resposta gerada / histórico de rascunhos.
- Mascaramento de PII (CPF/CNPJ) antes do envio ao provedor — ver §6, endurecimento futuro.
- Refatorar a `ai-generate` (fica intocada — zero blast radius no Playground em produção).

## 3. Arquitetura & fluxo de dados

```
CopilotReply (botão "Gerar resposta")  [strip · card · tab]
        │ onClick
   useCopilotReply(conversationId)
        │ provider.generateReply(conversationId)
   ICopilotProvider
   ├── mock      → rascunho determinístico das mensagens (sem custo, p/ demo)
   └── supabase  → supabase.functions.invoke("copilot-generate", { conversationId })
                         │  (JWT do atendente no header Authorization)
                         ▼
                  Edge copilot-generate  (NOVA, verify_jwt=true)
                   1. requireAnyCaller(req)        → caller + profile + callerClient (RLS)
                   2. valida acesso à conversa     → SELECT via callerClient (RLS / can_access_conversation)
                   3. lê ai_settings (admin)       → masterEnabled + routing[conversation_copilot]
                   4. resolve provider/model/params/systemPrompt DO ROUTING (não do body)
                   5. monta contexto                → buildReplyPrompt(últimas N msgs + cliente)
                   6. budget cap (best-effort)      → resolve chave no Vault (Vault-first)
                   7. chama adapter                 → _shared/ai/adapters.ts (dispatch)
                   8. grava ai_usage_events         → source='routed', feature='conversation_copilot'
                   9. retorna { text }
```

Gating do botão: ao montar o painel, o `supabaseCopilotProvider` chama
`ai_feature_enabled('conversation_copilot')` (booleano) e o hook expõe `enabled`. O botão
só aparece quando habilitado.

## 4. Backend

### 4a. Edge `copilot-generate`
`supabase/functions/copilot-generate/index.ts`, `verify_jwt = true`. Reusa
`_shared/{serve,http,secrets,auth}` e `_shared/ai/adapters.ts`
(`callAnthropic`/`callOpenAI`/`callOpenRouter`/`computeCostBRL`). Os helpers curtos
`monthSpendBRL`, `pricingFor` e `dispatch` (switch de provider) ficam **inline** na função
— **não toco a `ai-generate`** (que está em produção; evitar redeploy/re-teste do
Playground neste sub-projeto). A duplicação é pequena e consciente; uma extração para
`_shared/ai/` pode vir num refactor futuro.

Contrato HTTP (entrada): `{ conversationId: string }`. **Só o `conversationId`** — modelo,
prompt e parâmetros vêm do routing server-side, nunca do body → o atendente não escolhe
modelo nem injeta prompt (sem injeção de custo/jailbreak).

Saída: `{ text: string }` (200). O custo/uso é gravado server-side, o front não precisa.

Erros (HttpError, mensagens em pt-BR tratáveis no front):
- `403` acesso negado à conversa / sem profile.
- `409` IA desligada (master ou feature) — corrida com o gating.
- `400` provider não suportado/sem chave configurada.
- `402` orçamento do mês esgotado.
- `504`/`502` timeout (~60s) / falha do LLM — e **grava `ai_usage_events` status `error`**.

### 4b. `_shared/auth.ts` — `requireAnyCaller`
Adiciono `requireAnyCaller(req): Promise<{ callerId, admin, callerClient, profile }>` que
resolve o caller + profile **sem exigir papel** (só exige profile existir; 401 sem sessão,
403 sem profile) e devolve também o `callerClient` (anon + Authorization) para a checagem
de acesso por RLS. **Não altero `requireCaller`** — as 6 funções existentes que o usam
ficam byte-idênticas no comportamento. (`requireCaller` pode opcionalmente ser
reescrito por cima de `requireAnyCaller` mantendo a mesma assinatura/retorno, se ficar
limpo; caso contrário, fica independente.)

Validação de acesso à conversa: `callerClient.from("conversations").select("id").eq("id",
conversationId).maybeSingle()` — se a RLS (`can_access_conversation`) deixa ver, há acesso;
senão, `403`. Reusa toda a política de acesso existente sem replicá-la.

### 4c. Migration — RPC `ai_feature_enabled`
`ai_feature_enabled(p_feature text) returns boolean`, `SECURITY DEFINER`, `search_path`
fixado, `GRANT EXECUTE` a `authenticated`. Lê a linha singleton `ai_settings` e retorna:

```
master_enabled
  AND (routing[p_feature].enabled = true)
  AND EXISTS (provider em providers com status = 'configured' e enabled = true)
```

Expõe **apenas o booleano** — nunca chaves, budget ou nomes de modelo. Migration
versionada e **espelhada em `supabase/migrations/`** (regra do projeto: todo
`apply_migration` exportado no mesmo PR).

## 5. Frontend

### 5a. Contrato `ICopilotProvider`
```ts
generateReply(conversationId: ID): Promise<string>;       // descomenta o que já estava previsto
isReplyGenerationEnabled(): Promise<boolean>;              // gating do botão
```

### 5b. Implementações
- **mock** (`impl/mock/copilot.ts`): `generateReply` devolve um rascunho **determinístico**
  derivado das mensagens da conversa (sem custo, mantém a demo funcional e os testes
  estáveis); `isReplyGenerationEnabled` → `true`.
- **supabase** (`impl/supabase/copilot.ts`): `generateReply` → `functions.invoke(
  "copilot-generate", { body: { conversationId } })`, com extração de erro pt-BR já usada
  na camada (mesma helper de `ai.ts`); `isReplyGenerationEnabled` → `client.rpc(
  "ai_feature_enabled", { p_feature: "conversation_copilot" })`.

### 5c. Hook `useCopilotReply(conversationId)`
Estado: `{ enabled, generating, reply, error, generate(), clear() }`. `enabled` carregado
uma vez (RPC). `generate()` chama `provider.generateReply`, gerencia loading/erro e guarda
o `reply`. Erro → mensagem tratável; nunca lança para fora.

### 5d. UI
- **`CopilotReply.tsx`**: habilita o botão "Gerar resposta" quando `enabled`; estados
  loading (spinner) e erro (mensagem inline/toast). Ao gerar, exibe o texto na área
  "Resposta" com "Inserir" (→ `onInsert`). **Remove a string hardcoded**
  `"Te envio o boleto e a NF ainda hoje."`: a área "Resposta" passa a ser preenchida
  exclusivamente pela geração.
- **Placements**: `CopilotStrip` já recebe `onInsertReply`. `CopilotCard` e
  `CopilotFicheTab` passam a receber `onInsertReply` também. A `ConversationPage` injeta
  `setDraft` (composer) nos três; para a aba na ficha, o `setDraft` já está acessível na
  página e é passado via o prop `copilotTab`.
- i18n: ajustar `COPILOT_STRINGS` (remover `generateReplySoon`, adicionar rótulos de
  loading/erro/gerar).

## 6. Segurança & privacidade

- O atendente **nunca** escolhe modelo/prompt nem lê `ai_settings`/chaves; tudo é resolvido
  server-side a partir do routing administrado pelo Owner.
- Acesso à conversa validado por RLS (`can_access_conversation`) com o token do caller.
- **PII:** o conteúdo real das mensagens + o nome do cliente são enviados ao provedor
  (OpenAI/OpenRouter). Isso é **inerente** ao recurso de IA — o Playground já envia
  conteúdo livre ao provedor. Registrado explicitamente aqui. Mascaramento de CPF/CNPJ/
  telefones antes do envio é **endurecimento futuro**, fora do v1.
- Teto de orçamento aplicado server-side, best-effort (mesma semântica TOCTOU já conhecida
  e documentada da `ai-generate` — não atômico no v1).
- A `copilot-generate` é um proxy: nunca devolve a chave; só `{ text }`.

## 7. Tratamento de erros & degradação

- Feature desligada → botão não aparece (gating). Corrida → `409` tratado como toast.
- Sem provider/chave → `400` → toast "IA indisponível no momento".
- Timeout/falha do LLM → toast + botão volta ao estado inicial; falha registrada em
  `ai_usage_events` (status `error`) para a telemetria de custo/latência ficar honesta.
- Qualquer erro de geração **nunca** quebra o painel do copiloto (sugestões/resumo
  determinísticos seguem renderizando).

## 8. Testes

- **Engine puro** `buildReplyPrompt` (montagem do transcript: últimas N mensagens
  ordenadas, filtro de vazios/sistema, briefing leve do cliente, truncagem por
  `MAX_PROMPT_LENGTH`) — **testado com Vitest**. A localização canônica (em `src/` com
  espelho na edge, vs. dentro de `supabase/functions/` com `include` do Vitest ajustado)
  será decidida no plano, seguindo o precedente do WhatsApp shared
  (`scripts/sync-whatsapp-shared.ts`). A função pura **não importa nada de Deno**.
- Mock `generateReply` determinístico — teste de estabilidade do rascunho.
- Gate prático de CI: `bun run build` + `bun run test` verdes; checagem de tipos do código
  novo por delta (`bunx tsc --noEmit` tem baseline pré-existente).
- **Verificação e2e real** em produção no fechamento (a chave OpenAI já está no Vault):
  gerar uma resposta numa conversa real e confirmar o registro em `ai_usage_events`
  (`source='routed'`, `feature='conversation_copilot'`).

## 9. Rollout & versionamento

- Branch nova a partir da `main` (a branch atual `chore/eliminate-demo-mock-mode` é de
  outro trabalho).
- Deploy da `copilot-generate` (via CLI Supabase autenticada — caminho preferido do
  projeto) + migration da RPC aplicada e **espelhada no Git** no mesmo PR.
- Bump **MINOR** → **v0.108.0** com codinome novo em inglês (a `main` está em **v0.107.1**,
  base `origin/main` `ce288d2`). CHANGELOG (Keep a Changelog) atualizado no bump. Doc de dev
  em `docs/dev/` (ex.: `copilot-ai-reply.md`).

## 10. Decisões resolvidas no brainstorming

| Decisão | Escolha |
|---|---|
| Escopo do sub-projeto 1 | Só "Gerar resposta" (resumo/sugestões deferidos) |
| Disparo | Sob demanda (clique), nunca automático |
| Autorização do endpoint | Nova Edge `copilot-generate` dedicada (não relaxar a `ai-generate`) |
| Gating do botão no front | RPC mínima `ai_feature_enabled` (booleano) |
| Placements | strip + card + tab (todos os três) |
| Provider/modelo | Resolvido do routing administrado pelo Owner (não escolhido pelo atendente) |
