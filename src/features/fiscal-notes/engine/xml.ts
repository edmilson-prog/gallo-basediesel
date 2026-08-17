/**
 * Leitor de XML mínimo, sem dependência de DOM (PRD-216).
 *
 * Existe porque o parser da NF-e roda em dois runtimes: o navegador e o Deno
 * das Edge Functions, que não expõe `DOMParser`. Cobre o que a NF-e usa —
 * declaração, comentários, CDATA, atributos, tags auto-fechadas e entidades
 * básicas. Não cobre DTD, namespaces resolvidos nem conteúdo misto, porque a
 * NF-e não usa nenhum dos três.
 */

export interface IXmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: IXmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** `nfe:infNFe` → `infNFe`. A NF-e usa namespace default, mas XMLs de alguns
 *  emissores vêm prefixados; o resto do parser não deveria se importar. */
function stripNamespace(tag: string): string {
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const name = match[1] ?? match[3];
    const value = match[2] ?? match[4];
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

export function parseXml(source: string): IXmlNode {
  const root: IXmlNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: IXmlNode[] = [root];
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) break;

    if (lt > i) {
      const raw = source.slice(i, lt).trim();
      if (raw) stack[stack.length - 1].text += decodeEntities(raw);
    }

    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt);
      const stop = end === -1 ? source.length : end;
      stack[stack.length - 1].text += source.slice(lt + 9, stop);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<?", lt) || source.startsWith("<!", lt)) {
      const end = source.indexOf(">", lt);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    const gt = source.indexOf(">", lt);
    if (gt === -1) break;
    const raw = source.slice(lt + 1, gt).trim();

    if (raw.startsWith("/")) {
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1).trim() : raw;
    const space = body.search(/\s/);
    const tag = space === -1 ? body : body.slice(0, space);

    const node: IXmlNode = {
      tag: stripNamespace(tag),
      attrs: space === -1 ? {} : parseAttrs(body.slice(space)),
      children: [],
      text: "",
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = gt + 1;
  }

  return root;
}

export function child(node: IXmlNode | undefined, ...path: string[]): IXmlNode | undefined {
  let current = node;
  for (const tag of path) {
    if (!current) return undefined;
    current = current.children.find((c) => c.tag === tag);
  }
  return current;
}

export function children(node: IXmlNode, tag: string): IXmlNode[] {
  return node.children.filter((c) => c.tag === tag);
}

export function text(node: IXmlNode | undefined, ...path: string[]): string {
  return child(node, ...path)?.text.trim() ?? "";
}

export function num(node: IXmlNode | undefined, ...path: string[]): number {
  const raw = text(node, ...path);
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
