import type {
  ID,
  IFunnelBoardSummary,
  ILeadFunnel,
  ILeadFunnelEntry,
  ILeadFunnelStage,
  FunnelAccent,
  LeadFunnelStageKind,
} from "@/shared/types";
import type { ILeadFunnelsProvider } from "../../contracts/leadFunnels";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { planRemoveFromFunnel } from "@/features/funnels/engine/membershipRules";

/**
 * Supabase implementation of {@link ILeadFunnelsProvider}.
 *
 * snake_case rows <-> camelCase domain types. `store_id` and `seller_id` on
 * lead_funnel_entries are DERIVED by a before-insert trigger, so they are never
 * sent on write — anything the client provides is overwritten server-side.
 */

interface FunnelRow {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  accent: number;
  icon: string;
  position: number;
  is_default: boolean;
  open_to_store: boolean;
  entry_alert_threshold: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StageRow {
  id: string;
  funnel_id: string;
  name: string;
  accent: number;
  position: number;
  kind: LeadFunnelStageKind;
  created_at: string;
  updated_at: string;
}

interface EntryRow {
  id: string;
  lead_id: string;
  funnel_id: string;
  stage_id: string;
  store_id: string;
  seller_id: string | null;
  estimated_value: number | null;
  converted_to_customer_id: string | null;
  loss_reason: string | null;
  loss_notes: string | null;
  entered_stage_at: string;
  created_at: string;
  updated_at: string;
}

// NOTE: these must stay single string literals, not `+`-concatenated across
// lines — the `+` operator widens to the base `string` type (losing the
// literal), and postgrest-js's `.select()` overload needs a literal type to
// parse the column list at compile time. A widened `string` degrades the
// return type to `GenericStringError`, which then fails every `as FooRow`
// cast below with TS2352.
const FUNNEL_COLUMNS =
  "id, store_id, name, description, accent, icon, position, is_default, open_to_store, entry_alert_threshold, archived_at, created_at, updated_at";
const STAGE_COLUMNS = "id, funnel_id, name, accent, position, kind, created_at, updated_at";
const ENTRY_COLUMNS =
  "id, lead_id, funnel_id, stage_id, store_id, seller_id, estimated_value, converted_to_customer_id, loss_reason, loss_notes, entered_stage_at, created_at, updated_at";

function rowToFunnel(row: FunnelRow): ILeadFunnel {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    description: row.description ?? undefined,
    accent: row.accent as FunnelAccent,
    icon: row.icon,
    position: row.position,
    isDefault: row.is_default,
    openToStore: row.open_to_store,
    entryAlertThreshold: row.entry_alert_threshold,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToStage(row: StageRow): ILeadFunnelStage {
  return {
    id: row.id,
    funnelId: row.funnel_id,
    name: row.name,
    accent: row.accent as FunnelAccent,
    position: row.position,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEntry(row: EntryRow): ILeadFunnelEntry {
  return {
    id: row.id,
    leadId: row.lead_id,
    funnelId: row.funnel_id,
    stageId: row.stage_id,
    storeId: row.store_id,
    sellerId: row.seller_id,
    estimatedValue: row.estimated_value ?? undefined,
    convertedToCustomerId: row.converted_to_customer_id ?? undefined,
    lossReason: row.loss_reason ?? undefined,
    lossNotes: row.loss_notes ?? undefined,
    enteredStageAt: row.entered_stage_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseLeadFunnelsProvider: ILeadFunnelsProvider = {
  async listFunnels(storeId, opts) {
    let query = getSupabaseClient()
      .from("lead_funnels")
      .select(FUNNEL_COLUMNS)
      .eq("store_id", storeId)
      .order("position", { ascending: true });

    if (!opts?.includeArchived) query = query.is("archived_at", null);

    const { data, error } = await query;
    if (error) throw new Error(`[supabase] listFunnels(${storeId}) failed: ${error.message}`);
    return (data as FunnelRow[]).map(rowToFunnel);
  },

  async createFunnel(input) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnels")
      .insert({
        store_id: input.storeId,
        name: input.name,
        description: input.description ?? null,
        accent: input.accent,
        icon: input.icon,
        position: input.position,
        is_default: input.isDefault,
        open_to_store: input.openToStore,
        entry_alert_threshold: input.entryAlertThreshold,
      })
      .select(FUNNEL_COLUMNS)
      .single();

    if (error) throw new Error(`[supabase] createFunnel failed: ${error.message}`);
    return rowToFunnel(data as FunnelRow);
  },

  async updateFunnel(id, patch) {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description ?? null;
    if (patch.accent !== undefined) row.accent = patch.accent;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.position !== undefined) row.position = patch.position;
    if (patch.openToStore !== undefined) row.open_to_store = patch.openToStore;
    if (patch.entryAlertThreshold !== undefined)
      row.entry_alert_threshold = patch.entryAlertThreshold;
    // is_default and store_id are immutable in v1 (spec §2) — never applied here,
    // even if a caller's patch object happened to carry them.

    const { data, error } = await getSupabaseClient()
      .from("lead_funnels")
      .update(row)
      .eq("id", id)
      .select(FUNNEL_COLUMNS)
      .single();

    if (error) throw new Error(`[supabase] updateFunnel(${id}) failed: ${error.message}`);
    return rowToFunnel(data as FunnelRow);
  },

  async archiveFunnel(id) {
    const { error } = await getSupabaseClient()
      .from("lead_funnels")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("is_default", false);
    if (error) throw new Error(`[supabase] archiveFunnel(${id}) failed: ${error.message}`);
  },

  async listStages(funnelId) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_stages")
      .select(STAGE_COLUMNS)
      .eq("funnel_id", funnelId)
      .order("position", { ascending: true });
    if (error) throw new Error(`[supabase] listStages(${funnelId}) failed: ${error.message}`);
    return (data as StageRow[]).map(rowToStage);
  },

  async replaceStages(funnelId, next) {
    const client = getSupabaseClient();

    // Upsert by id; delete only the orphans. A delete-all would hit the FK from
    // lead_funnel_entries.stage_id (no cascade) with 23503.
    const { error: upsertError } = await client.from("lead_funnel_stages").upsert(
      next.map((s) => ({
        id: s.id,
        funnel_id: funnelId,
        name: s.name,
        accent: s.accent,
        position: s.position,
        kind: s.kind,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" },
    );
    if (upsertError) {
      throw new Error(
        `[supabase] replaceStages(${funnelId}) upsert failed: ${upsertError.message}`,
      );
    }

    const keptIds = next.map((s) => s.id);
    // A `.not("id", "in", "()")` with an empty list is malformed SQL (empty IN
    // clause) — when nothing is kept, every existing stage is an orphan, so
    // delete unconditionally for this funnel instead of building the `in (...)`
    // filter.
    const deleteResult =
      keptIds.length > 0
        ? await client
            .from("lead_funnel_stages")
            .delete()
            .eq("funnel_id", funnelId)
            .not("id", "in", `(${keptIds.join(",")})`)
        : await client.from("lead_funnel_stages").delete().eq("funnel_id", funnelId);
    if (deleteResult.error) {
      throw new Error(
        `[supabase] replaceStages(${funnelId}) delete failed: ${deleteResult.error.message}`,
      );
    }

    return this.listStages(funnelId);
  },

  async listAccess(funnelId) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_access")
      .select("seller_id")
      .eq("funnel_id", funnelId);
    if (error) throw new Error(`[supabase] listAccess(${funnelId}) failed: ${error.message}`);
    return (data as Array<{ seller_id: string }>).map((r) => r.seller_id);
  },

  async replaceAccess(funnelId, sellerIds) {
    const client = getSupabaseClient();
    const { error: deleteError } = await client
      .from("lead_funnel_access")
      .delete()
      .eq("funnel_id", funnelId);
    if (deleteError) {
      throw new Error(
        `[supabase] replaceAccess(${funnelId}) delete failed: ${deleteError.message}`,
      );
    }
    if (sellerIds.length === 0) return;

    const { error: insertError } = await client
      .from("lead_funnel_access")
      .insert(sellerIds.map((sellerId) => ({ funnel_id: funnelId, seller_id: sellerId })));
    if (insertError) {
      throw new Error(
        `[supabase] replaceAccess(${funnelId}) insert failed: ${insertError.message}`,
      );
    }
  },

  // The four calls below hit RPCs created in Task 16 — they do not exist yet.
  // This file compiles and typechecks against them; they only fail at runtime,
  // against a database where that migration hasn't run.

  async listAccessibleFunnelIds(storeId) {
    const { data, error } = await getSupabaseClient().rpc("accessible_lead_funnel_ids", {
      p_store_id: storeId,
    });
    if (error) {
      throw new Error(`[supabase] listAccessibleFunnelIds(${storeId}) failed: ${error.message}`);
    }
    return (data as Array<{ funnel_id: string }>).map((r) => r.funnel_id);
  },

  async countLeadsByFunnel(storeId) {
    const { data, error } = await getSupabaseClient().rpc("count_leads_by_funnel", {
      p_store_id: storeId,
    });
    if (error)
      throw new Error(`[supabase] countLeadsByFunnel(${storeId}) failed: ${error.message}`);
    const result: Record<ID, number> = {};
    for (const row of data as Array<{ funnel_id: string; lead_count: number }>) {
      result[row.funnel_id] = row.lead_count;
    }
    return result;
  },

  async getBoardSummary(funnelId) {
    const { data, error } = await getSupabaseClient().rpc("lead_funnel_board_summary", {
      p_funnel_id: funnelId,
    });
    if (error) throw new Error(`[supabase] getBoardSummary(${funnelId}) failed: ${error.message}`);
    return (
      data as Array<{
        stage_id: string;
        lead_count: number;
        sum_value: number | null;
        overdue_count: number;
      }>
    ).map(
      (row) =>
        ({
          stageId: row.stage_id,
          count: row.lead_count,
          sumValue: row.sum_value ?? 0,
          overdueCount: row.overdue_count,
        }) satisfies IFunnelBoardSummary,
    );
  },

  async listEntriesByLead(leadId) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_entries")
      .select(ENTRY_COLUMNS)
      .eq("lead_id", leadId);
    if (error) throw new Error(`[supabase] listEntriesByLead(${leadId}) failed: ${error.message}`);
    return (data as EntryRow[]).map(rowToEntry);
  },

  async listEntriesByFunnel(funnelId) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_entries")
      .select(ENTRY_COLUMNS)
      .eq("funnel_id", funnelId);
    if (error)
      throw new Error(`[supabase] listEntriesByFunnel(${funnelId}) failed: ${error.message}`);
    return (data as EntryRow[]).map(rowToEntry);
  },

  async listEntriesViaConversation(conversationId) {
    const { data, error } = await getSupabaseClient().rpc("lead_funnel_entries_via_conversation", {
      p_conversation_id: conversationId,
    });
    if (error) {
      throw new Error(
        `[supabase] listEntriesViaConversation(${conversationId}) failed: ${error.message}`,
      );
    }
    return (data as EntryRow[]).map(rowToEntry);
  },

  async addEntry(leadId, funnelId, stageId) {
    const client = getSupabaseClient();

    let targetStageId = stageId;
    if (!targetStageId) {
      const { data, error } = await client
        .from("lead_funnel_stages")
        .select("id")
        .eq("funnel_id", funnelId)
        .eq("kind", "entrada")
        .single();
      if (error) throw new Error(`[supabase] addEntry: no entry stage: ${error.message}`);
      targetStageId = (data as { id: string }).id;
    }

    // store_id and seller_id are omitted on purpose: the before-insert trigger
    // derives them from the lead. store_id is NOT NULL, so a placeholder is
    // required to satisfy the parser; the trigger overwrites it.
    const { data, error } = await client
      .from("lead_funnel_entries")
      .insert({
        lead_id: leadId,
        funnel_id: funnelId,
        stage_id: targetStageId,
        store_id: "00000000-0000-0000-0000-000000000000",
      })
      .select(ENTRY_COLUMNS)
      .single();

    if (error)
      throw new Error(`[supabase] addEntry(${leadId}, ${funnelId}) failed: ${error.message}`);
    return rowToEntry(data as EntryRow);
  },

  async moveEntry(entryId, stageId) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_entries")
      .update({
        stage_id: stageId,
        entered_stage_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .select(ENTRY_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] moveEntry(${entryId}) failed: ${error.message}`);
    return rowToEntry(data as EntryRow);
  },

  async updateEntry(entryId, patch) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_entries")
      .update({
        estimated_value: patch.estimatedValue ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .select(ENTRY_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] updateEntry(${entryId}) failed: ${error.message}`);
    return rowToEntry(data as EntryRow);
  },

  async removeEntry(entryId) {
    const client = getSupabaseClient();

    const { data: targetRow, error: readError } = await client
      .from("lead_funnel_entries")
      .select(ENTRY_COLUMNS)
      .eq("id", entryId)
      .single();
    if (readError)
      throw new Error(`[supabase] removeEntry(${entryId}) read failed: ${readError.message}`);
    const target = rowToEntry(targetRow as EntryRow);

    const existing = await this.listEntriesByLead(target.leadId);

    const { data: funnelRows, error: funnelError } = await client
      .from("lead_funnels")
      .select(FUNNEL_COLUMNS)
      .eq("store_id", target.storeId)
      .eq("is_default", true)
      .single();
    if (funnelError)
      throw new Error(`[supabase] removeEntry: no default funnel: ${funnelError.message}`);
    const defaultFunnel = rowToFunnel(funnelRows as FunnelRow);
    const defaultStages = await this.listStages(defaultFunnel.id);

    // Delegate the "never leave a lead with zero memberships" rule to the
    // engine — this provider only executes the plan it returns.
    const plan = planRemoveFromFunnel({
      existing,
      entryId,
      defaultFunnel,
      defaultFunnelStages: defaultStages,
    });

    if (plan.action !== "remove") {
      throw new Error(`[supabase] cannot remove membership: ${plan.reason}`);
    }

    const { error: deleteError } = await client
      .from("lead_funnel_entries")
      .delete()
      .eq("id", entryId);
    if (deleteError)
      throw new Error(`[supabase] removeEntry(${entryId}) failed: ${deleteError.message}`);

    if (plan.movedToDefault && plan.recreateInFunnelId && plan.recreateInStageId) {
      await this.addEntry(target.leadId, plan.recreateInFunnelId, plan.recreateInStageId);
    }

    return { movedToDefault: plan.movedToDefault };
  },
};
