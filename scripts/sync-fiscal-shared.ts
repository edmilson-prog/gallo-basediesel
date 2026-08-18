/**
 * Espelha o núcleo de leitura da NF-e para a árvore das Edge Functions, para
 * que fiscal-note-import, fiscal-note-inbox e fiscal-note-sefaz (Deno) reusem
 * parseNfe/isValidNfeKey/allocateCharges sem duplicá-los à mão.
 *
 *   src/features/fiscal-notes/engine/{nfeKey,xml,nfeParser,costAllocation}.ts
 *     →  supabase/functions/_shared/fiscal/
 *
 * Só estes quatro: os demais módulos do engine rodam na conferência, que é
 * sempre no cliente. Nenhum deles importa DOM — é o que torna o espelho viável.
 *
 * A única transformação é acrescentar `.ts` aos imports relativos (mesma
 * transformação de scripts/sync-whatsapp-shared.ts). Testes são excluídos.
 *
 * Rodar após QUALQUER mudança nesses quatro arquivos:
 *   bun run sync:fiscal
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");
const SRC = join(ROOT, "src", "features", "fiscal-notes", "engine");
const DEST = join(ROOT, "supabase", "functions", "_shared", "fiscal");
const FILES = ["nfeKey.ts", "xml.ts", "nfeParser.ts", "costAllocation.ts"];

function addTsExtensions(source: string): string {
  return source.replace(
    /(from\s+")(\.{1,2}\/[^"]+)(")/g,
    (whole, prefix: string, specifier: string, suffix: string) =>
      specifier.endsWith(".ts") ? whole : `${prefix}${specifier}.ts${suffix}`,
  );
}

rmSync(DEST, { recursive: true, force: true });
for (const file of FILES) {
  const target = join(DEST, file);
  mkdirSync(dirname(target), { recursive: true });
  const banner = `// AUTO-GENERATED MIRROR — DO NOT EDIT.\n// Source: src/features/fiscal-notes/engine/${file} (sync: bun run sync:fiscal)\n\n`;
  writeFileSync(target, banner + addTsExtensions(readFileSync(join(SRC, file), "utf8")));
}
console.log(`synced ${FILES.length} files → supabase/functions/_shared/fiscal/`);
