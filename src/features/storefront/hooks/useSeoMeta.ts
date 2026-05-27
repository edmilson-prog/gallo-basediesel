import { useEffect } from "react";

export interface ISeoMeta {
  title: string;
  description?: string;
  ogImageUrl?: string;
}

/**
 * Imperatively sets `document.title` and the relevant `<meta>` tags for the
 * current page. Restores the previous values on unmount.
 *
 * SSR is not part of the MVP, so this is a client-side imperative approach
 * (no `react-helmet`). Fase 2 with SSR will swap this for a head manager.
 */
export function useSeoMeta(meta: ISeoMeta): void {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previousTitle = document.title;
    document.title = meta.title;

    const previousDescription = readMeta("description");
    if (meta.description) writeMeta("description", meta.description);

    const previousOgTitle = readMetaOg("og:title");
    writeMetaOg("og:title", meta.title);
    const previousOgDescription = readMetaOg("og:description");
    if (meta.description) writeMetaOg("og:description", meta.description);
    const previousOgImage = readMetaOg("og:image");
    if (meta.ogImageUrl) writeMetaOg("og:image", meta.ogImageUrl);

    return () => {
      document.title = previousTitle;
      if (previousDescription !== null) writeMeta("description", previousDescription);
      if (previousOgTitle !== null) writeMetaOg("og:title", previousOgTitle);
      if (previousOgDescription !== null) writeMetaOg("og:description", previousOgDescription);
      if (previousOgImage !== null) writeMetaOg("og:image", previousOgImage);
    };
  }, [meta.title, meta.description, meta.ogImageUrl]);
}

function readMeta(name: string): string | null {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el ? el.getAttribute("content") : null;
}

function writeMeta(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function readMetaOg(property: string): string | null {
  const el = document.querySelector(`meta[property="${property}"]`);
  return el ? el.getAttribute("content") : null;
}

function writeMetaOg(property: string, content: string): void {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}
