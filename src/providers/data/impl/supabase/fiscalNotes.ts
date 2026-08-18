import type { ID, IFiscalNote, IFiscalNoteDuplicate, IFiscalNoteItem } from "@/shared/types";
import type {
  ICreateFiscalNoteInput,
  IFiscalNotesProvider,
  IListFiscalNotesParams,
  IPostContext,
  IUpdateFiscalNoteItemPatch,
} from "../../contracts/fiscalNotes";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Implementação Supabase de {@link IFiscalNotesProvider} (PRD-216).
 *
 * Itens e duplicatas vivem em tabelas próprias com FK ON DELETE CASCADE e são
 * hidratados por consultas separadas, no mesmo padrão de `modelKits.listItems`.
 *
 * `create` não é transacional: insere o cabeçalho, depois os filhos. O unique
 * index de `access_key` garante que uma reentrada do mesmo XML falha na
 * primeira instrução, antes de qualquer filho existir. O lançamento — esse sim
 * atômico — é a RPC `post_fiscal_note` da Fase 3.
 */

interface FiscalNoteRow {
  id: string;
  store_id: string;
  access_key: string;
  number: string;
  series: string;
  supplier_id: string;
  issued_at: string;
  entered_at: string;
  status: IFiscalNote["status"];
  origin: IFiscalNote["origin"];
  freight: number;
  ipi: number;
  discount: number;
  products_total: number;
  total: number;
  xml_path: string | null;
  posted_at: string | null;
  posted_by: string | null;
  division: IFiscalNote["division"];
  created_at: string;
  updated_at: string;
}

interface FiscalNoteItemRow {
  id: string;
  note_id: string;
  seq: number;
  supplier_code: string;
  description: string;
  ncm: string | null;
  cfop: string | null;
  ean: string | null;
  unit: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  link_mode: IFiscalNoteItem["linkMode"];
  part_id: string | null;
  new_part_draft: IFiscalNoteItem["newPartDraft"] | null;
  conversion_mode: IFiscalNoteItem["conversionMode"];
  conversion_factor: number | null;
  conversion_unit: string | null;
  conversion_target_part_id: string | null;
  ai_confidence: number | null;
  ai_evidence: string | null;
  alert: string | null;
  confirmed: boolean;
}

interface FiscalNoteDuplicateRow {
  id: string;
  note_id: string;
  number: string;
  due_date: string;
  amount: number;
}

const TABLE = "fiscal_notes";
const ITEMS_TABLE = "fiscal_note_items";
const DUPS_TABLE = "fiscal_note_duplicates";

const COLUMNS =
  "id, store_id, access_key, number, series, supplier_id, issued_at, entered_at, status, origin, freight, ipi, discount, products_total, total, xml_path, posted_at, posted_by, division, created_at, updated_at";
const ITEM_COLUMNS =
  "id, note_id, seq, supplier_code, description, ncm, cfop, ean, unit, quantity, unit_value, total_value, link_mode, part_id, new_part_draft, conversion_mode, conversion_factor, conversion_unit, conversion_target_part_id, ai_confidence, ai_evidence, alert, confirmed";
const DUP_COLUMNS = "id, note_id, number, due_date, amount";

function rowToItem(row: FiscalNoteItemRow): IFiscalNoteItem {
  return {
    id: row.id,
    noteId: row.note_id,
    seq: row.seq,
    supplierCode: row.supplier_code,
    description: row.description,
    ncm: row.ncm ?? undefined,
    cfop: row.cfop ?? undefined,
    ean: row.ean ?? undefined,
    unit: row.unit,
    quantity: row.quantity,
    unitValue: row.unit_value,
    totalValue: row.total_value,
    linkMode: row.link_mode,
    partId: row.part_id ?? undefined,
    newPartDraft: row.new_part_draft ?? undefined,
    conversionMode: row.conversion_mode,
    conversionFactor: row.conversion_factor,
    conversionUnit: row.conversion_unit ?? undefined,
    conversionTargetPartId: row.conversion_target_part_id ?? undefined,
    aiConfidence: row.ai_confidence ?? undefined,
    aiEvidence: row.ai_evidence ?? undefined,
    alert: row.alert ?? undefined,
    confirmed: row.confirmed,
  };
}

function rowToDuplicate(row: FiscalNoteDuplicateRow): IFiscalNoteDuplicate {
  return { id: row.id, number: row.number, dueDate: row.due_date, amount: row.amount };
}

