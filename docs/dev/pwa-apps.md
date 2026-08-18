# Dois PWAs numa origem só

`crm.gallobasediesel.com.br` hospeda **dois apps instaláveis** além do CRM:

| App                   | Rota           | Documento          | Manifest                   | Para quem                             |
| --------------------- | -------------- | ------------------ | -------------------------- | ------------------------------------- |
| **GALLO Atendimento** | `/atendimento` | `atendimento.html` | `/atendimento.webmanifest` | atendentes — só conversas, no celular |
| **GALLO Vendedor**    | `/pwa`         | `index.html`       | `/manifest.webmanifest`    | vendedor externo (PRD-070)            |

Este documento existe porque a convivência dos dois numa origem só produziu **quatro rodadas
de bug** entre 11 e 12/08/2026, cada uma parecendo resolvida até o iPhone provar o contrário.
As regras abaixo são caras. Leia antes de mexer em `index.html`, em manifest, em ícone ou em
qualquer coisa de instalação.

---

## Regra 1 — cada PWA precisa do PRÓPRIO documento HTML

**O WebKit amarra a identidade do web app ao manifest presente quando o documento carrega, e
nunca relê um `href` alterado.** Trocar `<link rel="manifest">` por script — mesmo inline no
`<head>`, mesmo antes do primeiro paint — não funciona no iOS. O parser insere o link com o
href original; o script troca milissegundos depois; o Safari já decidiu.

O Chrome **relê**. Essa diferença é uma armadilha de método: toda medição feita no desktop
passa, e o iPhone continua errado.

> **Assinatura do sintoma:** a folha "Adicionar à Tela de Início" mostra o **ícone certo** com
> o **nome e a URL errados**. O `apple-touch-icon` é resolvido na hora de abrir a folha; o
> manifest, não. Se você vir ícone do app A com nome do app B, é isto.

Por isso `/atendimento` tem `atendimento.html`, com a identidade **estática** na marcação:

```html
<link rel="manifest" href="/atendimento.webmanifest" />
<meta name="theme-color" content="#141011" />
<meta name="apple-mobile-web-app-title" content="GALLO Atendimento" />
<link rel="apple-touch-icon" href="/atendimento-apple-touch-icon.png" />
```

Três peças sustentam isso e **todas** precisam existir:

1. `vite.config.ts` → `build.rollupOptions.input` com as duas entradas (`index.html` e
   `atendimento.html`);
2. `vercel.json` → rewrites de `/atendimento` e `/atendimento/(.*)` para `/atendimento.html`,
   **antes** da catch-all (que engoliria as duas);
3. `vite.config.ts` → o plugin `gallo-atendimento-document`, que aplica o mesmo rewrite em
   `configureServer` e `configurePreviewServer`. Sem ele, `bun run dev` e `bun run preview`
   servem `index.html` em `/atendimento` e **a verificação local mente** — foi assim que três
   rodadas de checagem voltaram verdes.

O teste `src/features/pwa-atendimento/installContract.test.ts` trava as três, inclusive a
**ordem** das regras do `vercel.json`.

## Regra 2 — a identidade são QUATRO tags, e elas andam juntas

Manifest, `theme-color`, `apple-mobile-web-app-title` e `apple-touch-icon`. Tratar um
subconjunto já custou um bug: o `usePwaManifest` trocava duas e restaurava duas, então sair do
atendimento deixava o resto do CRM vestindo o ícone do atendimento.

⚠️ **O iOS lê o `apple-touch-icon` e IGNORA os ícones do manifest.** Um ícone não restaurado
sobrevive ao manifest restaurado ao lado dele.

`usePwaManifest` ainda existe, mas só para a **navegação client-side** que entra em
`/atendimento` sem recarregar (essa continua dentro do `index.html`). A instalabilidade já está
decidida nesse ponto — o hook serve para a aba não mentir sobre qual app está mostrando.

## Regra 3 — instalabilidade é decidida no carregamento

