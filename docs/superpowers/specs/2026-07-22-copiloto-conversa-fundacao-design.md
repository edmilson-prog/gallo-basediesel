# Copiloto de conversa — Fundação parametrizável (Sub-projeto A)

> **Data:** 2026-07-22
> **Sub-projeto:** A de 2 (B = análise via LLM, spec própria)
> **Mockups:** `docs/superpowers/mockups/2026-07-22-copiloto-conversa-mockups.html`
> **Feature key existente:** `conversation_copilot`

## 1. Problema

O painel Copiloto está em produção desde a v0.108.0 "Quill", funciona, e é praticamente
inutilizado. A auditoria de 2026-07-22 mediu:

| Fato | Medição em produção |
|---|---|
| Conversas com painel | 525 de 3.444 — **15%** |
| Conversas sem painel (só lead) | 2.919 — **85%** |
| Usos do botão "Gerar resposta com IA" | **1** na história (19/06), com um provedor que o roteamento não usa mais |
| Conversas afetadas pelo bug de ordenação | **157** (>200 mensagens; a maior tem 5.076) |
| Custo por chamada medido | R$ 0,025 · latência ~5,4 s |

Cinco defeitos concretos, todos confirmados no código deployado:

1. **A Edge lê as 200 mensagens mais antigas.** `copilot-generate/index.ts` ordena
   `sent_at ascending` com `.limit(200)`; `buildReplyPrompt` então corta as "últimas 30"
   desse conjunto errado. Em conversa longa, o modelo responde ao passado.
2. **O painel não existe em conversa de lead.** O bloqueio é uma única condição no
   frontend (`conversation.customerId &&` em `ConversationPage.tsx:277,295`). A Edge
   **já trata cliente ausente** — o servidor nunca foi o obstáculo.
3. **Busca desperdiçada.** `useCopilotPanel(conversationId)` roda sem condição
   (`ConversationPage.tsx:104`): busca conversa + todas as mensagens + escalação também
   nas 2.919 conversas onde nada será renderizado.
4. **Paginação integral.** `listAllMessages` pagina *todas* as mensagens de 200 em 200,
   sequencialmente, só para alimentar três regras de palavra-chave que olham o fim da
   conversa. Pior caso entre conversas com painel: 15 idas ao servidor em sequência.
5. **Resumo ancorado na primeira mensagem.** `summaryFromMessages` usa o primeiro
   inbound *da conversa inteira*. Num WhatsApp perene isso é uma frase solta de meses
   atrás ("Cliente iniciou com 'BLZ VOU VER COM O CLIENTE'").

Corrigir os cinco deixa o copiloto **correto**, mas não muda por que ninguém usa: o que
ele diz continua saindo de três regras de palavra-chave, e o painel nasce fechado.

## 2. Escopo

**Dentro (Sub-projeto A):**

- Os cinco defeitos acima.
- Teto de orçamento de IA à prova de concorrência (pré-requisito do B).
- **Painel de controle do assistente** — toda decisão de comportamento vira parâmetro.

**Fora (Sub-projeto B, spec própria):**

- Resumo e sugestões via LLM. O motor entregue aqui permanece em "Regras".
- Cache de análise, invalidação por mensagem nova, custo por conversa.

**Fora, permanentemente nesta rodada:**

- Persistir a dispensa de sugestão (`dismissSuggestion` segue local à sessão).
- Copiloto no PWA do vendedor externo.
- Mascarar CPF/CNPJ antes de enviar ao provedor de LLM.

**Nenhum custo novo de IA é ligado neste PR.** O botão "Gerar resposta com IA" continua
sendo a única chamada paga, e continua sendo manual.

## 3. Decisões de arquitetura

### 3.1 Onde vivem os parâmetros

Em `stores.settings->'copilotAssistant'`, tipado como
`IPlatformSettings.copilotAssistant?: ICopilotAssistantSettings`, com constante
`DEFAULT_COPILOT_ASSISTANT_SETTINGS` para a ausência.

