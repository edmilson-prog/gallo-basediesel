// scripts/dintec-import/run-pilot-simulation.ts
// Run: bun run scripts/dintec-import/run-pilot-simulation.ts
//
// FASE 1 do plano de import DINTEC — SIMULAÇÃO. Este script NUNCA escreve
// (INSERT/UPDATE/DELETE/UPSERT) no Supabase. Só lê (para os já vinculados
// por telefone) e escreve um relatório local.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  normalizePhoneKey,
  resolveCustomerType,
  fillIfEmpty,
  normalizeVehicleBrandModel,
  pickBestCodcliByLtv,
} from "../../src/features/dintec-import/engine";

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
}
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

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
  // Handles our own export format: ';'-delimited, '"'-quoted text fields
  // with '""' escaping, no embedded ';' inside quotes (already stripped
  // at export time — see export-pilot-fields.sql).
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
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
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
  cor: string;
  motor: string;
}

function loadVeiculos(path: string): VeiculoRow[] {
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  lines.shift();
  return lines.map((line) => {
    const c = parseCsvLine(line);
    return { codcli: c[0], placa: c[1], ano: c[2], veiculoRaw: c[3], cor: c[4], motor: c[5] };
  });
}

interface DryRunMatch {
  customerId: string;
  codcli: string;
  status: string;
}

function loadDryRunMatches(path: string): DryRunMatch[] {
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  lines.shift();
  return lines
    .map((line) => line.split(";"))
    .filter((c) => c[4])
    .map((c) => ({ customerId: c[0], codcli: c[4], status: c[8] }));
}

async function main() {
  const clientes = loadClientes("scratchpad/dintec-pilot-clientes.csv");
  const veiculos = loadVeiculos("scratchpad/dintec-pilot-veiculos.csv");
  const matches = loadDryRunMatches("docs/db/dintec-phone-match-dryrun.csv");

  const pilotCodclis = new Set(clientes.map((c) => c.codcli));
  const relevantMatches = matches.filter((m) => pilotCodclis.has(m.codcli));
  const matchedCustomerIds = [...new Set(relevantMatches.map((m) => m.customerId))];

  const { data: existingCustomers, error } = await sb
    .from("customers")
    .select(
      "id, phone, nome_fantasia, full_name, cpf, cnpj, contact_name, email, address, whatsapp_name",
    )
    .in("id", matchedCustomerIds);
  if (error) throw error;
  const existingById = new Map((existingCustomers ?? []).map((c) => [c.id, c]));

  // Resolve ambiguous groups (same customer_id, >1 codcli) via LTV tiebreak.
  const byCustomer = new Map<string, DryRunMatch[]>();
  for (const m of relevantMatches) {
    if (!byCustomer.has(m.customerId)) byCustomer.set(m.customerId, []);
    byCustomer.get(m.customerId)!.push(m);
  }
  const winningCodcliByCustomer = new Map<string, string>();
  for (const [customerId, group] of byCustomer) {
    if (group.length === 1) {
      winningCodcliByCustomer.set(customerId, group[0].codcli);
      continue;
    }
    const candidates = group.map((g) => {
      const cliente = clientes.find((c) => c.codcli === g.codcli);
      return { codcli: g.codcli, ltv: Number(cliente?.ltv ?? 0) };
    });
    winningCodcliByCustomer.set(customerId, pickBestCodcliByLtv(candidates));
  }
  const codcliToCustomerId = new Map(
    [...winningCodcliByCustomer.entries()].map(([customerId, codcli]) => [codcli, customerId]),
  );

  const rows: string[] = [];
  const header = [
    "codcli",
    "acao",
    "customer_id_linkado",
    "type",
    "nome_final",
    "phone_final",
    "dintec_ativo",
    "dintec_ltv",
    "dintec_abc_class",
    "veiculos_normalizados",
  ].join(";");
  rows.push(header);

  for (const cliente of clientes) {
    const linkedCustomerId = codcliToCustomerId.get(cliente.codcli) ?? null;
    const existing = linkedCustomerId ? existingById.get(linkedCustomerId) : undefined;

    const type = resolveCustomerType(cliente.cpf || null, cliente.cnpj || null);
    const nomeFinal = fillIfEmpty(
      existing?.nome_fantasia || existing?.full_name || null,
      cliente.nome || cliente.fantasia || null,
    );
    const phoneFinal = existing
      ? existing.phone // 563 já vinculados: telefone da plataforma nunca muda
      : normalizePhoneKey(cliente.celular)
        ? cliente.celular
        : normalizePhoneKey(cliente.telefone)
          ? cliente.telefone
          : ""; // pilot "sem telefone" stratum

    const clienteVeiculos = veiculos
      .filter((v) => v.codcli === cliente.codcli)
      .map((v) => normalizeVehicleBrandModel(v.veiculoRaw));

    rows.push(
      [
        cliente.codcli,
        existing ? "VINCULAR" : "CRIAR",
        linkedCustomerId ?? "",
        type,
        `"${(nomeFinal ?? "").replace(/"/g, '""')}"`,
        phoneFinal,
        cliente.ativo === "SIM" ? "true" : "false",
        cliente.ltv || "0",
        cliente.abcClass || "",
        clienteVeiculos.map((v) => `${v.brand}:${v.model}`).join(" | "),
      ].join(";"),
    );
  }

  writeFileSync("scratchpad/dintec-pilot-report.csv", "﻿" + rows.join("\r\n"), "utf8");

  const vincular = clientes.filter((c) => codcliToCustomerId.has(c.codcli)).length;
  const criar = clientes.length - vincular;
  const summary = [
    "# Piloto DINTEC — Fase 1 (simulação, zero escrita)",
    "",
    `- Clientes DINTEC no piloto: ${clientes.length}`,
    `- Vão VINCULAR a customer existente: ${vincular}`,
    `- Vão CRIAR customer novo: ${criar}`,
    `- Veículos normalizados: ${veiculos.length}`,
    "",
    "Ver `dintec-pilot-report.csv` linha a linha. Nenhuma escrita foi feita no banco.",
  ].join("\n");
  writeFileSync("scratchpad/dintec-pilot-report.md", summary, "utf8");
  console.log(summary);
}

main().catch((e) => {
  console.error("SIMULAÇÃO FALHOU:", e.message);
  process.exit(1);
});
