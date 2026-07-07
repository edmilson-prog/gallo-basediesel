# Relatório (2ª rodada) — eco do celular parou só na instância "Vendas"

> **De:** agente com shell no VPS do Evolution GO. **Para:** plataforma GALLO.
> **Referência:** `docs/ECO-CELULAR-INVESTIGACAO-2-vps-agent.md` (§6 define a estrutura abaixo).
> Investigação 100% read-only. Nenhuma ação em produção na instância Vendas foi executada.

---

## 1. As 3 lacunas da rodada 1 — resultado com números

**5.0.1 — webhook `Message`/`IsFromMe=true` desde o incidente.** Fechada, com correção de método: o `"From: %s"` logado (`whatsmeow.go:1047/1596`) é `evt.Info.Chat`, não o remetente — `From: 555599850110` é o **canal de auto-sync no próprio JID**, não eco de cliente. As 133 ocorrências (87 rotacionado 07-02→07-03T19:20 + 46 ao vivo 07-03T21:07→07-06T13:11, sem exceção) são descartadas em `Message ignored because it's a unknown protocol message` **antes** de `DISPATCHING WEBHOOK`. Limitação: `IsFromMe` nunca é impresso em log algum (única leitura real, `whatsmeow.go:1122`, só para auto-read) — um eco genuíno logaria **idêntico** a inbound normal, então a pergunta literal não é respondível só por grep. Mas o pipe de entrega provou-se íntegro (200 OK contínuo em tráfego comum, 07-03→07-06).

**5.0.2 — controle correto.** Vendas Externa (`b74e8121`) substitui `2c31ae8c` (inativa desde 06-28). Achado novo: o `instance.log` de Vendas Externa **foi resetado/truncado** — começa em `2026-07-06T09:37:38-03:00`, sem `.gz` de backup (só existe um `.gz` no volume, e é da Vendas). Isso **elimina o baseline histórico** (06-27→07-06) do controle antes do incidente; causa não investigada (anterior ao upgrade do container, 07-06T13:31-13:33 UTC).

**5.0.3 — taxa de descarte "protocolo desconhecido" por dia (self-JID exato, `@s.whatsapp.net`):**

| Data | Vendas (64127deb) | Vendas Externa (b74e8121) |
|---|---:|---:|
| 06-26–07-01 | sem histórico | sem histórico |
| 07-02 (desde 10:35) | 68 (56 num único burst de 25min) | — |
| 07-03 (incidente) | 23 (1 pré-09h local / 22 pós) | — |
| 07-04 | 11 | — |
| 07-05 | 9 | — |
| 07-06 (parcial) | 22 | 12 (parcial, ~5h) |

Sem salto limpo no corte; 07-04/07-05 caem para 9-11, abaixo de 07-02/07-03. O controle são (12/~5h) tem a **mesma ordem de grandeza** de Vendas fora do incidente — favorece ruído de fundo igual, não salto de ratchet, mas dado esparso e sem baseline pré-07-03 do controle não é decisivo.

---

## 2. Hipóteses — achados com evidência bruta

### 5.1 — flag de config "ignorar mensagens próprias" — **MORTA**

Schema: nenhuma coluna `%own%|%self%|%ignore%|%reject%|%sync%` além de `reject_call`, `ignore_groups`, `ignore_status`, `msg_reject_call` — sem JSONB `settings/options/config`. Diff campo a campo: `reject_call=f/f`, `msg_reject_call=''/''`, `read_messages=f/f`, `ignore_groups=f/f`, `ignore_status=f/f`, `events` idêntico — **zero divergência** de config; diferenças só de identidade (`id`, `jid`, `token`, `created_at`). Sem `updated_at`; grep `PUT|PATCH /settings` real → zero hits, sempre. Código (`whatsmeow.go:1030-1078`): `doWebhook = true` incondicional; único gate é `IgnoreStatus/IgnoreGroups` (`false` nas duas). Único uso real de `IsFromMe` em socket: `whatsmeow.go:1122` — `if mycli.Instance.ReadMessages && !evt.Info.IsFromMe {...MarkRead...}` — só auto-read, não dispatch. **Conclusão: não existe gate de "ignorar próprio" no banco nem no código — descartada por duas fontes independentes.**