function rowToNote(
  row: FiscalNoteRow,
  items: IFiscalNoteItem[],
  duplicates: IFiscalNoteDuplicate[],
): IFiscalNote {
  return {
    id: row.id,
    storeId: row.store_id,
    accessKey: row.access_key,
    number: row.number,
    series: row.series,
    supplierId: row.supplier_id,
    issuedAt: row.issued_at,
    enteredAt: row.entered_at,
    status: row.status,
    origin: row.origin,
    freight: row.freight,
    ipi: row.ipi,
    discount: row.discount,
    productsTotal: row.products_total,
    total: row.total,
    xmlPath: row.xml_path ?? undefined,
    postedAt: row.posted_at ?? undefined,
    postedBy: row.posted_by ?? undefined,
    division: row.division,
    items,
    duplicates,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemPatchToRow(patch: IUpdateFiscalNoteItemPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.linkMode !== undefined) row.link_mode = patch.linkMode;
  if (patch.partId !== undefined) row.part_id = patch.partId ?? null;
  if (patch.newPartDraft !== undefined) row.new_part_draft = patch.newPartDraft ?? null;
  if (patch.conversionMode !== undefined) row.conversion_mode = patch.conversionMode;
  if (patch.conversionFactor !== undefined) row.conversion_factor = patch.conversionFactor;
  if (patch.conversionUnit !== undefined) row.conversion_unit = patch.conversionUnit ?? null;
  if (patch.conversionTargetPartId !== undefined)
    row.conversion_target_part_id = patch.conversionTargetPartId ?? null;
  if (patch.confirmed !== undefined) row.confirmed = patch.confirmed;
  return row;
}

/** Hidrata itens e duplicatas de uma nota (espelha `modelKits.listItems`). */
async function hydrate(noteId: ID): Promise<[IFiscalNoteItem[], IFiscalNoteDuplicate[]]> {
  const client = getSupabaseClient();
  const [itemsResult, dupsResult] = await Promise.all([
    client.from(ITEMS_TABLE).select(ITEM_COLUMNS).eq("note_id", noteId).order("seq"),
    client.from(DUPS_TABLE).select(DUP_COLUMNS).eq("note_id", noteId).order("due_date"),
  ]);
  if (itemsResult.error)
    throw new Error(
      `[supabase] fiscalNotes.hydrate items(${noteId}) failed: ${itemsResult.error.message}`,
    );
  if (dupsResult.error)
    throw new Error(
      `[supabase] fiscalNotes.hydrate dups(${noteId}) failed: ${dupsResult.error.message}`,
    );
  return [
    (itemsResult.data as unknown as FiscalNoteItemRow[]).map(rowToItem),
    (dupsResult.data as unknown as FiscalNoteDuplicateRow[]).map(rowToDuplicate),
  ];
}

/** Troca de estado entre `rascunho` e `conferencia`. `neq` barra nota lançada. */
async function setStatus(id: ID, status: IFiscalNote["status"]): Promise<IFiscalNote> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "lancada")
    .select(COLUMNS)
    .single();
  if (error)
    throw new Error(`[supabase] fiscalNotes status→${status}(${id}) failed: ${error.message}`);
  const row = data as unknown as FiscalNoteRow;
  const [items, duplicates] = await hydrate(row.id);
  return rowToNote(row, items, duplicates);
}

