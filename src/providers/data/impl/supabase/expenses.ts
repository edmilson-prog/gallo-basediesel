import type {
  ExpenseCategory,
  ExpenseStatus,
  IExpense,
  IExpenseRecurrence,
  ID,
} from "@/shared/types";
import type {
  ExpenseSeriesScope,
  ICancelExpenseInput,
  ICancelExpenseSeriesInput,
  ICreateExpenseInput,
  IExpensesProvider,
  IListExpensesParams,
  IMarkExpensePaidInput,
  IUpdateExpenseSeriesInput,
} from "../../contracts/expenses";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IExpensesProvider} (PRD-054 / PRD-120+).
 *
 * snake_case `expenses` table ↔ camelCase {@link IExpense} via `rowToExpense`.
 * The recurrence config of a "mother" entry is stored as a `recurrence_config`
 * jsonb column and rehydrated verbatim; per-occurrence dates (competence/due/
 * payment) live in their own timestamptz columns. The `created_by` actor id is a
 * plain text column (no FK — it may reference any actor, not only a seller).
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/series/markPaid/cancel/markOverdue) require the write policies
 * that land with PRD-103.
 */

interface ExpenseRow {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  competence_date: string;
  payment_date: string | null;
  status: ExpenseStatus;
  due_date: string | null;
  is_recurring: boolean;
  recurrence_parent_id: string | null;
  recurrence_config: IExpenseRecurrence | null;
  supplier: string | null;
  payment_method: IExpense["paymentMethod"] | null;
  attachment_url: string | null;
  notes: string | null;
  store_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const TABLE = "expenses";
const COLUMNS =
  "id, description, category, amount, competence_date, payment_date, status, due_date, " +
  "is_recurring, recurrence_parent_id, recurrence_config, supplier, payment_method, " +
  "attachment_url, notes, store_id, created_by, created_at, updated_at";

/** Fields safe to propagate across a series (per-occurrence dates excluded). */
const SERIES_SAFE_FIELDS: (keyof IExpense)[] = [
  "description",
  "category",
  "amount",
  "supplier",
  "paymentMethod",
  "notes",
];

function rowToExpense(row: ExpenseRow): IExpense {
  return {
    id: row.id,
    description: row.description,
    category: row.category,
    amount: row.amount,
    competenceDate: row.competence_date,
    paymentDate: row.payment_date ?? undefined,
    status: row.status,
    dueDate: row.due_date ?? undefined,
    isRecurring: row.is_recurring,
    recurrenceParentId: row.recurrence_parent_id ?? undefined,
    recurrenceConfig: row.recurrence_config ?? undefined,
    supplier: row.supplier ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    attachmentUrl: row.attachment_url ?? undefined,
    notes: row.notes ?? undefined,
    storeId: row.store_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt`/
 *  `createdBy` are immutable and never written; `updatedAt` is set by callers. */
function expensePatchToRow(patch: Partial<IExpense>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.competenceDate !== undefined) row.competence_date = patch.competenceDate;
  if (patch.paymentDate !== undefined) row.payment_date = patch.paymentDate;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.isRecurring !== undefined) row.is_recurring = patch.isRecurring;
  if (patch.recurrenceParentId !== undefined) row.recurrence_parent_id = patch.recurrenceParentId;
  if (patch.recurrenceConfig !== undefined) row.recurrence_config = patch.recurrenceConfig;
  if (patch.supplier !== undefined) row.supplier = patch.supplier;
  if (patch.paymentMethod !== undefined) row.payment_method = patch.paymentMethod;
  if (patch.attachmentUrl !== undefined) row.attachment_url = patch.attachmentUrl;
  if (patch.notes !== undefined) row.notes = patch.notes;
  return row;
}

/** Maps a create input onto a full insert row, including the immutable `id`. */
function createInputToRow(
  input: ICreateExpenseInput,
  id: string,
  status: ExpenseStatus,
  nowIso: string,
): Record<string, unknown> {
  return {
    id,
    description: input.description,
    category: input.category,
    amount: input.amount,
    competence_date: input.competenceDate,
    payment_date: input.paymentDate ?? null,
    status,
    due_date: input.dueDate ?? null,
    is_recurring: input.isRecurring,
    recurrence_parent_id: null,
    recurrence_config: input.recurrenceConfig ?? null,
    supplier: input.supplier ?? null,
    payment_method: input.paymentMethod ?? null,
    attachment_url: input.attachmentUrl ?? null,
    notes: input.notes ?? null,
    store_id: input.storeId,
    created_by: input.createdBy,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

let createdSeq = 0;
function nextId(): ID {
  createdSeq += 1;
  return `exp-rt-${String(Date.now()).slice(-6)}-${createdSeq}`;
}

/** Add `months` to a base ISO date, snapping to the 1st of the month (UTC). */
function competenceFor(base: Date, monthsAhead: number): string {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthsAhead, 1),
  ).toISOString();
}

function dueFor(base: Date, monthsAhead: number, dayOfMonth: number): string {
  const day = Math.min(Math.max(1, dayOfMonth), 28);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthsAhead, day),
  ).toISOString();
}

/** Number + step of occurrences (including the mother) for a recurrence. */
function recurrencePlan(config: IExpenseRecurrence): { count: number; step: number } {
  switch (config.frequency) {
    case "mensal":
      return { count: 12, step: 1 };
    case "trimestral":
      return { count: 4, step: 3 };
    case "anual":
      return { count: 2, step: 12 };
    default:
      return { count: 1, step: 1 };
  }
}

/** Resolve the members of a recurring series for the given target + scope. */
async function seriesMembers(target: IExpense, scope: ExpenseSeriesScope): Promise<IExpense[]> {
  if (scope === "one") return [target];
  const rootId = target.recurrenceParentId ?? target.id;
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select(COLUMNS)
    .or(`id.eq.${rootId},recurrence_parent_id.eq.${rootId}`);
  if (error) throw new Error(`[supabase] expenses.seriesMembers failed: ${error.message}`);
  const all = (data as unknown as ExpenseRow[]).map(rowToExpense);
  if (scope === "future") {
    return all.filter((e) => e.competenceDate >= target.competenceDate);
  }
  return all;
}

async function getExpense(id: ID, method: string): Promise<IExpense> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .single();
  if (error) throw new Error(`[supabase] expenses.${method}(${id}) failed: ${error.message}`);
  return rowToExpense(data as unknown as ExpenseRow);
}

export const supabaseExpensesProvider: IExpensesProvider = {
  async list(params: IListExpensesParams = {}): Promise<IPaginatedResult<IExpense>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.categories && params.categories.length > 0) {
      query = query.in("category", params.categories);
    }
    if (params.statuses && params.statuses.length > 0) {
      query = query.in("status", params.statuses);
    }
    if (params.supplier) query = query.ilike("supplier", `%${params.supplier}%`);
    if (params.paymentMethod) query = query.eq("payment_method", params.paymentMethod);
    if (params.competenceStart) query = query.gte("competence_date", params.competenceStart);
    if (params.competenceEnd) query = query.lte("competence_date", params.competenceEnd);
    if (params.paymentStart) query = query.gte("payment_date", params.paymentStart);
    if (params.paymentEnd) query = query.lte("payment_date", params.paymentEnd);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("competence_date", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] expenses.list failed: ${error.message}`);

    return {
      data: (data as unknown as ExpenseRow[]).map(rowToExpense),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async create(input: ICreateExpenseInput): Promise<IExpense> {
    // Mirror the mock's input guards before touching the table.
    if (input.amount <= 0) {
      throw new Error(
        "[supabase] expenses.create failed: O valor da despesa deve ser maior que zero.",
      );
    }
    if (!input.competenceDate) {
      throw new Error("[supabase] expenses.create failed: A competência é obrigatória.");
    }
    if (input.dueDate && input.dueDate < input.competenceDate) {
      throw new Error(
        "[supabase] expenses.create failed: O vencimento não pode ser anterior à competência.",
      );
    }

    const now = new Date().toISOString();
    const status: ExpenseStatus = input.status ?? (input.paymentDate ? "pago" : "pendente");
    const motherId = nextId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from(TABLE)
      .insert(createInputToRow(input, motherId, status, now))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] expenses.create failed: ${error.message}`);
    const mother = rowToExpense(data as unknown as ExpenseRow);

    // Recurring series — generate the future occurrences (RF-014). Children
    // inherit the mother's details but carry per-occurrence dates and reset
    // payment/status to `pendente`.
    if (mother.isRecurring && mother.recurrenceConfig) {
      const base = new Date(mother.competenceDate);
      const { count, step } = recurrencePlan(mother.recurrenceConfig);
      const endDate = mother.recurrenceConfig.endDate;
      const children: Record<string, unknown>[] = [];
      for (let i = 1; i < count; i += 1) {
        const competenceDate = competenceFor(base, i * step);
        if (endDate && competenceDate > endDate) break;
        children.push({
          id: nextId(),
          description: mother.description,
          category: mother.category,
          amount: mother.amount,
          competence_date: competenceDate,
          payment_date: null,
          status: "pendente" as ExpenseStatus,
          due_date: dueFor(base, i * step, mother.recurrenceConfig.dayOfMonth),
          is_recurring: true,
          recurrence_parent_id: mother.id,
          recurrence_config: null,
          supplier: mother.supplier ?? null,
          payment_method: mother.paymentMethod ?? null,
          attachment_url: mother.attachmentUrl ?? null,
          notes: mother.notes ?? null,
          store_id: mother.storeId,
          created_by: mother.createdBy,
          created_at: now,
          updated_at: now,
        });
      }
      if (children.length > 0) {
        const { error: childError } = await client.from(TABLE).insert(children);
        if (childError) {
          throw new Error(`[supabase] expenses.create (series) failed: ${childError.message}`);
        }
      }
    }
    return mother;
  },

  async update(id: ID, patch: Partial<IExpense>): Promise<IExpense> {
    if (patch.amount !== undefined && patch.amount <= 0) {
      throw new Error(
        "[supabase] expenses.update failed: O valor da despesa deve ser maior que zero.",
      );
    }
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...expensePatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] expenses.update(${id}) failed: ${error.message}`);
    return rowToExpense(data as unknown as ExpenseRow);
  },

