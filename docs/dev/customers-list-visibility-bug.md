# Bug de visibilidade na tela de Clientes (contas `owner`)

> Issue: [#270](https://github.com/edmilson-prog/gallo-basediesel/issues/270)
> Descoberto: 2026-07-11, durante a validação visual da Fase 2 do import DINTEC (PR #266)
> Status: **não corrigido** — registrado para investigação futura, fora do escopo do import DINTEC

## Contexto em que foi descoberto

Depois de gravar de verdade os 99 clientes do piloto DINTEC (Fase 2, ver
`docs/superpowers/specs/2026-07-10-dintec-customer-import-design.md`), o dono
pediu para conferir visualmente os resultados na tela de Clientes em
produção. A tela mostrou um total muito menor do que o esperado, o que
inicialmente pareceu (e foi tratado como hipótese) um problema na
importação. **Não era.** A importação foi validada de ponta a ponta
diretamente no banco (ver seção "Validação da importação" abaixo) — o bug é
outro, pré-existente, e só ficou visível porque foi a primeira vez que
alguém comparou o contador da tela com o total real da tabela.

## Sintoma

Conta `admin@ailainteligente.com` (Edmilson Souza):
- `sellers.id = 622d1d2c-0223-4133-91cd-0264c1fc29aa`
- `profiles.role = 'owner'`

Abre `/app/clientes` em produção **sem nenhum filtro ativo** e vê **122
clientes**. A tabela `customers` tem **5.336** linhas, todas na mesma
`store_id` (`00000000-0000-0000-0000-000000000001` — ambiente é
single-tenant, não há confusão de loja possível).

Com o filtro "Vendedor: Fernando Mello Muniz Gallo" aplicado, a lista mostra
corretamente **47** — batendo exatamente com os 47 clientes novos criados
pela Fase 2 do import DINTEC. Ou seja: a busca/filtro funciona certo sobre
os dados reais (os dados estão lá, corretos); o problema é especificamente a
visão **sem filtro**, que deveria mostrar a loja inteira (papel `owner` ⇒
`is_staff()` ⇒ RLS libera tudo) mas mostra só uma fração.

## Evidência coletada

Toda a investigação foi feita via `mcp__supabase__execute_sql` com
service-role (bypassa RLS, permite inspecionar o que a sessão real do
usuário não consegue).

**1. `profiles` do usuário está correto:**

```sql
select * from public.profiles where seller_id = '622d1d2c-0223-4133-91cd-0264c1fc29aa';
-- auth_user_id: 9a418578-2671-4141-a15a-d39b2fd13af7
-- seller_id:    622d1d2c-0223-4133-91cd-0264c1fc29aa
-- store_id:     00000000-0000-0000-0000-000000000001
-- role:         owner
```

**2. A função do hook, executada diretamente, produz os claims certos:**

```sql
select public.custom_access_token_hook(
  jsonb_build_object('user_id', '9a418578-2671-4141-a15a-d39b2fd13af7', 'claims', '{}'::jsonb)
);
-- {"claims": {"app_metadata": {"role": "owner", "store_id": "00000000-0000-0000-0000-000000000001", "seller_id": "622d1d2c-0223-4133-91cd-0264c1fc29aa"}}, ...}
```

A lógica SQL do hook (`supabase/migrations/20260608141818_poc_create_profiles_and_auth_hook.sql`,
endurecida em `20260608141912_harden_auth_hook_search_path.sql`) está
correta — quando chamada, ela devolve exatamente o que a RLS precisa para
liberar a loja inteira para um `owner`.

**3. Login genuinamente novo, mesmo assim sem efeito:**

```sql
select last_sign_in_at from auth.users where id = '9a418578-2671-4141-a15a-d39b2fd13af7';
-- 2026-07-11 17:49:54+00
```

O dono fez logout, hard refresh e login novamente — especificamente para
tentar resolver isso — depois da escrita da Fase 2 (17:07 UTC). O problema
persistiu com um token recém-emitido, o que descarta a hipótese de "JWT
antigo em cache".

**4. A RLS de `customers` está consistente com o esperado:**

```sql
-- policy customers_select (SELECT, role authenticated):
-- store_id = current_store_id()
--   AND (is_staff() OR seller_id = current_seller_id() OR seller_handles_customer(id))

-- is_staff(): current_app_role() in ('owner','manager')
-- current_app_role(): auth.jwt() -> 'app_metadata' ->> 'role'
```

Com `role='owner'` correto (item 2), `is_staff()` deveria avaliar `true` e a
policy deveria liberar todas as linhas com a mesma `store_id` — ou seja,
todos os 5.336 clientes.

**5. Não há hook concorrente/duplicado:**

```sql
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname ilike '%access_token%' or p.proname ilike '%auth_hook%';
-- só retorna public.custom_access_token_hook
```

**6. Todos os clientes têm a mesma `store_id`** (descarta hipótese de
multi-loja/escopo errado — ambiente ainda é single-tenant apesar do épico de
multi-loja em andamento):

```sql
select store_id, count(*) from public.customers group by store_id;
-- 1 linha: 00000000-0000-0000-0000-000000000001 | 5336
```

**7. Nem `seller_id` próprio nem `seller_handles_customer` explicam os 122:**

```sql
select count(*) from public.customers where seller_id = '622d1d2c-0223-4133-91cd-0264c1fc29aa';
-- 0
select count(distinct customer_id) from public.conversations
  where assigned_seller_id = '622d1d2c-0223-4133-91cd-0264c1fc29aa' and customer_id is not null;
-- 0
```

Se a sessão estivesse caindo no ramo "não-staff" da policy (por qualquer
motivo), o resultado esperado seria **0** linhas visíveis para este usuário
— não 122. O número 122 não bate com nenhuma das ramificações conhecidas da
policy, o que sugere que a contagem que a tela mostra **não está vindo
puramente da RLS avaliada como documentada** — ou o hook não está
efetivamente no ar para essa sessão.

## Hipótese mais provável (não confirmada)

O código/função Postgres está correto (itens 1–2 acima provam isso), mas o
hook provavelmente **não está configurado como o "Custom Access Token Hook"
ativo** nas configurações de Authentication do projeto Supabase (Dashboard
→ Authentication → Hooks → "Customize Access Token (Custom Claims) Hook"),
ou está apontando para uma função diferente/desabilitado. Essa é uma
configuração de **projeto** (Dashboard ou Management API), não uma migration
— por isso não é visível nem corrigível via SQL, e não foi possível
confirmar ou descartar via as ferramentas MCP disponíveis nesta sessão.

Hipóteses descartadas pela evidência acima: JWT stale/cache (item 3), lógica
da função do hook errada (item 2), múltiplos hooks conflitantes (item 5),
escopo de loja errado (item 6), o usuário caindo no ramo "carteira"/"conversas"
da RLS (item 7 — daria 0, não 122).

## Como reproduzir

1. Logar em produção como um usuário com `profiles.role IN ('owner','manager')`.
2. Abrir `/app/clientes` sem nenhum filtro.
3. Comparar o contador "N clientes" do cabeçalho com `select count(*) from customers` rodado direto no banco (via MCP ou SQL editor do Supabase).

## Próximo passo sugerido

Conferir no Dashboard do Supabase (Authentication → Hooks) se o hook está
habilitado e apontando para `public.custom_access_token_hook`. Se estiver
desligado ou apontando errado, ligar/corrigir e pedir para os usuários
relogarem. Se estiver correto no Dashboard, a investigação precisa ir para
o lado do PostgREST/GoTrue (versão, cache de config) ou para o
frontend (garantir que a sessão realmente descarta o token antigo).

## Validação da importação (para descartar como causa)

A Fase 2 do import DINTEC foi validada diretamente no banco, independente
da tela, e está correta:

| Verificação | Resultado |
|---|---|
| Clientes processados | 99 (100 amostrados − CODCLI=1 excluído) |
| CODCLI=1 presente na base | 0 (confirmado excluído) |
| CODCLIs distintos no lote | 99 (sem duplicata) |
| Telefone dos 52 vinculados vs. valor pré-import | 52/52 idênticos (normalizado) |
| Tipo B2B/B2C x documento (47 novos) | 0 inconsistências |
| `store_id`/`seller_id`/`status` dos 47 novos | 0 divergências |
| 205 veículos: `customer_id` pertence ao lote | 0 órfãos |
| 205 veículos: ano/engine/cadastro_status/brand/model | 0 anomalias |

O filtro "Vendedor: Fernando Mello Muniz Gallo" na própria tela afetada por
este bug mostra corretamente 47 — prova de que os dados estão certos e
acessíveis, só a contagem "sem filtro" está errada.
