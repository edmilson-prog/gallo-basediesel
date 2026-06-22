/**
 * AssetFormSheet — create / edit / new-version editor for IAssetLibraryItem.
 *
 * Three modes:
 *   create      — full form + file|link source picker
 *   edit        — full form pre-filled from `asset`; no file change allowed
 *   newVersion  — source picker only (arquivo|link) + save button
 *
 * Consumes: useAssetLibraryAdmin (mutations + upload), RoleMultiSelect.
 * Forms: react-hook-form + zod + @hookform/resolvers.
 * Copy: all user-facing strings via QUICK_SEND_STRINGS.library (no hardcoded text).
 */

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { AssetCategory, AssetKind, IAssetLibraryItem } from "@/shared/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { useAssetLibraryAdmin } from "../../hooks/useAssetLibraryAdmin";
import { RoleMultiSelect } from "./RoleMultiSelect";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssetFormMode = "create" | "edit" | "newVersion";

export interface IAssetFormSheetProps {
  open: boolean;
  mode: AssetFormMode;
  asset?: IAssetLibraryItem; // required for edit / newVersion
  onOpenChange: (open: boolean) => void;
  onSaved: () => void; // caller refetches / closes
}

// ─── Constants ────────────────────────────────────────────────────────────────

const L = QUICK_SEND_STRINGS.library;

/** Max upload in MB — must match MAX_UPLOAD_BYTES in useAssetLibraryAdmin. */
const MAX_UPLOAD_MB = 25;

const ACCEPTED_MIME = ".pdf,.png,.jpg,.jpeg,.mp4,.webm";

const CATEGORY_OPTIONS: { value: AssetCategory; label: string }[] = [
  { value: "catalogo", label: "Catálogo" },
  { value: "ficha_tecnica", label: "Ficha técnica" },
  { value: "tabela_preco", label: "Tabela de preço" },
  { value: "garantia", label: "Garantia" },
  { value: "video", label: "Vídeo" },
  { value: "link", label: "Link" },
];

const KIND_OPTIONS: { value: AssetKind; label: string }[] = [
  { value: "document", label: "Documento" },
  { value: "image", label: "Imagem" },
  { value: "video", label: "Vídeo" },
  { value: "link", label: "Link" },
];

const DIVISION_OPTIONS: { value: IAssetLibraryItem["division"]; label: string }[] = [
  { value: "parts", label: "Parts" },
  { value: "service", label: "Service" },
  { value: "industrial", label: "Industrial" },
];

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

/** URL validation: must start with http:// or https:// */
const urlSchema = z.string().regex(/^https?:\/\/.+/, "URL deve começar com http:// ou https://");

/**
 * Full create/edit schema.
 * The source (file vs url) is validated at submit time since File isn't zod-friendly.
 */
const fullFormSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  category: z.enum([
    "catalogo",
    "ficha_tecnica",
    "tabela_preco",
    "garantia",
    "video",
    "link",
  ] as [AssetCategory, ...AssetCategory[]]),
  brand: z.string().optional(),
  productLine: z.string().optional(),
  division: z.enum(["parts", "service", "industrial"] as [
    IAssetLibraryItem["division"],
    ...IAssetLibraryItem["division"][],
  ]),
  kind: z.enum(["document", "image", "video", "link"] as [AssetKind, ...AssetKind[]]),
  sensitive: z.boolean(),
  allowedRoleIds: z.array(z.string()),
  sourceMode: z.enum(["file", "link"]),
  url: z.string().optional(),
});

type FullFormValues = z.infer<typeof fullFormSchema>;

// ─── Source picker (shared between create and newVersion) ─────────────────────

interface ISourcePickerProps {
  sourceMode: "file" | "link";
  onSourceModeChange: (mode: "file" | "link") => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
  url: string;
  onUrlChange: (v: string) => void;
  urlError: string | null;
  isUploading: boolean;
  disabled: boolean;
}