O navegador julga a página contra o manifest declarado **naquele instante**. Qualquer coisa que
dependa de React já montado chega tarde. Vale para `beforeinstallprompt` (Chromium) e para a
folha de compartilhar (iOS).

## Regra 4 — capture `beforeinstallprompt` fora do React

O evento dispara **uma vez por carregamento**, cerca de 1 s depois do `load` (o navegador só
julga instalabilidade depois que o service worker registra, e `main.tsx` adia isso para
`window.load`). Medido em perfil de celular: 612 ms em rede rápida, 1922 ms em rede lenta.

Um listener dentro de um componente só ouve se aquele componente estiver montado naquele
instante — e o evento não se repete. Quem cai no login, ou abre conversa vinda de um push,
perde a oferta pelo carregamento inteiro.

A captura vive em `src/shared/lib/installPrompt.ts`, chamada de `main.tsx` em escopo de módulo.
`useInstallPrompt` só **assina** (`useSyncExternalStore`). Provado: a oferta continua
disponível 53 s depois, numa tela montada do zero.

## Regra 5 — "está instalado?" não é `display-mode`

`display-mode: standalone` (e `navigator.standalone` no iOS) só é verdadeiro **na janela aberta
pelo ícone**. Numa aba do navegador, um app instalado responde exatamente igual a um app que
ninguém instalou.

Por isso `installPrompt.ts` persiste o `appinstalled` por escopo de app: o evento não diz qual
dos dois foi instalado, mas dispara na aba de onde partiu — o `pathname` responde.

Limite conhecido: instalação feita em outro navegador, ou dados do site apagados, volta a ler
"não instalado". O app **super-oferece** em vez de esconder o caminho.

---

## iOS — o que é possível

- **Push só existe para web app na tela de início.** Aba aberta, em **qualquer** navegador, não
  tem `PushManager`. Requer iOS 16.4+.
- **A instalação confiável sai do Safari** → Compartilhar → Adicionar à Tela de Início. Chrome,
  Firefox e Edge no iOS rodam sobre WebKit mas chegam lá pelos próprios menus, e o atalho pode
  virar favorito que abre em aba: parece instalado e nunca toca.
- `engine/iosBrowser.ts` detecta navegador iOS não-Safari e a tela de instalação avisa.
  ⚠️ **Todo navegador do iOS carrega `Safari/604.1` no UA** — detectar por
  `includes("Safari")` chama todos de Safari. Use os marcadores `CriOS|FxiOS|EdgiOS|…`.
- `Notification.requestPermission()` **precisa ser chamado antes de qualquer `await`** dentro do
  handler do clique. Um `await navigator.serviceWorker.ready` antes dele consome o gesto do
  usuário e o WebKit nega em silêncio. `usePushSubscription.subscribe()` está correto — pede
  primeiro, registra depois. **Não reordene.**
- **O atalho fica preso ao que foi declarado na instalação.** Deploy novo não conserta atalho
  velho: nem a URL, nem o ícone, nem o nome. A cura é apagar o atalho e reinstalar.
- O toggle **"Abrir como app web"** na folha de compartilhar **é do Safari** (iOS 18+), não do
  Chrome. Não use isso para identificar navegador em prints.

---

## Ícones

Gerados por `scripts/generate-pwa-icons.py` (Pillow) a partir de
`docs/images/logos/MARCA-ALTERNATIVA---BRANCO.png`. **Não commite PNG sem origem rastreável** —
rode o script.

- **Só o símbolo, nunca o lockup.** Nos 48 px que o launcher desenha, "BASE DIESEL" vira
  borrão, e o sistema já escreve o nome do app embaixo do ícone. O script acha onde o símbolo
  termina procurando a primeira faixa de linhas vazias, então reexportar a arte continua
  funcionando sem número mágico.