  async updateSeries(input: IUpdateExpenseSeriesInput): Promise<IExpense[]> {
    if (input.patch.amount !== undefined && input.patch.amount <= 0) {
      throw new Error(
        "[supabase] expenses.updateSeries failed: O valor da despesa deve ser maior que zero.",
      );
    }
    const target = await getExpense(input.id, "updateSeries");
    const now = new Date().toISOString();
    const members = await seriesMembers(target, input.scope);

    // Only the series-safe fields propagate to non-target members; per-occurrence
    // dates stay individual. The target receives the full patch.
    const safePatch: Partial<IExpense> = {};
    for (const field of SERIES_SAFE_FIELDS) {
      if (input.patch[field] !== undefined) {
        (safePatch as Record<string, unknown>)[field] = input.patch[field];
      }
    }
    const client = getSupabaseClient();
    const updated: IExpense[] = [];
    for (const member of members) {
      const patch = member.id === input.id ? { ...input.patch } : { ...safePatch };
      const { data, error } = await client
        .from(TABLE)
        .update({ ...expensePatchToRow(patch), updated_at: now })
        .eq("id", member.id)
        .select(COLUMNS)
        .single();
      if (error) {
        throw new Error(`[supabase] expenses.updateSeries(${member.id}) failed: ${error.message}`);
      }
      updated.push(rowToExpense(data as unknown as ExpenseRow));
    }
    return updated;
  },

