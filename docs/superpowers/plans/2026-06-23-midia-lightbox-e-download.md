# Lightbox que cabe na tela + download de mídias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a imagem ampliada sempre caber na tela e permitir o download real (salvar no dispositivo) de imagem/áudio/vídeo/documento, tanto na conversa quanto no painel "Mídias".

**Architecture:** Entrega 100% frontend. Um helper puro (`mediaDownload.ts`) força o download via parâmetro `&download=` na signed URL já resolvida; o `MediaViewerDialog` vira o lightbox compartilhado (fit-na-tela + barra de ações) e o `ImageBubble` passa a usá-lo via o `messageToMediaItem` que já existe. As superfícies de download (balões e tiles) consomem o mesmo helper.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4, shadcn/ui (Radix Dialog), Iconify (`mdi:*`), Vitest (env `node`).

## Global Constraints

- **Frontend-only:** sem migration, RLS, RPC ou Edge. Nenhuma mudança de backend.
- **Camada congelada — NÃO TOCAR:** `useResolvedMediaUrl`, `useSeedSignedMediaUrls`, `resolveMediaUrl(s)`, query key `["message-media-url", ref]`, `partitionMediaRefs`, RPCs, Edge. Só **consumir** a `url` string já resolvida.
- **Sem nova dependência** (guard de 24h do bunfig). Nada de biblioteca de lightbox.
- **Tokens semânticos** Tailwind/shadcn (`bg-background`, `text-muted-foreground`, `border-border`, `bg-muted`, `text-foreground`…). Nunca hex ou `--gallo-*` direto.
- **UI em pt-BR com acentos corretos** (UTF-8). Strings de UI em `i18n/pt-BR.ts`.
- **Código em inglês** (nomes, comentários). Commits em Conventional Commits (inglês).
- **Sem testes de componente:** Vitest roda em `environment: "node"` (sem jsdom/testing-library). Só engines/utils puros são testados. UI é verificada por `bun run build` + `bun run test` (suíte verde) + teste manual do dono.
- **Mock degrada com elegância:** quando não há `url` resolvida, o botão de download é **ocultado** (não há toast de erro).
- **Ícone de download:** `mdi:download` (consistente com o resto do app).

---

### Task 1: Helper de download (puro) + testes

**Files:**
- Create: `src/features/conversations/utils/mediaDownload.ts`
- Test: `src/features/conversations/utils/mediaDownload.test.ts`

**Interfaces:**
- Consumes: `MessageMediaType` de `@/shared/types` (valores: `"image" | "audio" | "video" | "document" | "sticker"`).
- Produces:
  - `buildDownloadHref(url: string, fileName: string): string`
  - `sanitizeFileBase(raw: string): string`
  - `downloadFileName(opts: { mediaType: MessageMediaType | undefined; id: string; caption?: string | null; existingName?: string | null }): string`
  - `triggerMediaDownload(url: string, fileName: string): void`

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/utils/mediaDownload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDownloadHref, sanitizeFileBase, downloadFileName } from "./mediaDownload";

describe("buildDownloadHref", () => {
  it("appends the download param while preserving the existing token query", () => {
    const signed =
      "https://x.supabase.co/storage/v1/object/sign/whatsapp-media/a/b.jpg?token=abc";
    const out = buildDownloadHref(signed, "foto.jpg");
    const u = new URL(out);
    expect(u.searchParams.get("token")).toBe("abc");
    expect(u.searchParams.get("download")).toBe("foto.jpg");
  });

  it("is idempotent on the download param", () => {
    const once = buildDownloadHref("https://x.co/a?token=t", "f.pdf");
    const twice = buildDownloadHref(once, "f.pdf");
    expect(twice).toBe(once);
  });

  it("returns non-URL input unchanged", () => {
    expect(buildDownloadHref("not a url", "f.pdf")).toBe("not a url");
  });
});

