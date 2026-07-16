# Checkpoint — Integração OpenWA (engine WhatsApp) — 2026-07-14T22:00Z

> **Branch:** `worktree-whatsapp-openwa-redundant` · **Último commit:** `930a06a8` Merge remote-tracking branch 'origin/main' into worktree-whatsapp-openwa-redundant
> **Sessão anterior:** Claude Sonnet 5 · **Gerado em:** 2026-07-15T00:07:02Z (2026-07-14 ~21:07 BRT)

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-07-14-2200-openwa-integracao-completa.md` na
íntegra e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado
atual do código, 3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial (React 19 + TS strict + Vite, Supabase backend). Módulo em foco: **WhatsApp multi-engine** (`src/providers/whatsapp/`, `supabase/functions/whatsapp-*`) — a plataforma já falava com Meta Cloud API, Evolution v2 e Evolution Go; esta linha de trabalho **adicionou um 4º engine: OpenWA** (whatsapp-web.js self-hosted, fork rmyndharis/OpenWA), registry-based como o Evolution Go (uma chave global por servidor, não por conta).

## 🎯 Objetivo da sessão

Terminar de implementar, validar **ao vivo em produção** e mergear o engine OpenWA — desde uma sessão anterior que só tinha o core de envio/recebimento pronto, mas nenhum fluxo de criação/pareamento (o wizard não mostrava a opção OpenWA). O trabalho incluiu: reverse-engineering do contrato REST real do servidor (não documentado oficialmente pelo fork), implementação do fluxo completo de pareamento por QR, correção de bugs só descobertos com tráfego real, merge e version bump, e um fix de follow-up.

## ✅ Progresso (o que foi feito)

Tudo abaixo já está **mergeado na `main`**:

- [x] **PR #261 → v0.138.0 `Sidecar`** (merge commit `6f337169`, tag `v0.138.0`) — engine OpenWA completo:
  - Server-registry de autenticação (`whatsapp_openwa_servers`, FK `openwa_server_id`), migration `20260707140000_whatsapp_openwa_servers` aplicada em prod.
  - Fluxo completo: `AddInstanceWizard` (opção OpenWA), gestão de servidores em Configurações → Integrações → Chaves & API, card de conta com Conectar/Verificar agora/reconexão/exclusão.
  - Contrato REST + envelope de webhook **reverse-engineered ao vivo** (probing cauteloso + pareamento real).
  - Fix: sessão pareada reporta `status: "ready"`, não `"connected"`.
  - Fix: resolução de `@lid` via `GET /sessions/{id}/contacts/{lid}` — recurso que o Evolution v2 não tem (ele descarta @lid).
  - Fix: eco (mensagem enviada do celular) classificado pelo prefixo `fromMe` (`true_`/`false_`) do `waMessageId`, não pelo campo `direction` (que mente durante o re-sync de histórico).
  - Fix: `eventKey` do webhook com branch openwa dedicado (evita colisão entre sessões, mesma classe do bug do PR #254).
  - Fix: sessão parada agora reinicia automaticamente no fluxo "Reconectar" (antes nunca respondia "aberto" sem status autoritativo — hardening igual ao incidente Go de 2026-07-06).
  - Doc de referência criada: `docs/dev/whatsapp-openwa-provider.md`.
  - **E2E validado em produção**: mensagem real inbound (com @lid resolvido) → Inbox; resposta outbound pelo app → entregue no celular real.
- [x] **PR #269** (merge commit `d6f10ab0`) — `scheduled-send-worker` agora cobre contas OpenWA (`resolveOpenWaServerConfigs`, espelha o padrão já usado no `whatsapp-send`). Sem isso, envio agendado por conta OpenWA falhava com `VALIDATION_ERROR` (registry-based, `providerConfig` vazio).
- [x] **Issue [#284](https://github.com/edmilson-prog/gallo-basediesel/issues/284)** criada no GitHub com as pendências remanescentes (ver seção abaixo).

## 🔧 Estado do código

- **Branch:** `worktree-whatsapp-openwa-redundant` — **0 commits ahead da `main`** (`git merge-base HEAD main` == HEAD; a branch já foi totalmente mergeada, inclusive um merge de `origin/main` de volta pra cá depois do PR #269).
- **Último commit:** `930a06a8` — merge de `origin/main` (trouxe trabalho do WAHA, sem conflito).
- **Working tree:** `git status` mostra 11 arquivos "M" em `supabase/functions/_shared/whatsapp/waha/*` e `types.ts` — **é falso-positivo de CRLF conhecido** (autocrlf), `git diff` real produz **0 linhas**. Não há nada de fato para commitar. Não mexer nesses arquivos (ver aviso abaixo).
- **`origin/main` avançou 58 commits** além do que este checkpoint capturou (WAHA em ritmo intenso de mudanças, PRs #271/#279/#285 etc.) — **irrelevante para o OpenWA**, que está 100% integrado e estável.
- **Build/testes:** última rodada nesta sessão — `bun run test` 1767/1767 passando, `bun run build` limpo (antes do merge do PR #269).
- **PRs abertos relacionados ao OpenWA:** nenhum. #261 e #269 já mergeados.
- **Branch local `fix/waha-scheduled-send-dispatch` existe** no repo (não investigada, não tocada) — sugere que alguém já está corrigindo o gap análogo do WAHA por conta própria. Não é assunto desta linha de trabalho.

## ⏳ Pendências (próximos passos, em ordem)

Todas as pendências reais do OpenWA estão rastreadas na **[issue #284](https://github.com/edmilson-prog/gallo-basediesel/issues/284)**. Resumo:

1. **Smoke do envio agendado** — agendar uma mensagem de verdade numa conta OpenWA (Teste-222 `98c74ffa` ou Teste-3333 `dc159cd1`) e confirmar que sai no horário certo. O código do PR #269 nunca foi exercitado com um agendamento real. Critério de "feito": mensagem agendada aparece como enviada no horário certo, sem erro em `scheduled_sends.failure_reason`.
2. **Detecção de sessão travada** ("ready" com socket morto) — 1 ocorrência observada (2026-07-09), sem detecção automática. Bloqueio: `whatsapp_health_tick` roda via `pg_cron` sem `pg_net` habilitado, não consegue chamar a API do OpenWA direto do banco. **Decisão de design pendente** (ver seção abaixo) — dono já optou por adiar isso, sem urgência.
3. **Limpeza das contas de teste** — Teste-222 e Teste-3333 seguem conectadas aos números pessoais do Edmilson (+555481572275, +555481169884). Desconectar ou excluir quando os testes terminarem, para não continuar recebendo mensagens pessoais reais como conversas de produção.

Nenhuma dessas pendências requer mudança de código imediata (1 é um teste manual, 2 é uma decisão de design ainda não tomada, 3 é uma ação no banco/UI, não código).

## ❓ Decisões pendentes

- **Como detectar sessão OpenWA travada (item 2 acima)?**
  - Opção A: **Client-side polling** — a tela de Contas WhatsApp já sonda a cada 30s enquanto aberta; comparar `lastActive` entre polls e alertar se estagnado. Simples, mas só funciona com a tela aberta (não é monitoramento em background).
  - Opção B: **Habilitar `pg_net` + expandir o tick SQL** — solução completa, igual ao monitoramento que Evolution/Evolution Go já têm. Mudança de infra em produção, mais escopo e risco.
  - Opção C: **Não fazer nada por agora** — só 1 ocorrência observada, sem urgência.
  - **Inclinação atual do dono: Opção C** (confirmado explicitamente via AskUserQuestion nesta sessão — "Só o item 1 por agora").

## 🚧 Bloqueios / Riscos

- `pg_net` não habilitado no projeto Supabase — bloqueia qualquer solução de monitoramento ativo via SQL/pg_cron para o OpenWA (mesma limitação não existe para Evolution/Go, que já tinham isso implementado antes).
- As duas contas de teste conectadas ao número pessoal do dono continuam recebendo e criando conversas reais em produção enquanto não forem desconectadas — risco de poluir dados de produção com conversas pessoais.

## ⚠️ Avisos do usuário (regras desta sessão)

- **"Nunca mergear sem OK explícito — só abro PR, confirmar antes de apply_migration/deploy de edge em prod."** (regra permanente do projeto, reforçada nesta sessão — cada deploy de Edge Function e cada `git merge`/`gh pr merge` foi confirmado explicitamente via AskUserQuestion antes de executar.)
- **"NÃO MEXA no WAHA."** — dito explicitamente e com ênfase depois que eu mencionei, sem necessidade, um gap técnico no engine WAHA (que já está implementado e validado por outra linha de trabalho). O WAHA está **fora de escopo total** desta sessão/worktree — não investigar, não sugerir, não tocar em nenhum arquivo `waha/*` ou `waha-*`, mesmo que pareça relacionado ou tentador de "aproveitar o embalo". Se notar algo sobre WAHA incidentalmente (como os falsos-positivos de CRLF acima), apenas ignorar/não comentar, a menos que perguntado diretamente.
- **Correção factual do usuário:** eu tinha caracterizado uma sessão OpenWA travada como resultado de o dono "ter dormido" (silêncio noturno) — o dono corrigiu que não, o silêncio era esperado (ele estava dormindo), e o verdadeiro engasgo observado foi um evento distinto e mais curto (~3 min) na manhã seguinte. Lição: **verificar timestamps reais antes de caracterizar uma causa raiz** — não presumir stall a partir de ausência de atividade sem evidência direta (`sent_at` vs `created_at` das mensagens, ou logs do servidor).

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Evolution v2 e Evolution Go** — `isEvolutionFamily()` foi ampliada para incluir `"openwa"` (mesma UX de conectar/reconectar/verificar); qualquer alteração futura nesse helper deve preservar o comportamento desses dois engines intacto.
- **`whatsapp-connect`, `whatsapp-send`, `whatsapp-webhook`** — todos ganharam um bloco `provider === "openwa"` dedicado; não remover os blocos `evolution`/`evolution-go` existentes ao mexer nesses arquivos.
- **`scheduled-send-worker`** — agora tem resolução de registry para `evolution-go` E `openwa`; preservar ambas ao editar.
- **Fix do eco `fromMe`** no parser do OpenWA (`src/providers/whatsapp/openwa/parser.ts`) — não reverter para usar o campo `direction` isolado, ele mente durante o re-sync de histórico.
- **Sync do espelho `_shared`** — qualquer mudança em `src/providers/whatsapp/**` precisa rodar `bun run scripts/sync-whatsapp-shared.ts` antes do deploy das Edge Functions (regra já documentada no `CLAUDE.md` do projeto).

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/dev/whatsapp-openwa-provider.md` — doc de referência canônica: contrato REST confirmado, envelope de webhook, armadilhas descobertas (`@lid`, eco `fromMe`, stall), cobertura de call sites, cutover.
- `src/providers/whatsapp/openwa/` — engine completo (client, constants, errors, instance, OpenWaProvider, parser + testes). Espelhado em `supabase/functions/_shared/whatsapp/openwa/`.
- `supabase/functions/whatsapp-connect/index.ts` (bloco `provider === "openwa"`) e `openwaServer.ts` — fluxo de pareamento/gestão de sessão.
- `supabase/functions/whatsapp-webhook/index.ts` — resolução de `@lid` pré-parse, gate `openwaGate`, diagnóstico exclusivo para openwa em `integration_logs`.
- `supabase/functions/scheduled-send-worker/index.ts` — `resolveOpenWaServerConfigs` (fix do PR #269).
- `src/shared/utils/whatsappProvider.ts` — `isEvolutionFamily()` / `isEvolutionAccountConfigured()`, agora cobrindo openwa.
- `CLAUDE.md` (raiz do projeto) — convenções gerais; a "Estado atual" narrativa **não foi atualizada** para esta linha de trabalho (já estava defasada desde v0.111 antes desta sessão — só a linha de codinomes/tags de versão é mantida em dia).

## 🧠 Memórias relacionadas

- `project_whatsapp_openwa_engine.md` (memória auto — já atualizada com o estado MERGEADO/COMPLETO desta linha de trabalho).
- `project_git_autocrlf_subagents.md` — explica o falso-positivo de CRLF visto no `git status` acima.
- `feedback_never_merge_pr_only.md` — regra de nunca mergear sem confirmação explícita.

## 📊 Atividade recente (telemetria)

Não há arquivo de telemetria (`.claude-metrics/annotations.jsonl`) neste projeto.

## 📚 Referências

- PR #261: https://github.com/edmilson-prog/gallo-basediesel/pull/261 (mergeado)
- PR #269: https://github.com/edmilson-prog/gallo-basediesel/pull/269 (mergeado)
- Issue #284: https://github.com/edmilson-prog/gallo-basediesel/issues/284 (aberta — pendências)
- Doc: `docs/dev/whatsapp-openwa-provider.md`
- Tag: `v0.138.0` (codinome `Sidecar`)
