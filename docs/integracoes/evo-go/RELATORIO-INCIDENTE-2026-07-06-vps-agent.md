# Relatório — incidente "ZERO instâncias conectadas" (2026-07-06) no Evolution GO

> **De:** agente com shell no VPS do Evolution GO. **Para:** plataforma GALLO BASE DIESEL.
> **Data:** 2026-07-06. **Referência:** `docs/INCIDENTE-2026-07-06-conexao-total-vps-agent.md` (pedido original).
> **Veredito:** causa raiz identificada e corrigida — **esgotamento do pool de conexões do
> Postgres**, causado por um vazamento de conexões no próprio evolution-go durante tentativas
> repetidas de pareamento. Ação executada: restart do container (pré-autorizado por vocês,
> confirmado também pelo dono do servidor) + reconexão explícita das 3 instâncias. **Vendas
> Externa e Teste voltaram 100% (sessão intacta, sem perda de dados). Vendas voltou ao ar mas
> precisa de novo QR**, pois o celular dela foi desvinculado manualmente hoje.

## TL;DR

Entre **20:10 e 20:34 UTC**, ~6 tentativas de pareamento nas instâncias Vendas e Teste (celulares
desvinculados manualmente hoje) dispararam um **vazamento de conexões Postgres** no evolution-go:
cada tentativa de criar/recriar o client whatsmeow (`Starting new client instance`) abre uma nova
conexão com o banco, e essa conexão **nunca é fechada**, mesmo quando a tentativa falha. Por volta
das **20:34 UTC** o pool do Postgres (`max_connections=100`) esgotou. A partir desse instante,
**qualquer** tentativa de criar um client em qualquer instância — inclusive um simples reconnect
de rotina — passou a falhar imediatamente com `pq: sorry, too many clients already`.

Foi exatamente isso que derrubou a **Vendas Externa** às **21:34:00 UTC**: ela recebeu um evento
`Disconnected` comum (o mesmo tipo que ela já teve antes, sempre se recuperando sozinha), mas dessa
vez a rotina de auto-reconexão (`Disconnected detected, restarting instance`) esbarrou no pool
esgotado e nunca mais voltou. Não foi um problema específico da conta, foi dano colateral do
vazamento. Confirmamos isso **em tempo real**: ao investigar, encontramos o Postgres com **100/100
conexões, todas `idle`, todas do processo evolution-go, sem nenhuma atividade** — o banco estava
saudável (CPU 0%, sem lock), só não tinha mais slots livres. O vazamento estava ativo havia mais de
2 horas sem sinal de auto-recuperação.

**Ação corretiva (Docker-layer apenas, sem tocar em código-fonte):** `docker restart evolution-go`
— mata o processo e fecha as 100 conexões vazadas de uma vez, sem mexer no Postgres nem em volumes/
dados. Em seguida, como o boot do CONNECT_ON_STARTUP só reconecta instâncias marcadas
`connected=true` no banco (e as 3 estavam `false` desde o incidente — `"Found 0 connected
instances"` no log de boot), disparamos manualmente `POST /instance/connect` nas 3, com aprovação
explícita do dono do servidor antes de qualquer ação.

**Resultado:** Vendas Externa (`Connected:true, LoggedIn:true`) e Teste (`Connected:true,
LoggedIn:true`) recuperadas integralmente. Vendas voltou com o socket ativo mas `LoggedIn:false` —
esperado, pois o celular foi desvinculado manualmente antes do incidente; precisa de novo QR.

## 1. Causa raiz

**Vazamento de conexão Postgres no evolution-go, disparado por tentativas repetidas de
criação/recriação do client whatsmeow.** Evidência (`instance.log` das 3 instâncias, timezone
America/Sao_Paulo = UTC-3):

- Primeira ocorrência do erro fatal, instância Vendas: `17:34:44.716 -03:00` (=20:34:44 UTC) —
  `"Failed to create container: failed to upgrade database: failed to check if version table is
  up to date: pq: sorry, too many clients already"`.
- Mesma instância, mesmo padrão repetido dezenas de vezes até o momento da nossa intervenção
  (>2h depois): cada ciclo de reconexão gera 2 tentativas de `Starting new client instance` em
  poucos segundos, cada uma abrindo uma conexão nova e falhando, sem nunca fechar a anterior.
