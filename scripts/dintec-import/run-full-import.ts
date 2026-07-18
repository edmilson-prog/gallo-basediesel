// scripts/dintec-import/run-full-import.ts
// FASE 3 do import DINTEC — escopo completo (~3.067 clientes restantes + veículos).
//
// Dry-run (zero escrita, só relatório):
//   DINTEC_DRY_RUN=yes bun run scripts/dintec-import/run-full-import.ts
// Escrita real:
//   DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/run-full-import.ts
//
// Regras (design spec 2026-07-10 + decisões do dono de 2026-07-11):
//   - Idempotência: qualquer CODCLI já presente em customers.dintec_codcli é PULADO
//     (cobre os 99 do piloto e re-execuções parciais deste próprio script).
//   - CODCLI=1 já vem excluído do export; clientes sem nome+documento+telefone+veículo
//     ("vazios absolutos", ~3 na base) são EXCLUÍDOS e reportados.
//   - Nome: nome resolvido no export (NOTAFISCAL→NFISCAL→ORCAMENTO→FANTASIA) →
//     CONTATO → sintético "Cliente DINTEC <CODCLI>" + tag "Sem nome" (só p/ novos).
//   - Vinculados (match de telefone do dry-run): fill-if-empty + snapshot dintec_* e,
//     se ainda pending_review, PROMOÇÃO inline (semântica da RPC convert_pending_contact:
//     remove só a tag, type pelo documento, carteira→Fernando se nula, audit_logs).
//   - Ambíguos: vencedor por maior LTV (engine pickBestCodcliByLtv); perdedores viram
//     customers novos. Customer já linkado no piloto não é re-linkado.
//   - Telefone de customer existente NUNCA é tocado.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  dintecDialPhone,
  normalizePhoneKey,
  resolveCustomerType,
  fillIfEmpty,
  normalizeVehicleBrandModel,
  pickBestCodcliByLtv,
} from "../../src/features/dintec-import/engine";

const DRY_RUN = process.env.DINTEC_DRY_RUN === "yes";
if (!DRY_RUN && process.env.DINTEC_CONFIRM_WRITE !== "yes") {
  throw new Error(
    "Trava de segurança: rode com DINTEC_DRY_RUN=yes (simulação) ou DINTEC_CONFIRM_WRITE=yes (escrita real).",
  );
}

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

const STORE_ID = "00000000-0000-0000-0000-000000000001";
const WALLET_OWNER_SELLER_ID = "57706ecc-01b5-4a96-b403-0359a4bb767f"; // Fernando (dono)
const AUDIT_ACTOR_SELLER_ID = "622d1d2c-0223-4133-91cd-0264c1fc29aa"; // Edmilson (operador)
const SEM_NOME_TAG = "Sem nome";

interface DintecClienteRow {
  codcli: string;
  nome: string;
  fantasia: string;
  cpf: string;
  cnpj: string;
  contato: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  celular: string;
  email: string;
  ativo: string;
  clienteDesde: string;
  credito: string;
  vendedorNome: string;
  frequencia: string;
  ltv: string;
  ticketMedio: string;
  primeiraCompra: string;
  ultimaCompra: string;
  abcClass: string;
  pctReceita: string;
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

function loadClientes(path: string): DintecClienteRow[] {
  const lines = readLines(path);
  lines.shift();
  return lines.map((line) => {
    const c = parseCsvLine(line);
    return {
      codcli: c[0],
      nome: c[1],
      fantasia: c[2],
      cpf: c[3] || "",
      cnpj: c[4] || "",
      contato: c[5],
      endereco: c[6],
      bairro: c[7],
      cidade: c[8],
      estado: c[9],
      cep: c[10],
      telefone: c[11] || "",
      celular: c[12] || "",
      email: c[13],
      ativo: c[14],
      clienteDesde: c[15],
      credito: c[16],
      vendedorNome: c[17],
      frequencia: c[18],
      ltv: c[19],
      ticketMedio: c[20],
      primeiraCompra: c[21],
      ultimaCompra: c[22],
      abcClass: c[23],
      pctReceita: c[24],
    };
  });
}

interface VeiculoRow {
  codcli: string;
  placa: string;
  ano: string;
  veiculoRaw: string;
}

function loadVeiculos(path: string): VeiculoRow[] {
  const lines = readLines(path);
  lines.shift();
  return lines.map((line) => {
    const c = parseCsvLine(line);
    return { codcli: c[0], placa: c[1], ano: c[2], veiculoRaw: c[3] };
  });
}

function readLines(path: string): string[] {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(path, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l: string) => l.replace(/\s+$/, ""))
    .filter(Boolean);
}

