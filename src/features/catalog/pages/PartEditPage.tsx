import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { PartForm, type IPartFormErrors, type IPartFormValues } from "../components/form/PartForm";
import { draftsToApplications } from "../utils/applicationDrafts";
import { usePart } from "../hooks/useCatalogList";
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

export function PartEditPage() {
  const { id } = useParams({ from: "/app/catalogo/$id/editar" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useCurrentRole();
  const provider = usePartsProvider();
  const partQuery = usePart(id);
  const bidirectional = useEquivalentsBidirectional();

  const [errors, setErrors] = useState<IPartFormErrors>({});
  const [saving, setSaving] = useState(false);

  if (partQuery.isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-muted-foreground">
        <Icon icon="svg-spinners:ring-resize" size={24} />
      </div>
    );
  }

  if (partQuery.isError || !partQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <Icon icon="mdi:alert-circle-outline" size={28} className="text-destructive" />
        <p>Peça não encontrada</p>
        <Button onClick={() => void navigate({ to: "/app/catalogo" })}>
          {CATALOG_STRINGS.detail.backToList}
        </Button>
      </div>
    );
  }

  const part = partQuery.data;
  const priceLocked = role !== "Owner";

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

    // Duplicate OEM check (excluding self).
    const dup = await provider.findByOem(primaryOem);
    if (dup.some((p) => p.id !== part.id)) {
      setErrors({ oemPrimary: CATALOG_STRINGS.form.duplicateOemError });
      return;
    }

    setSaving(true);
    try {
      const previousEquivalents = part.equivalentPartIds;
      const patch: Partial<IPart> = {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        oemCodes,
        brand: values.brand.trim(),
        supplier: values.supplier.trim(),
        isOriginal: values.isOriginal,
        category: values.category,
        subcategory: values.subcategory,
        unitCost: values.unitCost,
        applications: draftsToApplications(values.applications, part.id),
        equivalentPartIds: values.equivalentPartIds,
        stockAvailable: values.stockAvailable,
        stockMinimum: values.stockMinimum,
      };
      if (!priceLocked) patch.unitPrice = values.unitPrice;

      const priceChanged = !priceLocked && values.unitPrice !== part.unitPrice;

      const updated = await provider.update(part.id, patch);

      auditLog({
        action: "part_update",
        resource: "part",
        resourceId: part.id,
        before: {
          name: part.name,
          oemCodes: part.oemCodes,
          brand: part.brand,
        },
        after: {
          name: updated.name,
          oemCodes: updated.oemCodes,
          brand: updated.brand,
        },
      });

      if (priceChanged) {
        auditLog({
          action: "part_price_change",
          resource: "part",
          resourceId: part.id,
          before: { unitPrice: part.unitPrice },
          after: { unitPrice: updated.unitPrice },
        });
        toast.success(CATALOG_STRINGS.toasts.priceChanged);
      } else {
        toast.success(CATALOG_STRINGS.toasts.updated);
      }

      // Bidirectional equivalents reconcile.
      const previousIds: ID[] = previousEquivalents;
      const nextIds: ID[] = values.equivalentPartIds;
      await bidirectional.reconcile(part.id, previousIds, nextIds);

      await queryClient.invalidateQueries({ queryKey: ["part", part.id] });
      await queryClient.invalidateQueries({ queryKey: ["catalog-list"] });

      void navigate({ to: "/app/catalogo/$id", params: { id: part.id } });
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
          onClick={() => void navigate({ to: "/app/catalogo/$id", params: { id: part.id } })}
          className="-ml-2 mb-2 text-xs"
        >
          <Icon icon="mdi:arrow-left" size={14} />
          Voltar à ficha
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{CATALOG_STRINGS.form.editTitle}</h1>
        <p className="text-sm text-muted-foreground">{part.name}</p>
      </header>

      <PartForm
        initial={part}
        priceLocked={priceLocked}
        saving={saving}
        submitLabel={CATALOG_STRINGS.form.save}
        errors={errors}
        onSubmit={handleSubmit}
        onCancel={() => void navigate({ to: "/app/catalogo/$id", params: { id: part.id } })}
      />
    </div>
  );
}
