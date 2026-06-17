# Lista dinâmica de modelos LLM por provedor — Design

**Data:** 2026-06-17
**Área:** Configurações → Inteligência artificial → Provedores & chaves
**Contexto de release:** sobre a v0.103.0 `Polyglot` (OpenAI já é provedor utilizável).
**Issue/origem:** pedido do dono — "a lista das LLMs só exibe duas; quero que seja dinâmica".

---

## 1. Problema

Hoje a lista de modelos por provedor é **estática**: 2 modelos hardcoded por provedor em
`src/providers/data/engine/aiCatalog.ts` (`MODELS`). Esse seed popula
`ai_settings.providers[].models`, que alimenta o dropdown "Modelo padrão" do `ProviderCard`.
O Owner quer ver os modelos **realmente disponíveis** na conta de cada provedor, não uma lista
fixa de dois.

## 2. Objetivos

- Listar dinamicamente os modelos disponíveis em cada um dos **3 provedores suportados**
  (Anthropic, OpenAI, OpenRouter), buscando ao vivo na API de modelos de cada um.
- Preservar o cálculo de custo: o Edge `ai-generate` calcula custo a partir do preço persistido
  em `ai_settings.providers[].models[]`. A lista dinâmica precisa carregar preço para os modelos.
- Manter a fronteira de segurança: a chave de API vive no Vault; a busca é **server-side**.

## 3. Não-objetivos (fora de escopo)

- Tornar Google dinâmico (segue "adaptador em breve", sem adaptador de geração ainda).
- Edição manual de preço por modelo na UI (pode virar incremento futuro; ver §11).
- Sincronização automática periódica (cron) da lista de modelos.
- Catálogo de preços "oficial" sempre correto — o mapa de preços é **best-effort** (preços mudam).

## 4. Decisões tomadas (brainstorming)

| Decisão | Escolha |
|---|---|
| Escopo | Os **3** provedores suportados (Anthropic, OpenAI, OpenRouter). |
| Preço de OpenAI/Anthropic (APIs sem preço) | **Mapa no catálogo + merge.** Sem match → selecionável, marcado "preço a definir", custo 0. |
| Onde o fetch acontece | **Ação `list-models` no Edge `ai-generate`** (reusa auth + Vault + bundling). Não criar função nova; não buscar do browser. |
| Gatilho | **Botão "Atualizar modelos"** + **auto-busca uma vez** no primeiro acesso quando a lista ainda é a semente padrão. |
| Lista grande (OpenRouter ~300) | **Combobox com busca** (`cmdk`) quando a lista exceder ~20 modelos; senão `<select>` nativo. |

## 5. Arquitetura

```
ProviderCard (UI)
  └─ provider.listProviderModels(providerId)        [IAiProvider, novo método]
       ├─ mock:     modelsFor(providerId)            (catálogo estático, determinístico)
       └─ supabase: functions.invoke('ai-generate', { mode:'list-models', providerId })
                      → normaliza + mergeia preço (priceForModel)
                      → persiste em ai_settings.providers[].models (updateProviderConfig)
                      → retorna IAiModelOption[]
Edge ai-generate  (mode:'list-models')
  └─ requireCaller(['owner']) → resolveSecret(KEY) → listModels<provider>()  [adapters]
       → [{ id, label, inputPricePer1kUsd?, outputPricePer1kUsd? }]
```

### 5.1 Edge — `mode: "list-models"`

Adicionado ao handler de `supabase/functions/ai-generate/index.ts`. Reusa
`requireCaller(req, ["owner"])`, `createSecretResolver`, `SUPPORTED`, `KEY_BY_PROVIDER`.

- Input: `{ mode: "list-models", providerId }`. `providerId` deve estar em `SUPPORTED` (senão 400).
- Resolve a chave do Vault (`KEY_BY_PROVIDER[providerId]`). Ausente → 400.
- Chama o adaptador de listagem do provedor com `AbortSignal.timeout` (~15 s, listagem é rápida).
- Retorna `{ models: NormalizedModel[] }`, onde
  `NormalizedModel = { id: string; label: string; inputPricePer1kUsd?: number; outputPricePer1kUsd?: number }`.
- Erro de rede/HTTP do provedor → 502 com mensagem; timeout → 504.

