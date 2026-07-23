# Copiloto — Painel de controle do assistente (Sub-projeto A)

> **Data:** 2026-07-22 (bump de versão pendente — ver ordem de rollout abaixo)
> **Feature key:** `conversation_copilot`
> **Spec:** `docs/superpowers/specs/2026-07-22-copiloto-conversa-fundacao-design.md`
> **Mockups:** `docs/superpowers/mockups/2026-07-22-copiloto-conversa-mockups.html`

## O que foi entregue

O copiloto de conversa estava em produção desde a v0.108.0 "Quill" e era pouco usado: o
painel só existia em 15% das conversas (nunca em conversa de lead), a Edge lia as 200
mensagens mais antigas em vez das mais recentes, e cada comportamento estava hardcoded.
Este sub-projeto (A de 2) corrige os cinco defeitos auditados e transforma toda decisão
de comportamento num parâmetro editável em `Configurações → Copiloto`.

**Nenhum custo novo de IA é ligado.** O motor permanece em `"rules"` (regras
determinísticas, sem custo); a opção `"ai"` aparece na tela porém travada — ela é
destravada pelo Sub-projeto B (análise via LLM).

## Onde vivem os parâmetros

Em `stores.settings->'copilotAssistant'`, tipado como
`IPlatformSettings.copilotAssistant?: ICopilotAssistantSettings` (`src/shared/types/copilot.ts`),
com a constante `DEFAULT_COPILOT_ASSISTANT_SETTINGS`
(`src/features/copilot/config/defaults.ts`) usada quando a chave está ausente.

**Por que não uma tabela nova:** segue exatamente o padrão já estabelecido por
`idleAlerts`, `conversationRescue`, `sound` e `sessionTimeout` — mesma tabela
(`stores.settings`, jsonb), mesmo provider (`ISettingsProvider`), mesma RLS, zero
migration de schema para os parâmetros de comportamento (a única migration deste
sub-projeto é a da RPC de orçamento, ver abaixo).

`ai_settings` (a tabela de `Configurações → IA`) foi descartado como casa: é singleton
com RLS **Owner-only**, e aqui o Gestor também precisa editar.

**Quem edita:** Owner e Gestor, em `/app/configuracoes/copiloto`
(`src/routes/app.configuracoes.copiloto.tsx`). A rota **não tinha gate algum** antes
deste sub-projeto — qualquer pessoa logada abria. Isso era aceitável quando o único
campo era uma preferência visual (o posicionamento do painel); com política de operação
e teto de gasto na mesma tela, passou a exigir:

```ts
beforeLoad: ({ location }) =>
  requireAuth(location.pathname, ["Owner", "Gestor"], { resource: "settings", action: "edit" })
```

## Política vs preferência pessoal

Dois tipos de parâmetro, deliberadamente em lugares diferentes:

- **Política da operação** → servidor (`stores.settings`), editável por Owner e Gestor,
  vale para todo mundo.
- **Preferência pessoal** → `localStorage` (`gallo-copilot-placement`), cada pessoa a
  sua. Só o **posicionamento** do painel (faixa/card/aba) é assim — como já era antes
  deste sub-projeto. A tela sinaliza isso com um selo "pessoal" ao lado do controle.

## Qual parâmetro é respeitado onde

| Parâmetro | Respeitado onde |
|---|---|
| `enabled`, `reach`, `accountIds`, `roles` | `shouldMountCopilot` (`src/features/copilot/engine/shouldMountCopilot.ts`) — frontend, decide se o painel monta E se a busca de dados roda |
| `messageWindow` | frontend (janela de leitura de mensagens) **e** Edge `copilot-generate` (janela do prompt) — os dois lados leem da mesma fonte, nenhum deriva do outro |
| `showSummary`, `showSuggestions`, `showReplyButton` | render condicional em `CopilotStrip`, `CopilotCard` e `CopilotFicheTab` — as três superfícies do painel |
| `autoExpandOnAlert` | estado inicial de `expanded` nos três componentes acima, com um latch por conversa (reabre uma vez por conversa nova, nunca reabre depois que o vendedor fecha manualmente) |
| `monthlyCapBRL` | RPC `ai_budget_try_consume` — servidor, teto próprio do assistente dentro do teto da plataforma |
| `trigger`, `cacheMinutes`, `minNewMessages` | persistidos e exibidos na tela (desabilitados, com explicação), **sem efeito** até o Sub-projeto B ligar `engine = "ai"` |
| `engine` | trava a opção `"ai"` na tela até o Sub-projeto B; `"rules"` é o único motor ativo neste sub-projeto |

