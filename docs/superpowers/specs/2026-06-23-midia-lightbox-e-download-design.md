# Spec — Lightbox que cabe na tela + download de mídias (conversa & painel)

**Data:** 2026-06-23
**Feature:** `src/features/conversations` (camada de mídia das conversas)
**Tipo:** Entrega 100% frontend (sem migration, sem RLS nova, sem RPC, sem redeploy de Edge)
**Status:** Design aprovado — pronto para plano de implementação

---

## 1. Problema / motivação

Dois incômodos reais no atendimento (relatados com prints pelo dono):

1. **A imagem ampliada estoura a tela.** Ao clicar numa imagem recebida no thread
   para ampliar, abre um dialog cuja `<img>` não tem trava de altura. Uma imagem
   em retrato (ex.: comprovante PIX) renderiza na largura inteira do dialog → fica
   altíssima → vaza topo e base da viewport, escondendo o botão de fechar e o
   restante do conteúdo.

2. **Não dá para baixar a maioria das mídias.** Só **documentos** têm botão de
   download hoje — e ainda assim via `<a download>`, que o navegador **ignora para
   URLs de outra origem** (a signed URL do Supabase é cross-origin), de modo que o
   arquivo normalmente **abre** numa aba em vez de salvar. **Imagens, áudios e
   vídeos não têm download em lugar nenhum** — nem no thread, nem no painel "Mídias".

**Regra de negócio desejada:** todo tipo de mídia (imagem, áudio, vídeo, documento)
pode ser **baixado de verdade** (salvar no dispositivo), tanto **diretamente na
conversa** quanto **pelo painel de gerenciamento de mídias**; e a imagem ampliada
**sempre cabe na tela**, com as ações (baixar/fechar) sempre acessíveis.

## 2. Causas-raiz (confirmadas no código)

| # | Arquivo | Linha | Observação |
|---|---|---|---|
| Overflow | `src/features/conversations/components/bubbles/ImageBubble.tsx` | 71–78 | Dialog próprio: `DialogContent className="max-w-3xl p-0"` + `<img className="w-full" />` — **sem `max-h`**. É o que vaza. |
| Já OK (painel) | `src/features/conversations/components/media/MediaViewerDialog.tsx` | 49–52 | Já usa `max-h-[80vh] … object-contain`; será **promovido** a lightbox compartilhado. |
| Download doc (thread) | `src/features/conversations/components/bubbles/DocumentBubble.tsx` | 34–46 | `<a href={url} target="_blank" download>` — cross-origin ⇒ abre, não baixa. |
| Download doc (painel) | `src/features/conversations/components/media/MediaThumb.tsx` | 49–67 | Mesmo padrão `<a download>` — mesma limitação cross-origin. |

**Roteamento de balões** (`MessageBubble.tsx`): `image`/`sticker` → `ImageBubble`;
`audio` → `AudioBubble`; `document`/`video` → `DocumentBubble`. Ou seja, **vídeo no
thread é arquivo baixável** (sem player inline) — só o **painel** tem player de vídeo
(no `MediaViewerDialog`). Isso fecha o escopo sem buracos.

## 3. Decisões tomadas (Q&A)

| Decisão | Escolha |
|---|---|
| **Acesso ao download** | "Visualizador + ícone no hover": botão **Baixar** sempre visível na barra do lightbox; nas miniaturas (thread e painel) um ícone de download que aparece no **hover** (e em `focus-visible`, p/ teclado). |
| **Mecanismo de download** | **Download real** ("salvar no dispositivo") anexando `&download=<nome>` à signed URL já resolvida → Supabase responde `Content-Disposition: attachment`. URL externa/mock degrada para abrir. |
| **Arquitetura do visualizador** | **Unificar**: promover `MediaViewerDialog` a lightbox compartilhado e fazer o `ImageBubble` usá-lo (via mapper puro). Um só lugar para o fit-na-tela e o download. |
| **Camada de signing/cache** | **Não tocar** (congelada). O helper de download só consome a `url` string já resolvida pelos hooks existentes. |
| **Bulk download** | **Fora de escopo** (YAGNI). Sem "baixar tudo"/zip. |

