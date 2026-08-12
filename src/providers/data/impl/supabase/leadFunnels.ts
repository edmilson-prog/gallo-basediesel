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
import { planAddToFunnel, planRemoveFromFunnel } from "@/features/funnels/engine/membershipRules";

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

/** The writable half of a stage. `created_at` keeps its column default. */
function toStageRow(stage: Omit<ILeadFunnelStage, "funnelId">) {
  return {
    id: stage.id,
    name: stage.name,
    accent: stage.accent,
    position: stage.position,
    kind: stage.kind,
    updated_at: new Date().toISOString(),
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

  async createFunnelWithStages(input, newStages) {
    const created = await this.createFunnel(input);

    // PostgREST gives each request its own transaction, so the funnel above is
    // already committed. Until this pair moves behind a single RPC, the second
    // write is followed by a compensating delete: a funnel with no stages is
    // unusable AND holds its name against `lead_funnels_unique_name`, so
    // leaving it behind breaks the retry as well as the attempt.
    try {
      const { error } = await getSupabaseClient()
        .from("lead_funnel_stages")
        .insert(newStages.map((s) => ({ ...toStageRow(s), funnel_id: created.id })));
      if (error) throw new Error(`[supabase] createFunnelWithStages stages: ${error.message}`);
    } catch (cause) {
      // A brand-new funnel has no memberships, so the delete cannot hit the FK
      // from lead_funnel_entries; the stages themselves cascade.
      const { error: undoError } = await getSupabaseClient()
        .from("lead_funnels")
        .delete()
        .eq("id", created.id);
      if (undoError) {
        throw new Error(
          `[supabase] createFunnelWithStages failed and the funnel ${created.id} could not be ` +
            `removed (${undoError.message}) — original cause: ${(cause as Error).message}`,
        );
      }
      throw cause;
    }

    return created;
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
    // `.eq("is_default", false)` means a default funnel matches zero rows —
    // `.single()` turns that (and a plain not-found) into an error instead of
    // a silent no-op update, matching the mock's explicit throw.
    const { error } = await getSupabaseClient()
      .from("lead_funnels")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("is_default", false)
      .select("id")
      .single();
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
      next.map((s) => ({ ...toStageRow(s), funnel_id: funnelId })),
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

    // Upsert the new grants BEFORE deleting the stale ones — same non-destructive
    // ordering as replaceStages, and for the same reason: two non-transactional
    // PostgREST calls means a mid-failure must never leave FEWER grants than
    // before. Delete-then-insert (the previous order) made every grant durable-
    // gone the instant the delete committed, so an insert failure (dropped
    // connection, stale seller_id FK 23503, RLS with-check rejection) silently
    // locked every previously-granted seller out of a restricted funnel with no
    // way for a retry to say the grants were destroyed.
    if (sellerIds.length > 0) {
      const { error: upsertError } = await client.from("lead_funnel_access").upsert(
        sellerIds.map((sellerId) => ({ funnel_id: funnelId, seller_id: sellerId })),
        { onConflict: "funnel_id,seller_id" },
      );
      if (upsertError) {
        throw new Error(
          `[supabase] replaceAccess(${funnelId}) upsert failed: ${upsertError.message}`,
        );
      }
    }

    const keptIds = sellerIds;
    // Same empty-`in ()` hazard as replaceStages: a `.not("seller_id", "in", "()")`
    // with an empty list is malformed SQL. When nothing is kept, every existing
    // grant for this funnel is an orphan, so delete unconditionally for this
    // funnel instead of building the `in (...)` filter.
    const deleteResult =
      keptIds.length > 0
        ? await client
            .from("lead_funnel_access")
            .delete()
            .eq("funnel_id", funnelId)
            .not("seller_id", "in", `(${keptIds.join(",")})`)
        : await client.from("lead_funnel_access").delete().eq("funnel_id", funnelId);
    if (deleteResult.error) {
      throw new Error(
        `[supabase] replaceAccess(${funnelId}) delete failed: ${deleteResult.error.message}`,
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
    // `count_leads_by_funnel` groups over lead_funnel_entries, so a funnel with
    // zero memberships produces NO row — pre-fill every active funnel with 0
    // before overlaying the RPC's rows, so the returned map always has an
    // entry per funnel (matching the mock) instead of `undefined` on the
    // first empty one.
    const [activeFunnels, rpcResult] = await Promise.all([
      this.listFunnels(storeId),
      getSupabaseClient().rpc("count_leads_by_funnel", { p_store_id: storeId }),
    ]);
    const { data, error } = rpcResult;
    if (error)
      throw new Error(`[supabase] countLeadsByFunnel(${storeId}) failed: ${error.message}`);
    const result: Record<ID, number> = {};
    for (const funnel of activeFunnels) result[funnel.id] = 0;
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

    // Route through the same guard the mock's addEntry uses (planAddToFunnel)
    // instead of inserting directly. Without it, a double-click on "Adicionar
    // ao funil" hit the unique constraint on (lead_id, funnel_id) and surfaced
    // 'duplicate key value violates unique constraint "lead_funnel_entries_
    // unique"' — a raw, untranslated Postgres string — in a pt-BR UI where the
    // contract says a re-add is a silent noop. An explicit stageId belonging
    // to a different funnel now also surfaces the engine's typed
    // 'invalid_stage' reason instead of an FK/CHECK violation.
    const [funnelResult, stagesResult, existing, leadResult] = await Promise.all([
      client.from("lead_funnels").select(FUNNEL_COLUMNS).eq("id", funnelId).single(),
      client.from("lead_funnel_stages").select(STAGE_COLUMNS).eq("funnel_id", funnelId),
      this.listEntriesByLead(leadId),
      client.from("leads").select("estimated_value").eq("id", leadId).single(),
    ]);

    if (funnelResult.error) {
      throw new Error(
        `[supabase] addEntry: funnel ${funnelId} not found: ${funnelResult.error.message}`,
      );
    }
    if (stagesResult.error) {
      throw new Error(
        `[supabase] addEntry: stages for funnel ${funnelId} failed: ${stagesResult.error.message}`,
      );
    }
    if (leadResult.error) {
      throw new Error(`[supabase] addEntry: lead ${leadId} not found: ${leadResult.error.message}`);
    }

    const funnel = rowToFunnel(funnelResult.data as FunnelRow);
    const stages = (stagesResult.data as StageRow[]).map(rowToStage);
    const leadEstimatedValue =
      (leadResult.data as { estimated_value: number | null }).estimated_value ?? undefined;

    const plan = planAddToFunnel({ existing, funnel, stages, leadEstimatedValue, stageId });

    if (plan.action === "error") {
      throw new Error(`[supabase] cannot add to funnel: ${plan.reason}`);
    }
    if (plan.action === "noop") {
      const already = existing.find((e) => e.funnelId === funnelId);
      if (!already) throw new Error("[supabase] inconsistent membership state");
      return already;
    }

    // store_id and seller_id are omitted on purpose: the before-insert trigger
    // derives them from the lead. store_id is NOT NULL, so a placeholder is
    // required to satisfy the parser; the trigger overwrites it. estimated_value
    // is likewise omitted here — the trigger fills it from the lead when it is
    // NULL, which is exactly `plan.estimatedValue`'s source (the lead's current
    // value), read fresh at insert time rather than from our slightly-earlier
    // fetch.
    const { data, error } = await client
      .from("lead_funnel_entries")
      .insert({
        lead_id: leadId,
        funnel_id: plan.funnelId,
        stage_id: plan.stageId,
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
    // `estimatedValue` is optional on the patch type: an ABSENT key must leave
    // the column untouched, while an explicit `undefined`/`null` clears it. A
    // bare `patch.estimatedValue ?? null` cannot tell those apart — `{}` would
    // null out the value on every call. `"in"` distinguishes key-presence from
    // value-presence.
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("estimatedValue" in patch) {
      row.estimated_value = patch.estimatedValue ?? null;
    }

    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_entries")
      .update(row)
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

    // Create-then-delete, not delete-then-create: if a movedToDefault recreate
    // fails partway, the transient state is TWO memberships (harmless — they
    // are in different funnels, so the unique index on (lead_id, funnel_id)
    // tolerates it) rather than ZERO, which is exactly the invariant this
    // whole flow exists to protect.
    //
    // This recreate deliberately bypasses `this.addEntry` (and its
    // planAddToFunnel guard): it is engine-computed by planRemoveFromFunnel
    // above, not a user request that could be a stale duplicate, so the
    // funnel/stage pairing is already known-good. It also needs write access
    // `addEntry` doesn't expose — see the CONTRACT note below.
    //
    // CONTRACT (mirrored by the mock's removeEntry — keep both in sync):
    //   - estimatedValue CARRIES OVER from the removed membership, explicitly.
    //     `lead_funnel_entries_derive_owner` only fills estimated_value from
    //     the LEAD when the inserted value is NULL, so leaving it out here
    //     would silently substitute the lead's (different) number and corrupt
    //     the forecast — the exact bug this fix closes.
    //   - lossReason / lossNotes / convertedToCustomerId are explicitly
    //     CLEARED, not carried over. Moving back to the default/triage funnel
    //     means the lead is once again an OPEN opportunity, not a closed or
    //     converted one dragged back into an active pipeline.
    if (plan.movedToDefault && plan.recreateInFunnelId && plan.recreateInStageId) {
      const { error: recreateError } = await client.from("lead_funnel_entries").insert({
        lead_id: target.leadId,
        funnel_id: plan.recreateInFunnelId,
        stage_id: plan.recreateInStageId,
        store_id: "00000000-0000-0000-0000-000000000000",
        estimated_value: target.estimatedValue ?? null,
        converted_to_customer_id: null,
        loss_reason: null,
        loss_notes: null,
      });
      if (recreateError) {
        throw new Error(
          `[supabase] removeEntry(${entryId}) recreate-in-default failed: ${recreateError.message}`,
        );
      }
    }

    // `.select().single()` proves the delete actually affected a row. Without
    // it, an RLS-blocked delete (e.g. a pool attendant who can SELECT this
    // membership via seller_handles_lead but isn't covered by the DELETE
    // policy, which deliberately omits that branch) matches zero rows,
    // PostgREST returns no error, and the caller was told `movedToDefault`
    // succeeded while the membership silently survives — the card would
    // reappear on the next refetch with no error ever surfaced.
    const { error: deleteError } = await client
      .from("lead_funnel_entries")
      .delete()
      .eq("id", entryId)
      .select("id")
      .single();
    if (deleteError)
      throw new Error(`[supabase] removeEntry(${entryId}) failed: ${deleteError.message}`);

    return { movedToDefault: plan.movedToDefault };
  },
};
