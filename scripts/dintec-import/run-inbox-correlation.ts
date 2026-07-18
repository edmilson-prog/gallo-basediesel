// scripts/dintec-import/run-inbox-correlation.ts
// Correlação Inbox × DINTEC — a etapa final do import de clientes, interrompida
// pelo crash de 2026-07-12 e refeita do zero em 2026-07-17 (o dry-run antigo,
// docs/db/dintec-phone-match-dryrun.csv, foi computado ANTES da limpeza dos
// seeds demo e está obsoleto).
//
// O que faz (SOMENTE LEITURA — relatório):
//   Cruza os telefones dos contatos presentes na Inbox de Atendimento (clientes
//   com conversa e sem dintec_codcli, contatos pending_review e leads de
//   conversas sem cliente) com os telefones do export DINTEC
//   (scratchpad/dintec-full-clientes.csv), usando a chave tolerante
//   normalizePhoneKey (DDD + últimos 8 dígitos — 9º dígito e DDI irrelevantes).
//
// Classificação de cada alvo:
//   merge_candidato          — codcli casado vive em OUTRO customer criado pelo
//                              import, sem conversas → par de merge (o titular da
//                              conversa absorve a identidade ERP; política
//                              aprovada em 2026-07-17, audit 0583ef29)
//   conflito_dois_com_conversa — o customer DINTEC do codcli TAMBÉM tem conversas
//                              → decisão manual
//   vincular_direto          — codcli casado não está em nenhum customer (raro)
//   ambiguo                  — telefone casa com 2+ codclis → vencedor por LTV
//                              (pickBestCodcliByLtv), demais listados
//   sem_match                — não é cliente DINTEC (por telefone)
//   fone_invalido            — telefone da plataforma sem chave comparável
//
// Uso:
//   bun run scripts/dintec-import/run-inbox-correlation.ts
// Saída:
//   scratchpad/inbox-correlation-report.csv  (uma linha por alvo)
//   scratchpad/inbox-correlation-report.md   (resumo com contagens)
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { normalizePhoneKey, pickBestCodcliByLtv } from "../../src/features/dintec-import/engine";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
}
const sb = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ROOT = join(import.meta.dir, "..", "..");
const SCRATCHPAD = join(ROOT, "scratchpad");

// ---------- DINTEC export ----------

interface DintecLite {
  codcli: string;
  nome: string;
  celular: string;
  telefone: string;
  ltv: number;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let i = 0;
  while (i <= line.length) {
    const semi = line.indexOf(";", i);
    const raw = semi === -1 ? line.slice(i) : line.slice(i, semi);
    if (raw.startsWith('"') && raw.endsWith('"')) {
      cells.push(raw.slice(1, -1).replace(/""/g, '"'));
    } else {
      cells.push(raw);
    }
    if (semi === -1) break;
    i = semi + 1;
  }
  return cells;
}