> ⚠️ **Fronteira congelada (memória do projeto):** é proibido alterar
> `useResolvedMediaUrl`, `useSeedSignedMediaUrls`, `resolveMediaUrl(s)`, as query
> keys `["message-media-url", ref]`, `partitionMediaRefs`, RPCs ou a Edge. Esta
> entrega **apenas consome** a URL já assinada. Nenhum arquivo dessa camada é tocado.

## 4. Estrutura de código (unidades)

### 4.1 Helper de download (puro, novo) — `src/features/conversations/utils/mediaDownload.ts`

Fonte única da verdade para "baixar de verdade". Sem dependência de React.

```ts
/**
 * Append Supabase Storage's `download` query param to an already-resolved URL so
 * the object endpoint answers with `Content-Disposition: attachment`. This is the
 * only reliable way to force a real save for a CROSS-ORIGIN signed URL — the HTML
 * `download` attribute is ignored across origins. For non-Supabase/absolute (mock)
 * URLs the param is harmless; the browser may still just open the file.
 *
 * Operates purely on the resolved URL string — it never re-signs or touches the
 * (frozen) media-resolution layer.
 */
export function buildDownloadHref(url: string, fileName: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("download", fileName);
    return u.toString();
  } catch {
    return url; // not a parseable absolute URL → use as-is
  }
}

/** Programmatic anchor click that forces a download with the chosen file name. */
export function triggerMediaDownload(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = buildDownloadHref(url, fileName);
  a.download = fileName; // same-origin hint; cross-origin relies on the param above
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
```

`downloadFileName` deriva um nome amigável por tipo. Mantém o nome real quando há um
(documento) e sintetiza um nome estável caso contrário (a partir de um sufixo curto
do id, **sem** `Math.random()`, para ser determinístico/testável):

```ts
import type { MessageMediaType } from "@/shared/types";

const EXT_BY_TYPE: Record<Exclude<MessageMediaType, "document">, string> = {
  image: "jpg",
  sticker: "webp",
  audio: "ogg",
  video: "mp4",
};

/** Sanitize a caption/name into a safe-ish file base (no path separators). */
export function sanitizeFileBase(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
    || "midia";
}

/**
 * Friendly download file name for a media item. `existingName` (a real document
 * file name, when known) wins; otherwise synthesize `<kind>-<idSuffix>.<ext>`.
 */
export function downloadFileName(opts: {
  mediaType: MessageMediaType | undefined;
  id: string;
  caption?: string | null;
  existingName?: string | null;
}): string {
  if (opts.existingName && opts.existingName.trim()) {
    return sanitizeFileBase(opts.existingName.replace(/\.[a-z0-9]+$/i, ""))
      + (opts.existingName.match(/\.[a-z0-9]+$/i)?.[0] ?? "");
  }
  const idSuffix = opts.id.replace(/[^a-z0-9]/gi, "").slice(-6) || "arquivo";
  const type = opts.mediaType;
  if (!type || type === "document") {
    const base = opts.caption ? sanitizeFileBase(opts.caption) : `documento-${idSuffix}`;
    return base.includes(".") ? base : `${base}.pdf`;
  }
  const ext = EXT_BY_TYPE[type];
  const base = opts.caption ? sanitizeFileBase(opts.caption) : `${type}-${idSuffix}`;
  return `${base}.${ext}`;
}
```

> Decisão de extensão: o MVP usa um mapa fixo por `mediaType` (não temos o MIME real
> no `IMessage`). Documento sem nome cai em `.pdf` (extensão mais comum no uso real;
> o conteúdo manda, a extensão é só sugestão ao SO). Aceitável e simples.

### 4.2 Mapper — **já existe**, só reaproveitar

