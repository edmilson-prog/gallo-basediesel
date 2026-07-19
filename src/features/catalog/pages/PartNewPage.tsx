import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { PartForm, type IPartFormErrors, type IPartFormValues } from "../components/form/PartForm";
import { draftsToApplications } from "../utils/applicationDrafts";
import { useEquivalentsBidirectional } from "../hooks/useEquivalentsBidirectional";
import { CATALOG_STRINGS } from "../i18n/pt-BR";

function parseOemCodes(primary: string, alternatives: string): string[] {
  const alts = alternatives
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [primary.trim(), ...alts].filter(Boolean);
}

function validate(values: IPartFormValues): IPartFormErrors {
  const errors: IPartFormErrors = {};
  if (!values.name.trim()) errors.name = CATALOG_STRINGS.form.requiredField;
  if (!values.oemPrimary.trim()) errors.oemPrimary = CATALOG_STRINGS.form.requiredField;
  if (!values.brand.trim()) errors.brand = CATALOG_STRINGS.form.requiredField;
  if (!values.category) errors.category = CATALOG_STRINGS.form.requiredField;
  if (!values.unitPrice || values.unitPrice <= 0)
    errors.unitPrice = CATALOG_STRINGS.form.invalidPrice;
  return errors;
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
  const [errors, setErrors] = useState<IPartFormErrors>({});
  const [saving, setSaving] = useState(false);

  // Load duplicate source if any.
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
        // ignore — fall back to blank form
      });
    return () => {
      cancelled = true;
    };
  }, [search.from, provider]);

  const handleSubmit = async (values: IPartFormValues) => {
    const v = validate(values);
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    const oemCodes = parseOemCodes(values.oemPrimary, values.oemAlternatives);
    const primaryOem = oemCodes[0];
    if (!primaryOem) {
      setErrors({ oemPrimary: CATALOG_STRINGS.form.requiredField });
      return;
    }

    // Duplicate OEM check.
    const dup = await provider.findByOem(primaryOem);
    if (dup.length > 0) {
      setErrors({ oemPrimary: CATALOG_STRINGS.form.duplicateOemError });
      return;
    }

    setSaving(true);
    try {
      const now = new Date();
      const sku = `GAL-NEW-${now.getTime().toString().slice(-6)}`;
      const tempId = `temp-${sku.toLowerCase()}`;
      const created = await provider.create({
        sku,
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        oemCodes,
        equivalentPartIds: values.equivalentPartIds,
        applications: draftsToApplications(values.applications, tempId),
        brand: values.brand.trim(),
        supplier: values.supplier.trim(),
        category: values.category,
        subcategory: values.subcategory,
        isOriginal: values.isOriginal,
        unitCost: values.unitCost,
        unitPrice: values.unitPrice,
        marginPercent:
          values.unitCost > 0 ? (values.unitPrice - values.unitCost) / values.unitCost : 0,
        stockAvailable: values.stockAvailable,
        stockMinimum: values.stockMinimum,
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

      // Bidirectional equivalents.
      await bidirectional.reconcile(created.id, [], values.equivalentPartIds);

      await queryClient.invalidateQueries({ queryKey: ["catalog-list"] });
      toast.success(CATALOG_STRINGS.toasts.created);
      void navigate({ to: "/app/catalogo/$id", params: { id: created.id } });
    } catch {
      toast.error(CATALOG_STRINGS.toasts.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
      <header className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate({ to: "/app/catalogo" })}
          className="-ml-2 mb-2 text-xs"
        >
          <Icon icon="mdi:arrow-left" size={14} />
          {CATALOG_STRINGS.detail.backToList}
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {search.from ? CATALOG_STRINGS.form.duplicateTitle : CATALOG_STRINGS.form.newTitle}
        </h1>
      </header>

      <PartForm
        initial={source}
        saving={saving}
        submitLabel={CATALOG_STRINGS.form.save}
        errors={errors}
        onSubmit={handleSubmit}
        onCancel={() => void navigate({ to: "/app/catalogo" })}
      />
    </div>
  );
}