function SourcePicker({
  sourceMode,
  onSourceModeChange,
  file,
  onFileChange,
  url,
  onUrlChange,
  urlError,
  isUploading,
  disabled,
}: ISourcePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      {/* Segmented Arquivo | Link */}
      <div className="flex rounded-md border border-border">
        <button
          type="button"
          aria-pressed={sourceMode === "file"}
          disabled={disabled}
          onClick={() => onSourceModeChange("file")}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-l-md px-3 py-1.5 text-sm font-medium transition-colors ${
            sourceMode === "file"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon icon="mdi:paperclip" size={15} />
          {L.sourceFile}
        </button>
        <button
          type="button"
          aria-pressed={sourceMode === "link"}
          disabled={disabled}
          onClick={() => onSourceModeChange("link")}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-r-md px-3 py-1.5 text-sm font-medium transition-colors ${
            sourceMode === "link"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon icon="mdi:link-variant" size={15} />
          {L.sourceLink}
        </button>
      </div>

      {sourceMode === "file" && (
        <div className="space-y-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME}
            className="sr-only"
            aria-label={L.sourceFile}
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onFileChange(f);
              // reset so same file can be re-selected
              e.target.value = "";
            }}
          />

          {/* Drop area / trigger */}
          <button
            type="button"
            disabled={disabled}
            aria-label={L.dropHint}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon icon="mdi:upload-outline" size={24} />
            <span>{L.dropHint}</span>
            <Button asChild size="sm" variant="outline" className="pointer-events-none mt-1">
              <span>{L.selectFile}</span>
            </Button>
          </button>

          {/* Selected file info */}
          {file && (
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <Icon icon="mdi:file-outline" size={16} className="shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground">{L.fileSelected(file.name)}</span>
              </div>
              <button
                type="button"
                aria-label={L.cancel}
                disabled={disabled}
                onClick={() => onFileChange(null)}
                className="ml-2 cursor-pointer shrink-0 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon icon="mdi:close" size={14} />
              </button>
            </div>
          )}

          {/* Progress bar while uploading */}
          {isUploading && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{L.uploading}</p>
              <Progress value={undefined} aria-label={L.uploading} />
            </div>
          )}
        </div>
      )}

      {sourceMode === "link" && (
        <div className="space-y-1">
          <Label htmlFor="asset-url-input">{L.fieldUrl}</Label>
          <Input
            id="asset-url-input"
            type="url"
            placeholder="https://"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(urlError)}
          />
          {urlError && <p className="text-[12px] text-destructive">{urlError}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AssetFormSheet({
  open,
  mode,
  asset,
  onOpenChange,
  onSaved,
}: IAssetFormSheetProps) {
  const { createAsset, updateAsset, newVersion, isUploading } = useAssetLibraryAdmin();

  // Local async flag (for updateAsset which doesn't flip isUploading)
  const [isSubmitting, setSubmitting] = useState(false);
  const busy = isUploading || isSubmitting;

  // ── Source state (shared between create and newVersion) ───────────────────
  const [sourceMode, setSourceMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  // ── Full form (create / edit only) ────────────────────────────────────────
  const form = useForm<FullFormValues>({
    resolver: zodResolver(fullFormSchema),
    defaultValues: buildDefaultValues(asset, mode),
  });

  const watchedCategory = form.watch("category");
  const watchedSourceMode = form.watch("sourceMode");

  // Price tables are always sensitive — force the toggle and disable it.
  const isPriceTable = watchedCategory === "tabela_preco";

  useEffect(() => {
    if (isPriceTable) {
      form.setValue("sensitive", true);
    }
  }, [isPriceTable, form]);

  // Re-sync when the sheet opens for a different asset or mode.
  useEffect(() => {
    if (!open) return;
    form.reset(buildDefaultValues(asset, mode));
    setSourceMode("file");
    setFile(null);
    setUrlValue(asset?.url ?? "");
    setUrlError(null);
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset?.id, mode]);

  // Keep zod sourceMode in sync with local state toggle.
  useEffect(() => {
    form.setValue("sourceMode", sourceMode);
  }, [sourceMode, form]);

  // ── Sheet title / description ─────────────────────────────────────────────
  const sheetTitle =
    mode === "create"
      ? L.newAsset
      : mode === "edit"
        ? L.editAsset
        : L.newVersionTitle;

  const sheetDescription =
    mode === "create"
      ? L.managerDesc
      : mode === "edit"
        ? `${L.editAsset} — ${asset?.title ?? ""}`
        : `${L.newVersionTitle} — ${asset?.title ?? ""}`;

  // ── Submit handlers ───────────────────────────────────────────────────────

  /** Validate the source picker (file or URL) and return an error string or null. */
  function validateSource(): string | null {
    const effectiveMode = mode === "edit" ? null : sourceMode; // edit has no source change
    if (effectiveMode === "link") {
      const parsed = urlSchema.safeParse(urlValue.trim());
      if (!parsed.success) {
        const msg = parsed.error.errors[0]?.message ?? "URL inválida";
        setUrlError(msg);
        return msg;
      }
      setUrlError(null);
    } else if (effectiveMode === "file") {
      if (!file) {
        setUrlError(null);
        // For create/newVersion with file mode, a file is required
        return "Selecione um arquivo.";
      }
      setUrlError(null);
    }
    return null;
  }

  async function handleNewVersion() {
    const sourceErr = validateSource();
    if (sourceErr) {
      toast.error(sourceErr);
      return;
    }
    if (!asset) return;
    setSubmitting(true);
    try {
      await newVersion(asset.id, {
        file: sourceMode === "file" ? (file ?? undefined) : undefined,
        url: sourceMode === "link" ? urlValue.trim() : undefined,
      });
      toast.success(L.savedNewVersion);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof Error && err.message === "too-large") {
        toast.error(L.uploadTooLarge(MAX_UPLOAD_MB));
      } else {
        toast.error(L.saveError);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFullSubmit(values: FullFormValues) {
    if (mode === "create") {
      // Validate source picker
      const sourceErr = validateSource();
      if (sourceErr) {
        toast.error(sourceErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        await createAsset({
          title: values.title,
          category: values.category,
          brand: values.brand?.trim() || undefined,
          productLine: values.productLine?.trim() || undefined,
          division: values.division,
          kind: values.kind,
          sensitivity: values.sensitive ? "sensitive" : "normal",
          allowedRoleIds: values.allowedRoleIds.length > 0 ? values.allowedRoleIds : undefined,
          file: sourceMode === "file" ? (file ?? undefined) : undefined,
          url: sourceMode === "link" ? urlValue.trim() : undefined,
        });
        toast.success(L.savedCreate);
      } else if (mode === "edit" && asset) {
        await updateAsset(asset.id, {
          title: values.title,
          category: values.category,
          brand: values.brand?.trim() || undefined,
          productLine: values.productLine?.trim() || undefined,
          division: values.division,
          kind: values.kind,
          sensitivity: values.sensitive ? "sensitive" : "normal",
          allowedRoleIds: values.allowedRoleIds.length > 0 ? values.allowedRoleIds : undefined,
        });
        toast.success(L.savedEdit);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof Error && err.message === "too-large") {
        toast.error(L.uploadTooLarge(MAX_UPLOAD_MB));
      } else {
        toast.error(L.saveError);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── newVersion mode renders a minimal sheet ───────────────────────────────
  if (mode === "newVersion") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>{sheetDescription}</SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
            <SourcePicker
              sourceMode={sourceMode}
              onSourceModeChange={setSourceMode}
              file={file}
              onFileChange={setFile}
              url={urlValue}
              onUrlChange={setUrlValue}
              urlError={urlError}
              isUploading={isUploading}
              disabled={busy}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {L.cancel}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void handleNewVersion()}>
              {L.submitNewVersion}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // ── create / edit mode ────────────────────────────────────────────────────
  const isEdit = mode === "edit";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription>{sheetDescription}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => void handleFullSubmit(values))}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
              {/* Source picker — create only */}
              {!isEdit && (
                <SourcePicker
                  sourceMode={sourceMode}
                  onSourceModeChange={(m) => {
                    setSourceMode(m);
                    form.setValue("sourceMode", m);
                    // When switching to link, reset kind to link; when switching to file,
                    // reset kind back to document as a sensible default.
                    form.setValue("kind", m === "link" ? "link" : "document");
                  }}
                  file={file}
                  onFileChange={setFile}
                  url={urlValue}
                  onUrlChange={setUrlValue}
                  urlError={urlError}
                  isUploading={isUploading}
                  disabled={busy}
                />
              )}

              {/* Título */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{L.fieldTitle}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" disabled={busy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Categoria */}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{L.fieldCategory}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v as AssetCategory)}
                      value={field.value}
                      disabled={busy}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Marca */}
              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{L.fieldBrand}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        placeholder="Volvo, Scania, Mercedes-Benz…"
                        disabled={busy}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Linha de produto */}
              <FormField
                control={form.control}
                name="productLine"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{L.fieldLine}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" disabled={busy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Divisão */}
              <FormField
                control={form.control}
                name="division"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{L.fieldDivision}</FormLabel>
                    <Select
                      onValueChange={(v) =>
                        field.onChange(v as IAssetLibraryItem["division"])
                      }
                      value={field.value}
                      disabled={busy}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DIVISION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Kind — hidden when sourceMode = link (auto-set to "link") */}
              {watchedSourceMode !== "link" && (
                <FormField
                  control={form.control}
                  name="kind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{L.fieldKind}</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v as AssetKind)}
                        value={field.value}
                        disabled={busy}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {KIND_OPTIONS.filter((o) => o.value !== "link").map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Sensível */}
              <FormField
                control={form.control}
                name="sensitive"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3">
                      <FormControl>
                        <Switch
                          id="asset-sensitive-switch"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={busy || isPriceTable}
                          aria-label={L.sensitiveToggle}
                        />
                      </FormControl>
                      <Label
                        htmlFor="asset-sensitive-switch"
                        className={`cursor-pointer ${isPriceTable ? "text-muted-foreground" : ""}`}
                      >
                        {L.sensitiveToggle}
                      </Label>
                    </div>
                    {isPriceTable && (
                      <p className="text-xs text-muted-foreground">{L.priceTableAlwaysSensitive}</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Papéis com acesso */}
              <FormField
                control={form.control}
                name="allowedRoleIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{L.fieldRoles}</FormLabel>
                    <FormControl>
                      <RoleMultiSelect
                        value={field.value}
                        onChange={field.onChange}
                        disabled={busy}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Persistent footer */}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                {L.cancel}
              </Button>
              <Button type="submit" disabled={busy}>
                {isEdit ? L.submitEdit : L.submitCreate}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDefaultValues(
  asset: IAssetLibraryItem | undefined,
  mode: AssetFormMode,
): FullFormValues {
  if (mode === "edit" && asset) {
    return {
      title: asset.title,
      category: asset.category,
      brand: asset.brand ?? "",
      productLine: asset.productLine ?? "",
      division: asset.division,
      kind: asset.kind,
      sensitive: asset.sensitivity === "sensitive",
      allowedRoleIds: asset.allowedRoleIds ?? [],
      sourceMode: asset.kind === "link" ? "link" : "file",
      url: asset.url ?? "",
    };
  }
  return {
    title: "",
    category: "catalogo",
    brand: "",
    productLine: "",
    division: "parts",
    kind: "document",
    sensitive: false,
    allowedRoleIds: [],
    sourceMode: "file",
    url: "",
  };
}
