# Handoff — corrigir o `/user/avatar` do Evolution Go (hang/timeout)

> **Para:** o agente (Claude Opus 4.8) com acesso de shell ao **VPS onde roda o Evolution Go**.
> **De:** o agente da plataforma GALLO BASE DIESEL (que consome esse servidor por HTTP).
> **Objetivo:** descobrir a causa-raiz do `/user/avatar` que **pendura/timeout** e, se houver correção segura no servidor, aplicá-la — ou reportar de volta com diagnóstico conclusivo.
>
> Você **não** tem o contexto da conversa onde isso foi diagnosticado; este documento é autossuficiente. Leia tudo antes de agir.

---

## 1. Contexto

- O servidor é o **Evolution GO** (`github.com/EvolutionAPI/evolution-go`, "Evolution GO - whatsmeow", última release pública **v0.7.0**), um wrapper REST em Go sobre a biblioteca **whatsmeow** (`go.mau.fi/whatsmeow`).
- A plataforma GALLO (um CRM/SaaS) usa esse servidor para WhatsApp: pareia instâncias, envia/recebe mensagens, importa histórico e **sincroniza a foto de perfil dos contatos** chamando `POST /user/avatar`.
- **Tudo funciona** (parear, enviar, receber, webhooks, import de histórico) **exceto a foto de perfil**: `POST /user/avatar` **nunca responde** — sempre estoura no timeout.

> ⚠️ **PRODUÇÃO:** este mesmo servidor hospeda instâncias **em produção** (o WhatsApp comercial real da empresa, além da instância de teste). **Não derrube, não deslogue/despareie, não apague instâncias.** Qualquer `restart`/rebuild do processo do evo-go **desconecta todas as instâncias** por alguns instantes (as sessões persistem no banco e reconectam, mas isso é uma janela de indisponibilidade — combine com o dono antes). Investigue **read-only primeiro**.

---

## 2. Sintoma exato + evidências (lado do cliente)

A plataforma chama, por contato:

```
POST {baseUrl}/user/avatar
Headers: apikey: <TOKEN_DA_INSTANCIA>   (header é literalmente "apikey"; valor = token por-instância)
         Content-Type: application/json
Body:    {"number":"<E164 sem o +>","preview":true}
```

Resposta esperada (quando funciona): `{ "data": { "URL"|"url"|"profilePictureURL"|"profilePictureUrl": "https://..." } }` (a grafia do campo varia entre builds).

**O que observamos (18 de 18 chamadas, 100% de falha):**

