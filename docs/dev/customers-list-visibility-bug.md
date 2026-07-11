# Tela de Clientes mostra 122 de 5.337 — investigação e causa raiz

> Issue: [#270](https://github.com/edmilson-prog/gallo-basediesel/issues/270)
> Descoberto: 2026-07-11, durante a validação visual da Fase 2 do import DINTEC (PR #266)
> Status: **causa raiz confirmada** (2026-07-11, investigação profunda multi-agente) —
> não é bug de RLS/JWT/Auth Hook; é a soma de dois estados de dados pré-existentes.
> ⚠️ A primeira versão deste documento levantava a hipótese de o Custom Access Token
> Hook não estar configurado no Dashboard. **Essa hipótese foi REFUTADA** — mantida
> aqui apenas como histórico (seção "Hipótese descartada").

## Resumo executivo

A conta `owner` (`admin@ailainteligente.com`) abre `/app/clientes` sem filtros e vê
**122 clientes** de um total de **5.337** na tabela. Isso **não é falha de
permissão**: a RLS libera as 5.337 linhas para o owner (verificado empiricamente).
O 122 é o resultado exato — reproduzido linha a linha — de um **filtro de aplicação
por design**: a tela esconde incondicionalmente customers com as tags
`pending_review` / `reviewed_not_customer` (contatos importados do WhatsApp
aguardando revisão, PRs #191/#197).

Composição exata dos 122 visíveis:

| Grupo | Qtde | O que é |
|---|---|---|
| Novos do import DINTEC (Fase 2) | 47 | corretos, vendedor Fernando |
| **Seed/fake da Fase 1 nunca limpos** | **70** | faker, `created_at` retrodatado 2023→2026, 4 sellers de mock, tags de vocabulário mock (VIP, Inadimplente, Oficina parceira, Volvo, Scania…) |
| Orgânicos/manuais pós-go-live | 5 | reais |

E o que está **escondido** (5.215 linhas): 5.211 contatos com `pending_review` +
4 com `reviewed_not_customer` — incluindo **todos os 52 clientes vinculados pelo
import DINTEC**, que são clientes reais confirmados no ERP mas seguem tratados como
"contato pendente de revisão".

## Como a investigação foi conduzida

Workflow multi-agente (2026-07-11): 4 lentes independentes em paralelo
(frontend/query-path, censo SQL de produção, simulação empírica de RLS,
docs/histórico do repo), seguidas de uma fase adversarial (reprodução exata do
contador + 2 céticos tentando refutar as conclusões). ~108 checagens, tudo
somente-leitura (simulações em `begin/rollback`).

## Evidência 1 — o Auth Hook funciona (hipótese A refutada)

Simulação da RLS em produção com `set_config('request.jwt.claims', ...,
true)` transaction-local, avaliando o predicado da policy `customers_select`
manualmente:

| Cenário | `is_staff()` | `current_store_id()` | Linhas liberadas |
|---|---|---|---|
| Claims de owner (o que o hook gera) | `true` | store correta | **5.337** |
| Claims vazios (= hook morto) | `false` | `NULL` | **0** |

O argumento decisivo: **se o hook estivesse quebrado, a tela mostraria 0 linhas,
não 122** — a policy exige `store_id = current_store_id()`, que vem `NULL` sem os
claims. Ver 122 linhas *prova* que os claims estão fluindo.

Reforços:

- `supabase/migrations/20260609114034_rls_helpers_drop_profiles_fallback.sql`
  (PRD-108) tornou `current_app_role()`/`current_store_id()`/`current_seller_id()`
  **JWT-only e fail-closed** em 2026-06-09. Sem hook ativo, a plataforma inteira
  teria mostrado 0 linhas para todos os usuários no go-live (2026-06-10). Ela opera
  normalmente há um mês.
- `docs/infra/supabase-setup.md` e `docs/prds/PRD-107-auth-custom-claims_DONE.md`
  registram o hook habilitado no Dashboard; `docs/db/rls-policies-fase2-mvp.md`
  registra validação real de leitura staff via claims no cutover.
- Cético adversarial dedicado não achou nenhum caminho alternativo que produzisse
  122 com JWT sem claims: sem RPC `SECURITY DEFINER` listando customers, sem view
  exposta, sem policy pra `anon`, sem claims persistidos em
  `auth.users.raw_app_meta_data`, RLS habilitada na tabela. JWT "morto" simulado →
  0; `anon` → 0; nenhum vendedor da plataforma tem conjunto visível = 122 (máx 47).

## Evidência 2 — o 122 reproduzido exatamente

A tela de Clientes aplica **incondicionalmente** (`HIDDEN_CUSTOMER_TAGS` em
`src/features/customers/utils/listFilters.ts:28`, via `toListParams` linha 94):

```
excludeTags = ["pending_review", "reviewed_not_customer"]
```

que o provider supabase converte em filtro server-side
(`src/providers/data/impl/supabase/customers.ts:290-291`):

```ts
query = query.not("tags", "ov", `{pending_review,reviewed_not_customer}`);
```

O contador do header é o `count: "exact"` **dessa mesma query** — ou seja, o 122 já
é pós-RLS e pós-excludeTags, não um total geral.

Reprodução em produção (claims owner simulados + predicado da policy + o filtro de
tags): **count = 122 exato**. Excluindo só `pending_review` daria 126; as duas tags
juntas fecham o número da tela. Distribuição real das tags:
`pending_review` = 5.211 linhas, `reviewed_not_customer` = 4, sem tags = 65,
restante = tags comerciais/marca em poucas linhas.

Esse comportamento existe desde os PRs #191 (2026-06-28, esconde `pending_review`)
e #197 (2026-06-29, adiciona `reviewed_not_customer`) — contatos importados do
WhatsApp entram como `pending_review` (`src/providers/whatsapp/import/contacts-core.ts`)
e são revisados na tela própria **`/app/atendimento/contatos-pendentes`**, que
filtra por *include* dessas mesmas tags.

## Evidência 3 — os "sumidos" são os 52 vinculados do DINTEC

Todos os **52 customers vinculados** pelo import DINTEC (lote
`dintec_synced_at='2026-07-11T17:07:40.676Z'`, `created_at` anterior ao lote) têm
`tags = {pending_review}` — 52/52, uma única combinação. Eles nasceram do import de
contatos do WhatsApp (2026-06) e nunca passaram pela revisão manual. Por isso:

- Não aparecem na tela de Clientes (nem por busca — o filtro é server-side).
- Aparecem em **Contatos pendentes**.
- Os 5 exemplos citados ao dono durante a validação (CODCLIs 2165, 527, 1321, 991,
  1230 — Edson, Tecnopower, Bellenzier Pneus, Andrimar, Pawimac) estão todos nesse
  grupo, com conversas reais na Inbox.

Estavam invisíveis na tela de Clientes **desde antes do import** — o import apenas
tornou o estado perceptível (o dono foi procurá-los pela primeira vez).

## Evidência 4 — o import DINTEC não causou nem agravou nada

Cético adversarial dedicado, resultados:

- O UPDATE dos 52 vinculados escreve apenas as 13 colunas `dintec_*` +
  preenchimento condicional de campos vazios (`applyIfEmpty` nunca sobrescreve).
  **Não escreve** `tags`, `status`, `seller_id`, `store_id`, `phone`, `created_at`.
- `public.customers` tem **zero triggers** não-internos — nenhum efeito colateral
  possível.
- Contador hipotético pré-import: 122 − 47 = **75** (todos os 75 não-DINTEC do
  conjunto visível têm `created_at` anterior a 2026-07-11). O import só
  **adicionou** 47 visíveis; não escondeu ninguém.
- Ressalva de rigor: `customers` não tem `updated_at` nem histórico por linha, então
  não há prova pós-hoc direta de que `tags` não foi tocada — a conclusão vem de 3
  linhas independentes convergentes (código provadamente não escreve tags; zero
  triggers; os 52 têm `tags={pending_review}` uniforme, idêntico à convenção do
  import WhatsApp pré-existente).

## Hipótese descartada (histórico)

A primeira versão deste doc (e da issue #270) levantava: *"o
`custom_access_token_hook` não está configurado como hook ativo no Dashboard"*. O
raciocínio nasceu de um beco: o cadastro estava certo, a função retornava claims
certos, relogin não mudava nada — sobrou "config de Dashboard". O furo (apontado já
na época no item 7 do próprio doc, mas não levado à conclusão): **sem claims o
usuário veria 0 linhas, não 122**. A simulação empírica fechou a questão.

## Follow-ups (substituem a "correção do hook", que não existe)

1. **Decisão de produto — promover contatos com vínculo DINTEC:** os 563 matches
   DINTEC↔telefone identificam clientes reais confirmados no ERP (com histórico de
   compra). O vínculo deveria remover `pending_review` (equivalente a "revisado e
   confirmado como cliente")? Hoje 52 clientes reais ficam fora da tela de Clientes
   e da carteira. Decisão do dono; se aprovada, a Fase 3 do import pode fazer essa
   promoção para todos os 563.
2. **Limpeza dos 70 seed/fake:** plano de limpeza em cascata desenhado em
   2026-07-10 e nunca executado. Eles são a **maioria** (70 de 122) do que a tela
   de Clientes mostra hoje — nomes faker como "XAVIER-ALBUQUERQUE MINERADORA",
   vendedores de mock, tags de mock. Executar a limpeza deixa a tela materialmente
   correta.
3. **(Menor) UX do contador:** a tela mostra "122 clientes" sem indicar que 5.215
   contatos estão ocultos por revisão pendente — um sufixo tipo "(+N aguardando
   revisão)" com link para Contatos pendentes evitaria exatamente a confusão que
   originou esta investigação.
