// scripts/dintec-import/run-pilot-write.ts
// Run: DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/run-pilot-write.ts
//
// FASE 2 do plano de import DINTEC — ESCRITA REAL dos 99 clientes do piloto
// (100 amostrados menos CODCLI=1, excluído por decisão registrada na spec:
// "***VENDA CONSUMIDOR***" é bucket genérico de balcão, não cliente real).
// Requer DINTEC_CONFIRM_WRITE=yes como trava contra execução acidental.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  dintecDialPhone,
  normalizePhoneKey,
  resolveCustomerType,
  fillIfEmpty,
  normalizeVehicleBrandModel,
  pickBestCodcliByLtv,
} from "../../src/features/dintec-import/engine";

if (process.env.DINTEC_CONFIRM_WRITE !== "yes") {
  throw new Error(
    "Trava de segurança: rode com DINTEC_CONFIRM_WRITE=yes para confirmar que esta é uma escrita real em produção.",
  );
}

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
}
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const STORE_ID = "00000000-0000-0000-0000-000000000001"; // única store ativa (single-tenant)
const OWNER_SELLER_ID = "57706ecc-01b5-4a96-b403-0359a4bb767f"; // Fernando Mello Muniz Gallo (dono)
const EXCLUDED_CODCLIS = new Set(["1"]); // "***VENDA CONSUMIDOR***" — ver spec, Casos especiais

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

interface DintecSnapshot {
  dintec_codcli: string;
  dintec_ativo: boolean | null;
  dintec_cliente_desde: string | null;
  dintec_credit_limit: number | null;
  dintec_vendedor_nome: string | null;
  dintec_frequencia: number | null;
  dintec_ltv: number | null;
  dintec_ticket_medio: number | null;
  dintec_primeira_compra: string | null;
  dintec_ultima_compra: string | null;
  dintec_abc_class: string | null;
  dintec_pct_receita: number | null;
  dintec_synced_at: string;
}

