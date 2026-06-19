# Copiloto — Gerar resposta com IA (Sub-projeto 1)

> **Versão:** v0.108.0 Quill · 2026-06-18
> **Feature key:** `conversation_copilot`
> **Spec:** `docs/superpowers/specs/2026-06-18-copilot-llm-reply-design.md`

## O que foi entregue

O botão "Gerar resposta com IA" do copiloto de vendas foi ativado. O atendente clica → a plataforma monta o contexto da conversa → chama o provedor LLM configurado → devolve um rascunho editável no compositor. Disponível nos três posicionamentos do copiloto: faixa (`CopilotStrip`), card (`CopilotCard`) e aba da ficha (`CopilotFicheTab`).

Resumo e sugestões via LLM permanecem **fora de escopo** (sub-projetos 2 e 3, deferidos). O rules engine determinístico e a heurística de resumo não foram alterados.

## Arquitetura

```
CopilotReply (botão "Gerar resposta com IA")
        │ onClick
   useCopilotReply(conversationId)
        │ provider.generateReply(conversationId)
   ICopilotProvider
   ├── mock      → rascunho determinístico (sem custo, para a demo)
   └── supabase  → supabase.functions.invoke("copilot-generate", { conversationId })
                         │  (JWT do atendente no Authorization)
                         ▼
                  Edge copilot-generate  (verify_jwt=true)
                   1. requireAnyCaller(req)        → caller + profile + callerClient
                   2. SELECT conversations (RLS)   → 403 se sem acesso
                   3. SELECT ai_settings (admin)   → masterEnabled + routing
                   4. resolve provider/model/params/systemPrompt do routing
                   5. buildReplyPrompt(msgs + cliente)
                   6. budget cap (best-effort)     → resolve chave no Vault
                   7. callAdapter(provider, ...)
                   8. grava ai_usage_events        → source='routed', feature='conversation_copilot'
                   9. retorna { text }
```

## Gating do botão

O `supabaseCopilotProvider.isReplyGenerationEnabled()` chama a RPC:

```ts
client.rpc("ai_feature_enabled", { p_feature: "conversation_copilot" })
```

A RPC (`SECURITY DEFINER`, `GRANT EXECUTE` a `authenticated`) retorna `true` somente quando:
- `ai_settings.master_enabled = true`
- `routing['conversation_copilot'].enabled = true`
- Existe pelo menos um provider com `status = 'configured'` e `enabled = true`

O botão só aparece no front quando `enabled = true`. Nenhum detalhe de routing (modelo, chave, budget) trafega para o cliente.

## Segurança

- **Só o `conversationId`** vem do body do cliente. Modelo, prompt e parâmetros são resolvidos server-side a partir do routing administrado pelo Owner — o atendente não pode escolher modelo nem injetar prompt (sem injeção de custo/jailbreak).
- **Acesso à conversa** validado por RLS via `callerClient` (token do atendente). A policy `can_access_conversation` existente cobre toda a lógica de acesso; a edge não a duplica.
- **Chave do provedor** resolvida pelo Vault server-side (`_shared/secrets.ts`); nunca trafega para o front.
- **Autorização:** `requireAnyCaller` — qualquer atendente autenticado com profile. Não é Owner-only. As 6 edge functions existentes que usam `requireCaller` ficam intactas.

## Budget (best-effort)

O teto de orçamento mensal é aplicado da mesma forma que na `ai-generate`: `SUM(cost_brl)` de `ai_usage_events` do mês corrente comparado ao `budget.monthly_brl`. A verificação **não é atômica** (TOCTOU conhecida, documentada). Não endurecida neste v1 — o endurececimento via RPC + lock está listado como pré-requisito antes de plugar consumidores automáticos.

## PII

O conteúdo das mensagens da conversa (incluindo nomes de clientes) é enviado ao provedor LLM (OpenAI ou OpenRouter conforme o routing). Isso é **inerente** ao recurso — o Playground já envia conteúdo livre. O mascaramento de CPF/CNPJ/telefones antes do envio é endurecimento futuro (fora do v1).

## Arquivos principais

| Arquivo | Papel |
|---|---|
| `supabase/functions/copilot-generate/index.ts` | Edge Function nova (12ª) |
| `supabase/functions/_shared/auth.ts` | Adicionado `requireAnyCaller` |
| `supabase/migrations/20260618XXXXXX_ai_feature_enabled.sql` | RPC `ai_feature_enabled` |
| `src/providers/data/contracts/copilot.ts` | Adicionado `generateReply` + `isReplyGenerationEnabled` |
| `src/providers/data/impl/mock/copilot.ts` | Mock determinístico de `generateReply` |
| `src/providers/data/impl/supabase/copilot.ts` | Integração real via Edge |
| `src/features/copilot/hooks/useCopilotReply.ts` | Hook de estado (`enabled/generating/reply/error`) |
| `src/features/copilot/components/CopilotReply.tsx` | Botão + área de rascunho |
| `src/features/copilot/engine/buildReplyPrompt.ts` | Monta o prompt do transcript |
| `src/features/copilot/engine/buildReplyPrompt.test.ts` | Testes Vitest |

## Erros HTTP da edge

| Código | Situação |
|---|---|
| `401` | Sem sessão |
| `403` | Sem profile ou sem acesso à conversa (RLS) |
| `409` | IA desligada (master ou feature) — corrida com o gating |
| `400` | Provider não suportado ou sem chave configurada no Vault |
| `402` | Orçamento do mês esgotado |
| `504` / `502` | Timeout (~60 s) ou falha do LLM (grava `ai_usage_events` com `status='error'`) |

Qualquer erro de geração não quebra o painel: sugestões e resumo determinísticos continuam renderizando normalmente.

## Extensões futuras (sub-projetos 2 e 3)

A fundação deste sub-projeto foi desenhada para ser reusada:

- **Sub-projeto 2 — Resumo via LLM:** substituir a heurística de resumo por uma chamada à edge. O routing já prevê uma feature key separada; bastará uma nova edge (ou uma ação na `copilot-generate`) + a implementação do provider.
- **Sub-projeto 3 — Sugestões via LLM:** o rules engine determinístico é substituído ou complementado por chamada à LLM. Mesmo padrão de gating/routing/budget.

Antes de plugar consumidores automáticos (disparo ao abrir conversa), o teto de budget deve ser endurecido (SUM em RPC + lock para eliminar o TOCTOU).

## Rollout

1. Deploy da Edge `copilot-generate` via CLI Supabase autenticada: `npx supabase functions deploy copilot-generate --project-ref njizaasajkdqptlxddqn`
2. A migration da RPC `ai_feature_enabled` deve estar aplicada (e espelhada em `supabase/migrations/`) antes do deploy.
3. Verificar em `ai_settings` que `master_enabled = true` e `routing['conversation_copilot'].enabled = true` em produção.
4. Smoke e2e: gerar uma resposta numa conversa real → confirmar registro em `ai_usage_events` (`source='routed'`, `feature='conversation_copilot'`).
