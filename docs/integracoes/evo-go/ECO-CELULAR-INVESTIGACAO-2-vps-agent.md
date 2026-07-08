# Investigação (2ª rodada): eco do celular na instância "Vendas" — o controle são muda tudo

> **Para:** o agente com shell no VPS do Evolution GO (whatsmeow).
> **De:** plataforma GALLO. Este NÃO é um pedido de fix — é um pedido de **investigação e relatório**. Nenhuma ação em produção (restart, reconexão, logout, patch, edição de config) na instância **Vendas** sem reportar antes e receber OK explícito.
> **Status:** segunda rodada. Referência: `docs/integracoes/evo-go/ECO-CELULAR-INVESTIGACAO-vps-agent.md` (pedido original) e `docs/integracoes/evo-go/ECO-CELULAR-RELATORIO-vps-agent.md` (relatório da 1ª rodada, lido e revisado do lado GALLO).
> **Pré-requisito de contexto:** mesmo padrão da rodada anterior — valide contra o código-fonte real (`evoapicloud/evolution-go` 0.7.1, idêntico ao público) e os logs/banco do processo, não contra o Swagger.

---

## 1. Recapitulação rápida

### 1.1 Hipótese morta — NÃO repetir, NÃO investigar de novo

A hipótese de que uma linha antiga com `provider_message_id = ''` (string vazia) na tabela `messages` colidia com a checagem de duplicata e descartava silenciosamente todo eco sem `Info.ID` foi **refutada por query direta em produção**: zero linhas com `provider_message_id = ''` existem na tabela inteira, em qualquer conta, agora. Não gaste tempo nela.

### 1.2 O que continua valendo da 1ª rodada

- Servidor limpo: imagem `evoapicloud/evolution-go` 0.7.1, código idêntico à tag pública `evolution-foundation/evolution-go`, sem fork/patch local da AILA.
- `SendMessage` (o evento de webhook) só é emitido pelo caminho de envio via API `/send/*` (`send_service.go`), com `IsFromMe: true` **sintético** montado na mão — nunca é emitido para mensagem genuinamente enviada pelo celular. Mensagem do celular chega como evento genérico `Message` com `Info.IsFromMe: true` **dentro do payload**, no mesmo canal usado para mensagens de clientes.
- Logs vasculhados minuto a minuto entre `2026-07-03T10:00` e `14:00 UTC`, olhando a conta Vendas de forma genérica (sem usar ainda o `instanceId` específico): zero panics/crashes, 100% HTTP 200 nas ~21 entregas de `SendMessage` (irrelevantes — são envios via API), `instance.Events` (inclui `SEND_MESSAGE`) íntegro e nunca zerado, nenhuma anomalia óbvia de sessão/relogin na janela.
- Essas conclusões continuam válidas como **contexto de fundo**, mas **não respondem mais a pergunta certa** — ver §2 e §4.

Nada do lado GALLO explica o gatilho: nenhuma migration nem deploy de edge function coincide com o instante da falha (migration mais próxima 45 min DEPOIS, `2026-07-03T12:45:41 UTC`; deploy da `whatsapp-webhook` mais de 12h DEPOIS, `2026-07-04T00:42:46 UTC`).

---

## 2. O achado novo e decisivo: existe um controle são, no MESMO servidor

A 1ª rodada usou como "instância de controle" a `2c31ae8c`, que estava **inativa desde 2026-06-28** — ou seja, não prova nada sobre o período do incidente. Isso é a **Lacuna 2** conhecida (ver §5.0).

Achamos agora o controle correto: a conta **"Vendas Externa"** está no **mesmo servidor físico** que "Vendas" (mesmo identificador interno de servidor da GALLO — mesmíssimo binário, mesmíssimo deploy do evolution-go) e **nunca parou de ecoar** mensagens do celular, antes, durante e depois da janela do incidente.

| | **Vendas** (com bug) | **Vendas Externa** (controle são) |
|---|---|---|
| `instanceId` | `64127deb-55c2-470c-a633-a6a1a7c70157` | `b74e8121-1f43-4c98-a8ad-d20b4a15c50b` |
| Telefone | `+555599850110` | `+555599755317` |
| Servidor | mesmo servidor físico / mesmo deploy do evolution-go | mesmo servidor físico / mesmo deploy do evolution-go |
| Último eco bem-sucedido | `2026-07-03T12:00:00.727393 UTC` (`provider_message_id = 3EB072E6CD81694973D3BA`) — **e nunca mais** | `2026-07-06T12:40:16 UTC` (hoje) |
| Total de ecos | 0 desde o incidente | 5.289, contínuos, nunca parou |
| Inbound/recibos/conexão | normais, ininterruptos (1.535 inbound entre `2026-07-03T12:00:58` e `2026-07-06T16:48 UTC`) | normais |

