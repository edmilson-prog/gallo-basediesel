# Checkpoint — Tradução em tempo real por contato — 2026-08-11 19:55 -03

> **Branch:** `worktree-feat-traducao-tempo-real` · **HEAD:** `84508f27` (= `origin/main`, nenhum commit próprio de código)
> **Sessão anterior:** Claude Opus 5 · **Gerado em:** 2026-08-11T19:55-03:00
> **Fase:** brainstorming concluído, **design apresentado e AGUARDANDO APROVAÇÃO**. Nenhuma linha de código escrita.

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-08-11-1955-traducao-tempo-real.md` na íntegra e confirme em uma frase que entendeu:
1) o objetivo da sessão, 2) o estado atual do código, 3) qual é a próxima tarefa.
Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial sobre o ERP DINTEC, em produção em
`crm.gallobasediesel.com.br` (Supabase + React/TanStack Router, SPA estática na Vercel).
O módulo em jogo é o **Atendimento** (Inbox de conversas WhatsApp, multi-instância e
multi-engine) somado à **área de IA/LLM** (`Configurações → Inteligência artificial`),
que já roteia 6 funcionalidades reais por provedor/modelo com teto de orçamento.

## 🎯 Objetivo da sessão

Alguns clientes da GALLO conversam em outros idiomas (o caso concreto que originou o
pedido: o contato **"Jimmy" +8615280264556**, lead importado, que escreve em inglês).
O dono quer um **parâmetro por contato** que, quando ligado, faça tradução bidirecional
em tempo real: **cada interlocutor escreve e lê no próprio idioma nativo**, sem que
nenhum dos dois perceba que houve tradução no meio.

## ✅ Progresso (o que foi feito)

- [x] **Worktree isolada criada** — `worktree-feat-traducao-tempo-real`.
- [x] **Exploração completa do terreno** (ver §Achados técnicos verificados) — sem alterar nada.
- [x] **4 decisões de produto tomadas pelo dono** via brainstorming (ver §Decisões tomadas).
- [x] **Design completo apresentado** ao dono no chat — arquitetura, schema, fluxos, escopo, riscos.
- [ ] Aprovação do design — **NÃO obtida ainda**. O dono pediu checkpoint antes de responder.

> ⚠️ **Nenhum commit de código.** A branch está idêntica à `origin/main` (84508f27).
> O único commit desta branch é o deste próprio checkpoint.

## 🔧 Estado do código

- **Branch:** `worktree-feat-traducao-tempo-real`, baseada em `origin/main` = `84508f27`
  (*Merge pull request #456 — fix/pwa-atendimento-install-manifest*).
- **Arquivos modificados:** nenhum além deste checkpoint.
- **Build/testes:** não rodados nesta sessão (não havia o que testar).
- **PRs abertos relacionados:** nenhum ainda — o PR desta branch nasce com este checkpoint, em `draft`.

### 🪤 Armadilha encontrada (não repetir)

A worktree criada no início da sessão foi **auto-removida** pelo harness por não ter
nenhuma alteração de arquivo (só houve leitura e conversa). A **branch sobreviveu**, mas
apontando para `c553ecbc` — um `origin/main` **desatualizado em ~30 commits** (07/08, PR #414),
porque o `origin/main` local não tinha `fetch` recente. Foi corrigido com
`git fetch origin && git reset --hard origin/main`.
**Lição:** ao recriar/retomar worktree nesta sessão, confira `git log -1` contra
`origin/main` **depois de um `git fetch`** antes de escrever qualquer código.
Casa com a memória `project_main_checkout_stale_diagnosis`.

---

## 🧭 Decisões tomadas (pelo dono, nesta sessão)

| # | Decisão | Escolha | Implicação |
|---|---|---|---|
| 1 | **Outbound (vendedor → cliente)** | **Preview antes de enviar** | Ao clicar Enviar, abre diálogo com PT/idioma-alvo lado a lado e botões `Editar` / `Enviar assim`. Nenhuma mensagem sai sem revisão humana. |
| 2 | **Onde mora o parâmetro** | **No contato** (cliente/lead) | Toggle é exibido na ficha lateral da conversa, mas grava no contato. Conversa nova do mesmo contato já nasce traduzindo. Exige colunas em `customers` **e** `leads`. |
| 3 | **Idiomas** | **Dois campos, escolha manual** | O parâmetro guarda idioma de **inbound** e de **outbound** separadamente. **Sem autodetecção** — decisão explícita do dono ("o idioma de inbound e outbound é selecionado no parâmetro"). Vale para "todas as mensagens atuais e futuras". |
| 4 | **Histórico já existente** | **Conforme aparece na tela** | Traduz sob demanda quando a mensagem entra na viewport, e **persiste** o resultado (nunca traduz a mesma mensagem duas vezes). Histórico nunca lido = custo zero. |
| 5 | **Exibição do balão** | **Português em destaque, original a 1 clique** | Atendente lê tudo em PT; link discreto (`🌐 EN · ver original`) revela o texto original. No balão do vendedor o "original" é o **português que ele digitou**. |

---

## 🏗️ Design apresentado (aguardando aprovação)

### Princípio central

`messages.text` **sempre guarda o que trafegou no WhatsApp**; uma coluna nova guarda a
contraparte em português. Simetria resultante:

```
INBOUND   text = "ok Friend I will check"                    ← veio assim do cliente
          translation_text = "Ok amigo, vou verificar"       ← LLM gerou

