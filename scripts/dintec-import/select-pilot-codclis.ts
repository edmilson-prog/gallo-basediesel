// scripts/dintec-import/select-pilot-codclis.ts
// Run: bun run scripts/dintec-import/select-pilot-codclis.ts
// Reads the already-committed phone-match dry-run report and writes
// scratchpad/dintec-pilot-codclis.csv (codcli;stratum) for the next SQL
// extraction step. No network/DB access — pure CSV filtering.
import { readFileSync, writeFileSync } from "node:fs";

const DRYRUN_CSV = "docs/db/dintec-phone-match-dryrun.csv";
const OUT_CSV = "scratchpad/dintec-pilot-codclis.csv";

interface MatchRow {
  codcli: string;
  status: string;
}

function parseDryRun(path: string): MatchRow[] {
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  lines.shift(); // header
  return lines
    .map((line) => line.split(";"))
    .filter((cols) => cols[4]) // has a dintec_codcli
    .map((cols) => ({ codcli: cols[4], status: cols[8] }));
}

const matches = parseDryRun(DRYRUN_CSV);
const seen = new Set<string>();
const picked: Array<{ codcli: string; stratum: string }> = [];

function take(pred: (m: MatchRow) => boolean, stratum: string, count: number) {
  let taken = 0;
  for (const m of matches) {
    if (taken >= count) break;
    if (seen.has(m.codcli)) continue;
    if (!pred(m)) continue;
    seen.add(m.codcli);
    picked.push({ codcli: m.codcli, stratum });
    taken++;
  }
  console.log(`${stratum}: ${taken}/${count}`);
}

take((m) => m.status === "celular_alta", "matched_alta", 40);
take((m) => m.status.includes("ambiguo"), "ambiguo", 10);

writeFileSync(
  OUT_CSV,
  ["codcli;stratum", ...picked.map((p) => `${p.codcli};${p.stratum}`)].join("\n"),
  "utf8",
);
console.log(`Escrito ${picked.length} CODCLIs (matched_alta + ambiguo) em ${OUT_CSV}.`);
console.log(
  "Os 60 restantes (vehicle=10, no_phone=10, new=30) são selecionados na etapa SQL " +
    "seguinte, direto contra o Firebird — passe este arquivo como exclusão.",
);