interface DryRunMatch {
  customerId: string;
  codcli: string;
}

function loadDryRunMatches(path: string): DryRunMatch[] {
  const lines = readLines(path);
  lines.shift();
  return lines
    .map((line) => line.split(";"))
    .filter((c) => c[4])
    .map((c) => ({ customerId: c[0], codcli: c[4] }));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function numOrNull(s: string | undefined): number | null {
  if (!s || !s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(s: string | undefined): string | null {
  if (!s || !s.trim()) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null;
}

function textOrNull(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

function zipCodeOrUndefined(cep: string): string | undefined {
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return undefined;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function resolveVehicleYear(ano: string, veiculoRaw: string): number | null {
  const direct = Number(ano);
  if (Number.isFinite(direct) && direct >= 1950 && direct <= 2100) return direct;
  const match = veiculoRaw.match(/\b(19|20)\d{2}\b/);
  if (match) {
    const y = Number(match[0]);
    if (y >= 1950 && y <= 2100) return y;
  }
  return null;
}

function buildDintecSnapshot(cliente: DintecClienteRow, syncedAt: string) {
  return {
    dintec_codcli: cliente.codcli,
    dintec_ativo: cliente.ativo === "SIM" ? true : cliente.ativo === "NAO" ? false : null,
    dintec_cliente_desde: dateOrNull(cliente.clienteDesde),
    dintec_credit_limit: numOrNull(cliente.credito),
    dintec_vendedor_nome: textOrNull(cliente.vendedorNome),
    dintec_frequencia: cliente.frequencia ? Math.trunc(Number(cliente.frequencia)) : null,
    dintec_ltv: numOrNull(cliente.ltv),
    dintec_ticket_medio: numOrNull(cliente.ticketMedio),
    dintec_primeira_compra: dateOrNull(cliente.primeiraCompra),
    dintec_ultima_compra: dateOrNull(cliente.ultimaCompra),
    dintec_abc_class: textOrNull(cliente.abcClass),
    dintec_pct_receita: numOrNull(cliente.pctReceita),
    dintec_synced_at: syncedAt,
  };
}

function buildAddress(cliente: DintecClienteRow): Record<string, string> | null {
  const street = textOrNull(cliente.endereco);
  const district = textOrNull(cliente.bairro);
  const city = textOrNull(cliente.cidade);
  const state = textOrNull(cliente.estado);
  const zipCode = zipCodeOrUndefined(cliente.cep);
  if (!street && !district && !city && !state && !zipCode) return null;
  const address: Record<string, string> = {};
  if (street) address.street = street;
  if (district) address.district = district;
  if (city) address.city = city;
  if (state) address.state = state;
  if (zipCode) address.zipCode = zipCode;
  return address;
}

function applyIfEmpty(
  patch: Record<string, unknown>,
  key: string,
  existingValue: string | null | undefined,
  incomingValue: string | null,
): void {
  if (existingValue) return; // never overwrite a non-empty platform value
  const value = fillIfEmpty(existingValue, incomingValue);
  if (value) patch[key] = value;
}

interface ExistingCustomer {
  id: string;
  phone: string;
  nome_fantasia: string | null;
  full_name: string | null;
  cpf: string | null;
  cnpj: string | null;
  contact_name: string | null;
  email: string | null;
  address: unknown;
  tags: string[];
  type: string;
  seller_id: string | null;
  dintec_codcli: string | null;
}

async function fetchExistingByIds(ids: string[]): Promise<Map<string, ExistingCustomer>> {
  const map = new Map<string, ExistingCustomer>();
  for (const part of chunk(ids, 80)) {
    const { data, error } = await sb
      .from("customers")
      .select(
        "id, phone, nome_fantasia, full_name, cpf, cnpj, contact_name, email, address, tags, type, seller_id, dintec_codcli",
      )
      .in("id", part);
    if (error) throw error;
    for (const row of (data ?? []) as ExistingCustomer[]) map.set(row.id, row);
  }
  return map;
}

async function main() {
  const syncedAt = new Date().toISOString();
  console.log(`FASE 3 — modo: ${DRY_RUN ? "DRY-RUN (zero escrita)" : "ESCRITA REAL"}`);

  const clientes = loadClientes(join(SCRATCHPAD, "dintec-full-clientes.csv"));
  const veiculos = loadVeiculos(join(SCRATCHPAD, "dintec-full-veiculos.csv"));
  const matches = loadDryRunMatches(join(ROOT, "docs", "db", "dintec-phone-match-dryrun.csv"));
  console.log(
    `CSV: ${clientes.length} clientes, ${veiculos.length} veículos, ${matches.length} pares de match (${new Set(matches.map((m) => m.customerId)).size} customers distintos)`,
  );

  const veiculosByCodcli = new Map<string, VeiculoRow[]>();
  for (const v of veiculos) {
    if (!veiculosByCodcli.has(v.codcli)) veiculosByCodcli.set(v.codcli, []);
    veiculosByCodcli.get(v.codcli)!.push(v);
  }

  // Idempotency anchor: every CODCLI already imported is skipped entirely.
  // PostgREST caps unpaginated selects at 1000 rows (even for service_role),
  // so this MUST paginate — a truncated anchor would misclassify thousands of
  // already-created codclis as "create" on a partial-failure re-run.
  const alreadyImported = new Set<string>();
  const codcliToExistingId = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("customers")
      .select("id, dintec_codcli")
      .not("dintec_codcli", "is", null)
      .order("dintec_codcli")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ id: string; dintec_codcli: string }>) {
      alreadyImported.add(r.dintec_codcli);
      codcliToExistingId.set(r.dintec_codcli, r.id);
    }
    if (!data || data.length < 1000) break;
  }
  const { count: anchorCount, error: anchorCountError } = await sb
    .from("customers")
    .select("dintec_codcli", { count: "exact", head: true })
    .not("dintec_codcli", "is", null);
  if (anchorCountError) throw anchorCountError;
  if ((anchorCount ?? 0) !== alreadyImported.size) {
    throw new Error(
      `Âncora de idempotência inconsistente: count=${anchorCount} vs paginado=${alreadyImported.size}`,
    );
  }
  console.log(`Já importados (pulados): ${alreadyImported.size}`);

  const clientesByCodcli = new Map(clientes.map((c) => [c.codcli, c]));

  // Current platform state of every matched customer.
  const matchedCustomerIds = [...new Set(matches.map((m) => m.customerId))];
  const existingById = await fetchExistingByIds(matchedCustomerIds);

  // Winner resolution: only for customers not yet linked, among codclis still importable.
  const byCustomer = new Map<string, string[]>();
  for (const m of matches) {
    if (!byCustomer.has(m.customerId)) byCustomer.set(m.customerId, []);
    byCustomer.get(m.customerId)!.push(m.codcli);
  }
  const codcliToCustomer = new Map<string, string>();
  const conflicts: string[] = [];
  for (const customerId of [...byCustomer.keys()].sort()) {
    const state = existingById.get(customerId);
    if (!state) continue; // customer deleted since the dry-run (e.g., seed cleanup)
    if (state.dintec_codcli) continue; // already linked (pilot) — losers become new customers
    const candidates = byCustomer
      .get(customerId)!
      .filter((codcli) => !alreadyImported.has(codcli) && clientesByCodcli.has(codcli))
      .filter((codcli) => {
        if (!codcliToCustomer.has(codcli)) return true;
        conflicts.push(`${codcli} disputado: ficou com ${codcliToCustomer.get(codcli)}, ${customerId} perdeu`);
        return false;
      });
    if (candidates.length === 0) continue;
    const winner =
      candidates.length === 1
        ? candidates[0]
        : pickBestCodcliByLtv(
            candidates.map((codcli) => ({
              codcli,
              ltv: Number(clientesByCodcli.get(codcli)?.ltv ?? 0),
            })),
          );
    codcliToCustomer.set(winner, customerId);
  }

  // Classify every client before any write.
  type Action =
    | { kind: "skip_imported" }
    | { kind: "excluded_empty" }
    | { kind: "link"; customerId: string }
    | { kind: "create" };
  const plan = new Map<string, Action>();
  for (const cliente of clientes) {
    if (alreadyImported.has(cliente.codcli)) {
      plan.set(cliente.codcli, { kind: "skip_imported" });
      continue;
    }
    const nomeChain =
      textOrNull(cliente.nome) ?? textOrNull(cliente.fantasia) ?? textOrNull(cliente.contato);
    const hasDoc = !!(textOrNull(cliente.cpf) ?? textOrNull(cliente.cnpj));
    const hasPhone = !!(normalizePhoneKey(cliente.celular) ?? normalizePhoneKey(cliente.telefone));
    const hasVehicle = (veiculosByCodcli.get(cliente.codcli) ?? []).length > 0;
    if (!nomeChain && !hasDoc && !hasPhone && !hasVehicle) {
      plan.set(cliente.codcli, { kind: "excluded_empty" });
      continue;
    }
    const linkedCustomer = codcliToCustomer.get(cliente.codcli);
    plan.set(cliente.codcli, linkedCustomer ? { kind: "link", customerId: linkedCustomer } : { kind: "create" });
  }

  const counts = {
    skipImported: [...plan.values()].filter((a) => a.kind === "skip_imported").length,
    excludedEmpty: [...plan.values()].filter((a) => a.kind === "excluded_empty").length,
    link: [...plan.values()].filter((a) => a.kind === "link").length,
    create: [...plan.values()].filter((a) => a.kind === "create").length,
  };
  const excludedCodclis = [...plan.entries()]
    .filter(([, a]) => a.kind === "excluded_empty")
    .map(([codcli]) => codcli);
  console.log(
    `PLANO: ${counts.link} vincular, ${counts.create} criar, ${counts.skipImported} já importados, ${counts.excludedEmpty} excluídos vazios [${excludedCodclis.join(", ")}]${conflicts.length ? `, conflitos: ${conflicts.length}` : ""}`,
  );

  // Vehicle + naming projections (needed for both modes).
  let semNomeCount = 0;
  let vehiclesPlanned = 0;
  let vehiclesSkippedYear = 0;
  for (const [codcli, action] of plan) {
    if (action.kind !== "link" && action.kind !== "create") continue;
    const cliente = clientesByCodcli.get(codcli)!;
    if (action.kind === "create") {
      const nomeChain =
        textOrNull(cliente.nome) ?? textOrNull(cliente.fantasia) ?? textOrNull(cliente.contato);
      if (!nomeChain) semNomeCount++;
    }
    for (const v of veiculosByCodcli.get(codcli) ?? []) {
      if (resolveVehicleYear(v.ano, v.veiculoRaw) === null) vehiclesSkippedYear++;
      else vehiclesPlanned++;
    }
  }

  if (DRY_RUN) {
    const summary = [
      "# Fase 3 — DRY-RUN (zero escrita)",
      "",
      `- Clientes no export: ${clientes.length}`,
      `- Vincular a customer existente: ${counts.link}`,
      `- Criar customer novo: ${counts.create} (dos quais ${semNomeCount} com nome sintético + tag "${SEM_NOME_TAG}")`,
      `- Pulados (já importados): ${counts.skipImported}`,
      `- Excluídos (vazios absolutos): ${counts.excludedEmpty} [CODCLIs: ${excludedCodclis.join(", ")}]`,
      `- Veículos a criar: ${vehiclesPlanned} (pulados sem ano: ${vehiclesSkippedYear})`,
      `- Conflitos de codcli disputado: ${conflicts.length}${conflicts.length ? ` → ${conflicts.join(" | ")}` : ""}`,
    ].join("\n");
    writeFileSync(join(SCRATCHPAD, "dintec-full-dryrun.md"), summary, "utf8");
    console.log(summary);
    return;
  }

  // ===== WRITE MODE =====
  // Backup: pre-state of every customer we are about to UPDATE.
  const linkedIds = [...codcliToCustomer.values()];
  const backup = linkedIds.map((id) => existingById.get(id)).filter(Boolean);
  writeFileSync(
    join(SCRATCHPAD, "dintec-full-backup-linked.json"),
    JSON.stringify(backup, null, 1),
    "utf8",
  );
  console.log(`Backup dos ${backup.length} vinculados salvo.`);

  const reportRows: string[] = [
    ["codcli", "acao", "customer_id", "nome_final", "sem_nome", "promovido", "veiculos"].join(";"),
  ];
  const codcliToFinalCustomer = new Map<string, string>();
  let linkedDone = 0;
  let promotedCount = 0;

  // 1) Linked customers — per-row updates (each patch differs).
  for (const [codcli, customerId] of codcliToCustomer) {
    if (plan.get(codcli)?.kind !== "link") continue; // plan is authoritative (excluded/skipped never write)
    const cliente = clientesByCodcli.get(codcli)!;
    const existing = existingById.get(customerId)!;
    const snapshot = buildDintecSnapshot(cliente, syncedAt);
    const patch: Record<string, unknown> = { ...snapshot };
    const incomingNome =
      textOrNull(cliente.nome) ?? textOrNull(cliente.fantasia) ?? textOrNull(cliente.contato);
    applyIfEmpty(patch, "nome_fantasia", existing.nome_fantasia, incomingNome);
    applyIfEmpty(patch, "full_name", existing.full_name, incomingNome);
    applyIfEmpty(patch, "cpf", existing.cpf, textOrNull(cliente.cpf));
    applyIfEmpty(patch, "cnpj", existing.cnpj, textOrNull(cliente.cnpj));
    // Type from the MERGED documents (platform wins over DINTEC) — a pending
    // contact whose platform row already carries a CNPJ must promote as B2B
    // even if DINTEC only has a CPF.
    const docType = resolveCustomerType(
      existing.cpf ?? textOrNull(cliente.cpf),
      existing.cnpj ?? textOrNull(cliente.cnpj),
    );
    if (docType === "B2B") {
      applyIfEmpty(patch, "contact_name", existing.contact_name, textOrNull(cliente.contato));
    }
    applyIfEmpty(patch, "email", existing.email, textOrNull(cliente.email));
    if (!existing.address) {
      const address = buildAddress(cliente);
      if (address) patch.address = address;
    }

    const isPending = (existing.tags ?? []).includes("pending_review");
    let promoted = false;
    if (isPending) {
      // Inline promotion, mirroring convert_pending_contact semantics.
      patch.tags = (existing.tags ?? []).filter((t) => t !== "pending_review");
      patch.type = docType;
      patch.seller_id = existing.seller_id ?? WALLET_OWNER_SELLER_ID;
      const { data: updated, error } = await sb
        .from("customers")
        .update(patch)
        .eq("id", customerId)
        .contains("tags", ["pending_review"])
        .select("id");
      if (error) throw error;
      if (updated && updated.length === 1) {
        promoted = true;
        const auditPayload = {
          id: crypto.randomUUID(),
          store_id: STORE_ID,
          actor_id: AUDIT_ACTOR_SELLER_ID,
          action: "convert_pending_contact",
          resource: "customer",
          resource_id: customerId,
          before: { tags: existing.tags, seller_id: existing.seller_id, type: existing.type },
          after: {
            tags: patch.tags,
            seller_id: patch.seller_id,
            type: patch.type,
            dintec_codcli: codcli,
            source: "dintec-full-import",
          },
        };
        const { error: auditError } = await sb.from("audit_logs").insert(auditPayload);
        if (auditError) {
          console.error("FALHA NO AUDIT — replay manual:", JSON.stringify(auditPayload));
          throw auditError;
        }
      } else {
        // Tag vanished between fetch and update: fall back to a plain update.
        delete patch.tags;
        delete patch.type;
        delete patch.seller_id;
        const { data: plain, error: plainError } = await sb
          .from("customers")
          .update(patch)
          .eq("id", customerId)
          .select("id");
        if (plainError) throw plainError;
        if (!plain || plain.length !== 1) throw new Error(`update falhou para ${customerId}`);
        console.warn(`PROMOÇÃO PULADA (tag sumiu na corrida): ${customerId} / codcli ${codcli}`);
      }
    } else {
      const { data: plain, error } = await sb
        .from("customers")
        .update(patch)
        .eq("id", customerId)
        .select("id");
      if (error) throw error;
      if (!plain || plain.length !== 1) throw new Error(`update falhou para ${customerId}`);
    }

    codcliToFinalCustomer.set(codcli, customerId);
    if (promoted) promotedCount++;
    linkedDone++;
    if (linkedDone % 100 === 0) console.log(`vinculados: ${linkedDone}/${codcliToCustomer.size}`);
    reportRows.push(
      [codcli, "VINCULADO", customerId, `"${(incomingNome ?? "").replace(/"/g, '""')}"`, "", promoted ? "sim" : "", ""].join(";"),
    );
  }
  console.log(`Vinculados concluídos: ${linkedDone} (${promotedCount} promovidos)`);

  // 2) New customers — batched inserts.
  const createRows: Array<Record<string, unknown>> = [];
  const createMeta = new Map<string, { nomeFinal: string; semNome: boolean }>();
  for (const [codcli, action] of plan) {
    if (action.kind !== "create") continue;
    const cliente = clientesByCodcli.get(codcli)!;
    const snapshot = buildDintecSnapshot(cliente, syncedAt);
    const type = resolveCustomerType(cliente.cpf || null, cliente.cnpj || null);
    const nomeChain =
      textOrNull(cliente.nome) ?? textOrNull(cliente.fantasia) ?? textOrNull(cliente.contato);
    const nomeFinal = nomeChain ?? `Cliente DINTEC ${codcli}`;
    const tags = nomeChain ? [] : [SEM_NOME_TAG];
    createMeta.set(codcli, { nomeFinal, semNome: !nomeChain });
    // Mandatory dial format (docs/dev/dintec-providers.md): '+' + digits with
    // the BR DDI — the 2026-07-12 run wrote raw ERP values and broke WAHA sends.
    const phoneFinal = dintecDialPhone(
      normalizePhoneKey(cliente.celular)
        ? cliente.celular
        : normalizePhoneKey(cliente.telefone)
          ? cliente.telefone
          : "",
    );
    const row: Record<string, unknown> = {
      ...snapshot,
      store_id: STORE_ID,
      seller_id: WALLET_OWNER_SELLER_ID,
      type,
      status: "ativo",
      tags,
      phone: phoneFinal,
      nome_fantasia: nomeFinal,
      full_name: nomeFinal,
      cpf: textOrNull(cliente.cpf),
      cnpj: textOrNull(cliente.cnpj),
      email: textOrNull(cliente.email),
      address: buildAddress(cliente),
    };
    if (type === "B2B") row.contact_name = textOrNull(cliente.contato);
    createRows.push(row);
  }
  let createdDone = 0;
  for (const part of chunk(createRows, 100)) {
    const { data, error } = await sb.from("customers").insert(part).select("id, dintec_codcli");
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ id: string; dintec_codcli: string }>) {
      codcliToFinalCustomer.set(r.dintec_codcli, r.id);
    }
    createdDone += part.length;
    console.log(`criados: ${createdDone}/${createRows.length}`);
  }
  for (const [codcli, action] of plan) {
    if (action.kind === "create") {
      const meta = createMeta.get(codcli);
      reportRows.push(
        [
          codcli,
          "CRIADO",
          codcliToFinalCustomer.get(codcli) ?? "??",
          `"${(meta?.nomeFinal ?? "").replace(/"/g, '""')}"`,
          meta?.semNome ? "sim" : "",
          "",
          "",
        ].join(";"),
      );
    } else if (action.kind === "excluded_empty") {
      reportRows.push([codcli, "EXCLUIDO_VAZIO", "", "", "", "", ""].join(";"));
    }
  }

  // 3) Vehicles — idempotent per (customer, plate): covers this run's codclis
  // AND reconciles skip_imported codclis whose customers were written by an
  // earlier partial run that died before this section (their CSV vehicles
  // would otherwise be orphaned forever). Already-present vehicles (e.g. the
  // pilot's 205) are detected and never duplicated.
  const vehicleTargets = new Map(codcliToFinalCustomer);
  let reconciledTargets = 0;
  for (const [codcli, action] of plan) {
    if (action.kind !== "skip_imported") continue;
    if (!(veiculosByCodcli.get(codcli) ?? []).length) continue;
    const existingId = codcliToExistingId.get(codcli);
    if (existingId) {
      vehicleTargets.set(codcli, existingId);
      reconciledTargets++;
    }
  }
  if (reconciledTargets > 0) {
    console.log(`Reconciliação de veículos: ${reconciledTargets} codclis já importados re-checados.`);
  }

  const targetCustomerIds = [...new Set(vehicleTargets.values())];
  const existingVehicleKeys = new Set<string>();
  for (const part of chunk(targetCustomerIds, 40)) {
    const { data, error } = await sb
      .from("vehicles")
      .select("customer_id, plate, model, year")
      .in("customer_id", part);
    if (error) throw error;
    for (const v of (data ?? []) as Array<{ customer_id: string; plate: string | null; model: string; year: number }>) {
      existingVehicleKeys.add(
        v.plate ? `${v.customer_id}|${v.plate}` : `${v.customer_id}|${v.model}|${v.year}`,
      );
    }
  }

  const vehicleRows: Array<Record<string, unknown>> = [];
  let vehiclesSkipped = 0;
  let vehiclesAlreadyPresent = 0;
  for (const [codcli, customerId] of vehicleTargets) {
    for (const v of veiculosByCodcli.get(codcli) ?? []) {
      const year = resolveVehicleYear(v.ano, v.veiculoRaw);
      if (year === null) {
        vehiclesSkipped++;
        continue;
      }
      const { brand, model } = normalizeVehicleBrandModel(v.veiculoRaw);
      const plate = textOrNull(v.placa);
      const key = plate ? `${customerId}|${plate}` : `${customerId}|${model}|${year}`;
      if (existingVehicleKeys.has(key)) {
        vehiclesAlreadyPresent++;
        continue;
      }
      existingVehicleKeys.add(key); // also dedupes repeated plates inside the CSV itself
      vehicleRows.push({
        customer_id: customerId,
        brand,
        model,
        year,
        engine: "Não informado",
        plate,
        cadastro_status: "aprovado",
      });
    }
  }
  let vehiclesDone = 0;
  for (const part of chunk(vehicleRows, 200)) {
    const { error } = await sb.from("vehicles").insert(part);
    if (error) throw error;
    vehiclesDone += part.length;
    console.log(`veículos: ${vehiclesDone}/${vehicleRows.length}`);
  }
  console.log(`Veículos já presentes (dedupe): ${vehiclesAlreadyPresent}`);

  writeFileSync(
    join(SCRATCHPAD, "dintec-full-import-report.csv"),
    "﻿" + reportRows.join("\r\n"),
    "utf8",
  );
  const summary = [
    "# Fase 3 — ESCRITA REAL concluída",
    "",
    `- synced_at do lote: ${syncedAt}`,
    `- Vinculados (fill-if-empty + snapshot): ${linkedDone} (${promotedCount} promovidos de pending_review)`,
    `- Criados: ${createdDone} (${semNomeCount} com nome sintético + tag "${SEM_NOME_TAG}")`,
    `- Pulados (já importados): ${counts.skipImported}`,
    `- Excluídos (vazios absolutos): ${counts.excludedEmpty} [${excludedCodclis.join(", ")}]`,
    `- Veículos criados: ${vehiclesDone} (pulados sem ano: ${vehiclesSkipped}; já presentes/dedupe: ${vehiclesAlreadyPresent})`,
    `- Conflitos: ${conflicts.length}${conflicts.length ? ` → ${conflicts.join(" | ")}` : ""}`,
    "",
    "Rollback do lote:",
    "1. vehicles: delete from vehicles v using customers c where v.customer_id=c.id",
    `   and c.dintec_synced_at='${syncedAt}' and v.created_at >= '${syncedAt}';`,
    "   (o filtro por v.created_at protege veículos pré-existentes de customers vinculados)",
    "2. customers CRIADOS (acao=CRIADO no CSV do relatório): delete direto por id.",
    "3. customers VINCULADOS: restaurar campo a campo via dintec-full-backup-linked.json.",
  ].join("\n");
  writeFileSync(join(SCRATCHPAD, "dintec-full-import-report.md"), summary, "utf8");
  console.log(summary);
}

main().catch((e) => {
  console.error("FASE 3 FALHOU:", e.message);
  process.exit(1);
});