Isso **prova que o bug não é de código, deploy ou configuração compartilhada do servidor Go**: o mesmíssimo binário continuou ecoando perfeitamente para uma conta e parou completamente para outra, no mesmo instante em que uma quebrou. A investigação muda de eixo — de "o que há de errado no servidor" para "o que há de diferente no estado da sessão/dispositivo/conta **Vendas** especificamente, comparado à sua irmã sã".

---

## 3. A pergunta central, reformulada

**Comparando especificamente a instância Vendas (`64127deb-55c2-470c-a633-a6a1a7c70157`) com a instância irmã Vendas Externa (`b74e8121-1f43-4c98-a8ad-d20b4a15c50b`), no MESMO servidor, o que é diferente no estado de sessão, dispositivo ou conexão da Vendas especificamente em `2026-07-03T12:00:00.727393 UTC` (ou logo depois) que explica por que só ela parou de gerar ou entregar o evento de eco do celular, enquanto a irmã nunca parou?**

Toda checagem abaixo deve ser feita **em pares** (Vendas vs. Vendas Externa) sempre que possível — a irmã sã é a régua que valida ou invalida cada achado.

---

## 4. Aviso de segurança — leia antes de checar qualquer coisa

**Vendas é uma conta viva em uso, em produção, agora.** Nenhuma ação de restart, reconexão, logout, `Disconnect()`, re-pareamento de QR, edição de linha no banco do evo-go, ou qualquer outra ação com efeito colateral na sessão deve ser tomada sem reportar o achado à GALLO e receber aprovação explícita antes. Todas as checagens abaixo são **read-only** (SQL `SELECT`, grep de log, leitura de código-fonte, dump read-only de pprof se existir). Se alguma checagem exigir uma ação ativa na instância, **pare, documente a necessidade e peça aprovação — não execute.**

---

## 5. Checklist de itens a investigar

### 5.0 Fechar primeiro as 3 lacunas da rodada anterior (baixo custo, alto valor)

Estas não são hipóteses novas — são buracos deixados abertos no relatório anterior que qualquer uma das 3 hipóteses abaixo depende de ter fechado:

1. **Lacuna 1 — `Message`/`IsFromMe=true` nunca verificado no webhook.** A checagem de "100% HTTP 200" da rodada anterior olhou só entregas do tipo `SendMessage` (irrelevantes, são via API). Nunca foi verificado se, especificamente, algum evento do tipo `Message` com `Info.IsFromMe=true` da conta Vendas foi de fato **tentado** entregar (e com que status HTTP) ao webhook da GALLO depois de `2026-07-03T12:00:00.727393 UTC`. Consultar a tabela/log de tentativas de entrega de webhook do evolution-go filtrando por `instanceId=64127deb-55c2-470c-a633-a6a1a7c70157`, evento genérico `Message` (não `SendMessage`) e `fromMe`/`IsFromMe=true`, para todo o período desde o incidente até hoje. Esperado sob a maioria das hipóteses: **zero linhas** (nem tentativa, nem erro) — o que localiza a quebra como anterior à camada de webhook, não como falha de entrega.
2. **Lacuna 2 — controle errado usado antes.** `2c31ae8c` estava inativa desde `2026-06-28` e não prova nada sobre a janela do incidente. Já resolvida por este documento (§2) — a partir de agora, todo controle deve usar **Vendas Externa** (`b74e8121-1f43-4c98-a8ad-d20b4a15c50b`), que estava ativa e saudável durante todo o período.
3. **Lacuna 3 — descartes de "protocolo desconhecido" nunca cruzados com o `instanceId` certo nem comparados com o controle.** As 87 ocorrências de mensagens do próprio número (`From: 555599850110`) descartadas como `"unknown protocol message"` foram descritas como ruído pré-existente, mas nunca se checou (a) se a **frequência/proporção** desses descartes mudou depois de `2026-07-03T12:00:00 UTC`, nem (b) se o mesmo padrão existe em Vendas Externa. Contar por dia essas ocorrências para `555599850110` nos 7 dias antes e nos dias depois do incidente, e o equivalente para `555599755317` em toda a janela ativa dela. Isso é um **diferenciador-chave** entre as hipóteses de §5.2/§5.3 (nada de novo chega → taxa não muda) e uma dessincronia de ratchet Signal (pacotes chegando e falhando ao decifrar → taxa dispara).

### 5.1 [Prioridade 1] Config-por-instância — flag de "ignorar mensagens próprias" zerada só em Vendas

Checagem mais rápida e mais decisiva: se existir, é um diff de uma linha de banco, sem precisar mexer em nada ao vivo.

1. Descobrir o esquema exato (evitar achismo):
   ```sql
   SELECT table_name, column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name ILIKE ANY (ARRAY['%own%','%self%','%ignore%','%reject%','%sync%']);
   ```
