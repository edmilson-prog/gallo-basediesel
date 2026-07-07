# INCIDENTE 2026-07-06 — servidor Evolution GO com ZERO instâncias conectadas

> **Para:** o agente com shell no VPS do Evolution GO (whatsmeow).
> **De:** plataforma GALLO. **Severidade: ALTA — produção parada** no provedor Go (a conta "Vendas Externa", em produção, caiu e não volta; nenhuma instância consegue parear).
> **Autorização prévia:** como NÃO há nenhuma sessão conectada, um **restart do container está pré-autorizado** pela GALLO. Qualquer ação além disso (rollback de versão, edição de banco, logout/delete de instância) exige relatório prévio + OK explícito.

---

## 1. Sintomas (confirmados do lado GALLO, com evidência em `integration_logs`)

Todas as horas em **UTC**.

| Momento | Evento |
|---|---|
| 13:31–13:33 | Upgrade do container `evoapicloud/evolution-go` 0.7.1 → 0.7.2 (registrado no relatório anterior de vocês) |
| 13:33:39 | `/instance/qr` → HTTP 400 após ~2s (primeira falha registrada pós-upgrade) |
| 13:42–13:49 e 20:10–20:33 | `/instance/qr` → HTTP 200 **sem campo `Qrcode` no corpo** (instâncias Teste e Vendas; nenhum QR foi exibido ao usuário em nenhuma tentativa do dia) |
| 20:37 em diante | `/instance/qr` → **HTTP 400 após exatos ~5.009ms** (timeout interno de vocês?), consistentemente, com `/instance/status` = `Connected:false` |
| 20:37, 20:42, 20:54, 22:29 | `/instance/status` → **401 `{"error":"not authorized"}` INTERMITENTE** — mesma chave retorna 200 em ~99% das chamadas, antes e depois de cada 401 |
| **21:14:39** | **Última resposta saudável da Vendas Externa** (`b74e8121`, `Name:"Ramon Turbo Diesel Rs", LoggedIn:true, Connected:true`). A partir do ciclo seguinte: `Name:"", LoggedIn:false, Connected:false` — **a única sessão viva do servidor caiu e não reconectou** |
| 22:26–22:29 | Tentativas de pareamento na Teste (`2c31ae8c`): `/instance/connect` 200 → `/instance/status` `Connected:false` → `/instance/qr` 400 em 5s, repetido |

**Estado atual: as 3 instâncias (`64127deb` Vendas, `b74e8121` Vendas Externa, `2c31ae8c` Teste) reportam `LoggedIn:false, Connected:false`.** A API REST de vocês responde normal (~70ms, 200) — o processo está no ar; o que não funciona é o **socket com o WhatsApp**.

Contexto adicional: os celulares das contas Vendas e Teste foram desvinculados manualmente hoje (isso explica o `LoggedIn:false` DELAS, não da Vendas Externa, que ninguém tocou). Houve ~6 tentativas de pareamento da Vendas entre 20:10–20:33 e o device slot dela mudou `:35` → `:38` (pareamento parcial em algum momento).

## 2. Perguntas centrais

1. **Por que nenhum cliente whatsmeow consegue estabelecer/manter o websocket com o WhatsApp desde hoje?** Em especial: o que os logs mostram no instante `21:14–21:16 UTC` (queda da Vendas Externa) e nas tentativas de connect das 22:26–22:29?
2. **O 0.7.2 é o culpado?** O timing é suspeito (upgrade 13:31, primeira falha de QR 13:33; nenhuma QR emitida o dia todo). Hipóteses a validar nos logs: erro de login `405` / "client outdated" (versão do protocolo whatsmeow), falha TLS/DNS/proxy de saída, mudança de comportamento do `/instance/qr` no 0.7.2 (retorna 200 sem QR / 400 após 5s), crash-loop de goroutine de conexão.
3. **Ou é o WhatsApp bloqueando o IP do VPS** (throttling/temp-ban após as tentativas repetidas de pareamento)? Isso explicaria connects recusados, mas NÃO explica sozinho a queda da sessão já autenticada às 21:14 nem o 200-sem-QR desde 13:42.
4. **O 401 intermitente do `/instance/status`** (mesma chave, ~1 falha a cada ~100 chamadas) — middleware de auth consultando o Postgres de vocês e falhando esporadicamente? Correlacionar horários: 20:37:59, 20:42:07, 20:54:07, 22:29:53 UTC.

## 3. O que checar (ordem sugerida)

1. `docker logs` / log de instância desde `13:25 UTC`, procurando: `405`, `client outdated`, `temporarily banned`, `connect failure`, `websocket`, `TLS`, `dial`, `panic`, e a janela `21:14–21:16` para a Vendas Externa.
2. Saúde do container: restart count, OOM, crash-loop (`docker inspect`/`ps`), uso de memória/CPU.
3. Conectividade de saída do VPS com os servidores do WhatsApp (ex.: `curl -v https://web.whatsapp.com` / resolução DNS de `g.whatsapp.net`).
4. Diff de comportamento 0.7.1 → 0.7.2 no handler do `/instance/qr` (código-fonte real da imagem, como nas rodadas anteriores — o 400 em ~5s e o 200 sem `Qrcode` são novos?).
5. O middleware de auth (401 intermitente) — logs do Postgres interno no horário das falhas.

## 4. Ações

- **Pré-autorizado:** restart do container (nada conectado, nada a perder). Fazer APÓS coletar os logs acima, para não destruir evidência.
- Depois do restart: a GALLO tentará gerar QR na instância Teste (`2c31ae8c` — é de teste, sem risco) e reportará o resultado.
- **Se a suspeita recair no 0.7.2:** avaliar rollback para 0.7.1 (⚠️ checar antes se o 0.7.2 migrou schema do Postgres de vocês — rollback só com relatório + OK da GALLO).
- Trazer relatório com: causa raiz (ou o que foi descartado, com evidência), o que os logs mostram nos dois instantes-chave (13:31–13:49 e 21:14–21:16), e recomendação.

## 5. Referências

- Relatórios anteriores desta investigação: `ECO-CELULAR-RELATORIO-vps-agent.md` e `ECO-CELULAR-RELATORIO-2-vps-agent.md` (mesma pasta).
- Correção do lado GALLO já em produção (PR #251): o app não reporta mais "Conectado" falso; toda falha de QR agora aparece como erro honesto — os sintomas reportados aqui são medições reais do servidor, sem máscara do app.