Segue exatamente o padrão já estabelecido por `idleAlerts`, `conversationRescue`,
`sound` e `sessionTimeout` (`src/shared/types/platform.ts`): mesma tabela, mesmo
provider (`ISettingsProvider`), mesma RLS, **nenhuma migration de tabela nova**.

> **Desvio consciente da resposta "global".** O dono pediu escopo global; `IPlatformSettings`
> é por loja. Produção tem **uma única loja** (`GALLO BASE DIESEL — Matriz`), então
> por-loja e global coincidem hoje, e o padrão da casa é por-loja. Escolhi a coerência
> com o código existente. Se um dia houver segunda loja, cada uma terá seus parâmetros
> — o que é provavelmente o desejável, e não custa nada agora.

`ai_settings` foi descartado como casa: é singleton com RLS **Owner-only**, e o dono
pediu que o Gestor também edite.

### 3.2 Fronteira com `Configurações → IA`

Sem campo duplicado.

| Tela | Responde |
|---|---|
| `Configurações → IA` | **Qual cérebro** — provedor, modelo, temperatura, prompt de sistema, chaves, orçamento geral da plataforma |
| `Configurações → Copiloto` | **Como o assistente se comporta** — quando roda, onde aparece, para quem, o que mostra, teto próprio |

O modelo aparece no painel do assistente apenas como **leitura**, com atalho para a
tela de IA.

### 3.3 Política vs preferência pessoal

Dois tipos de parâmetro, deliberadamente em lugares diferentes:

- **Política da operação** → servidor (`stores.settings`), editável por Dono e Gestor.
- **Preferência pessoal** → `localStorage`, cada pessoa a sua. Apenas o
  **posicionamento** (faixa/card/aba) é assim, como já é hoje
  (`gallo-copilot-placement`). A tela deixa isso explícito com um selo "pessoal".

### 3.4 Gate da rota

Hoje `/app/configuracoes/copiloto` **não tem gate algum** — qualquer pessoa logada
abre. Isso era aceitável quando o único campo era uma preferência visual. Com política
de operação e teto de gasto, passa a:

```ts
beforeLoad: ({ location }) =>
  requireAuth(location.pathname, ["Owner", "Gestor"], { resource: "settings", action: "edit" })
```

Mesmo formato de `app.configuracoes.atendimento.alertas-ociosidade.tsx`, com `"Gestor"`
somado à lista de papéis.

## 4. Modelo de dados

```ts
/**
 * Conversation-assistant behaviour (spec 2026-07-22). Stored at
 * `stores.settings->'copilotAssistant'`. Absent → DEFAULT_COPILOT_ASSISTANT_SETTINGS.
 * The panel PLACEMENT is deliberately NOT here: it is a per-person preference
 * kept in localStorage.
 */
export interface ICopilotAssistantSettings {
  enabled: boolean;
  /** Which conversations get the panel. */
  reach: "all" | "customer_only" | "lead_only";
  /** WhatsApp accounts the assistant acts on. Empty array → every account. */
  accountIds: ID[];
  /** Roles that see the panel. */
  roles: RoleName[];

  /** When the analysis runs. Only "on_demand" has any effect while engine = "rules". */
  trigger: "on_demand" | "on_open" | "on_new_message";
  /** Minutes an analysis stays valid before being redone. */
  cacheMinutes: number;
  /** New inbound messages required before an analysis is redone. */
  minNewMessages: number;
  /** How many recent messages the assistant reads. */
  messageWindow: number;

  showSummary: boolean;
  showSuggestions: boolean;
  showReplyButton: boolean;
  /** Open the panel automatically when there is at least one suggestion. */
  autoExpandOnAlert: boolean;

  /** "rules" = deterministic keyword engine (free). "ai" is unlocked by sub-project B. */
  engine: "rules" | "ai";
  /** Assistant's own monthly cap in BRL, inside the platform-wide cap. 0 = no own cap. */
  monthlyCapBRL: number;
  /** Percentage of the own cap that triggers a notification to the Owner. */
  alertThresholdPct: number;
}
```