| Métrica | Valor |
|---|---|
| `http_status` | `null` (nenhuma resposta chegou) |
| erro no cliente | `"Signal timed out."` (nosso `AbortController` corta em **12s**) |
| latência | ~**12.001 ms** (cortes em 12s); testes anteriores com timeout de 15s cortaram em **~15.006 ms** |
| `preview: true` **e** `preview: false` | **ambos** penduram igual |
| erro server-side correlato | **"info query timed out"** (ver issue #76 abaixo — outro usuário, mesmo sintoma) |

**Números de exemplo que falharam** (do nosso log — para você reproduzir): `555596264682`, `555581008186`, `555584330158`, `553199163717`, `5511922085194`, `556581420027`.

**Instância de teste para usar** (NÃO é a de produção — use esta para os testes): label **`Teste-AIL-Go-VI`**, `instanceId = 2c31ae8c-b836-4886-8993-4864c4326e8f`, status `connected`. Ela está pareada, recebeu histórico e troca mensagens normalmente.

**Já descartado / sabido:**
- **Não é privacidade.** Foto privada retornaria `401 ErrProfilePictureUnauthorized` **rápido**, não timeout.
- **Não é o cliente.** Nosso lado é best-effort e correto (aborta em 12s e segue). O problema é o servidor não responder.
- **Não é conexão geral.** Enviar/receber mensagem, webhooks e import de histórico funcionam na mesma instância → o socket/sessão está saudável; trava **especificamente** na IQ de foto (`GetProfilePictureInfo`).
- É um **bug reconhecido upstream**: [evolution-go #76](https://github.com/EvolutionAPI/evolution-go/issues/76) (aberta, v0.7.0, Linux, **sem correção/sem resposta do mantenedor**) relata o mesmíssimo "info query timed out" em `/user/avatar`. Relacionado: [whatsmeow #672](https://github.com/tulir/whatsmeow/issues/672) (`GetProfilePictureInfo` chega a derrubar o websocket).

---

## 3. Hipóteses a testar (em ordem de probabilidade)

1. **H1 — Formato do número / resolução de JID.** Vários números nossos têm **12 dígitos** (ex.: `555596264682` = `55` `55` `96264682`), ou seja **sem o 9º dígito** de celular do Brasil (o correto seria 13: `55` `55` `9` `96264682` → `5555996264682`). Se o handler monta o JID como `<number>@s.whatsapp.net` **sem canonizar**, a IQ vai para um **JID inexistente** e o WhatsApp simplesmente **não responde** → "info query timed out". **Se for isso, há fix real.**
2. **H2 — Handler sem `context`/timeout.** Se o handler chama `client.GetProfilePictureInfo(...)` sem um `context.WithTimeout`, qualquer não-resposta do WhatsApp **bloqueia** até o cliente abortar. Fix: passar contexto com deadline → erro limpo e rápido em vez de pendurar.
3. **H3 — whatsmeow desatualizado / drift de protocolo.** O WhatsApp muda o protocolo; uma versão antiga de whatsmeow no `go.mod` pode estar mandando a IQ num formato que o WhatsApp não responde mais. Fix: bump do whatsmeow + rebuild.
4. **H4 — App-state/contatos não sincronizados ou rate-limit.** Após parear, se os contatos não estão no store do whatsmeow, ou se há muitas queries seguidas, o WhatsApp ignora as IQs de foto. Fix: garantir sync de contatos; espaçar/limitar.

---

## 4. Passo a passo de investigação (read-only primeiro)

### 4.1 Identifique runtime, versão e porta
```bash
# Como roda? (docker, compose, systemd, binário?)
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}' | grep -i evo
# ou
docker compose ls ; systemctl --type=service | grep -i evo
```
Anote: **nome do container/serviço**, **tag da imagem/versão**, **porta HTTP** exposta, e onde está o **código-fonte** (se buildado localmente) ou a imagem.

### 4.2 Ache a chave global e o token da instância de teste
A auth é o header `apikey`. Endpoints **admin** usam a **chave global** (env do evo-go, ex. `GLOBAL_API_KEY`/`AUTHENTICATION_API_KEY` — confira o `.env`/compose). Endpoints **scoped** (`/user/*`, `/send/*`) usam o **token por-instância**.
```bash
# token da instância de teste — via API admin (chave global) ou direto no banco do evo-go:
curl -sS "http://127.0.0.1:<PORTA>/instance/all" -H "apikey: <CHAVE_GLOBAL>" | jq '.[] | {id,name,token,jid,connected}'
# localize o registro cujo id == 2c31ae8c-b836-4886-8993-4864c4326e8f e pegue o token dele
```

### 4.3 Localize o handler do avatar no código-fonte
O schema Swagger referencia `pkg/user_service` → `GetAvatarStruct`. No fonte (ou dentro do container/imagem):
```bash
grep -rn "GetProfilePictureInfo" .        # a chamada whatsmeow
grep -rn "user/avatar\|GetAvatar"  .      # o handler/rota
grep -n  "go.mau.fi/whatsmeow" go.mod     # versão do whatsmeow
```
Leia o handler e responda:
- Como ele converte `number` → `types.JID`? Canoniza (resolve o JID real via `IsOnWhatsApp`/onWhatsApp) ou só faz `number + "@s.whatsapp.net"`?
- Ele passa um `context.WithTimeout` para `GetProfilePictureInfo`? (Em whatsmeow recentes a assinatura é `GetProfilePictureInfo(ctx, jid, params)`; em versões antigas não tem ctx.)
- O `params` usa `Preview` corretamente?

### 4.4 Testes controlados (com a instância de teste, vendo o log ao vivo)
Em um terminal: `docker logs -f --tail 20 <container_evo_go>`. Em outro, rode **um de cada vez** e meça o tempo:

```bash
TOKEN='<TOKEN_DA_INSTANCIA_TESTE>' ; PORT='<PORTA>'

# (A) número que VOCÊ SABE ser válido e ter foto pública (ideal: o WhatsApp pessoal do dono, COM o 9):
time curl -sS -X POST "http://127.0.0.1:$PORT/user/avatar" -H "apikey: $TOKEN" \
  -H "Content-Type: application/json" -d '{"number":"<NUMERO_VALIDO_COM_FOTO>","preview":true}'

# (B) um número nosso que falhou, SEM o 9 (como está hoje):
time curl -sS -X POST "http://127.0.0.1:$PORT/user/avatar" -H "apikey: $TOKEN" \
  -H "Content-Type: application/json" -d '{"number":"555596264682","preview":true}'

# (C) o MESMO contato de (B), mas COM o 9º dígito (canonizado):
time curl -sS -X POST "http://127.0.0.1:$PORT/user/avatar" -H "apikey: $TOKEN" \
  -H "Content-Type: application/json" -d '{"number":"5555996264682","preview":true}'

# (D) DIFERENCIAL — outra IQ pro mesmo número responde rápido? (confirma que o socket/IQ path funciona)
#     Use o endpoint de verificação de número do servidor (consulte o swagger/rotas: algo como /user/check
#     ou onWhatsApp). Se ESSE responde rápido e só o avatar pendura, a falha é específica do GetProfilePictureInfo.
```

**Como ler os resultados:**
- **(A) responde URL rápido** → o endpoint **funciona** para JID válido. A falha é **formato/JID** (H1). Confirme com (C): se o número COM o 9 retorna foto e SEM o 9 dá timeout, **está provado**.
- **(A) também dá timeout** → é **universal** (H2/H3/H4). Veja no log se aparece `info query timed out`, `1006/unexpected EOF/websocket`, ou nada.
- **(D) rápido + avatar pendura** → reforça que é específico da IQ de foto (não é conexão).

### 4.5 Versão do whatsmeow
Compare a versão em `go.mod` com a mais recente de `go.mau.fi/whatsmeow`. Se estiver muito atrás, é forte candidato (H3).

---

## 5. Árvore de decisão → correção

- **Se H1 (formato/JID) confirmado:** a correção mais limpa é **no servidor**: antes de `GetProfilePictureInfo`, resolver o **JID canônico** via whatsmeow (`cli.IsOnWhatsApp([]string{number})` → use o `JID` retornado) e só então buscar a foto. Isso conserta para todos os consumidores.
  - *Alternativa do lado da plataforma GALLO* (se preferir não tocar no evo-go): a plataforma passa a chamar primeiro o endpoint de verificação (onWhatsApp) para obter o número canônico e só então `/user/avatar`. **Reporte isso** que implementamos do nosso lado. (Já existe um esforço nessa direção no nosso código: "resolve canonical number before /user/avatar".)
- **Se H2 (sem context/timeout):** envolva a chamada em `context.WithTimeout(ctx, 8*time.Second)` e retorne erro 504/JSON limpo no estouro. Não faz a foto aparecer, mas elimina o **hang** longo (melhora todos os clientes). Bom complemento mesmo que a causa principal seja outra.
- **Se H3 (whatsmeow velho):** bump da dependência + rebuild + reteste (A). **Cuidado:** rebuild/restart = janela de indisponibilidade de produção; combine com o dono.
- **Se H4 (app-state/rate-limit):** garanta sync de contatos pós-pareamento; busque foto só para JIDs presentes no store; espace requisições. Teste se, logo após um sync de contatos, (A) passa a responder.
- **Se nada resolve (bug realmente upstream e irrecuperável):** reporte conclusivamente; a plataforma GALLO vai **blindar a UX** (parar de varrer centenas de contatos × 12s e evitar o 504) e acompanhar a issue #76.

---

## 6. O que reportar de volta (entregáveis)

Escreva um relatório curto com:
1. **Runtime/versão:** como roda, tag da imagem/versão do evo-go, versão do whatsmeow (`go.mod`).
2. **Handler:** trecho do código do `/user/avatar` — como monta o JID e se passa `context`.
3. **Resultados dos testes (A)(B)(C)(D)** — tempo e resposta de cada, + a(s) linha(s) de log do evo-go durante o avatar (procure por `info query timed out`, `1006`, `unexpected EOF`, `unauthorized`).
4. **Causa-raiz** identificada (qual H) e **a correção** — se aplicou algo no servidor, diga exatamente o quê (diff/patch) e que foi testado; se a correção é do lado da plataforma, descreva o que a GALLO precisa fazer.
5. **Riscos/limitações** e se houve qualquer impacto em produção.

---

## 7. Referências

- Endpoint contrato: `POST /user/avatar`, header `apikey: <token da instância>`, body `{"number":"<E164 sem +>","preview":true|false}`, resposta `{data:{URL|url|profilePictureURL|...}}`.
- Swagger do servidor (no repo da plataforma): `docs/integracoes/evo-go/doc.json` (definição `...pkg_user_service.GetAvatarStruct`).
- Issue idêntica (upstream, **aberta**): https://github.com/EvolutionAPI/evolution-go/issues/76
- whatsmeow `GetProfilePictureInfo` derrubando socket: https://github.com/tulir/whatsmeow/issues/672
- Repo do servidor: https://github.com/EvolutionAPI/evolution-go
- whatsmeow: https://pkg.go.dev/go.mau.fi/whatsmeow

> Regra de ouro: **investigue read-only, prove a hipótese com os testes (A)/(C) antes de qualquer mudança, e nunca reinicie/rebuilde sem combinar com o dono** (produção viva neste servidor).
