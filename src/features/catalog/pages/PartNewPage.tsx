import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { PartForm } from "../components/form/PartForm";
import {
  blankPartFormValues,
  type IPartFormValues,
} from "../components/form/new-part/partFormValues";
import { PartChip } from "../components/detail/PartChip";
import { draftsToApplications } from "../utils/applicationDrafts";
import { useEquivalentsBidirectional } from "../hooks/useEquivalentsBidirectional";
import { usePartCodeLookup } from "../hooks/usePartCodeLookup";
import { isSaleReady, resolveStandardPrice } from "../engine/newPart";
import { CATALOG_STRINGS } from "../i18n/pt-BR";

const COPY = CATALOG_STRINGS.newPart;

function parseOemCodes(primary: string, alternatives: string): string[] {
  const alts = alternatives
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [primary.trim(), ...alts].filter(Boolean);
}

export interface IPartNewSearch {
  from?: ID;
}

export function validatePartNewSearch(raw: Record<string, unknown>): IPartNewSearch {
  const out: IPartNewSearch = {};
  if (typeof raw.from === "string" && raw.from.length > 0) out.from = raw.from;
  return out;
}

export function PartNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentStoreId } = useCurrentStore();
  const provider = usePartsProvider();
  const bidirectional = useEquivalentsBidirectional();
  const search = useSearch({ from: "/app/catalogo/novo" }) as IPartNewSearch;

  const [source, setSource] = useState<IPart | undefined>(undefined);
  const [values, setValues] = useState<IPartFormValues>(() => blankPartFormValues());
  const [saving, setSaving] = useState(false);
  // Remounting the form is how "salvar e cadastrar outra" clears it; the seed
  // carries over what a second line of the same invoice will repeat anyway.
  const [formKey, setFormKey] = useState(0);
  const [seed, setSeed] = useState<Partial<IPartFormValues> | undefined>(undefined);

  const { state: codeState, duplicate } = usePartCodeLookup(values.code, source?.id);

  const openPart = useCallback(
    (id: ID) => void navigate({ to: "/app/catalogo/$id", params: { id } }),
    [navigate],
  );

  // Load the duplicate source, when arriving from "Duplicar peça".
  useEffect(() => {
    if (!search.from) return;
    let cancelled = false;
    provider
      .get(search.from)
      .then((found) => {
        if (cancelled) return;
        // Strip identity to make a true duplicate template.
        setSource({
          ...found,
          name: `${found.name} (cópia)`,
          oemCodes: [],
          equivalentPartIds: [],
        });
        toast.info(CATALOG_STRINGS.toasts.duplicated);
      })
      .catch(() => {
        // ignore — fall back to a blank form
      });
    return () => {
      cancelled = true;
    };
  }, [search.from, provider]);

  const handleSubmit = async (
    submitted: IPartFormValues,
    { andAnother }: { andAnother: boolean },
  ) => {
    const oemCodes = parseOemCodes(submitted.code, submitted.oemAlternatives);
    const primaryOem = oemCodes[0];
    if (!primaryOem) return;

    const cost = Number(submitted.unitCost) || 0;
    const markup = (Number(submitted.markupPercent) || 0) / 100;
    const unitPrice = resolveStandardPrice({
      unitCost: cost,
      markupPercent: markup,
      directPrice: Number(submitted.directPrice) || 0,
    });

    setSaving(true);
    try {
      // Last-moment guard: the live lookup can be a few seconds old, and two
      // people registering the same invoice is exactly how this races.
      try {
        const clash = await provider.findByOem(primaryOem);
        if (clash.length > 0) {
          toast.error(CATALOG_STRINGS.form.duplicateOemError);
          return;
        }
      } catch {
        // The catalog is unreachable — the live guard already failed open, and
        // blocking here would strand the person with a part in their hand.
      }

      const now = new Date();
      const sku = `GAL-NEW-${now.getTime().toString().slice(-6)}`;
      const tempId = `temp-${sku.toLowerCase()}`;
      const created = await provider.create({
        sku,
        name: submitted.name.trim(),
        description: submitted.description.trim() || undefined,
        oemCodes,
        equivalentPartIds: submitted.equivalentPartIds,
        crossReferences:
          submitted.crossReferences.length > 0 ? submitted.crossReferences : undefined,
        applications: draftsToApplications(submitted.applications, tempId),
        brand: submitted.brand.trim(),
        supplier: submitted.supplier.trim(),
        category: submitted.category,
        subcategory: submitted.subcategory,
        isOriginal: submitted.isOriginal,
        unitCost: cost,
        unitPrice,
        // The five ERP tables are derived from cost + markup on read
        // (`resolvePriceTables`), so storing a snapshot here would only create a
        // copy that goes stale the first time someone edits the cost.
        marginPercent: cost > 0 ? markup : 0,
        stockAvailable: Number(submitted.stockAvailable) || 0,
        stockMinimum: Number(submitted.stockMinimum) || 0,
        division: "parts",
        active: true,
        storeId: currentStoreId ?? undefined,
      });

      auditLog({
        action: "part_create",
        resource: "part",
        resourceId: created.id,
        after: {
          name: created.name,
          oemCodes: created.oemCodes,
          brand: created.brand,
          unitPrice: created.unitPrice,
        },
      });

      await bidirectional.reconcile(created.id, [], submitted.equivalentPartIds);
      await queryClient.invalidateQueries({ queryKey: ["catalog-list"] });

      const ready = isSaleReady({
        code: submitted.code,
        name: submitted.name,
        brand: submitted.brand,
        category: submitted.category,
        unitCost: cost,
        markupPercent: markup,
        directPrice: Number(submitted.directPrice) || 0,
        applicationCount: submitted.applications.length,
      });
      toast.success(ready ? COPY.toasts.savedReady : COPY.toasts.savedIncomplete, {
        description: andAnother ? COPY.toasts.keptForNext : undefined,
      });

      if (andAnother) {
        const carried: Partial<IPartFormValues> = {
          brand: submitted.brand,
          category: submitted.category,
          subcategory: submitted.subcategory,
          markupPercent: submitted.markupPercent,
          supplier: submitted.supplier,
        };
        setSource(undefined);
        setSeed(carried);
        setValues(blankPartFormValues(carried));
        setFormKey((k) => k + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      void navigate({ to: "/app/catalogo/$id", params: { id: created.id } });
    } catch {
      toast.error(CATALOG_STRINGS.toasts.error);
    } finally {
      setSaving(false);
    }
  };

  const ready = isSaleReady({
    code: values.code,
    name: values.name,
    brand: values.brand,
    category: values.category,
    unitCost: Number(values.unitCost) || 0,
    markupPercent: (Number(values.markupPercent) || 0) / 100,
    directPrice: Number(values.directPrice) || 0,
    applicationCount: values.applications.length,
  });

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 pb-2 pt-[22px] sm:px-[26px]">
      <nav
        aria-label="Trilha de navegação"
        className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"
      >
        <Link to="/app/catalogo" className="transition-colors hover:text-foreground">
          {COPY.breadcrumb}
        </Link>
        <Icon icon="mdi:chevron-right" size={13} className="text-muted-foreground/50" aria-hidden />
        <span className="font-semibold text-foreground">
          {search.from ? COPY.duplicateTitle : COPY.title}
        </span>
      </nav>

      <div className="mb-4 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em] text-foreground">
          {search.from ? COPY.duplicateTitle : COPY.title}
        </h1>
        <PartChip tone="neutral" variant="ghost" size="sm" title={COPY.skuChipTitle}>
          {COPY.skuChip}
        </PartChip>
        <span
          aria-live="polite"
          className={cn(
            "ml-auto flex items-center gap-1.5 text-[11.5px] font-bold",
            ready ? "text-severity-success" : "text-muted-foreground",
          )}
        >
          <Icon
            icon={ready ? "mdi:check-circle" : "mdi:circle-outline"}
            size={14}
            className="shrink-0"
            aria-hidden
          />
          {ready ? COPY.readiness.ready : COPY.readiness.notReady}
        </span>
      </div>

      <PartForm
        key={formKey}
        initial={source}
        seed={seed}
        codeState={codeState}
        duplicate={duplicate}
        onValuesChange={setValues}
        saving={saving}
        onSubmit={(v, options) => void handleSubmit(v, options)}
        onCancel={() => void navigate({ to: "/app/catalogo" })}
        onOpenPart={openPart}
      />
    </div>
  );
}