  async markPaid(input: IMarkExpensePaidInput): Promise<IExpense> {
    const current = await getExpense(input.id, "markPaid");
    if (current.status === "cancelado") {
      throw new Error("[supabase] expenses.markPaid failed: Despesa cancelada não pode ser paga.");
    }
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        status: "pago" as ExpenseStatus,
        payment_date: input.paymentDate,
        payment_method: input.paymentMethod ?? current.paymentMethod ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] expenses.markPaid(${input.id}) failed: ${error.message}`);
    return rowToExpense(data as unknown as ExpenseRow);
  },

  async cancel(input: ICancelExpenseInput): Promise<IExpense> {
    const current = await getExpense(input.id, "cancel");
    const notes = input.reason
      ? [current.notes, `Cancelada: ${input.reason}`].filter(Boolean).join(" — ")
      : current.notes;
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        status: "cancelado" as ExpenseStatus,
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] expenses.cancel(${input.id}) failed: ${error.message}`);
    return rowToExpense(data as unknown as ExpenseRow);
  },

  async cancelSeries(input: ICancelExpenseSeriesInput): Promise<IExpense[]> {
    const target = await getExpense(input.id, "cancelSeries");
    const now = new Date().toISOString();
    const members = (await seriesMembers(target, input.scope)).filter(
      (e) => e.status !== "cancelado",
    );
    const client = getSupabaseClient();
    const updated: IExpense[] = [];
    for (const member of members) {
      const notes = input.reason
        ? [member.notes, `Cancelada: ${input.reason}`].filter(Boolean).join(" — ")
        : member.notes;
      const { data, error } = await client
        .from(TABLE)
        .update({
          status: "cancelado" as ExpenseStatus,
          notes: notes ?? null,
          updated_at: now,
        })
        .eq("id", member.id)
        .select(COLUMNS)
        .single();
      if (error) {
        throw new Error(`[supabase] expenses.cancelSeries(${member.id}) failed: ${error.message}`);
      }
      updated.push(rowToExpense(data as unknown as ExpenseRow));
    }
    return updated;
  },

  async markOverdue(nowIso: string = new Date().toISOString()): Promise<IExpense[]> {
    // Daily timer (RF-017): flag every `pendente` expense whose `dueDate` is in
    // the past as `atrasado`. A single guarded UPDATE matches the same predicate
    // the mock filters on and returns the rows that transitioned.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "atrasado" as ExpenseStatus, updated_at: nowIso })
      .eq("status", "pendente")
      .not("due_date", "is", null)
      .lt("due_date", nowIso)
      .select(COLUMNS);
    if (error) throw new Error(`[supabase] expenses.markOverdue failed: ${error.message}`);
    return (data as unknown as ExpenseRow[]).map(rowToExpense);
  },
};