OUTBOUND  text = "Let's get this order organized"            ← foi assim para o cliente
          translation_text = "Vamos organizar mais esse pedido"  ← vendedor digitou (custo ZERO de LLM)
```

Ganhos: os balões renderizam sempre a partir de `translation_text`; o **eco do WhatsApp
continua batendo com `text`** sem tratamento especial; no outbound a coluna nasce
preenchida de graça.

### Schema proposto

```sql
-- messages (espelha o par transcription/transcription_status já existente)
translation_text    text
translation_status  text  check (translation_status in ('pending','done','failed'))
translation_lang    text

-- customers E leads (as duas, pois conversations só tem customer_id/lead_id)
translation_enabled       boolean not null default false
translation_inbound_lang  text
translation_outbound_lang text

-- ai_settings.routing (jsonb): nova linha 'message_translation', DESLIGADA por padrão
```

### Peças novas

| Peça | Papel |
|---|---|
| Edge `translate-message` (14ª) | `mode:"inbound"` grava na mensagem · `mode:"outbound"` só devolve o texto (preview, não grava) |
| `_shared/ai/translateText.ts` | núcleo compartilhado, espelhando `_shared/ai/transcribeAudio.ts` |
| Feature key `message_translation` | 7ª linha em Configurações → IA → Funcionalidades, com teto próprio |
| `src/features/translation/` | engine (prompt + testes Vitest), hooks, diálogo de preview, toggle da ficha, chip do balão |
| 3 migrations | `messages` · `customers`+`leads` · linha de routing em `ai_settings` |

Gate reaproveitado: RPC **`ai_feature_enabled`** (já existe em produção) — se a IA
estiver desligada, o toggle nem aparece.

### Fluxo outbound

```
digita PT → Enviar → Edge traduz (não grava) → diálogo PT/EN
                                                 ├─ Editar       → volta ao compositor com o EN editável
                                                 └─ Enviar assim → fluxo de envio normal