`messageToMediaItem(message: IMessage): IConversationMediaItem | null` **já existe** em
`src/features/conversations/engine/conversationMedia.ts` (linha 44) e faz exatamente o
que precisamos: mapeia `sticker → image`, exige `mediaType` + `mediaUrl`, e devolve o
item completo (`id`, `conversationId`, `kind`, `mediaUrl`, `caption?`, `authorType`,
`direction`, `sentAt`). **Nenhum arquivo novo**: o `ImageBubble` apenas importa e usa.

### 4.3 Lightbox compartilhado (refactor) — `MediaViewerDialog.tsx`

Vira o **único** visualizador ampliado. Mudanças:

- **Fit-na-tela:** a mídia usa
  `max-h-[90dvh] max-w-[95vw] w-auto h-auto object-contain mx-auto` (troca o `w-full`
  por dimensões automáticas com teto de viewport; `dvh` para não brigar com a barra
  do navegador no mobile). O `DialogContent` ganha `max-w-[96vw]` e `max-h-[95dvh]`.
- **Barra de ações (toolbar):** topo fino com nome do arquivo (truncado, à esquerda)
  e, à direita, **Baixar** (botão com destaque) + **Fechar**. Fundo
  `bg-background/80 backdrop-blur`, tokens semânticos, alvos de toque ≥ 40px.
  (O `DialogContent` do shadcn já traz um X nativo — vamos suprimir/duplicar com
  cuidado: ou escondemos o X default via `[&>button]:hidden` e usamos o nosso, ou
  mantemos só o nativo e adicionamos só o Baixar. **Decisão:** esconder o X default
  e prover toolbar própria, para alinhar Baixar + Fechar no mesmo eixo.)
- **Download** chama `triggerMediaDownload(url, name)` onde `name` é computado do
  próprio item: `downloadFileName({ mediaType: item.kind, id: item.id, caption:
  item.caption, existingName: item.kind === "document" ? fileNameFromUrl(item.mediaUrl)
  : undefined })`. (Sem prop extra — o item já carrega o necessário.) Nota: documentos
  não abrem o lightbox; o ramo `existingName` fica como salvaguarda.
- Estados loading/erro/legenda preservados.

### 4.4 Balões do thread

- **`ImageBubble`** — remove o Dialog ad-hoc; passa a abrir o lightbox compartilhado
  via `messageToMediaItem(message)`. Acrescenta a **seta de download no hover** sobre
  a miniatura (botão absoluto top-right, `opacity-0 group-hover:opacity-100
  focus-visible:opacity-100`, `transition-opacity`), que dispara o download sem abrir
  o viewer. Some quando `!url`.
- **`AudioBubble`** — botão de download (ícone) na linha do player (`RealAudioPlayer`),
  visível quando há `url`. Não aparece no modo demo (sem arquivo real).
- **`DocumentBubble`** — troca o `<a download>` por um `<Button onClick>` que chama
  `triggerMediaDownload` (download real). Mantém posição e ícone `mdi:download`.

### 4.5 Painel "Mídias"

- **`MediaThumb` (image/video)** — seta de download no hover (mesmo padrão do thread),
  além do clique que abre o lightbox.
- **`MediaThumb` (document)** — troca o `<a download>` por `triggerMediaDownload`
  (mantém o tile clicável; download real).
- **`AudioMediaTile`** — botão de download (quando há `url` real).
- **`MediaViewerDialog`** (aberto pelas miniaturas) — já ganha o Baixar na toolbar (4.3).

### 4.6 i18n (pt-BR) — `src/features/conversations/i18n/pt-BR.ts`

`CONVERSATION_STRINGS` já tem `download: "Baixar"`. Acrescentar:

```
close: "Fechar",
downloadImage: "Baixar imagem",
downloadAudio: "Baixar áudio",
downloadVideo: "Baixar vídeo",
downloadDocument: "Baixar documento",
downloadFailed: "Não foi possível baixar o arquivo.",
```

(aria-labels por tipo; o `downloadFailed` só é usado se adotarmos o toast de erro —
ver §6.)

## 5. UX (resumo, com o especialista ui-ux-pro-max aplicado)

