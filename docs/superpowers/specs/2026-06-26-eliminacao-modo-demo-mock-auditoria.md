# Auditoria de re-validação — Eliminação do modo Demonstração/mock

> **Data:** 2026-06-26 · **Branch:** `chore/eliminate-demo-mock-mode` (rebaseada sobre `origin/main` @ `758ccf0`, **v0.121.0 Conduit**) · **PR:** [#110](https://github.com/edmilson-prog/gallo-basediesel/pull/110)
> **Valida:** [`docs/superpowers/specs/2026-06-18-eliminacao-modo-demo-mock-design.md`](2026-06-18-eliminacao-modo-demo-mock-design.md) (escrito contra `6770707`, v0.104.0 Manifest) e o [checkpoint](../../checkpoints/2026-06-17-1607-eliminacao-modo-demo-mock.md) (contra `33428db`).
> **Método:** auditoria paralela de **10 frentes** (read-only) re-checando cada afirmação do spec contra a árvore atual. Working tree = `origin/main` (758ccf0) + 9 commits de WhatsApp-Go server registry — irrelevantes para a camada demo/mock. **0 commits atrás** do main.

---

## 1. Resumo executivo (veredito)

O spec descreve **corretamente a espinha dorsal** da eliminação — a plataforma roda supabase em produção, o modo Demonstração/mock é legado removível, e o mapa de áreas a tocar continua certo nos seus eixos principais. **A decisão é executável.** Porém os **384 commits** entre o spec (v0.104.0) e hoje (v0.121.0) produziram três classes de achado que o plano precisa absorver antes de executar:

1. **Todos os números subiram** (mock 47→54, providers 37→44, testes ~103→160, call-sites 31→35). Drift de contagem, não de conceito. Tabela em §4.
2. **A decisão-chave do destino da IA virou MOOT.** O checkpoint a marcava como bloqueante ("IA gated `demoOnly` + `supabaseAiProvider` stub"). Hoje a IA **já roda real em produção** e **não é mais `demoOnly`** — o spec de 18/06 já tinha corrigido isso; a auditoria confirma. Resta só remover o **lado mock** do provider `ai`.
3. **14 superfícies/pontos-cegos novos** que o mapa do spec não enumera — uma **segunda camada de providers inteira** (notificações), **4 factories irmãs** acopladas à fonte, **2 providers novos** com mock, o **wizard de checkout demo**, áudio simulado, e mais (§5).

E uma **armadilha de metodologia crítica** (§6): no shell MSYS/Git-Bash deste ambiente, `ripgrep`/`git grep` **falham silenciosamente** em qualquer padrão que contenha `/`. O comando de verificação `rg "@/mocks"` do próprio spec retorna **zero hits** — daria falso "sem vazamentos" e passaria a Fase C sem remover o `useBadges`.

**Conclusão:** o spec **não precisa ser reescrito** — precisa de um *errata* de números (§4) e de um *adendo* de superfícies (§5/§7). As decisões fechadas (Opção A, IA mantida, WhatsApp/DINTEC fora de escopo) **seguem válidas**.

---

## 2. Método

10 subagentes em paralelo, cada um responsável por uma frente do spec, instruídos a classificar cada afirmação como:

- **confirmed** — segue verdadeira;
- **drifted** — segue verdadeira, mas o **número/caminho mudou** (valor novo informado);
- **broken** — **deixou de ser verdadeira**;
- **new-risk** — algo **novo desde o spec** que o plano de eliminação precisa tratar.

Cada veredito veio com evidência concreta (`arquivo:linha` ou contagem exata). Total: 194 chamadas de ferramenta, ~776k tokens.

---

## 3. Veredito por frente

| # | Frente (seção do spec) | Veredito geral | Destaque |
|---|---|---|---|
| 1 | Testes acoplados ao mock (§2) | ✅ confirmado · ⚠️ drift | Suíte **não quebra**: todo teste que importa o seed vive nos dirs removidos. Mas 6→13 testes nos dirs-alvo; só **3** importam o seed. |
| 2 | Switches + call-sites + `environmentMode` (§2/§4) | ✅ confirmado · 🆕 risco | 3 switches confirmados; `notifications/factory.ts` **ignora o override** (bug latente real). Call-sites 31→**35**. +3 factories irmãs e 1 leitura raw de env. |
| 3 | Inventário mock + fronteiras ESLint (§2/§4) | ✅ confirmado · ⚠️ drift | 6 blocos ESLint (3 citam mock) e exceção `design-system` confirmados. `src/mocks/` 114→**116**, `impl/mock/` 47→**54**. |
| 4 | Superfície de UI demo (§2/Fase A) | ✅ confirmado · 🆕 risco | Os 6 itens existem; `DataSourceBanner` **é separado (preservar)**. Enumeração incompleta: +`AudioBubble`, +filtro `demoOnly`, +blast radius de 34 arquivos. |
| 5 | `demoOnly` é código morto (§2) | ✅ confirmado | **Zero setters** `demoOnly: true`. Flag órfã. Fase A inalterada. Só drift de linha (307→330). |
| 6 | IA real vs lado mock (§2/§3) | ✅ confirmado · ⚠️ drift | `supabaseAiProvider` real, edge `ai-generate` existe, IA **não** é `demoOnly`. Contrato cresceu: +`isAiFeatureEnabled`/`resolveAnalyticsQueries` + edge `analytics-resolve`. |
| 7 | Gate da Fase C — vazamento `badges` (§6.1) | ✅ confirmado · 🆕 risco | `useBadges` segue o **único** leak não-sancionado; sem provider, sem tabela. **Mas** o comando de scan do spec é falho no MSYS (§6). |
| 8 | Erro tipado (§2/Fase D) | ✅ confirmado · ⚠️ drift | `/not found/i` segue em `useConversationDetail`; `errors.ts` sem `NotFoundError`. **"2 telas" → 1**: `useCustomerProfile` já degrada com null. |
| 9 | Env vars, docs, contagem de providers (§2/§4) | ✅ confirmado · ⚠️ drift | 4 env vars confirmadas; WhatsApp/DINTEC fora de escopo OK. Providers 37/38→**44**; `provider-pattern.md` está em `docs/`, não `docs/dev/`. |
| 10 | Caça a drift adversarial (varredura) | 🆕 risco | Confirma §1–§9 e adiciona: camada de notificações, wizard de checkout demo, `useDataHealth`, `.env.example` sem `VITE_SHIPPING_PROVIDER`. |

---

## 4. Errata de números (drift de contagem)

| Métrica | Spec (v0.104.0) | Atual (v0.121.0) | Observação |
|---|---:|---:|---|
| Arquivos em `src/mocks/` | 114 | **116** | +2; inclui 7 `*.test.ts` co-localizados |
| Arquivos em `providers/data/impl/mock/` | 47 | **54** | +7 (48 não-teste + 6 testes) |
| Providers no `IDataProviders` | 37–38 | **44** | já eram **42** no próprio v0.104.0; novos: `atendimentoMetrics`, `whatsappGoServers` (este na branch atual) |
| Arquivos de teste (total) | ~103 | **160** | +57 |
| Testes dentro dos dirs-alvo | 6 | **13** | mas **só 3** importam o seed (`@/mocks`/`mockStore`/config) |
| Testes acoplados ao mock **fora** dos dirs sancionados | 0 | **0** (1 em `impl/mock` já é removido junto) | risco da suíte **menor** que o spec temia |
| Call-sites de `getActiveDataSource()` | 31 | **35** (36 raw − 1 definição) | em 32 arquivos consumidores; +6 leituras raw de `import.meta.env.VITE_*_SOURCE` |
| Providers supabase com `.single()` | ~38 | **39 arquivos / 117 call-sites** | dimensiona a opção "ampla" da Fase D |
| Providers supabase já null-safe (`.maybeSingle()`) | — | **9 arquivos** | convenção divergente a reconciliar (§5.H) |
| Linha do filtro `demoOnly` em `SettingsLayout` | ~307 | **330** | tipo segue na 23 |
| "Telas" com `/not found/i` frágil | 2 | **1** | `useCustomerProfile` refatorado p/ null-coalescing |
| `EnvironmentModePage` | (via rota) | `src/features/admin-settings/pages/EnvironmentModePage.tsx` | componente migrou p/ `admin-settings` |
| Doc do provider pattern | `docs/dev/provider-pattern.md` | `docs/provider-pattern.md` | path corrigido |

---

## 5. Superfícies novas e pontos-cegos (o plano precisa absorver)

Itens que o mapa do spec **não enumera** e que mudam o escopo das fases B/C/D. Pré-existentes ao spec estão marcados como **ponto-cego**; surgidos depois, como **novo**.

- **A. Camada de providers de Notificações inteira** *(ponto-cego — PRD-008/009, criada 30/05, anterior ao spec)*. `src/providers/notifications/` tem `impl/mock/` (importa `@/mocks`), `impl/supabase/`, `factory.ts` próprio, `contracts/` e **bloco ESLint próprio** (`eslint.config.js:115-176`). A eliminação que só deletar `src/mocks` + `data/impl/mock` deixa a camada de notificações quebrada e um bloco ESLint pendurado. → **Fase B/C precisam tratá-la.**
- **B. 4 factories irmãs acopladas à fonte** *(ponto-cego/novo)*. Além de `data/factory.ts` e `auth/authSource.ts`, gateiam por fonte: `providers/shipping/factory.ts:16`, `providers/whatsapp/factory.ts:45`, `providers/dintec/factory.ts:25` (todas `VITE_<X>_PROVIDER==='mock' || getActiveDataSource()==='mock'`) e `providers/notifications/factory.ts:14` (lê `VITE_DATA_SOURCE` direto, **ignora o override**). Os **engines** WhatsApp/DINTEC ficam (decisão §3 do spec), mas o **fallthrough** `|| getActiveDataSource()==='mock'` e o **impl mock de shipping** entram na Fase B.
- **C. 2 providers novos com lado mock** *(novo)*: `atendimentoMetrics` e `whatsappGoServers` (este na branch `feat/whatsapp-go-server-registry` em andamento — a contagem ainda pode mover). Seus `impl/mock/*.ts` são parte da camada removida na Fase C.
- **D. Wizard de checkout demo** *(ponto-cego)*. `CheckoutPage.tsx:47` bifurca por fonte: em supabase faz handoff por WhatsApp (write-free), em mock roda um **wizard de 3 passos** — código **mock-only** inteiro a remover na Fase B.
- **E. Áudio simulado** *(ponto-cego)*. `AudioBubble.tsx:45-49` usa `SimulatedAudioPlayer`/waveform cosmético só quando `getActiveDataSource()==='mock'`.
- **F. Outras bifurcações por fonte** *(ponto-cego)*: `ConversationMenu.tsx:100` e `useDataHealth.ts` (rotula a origem nos breaks de saúde). Dos 35 call-sites, **15 bifurcam direto em `==='mock'`/`!=='supabase'`** — cada um exige conferência de **qual ramo é o supabase correto** antes de podar (podar o ramo errado inverte o comportamento).
- **G. Contrato `IAiProvider` cresceu** *(novo)*. +`isAiFeatureEnabled()` e +`resolveAnalyticsQueries()`, com **edge nova `analytics-resolve`**. Remover o mock ainda é "deletar 3 arquivos + 2 entradas no `factory.ts`", mas **muda o comportamento do copiloto analítico em demo** (hoje o mock força fallback de regras retornando `false`/`null`). O plano deve citar essas 2 superfícies, não só o playground.
- **H. Erros tipados pré-existentes a reconciliar na Fase D** *(ponto-cego)*. Já existem `WhatsAppAccountNotFoundError` (`providers/whatsapp/factory.ts:29`) e `MockNotFoundError` (`src/mocks/api/utils/errors.ts:17` — cuja mensagem literal `"<resource> not found"` **é por que** o regex `/not found/i` funciona no mock). E `assetLibrary.ts:173-182` **já** modela `PGRST116→null` via `.maybeSingle()`. Um `NotFoundError` novo deve **alinhar** com esses, não duplicar; e a Fase D precisa decidir entre a convenção "retorna null" (9 providers) e "lança erro tipado" (39 providers), ou o repo fica com dois idiomas.
- **I. Leitura raw de env fora dos switches** *(ponto-cego)*: `notifications/routing/router.ts:194` lê `import.meta.env.VITE_DATA_SOURCE` como campo de telemetria — sobrevive ao override e precisa ser limpo quando a env var for aposentada.
- **J. `.env.example` desatualizado** *(ponto-cego)*: documenta 4 knobs mas **não** o `VITE_SHIPPING_PROVIDER` que existe no código (`shipping/factory.ts:16`).

---

## 6. ⚠️ Armadilha de metodologia (CRÍTICA para o gate de CI)

No shell **MSYS/Git-Bash** deste ambiente Windows, `ripgrep` (e `git grep`) **falham silenciosamente** ao casar qualquer padrão que contenha uma barra `/`:

- `rg "@/mocks" src` → **zero hits**, mesmo em `useBadges.ts:3` que comprovadamente contém a string (verificado por `git cat-file` + hexdump).
- Isolamento do token: `rg '@'` casa · `rg '/mocks'` **não casa** · `rg -F '@/mocks'` **não casa**.

**Consequência:** o comando de verificação do checkpoint/spec (`grep -rl "@/mocks..." src`) e qualquer gate de CI que cace vazamentos com um padrão contendo `/` daria **falso "sem vazamentos"** — passaria a Fase C **sem** remover a dependência de `badges`, e quem reabrisse o PR concluiria erradamente que a faxina está completa.

**Mitigação obrigatória:** o gate deve usar **padrão sem barra** — `grep -rn 'badgesApi' src`, a ferramenta **Grep** (ripgrep configurado corretamente, sem o bug do shell), ou um regex como `from .@.mocks`. A ferramenta Grep encontra todos os ~50 hits corretamente; só o `rg`/`git grep` via Bash neste ambiente falha.

---

## 7. Impacto no plano por fases

As **decisões fechadas do spec (§3) seguem válidas**. Ajustes de escopo por fase:

- **Fase A — Remover UI do modo demo.** *Inalterada no conceito.* Itens confirmados nos caminhos do spec (tela Ambiente, `DemoModeBanner`, `EnvironmentBadge` no TopBar, badge na Saúde, flag `demoOnly` morta). Correções: `EnvironmentModePage` vive em `src/features/admin-settings/pages/`; filtro `demoOnly` na linha 330. **Não tocar `DataSourceBanner`** (confirmado separado).
- **Fase B — Colapsar switch p/ supabase-only.** *Escopo ampliado.* Além de `factory.ts`/`authSource.ts`/`notifications/factory.ts` + os **35** call-sites: tratar as **4 factories irmãs** (B), o **wizard de checkout demo** (D), o **áudio simulado** (E), `ConversationMenu`/`useDataHealth` (F) e a leitura raw em `router.ts` (I). Auth perde `MockAuthProvider`/`mock-users`/pick-a-profile. **Conferir o ramo supabase correto em cada call-site** antes de podar.
- **Fase C — Remover a camada mock.** *Superfície maior.* `src/mocks/` (**116**) + `data/impl/mock/` (**54**) + os mocks de `atendimentoMetrics`/`whatsappGoServers` + **a camada `notifications/impl/mock/`** (A) + `design-system.tsx` (`useResetMocks`) + deps faker/seedrandom + limpeza ESLint/env/docs. **Gate `badges` segue de pé** — usar scan **sem barra** (§6). Remover o lado mock da IA (3 arquivos) muda o copiloto analítico em demo (G).
- **Fase D — Erro tipado supabase-only.** *Redimensionada.* Hoje **1** tela viva (`useConversationDetail`), não 2. `NotFoundError`/`isNotFoundError` (reconhece `PGRST116`) em `errors.ts`, **alinhado** com `WhatsAppAccountNotFoundError`/`MockNotFoundError` e com a convenção `.maybeSingle()→null` de `assetLibrary` (H). Mínimo = 1 tela; amplo = **39** providers `.single()` / 117 call-sites.

---

## 8. Decisões: o que mudou desde o spec

- **Destino da área de IA:** ✅ **RESOLVIDO / MOOT.** Não é mais bloqueante. IA real em produção, sem `demoOnly`. Só remover o lado mock (mantém o provider real — alinhado com a decisão §3.2 do spec).
- **Gate `badges` (Fase C):** ⏳ **ainda aberto** — segue sendo o **único** bloqueador real da Fase C. Opções inalteradas (ocultar widget / provider real / computar client-side). **Decisão do dono pendente.**
- **Amplitude do erro tipado (Fase D):** ⏳ **ainda aberto** — mínimo (1 tela) vs amplo (39 providers). Agora com o dado extra de que 9 providers já usam `.maybeSingle()→null`.

---

## 9. O que NÃO mudou (spec ainda correto)

- A plataforma roda **supabase em produção** (dados + auth); o demo/mock é legado removível. **Opção A (remoção total)** segue sendo a decisão.
- Os **3 switches** existem nos caminhos do spec; `factory.ts`/`authSource.ts` honram o override; `notifications/factory.ts` **ignora** (bug latente real — some na Fase B).
- **6 blocos** `no-restricted-imports`, **3 citam o mock**; exceção `design-system` confirmada.
- **`DataSourceBanner` é separado** do banner de demo — **preservar**.
- **`demoOnly` é código morto** (zero setters) — Fase A não muda por causa dele.
- **IA real e viva** (`supabaseAiProvider`, edge `ai-generate`, tabelas `ai_settings`/`ai_usage_events`) — remover só o lado mock.
- **`useBadges` é o único leak não-sancionado** — sem provider, sem tabela. Gateia a Fase C.
- **`/not found/i` frágil** segue em `useConversationDetail`; `errors.ts` só tem `NotImplementedError`. Fix dobrado na eliminação segue pendente.
- **4 env vars** existem; **WhatsApp/DINTEC mock engines fora de escopo** (não importam `@/mocks`; mantêm `VITE_WHATSAPP_PROVIDER`/`VITE_DINTEC_PROVIDER`).

---

## 10. Próximos passos (inalterados pelo resultado da auditoria)

1. **Dono decide o gate `badges`** (§8) — destrava a Fase C.
2. **Dono decide a amplitude do erro tipado** (§8) — dimensiona a Fase D.
3. Com os dois gates resolvidos: `superpowers:writing-plans` para as Fases A→D, **incorporando a errata (§4) e o adendo de superfícies (§5/§7)**, e usando o scan sem-barra (§6) no gate de CI.
4. Executar por fases, cada uma = 1 PR verde (`bun run build` + `bun run test`).
