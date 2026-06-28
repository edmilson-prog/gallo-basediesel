# Relatório — causa-raiz do `/user/avatar` (hang/timeout) no Evolution GO

> **De:** agente com shell no VPS do Evolution GO. **Para:** plataforma GALLO BASE DIESEL.
> **Data:** 2026-06-28. **Veredito:** causa-raiz **provada**, com correção imediata **do lado da GALLO** (zero downtime). Nenhum impacto em produção.

## TL;DR

O handler `/user/avatar` do evo-go, quando recebe `number` **só com dígitos**, monta o JID
**com um `+` na frente** → `+<number>@s.whatsapp.net`. Isso é um **JID inválido**; o WhatsApp
**ignora silenciosamente** a IQ `w:profile:picture` e ela estoura no timeout interno do whatsmeow
(**1m15s**) — o cliente da GALLO corta antes (12s). Por isso **100% das chamadas** penduram,
inclusive para números válidos e para o próprio número da instância.

**Correção imediata (GALLO, sem tocar no servidor):** envie o campo `number` **já como JID**,
acrescentando `@s.whatsapp.net`:

```diff
- {"number":"555596264682","preview":true}
+ {"number":"555596264682@s.whatsapp.net","preview":true}
```

Quando o `number` já contém `@`, o handler usa o JID **direto** (sem prepender `+`) e funciona.
Provado: passou de **timeout 1m15s** para **HTTP 200 em ~150–230 ms** com a URL da foto.

## 1. Runtime / versão

| Item | Valor |
|---|---|
| Como roda | Docker (`/opt/stacks/evolution-go`, compose), binário Go `/app/server`, porta **4000** (não publicada no host; só redes `edge` + `internal`) |
| Imagem | `evoapicloud/evolution-go:0.7.1` (VERSION = 0.7.1) |
| whatsmeow | **recente** — build info traz pseudo-version `…20260212183809-81e46e3db34a` (Fev/2026). **H3 (lib velha) descartada.** |
| Instância de teste | id `2c31ae8c-b836-4886-8993-4864c4326e8f`, jid `555481572275`, `connected:true` |

## 2. Causa-raiz (prova no log do servidor)

Enviando `{"number":"555481572275"}` (só dígitos), o evo-go logou:

```
Requesting avatar for JID: +555481572275@s.whatsapp.net, Preview: true
Sending GetProfilePictureInfo IQ: ... target=+555481572275@s.whatsapp.net
<iq id="64.6-237" target="+555481572275@s.whatsapp.net" to="s.whatsapp.net" type="get"
    xmlns="w:profile:picture"><picture query="url" type="preview"/></iq>
sendIQ: ... timeout=1m15s
```

→ note o **`+`** no `target`. O WhatsApp **nunca responde** essa IQ (JID inválido) → "info query timed out".

**Diferencial (D), no mesmo socket:** outra IQ (`xmlns="w:p"`, id `-238`) **respondeu em ~150 ms**
(`type="result"`). Logo o socket/sessão está saudável; trava **só** o avatar, por causa do `+`.

## 3. Mapa do comportamento do handler (testes controlados)

Todos contra a instância de teste, observando o log do JID montado:

| `number` enviado | JID que o servidor monta | Resultado |
|---|---|---|
| `555481572275` | `+555481572275@s.whatsapp.net` | ❌ timeout 1m15s |
| `+555481572275` | `+555481572275@s.whatsapp.net` | ❌ timeout (não duplica o `+`, mantém um) |
| `555481572275@s.whatsapp.net` | `555481572275@s.whatsapp.net` | ✅ **200, foto, ~150 ms** |
| `555596264682@s.whatsapp.net` (cliente que falhava, **12 díg., sem o 9**) | `555596264682@…` | ✅ **200, foto, ~230 ms** |
| `5555996264682@s.whatsapp.net` (o mesmo, **com o 9** "canonizado") | `5555996264682@…` | ❌ **500** |

**Conclusão sobre H1 (falta do 9º dígito): refutada.** Os números de 12 dígitos **sem o 9**
**são o JID real** desses contatos — retornam a foto na hora. **Adicionar o 9 quebra (500).**
Eles nunca falharam por causa do 9; falhavam **exclusivamente pelo `+`**.

- **H1 (formato/JID):** o defeito real é o **`+` prepended pelo servidor**, não o 9. ✔ causa-raiz.
- **H2 (sem context curto):** parcialmente verdade — o handler depende do timeout interno de
  **1m15s** do whatsmeow; não há `context.WithTimeout` curto, por isso o hang é longo. É um
  agravante (UX), mas não a causa.
- **H3 (whatsmeow velho):** descartada (lib de Fev/2026).
- **H4 (app-state/rate-limit):** descartada (falhava até no próprio número; 1ª chamada já pendura).

## 4. Correção

### Recomendada — lado da GALLO (imediata, sem downtime) ✅
Acrescentar `@s.whatsapp.net` ao `number` ao chamar `/user/avatar`:
`number = "<digitsE164semMais>@s.whatsapp.net"`. Use **os dígitos exatamente como já estão**
(NÃO inserir o 9 — o stored 12-díg é o JID correto). Funciona hoje, para todos os números testados.

> A resposta de sucesso vem em `{"data":{"url": "..."}}` (grafia `url` minúsculo nesta build 0.7.1).

### Correção definitiva — no servidor (upstream, requer rebuild)
O binário `0.7.1` é compilado (sem fonte local aqui); corrigir exige patch + rebuild da imagem, o
que **derruba todas as instâncias** por instantes (produção viva) → **combinar com o dono antes**.
O fix correto no handler do avatar: **não** prepender `+`; canonizar com
`number = strings.TrimPrefix(number, "+")` e montar `types.NewJID(number, types.DefaultUserServer)`
(ou parsear direto quando já vier com `@`). Vale também envolver `GetProfilePictureInfo` num
`context.WithTimeout(ctx, ~8s)` para falhar limpo em vez de pendurar 1m15s. É o mesmo bug da
issue upstream **evolution-go #76** — vale comentar lá com este diagnóstico (o `+` no `target`).

## 5. Riscos / impacto em produção

- **Nenhum impacto em produção.** Tudo read-only + chamadas inofensivas de leitura de foto
  **apenas na instância de teste** (`2c31ae8c…`). Nada de restart/rebuild/logout/delete.
- O workaround da GALLO é puramente no formato do payload — não muda nada no servidor.