function loadDintec(path: string): DintecLite[] {
  const lines = readFileSync(path, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter(Boolean);
  lines.shift();
  return lines.map((line) => {
    const c = parseCsvLine(line);
    return {
      codcli: c[0],
      nome: c[1] || c[2] || `Cliente DINTEC ${c[0]}`,
      telefone: c[11] || "",
      celular: c[12] || "",
      ltv: Number(c[19] || "0") || 0,
    };
  });
}

// ---------- prod fetch (paged — PostgREST caps at 1000/page) ----------

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

interface CustRow {
  id: string;
  phone: string;
  dintec_codcli: string | null;
  tags: string[] | null;
  type: string;
  full_name: string | null;
  nome_fantasia: string | null;
}
interface ConvRow {
  id: string;
  customer_id: string | null;
  lead_id: string | null;
}
interface LeadRow {
  id: string;
  name: string | null;
  phone: string | null;
}

// ---------- main ----------

async function main() {
  const dintec = loadDintec(join(SCRATCHPAD, "dintec-full-clientes.csv"));

  // phone-key index over BOTH DINTEC phone fields
  const dintecByKey = new Map<string, DintecLite[]>();
  for (const d of dintec) {
    for (const raw of [d.celular, d.telefone]) {
      const key = normalizePhoneKey(raw);
      if (!key) continue;
      const list = dintecByKey.get(key) ?? [];
      if (!list.some((x) => x.codcli === d.codcli)) list.push(d);
      dintecByKey.set(key, list);
    }
  }

  const [customers, conversations, leads] = await Promise.all([
    fetchAll<CustRow>("customers", "id, phone, dintec_codcli, tags, type, full_name, nome_fantasia"),
    fetchAll<ConvRow>("conversations", "id, customer_id, lead_id"),
    fetchAll<LeadRow>("leads", "id, name, phone"),
  ]);
  console.log(
    `prod: ${customers.length} customers, ${conversations.length} conversas, ${leads.length} leads; ` +
      `DINTEC: ${dintec.length} clientes, ${dintecByKey.size} chaves de fone`,
  );

  const convsByCustomer = new Map<string, number>();
  for (const cv of conversations) {
    if (!cv.customer_id) continue;
    convsByCustomer.set(cv.customer_id, (convsByCustomer.get(cv.customer_id) ?? 0) + 1);
  }
  const customersByCodcli = new Map<string, CustRow>();
  for (const cu of customers) {
    if (cu.dintec_codcli) customersByCodcli.set(cu.dintec_codcli, cu);
  }
  const leadsById = new Map(leads.map((l) => [l.id, l]));

  // ---------- targets ----------

  interface Target {
    scope: "conversa" | "contato_pending" | "lead_conversa";
    refId: string;
    nome: string;
    phone: string;
    convs: number;
  }
  const targets: Target[] = [];
  const seen = new Set<string>();

  for (const cu of customers) {
    if (cu.dintec_codcli) continue;
    const convs = convsByCustomer.get(cu.id) ?? 0;
    const pending = (cu.tags ?? []).includes("pending_review");
    if (convs === 0 && !pending) continue;
    targets.push({
      scope: convs > 0 ? "conversa" : "contato_pending",
      refId: cu.id,
      nome:
        (cu.type === "B2B" ? cu.nome_fantasia || cu.full_name : cu.full_name) ?? "(sem nome)",
      phone: cu.phone ?? "",
      convs,
    });
    seen.add(cu.id);
  }
  for (const cv of conversations) {
    if (cv.customer_id || !cv.lead_id) continue;
    const lead = leadsById.get(cv.lead_id);
    if (!lead || seen.has(`lead:${lead.id}`)) continue;
    seen.add(`lead:${lead.id}`);
    targets.push({
      scope: "lead_conversa",
      refId: lead.id,
      nome: lead.name ?? "(lead sem nome)",
      phone: lead.phone ?? "",
      convs: 1,
    });
  }

  // ---------- classification ----------

  const rows: string[] = [
    "scope;ref_id;nome_plataforma;phone_plataforma;convs;classe;codcli;dintec_nome;dintec_customer_id;dintec_customer_convs;ambiguos",
  ];
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  const q = (s: string) => `"${(s ?? "").replace(/"/g, '""').replace(/;/g, ",")}"`;

  for (const t of targets) {
    const key = normalizePhoneKey(t.phone);
    let classe = "";
    let codcli = "";
    let dintecNome = "";
    let dintecCustomerId = "";
    let dintecCustomerConvs = "";
    let ambiguos = "";

    if (!key) {
      classe = "fone_invalido";
    } else {
      const matches = dintecByKey.get(key) ?? [];
      if (matches.length === 0) {
        classe = "sem_match";
      } else {
        const winner =
          matches.length === 1
            ? matches[0]
            : matches.find(
                (m) =>
                  m.codcli ===
                  pickBestCodcliByLtv(matches.map((m2) => ({ codcli: m2.codcli, ltv: m2.ltv }))),
              )!;
        codcli = winner.codcli;
        dintecNome = winner.nome;
        if (matches.length > 1) {
          ambiguos = matches.map((m) => `${m.codcli}:${m.nome} (LTV ${m.ltv})`).join(" | ");
        }
        const holder = customersByCodcli.get(winner.codcli);
        if (!holder) {
          classe = matches.length > 1 ? "ambiguo_vincular_direto" : "vincular_direto";
        } else {
          dintecCustomerId = holder.id;
          const holderConvs = convsByCustomer.get(holder.id) ?? 0;
          dintecCustomerConvs = String(holderConvs);
          if (holderConvs > 0) {
            classe = "conflito_dois_com_conversa";
          } else {
            classe = matches.length > 1 ? "ambiguo_merge" : "merge_candidato";
          }
        }
      }
    }
    bump(`${t.scope}:${classe}`);
    bump(`TOTAL:${classe}`);
    rows.push(
      [
        t.scope,
        t.refId,
        q(t.nome),
        t.phone,
        String(t.convs),
        classe,
        codcli,
        q(dintecNome),
        dintecCustomerId,
        dintecCustomerConvs,
        q(ambiguos),
      ].join(";"),
    );
  }

  writeFileSync(join(SCRATCHPAD, "inbox-correlation-report.csv"), rows.join("\n") + "\n", "utf8");

  const md: string[] = [
    "# Correlação Inbox × DINTEC — relatório (somente leitura)",
    "",
    `- Alvos analisados: ${targets.length} (conversa: ${targets.filter((t) => t.scope === "conversa").length}, ` +
      `contato pending: ${targets.filter((t) => t.scope === "contato_pending").length}, ` +
      `lead c/ conversa: ${targets.filter((t) => t.scope === "lead_conversa").length})`,
    "",
    "| Classe | Total | conversa | contato_pending | lead_conversa |",
    "|---|---|---|---|---|",
  ];
  const classes = [...new Set([...counts.keys()].filter((k) => k.startsWith("TOTAL:")))]
    .map((k) => k.slice(6))
    .sort();
  for (const c of classes) {
    md.push(
      `| ${c} | ${counts.get(`TOTAL:${c}`) ?? 0} | ${counts.get(`conversa:${c}`) ?? 0} | ` +
        `${counts.get(`contato_pending:${c}`) ?? 0} | ${counts.get(`lead_conversa:${c}`) ?? 0} |`,
    );
  }
  md.push("", `CSV completo: scratchpad/inbox-correlation-report.csv`);
  writeFileSync(join(SCRATCHPAD, "inbox-correlation-report.md"), md.join("\n") + "\n", "utf8");

  console.log(md.join("\n"));
}

await main();
