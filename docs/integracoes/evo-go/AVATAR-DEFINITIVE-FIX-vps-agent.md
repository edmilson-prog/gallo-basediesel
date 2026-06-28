# Fix definitivo do `/user/avatar` no servidor Evolution GO

> **Para:** o agente (Claude Opus 4.8) com shell no VPS do Evolution GO.
> **De:** plataforma GALLO. **Pré-requisito:** ler `docs/reports/AVATAR-HANDOFF-REPORT.md` (você mesmo escreveu o diagnóstico).
> **Status do problema na GALLO:** já contornado do nosso lado (PR #189: enviamos `number` como JID `<digits>@s.whatsapp.net`). **Este documento é para corrigir a RAIZ no servidor** — opcional, mas elimina o bug para qualquer cliente e resolve a issue upstream #76.

---

## 1. O bug (recap, já provado por você)

O handler do `/user/avatar` monta o JID a partir de `number` **prependendo um `+`** → `+<digits>@s.whatsapp.net`. Esse JID é **inválido**; o WhatsApp ignora a IQ `w:profile:picture` e ela pendura até o timeout interno do whatsmeow (1m15s). Log que você capturou:

```
Requesting avatar for JID: +555481572275@s.whatsapp.net, Preview: true
<iq ... target="+555481572275@s.whatsapp.net" ... xmlns="w:profile:picture">
sendIQ: ... timeout=1m15s
```

Prova de que é só o `+`: enviar `number` já com `@s.whatsapp.net` → **200 em ~150ms**.

---

## 2. A correção no código — LOCALIZADA (`pkg/utils/utils.go`)

A raiz NÃO está no handler do avatar (ele só faz `jid, ok := utils.ParseJID(data.Number)`), e sim em **`CreateJID`** (chamada por `ParseJID`, usada por `GetAvatar`/`GetUser`/`CheckUser`/`BlockContact`...). Depois de limpar o número e formatar BR/MX/AR, ela **re-adiciona um `+`** — e o `User` de um JID do whatsmeow tem que ser **dígitos puros, sem `+`**. Está no `main` **e** na tag `0.7.1` (a imagem do VPS).

`pkg/utils/utils.go`, fim de `func CreateJID(number string) (string, error)`:

```go
	// Format BR (55) numbers
	number = formatBRNumber(number)

	// Add + prefix for international format   // <-- BUG
	if !strings.HasPrefix(number, "+") {       // <-- BUG
		number = "+" + number                  // <-- BUG: User do JID não pode ter "+"
	}                                          // <-- BUG

	return number + "@s.whatsapp.net", nil
```

**Patch (remover o bloco do `+`):**
```diff
 	// Format BR (55) numbers
 	number = formatBRNumber(number)
 
-	// Add + prefix for international format
-	if !strings.HasPrefix(number, "+") {
-		number = "+" + number
-	}
-
 	return number + "@s.whatsapp.net", nil
```

⚠️ **Os testes assertam o `+`** — foi escolha deliberada, porém errada. O PR precisa atualizar `pkg/utils/utils_test.go`: em **`TestCreateJID`** e **`TestParseJID`**, remover o `+` inicial de cada `expected`/`expectJID` (ex.: `"+15551234567@s.whatsapp.net"` → `"15551234567@s.whatsapp.net"`). São ~13 casos (os de `@g.us`/`@broadcast`/`@lid` e os que já vêm com `@` não mudam).

> O `GetAvatar` no service **já usa `context`** (`client.GetProfilePictureInfo(ctx, jid, …)`), então não precisa adicionar timeout — o problema é só o `+` no JID.

**Justificativa para o PR (fecha a [#76](https://github.com/EvolutionAPI/evolution-go/issues/76)):** JID do whatsmeow tem `User` = dígitos puros; o `+` invalida o JID para a IQ `w:profile:picture` → `GetProfilePictureInfo` pendura 1m15s. Prova: o **mesmo** número como `<digits>@s.whatsapp.net` (que cai no early-return da `CreateJID`, linha ~66, e escapa do `+`) retorna a foto em ~150ms; com `+` dá timeout. Mensagens "funcionam" com `+` porque o roteamento tolera, mas a IQ de foto não.

**Validar que nada regride após remover o `+`:** `go test ./pkg/utils/...` (ajustado) + smoke de `/user/avatar`, `/user/check`, `/send/text` e `/user/contacts` na instância de teste — todos seguem OK (dígitos puros é a forma correta para todos).

---

## 3. Como entregar (escolha o caminho)

### Caminho A — PR upstream (RECOMENDADO, zero downtime de produção)
É a issue [EvolutionAPI/evolution-go#76](https://github.com/EvolutionAPI/evolution-go/issues/76), aberta e sem fix. Contribua o patch:
1. Fork/clone do repo, branch `fix/user-avatar-jid-plus-prefix`.
2. Aplique o patch acima.
3. **Teste** com a instância de teste (id `2c31ae8c-b836-4886-8993-4864c4326e8f`): `go build` (ou rode o container local da sua branch numa porta alternativa) → `POST /user/avatar {"number":"555481572275","preview":true}` deve voltar **200** e o log NÃO deve ter `+` no `target`.
4. Abra o PR citando o diagnóstico (o `+` no `target` da IQ, timeout 1m15s) e linkando a #76.
5. Quando o mantenedor lançar a versão com o fix, atualizamos a imagem do VPS numa janela combinada — aí podemos remover o workaround da GALLO (ou deixar; é inócuo).

### Caminho B — patch local + rebuild (só se não quiser esperar o upstream; TEM downtime)
⚠️ Rebuild + `docker compose up -d` do evo-go **derruba todas as instâncias** (produção viva) → **combine a janela com o dono antes**. Buildar a imagem própria, subir, e validar com o mesmo teste do passo 3.

---

## 4. Validação (qualquer caminho)

```bash
# bare digits agora deve funcionar (sem @, sem +):
time curl -sS -X POST "http://127.0.0.1:<PORTA>/user/avatar" -H "apikey: <TOKEN_INSTANCIA_TESTE>" \
  -H "Content-Type: application/json" -d '{"number":"555481572275","preview":true}'
# esperado: 200 + {"data":{"url":...}} em ~150-250ms; no log, target SEM o `+`.
```

## 5. Relatar de volta
Diga qual caminho seguiu, o link do PR (se A), o resultado do teste de validação, e — se rebuildou (B) — confirme que produção voltou OK. Lembre: a GALLO **já funciona** via workaround, então isto é correção de raiz / contribuição upstream, sem urgência.