2. Diff campo a campo das duas linhas na tabela de instâncias/settings encontrada acima:
   ```sql
   SELECT * FROM instances
   WHERE id IN ('64127deb-55c2-470c-a633-a6a1a7c70157','b74e8121-1f43-4c98-a8ad-d20b4a15c50b');
   ```
   Atenção redobrada a qualquer booleano ou coluna de config que divirja entre as duas linhas.
3. Se a config vier num JSONB (`settings`/`options`/`config`):
   ```sql
   SELECT id, jsonb_pretty(settings) FROM instances
   WHERE id IN ('64127deb-55c2-470c-a633-a6a1a7c70157','b74e8121-1f43-4c98-a8ad-d20b4a15c50b');
   ```
   Procurar chave tipo `ignoreOwnMessages`/`syncOwnMessages`/`rejectSelfMessage` presente e/ou divergente (inclusive o caso de existir numa linha e faltar na outra).
4. Correlacionar timing — a linha de Vendas recebeu uma escrita perto de `2026-07-03T12:00:00 UTC` que a de Vendas Externa não recebeu?
   ```sql
   SELECT id, updated_at FROM instances
   WHERE id IN ('64127deb-55c2-470c-a633-a6a1a7c70157','b74e8121-1f43-4c98-a8ad-d20b4a15c50b');
   ```
   Se existir log de acesso/API própria do evo-go (não confundir com o webhook da GALLO), grep por PUT/PATCH/POST a endpoint de settings escopado a `64127deb-55c2-470c-a633-a6a1a7c70157` na janela `2026-07-03 11:30`–`12:30 UTC`.
5. Confirmar no código-fonte (já acessível, tag `0.7.1`) se esse gate existe de fato e qual o nome exato do campo, para não errar mira nos passos 2–3:
   ```
   grep -rn 'IsFromMe' --include='*.go' <repo> | grep -iE 'ignore|skip|own|self|sync'
   ```
   Se essa busca não retornar nada, a hipótese cai — passar para §5.2.

### 5.2 [Prioridade 2] Device-list desync — celular parou de incluir o companion "Vendas" no fan-out de auto-eco

No WhatsApp multi-device, é o **celular** (não o servidor) quem decide, a partir de uma lista local de dispositivos vinculados daquela conta, para quais companions cifrar uma cópia extra de cada mensagem que ele mesmo envia (sessão pairwise Signal celular↔companion). Se em `2026-07-03T12:00:00Z` a conta `+555599850110` sofreu qualquer evento de mudança de device-list (relink, novo slot vinculado, sessão redefinida) e o companion Vendas não foi corretamente re-incluído nessa lista, o celular passa a cifrar suas próprias mensagens **sem** incluir mais o companion Vendas — sem erro, sem decrypt failure, simplesmente nada chega. Isso explicaria um corte limpo, total e permanente, 100% silencioso, isolado à conta (a Vendas Externa é outro número, outra lista de dispositivos, imune a um evento na conta de Vendas).

1. Enumerar todos os device-id conhecidos hoje para cada conta e comparar:
   ```sql
   SELECT our_jid, their_id FROM whatsmeow_sessions
   WHERE their_id LIKE '555599850110.%' OR their_id LIKE '555599755317.%'
   ORDER BY 1;
   ```
   Um device-id novo/inesperado para `555599850110` é evidência direta de relink por volta do incidente.
2. Hash/tamanho da sessão pairwise "self" (device 0) de cada conta:
   ```sql
   SELECT our_jid, their_id, length(session), encode(digest(session,'sha256'),'hex')
   FROM whatsmeow_sessions
   WHERE their_id IN ('555599850110.0','555599755317.0');
   ```
   Se existir qualquer backup/snapshot periódico do banco, repetir num snapshot de antes e de depois de `2026-07-03T12:00`: esperado que o hash de Vendas congele exatamente a partir do incidente, e o de Vendas Externa continue mudando.
3. Grep dos logs do container, filtrando pelo `instanceId` e pelo número, na janela `2026-07-03T11:55Z`–`12:10Z`, por qualquer linha de processamento de device-list/notificação de conta (`device`, `notification`, `key-index`, `identity`, `session`, `logged`); repetir o mesmo grep para `555599755317`/`b74e8121` desde sempre, para confirmar que o pipeline de log de fato captura esse tipo de evento quando ele ocorre (senão a ausência em Vendas não significa nada).
4. Fecha diretamente a **Lacuna 1** (já descrita em §5.0.1) — repetir aqui com foco neste ângulo: zero tentativas de webhook para `Message`/`IsFromMe=true` de Vendas desde o incidente corrobora "nada chega" (exclusão de fan-out), não uma falha de entrega.
5. Fecha diretamente a **Lacuna 3** (já descrita em §5.0.3) — se a taxa de descarte de "protocolo desconhecido" do próprio número permanecer no mesmo nível de ruído de fundo (sem salto no corte), corrobora esta hipótese; se saltar exatamente em `2026-07-03T12:00` e acompanhar o volume esperado de mensagens do vendedor, a causa passa a ser dessincronia de ratchet Signal (ver §5.3), não exclusão de fan-out.