Defaults escolhidos para **preservar o comportamento atual** onde ele não é defeito, e
corrigir onde é:

```ts
export const DEFAULT_COPILOT_ASSISTANT_SETTINGS: ICopilotAssistantSettings = {
  enabled: true,
  reach: "all",              // corrige o gap dos 85%
  accountIds: [],            // todas as contas
  roles: ["Owner", "Gestor", "Vendedor", "SDR"],
  trigger: "on_demand",
  cacheMinutes: 30,
  minNewMessages: 3,
  messageWindow: 40,         // substitui a paginação integral
  showSummary: true,
  showSuggestions: true,
  showReplyButton: true,
  autoExpandOnAlert: true,   // ataca o "1 uso na história"
  engine: "rules",           // B destrava "ai"
  monthlyCapBRL: 0,
  alertThresholdPct: 80,
};
```

Os campos `trigger`, `cacheMinutes` e `minNewMessages` **existem e são persistidos**
neste sub-projeto, mas só passam a ter efeito quando `engine = "ai"` (Sub-projeto B).
A tela os exibe desabilitados com a explicação, em vez de escondê-los — assim o dono
enxerga o que o B vai destravar. `engine: "ai"` fica **indisponível** na tela até o B.

## 5. Os sete trabalhos

### A1 — Ordenação das mensagens na Edge

`supabase/functions/copilot-generate/index.ts`: trocar por ordenação descendente com
limite, revertendo antes de montar o prompt.

```ts
.order("sent_at", { ascending: false })
.order("id", { ascending: false })   // desempate estável
.limit(messageWindow)
```

e `(msgs ?? []).reverse()` antes do `map` para `PromptMessage[]`.

O segundo critério de ordenação é necessário: `sent_at` tem granularidade de segundo em
mensagens importadas e empates são comuns em rajadas — sem ele o corte da janela é
não-determinístico.

`MESSAGES_LIMIT` deixa de ser constante e passa a vir de `messageWindow` das settings da
loja da conversa, com o default como piso de segurança.

**Requer redeploy da Edge.** Ver §8.

### A2 — Painel nas conversas de lead

- Remover a condição `conversation.customerId &&` das duas montagens em
  `ConversationPage.tsx` (linhas 277 e 295), substituindo pela avaliação de `reach`.
- `supabaseCopilotProvider.getPanelData`: quando não há `customerId` mas há `leadId`,
  carregar o lead por `leadsProvider.getViaConversation(conversationId)` — a RPC
  gated-once **já existe** e é usada por `useConversationDetail`. Nenhum caminho novo
  de RLS é aberto.
- `buildBriefing` ganha uma variante para lead: no lugar de ciclo de vida / classe ABC /
  ticket / recência (que exigem histórico de compra), mostra **estágio do lead** e
  origem. O selo do cabeçalho passa a exibir `Lead · <estágio>`.
- As regras R2 (`billing_mismatch`) e R3 (`dormant_opportunity`) dependem de
  `ctx.customer` e **já retornam `null`** quando ele é ausente — nenhuma alteração.
  R1 (`unanswered_deadline`) nunca dependeu de cliente e passa a valer para leads.

### A3 — Buscar só quando o painel vai aparecer

`useCopilotPanel` passa a receber o veredito de renderização e a não buscar nada quando
ele é falso. A decisão (settings × conversa × papel × conta) vira uma função pura:

```ts
// src/features/copilot/engine/shouldMountCopilot.ts
export function shouldMountCopilot(input: {
  settings: ICopilotAssistantSettings;
  conversation: Pick<IConversation, "customerId" | "leadId" | "whatsappAccountId">;
  role: RoleName;
}): boolean
```