- **Fit garantido** com `object-contain` + `max-h-[90dvh]`/`max-w-[95vw]`; `dvh`
  (não `vh`) por causa da barra do navegador mobile.
- **Affordance de download discreta**: hover/`focus-visible` nas miniaturas (não
  polui), sempre-visível no lightbox e nos balões de áudio/documento.
- **Cor nunca é o único sinal**: sempre ícone + `aria-label`/tooltip.
- **Touch targets** ≥ 40px nos botões da toolbar; `cursor-pointer` (via `Button`).
- **`prefers-reduced-motion`**: as transições são só `opacity` (leves), sem zoom
  agressivo.
- **Microcopy**: "Baixar", "Fechar", aria por tipo. Sem emoji como ícone (Iconify
  `mdi:*`, consistente com o resto).

## 6. Erros / estados

- Sem `url` resolvida (mídia indisponível/expirada) → **oculta** o botão de download
  (igual aos balões hoje). No lightbox, mantém o estado "Mídia indisponível".
- O caminho de download é fire-and-forget (anchor). Se a signed URL expirou no
  servidor, o resultado é o mesmo de hoje (o navegador recebe erro). **Decisão:**
  não introduzir `fetch`→blob (peso/memória em vídeos) no MVP; o toast `downloadFailed`
  fica **disponível** mas só será disparado se a implementação detectar falha trivial
  (ex.: `url` nula no clique). Sem promessa de captura de erro de rede.

## 7. Testes (Vitest, `environment: "node"`)

Somente engines/utils puros (o projeto não tem jsdom/testing-library):

- `mediaDownload.test.ts`:
  - `buildDownloadHref` anexa `&download=<nome>` a uma signed URL com query existente
    (preserva `token`); é idempotente; devolve string original para input não-URL.
  - `sanitizeFileBase` remove separadores/acentos perigosos, limita tamanho, faz
    fallback "midia".
  - `downloadFileName`: documento com nome real preserva extensão; imagem sem caption
    vira `image-<id6>.jpg`; áudio vira `.ogg`; documento sem nome vira `.pdf`; caption
    é sanitizada.

(`messageToMediaItem` já existe e não é tocado — sem teste novo para ele.)

Verificação de UI: **manual** pelo dono + `bun run build` + `bun run test`
(padrão das entregas anteriores).

## 8. Não-objetivos (escopo fechado)

- **Não** alterar a camada de signing/cache/realtime/RPC/Edge (congelada).
- **Sem** "baixar tudo"/zip, sem seleção múltipla no painel.
- **Sem** player de vídeo inline no thread (vídeo segue como `DocumentBubble`).
- **Sem** nova dependência (respeita o guard de 24h do bunfig) — nada de lib de
  lightbox.
- **Sem** migration, RLS, RPC ou Edge.

## 9. Riscos / observações

- **`&download=` em signed URL do Supabase:** o token é validado pelo param `token`;
  `download` é lido em separado para o `Content-Disposition`. Anexar o param **não**
  invalida a assinatura. Para URLs externas (seed/mock) o param é inócuo e o arquivo
  pode apenas abrir — aceitável (mock em fim de vida).
- **X nativo do `DialogContent`:** ao prover toolbar própria, esconder o X default
  (`[&>button]:hidden` no `DialogContent`) para não duplicar o "Fechar". Garantir que
  `Esc`/click-fora continuam fechando (comportamento padrão do Radix).
- **Reuso de cache:** quando o `ImageBubble` delega ao lightbox, ambos resolvem a
  mesma `mediaUrl` → mesma query key → **cache hit** (sem re-signing).
- **Mapper reaproveitado:** `messageToMediaItem` já existe e está testado; o
  `IConversationMediaItem` tem `id, conversationId, kind, mediaUrl, caption?,
  authorType, direction, sentAt` (forma confirmada em `conversationMedia.ts`).
- **`downloadFileName` × `item.kind`:** `ConversationMediaKind` é subconjunto de
  `MessageMediaType` (sem `sticker`), então `item.kind` é atribuível a `mediaType`
  sem cast.