### 5.3 [Prioridade 3] Drift de identidade própria (LID↔PN) — stanza de auto-sync passou a chegar endereçado por LID e o mapa em memória da sessão Vendas não foi atualizado

O whatsmeow mantém, por sessão, um mapeamento LID⇄PN usado para reconhecer se um stanza recebido é uma cópia de auto-sincronização do próprio celular. O WhatsApp vem migrando gradualmente, **por conta** (rollout do lado servidor, não atrelado ao deploy/binário), o endereçamento desses stanzas de PN para LID. Se isso foi ativado para a conta Vendas em `~2026-07-03T12:00:00 UTC` e o mapa em memória da sessão Vendas nunca foi atualizado (só atualiza em pareamento/reconexão completa, que não ocorreu), o evento seria decodificado normalmente (zero panics) mas nunca classificado como próprio — silencioso e permanente. É mais especulativa que §5.1/§5.2 porque depende de um comportamento do lado servidor do WhatsApp que não é observável diretamente no VPS; checar por último.

1. Comparar a forma bruta do remetente (`Info.Sender`/atributo `from`) do último eco bem-sucedido (`2026-07-03T12:00:00.727393Z`, `3EB072E6CD81694973D3BA`) contra qualquer evento de `555599850110` logo após o corte, verificando especificamente se passou de sufixo `@s.whatsapp.net` para `@lid`; incluir nessa varredura as 87 ocorrências de "protocolo desconhecido" (Lacuna 3) — alguma exibe `@lid`?
2. Rodar a mesma varredura de forma/frequência para Vendas Externa na mesma janela — confirmar que os stanzas dela permaneceram em `@s.whatsapp.net` (ou já eram `@lid` sem descontinuidade), provando que a assimetria é por conta no lado WhatsApp e não do binário/deploy compartilhado.
3. Consultar (somente leitura) a tabela de mapeamento LID do whatsmeow (ex.: `whatsmeow_lid_map` ou equivalente) filtrando pelo JID próprio de cada instância — comparar `created_at`/`updated_at` de Vendas vs. Vendas Externa; linha ausente ou desatualizada desde antes do incidente especificamente em Vendas corrobora a hipótese.
4. Ler no código-fonte (já auditado na rodada anterior) como é derivada a decisão de "isto é eco do próprio celular": se confia direto em `evt.Info.IsFromMe` (calculado internamente pelo whatsmeow a partir do Store+mapa LID) ou se o wrapper recalcula por conta própria comparando contra um JID/telefone cacheado localmente — isso localiza se a quebra está no cálculo interno do whatsmeow ou numa checagem redundante do wrapper.
5. Se existir endpoint de pprof/saúde interna (`/debug/pprof/goroutine?debug=2`), comparar entre as duas instâncias o número de goroutines/handlers de evento registrados (esperado 1:1 idêntico) — procurando goroutine parada/bloqueada ligada ao caminho de auto-mensagem só em Vendas. Isto é uma checagem de descarte (não deve haver diferença) e não exige nenhum reinício ou reconexão.

---

## 6. O que trazer no relatório

1. Resultado das 3 lacunas fechadas (§5.0) — mesmo que a conclusão seja "sem anomalia" em alguma delas, reporte explicitamente com os números encontrados.
2. Para cada hipótese (§5.1 → §5.2 → §5.3), na ordem de prioridade: o que foi encontrado, com evidência bruta (linha de banco, trecho de log, trecho de código) — não apenas a conclusão.
3. Diff explícito, coluna a coluna e/ou campo a campo, entre a linha/estado de Vendas e a linha/estado de Vendas Externa em cada checagem — o objetivo do documento é achar a **diferença**, então toda resposta deve vir em par.
4. Se alguma hipótese for confirmada com evidência direta (não suposição): diga qual é, com a evidência que a prova, e o que a descarta nas outras duas.
5. Se nenhuma for confirmada com certeza: diga isso explicitamente, liste o que foi descartado e o que ficou parcialmente aberto, e proponha o próximo passo mais barato e menos arriscado (sem executá-lo).
6. Recomendação de correção **só depois** do diagnóstico — nenhuma ação em produção na instância Vendas sem confirmar com a GALLO antes.

Qualquer dúvida de contexto (payloads exemplo, timestamps adicionais, acesso a snapshots do banco), pergunte antes de assumir.