```
O texto que sai é o traduzido; o PT viaja junto como `translationText` no `send()`.
Se a tradução falhar ou o teto estourar, **o diálogo avisa e oferece enviar o português
mesmo assim** — nunca engole a mensagem do vendedor.

### Escopo deferido no v1

Áudio (traduzir a transcrição), preview da lista do Inbox, SDR respondendo traduzido,
templates HSM, respostas rápidas, mídia com legenda.

---

## ⏳ Pendências (próximos passos, em ordem)

1. **Obter a aprovação do design** (ou os ajustes) — ver §Decisões pendentes abaixo.
   *Feito quando:* o dono responder aos 2 pontos em aberto.
2. **Escrever a spec** em `docs/superpowers/specs/2026-08-11-traducao-tempo-real-design.md`,
   rodar o self-review (placeholders / contradições / escopo / ambiguidade) e commitar.
   *Feito quando:* arquivo commitado e o dono aprovar a leitura.
3. **Invocar o skill `writing-plans`** para gerar o plano faseado em `docs/superpowers/plans/`.
   *Feito quando:* plano commitado com fases verificáveis.
4. **Implementar** seguindo o plano. Ordem obrigatória de rollout (espelhar
   `docs/dev/ai-llm-integration.md` §Ordem de deploy): migrations aplicadas →
   deploy do Edge → merge do front. **Cada passo exige OK explícito do dono.**

## ❓ Decisões pendentes (as 2 perguntas feitas ao dono, sem resposta ainda)

- **(a) Quem dispara a tradução do inbound?**
  - **Opção A — front, na viewport** *(proposta no design)*: custo proporcional ao que é
    lido; mantém **humano no loop**, o que evita o pré-requisito de endurecer o teto de
    orçamento (o TOCTOU está documentado como bloqueio para "consumidores automáticos"
    em `docs/dev/copilot-ai-reply.md:102`). **Preço:** a lista do Inbox mostra o preview
    da última mensagem **em inglês** — só o balão dentro da conversa traduz.
  - **Opção B — webhook** (como faz a transcrição de áudio, via `runInBackground`):
    preview da lista já sai traduzido, mas vira **consumidor automático de LLM**, que a
    doc diz exigir endurecimento do teto antes.
  - **Inclinação atual:** A.

- **(b) Áudio entra no v1?**
  - Hoje a transcrição sai **no idioma falado**. Traduzi-la é composição natural
    (transcreve EN → traduz PT), mas é outra chamada e outro estado na bolha.
  - **Inclinação atual:** deixar fora do v1.

## 🚧 Bloqueios / Riscos

- **LGPD** — o texto das mensagens vai ao provedor LLM configurado. Não é novidade em
  natureza (o copiloto já faz), mas o **volume cresce**: toda mensagem lida de um contato
  marcado passa pelo provedor. Registrado como risco aceito, espelhando o padrão do copiloto.
- **TOCTOU do teto de orçamento** — conhecido e documentado; a Opção A do item (a) o contorna
  ao manter humano no loop, em vez de exigir o endurecimento.
- **Tabela `contacts`** existe em produção (backfill da Agenda aplicado), mas **o código dela
  não está na `main`** e `conversations` **não** tem `contact_id`. Por isso o parâmetro vai
  para `customers` + `leads`, não para `contacts`.

## ⚠️ Avisos do usuário (regras desta sessão e permanentes)

- **"crie uma worktree isolada"** — pedido explícito nesta sessão. Nunca commitar no
  checkout principal (`D:\claude\gallo-basediesel`), que deve permanecer na `main`.
- **Nunca mergear — só abrir PR.** O merge é do dono. (memória `feedback_never_merge_pr_only`)
- **Não tocar no cache do Atendimento** — signing em lote, realtime e query keys estão
  **congelados**. A feature vive dentro desse território (mexe em `MessageList`/bubbles,
  `MessageInput`, `useMessageSend`), mas **não deve encostar** nesses três.
  (memória `feedback_atendimento_cache_do_not_touch`)
- **Não abrir browser/preview para validar UI** — quem testa é o dono.
  (memória `feedback_manual_testing`)
- **`apply_migration` e deploy de Edge Function em produção exigem OK explícito do dono**;
  toda migration aplicada via MCP deve ser espelhada em `supabase/migrations/` no mesmo PR.
- **Arquivos só dentro do projeto** — docs em `docs/`, scripts em `scripts/`.

## 🛡️ Não regredir (o que não pode quebrar)

- **Envio de mensagens WhatsApp** em todos os engines (Meta, Evolution, Evolution-Go, WAHA, OpenWA)
  — o preview de tradução se insere **antes** do envio e não pode alterar o caminho quando o
  parâmetro está desligado (que é o default de **todos** os contatos).
- **Transcrição de áudio** (`audio_transcription`) — o padrão que estamos espelhando; não alterar.
- **Eco / split de conversas** — `messages.text` precisa continuar sendo exatamente o que
  trafegou, senão a correlação do eco quebra (memória `project_conversation_split_echo_after_close`).
- **Área de IA** — as 6 feature keys existentes e o painel de uso seguem intactos; a tradução
  é a **7ª linha**, aditiva.

## 🔎 Achados técnicos verificados (com fonte)

| Achado | Onde confirmei |
|---|---|
| `messages` já tem `transcription` + `transcription_status` — o padrão a espelhar | `SELECT information_schema.columns` no Supabase de **produção** |
| `conversations` **não** tem `contact_id`; só `customer_id` (uuid) e `lead_id` (**text**) | idem |
| tabela `contacts` **existe** em produção | idem |
| Transcrição dispara do webhook via `runInBackground(transcribeMessageAudio(admin, messageId))` | `supabase/functions/waha-webhook/index.ts:655` e `whatsapp-webhook/index.ts:643` |
| `AiFeatureKey` tem 6 chaves hoje | `src/shared/types/ai.ts:5-11` |
| `copilot-generate` usa `requireAnyCaller` (**não** Owner-only) — precedente para consumidor de atendente | `docs/dev/copilot-ai-reply.md:57` |
| `ai-generate` é **Owner-only** (`requireCaller(req,["owner"])`) — não serve de porta para o atendente | `docs/dev/ai-llm-integration.md:132` |
| `IMessagesProvider.send` recebe `Omit<IMessage, …>` ⇒ campos novos fluem **sem** mudar assinatura | `src/providers/data/contracts/messages.ts:27-30` |
| Tradução automática foi **explicitamente deferida** na spec de transcrição | `docs/superpowers/specs/2026-07-15-audio-transcription-design.md` §"Não entra" |

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/dev/ai-llm-integration.md` — Edge `ai-generate`, catálogo, budget, ordem de deploy.
- `docs/dev/copilot-ai-reply.md` — **o molde mais próximo**: consumidor LLM de atendente, gating por RPC.
- `docs/superpowers/specs/2026-07-15-audio-transcription-design.md` — o molde de enriquecimento de mensagem.
- `supabase/functions/_shared/ai/transcribeAudio.ts` — núcleo compartilhado a espelhar.
- `supabase/functions/copilot-generate/index.ts` — auth + routing + budget de um consumidor não-Owner.
- `src/shared/types/conversation.ts` — `IMessage` (ver `transcription`/`transcriptionStatus` no fim).
- `src/features/conversations/components/MessageInput.tsx` + `bubbles/` — pontos de integração da UI.
- `src/features/conversations/hooks/useMessageSend.ts` — onde o preview do outbound se encaixa.
- `CLAUDE.md` — convenções do projeto.

## 🧠 Memórias relacionadas

- `feedback_atendimento_cache_do_not_touch` — território congelado que esta feature atravessa.
- `feedback_never_merge_pr_only` — PR sim, merge não.
- `feedback_manual_testing` — o dono testa a UI.
- `project_main_checkout_stale_diagnosis` — casa com a armadilha da branch desatualizada acima.
- `project_conversation_split_echo_after_close` — porque `messages.text` deve seguir sendo o que trafegou.
- `project_audio_transcription_feature` — a feature-molde.

## 📚 Referências

- Print original do dono mostrando a conversa do contato "Jimmy" (+8615280264556) em inglês,
  com balões `ok Friend I will check` / `I do for you tomorrow` — o caso de uso concreto.
- Spec-molde: `docs/superpowers/specs/2026-07-15-audio-transcription-design.md`.
