# KPI "Áudios transcritos" na Visão geral de IA — Design

- **Data:** 2026-07-17
- **Status:** Aprovado (brainstorming com o dono nesta data)
- **Origem:** Pedido direto do dono ao ver a aba `Configurações → Inteligência artificial →
  Visão geral`: hoje a fileira de KPIs mostra Chamadas, Tokens, Custo est. e Budget, mas nenhum
  número resume quantos áudios de WhatsApp foram efetivamente transcritos pela feature
  `audio_transcription` (v0.144.0 `Usher`/v0.145.0 `Scribe`, docs `docs/dev/ai-llm-integration.md`).

## Problema

`ai_usage_events` já grava um evento por tentativa de transcrição (`feature: 'audio_transcription'`,
`status: 'ok' | 'error'` — ver `supabase/functions/_shared/ai/transcribeAudio.ts`), e o card
"Custo por funcionalidade" já soma o custo dessa feature. Mas não existe nenhum número exposto na
tela equivalente a "quantos áudios foram transcritos": o `calls` agregado em
`IAiUsageSummary.byFeature` mistura sucesso e erro, e nenhum KPI isolado existe para a feature.

## Decisões (dono, 2026-07-17)

1. O KPI conta **só transcrições com sucesso** (`status === 'ok'`) — tentativas com erro
   (custo zerado, sem texto persistido em `messages.transcription`) não contam como "transcrito".
2. O card entra **no final da fileira**, como 5º KPI, depois de "Budget" — ordem atual dos 4
   primeiros cards permanece intacta.
3. Reflete o mesmo seletor de período já existente na aba (Mês atual / Últimos 7 dias /
   Últimos 30 dias) — não é um card à parte com período próprio.

## Design

### 1. Dado — engine puro, zero mudança de backend

`summarizeUsage()` (`src/features/ai-settings/engine/aiUsage.ts`) já é o único ponto que agrega
`IAiUsageEvent[]` em `IAiUsageSummary`, e tanto `mockAiProvider.getUsageSummary` quanto
`supabaseAiProvider.getUsageSummary` (`src/providers/data/impl/supabase/ai.ts`) chamam essa mesma
função sobre os eventos já carregados (`listUsageEvents`, até 5000 linhas). Não há RPC, migration
nem Edge Function nova — o campo é derivado no cliente a partir de dado que já existe.

- Novo campo em `IAiUsageSummary` (`src/shared/types/ai.ts`):
  ```ts
  audioTranscriptions: number;
  ```
- Cálculo dentro de `summarizeUsage()`, junto dos demais agregados de `inPeriod`:
  ```ts
  const audioTranscriptions = inPeriod.filter(
    (e) => e.feature === "audio_transcription" && e.status === "ok",
  ).length;
  ```
- Entra no objeto de retorno ao lado de `calls`/`tokens`/`costBRL` etc.

Alternativas descartadas:
- **Reaproveitar `byFeature.find(f => f.feature === 'audio_transcription')?.calls`**: já existe,
  mas conta `ok` + `error` juntos (decisão 1 acima descarta essa leitura).
- **Adicionar um campo `okCalls` genérico dentro de `byFeature`**: contaminaria a agregação
  genérica por-feature (usada por "Custo por funcionalidade" para todas as 5 features) com uma
  distinção que só interessa a uma feature específica.
- **Calcular na UI a partir dos eventos brutos**: os eventos brutos não chegam à camada de
  página hoje (`useAiUsage` expõe só o `summary` pronto) — furaria a fronteira engine-testado /
  UI-burra que o resto do arquivo já respeita.

### 2. UI — `AiOverviewTab.tsx`

- Novo `<KpiCard>` após o de "Budget":
  ```tsx
  <KpiCard
    icon="mdi:microphone-message"
    label="Áudios transcritos"
    value={int.format(summary.audioTranscriptions)}
  />
  ```
- Grid da fileira de KPIs muda de `grid-cols-2 md:grid-cols-4` para `grid-cols-2 md:grid-cols-5`
  (mobile: 2 colunas / 3 linhas; desktop: 5 colunas / 1 linha).

### 3. Testes

- `aiUsage.test.ts`: novo caso cobrindo
  - eventos `audio_transcription` com status `ok` e `error` misturados → conta só os `ok`;
  - eventos de outras features (`sdr`, `conversation_copilot`, etc.) não entram na contagem;
  - período sem nenhum evento de `audio_transcription` → `0`.
- Nenhum teste de provider (mock/supabase) precisa mudar — ambos delegam a `summarizeUsage()`,
  já coberta.

## Fora de escopo

- Não mexe em `transcribeAudio.ts` nem no fluxo de gravação do evento (a inconsistência conhecida
  de eventos `status: 'ok'` com texto vazio — linhas 188-199 do arquivo — é um bug pré-existente
  separado, não tratado aqui).
- Não adiciona breakdown por período/gráfico dedicado — é só mais um KPI na fileira existente.
- Sem migration, sem deploy de Edge Function, sem mudança de RLS.

## Riscos

- Nenhum risco de dado/produção: campo derivado client-side de uma leitura já existente
  (`listUsageEvents`), sem escrita nova e sem mudança de schema.
- Único ponto de atenção: manter a fileira de 5 cards legível em telas estreitas — resolvido pelo
  grid responsivo (`grid-cols-2 md:grid-cols-5`).