- Confirmado ao vivo no Postgres, no momento da investigação (22:39–22:41 UTC, **mais de 2h depois
  do início**): `pg_stat_activity`/processos do SO mostravam exatamente **100 conexões, estado
  `idle`, 100% originadas do container evolution-go** — nenhuma delas em uso real, apenas
  penduradas. `max_connections` do Postgres = 100 (configuração padrão, nunca precisou ser maior
  até hoje). CPU do Postgres em 0%, sem locks — o banco em si nunca teve problema de performance,
  só ficou sem slots livres.
- Instância Teste: primeiro erro fatal `17:47:05 -03:00` (20:47 UTC) — 13 minutos **depois** da
  Vendas já ter esgotado o pool sozinha; ou seja, a partir desse ponto qualquer instância que
  tentasse (re)conectar já encontrava o pool cheio, independente do que estivesse fazendo.
- Instância Vendas Externa: um único erro fatal, `18:34:02.515 -03:00` (21:34:02 UTC) — **1
  segundo** depois do evento `Disconnected` de rotina (`18:34:00.509`, log:
  `"Disconnected detected, restarting instance"` → `"Starting reconnection process - simulating
  restart"` → `"Starting fresh instance"` → falha imediata por pool esgotado). Ela nunca mais
  tentou de novo sozinha (sem retry automático depois dessa falha específica), diferente de
  Vendas/Teste que ficaram em loop retry.

O upgrade `0.7.1 → 0.7.2` (13:31–13:33 UTC, reportado por vocês como suspeito) teve, sim, um
problema próprio — a mesma corrida de migração de schema `v13→v14` já documentada em investigação
anterior nossa (`pq: duplicate key value violates unique constraint "pg_type_typname_nsp_index"`),
resolvida com um restart pontual às 13:33:40 UTC. Isso **não é a causa** do colapso total: são dois
problemas distintos, separados por ~7 horas, e o segundo (vazamento de conexão) é que efetivamente
derrubou o servidor.

## 2. Os dois instantes-chave pedidos

### 13:31–13:49 UTC (janela do upgrade)

- `13:31:22.771 -03:00` (10:31:22 local): erro de migração de schema `v13→v14` na Vendas — mesmo
  padrão de corrida já visto no upgrade anterior, não relacionado ao vazamento de conexão.
- `13:33:37–13:33:42` local: `"MyClient not found in runtime"` seguido de `OfflineSyncPreview` —
  consistente com o restart do container às 13:33:40 UTC que resolveu a corrida de migração; Vendas
  reconectou normalmente logo em seguida. Não encontramos, nessa janela específica, nenhum sinal do
  vazamento de conexão (isso só começou ~7h depois, às 20:34 UTC).
- Sobre o `/instance/qr` retornando 200 sem `Qrcode` ou 400 em ~5s reportado por vocês entre 13:33 e
  20:37: não temos uma explicação definitiva isolada desse sintoma específico nessa janela — pode
  já ser reflexo de conexões pontuais sendo consumidas mais lentamente por causa da migração de
  schema recém-concluída, mas não achamos evidência de esgotamento de pool tão cedo. Fica como
  ponto em aberto, de impacto menor frente à causa raiz confirmada depois.

### 20:10–20:38 UTC (tentativas de pareamento → vazamento → colapso)

- `20:10:34–20:36:35 UTC`: sequência de eventos `LoggedOut` na Vendas a cada 1-2 min, intercalada
  com um único `PairSuccess` (`20:13:21 UTC`) e um `StreamReplaced` (`20:20:11 UTC`) — consistente
  com as ~6 tentativas de pareamento que vocês relataram, cada uma criando um client novo (e uma
  conexão nova) no whatsmeow.
- `20:34:44 UTC`: primeiro `"too many clients already"` — pool oficialmente esgotado.
- `21:34:00–21:34:02 UTC`: Vendas Externa cai (ver seção 1) — o instante exato que vocês
  identificaram como "última resposta saudável 21:14:39 UTC" bate, com a margem do intervalo de
  polling de vocês, com esse colapso real 20 minutos depois.

## 3. Respostas às perguntas centrais (§2 do documento original)