- **`any` e `maskable` são arquivos SEPARADOS.** O Android recorta o maskable num círculo de
  80% do diâmetro; arte desenhada para preencher o quadrado perde as bordas. `"any maskable"` na
  mesma imagem está sempre errado para um dos dois. O conjunto maskable ocupa ~54% do canvas
  (um quadrado inscrito no círculo seguro cabe em 80%/√2 ≈ 56%).
- **iOS ignora os ícones do manifest** e lê `apple-touch-icon` — 180×180, **opaco** (o iOS não
  honra transparência: vira quadrado preto).
- **O badge da notificação é silhueta**: o Android desenha pelo canal alfa, então imagem
  colorida vira borrão sólido. `atendimento-badge-96.png` é branco sobre transparente.

---

## Aviso de versão nova

`PwaUpdateBar` reaproveita o motor do CRM — um `/version.json`, um build id, um caminho de
recarga (`useDeployWatcher` + `hardReload` + `shouldReopenPrompt`, exportados pelo barrel de
`version-update`). Só a casca é do app.

O sinal é o build id do **SPA inteiro**, de propósito: este app divide o bundle com o CRM, e uma
correção em código compartilhado chega ao atendente tanto quanto uma mudança na pasta dele. Um
filtro por pasta ficaria calado exatamente quando o conserto importa.

A faixa divide o topo com o aviso de mensagem nova; mensagem que chega tem prioridade.

---

## Como verificar sem aparelho

O que **funciona** (e pegou bugs de verdade):

```bash
bun run build && bun run preview --port 4180 --strictPort
```

Depois, com o chrome-devtools MCP:

- `navigate_page` aceita `initScript`, que roda **antes** dos scripts da página — dá para
  instalar uma sonda de `beforeinstallprompt` e cronometrar o disparo;
- `emulate` com `Slow 3G` + CPU 4x + viewport mobile reproduz a corrida de montagem;
- ler `defaultPrevented` num `setTimeout(0)` prova se o listener do app capturou o evento;
- ⚠️ `history.pushState` + `PopStateEvent` sintético **não** move o TanStack Router — use
  `navigate_page type=back` ou clique real.

O que **não** funciona, e por que três rodadas passaram em falso:

- ❌ Chrome não reproduz o comportamento do WebKit com manifest (Regra 1).
- ❌ Sem o plugin de rewrite, `preview` serve `index.html` em `/atendimento`.
- ❌ Push real exige aparelho: não há como cobrir entrega no Vitest.

**Teste de mutação é obrigatório em teste de contrato.** Um teste que lê arquivo e afirma
strings passa vazio com facilidade. Antes de confiar, quebre de propósito (remova um `id`, troque
uma constante) e confirme que ele falha.

---

## Testes que travam isso