Testada isoladamente. A página consome o resultado tanto para montar quanto para evitar
a busca — uma fonte de verdade, não duas.

### A4 — Janela limitada de mensagens

`listAllMessages` é substituída por uma leitura única das `messageWindow` mensagens mais
recentes (`orderDir: "desc"`, `pageSize: messageWindow`, revertida), eliminando a
paginação sequencial. As três regras e o resumo passam a operar sobre essa janela.

**Mudança de semântica assumida:** R1 conta perguntas de prazo dentro da janela, não na
conversa inteira. Para um alerta sobre "o cliente está esperando agora", isso é mais
correto do que somar perguntas de meses atrás — e é o que o parâmetro `messageWindow`
comunica ao dono.

### A5 — Resumo ancorado no fim

`summaryFromMessages` deixa de usar o primeiro inbound da conversa. Passa a montar o
resumo a partir da janela: a pendência atual (último inbound) permanece, e o contexto
anterior vem do primeiro inbound **da janela**, não da história.

O texto muda de `Cliente iniciou com "…". Pendência atual: "…"` para
`Últimas mensagens: "…". Pendência atual: "…"` — deixa de afirmar um começo que a
janela não conhece.

### A6 — Teto de orçamento à prova de concorrência

Hoje `monthSpendBRL` soma e compara em JavaScript, entre duas viagens ao banco. Com uma
pessoa clicando de vez em quando isso nunca falhou; com o disparo automático do B, várias
chamadas leem o mesmo total antigo e passam juntas.

Nova RPC `SECURITY DEFINER`, service_role-only:

```sql
ai_budget_try_consume(p_feature text, p_estimated_brl numeric) returns boolean
```

Toma `pg_advisory_xact_lock` sobre uma chave derivada do mês corrente, soma
`ai_usage_events` do mês, compara contra o teto da plataforma **e** contra o teto próprio
do assistente quando `p_feature = 'conversation_copilot'`, e devolve o veredito dentro da
mesma transação. `copilot-generate` e `ai-generate` passam a chamá-la no lugar da
soma solta.

O teto próprio do assistente é lido de `stores.settings->'copilotAssistant'->>'monthlyCapBRL'`.

Migration versionada em `supabase/migrations/`, aplicada em produção **só com o OK do
dono** (regra do projeto).

### A7 — Painel de controle

`Configurações → Copiloto` deixa de ter um campo e passa a ter os cinco blocos do
mockup: **Ativação e alcance**, **Quando analisar**, **O que o painel mostra**,
**Motor**, e a **estimativa viva**.

A estimativa é uma função pura, testada:

```ts
// src/features/copilot/engine/estimateAssistantCost.ts
export function estimateAssistantCost(input: {
  settings: ICopilotAssistantSettings;
  activeConversationsPerDay: number;
  costPerCallBRL: number;
}): { callsPerDay: number; monthlyBRL: number; pctOfCap: number }
```

Ela recalcula na tela conforme os controles mudam. **A premissa de reaberturas por
conversa é exibida como premissa**, não como fato — é o número mais frágil da conta
(estimado, não medido) e a tela precisa dizer isso.

A página nova vive em `src/features/copilot/pages/CopilotAssistantSettingsPage.tsx`,
consumindo `useSettingsProvider()` como as demais telas de configuração.

> **O mockup mostra o destino, não o que o A entrega.** No desenho o disparo está em
> "Ao abrir", o motor em "Inteligência artificial" e a estimativa em ~R$ 375/mês — esse
> é o painel **depois do Sub-projeto B**. O A entrega a mesma tela com os defaults da
> §4: motor em "Regras", disparo em "Sob demanda", estimativa em R$ 0,00, e a opção
> "Inteligência artificial" visível porém travada, com a explicação de que ela é
> destravada pelo B.

## 6. Como cada parâmetro é respeitado