export const supabaseFiscalNotesProvider: IFiscalNotesProvider = {
  async list(params: IListFiscalNotesParams = {}): Promise<IPaginatedResult<IFiscalNote>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
    if (params.storeId) query = query.eq("store_id", params.storeId);
    if (params.status) query = query.eq("status", params.status);
    if (params.supplierId) query = query.eq("supplier_id", params.supplierId);
    if (params.search)
      query = query.or(`number.ilike.%${params.search}%,access_key.ilike.%${params.search}%`);

    const { data, error, count } = await query
      .order("issued_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new Error(`[supabase] fiscalNotes.list failed: ${error.message}`);

    const rows = data as unknown as FiscalNoteRow[];
    const notes = await Promise.all(
      rows.map(async (row) => {
        const [items, duplicates] = await hydrate(row.id);
        return rowToNote(row, items, duplicates);
      }),
    );
    return { data: notes, total: count ?? 0, page, pageSize };
  },

  async get(id: ID): Promise<IFiscalNote> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] fiscalNotes.get(${id}) failed: ${error.message}`);
    const [items, duplicates] = await hydrate(id);
    return rowToNote(data as unknown as FiscalNoteRow, items, duplicates);
  },

  async findByAccessKey(accessKey: string): Promise<IFiscalNote | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("access_key", accessKey)
      .maybeSingle();
    if (error) throw new Error(`[supabase] fiscalNotes.findByAccessKey failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as FiscalNoteRow;
    const [items, duplicates] = await hydrate(row.id);
    return rowToNote(row, items, duplicates);
  },

  async create(input: ICreateFiscalNoteInput): Promise<IFiscalNote> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from(TABLE)
      .insert({
        store_id: input.storeId,
        access_key: input.accessKey,
        number: input.number,
        series: input.series,
        supplier_id: input.supplierId,
        issued_at: input.issuedAt,
        entered_at: input.enteredAt,
        status: input.status,
        origin: input.origin,
        freight: input.freight,
        ipi: input.ipi,
        discount: input.discount,
        products_total: input.productsTotal,
        total: input.total,
        xml_path: input.xmlPath ?? null,
        division: input.division,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] fiscalNotes.create failed: ${error.message}`);

    const row = data as unknown as FiscalNoteRow;

    if (input.items.length > 0) {
      const { error: itemsError } = await client.from(ITEMS_TABLE).insert(
        input.items.map((item) => ({
          note_id: row.id,
          seq: item.seq,
          supplier_code: item.supplierCode,
          description: item.description,
          ncm: item.ncm ?? null,
          cfop: item.cfop ?? null,
          ean: item.ean ?? null,
          unit: item.unit,
          quantity: item.quantity,
          unit_value: item.unitValue,
          total_value: item.totalValue,
          link_mode: item.linkMode,
          part_id: item.partId ?? null,
          new_part_draft: item.newPartDraft ?? null,
          conversion_mode: item.conversionMode,
          conversion_factor: item.conversionFactor,
          conversion_unit: item.conversionUnit ?? null,
          conversion_target_part_id: item.conversionTargetPartId ?? null,
          ai_confidence: item.aiConfidence ?? null,
          ai_evidence: item.aiEvidence ?? null,
          alert: item.alert ?? null,
          confirmed: item.confirmed,
        })),
      );
      if (itemsError)
        throw new Error(`[supabase] fiscalNotes.create (items) failed: ${itemsError.message}`);
    }

    if (input.duplicates.length > 0) {
      const { error: dupsError } = await client.from(DUPS_TABLE).insert(
        input.duplicates.map((dup) => ({
          note_id: row.id,
          number: dup.number,
          due_date: dup.dueDate,
          amount: dup.amount,
        })),
      );
      if (dupsError)
        throw new Error(`[supabase] fiscalNotes.create (duplicates) failed: ${dupsError.message}`);
    }

    const [items, duplicates] = await hydrate(row.id);
    return rowToNote(row, items, duplicates);
  },

  async updateItem(itemId: ID, patch: IUpdateFiscalNoteItemPatch): Promise<IFiscalNoteItem> {
    const { data, error } = await getSupabaseClient()
      .from(ITEMS_TABLE)
      .update(itemPatchToRow(patch))
      .eq("id", itemId)
      .select(ITEM_COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] fiscalNotes.updateItem(${itemId}) failed: ${error.message}`);
    return rowToItem(data as unknown as FiscalNoteItemRow);
  },

  async markDraft(id: ID): Promise<IFiscalNote> {
    return setStatus(id, "rascunho");
  },

  async resumeFromDraft(id: ID): Promise<IFiscalNote> {
    return setStatus(id, "conferencia");
  },

  async remove(id: ID): Promise<void> {
    const client = getSupabaseClient();

    // Lê antes de apagar: precisamos do xml_path, e depois não há mais o que ler.
    const { data, error: readError } = await client
      .from(TABLE)
      .select("status, xml_path")
      .eq("id", id)
      .maybeSingle();
    if (readError)
      throw new Error(`[supabase] fiscalNotes.remove(${id}) failed: ${readError.message}`);
    if (!data) return;

    const row = data as unknown as Pick<FiscalNoteRow, "status" | "xml_path">;
    if (row.status === "lancada") {
      throw new Error(
        `[supabase] fiscalNotes.remove(${id}): nota lançada se estorna, não se apaga`,
      );
    }

    // Itens e duplicatas somem por ON DELETE CASCADE.
    const { error } = await client.from(TABLE).delete().eq("id", id).neq("status", "lancada");
    if (error) throw new Error(`[supabase] fiscalNotes.remove(${id}) failed: ${error.message}`);

    // O XML depois da linha: se a remoção do arquivo falhar, o pior caso é um
    // órfão no bucket — melhor que uma nota sem XML apontando para o nada.
    if (row.xml_path) {
      const { error: storageError } = await client.storage
        .from("fiscal-xml")
        .remove([row.xml_path]);
      if (storageError && import.meta.env.DEV) {
        console.warn("[fiscal-notes] XML órfão no bucket:", row.xml_path, storageError.message);
      }
    }
  },

  // `ctx` é ignorado nos dois métodos abaixo: o Postgres já tem o catálogo, e
  // a RPC lê saldo e custo médio com `for update` dentro da própria transação.
  async post(id: ID, _ctx: IPostContext): Promise<IFiscalNote> {
    const { data, error } = await getSupabaseClient().rpc("post_fiscal_note", {
      p_note_id: id,
    });
    if (error) throw new Error(`[supabase] fiscalNotes.post(${id}) failed: ${error.message}`);
    const row = data as unknown as FiscalNoteRow;
    const [items, duplicates] = await hydrate(row.id);
    return rowToNote(row, items, duplicates);
  },

  async reverse(id: ID, _ctx: IPostContext): Promise<IFiscalNote> {
    const { data, error } = await getSupabaseClient().rpc("reverse_fiscal_note", {
      p_note_id: id,
    });
    if (error) throw new Error(`[supabase] fiscalNotes.reverse(${id}) failed: ${error.message}`);
    const row = data as unknown as FiscalNoteRow;
    const [items, duplicates] = await hydrate(row.id);
    return rowToNote(row, items, duplicates);
  },
};