### 5.2 Adaptadores de listagem (`supabase/functions/_shared/ai/modelList.ts`)

Módulo runtime-agnostic (Web APIs apenas), separado de `adapters.ts` (geração) por
responsabilidade. Uma função por provedor, retornando `NormalizedModel[]`:

- **`listAnthropicModels(apiKey, signal)`** — `GET https://api.anthropic.com/v1/models`
  (headers `x-api-key`, `anthropic-version: 2023-06-01`). Paginação: o endpoint é paginado
  (`has_more`/`last_id`); seguir páginas até `has_more === false` (cap defensivo de ~5 páginas).
  Map: `{ id, label: display_name ?? id }`. **Sem preço** (vem do mapa).
- **`listOpenAIModels(apiKey, signal)`** — `GET https://api.openai.com/v1/models`
  (header `Authorization: Bearer`). Map: `{ id, label: id }`. **Filtro de chat** (ver §6).
  **Sem preço** (vem do mapa).
- **`listOpenRouterModels(apiKey, signal)`** — `GET https://openrouter.ai/api/v1/models`
  (header `Authorization: Bearer`). Map: `{ id, label: name ?? id,
  inputPricePer1kUsd: Number(pricing.prompt) * 1000, outputPricePer1kUsd: Number(pricing.completion) * 1000 }`.
  **Com preço** (o OpenRouter reporta USD **por token**; ×1000 para "por 1k").
  - Modelos com `pricing.prompt`/`pricing.completion` ausentes ou não-numéricos → preço omitido
    (cai no mapa/“preço a definir”), nunca `NaN`.

### 5.3 Filtro de modelos de chat (OpenAI) — engine puro

A `/v1/models` da OpenAI devolve uma lista "suja" (embeddings, áudio, imagem, moderação…).
Função pura `isOpenAiChatModel(id): boolean`:

- **Inclui** ids que começam com `gpt`, `o1`, `o3`, `o4`, `chatgpt`.
- **Exclui** ids que contenham qualquer um de:
  `embedding`, `whisper`, `tts`, `audio`, `realtime`, `image`, `dall-e`, `moderation`,
  `transcribe`, `search`, `computer-use`, `codex`.
- Ordena alfabeticamente decrescente (modelos mais novos/maiores tendem a vir primeiro).

Anthropic e OpenRouter não precisam desse filtro (Anthropic só tem modelos de chat;
OpenRouter já é catálogo de chat/completions). O filtro é aplicado **só ao OpenAI**.

## 6. Mapa de preços (`aiCatalog.ts`)

`MODELS` continua sendo o seed e a **fonte do mapa de preços**. Novo helper:

```ts
export function priceForModel(
  provider: AiProviderId,
  id: string,
): { inputPricePer1kUsd: number; outputPricePer1kUsd: number } | null
```

- Procura `MODELS[provider]` por `id` exato; achou → retorna o preço; não achou → `null`.
- `MODELS` é **expandido** com os modelos conhecidos de OpenAI e Anthropic (famílias atuais),
  para que os modelos comuns já venham precificados ao listar dinamicamente. Preços em USD/1k,
  best-effort (documentado como aproximado).

### 6.1 Merge de preço (no `supabaseAiProvider`)

Para cada `NormalizedModel` vindo do Edge:

- Se já traz `inputPricePer1kUsd`/`outputPricePer1kUsd` (OpenRouter) → usa.
- Senão, `priceForModel(provider, id)` → usa o mapa.
- Senão → `inputPricePer1kUsd: 0, outputPricePer1kUsd: 0` (sinaliza "preço a definir" na UI:
  um modelo é "preço a definir" quando **ambos** os preços são 0).

Resultado: `IAiModelOption[]` (id, label, preços). Persiste via
`updateProviderConfig(provider, { models })`, preservando `defaultModel`:

- Se o `defaultModel` atual **não** estiver na nova lista, mantém o valor atual mesmo assim
  (não força troca silenciosa); a UI mostra o valor atual e o usuário pode re-selecionar.

## 7. Contrato e providers

`IAiProvider` ganha:

```ts
listProviderModels(providerId: AiProviderId): Promise<IAiModelOption[]>;
```