| Parâmetro | Respeitado onde |
|---|---|
| `enabled`, `reach`, `accountIds`, `roles` | `shouldMountCopilot` (A3) — frontend |
| `messageWindow` | frontend (A4) **e** Edge `copilot-generate` (A1) |
| `showSummary`, `showSuggestions`, `showReplyButton` | render do `CopilotStrip`/`CopilotCard`/`CopilotFicheTab` |
| `autoExpandOnAlert` | estado inicial de `expanded` nos três componentes |
| `monthlyCapBRL` | RPC `ai_budget_try_consume` (A6) — servidor |
| `trigger`, `cacheMinutes`, `minNewMessages` | persistidos e sem efeito até o Sub-projeto B |
| `engine` | trava a opção "ai" na tela até o Sub-projeto B |

O ponto que exige atenção: `messageWindow` é lido nos **dois lados**. O frontend lê das
settings via provider; a Edge lê do banco pela loja da conversa. Nenhum dos dois assume
o valor do outro, e ambos aplicam o default como piso.

## 7. Testes

Engines puros com Vitest, co-localizados:

- `shouldMountCopilot.test.ts` — matriz de alcance × papel × conta × conversa
  (cliente / lead / ambos), incluindo `enabled: false` e `accountIds` vazio = todas.
- `estimateAssistantCost.test.ts` — cada modo de disparo, teto zero, teto estourado.
- `buildReplyPrompt.test.ts` (existente) — **acrescentar** o caso que hoje falta: um
  conjunto de mensagens maior que a janela deve produzir as **mais recentes**.
- Ajustar `copilot.test.ts` do mock para o resumo ancorado no fim (A5).

Não há teste automatizado para a Edge; a validação de A1 é a sonda manual descrita no
rollout.

## 8. Rollout

A ordem importa e não é negociável:

1. **Migration** da RPC `ai_budget_try_consume` aplicada em produção (com OK do dono).
2. **Deploy da Edge** `copilot-generate` — sem ele, A1 não existe em produção e a Edge
   segue lendo as mensagens antigas.
3. **Merge do PR** (frontend).
4. **Smoke:** abrir uma conversa de lead e confirmar o painel; abrir uma conversa com
   mais de 200 mensagens, gerar resposta com IA e conferir que o rascunho fala do assunto
   atual; conferir o registro em `ai_usage_events`.

O workflow "Edge Functions deploy" do repositório **é no-op** — passa verde sem deployar.
O deploy tem de ser feito pela CLI:
`npx supabase functions deploy copilot-generate --project-ref njizaasajkdqptlxddqn`.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Ligar o painel em 2.919 conversas expõe as regras a conteúdo que elas nunca viram | As três regras já são conservadoras (retornam `null` sem casar). O risco real é ruído, não erro; `reach` permite recuar sem deploy. |
| `messageWindow` menor muda quando R1 dispara | Assumido e documentado em §A4. O parâmetro é a válvula. |
| Edge e frontend divergirem no valor da janela | Ambos leem da mesma fonte com o mesmo default como piso; nenhum deriva do outro. |
| A estimativa de custo passar por medição | A tela rotula a premissa de reaberturas como premissa, e o número real de gasto do mês aparece ao lado. |
| Migration aplicada sem deploy da Edge | Ordem explícita em §8; a RPC nova é aditiva e não quebra o caminho antigo enquanto a Edge não for atualizada. |

## 10. O que este sub-projeto não resolve

Depois do A o copiloto está correto, presente em 100% das conversas e controlável — mas
o que ele **diz** continua saindo de três regras de palavra-chave: prazo perguntado duas
vezes, NF de empresa em cadastro de pessoa física, cliente dormente falando em preço.
Fora desses três casos, ele mostra "Sem alertas no momento".

Isso é o Sub-projeto B, e é deliberado: o A entrega a fundação e o interruptor. Quando o
B chegar, ligar a IA é um clique na tela, não um deploy.
