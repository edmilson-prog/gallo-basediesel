/**
 * One-off ops probe: reconcile BR 9th-digit divergence for DINTEC-imported
 * customers against WhatsApp's canonical JID, using WAHA `check-exists` as
 * the oracle — it returns the CANONICAL chatId even when queried with the
 * wrong variant (the usync normalizes the 9th digit), which is exactly the
 * "only when WhatsApp confirms" standard set by PR #302.
 *
 * READ-ONLY: probes only. The SQL apply happens separately (assisted,
 * audited), per docs/superpowers/plans/2026-07-17-customers-phone-country-code-fix.md.
 *
 * Usage:
 *   WAHA_API_KEY=... bun run scripts/waha-ninth-digit-reconcile.ts \
 *     --base https://waha.example.com --session <sessionName> \
 *     --input digits.txt --output results.jsonl
 *
 * Input: one comma-separated line of wire digits (55DDD..., 12-13 digits).
 * Output: JSONL, one {digits, exists, canonical, class} per probe; classes:
 *   same | ninth_removed | ninth_added | other_diff | not_on_whatsapp | error
 */

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || !process.argv[i + 1]) throw new Error(`missing --${name}`);
  return process.argv[i + 1];
}

const API_KEY = process.env.WAHA_API_KEY ?? "";
if (!API_KEY) throw new Error("missing WAHA_API_KEY env var");
const BASE = arg("base").replace(/\/+$/, "");
const SESSION = arg("session");
const INPUT = arg("input");
const OUTPUT = arg("output");
const CONCURRENCY = 4;

function classify(digits: string, exists: boolean, canonical: string | undefined): string {
  if (!exists || !canonical) return "not_on_whatsapp";
  if (canonical === digits) return "same";
  // 55 + DDD(2) + 9 + local8 (13 digits) <-> 55 + DDD(2) + local8 (12 digits)
  if (
    digits.length === 13 &&
    canonical.length === 12 &&
    digits.slice(0, 4) === canonical.slice(0, 4) &&
    digits[4] === "9" &&
    digits.slice(5) === canonical.slice(4)
  ) {
    return "ninth_removed";
  }
  if (
    digits.length === 12 &&
    canonical.length === 13 &&
    canonical.slice(0, 4) === digits.slice(0, 4) &&
    canonical[4] === "9" &&
    canonical.slice(5) === digits.slice(4)
  ) {
    return "ninth_added";
  }
  return "other_diff";
}

async function probe(digits: string): Promise<Record<string, unknown>> {
  const url = `${BASE}/api/contacts/check-exists?phone=${digits}&session=${encodeURIComponent(SESSION)}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "X-Api-Key": API_KEY },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        if (attempt === 1) continue;
        return { digits, class: "error", status: res.status };
      }
      const body = (await res.json()) as { numberExists?: boolean; chatId?: string };
      const exists = body.numberExists === true;
      const canonical = exists ? body.chatId?.split("@")[0]?.replace(/\D/g, "") : undefined;
      return { digits, exists, canonical, class: classify(digits, exists, canonical) };
    } catch (err) {
      if (attempt === 1) continue;
      return { digits, class: "error", status: String(err) };
    }
  }
  return { digits, class: "error", status: "unreachable" };
}

const raw = await Bun.file(INPUT).text();
const all = raw.trim().split(",").map((d) => d.trim()).filter((d) => d.length > 0);
console.log(`probing ${all.length} numbers (concurrency ${CONCURRENCY})...`);

const results: Record<string, unknown>[] = [];
const counts = new Map<string, number>();
let cursor = 0;

async function worker(): Promise<void> {
  while (cursor < all.length) {
    const idx = cursor++;
    const r = await probe(all[idx]);
    results[idx] = r;
    const c = String(r.class);
    counts.set(c, (counts.get(c) ?? 0) + 1);
    const done = results.filter(Boolean).length;
    if (done % 100 === 0) console.log(`progress: ${done}/${all.length}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

await Bun.write(OUTPUT, results.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log("summary:", JSON.stringify(Object.fromEntries(counts)));
console.log(`wrote ${results.length} lines to ${OUTPUT}`);