1. **Por que nenhum client conseguia estabelecer/manter o socket?** Porque nenhum client
   conseguia sequer abrir uma conexão com o Postgres para inicializar — não é problema de
   WhatsApp/rede, é o pool de conexões do banco interno esgotado por vazamento.
2. **O 0.7.2 é o culpado?** Indiretamente: a versão em si não mudou o comportamento de
   `/instance/qr` que identificamos, mas o vazamento de conexão em si é uma característica do
   código (não verificamos se está presente também na 0.7.1, mas o padrão de retry agressivo em
   loop de pareamento é o gatilho, independente da versão exata).
3. **WhatsApp bloqueando o IP?** Descartado — o sintoma tem uma explicação totalmente mecânica e
   local (banco), sem qualquer marca de bloqueio/banimento nos logs (nenhum `banned`, `403`, `405`
   de protocolo do WhatsApp em nenhuma das 3 instâncias).
4. **401 intermitente no `/instance/status`?** Consistente com o mesmo esgotamento: o middleware de
   auth também depende de uma conexão de banco por requisição; com o pool cheio, uma fração das
   chamadas simplesmente não conseguia abrir conexão e retornava erro — mas isso é inferência, não
   confirmamos linha a linha cada um dos 4 horários que vocês listaram.

## 4. Ações executadas (com aprovação explícita antes de cada uma)

1. Investigação 100% read-only primeiro: logs das 3 instâncias, `pg_stat_activity`/processos do
   Postgres, contagem de conexões por estado — nenhuma ação de escrita até a causa raiz estar clara.
2. `docker restart evolution-go` (container da aplicação apenas; Postgres nunca foi reiniciado,
   nenhum volume/dado tocado) — aprovado explicitamente antes de executar.
3. Confirmado: conexões Postgres caíram de 100 para ~6-12 imediatamente após o restart.
4. `POST /instance/connect` disparado manualmente nas 3 instâncias (aprovado explicitamente) — o
   boot automático (`CONNECT_ON_STARTUP`) não reconecta sozinho instâncias que estavam marcadas
   `connected=false` no banco (log de boot: `"Found 0 connected instances"`), então esse passo foi
   necessário.

## 5. Estado atual (verificado após as ações acima)

| Instância | Connected | LoggedIn | Observação |
|---|---|---|---|
| Vendas Externa (`b74e8121`) | ✅ true | ✅ true | Recuperada 100%, sessão intacta, zero perda de dados |
| Teste (`2c31ae8c`) | ✅ true | ✅ true | Recuperada 100% |
| Vendas (`64127deb`) | ✅ true | ❌ false | Socket ativo, mas sem sessão pareada — **precisa de novo QR**, pois o celular foi desvinculado manualmente antes do incidente (comportamento esperado, não é sequela do vazamento) |

Postgres estável desde a correção, sem sinal de reincidência do vazamento no período observado
pós-restart.

## 6. Recomendações

- **A.** Gerar novo QR para a instância Vendas quando conveniente para vocês — a sessão anterior
  dela já não existia mais desde antes do incidente (desvinculação manual), então isso é
  independente do problema corrigido aqui.
- **B.** Ficar atento a uma possível recorrência: se uma instância entrar em loop de
  reconexão/pareamento com falhas repetidas, o mesmo vazamento pode se repetir e esgotar o pool de
  novo em ~20-30 min de tentativas malsucedidas. Não há mitigação permanente aplicada do lado do
  servidor além do restart — não alteramos o código-fonte do evolution-go (fora do escopo que
  podemos tocar sem autorização explícita da aplicação em si, não do Docker).
- **C.** *(fica à disposição, não executamos)* Se quiserem uma margem de segurança adicional
  enquanto uma correção definitiva do vazamento não existe upstream, é possível aumentar
  `max_connections` do Postgres via `docker-compose.yml`/`.env` (mudança de configuração, não de
  código) — isso não resolve o vazamento, só posterga o esgotamento. Não fizemos essa mudança
  agora por não ter sido solicitada; avisem se quiserem que apliquemos.
- **D.** Item do relatório anterior (`ECO-CELULAR-RELATORIO-2-vps-agent.md`) continua em aberto e
  não tem relação com este incidente: pedir ao dono do celular da Vendas um print de "Dispositivos
  conectados" para investigar a assimetria de slots de dispositivo encontrada naquela investigação.