- **mock** (`impl/mock/ai.ts`): retorna `modelsFor(providerId)` (estático, determinístico).
  Não chama rede. Mantém o comportamento de Demonstração inalterado.
- **supabase** (`impl/supabase/ai.ts`): invoca o Edge (`mode:'list-models'`), faz o merge de
  preço (§6.1), persiste e retorna a lista mergeada.

## 8. UI — `ProviderCard`

- Botão **"Atualizar modelos"** (ícone refresh) ao lado do label "Modelo padrão",
  habilitado só quando o provedor está `configured` e suportado.
- Clique → `listProviderModels(provider)` → `onChanged()` (revalida settings).
  Estado de carregamento no botão; toast de sucesso com a contagem ("N modelos encontrados").
- **Auto-busca uma vez:** ao montar, se o provedor está `configured` **e** a lista atual é igual
  à semente estática do catálogo (heurística: mesmos ids do `modelsFor`), dispara um refresh
  silencioso (sem toast). Evita refazer a cada abertura.
- **Seletor adaptativo:** se `models.length > 20`, renderiza um **combobox com busca** (`cmdk`,
  via o componente Command já existente em `components/ui`); senão, o `<select>` nativo atual.
- **Selo "preço a definir":** modelos com ambos os preços 0 aparecem com badge discreto; o custo
  desses modelos será 0 no painel/teto até o preço ser mapeado (documentado).
- Mostra "Última atualização: …" quando houver (reusa/!estende um campo de timestamp; ver §10).

## 9. Erros

- Falha de fetch (rede/HTTP/timeout) → toast "Falha ao listar modelos: <mensagem>"; **mantém a
  lista atual** (nunca zera). Auto-busca silenciosa que falha → silenciosa (log no console), não
  incomoda o usuário; o botão manual reporta erros.
- Provedor não configurado → botão desabilitado (sem chave, não há o que listar).
- Lista vazia retornada (ex.: filtro do OpenAI removeu tudo) → mantém a atual + toast informativo.

## 10. Persistência / esquema

- **Sem migration.** `ai_settings.providers[].models` já é `jsonb` e aceita a lista expandida.
- Timestamp da última listagem: reusar `lastTestedAt` **não** serve (semântica diferente).
  Decisão: adicionar `modelsRefreshedAt?: ISO8601` em `IAiProviderConfig` (campo jsonb, sem
  migration — vive dentro de `providers`). Opcional na UI; se complicar, exibir apenas a contagem.

## 11. Testes

Engines puros (Vitest, co-localizados):

- `isOpenAiChatModel` — inclui/exclui os prefixos e substrings esperados.
- Normalização OpenRouter — conversão por-token→por-1k (×1000), e omissão segura quando
  `pricing` é ausente/não-numérico (sem `NaN`).
- `priceForModel` — hit no mapa, miss → `null`.
- Merge de preço — OpenRouter usa preço da API; OpenAI/Anthropic herdam do mapa; desconhecido → 0
  + flag "preço a definir"; `defaultModel` ausente da nova lista é preservado.

A camada de adaptadores do Edge (`modelList.ts`) **não** tem teste Vitest (runtime Deno, fora do
Vitest/Vite) — validada por smoke (botão "Atualizar modelos" + verificar a lista), igual ao
`callOpenAI`.

## 12. Deploy

1. Redeploy do Edge `ai-generate` (ação `list-models` nova) via CLI.
2. Merge do front (novo método, UI, catálogo). Sem migration.
3. Ordem: Edge antes do front (o botão só funciona com o Edge novo no ar).

## 13. Riscos aceitos

| Risco | Postura |
|---|---|
| Preços do mapa desatualizam (OpenAI/Anthropic mudam tabela). | Best-effort, documentado. OpenRouter sempre vem da API. Edição manual fica para incremento futuro. |
| Modelo selecionável sem preço (custo 0) fura o teto/painel. | Aceito: teto é best-effort e consumidores estão deferidos. Selo "preço a definir" avisa. |
| Filtro do OpenAI esconder um modelo de chat válido (heurística). | Aceito; heurística conservadora. Ajustável depois; o usuário vê o que sobrou. |
| `/v1/models` da OpenAI lista modelos que a conta não pode chamar. | Aceito: o erro real aparece no Playground/teste; listar ≠ ter acesso. |
```