describe("sanitizeFileBase", () => {
  it("strips path separators and unsafe characters", () => {
    expect(sanitizeFileBase("a/b\\c:*?<>|.txt")).toBe("abc.txt");
  });
  it("collapses whitespace into single dashes", () => {
    expect(sanitizeFileBase("  nota   fiscal  ")).toBe("nota-fiscal");
  });
  it("falls back to 'midia' when empty after cleaning", () => {
    expect(sanitizeFileBase("///")).toBe("midia");
  });
  it("caps the length at 60 characters", () => {
    expect(sanitizeFileBase("a".repeat(100)).length).toBe(60);
  });
});

describe("downloadFileName", () => {
  it("keeps a real document name and its extension", () => {
    expect(
      downloadFileName({ mediaType: "document", id: "m1", existingName: "Nota Fiscal.pdf" }),
    ).toBe("Nota-Fiscal.pdf");
  });
  it("synthesizes an image name from the id suffix when there is no caption", () => {
    expect(downloadFileName({ mediaType: "image", id: "msg-ABC123" })).toBe("image-ABC123.jpg");
  });
  it("uses the caption as the base when present", () => {
    expect(downloadFileName({ mediaType: "image", id: "m1", caption: "comprovante pix" })).toBe(
      "comprovante-pix.jpg",
    );
  });
  it("maps audio to .ogg and video to .mp4", () => {
    expect(downloadFileName({ mediaType: "audio", id: "aaaaaa" })).toBe("audio-aaaaaa.ogg");
    expect(downloadFileName({ mediaType: "video", id: "bbbbbb" })).toBe("video-bbbbbb.mp4");
  });
  it("defaults a document with no name to .pdf", () => {
    expect(downloadFileName({ mediaType: "document", id: "cccccc" })).toBe("documento-cccccc.pdf");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/conversations/utils/mediaDownload.test.ts`
Expected: FAIL — `Failed to resolve import "./mediaDownload"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/features/conversations/utils/mediaDownload.ts`:

```ts
import type { MessageMediaType } from "@/shared/types";

/** Extension synthesized per non-document media type (we lack the real MIME). */
const EXT_BY_TYPE: Record<Exclude<MessageMediaType, "document">, string> = {
  image: "jpg",
  sticker: "webp",
  audio: "ogg",
  video: "mp4",
};

/**
 * Append Supabase Storage's `download` query param to an already-resolved URL so
 * the object endpoint answers with `Content-Disposition: attachment`. The HTML
 * `download` attribute is ignored for cross-origin URLs (our signed URLs are
 * cross-origin), so this param is the only reliable way to force a real save.
 * Pure string work on the resolved URL — it never re-signs or touches the
 * (frozen) media-resolution layer. Non-URL input is returned unchanged.
 */
export function buildDownloadHref(url: string, fileName: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("download", fileName);
    return u.toString();
  } catch {
    return url;
  }
}

/** Sanitize a caption/name into a safe file base (no separators, capped at 60). */
export function sanitizeFileBase(raw: string): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned || "midia";
}

/**
 * Friendly download file name for a media item. A real existing name (a document
 * file name, when known) wins and keeps its extension; otherwise synthesize
 * `<base>.<ext>` from the caption or a stable id suffix (deterministic — no
 * Math.random, so it is testable).
 */
export function downloadFileName(opts: {
  mediaType: MessageMediaType | undefined;
  id: string;
  caption?: string | null;
  existingName?: string | null;
}): string {
  const existing = opts.existingName?.trim();
  if (existing) {
    const ext = existing.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
    return sanitizeFileBase(existing.replace(/\.[a-z0-9]+$/i, "")) + ext;
  }
  const idSuffix = opts.id.replace(/[^a-z0-9]/gi, "").slice(-6) || "arquivo";
  const caption = opts.caption?.trim();
  const type = opts.mediaType;
  if (!type || type === "document") {
    const base = caption ? sanitizeFileBase(caption) : `documento-${idSuffix}`;
    return /\.[a-z0-9]+$/i.test(base) ? base : `${base}.pdf`;
  }
  const ext = EXT_BY_TYPE[type];
  const base = caption ? sanitizeFileBase(caption) : `${type}-${idSuffix}`;
  return `${base}.${ext}`;
}

/**
 * Programmatic anchor click that forces a download with the chosen file name.
 * Browser-only (uses `document`); never called from tests.
 */
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/conversations/utils/mediaDownload.test.ts`
Expected: PASS (15 assertions across 3 describes).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/utils/mediaDownload.ts src/features/conversations/utils/mediaDownload.test.ts
git commit -m "feat(conversations): add media download helper"
```

---

### Task 2: Strings i18n (Baixar/Fechar por tipo)

**Files:**
- Modify: `src/features/conversations/i18n/pt-BR.ts` (objeto `CONVERSATION_STRINGS`, logo após `download: "Baixar",` na linha ~260)

**Interfaces:**
- Produces (em `CONVERSATION_STRINGS`): `close`, `downloadImage`, `downloadAudio`, `downloadVideo`, `downloadDocument` (strings pt-BR).

- [ ] **Step 1: Adicionar as strings**

Em `src/features/conversations/i18n/pt-BR.ts`, localize a linha `download: "Baixar",` (dentro de `CONVERSATION_STRINGS`) e troque por:

```ts
  download: "Baixar",
  close: "Fechar",
  downloadImage: "Baixar imagem",
  downloadAudio: "Baixar áudio",
  downloadVideo: "Baixar vídeo",
  downloadDocument: "Baixar documento",
```

(Não remover nem reordenar outras chaves; apenas inserir as 5 novas após `download`.)

- [ ] **Step 2: Verificar o build**

Run: `bun run build`
Expected: build conclui sem erro (transpila o `i18n/pt-BR.ts` atualizado).

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/i18n/pt-BR.ts
git commit -m "feat(conversations): add download/close i18n strings"
```

---

### Task 3: Lightbox compartilhado — fit-na-tela + barra de ações (`MediaViewerDialog`)

**Files:**
- Modify (reescrever): `src/features/conversations/components/media/MediaViewerDialog.tsx`

**Interfaces:**
- Consumes: `triggerMediaDownload`, `downloadFileName` (Task 1); `CONVERSATION_STRINGS.{download,close,downloadImage,downloadAudio,downloadVideo,downloadDocument}` (Task 2); `fileNameFromUrl` de `../../utils/messageDisplay`; `useResolvedMediaUrl`; tipo `IConversationMediaItem` de `../../engine/conversationMedia` (campos: `id, conversationId, kind, mediaUrl, caption?, authorType, direction, sentAt`).
- Produces: `MediaViewerDialog({ item: IConversationMediaItem | null; onClose: () => void })` — **API pública inalterada** (mesmas props), agora com toolbar (nome do arquivo · Baixar · Fechar) e mídia contida na viewport.

**Contexto:** o `DialogContent` do shadcn já renderiza um botão de fechar nativo (`<DialogPrimitive.Close>`) como **último filho direto**. Vamos escondê-lo com `[&>button]:hidden` no `className` do `DialogContent` (a classe só atinge filhos diretos — os botões da toolbar ficam aninhados, então não são afetados) e prover Baixar+Fechar na nossa barra. `Esc` e clique-fora continuam fechando (Radix via `onOpenChange`).

- [ ] **Step 1: Reescrever o componente**

Substitua **todo** o conteúdo de `src/features/conversations/components/media/MediaViewerDialog.tsx` por:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { fileNameFromUrl } from "../../utils/messageDisplay";
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import type { ConversationMediaKind, IConversationMediaItem } from "../../engine/conversationMedia";

const DOWNLOAD_LABEL: Record<ConversationMediaKind, string> = {
  image: CONVERSATION_STRINGS.downloadImage,
  video: CONVERSATION_STRINGS.downloadVideo,
  audio: CONVERSATION_STRINGS.downloadAudio,
  document: CONVERSATION_STRINGS.downloadDocument,
};

/** Enlarged viewer for an image/video/audio media item (documents download directly). */
export function MediaViewerDialog({
  item,
  onClose,
}: {
  item: IConversationMediaItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95dvh] max-w-[96vw] overflow-hidden p-0 [&>button]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Visualizar mídia</DialogTitle>
        </DialogHeader>
        {item && <ViewerBody item={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ item, onClose }: { item: IConversationMediaItem; onClose: () => void }) {
  const { data: url, isLoading } = useResolvedMediaUrl(item.mediaUrl);
  const name = downloadFileName({
    mediaType: item.kind,
    id: item.id,
    caption: item.caption,
    existingName: item.kind === "document" ? fileNameFromUrl(item.mediaUrl) : undefined,
  });

  function handleDownload() {
    if (!url) return;
    triggerMediaDownload(url, name);
  }

  return (
    <div className="flex max-h-[95dvh] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
        <span className="min-w-0 truncate text-xs text-muted-foreground">{name}</span>
        <div className="flex shrink-0 items-center gap-1">
          {url && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 px-2.5"
              onClick={handleDownload}
              aria-label={DOWNLOAD_LABEL[item.kind]}
            >
              <Icon icon="mdi:download" size={16} />
              {CONVERSATION_STRINGS.download}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
            aria-label={CONVERSATION_STRINGS.close}
          >
            <Icon icon="mdi:close" size={18} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-72 items-center justify-center text-muted-foreground">
            <Icon icon="mdi:loading" className="mr-2 animate-spin" size={20} />
            Carregando…
          </div>
        ) : !url ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Icon icon="mdi:image-broken-variant" size={28} />
            <span className="text-sm">Mídia indisponível</span>
          </div>
        ) : (
          <>
            {item.kind === "image" && (
              <img
                src={url}
                alt={item.caption || "Imagem"}
                className="mx-auto max-h-[80dvh] w-auto max-w-full object-contain"
              />
            )}
            {item.kind === "video" && (
              <video
                src={url}
                controls
                autoPlay
                className="mx-auto max-h-[80dvh] w-auto max-w-full bg-black"
              />
            )}
            {item.kind === "audio" && (
              <div className="flex flex-col gap-3 p-6">
                <audio src={url} controls autoPlay className="w-full" />
              </div>
            )}
            {item.caption && item.kind !== "audio" && (
              <p className="border-t border-border bg-card px-4 py-2 text-sm text-foreground">
                {item.caption}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build + suíte**

Run: `bun run build && bun run test`
Expected: build OK; suíte verde (nenhum teste de componente foi adicionado/removido — apenas confirma que nada quebrou).

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/media/MediaViewerDialog.tsx
git commit -m "feat(conversations): fit media viewer to viewport and add download toolbar"
```

---

### Task 4: `ImageBubble` usa o lightbox compartilhado + download no hover

**Files:**
- Modify: `src/features/conversations/components/bubbles/ImageBubble.tsx`

**Interfaces:**
- Consumes: `MediaViewerDialog` (Task 3); `messageToMediaItem` de `../../engine/conversationMedia` (já existe — `(message: IMessage) => IConversationMediaItem | null`); `downloadFileName`, `triggerMediaDownload` (Task 1); `CONVERSATION_STRINGS.downloadImage` (Task 2).

**Contexto:** o `ImageBubble` hoje abre um `Dialog` próprio sem trava de altura (a causa do overflow). Vamos remover esse dialog e abrir o `MediaViewerDialog`. A miniatura é um `<button>`; o botão de download **não pode** ser aninhado nele (HTML inválido) — então envolvemos a miniatura num `div.group.relative` e colocamos o download como **irmão** (absoluto), revelado no hover/foco.

- [ ] **Step 1: Reescrever o componente**

Substitua **todo** o conteúdo de `src/features/conversations/components/bubbles/ImageBubble.tsx` por:

```tsx
import { useEffect, useState } from "react";
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { BubbleChrome } from "./bubbleChrome";
import { WhatsAppText } from "./WhatsAppText";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { messageToMediaItem } from "../../engine/conversationMedia";
import { MediaViewerDialog } from "../media/MediaViewerDialog";
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

export function ImageBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  // Inbound images are private storage paths; resolve to a signed URL on demand.
  const { data: url, isLoading } = useResolvedMediaUrl(message.mediaUrl);

  // A freshly resolved URL (cache refresh / re-sign) must re-arm the <img>:
  // clear the previous load/error so it retries instead of staying stuck.
  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [url]);

  // No ref at all, the ref resolved to nothing (failed download / forbidden),
  // or the <img> itself failed to load (e.g. an expired/absent object).
  if (!message.mediaUrl || (!isLoading && !url) || errored) {
    return (
      <BubbleChrome message={message} onRetry={onRetry}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon icon="mdi:image-broken" size={16} />
          <span className="text-xs">Imagem indisponível</span>
        </div>
      </BubbleChrome>
    );
  }

  function handleDownload() {
    if (!url) return;
    triggerMediaDownload(
      url,
      downloadFileName({ mediaType: message.mediaType, id: message.id, caption: message.text }),
    );
  }

  return (
    <>
      <BubbleChrome message={message} onRetry={onRetry} unpadded>
        <div className="group relative w-full">
          <button
            type="button"
            onClick={() => url && setOpen(true)}
            className="block w-full overflow-hidden text-left"
            aria-label="Abrir imagem em tamanho maior"
          >
            <div className="relative aspect-[4/3] w-[260px] max-w-full bg-muted">
              {(!loaded || !url) && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <Icon icon="mdi:loading" className="animate-spin" size={20} />
                </div>
              )}
              {url && (
                <img
                  src={url}
                  alt={message.text || "Foto enviada"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onLoad={() => setLoaded(true)}
                  onError={() => setErrored(true)}
                />
              )}
            </div>
          </button>
          {url && (
            <button
              type="button"
              onClick={handleDownload}
              aria-label={CONVERSATION_STRINGS.downloadImage}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
            >
              <Icon icon="mdi:download" size={16} />
            </button>
          )}
        </div>
        {message.text && (
          <WhatsAppText
            text={message.text}
            className="whitespace-pre-wrap break-words px-3 py-2 text-sm"
          />
        )}
      </BubbleChrome>

      <MediaViewerDialog
        item={open ? messageToMediaItem(message) : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 2: Verificar build + suíte**

Run: `bun run build && bun run test`
Expected: build OK (imports de `Dialog*` removidos não deixam referência pendente); suíte verde.

- [ ] **Step 3: Verificação manual (anotar para o dono)**

No app (dados `supabase`), abrir uma conversa com imagem em retrato (ex.: comprovante), clicar para ampliar: a imagem deve **caber na tela**, com Baixar/Fechar visíveis; passar o mouse na miniatura deve revelar a seta de download. (Sem automação — gate manual do dono, conforme norma do projeto.)

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/bubbles/ImageBubble.tsx
git commit -m "feat(conversations): open shared lightbox from image bubble with hover download"
```

---

### Task 5: Download nos balões de áudio e documento (thread)

**Files:**
- Modify: `src/features/conversations/components/bubbles/AudioBubble.tsx` (função `RealAudioPlayer`, linha do controles ~240)
- Modify: `src/features/conversations/components/bubbles/DocumentBubble.tsx` (botão de download, linhas ~34–46)

**Interfaces:**
- Consumes: `downloadFileName`, `triggerMediaDownload` (Task 1); `CONVERSATION_STRINGS.{download,downloadAudio}` (Task 2); `fileNameFromUrl` (já importado no DocumentBubble).

**Contexto AudioBubble:** dentro de `RealAudioPlayer` estão em escopo `url: string` e `message: IMessage`. A linha de controles é `<div className="flex items-center gap-2.5">` contendo `PlayPauseButton`, `WaveBars`, a duração e `PlaybackRateChip`. Adicionar o botão de download como **último** filho dessa linha.

**Contexto DocumentBubble:** já existe um botão de download via `<a download>` (cross-origin ⇒ apenas abre). Trocar por um `<Button onClick>` que chama `triggerMediaDownload` (download real). `fileName` já é computado na linha 20.

- [ ] **Step 1: AudioBubble — adicionar imports**

No topo de `src/features/conversations/components/bubbles/AudioBubble.tsx`, após a linha
`import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";`, adicione:

```tsx
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";
```

- [ ] **Step 2: AudioBubble — inserir o botão na linha de controles**

Em `RealAudioPlayer`, localize o bloco da linha de controles:

```tsx
      <div className="flex items-center gap-2.5">
        <PlayPauseButton playing={playing} onClick={toggle} heard={heard} />
        <WaveBars bars={bars} playedRatio={playedRatio} onSeek={seek} />
        <span className="shrink-0 min-w-[34px] text-right text-[11px] font-medium leading-none text-muted-foreground tabular-nums">
          {formatDuration(playing || current > 0 ? current : effDuration)}
        </span>
        <PlaybackRateChip rate={rate} onCycle={cycleRate} />
      </div>
```

e troque-o por (acrescenta o botão de download ao final):

```tsx
      <div className="flex items-center gap-2.5">
        <PlayPauseButton playing={playing} onClick={toggle} heard={heard} />
        <WaveBars bars={bars} playedRatio={playedRatio} onSeek={seek} />
        <span className="shrink-0 min-w-[34px] text-right text-[11px] font-medium leading-none text-muted-foreground tabular-nums">
          {formatDuration(playing || current > 0 ? current : effDuration)}
        </span>
        <PlaybackRateChip rate={rate} onCycle={cycleRate} />
        <button
          type="button"
          onClick={() =>
            triggerMediaDownload(
              url,
              downloadFileName({ mediaType: message.mediaType, id: message.id, caption: message.text }),
            )
          }
          aria-label={CONVERSATION_STRINGS.downloadAudio}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon icon="mdi:download" size={15} />
        </button>
      </div>
```

(`CONVERSATION_STRINGS` e `Icon` já estão importados no arquivo.)

- [ ] **Step 3: DocumentBubble — adicionar imports**

No topo de `src/features/conversations/components/bubbles/DocumentBubble.tsx`, após
`import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";`, adicione:

```tsx
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";
```

- [ ] **Step 4: DocumentBubble — trocar o `<a download>` por download real**

Localize:

```tsx
        {url && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label={CONVERSATION_STRINGS.download}
          >
            <a href={url} target="_blank" rel="noreferrer" download>
              <Icon icon="mdi:download" size={16} />
            </a>
          </Button>
        )}
```

e troque por:

```tsx
        {url && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label={CONVERSATION_STRINGS.download}
            onClick={() =>
              triggerMediaDownload(
                url,
                downloadFileName({
                  mediaType: message.mediaType,
                  id: message.id,
                  caption: message.text,
                  existingName: fileName,
                }),
              )
            }
          >
            <Icon icon="mdi:download" size={16} />
          </Button>
        )}
```

- [ ] **Step 5: Verificar build + suíte**

Run: `bun run build && bun run test`
Expected: build OK; suíte verde.

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/components/bubbles/AudioBubble.tsx src/features/conversations/components/bubbles/DocumentBubble.tsx
git commit -m "feat(conversations): add real download to audio and document bubbles"
```

---

### Task 6: Download no painel "Mídias" (`MediaThumb` + `AudioMediaTile`)

**Files:**
- Modify: `src/features/conversations/components/media/MediaThumb.tsx`
- Modify: `src/features/conversations/components/media/AudioMediaTile.tsx`

**Interfaces:**
- Consumes: `downloadFileName`, `triggerMediaDownload` (Task 1); `CONVERSATION_STRINGS.{downloadImage,downloadVideo,downloadAudio}` (Task 2); `fileNameFromUrl` de `../../utils/messageDisplay`.

**Contexto MediaThumb:** o tile de documento é hoje um `<a download>` (cross-origin ⇒ apenas abre) — vira `<button>` com download real. O tile de imagem/vídeo é um `<button onClick={onOpen}>` — para acrescentar o download no hover sem aninhar `<button>` em `<button>`, o frame vira um `<div>` com dois botões irmãos (abrir = absolute inset-0; baixar = absolute canto, revelado no hover/foco).

- [ ] **Step 1: MediaThumb — reescrever**

Substitua **todo** o conteúdo de `src/features/conversations/components/media/MediaThumb.tsx` por:

```tsx
import { Icon } from "@/components/Icon";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { fileNameFromUrl } from "../../utils/messageDisplay";
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { AudioMediaTile } from "./AudioMediaTile";
import type { ConversationMediaKind, IConversationMediaItem } from "../../engine/conversationMedia";

const KIND_ICON: Record<ConversationMediaKind, string> = {
  image: "mdi:image-outline",
  audio: "mdi:waveform",
  video: "mdi:play-circle-outline",
  document: "mdi:file-document-outline",
};

const KIND_LABEL: Record<ConversationMediaKind, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
};

const DOWNLOAD_LABEL: Record<"image" | "video", string> = {
  image: CONVERSATION_STRINGS.downloadImage,
  video: CONVERSATION_STRINGS.downloadVideo,
};

/**
 * One media tile. Audio renders as an inline mini-player; images/videos show a
 * real thumbnail (click opens the viewer, hover reveals a download button);
 * documents are a download button with an icon + label.
 */
export function MediaThumb({
  item,
  onOpen,
}: {
  item: IConversationMediaItem;
  onOpen: (item: IConversationMediaItem) => void;
}) {
  if (item.kind === "audio") return <AudioMediaTile item={item} />;
  return <VisualThumb item={item} onOpen={onOpen} />;
}

/** Image / video / document tile (everything except inline audio). */
function VisualThumb({
  item,
  onOpen,
}: {
  item: IConversationMediaItem;
  onOpen: (item: IConversationMediaItem) => void;
}) {
  const { data: url, isLoading } = useResolvedMediaUrl(item.mediaUrl);

  const frame =
    "group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 text-muted-foreground";

  if (item.kind === "document") {
    return (
      <button
        type="button"
        disabled={!url}
        onClick={() =>
          url &&
          triggerMediaDownload(
            url,
            downloadFileName({
              mediaType: "document",
              id: item.id,
              caption: item.caption,
              existingName: fileNameFromUrl(item.mediaUrl),
            }),
          )
        }
        className={`${frame} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50`}
        aria-label={`${CONVERSATION_STRINGS.downloadDocument}: ${item.caption || "documento"}`}
      >
        <Icon icon={KIND_ICON.document} size={30} />
        <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-center text-[10px]">
          {item.caption || "Documento"}
        </span>
      </button>
    );
  }

  return (
    <div className={frame}>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={KIND_LABEL[item.kind]}
      >
        {item.kind === "image" && url ? (
          <img src={url} alt={item.caption || "Imagem"} loading="lazy" className="h-full w-full object-cover" />
        ) : item.kind === "video" && url ? (
          <>
            <video src={url} muted preload="metadata" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
              <Icon icon="mdi:play-circle" size={34} />
            </span>
          </>
        ) : (
          <Icon
            icon={isLoading ? "mdi:loading" : "mdi:image-broken-variant"}
            className={isLoading ? "animate-spin" : undefined}
            size={24}
          />
        )}
      </button>
      {url && (item.kind === "image" || item.kind === "video") && (
        <button
          type="button"
          onClick={() =>
            triggerMediaDownload(
              url,
              downloadFileName({ mediaType: item.kind, id: item.id, caption: item.caption }),
            )
          }
          aria-label={DOWNLOAD_LABEL[item.kind]}
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        >
          <Icon icon="mdi:download" size={14} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: AudioMediaTile — adicionar imports**

No topo de `src/features/conversations/components/media/AudioMediaTile.tsx`, após
`import { generateWaveBars } from "../../utils/audioWaveform";`, adicione:

```tsx
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
```

- [ ] **Step 3: AudioMediaTile — botão de download na linha de play**

Localize o bloco da linha "Play + waveform":

```tsx
        <div className="flex h-6 flex-1 items-center gap-[1.5px] overflow-hidden" aria-hidden>
          {bars.map((h, i) => {
            const played = i / bars.length <= playedRatio;
            return (
              <div
                key={i}
                className={played ? "bg-primary" : "bg-muted-foreground/40"}
                style={{ width: 2, height: `${h}%`, borderRadius: 2 }}
              />
            );
          })}
        </div>
      </div>
```

e troque por (acrescenta o botão de download após a waveform, ainda dentro da linha de play):

```tsx
        <div className="flex h-6 flex-1 items-center gap-[1.5px] overflow-hidden" aria-hidden>
          {bars.map((h, i) => {
            const played = i / bars.length <= playedRatio;
            return (
              <div
                key={i}
                className={played ? "bg-primary" : "bg-muted-foreground/40"}
                style={{ width: 2, height: `${h}%`, borderRadius: 2 }}
              />
            );
          })}
        </div>
        {url && (
          <button
            type="button"
            onClick={() =>
              triggerMediaDownload(
                url,
                downloadFileName({ mediaType: "audio", id: item.id, caption: item.caption }),
              )
            }
            aria-label={CONVERSATION_STRINGS.downloadAudio}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon icon="mdi:download" size={14} />
          </button>
        )}
      </div>
```

- [ ] **Step 4: Verificar build + suíte**

Run: `bun run build && bun run test`
Expected: build OK; suíte verde.

- [ ] **Step 5: Verificação manual (anotar para o dono)**

No painel "Mídias" de uma conversa: passar o mouse numa imagem/vídeo revela a seta de download; o tile de documento baixa ao clicar; o áudio tem botão de baixar na linha do player. (Gate manual do dono.)

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/components/media/MediaThumb.tsx src/features/conversations/components/media/AudioMediaTile.tsx
git commit -m "feat(conversations): add download to media panel tiles"
```

---

## Notas de verificação final (para o reviewer de branch)

- **Cobertura do spec:** Task 1 = helper + `downloadFileName`/`buildDownloadHref`/`sanitizeFileBase` (§4.1, §7); Task 2 = i18n (§4.6); Task 3 = lightbox fit + toolbar (§2 overflow, §4.3, §5); Task 4 = ImageBubble usa lightbox + hover (§2, §4.4); Task 5 = áudio/documento thread (§4.4); Task 6 = painel (§4.5). `messageToMediaItem` é reaproveitado (§4.2), não recriado.
- **Fronteira congelada:** nenhuma das tasks toca `useResolvedMediaUrl`/`resolveMediaUrl(s)`/`useSeedSignedMediaUrls`/query keys/RPC/Edge — só consomem a `url`.
- **Sem nova dependência;** só Tailwind + Radix Dialog já presentes.
- **Sem teste de componente** (env node) — os pontos de UI são gate manual + `bun run build`/`bun run test`.
- **Type-check opcional:** `bunx tsc --noEmit` tem baseline de ~315 erros pré-existentes; avaliar só o delta dos arquivos tocados (não deve introduzir erro novo).
```