| Arquivo                                                  | Trava                                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/features/pwa-atendimento/installContract.test.ts`   | documento próprio, identidade estática, ordem do `vercel.json`, ícones, separação dos escopos |
| `src/shared/lib/installPrompt.test.ts`                   | captura antes do mount, `preventDefault`, marcador de instalado por escopo                    |
| `src/features/pwa-atendimento/engine/iosBrowser.test.ts` | detecção de navegador iOS sobre user agents reais                                             |
| `supabase/functions/push-dispatch/recipient.test.ts`     | precedência `profiles` → `sellers` na resolução do destinatário                               |

---

## O app do vendedor (`/pwa`) — estado e o que fazer

Quem for continuar este app precisa saber de três coisas antes de escrever uma linha.

### 1. O login está quebrado em produção, para todo mundo

`src/features/external-seller-pwa/hooks/usePwaAuth.ts` é **auth mock**: chama
`sellersProvider.list()` **antes** de autenticar e casa vendedor por e-mail, aceitando qualquer
senha. Sob Supabase com RLS, uma sessão anônima recebe `[]` sem erro, o código cai no
`sellers.length === 0` e devolve `"Não foi possível entrar. Verifique o e-mail."`.

Não é senha errada — **ninguém entra**. É a mesma armadilha que já apareceu nos menus do CRM:
sob RLS, uma leitura anônima devolve lista vazia **sem levantar erro**, então o código
interpreta "não achei" quando o certo seria "não tenho permissão para olhar".

**O que fazer:** trocar por `signInWithPassword` do `@/features/auth/useAuth`, como o
`/atendimento` faz (`src/features/pwa-atendimento/pages/LoginPage.tsx` é o modelo pronto —
inclui 2FA e as mensagens de bloqueio por horário/suspensão). O app precisa disso de qualquer
forma: carteira e orçamentos vivem sob RLS.

### 2. O manifest dele está no documento do CRM inteiro

`index.html` declara `/manifest.webmanifest` (escopo `/pwa`) — e `index.html` é o documento de
**todas** as outras rotas: `/`, `/app`, `/loja`, `/portal`. Consequência: adicionar qualquer
página do CRM à tela de início oferece **"GALLO Vendedor"**.

**Recomendação:** dar a `/pwa` o próprio `pwa.html`, exatamente como foi feito para
`/atendimento` (Regra 1) — é o mesmo trio de mudanças: entrada no `rollupOptions.input`, rewrite
no `vercel.json` antes da catch-all, e o plugin de dev/preview. Depois disso, decidir o que
`index.html` deve declarar: ou um manifest do CRM, ou nenhum.

⚠️ Fazer isso **quebra o atalho já instalado** de quem tem o app do vendedor na tela de início?
Não — a URL `/pwa` continua a mesma. Mas se você mudar `start_url` ou `id`, o navegador passa a
tratar como app diferente e o atalho antigo vira órfão.

### 3. Ícone e identidade

Hoje o vendedor usa `/android-chrome-192x192.png` + `/apple-touch-icon.png`, que são os ícones
genéricos do CRM (o `apple-touch-icon` é praticamente branco). Se o app for pra valer, gere um
conjunto próprio — o `scripts/generate-pwa-icons.py` já faz tudo, basta parametrizar a arte e o
prefixo de saída.

### Checklist para deixar `/pwa` no mesmo padrão

- [ ] Login real com `signInWithPassword` (mata o mock e o "qualquer senha entra")
- [ ] `pwa.html` próprio + entrada no Vite + rewrite no `vercel.json` + plugin de dev/preview
- [ ] Conjunto de ícones próprio (`any` + `maskable` + `apple-touch-icon` opaco)
- [ ] Decidir o que `index.html` declara depois que os dois apps saírem de lá
- [ ] Estender `installContract.test.ts` para cobrir o terceiro documento
- [ ] Remover o banner "PWA em desenvolvimento — Fase 2" quando deixar de ser verdade

---

## Histórico — o que já foi tentado e por que falhou

Registrado para ninguém repetir:

| PR   | O que fez                                                    | Resultado                                                              |
| ---- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| #446 | Entregou o app; `usePwaManifest` trocava o manifest no mount | Tarde demais até para o Chrome — `beforeinstallprompt` nunca disparava |
| #456 | Script inline no `<head>` trocando por `pathname`            | Consertou o Chrome. **Não** conserta o iOS (Regra 1)                   |
| #460 | Ícone próprio, `any`/`maskable` separados, iOS incluído      | Correto, mas o manifest continuava sendo trocado por script            |
| #462 | Simetria das 4 tags no `usePwaManifest`                      | Bug real corrigido, mas ainda a causa errada                           |
| #463 | **Documento próprio** (`atendimento.html`) + rewrite         | Resolveu. Confirmado no iPhone do dono                                 |

A lição de método: **três correções foram validadas no Chrome e declaradas prontas**. O sinal
que finalmente apontou a causa foi o print do usuário — ícone certo com manifest errado. Quando
o comportamento depende do motor do navegador, medir num motor só não é verificação.

## Ver também

- `docs/dev/notification-push.md` — a cadeia de push, ponta a ponta
- `docs/dev/deploy-update-notification.md` — o motor de aviso de versão que este app reaproveita
- `docs/prds/PRD-145-push-web.md` — requisitos originais