### 5.2 — device-list desync (celular parou de incluir o companion Vendas no fan-out)

Correção de schema: `whatsmeow_sessions.their_id` é chaveado por **LID**, não PN. Diff de inventário de sessões companion para o próprio LID:

| | Vendas (LID `64780991787087`) | Vendas Externa (LID `254833797906536`) |
|---|---|---|
| Slots companion (device) | `0, 32, 33, 34, 35*, 36, 37` | `0, 12, 13*` |
| Total | **6** | **2** |

(`*` = registro próprio). **Única assimetria estrutural real e não explicada** das duas rodadas — Vendas tem 3x mais dispositivos vinculados; seu slot (`:35`) fica entre `:34` e `:36/:37`, compatível com (não prova de) churn posterior. Sem coluna de timestamp e sem snapshot pré/pós-incidente — a ordenação **não pode ser datada**.

Grep na janela `2026-07-03T08:55-09:15` local por `device|notification|session|logged|PairSuccess`: **zero** eventos de device-list/pairing/logout/identidade na conta própria de Vendas (só 2 hits irrelevantes de terceiros). Baseline (essas palavras aparecem no pipeline em geral?): sim — `device`:148, `session`:126, `logged`:12 no histórico completo de Vendas, pipeline não é mudo por padrão. Mas whatsmeow **não tem classe de evento** para "recomputei fan-out" (`Unhandled event *events.X`: zero ocorrências, sempre) — a ausência da linha é **arquiteturalmente esperada**, não prova nem refuta.

Colateral: `lid_migration_ts` = `1775513497` (2026-04-06) para Vendas vs `0` (nunca) para Vendas Externa — assimetria real, mas ~3 meses antes, não é o gatilho.

**Conclusão: sem prova direta (nenhum relink/logout/pairing logado no instante do corte), mas também não refutada** — o mecanismo é por design invisível ao servidor. É a única hipótese com diff estrutural (6 vs 2) não explicado por nenhuma outra causa.

### 5.3 — drift de identidade LID↔PN — **enfraquecida/descartada**

Achado crítico: o `provider_message_id=3EB072E6CD81694973D3BA` (âncora "último eco" da GALLO) é na verdade um **envio via API**, não eco de celular:
```
09:00:00.896 "SendMessage called for number: +555196668008@s.whatsapp.net, type: ExtendedTextMessage"
09:00:01.065 "Sending message to 555196668008@s.whatsapp.net with ID 3EB072E6CD81694973D3BA"
```
O "instante exato" do corte pode não existir como evento único e caçável.

Endereçamento nos descartes self-JID: **100% `@s.whatsapp.net`** nas 144 linhas de Vendas (5 dias) e nas 12 de Vendas Externa — **0** ocorrências de `850110@lid` em ~90MB de log, mesmo com o heurístico de swap LID/PN (`whatsmeow.go:1080-1119`) disparando 12.870 vezes para terceiros — **nunca** para o LID próprio de Vendas. Auto-sync via LID próprio nunca parou: 1267(07-02)/1376(07-03)/195(07-04)/contínuo até 07-06T14:28. `whatsmeow_lid_map`: ambas têm linha própria populada (`lid=64780991787087 pn=555599850110` / `lid=254833797906536 pn=555599755317`), nenhuma ausente; sem timestamp, "desatualizado desde antes" não é 100% excluível, só "linha ausente" foi descartado. Código: swap LID↔PN só mexe em `Sender/SenderAlt/Chat`, nunca em `IsFromMe` — se houvesse drift, seria bug do whatsmeow upstream, não do wrapper. `pprof` → 404 nas duas instâncias.

