# Presença ("online") e "último acesso" dos usuários

Dois sinais distintos aparecem na tela `Configurações → Usuários` (e o primeiro
também no dot de "quem está vendo esta conversa"). Eles vêm de fontes diferentes
e falham de formas diferentes — este documento existe porque **os dois estavam
errados ao mesmo tempo** em 2026-08-05, por motivos independentes.

## 1. "Online" — Realtime Presence (agora)

Fonte: Supabase Realtime Presence, canal `presence:store:<storeId>`.

- `usePresenceTracker()` (montado uma vez no `AppLayout`) anuncia
  `{ sellerId }` enquanto o app está aberto.
- `useStorePresence(storeId)` lê o conjunto de `sellerId` presentes.
- Ambos passam pelo manager compartilhado `src/shared/lib/presenceChannel.ts`
  (ref-counted, um canal por tópico).

**Regra que não pode ser quebrada: o WIRE TOPIC é estado compartilhado.**
O servidor agrupa presença **por tópico**. Só se enxergam clientes que entraram
no **mesmo** tópico. Qualquer sufixo por aba/sessão no tópico isola cada
navegador num canal só dele — e o sintoma é traiçoeiro: **ninguém vê ninguém,
cada usuário vê apenas a si mesmo como online**, sem nenhum erro no console, sem
falha de rede, sem log.

Foi exatamente o que aconteceu entre 2026-07-05 (commit `4831d33d`) e
2026-08-05: o tópico virou `presence:store:<id>:<bootId>:<seq>`. O sufixo tinha
sido copiado de `src/shared/lib/realtime.ts`, onde é **legítimo** — canais de
`postgres_changes` não carregam estado entre clientes, cada cliente recebe seus
próprios eventos. Presença é o oposto: o tópico *é* a chave de agregação.

O problema que o sufixo resolvia continua resolvido, de outra forma: re-adquirir
um tópico cujo canal anterior ainda está em `phx_leave` devolvia, pelo
dedupe-por-tópico do supabase-js, a instância moribunda — cujo `subscribe()`
não faz nada (guarda `isClosed()`), deixando um dot morto. O manager agora
**adia** a recriação até a remoção pendente daquele tópico terminar
(`pendingRemovals`), mantendo o tópico estável. Enquanto não há canal vivo, a
entry responde `presenceState() === {}` e `track()/untrack()` são no-op — por
isso os consumidores usam os métodos da entry e **nunca** `entry.channel`.

Coberto por `src/shared/lib/presenceChannel.test.ts` (o primeiro teste falha se
alguém reintroduzir sufixo no tópico).

## 2. "Último acesso" — atividade de sessão (passado)

Fonte: RPC staff-only `public.seller_access_info()` (SECURITY DEFINER, lê
`auth.*` server-side).

`auth.users.last_sign_in_at` responde "quando essa pessoa digitou a senha pela
última vez" — **não** "quando usou o sistema pela última vez". Sessão
persistente renovada por refresh token não move esse campo. Na prática, quem não
desloga aparece com data de dias atrás enquanto está trabalhando: em 2026-08-05
dois vendedores exibiam "04/08 13:32" e "04/08 14:06" com sessões renovadas às
09:34 e 09:42 daquele mesmo dia.

A RPC passou a devolver também `last_seen_at`:

```sql
greatest(
  u.last_sign_in_at,
  (select max(greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc'))
     from auth.sessions s where s.user_id = u.id)
)
```

- `GREATEST` ignora NULLs → `NULL` só para quem nunca acessou ("Nunca acessou").
- `refreshed_at` é `timestamp without time zone` (UTC pelo GoTrue) — daí o
  `at time zone 'utc'` explícito.
- `last_sign_in_at` continua exposto: o cliente cai nele quando `last_seen_at`
  ainda não existe (banco anterior à migration `20260805140000`).

**Granularidade:** o refresh de token ocorre a cada ~1 h de app aberto, então
`last_seen_at` é "ativo por volta de", não um heartbeat ao minuto. Para "está
online AGORA" a tela usa a presença (item 1), e a linha de status mostra
"Online agora" nesse caso em vez de uma data que pareceria defasada.

Se algum dia for preciso precisão ao minuto mesmo com o Realtime indisponível,
o caminho é um heartbeat próprio (`sellers.last_seen_at` escrito periodicamente
pelo app) — deliberadamente **não** implementado aqui: custa escrita recorrente
por usuário e a aproximação por sessão já resolve o caso de uso.

## Onde NÃO se aplica

`Meu perfil` mostra "Último acesso" a partir de `auth.getUser().last_sign_in_at`
do próprio usuário — ali o valor é a sessão corrente, e o rótulo permanece
correto.
