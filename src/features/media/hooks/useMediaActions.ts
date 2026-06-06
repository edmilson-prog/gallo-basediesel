// src/features/media/hooks/useMediaActions.ts
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IMediaAsset, IMediaAnnotation, IMediaClassification } from "@/shared/types";
import { useMediaStorageProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { classifyMedia } from "../engine/classifyMedia";
import { isSensitiveClassification } from "../engine/sensitiveAccess";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

export function useMediaActions() {
  const provider = useMediaStorageProvider();
  const qc = useQueryClient();
  const a = MEDIA_STRINGS.actions;

  const invalidate = useCallback(
    (asset: IMediaAsset) => {
      if (asset.conversationId)
        void qc.invalidateQueries({ queryKey: ["media", "conversation", asset.conversationId] });
      if (asset.customerId)
        void qc.invalidateQueries({ queryKey: ["media", "customer", asset.customerId] });
    },
    [qc],
  );

  /**
   * Engine-derived suggestion to preselect in the classify picker (spec §3.3).
   * IMediaAsset structurally satisfies IClassifyMediaInput (kind/mimeType/fileName?/ocrText?).
   */
  const suggestClassification = useCallback(
    (asset: IMediaAsset): IMediaClassification =>
      classifyMedia({
        kind: asset.kind,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        ocrText: asset.ocrText,
      }),
    [],
  );

  const setClassification = useCallback(
    async (asset: IMediaAsset, classification: IMediaClassification) => {
      // RF-021: reclassifying TO nota_fiscal/comprovante auto-tags sensitive.
      // Never DOWNGRADE: if the new class is non-sensitive, keep the asset's
      // current sensitivity (preserves a manually-sensitised asset).
      const sensitivity = isSensitiveClassification(classification)
        ? "sensitive"
        : asset.sensitivity;
      const updated = await provider.update(asset.id, { classification, sensitivity });
      auditLog({
        action: "media.classify",
        resource: "media",
        resourceId: asset.id,
        before: { classification: asset.classification },
        after: { classification },
      });
      invalidate(asset);
      toast.success(a.classifiedToast);
      return updated;
    },
    [provider, invalidate, a.classifiedToast],
  );

  /** Typed link helpers — each audits the specific link kind (PRD-016/Order/PRD-021). */
  const linkVehicle = useCallback(
    async (asset: IMediaAsset, linkedVehicleId: ID) => {
      const updated = await provider.update(asset.id, { linkedVehicleId });
      auditLog({
        action: "media.link_vehicle",
        resource: "media",
        resourceId: asset.id,
        after: { linkedVehicleId },
      });
      invalidate(asset);
      toast.success(a.linkedToast);
      return updated;
    },
    [provider, invalidate, a.linkedToast],
  );

  const linkOrder = useCallback(
    async (asset: IMediaAsset, linkedOrderId: ID) => {
      const updated = await provider.update(asset.id, { linkedOrderId });
      auditLog({
        action: "media.link_order",
        resource: "media",
        resourceId: asset.id,
        after: { linkedOrderId },
      });
      invalidate(asset);
      toast.success(a.linkedToast);
      return updated;
    },
    [provider, invalidate, a.linkedToast],
  );

  const linkPart = useCallback(
    async (asset: IMediaAsset, linkedPartId: ID) => {
      const updated = await provider.update(asset.id, { linkedPartId });
      auditLog({
        action: "media.link_part",
        resource: "media",
        resourceId: asset.id,
        after: { linkedPartId },
      });
      invalidate(asset);
      toast.success(a.linkedToast);
      return updated;
    },
    [provider, invalidate, a.linkedToast],
  );

  const setSensitivity = useCallback(
    async (asset: IMediaAsset, sensitivity: IMediaAsset["sensitivity"]) => {
      const updated = await provider.update(asset.id, { sensitivity });
      auditLog({
        action: "media.sensitivity_change",
        resource: "media",
        resourceId: asset.id,
        before: { sensitivity: asset.sensitivity },
        after: { sensitivity },
      });
      invalidate(asset);
      toast.success(a.sensitivityToast);
      return updated;
    },
    [provider, invalidate, a.sensitivityToast],
  );

  const remove = useCallback(
    async (asset: IMediaAsset) => {
      await provider.delete(asset.id); // provider also audits deletion (D-4)
      auditLog({ action: "media.delete", resource: "media", resourceId: asset.id, before: asset });
      invalidate(asset);
      toast.success(a.deletedToast);
    },
    [provider, invalidate, a.deletedToast],
  );

  const annotate = useCallback(
    async (asset: IMediaAsset, annotations: IMediaAnnotation[]) => {
      const updated = await provider.update(asset.id, { annotations, version: 2 });
      auditLog({
        action: "media.annotate",
        resource: "media",
        resourceId: asset.id,
        after: { count: annotations.length, version: 2 },
      });
      invalidate(asset);
      toast.success(a.annotatedToast);
      return updated;
    },
    [provider, invalidate, a.annotatedToast],
  );

  /**
   * Retry-persist: transitions an asset with `persisted: false` back to
   * `persisted: true` by writing through the provider (archival/storage retry).
   * Audits `media.retry_persist`, invalidates scoped queries, and toasts.
   * This is the correct handler for the failure-chip retry button (spec §5.5 /
   * RF-006/007/008) — it retries ARCHIVAL, not classification.
   */
  const retryPersist = useCallback(
    async (asset: IMediaAsset) => {
      const updated = await provider.update(asset.id, { persisted: true });
      auditLog({
        action: "media.retry_persist",
        resource: "media",
        resourceId: asset.id,
        before: { persisted: false },
        after: { persisted: true },
      });
      invalidate(asset);
      toast.success(a.retryPersistToast);
      return updated;
    },
    [provider, invalidate, a.retryPersistToast],
  );

  /** Fire-and-forget audit of a blocked sensitive view/open (spec §5.5). */
  const auditSensitiveAttempt = useCallback(
    (asset: IMediaAsset, kind: "view" | "open" | "download") => {
      auditLog({
        action: `media.sensitive_${kind}_blocked`,
        resource: "media",
        resourceId: asset.id,
      });
    },
    [],
  );

  /** Audit a successful sensitive open/download by an authorized user. */
  const auditSensitiveAccess = useCallback((asset: IMediaAsset, kind: "open" | "download") => {
    if (asset.sensitivity !== "sensitive") return;
    auditLog({ action: `media.sensitive_${kind}`, resource: "media", resourceId: asset.id });
  }, []);

  return {
    suggestClassification,
    setClassification,
    retryPersist,
    linkVehicle,
    linkOrder,
    linkPart,
    setSensitivity,
    remove,
    annotate,
    auditSensitiveAttempt,
    auditSensitiveAccess,
  };
}