function buildDintecSnapshot(cliente: DintecClienteRow, syncedAt: string): DintecSnapshot {
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

async function main() {
  const syncedAt = new Date().toISOString();

  const allClientes = loadClientes("scratchpad/dintec-pilot-clientes.csv");
  const clientes = allClientes.filter((c) => !EXCLUDED_CODCLIS.has(c.codcli));
  const excluded = allClientes.filter((c) => EXCLUDED_CODCLIS.has(c.codcli));
  const veiculos = loadVeiculos("scratchpad/dintec-pilot-veiculos.csv");
  const matches = loadDryRunMatches("docs/db/dintec-phone-match-dryrun.csv");

  const pilotCodclis = new Set(clientes.map((c) => c.codcli));
  const relevantMatches = matches.filter((m) => pilotCodclis.has(m.codcli));
  const matchedCustomerIds = [...new Set(relevantMatches.map((m) => m.customerId))];

  const { data: existingCustomers, error: fetchError } = await sb
    .from("customers")
    .select("id, phone, nome_fantasia, full_name, cpf, cnpj, contact_name, email, address")
    .in("id", matchedCustomerIds);
  if (fetchError) throw fetchError;
  const existingById = new Map((existingCustomers ?? []).map((c) => [c.id, c]));

  // Resolve ambiguous groups (same customer_id, >1 codcli) via LTV tiebreak —
  // losing candidates are NOT dropped, they fall through to "customer novo".
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

  const reportRows: string[] = [
    ["codcli", "acao", "customer_id", "veiculos_criados", "veiculos_pulados"].join(";"),
  ];
  let linkedCount = 0;
  let createdCount = 0;
  let vehiclesCreated = 0;
  let vehiclesSkipped = 0;

  for (const cliente of clientes) {
    const linkedCustomerId = codcliToCustomerId.get(cliente.codcli) ?? null;
    const existing = linkedCustomerId ? existingById.get(linkedCustomerId) : undefined;
    const snapshot = buildDintecSnapshot(cliente, syncedAt);

    let customerId: string;

    if (existing) {
      // Já vinculado por telefone: só preenche campos vazios, telefone NUNCA muda.
      const patch: Record<string, unknown> = { ...snapshot };
      const incomingNome = cliente.nome || cliente.fantasia || null;
      applyIfEmpty(patch, "nome_fantasia", existing.nome_fantasia, incomingNome);
      applyIfEmpty(patch, "full_name", existing.full_name, incomingNome);
      applyIfEmpty(patch, "cpf", existing.cpf, textOrNull(cliente.cpf));
      applyIfEmpty(patch, "cnpj", existing.cnpj, textOrNull(cliente.cnpj));
      const type = resolveCustomerType(cliente.cpf || null, cliente.cnpj || null);
      if (type === "B2B") {
        applyIfEmpty(patch, "contact_name", existing.contact_name, textOrNull(cliente.contato));
      }
      applyIfEmpty(patch, "email", existing.email, textOrNull(cliente.email));
      if (!existing.address) {
        const address = buildAddress(cliente);
        if (address) patch.address = address;
      }

      const { error: updateError } = await sb
        .from("customers")
        .update(patch)
        .eq("id", linkedCustomerId);
      if (updateError) throw updateError;
      customerId = linkedCustomerId!;
      linkedCount++;
    } else {
      const type = resolveCustomerType(cliente.cpf || null, cliente.cnpj || null);
      const nomeFinal = cliente.nome || cliente.fantasia || null;
      // Mandatory dial format (docs/dev/dintec-providers.md) — see run-full-import.ts.
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
        seller_id: OWNER_SELLER_ID,
        type,
        status: "ativo",
        phone: phoneFinal,
        nome_fantasia: nomeFinal,
        full_name: nomeFinal,
        cpf: textOrNull(cliente.cpf),
        cnpj: textOrNull(cliente.cnpj),
        email: textOrNull(cliente.email),
        address: buildAddress(cliente),
      };
      if (type === "B2B") row.contact_name = textOrNull(cliente.contato);

      const { data: inserted, error: insertError } = await sb
        .from("customers")
        .insert(row)
        .select("id")
        .single();
      if (insertError) throw insertError;
      customerId = inserted.id;
      createdCount++;
    }

    const clienteVeiculos = veiculos.filter((v) => v.codcli === cliente.codcli);
    let vCreated = 0;
    let vSkipped = 0;
    for (const v of clienteVeiculos) {
      const year = resolveVehicleYear(v.ano, v.veiculoRaw);
      if (year === null) {
        vSkipped++;
        continue;
      }
      const { brand, model } = normalizeVehicleBrandModel(v.veiculoRaw);
      const { error: vehicleError } = await sb.from("vehicles").insert({
        customer_id: customerId,
        brand,
        model,
        year,
        engine: "Não informado",
        plate: textOrNull(v.placa),
        cadastro_status: "aprovado",
      });
      if (vehicleError) throw vehicleError;
      vCreated++;
    }
    vehiclesCreated += vCreated;
    vehiclesSkipped += vSkipped;

    reportRows.push(
      [
        cliente.codcli,
        existing ? "VINCULADO" : "CRIADO",
        customerId,
        String(vCreated),
        String(vSkipped),
      ].join(";"),
    );
  }

  writeFileSync("scratchpad/dintec-pilot-write-report.csv", "﻿" + reportRows.join("\r\n"), "utf8");

  const summary = [
    "# Piloto DINTEC — Fase 2 (escrita real)",
    "",
    `- synced_at do lote: ${syncedAt}`,
    `- Clientes processados: ${clientes.length} (100 amostrados − ${excluded.length} excluído: CODCLI ${[...EXCLUDED_CODCLIS].join(", ")})`,
    `- Vinculados a customer existente: ${linkedCount}`,
    `- Criados como customer novo: ${createdCount}`,
    `- Veículos criados: ${vehiclesCreated}`,
    `- Veículos pulados (sem ano resolvível): ${vehiclesSkipped}`,
    "",
    "Rollback: `delete from vehicles where customer_id in (select id from customers where dintec_synced_at = '" +
      syncedAt +
      "');` seguido de `delete from customers where dintec_synced_at = '" +
      syncedAt +
      "' and id not in (<ids que já existiam antes — ver coluna acao=VINCULADO no CSV>);` " +
      "e para os VINCULADOS, reverter manualmente as colunas dintec_* + os campos preenchidos (ver report linha a linha).",
    "",
    "Ver `dintec-pilot-write-report.csv` linha a linha.",
  ].join("\n");
  writeFileSync("scratchpad/dintec-pilot-write-report.md", summary, "utf8");
  console.log(summary);
}

main().catch((e) => {
  console.error("ESCRITA FASE 2 FALHOU:", e.message);
  process.exit(1);
});