**Conclusão: sem evidência de virada de endereçamento isolada a Vendas; ressalva única é a falta de timestamp no `lid_map`.**

---

## 3. Diff consolidado (Vendas × Vendas Externa, por checagem)

| Checagem | Vendas | Vendas Externa | Diferença? |
|---|---|---|---|
| Flags config (`reject_call/ignore_groups/ignore_status/read_messages/msg_reject_call`) | `f/f/f/f/''` | `f/f/f/f/''` | **Não** |
| `events` habilitados | idêntico | idêntico | **Não** |
| `created_at` | 2026-07-02 13:35:28 | 2026-07-06 12:37:38 (= instante do reset do log) | Sim (esperado, mas suspeito) |
| Slots companion (fan-out) | **6** (`0,32,33,34,35*,36,37`) | **2** (`0,12,13*`) | **Sim — única assimetria estrutural** |
| `lid_migration_ts` | 1775513497 (04-06) | 0 (nunca) | Sim (pré-existente, 3 meses antes) |
| `AppStateSyncError` LTHash | 5 | 0 | Sim (não explicado) |
| Endereçamento self-JID | 100% `@s.whatsapp.net` | 100% `@s.whatsapp.net` | **Não** |
| Taxa descarte "protocolo desconhecido" | ~9-22/dia | 12/~5h | Mesma ordem de grandeza |
| `whatsmeow_lid_map` | presente/populado | presente/populado | **Não** |
| PUT/PATCH `/settings` | 0 | 0 | **Não** |
| Continuidade do log | `.gz` + live íntegro | resetado 07-06T09:37, sem backup | Sim (lacuna de evidência) |

---

## 4-5. Veredito

**Nenhuma hipótese confirmada com evidência direta.** Adjudicação:

- **5.1 — descartada, alta confiança**: banco sem coluna candidata + código sem gate `IsFromMe` no dispatch.
- **5.3 — quase-descartada**: endereçamento consistente, auto-sync via LID nunca interrompido, mapa presente para ambas; ressalva única é `lid_map` sem timestamp, sem sinal positivo a favor.
- **5.2 — sobrevivente, não provada**: única com diff estrutural não explicado (6 vs 2 companion), favorecida por dois cruzamentos: Lacuna 1 (nada do canal self-JID chega ao dispatch, consistente com exclusão de fan-out) e Lacuna 3 (sem o salto de taxa que 5.3 previa) — ambas apontam 5.2 sobre 5.3. Falta prova direta: 6 vs 2 não tem timestamp que a date do incidente, e whatsmeow não gera evento para "recalculei fan-out".

**Próximo passo mais barato e menos arriscado (não executado, requer aprovação):** pedir à GALLO/dono do celular um print de "Dispositivos conectados" do WhatsApp em `+555599850110`, verificando se o companion Vendas ainda aparece. Resolve 5.2 diretamente, sem tocar VPS nem sessão.

---

## 6. Recomendações (opções — nenhuma a ser executada sem confirmação prévia da GALLO)

1. **Diagnóstico, risco zero:** capturar o print de "dispositivos conectados" acima — decide 5.2 sem custo.
2. **Se 5.2 confirmada** (companion ausente/expulso): re-pareamento controlado (novo QR ou logout+relogin) de Vendas. **Efeito na sessão viva — só com aprovação explícita da GALLO**, com snapshot read-only prévio de `whatsmeow_sessions`/`whatsmeow_device` para diff pós-ação.
3. **Independente de 5.2/5.3:** sugerir à GALLO logar `IsFromMe` como texto e habilitar `pprof` em produção — elimina os pontos cegos desta rodada.
4. **Higiene operacional:** corrigir retenção de log da Vendas Externa (perdeu histórico sem backup) para garantir controle são no próximo incidente.
5. Nenhum restart/reconexão/logout/edição de banco em Vendas sem relatório prévio e OK explícito da GALLO — condição de tudo acima.