O ponto que exige atenção: `messageWindow` é lido nos **dois lados** de forma
independente. O frontend lê das settings via `useCopilotAssistantSettings`; a Edge lê do
banco pela loja da conversa (`stores.settings->copilotAssistant->>messageWindow`).
Nenhum dos dois assume o valor do outro, e ambos aplicam o default (`40`) como piso de
segurança quando o valor está ausente ou é inválido.

## A tela

`Configurações → Copiloto` tem cinco blocos
(`src/features/copilot/components/CopilotAssistantSettingsSection.tsx`):

1. **Ativação e alcance** — `enabled`, `reach`, `accountIds`, `roles`.
2. **Quando analisar** — `trigger`, `cacheMinutes`, `minNewMessages` (desabilitados até o
   engine ser `"ai"`, com a explicação visível em vez de escondidos).
3. **O que o painel mostra** — `showSummary`, `showSuggestions`, `showReplyButton`,
   `autoExpandOnAlert`.
4. **Motor** — `engine` (`"rules"` ativo; `"ai"` travado com o texto "Disponível quando a
   análise por IA for entregue").
5. **Estimativa viva** — `estimateAssistantCost` (`src/features/copilot/engine/estimateAssistantCost.ts`),
   recalculada a cada mudança de controle. Com `engine = "rules"` (o default deste
   sub-projeto) a estimativa é sempre R$ 0,00 — o cálculo de chamadas por dia só roda
   quando `engine === "ai"`. A premissa de reaberturas por conversa é rotulada como
   premissa (estimada, não medida), não como fato.

## A fronteira com `Configurações → IA`

Sem campo duplicado entre as duas telas:

| Tela | Responde |
|---|---|
| `Configurações → IA` | **Qual cérebro** — provedor, modelo, temperatura, prompt de sistema, chaves, orçamento geral da plataforma |
| `Configurações → Copiloto` | **Como o assistente se comporta** — quando roda, onde aparece, para quem, o que mostra, teto próprio |

O modelo aparece no painel do assistente apenas como leitura, nunca como campo editável
— para trocar de modelo o caminho é a tela de IA.

## Teto de orçamento (RPC `ai_budget_try_consume`)

Migration `supabase/migrations/20260722120000_ai_budget_try_consume.sql`.

Antes desta RPC, `copilot-generate` e `ai-generate` somavam `ai_usage_events` do mês em
JavaScript e comparavam contra o teto em duas viagens separadas ao banco. Com uma pessoa
clicando de vez em quando isso nunca falhava; com disparo automático (Sub-projeto B),
chamadas concorrentes podem ler o mesmo total desatualizado e passar juntas.

**Escopo do Sub-projeto A:** só `copilot-generate` foi migrado para esta RPC
concorrente. O outro Edge, `ai-generate` (Playground/teste de conexão), continua
checando o teto da plataforma do jeito antigo — uma soma em JavaScript, sem o lock
advisory. Unificar os dois na mesma RPC fica como trabalho futuro.

A RPC (`SECURITY DEFINER`, `service_role`-only) toma `pg_advisory_xact_lock` sobre uma
chave derivada do mês corrente, soma `ai_usage_events` dentro da mesma transação, e
compara contra dois tetos:

- **Teto da plataforma** — global, `ai_settings.budget->>monthlyCapBRL`, soma todos os
  eventos do mês independente da loja.
- **Sub-teto do assistente** — `stores.settings->copilotAssistant->>monthlyCapBRL`, **por
  loja** (via `p_store_id`), só aplicado quando `p_feature = 'conversation_copilot'`.

**Honestidade sobre o limite (best-effort, não atômico):** o lock advisory serializa
apenas a **checagem**, não o **gasto**. O evento em `ai_usage_events` só é gravado
depois que a chamada ao LLM termina — segundos depois, e **fora** da transação da RPC.
Duas (ou mais) chamadas concorrentes podem, cada uma, passar pela checagem enquanto a
outra ainda está em voo, estourando o teto em conjunto até a soma dos custos em voo, até
que a próxima checagem detecte o novo total. O Sub-projeto A aceita isso conscientemente:
o copiloto aqui é um botão manual pressionado por uma pessoa, não disparo automático — o
raio de impacto de um estouro breve é pequeno. A **reserva atômica de verdade** (reservar
um valor estimado dentro do mesmo lock, depois assentar contra o custo real) fica
**deferida para o Sub-projeto B**, que introduz o disparo automático que de fato precisa
dessa garantia. O lock permanece como está — é inofensivo e é o ponto de serialização que
o B vai estender, não substituir.

## Ordem de rollout

A ordem não é negociável:

1. **Migration** `20260722120000_ai_budget_try_consume.sql` aplicada em produção — com OK
   do dono. Nota: o schema ao vivo tipa as colunas `store_id` como `uuid` (arquivos de
   migration anteriores versionados dizem `text`, mas o schema real divergiu); esta
   migration usa `uuid` corretamente.
2. **Deploy da Edge** `copilot-generate` pela CLI:
   `npx supabase functions deploy copilot-generate --project-ref njizaasajkdqptlxddqn`.
   Sem este passo, o bug das "200 mensagens mais antigas" continua ao vivo em produção
   mesmo depois do merge do PR.
3. **Merge do PR** (frontend).
4. **Smoke:**
   - Abrir uma conversa de **lead** → o painel aparece (antes: 85% das conversas não
     mostravam nada).
   - Abrir uma conversa com **mais de 200 mensagens** → "Gerar resposta com IA" produz um
     rascunho sobre o **assunto atual**, não sobre uma discussão de meses atrás.
   - Conferir que `ai_usage_events` registra o evento normalmente.

> ⚠️ O workflow "Edge Functions deploy" do repositório **é no-op** — passa verde sem
> deployar nada. O deploy real é sempre pela CLI (passo 2 acima).

## Arquivos principais

| Arquivo | Papel |
|---|---|
| `src/shared/types/copilot.ts` | `ICopilotAssistantSettings` + tipos auxiliares (`CopilotReach`, `CopilotTrigger`, `CopilotEngine`) |
| `src/shared/types/platform.ts` | `IPlatformSettings.copilotAssistant?` |
| `src/features/copilot/config/defaults.ts` | `DEFAULT_COPILOT_ASSISTANT_SETTINGS` |
| `src/features/copilot/engine/shouldMountCopilot.ts` | Decide se o painel monta e se a busca roda (A3) |
| `src/features/copilot/engine/estimateAssistantCost.ts` | Projeção de custo mensal, pura e testada (A7) |
| `src/features/copilot/hooks/useCopilotAssistantSettings.ts` | Leitura/escrita das settings via `ISettingsProvider` |
| `src/features/copilot/components/CopilotAssistantSettingsSection.tsx` | Os cinco blocos da tela |
| `src/routes/app.configuracoes.copiloto.tsx` | Rota, gate Owner+Gestor |
| `supabase/functions/copilot-generate/index.ts` | Edge — lê `messageWindow` da loja, janela recente (A1) |
| `supabase/migrations/20260722120000_ai_budget_try_consume.sql` | RPC de orçamento à prova de concorrência (A6) |

## O que este sub-projeto não resolve

Depois do A o copiloto está correto, presente em toda conversa elegível e controlável —
mas o que ele **diz** continua saindo de três regras de palavra-chave. Resumo e
sugestões via LLM, cache de análise e disparo automático são o Sub-projeto B, spec
própria. Ver `docs/superpowers/specs/2026-07-22-copiloto-conversa-fundacao-design.md`
§10.
