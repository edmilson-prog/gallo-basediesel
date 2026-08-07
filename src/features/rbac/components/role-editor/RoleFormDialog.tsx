import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import type { IPermission, IRole, RoleName } from "@/shared/types";
import { useRolesProvider } from "@/providers/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Icon } from "@/components/Icon";
import { ROLE_EDITOR_LABELS } from "../../i18n/pt-BR";
import { isAssignableBaseRole } from "../../utils/assignableRoles";

/** Dialog mode — drives which fields render and which provider call runs. */
export type RoleFormMode = "create" | "duplicate" | "edit-meta";

export interface IRoleFormDialogProps {
  mode: RoleFormMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Full role list — feeds the base-role / duplicate selects and uniqueness check. */
  roles: IRole[];
  /**
   * The role being duplicated (duplicate mode) or edited (edit-meta mode).
   * Ignored in create mode.
   */
  sourceRole?: IRole | null;
  /** Fired after a successful create/duplicate with the new role. */
  onCreated?: (role: IRole) => void | Promise<void>;
  /** Fired after a successful rename/meta edit with the updated role. */
  onUpdated?: (role: IRole) => void | Promise<void>;
}

/** Clones a permission set so the new role never shares array references. */
function clonePermissions(permissions: IPermission[]): IPermission[] {
  return permissions.map((p) => ({
    resource: p.resource,
    actions: [...p.actions],
    scope: p.scope,
  }));
}

/**
 * Single static form schema (stable inferred type for the RHF resolver).
 *
 * Cross-field rules that depend on the dialog mode and the existing role list
 * (name uniqueness, required base role / duplicate source in create mode) run
 * in `superRefine`, fed by `existingNames` + `mode` via a closure.
 */
function buildSchema(existingNames: Set<string>, mode: RoleFormMode) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, ROLE_EDITOR_LABELS.nameRequired)
        .max(60, ROLE_EDITOR_LABELS.nameTooLong),
      description: z.string(),
      baseRole: z.string(),
      initialMode: z.enum(["blank", "duplicate"]),
      duplicateSourceId: z.string(),
    })
    .superRefine((values, ctx) => {
      // Name uniqueness applies to every mode (edited role excluded by caller).
      if (existingNames.has(values.name.trim().toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: ROLE_EDITOR_LABELS.nameDuplicate,
        });
      }
      if (mode === "edit-meta") return; // create-only fields not validated
      if (!values.baseRole) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["baseRole"],
          message: ROLE_EDITOR_LABELS.baseRoleRequired,
        });
      }
      if (
        mode === "create" &&
        values.initialMode === "duplicate" &&
        !values.duplicateSourceId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["duplicateSourceId"],
          message: ROLE_EDITOR_LABELS.duplicateSourceRequired,
        });
      }
    });
}

type IRoleFormValues = z.infer<ReturnType<typeof buildSchema>>;

/**
 * Create / duplicate / rename dialog for custom roles (PRD-211 Task 11).
 *
 * - `create`: name + description + base role + initial permissions
 *   ("Em branco" or "Duplicar de…" an existing role's set). Always yields a
 *   custom role (`isSystem=false`).
 * - `duplicate`: same form, pre-filled from `sourceRole` (its permissions are
 *   copied, base role inherited, name defaulted to "{name} (cópia)").
 * - `edit-meta`: name + description only, for an existing custom role.
 *
 * Name uniqueness is validated inline (excluding the edited role) — submit is
 * blocked on a clash. The mutation surfaces errors via toast.
 */
export function RoleFormDialog({
  mode,
  open,
  onOpenChange,
  roles,
  sourceRole,
  onCreated,
  onUpdated,
}: IRoleFormDialogProps) {
  const provider = useRolesProvider();

  // System roles drive the base-role select — minus the ones the Edge refuses to
  // assign (Owner, Cliente). Offering those produced a role that shows up in the
  // assignment dropdown and can only ever answer 403.
  const systemRoles = useMemo(
    () => roles.filter((r) => r.isSystem && isAssignableBaseRole(r.baseRole)),
    [roles],
  );

  // Other roles' names for the uniqueness check — exclude the edited role itself
  // so a no-op rename stays valid.
  const existingNames = useMemo(() => {
    const excludedId = mode === "edit-meta" ? sourceRole?.id : undefined;
    return new Set(
      roles
        .filter((r) => r.id !== excludedId)
        .map((r) => r.name.trim().toLowerCase()),
    );
  }, [roles, mode, sourceRole?.id]);

  const schema = useMemo(() => buildSchema(existingNames, mode), [existingNames, mode]);

  const defaultValues = useMemo<IRoleFormValues>(() => {
    if (mode === "duplicate" && sourceRole) {
      return {
        name: ROLE_EDITOR_LABELS.copySuffix(sourceRole.name),
        description: sourceRole.description ?? "",
        baseRole: sourceRole.baseRole,
        initialMode: "duplicate",
        duplicateSourceId: sourceRole.id,
      };
    }
    if (mode === "edit-meta" && sourceRole) {
      return {
        name: sourceRole.name,
        description: sourceRole.description ?? "",
        baseRole: sourceRole.baseRole,
        initialMode: "blank",
        duplicateSourceId: "",
      };
    }
    return {
      name: "",
      description: "",
      baseRole: "",
      initialMode: "blank",
      duplicateSourceId: "",
    };
  }, [mode, sourceRole]);

  const form = useForm<IRoleFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // Re-sync when the dialog opens (or the source role changes).
  useEffect(() => {
    if (!open) return;
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValues]);

  const initialMode = form.watch("initialMode");

  const mutation = useMutation({
    mutationFn: async (values: IRoleFormValues): Promise<{ role: IRole; created: boolean }> => {
      const name = values.name.trim();
      const description = values.description.trim() || undefined;

      if (mode === "edit-meta" && sourceRole) {
        const updated = await provider.updateMeta(sourceRole.id, {
          name,
          description,
          // Only custom roles expose the field; sending it unchanged is a no-op.
          ...(sourceRole.isSystem ? {} : { baseRole: values.baseRole as RoleName }),
        });
        return { role: updated, created: false };
      }

      // Resolve the initial permission set for create/duplicate.
      let permissions: IPermission[] = [];
      if (mode === "duplicate" && sourceRole) {
        permissions = clonePermissions(sourceRole.permissions);
      } else if (values.initialMode === "duplicate") {
        const source = roles.find((r) => r.id === values.duplicateSourceId);
        permissions = source ? clonePermissions(source.permissions) : [];
      }

      const created = await provider.create({
        name,
        description,
        baseRole: values.baseRole as RoleName,
        permissions,
        // Deliberately global. `roles.store_id` and the per-store filter in
        // `isAssignableRole` already exist, but there is a single store in
        // production — a store picker here would be dead UI. When a second store
        // arrives, add the picker; nothing else needs to change.
        storeId: null,
      });
      return { role: created, created: true };
    },
    onSuccess: async ({ role, created }) => {
      if (created) {
        toast.success(
          mode === "duplicate"
            ? ROLE_EDITOR_LABELS.duplicateSuccess
            : ROLE_EDITOR_LABELS.createSuccess,
        );
        await onCreated?.(role);
      } else {
        toast.success(ROLE_EDITOR_LABELS.renameSuccess);
        await onUpdated?.(role);
      }
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(mode === "edit-meta" ? ROLE_EDITOR_LABELS.renameError : ROLE_EDITOR_LABELS.createError, {
        description: err.message,
      });
    },
  });

  const onSubmit = form.handleSubmit((values) => mutation.mutate(values));

  const { title, description, submitLabel } = dialogCopy(mode);
  // The base role is now editable when renaming a CUSTOM role — getting it wrong
  // at creation used to be unfixable (delete + rebuild the whole matrix). System
  // roles ARE their base, so theirs stays read-only. The provider still refuses
  // the change while anyone holds the role, since the base is copied into
  // `profiles.role` at assignment time.
  const showBaseRole = mode !== "edit-meta" || (sourceRole != null && !sourceRole.isSystem);
  // Only the standalone create dialog exposes the initial-permissions choice —
  // duplicate mode always copies the source role.
  const showInitialPermissions = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4 py-1">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{ROLE_EDITOR_LABELS.fieldName}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      placeholder={ROLE_EDITOR_LABELS.fieldNamePlaceholder}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{ROLE_EDITOR_LABELS.fieldDescription}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder={ROLE_EDITOR_LABELS.fieldDescriptionPlaceholder}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showBaseRole && (
              <FormField
                control={form.control}
                name="baseRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{ROLE_EDITOR_LABELS.fieldBaseRole}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={ROLE_EDITOR_LABELS.fieldBaseRolePlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {systemRoles.map((role) => (
                          <SelectItem key={role.id} value={role.baseRole}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {ROLE_EDITOR_LABELS.baseRoleHelp}
                      {mode !== "edit-meta" && ` ${ROLE_EDITOR_LABELS.scopeHelp}`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {showInitialPermissions && (
              <>
                <FormField
                  control={form.control}
                  name="initialMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{ROLE_EDITOR_LABELS.fieldInitialPermissions}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="blank">{ROLE_EDITOR_LABELS.initialBlank}</SelectItem>
                          <SelectItem value="duplicate">
                            {ROLE_EDITOR_LABELS.initialDuplicate}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {initialMode === "duplicate" && (
                  <FormField
                    control={form.control}
                    name="duplicateSourceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{ROLE_EDITOR_LABELS.fieldDuplicateSource}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={ROLE_EDITOR_LABELS.fieldDuplicateSourcePlaceholder}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {roles.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                {ROLE_EDITOR_LABELS.deleteCancel}
              </Button>
              <Button type="submit" className="gap-1.5" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <>
                    <Icon icon="mdi:loading" size={16} className="animate-spin" />
                    {mode === "edit-meta"
                      ? ROLE_EDITOR_LABELS.saving2
                      : ROLE_EDITOR_LABELS.creating}
                  </>
                ) : (
                  submitLabel
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Resolves the per-mode dialog header copy and submit label. */
function dialogCopy(mode: RoleFormMode): {
  title: string;
  description: string;
  submitLabel: string;
} {
  switch (mode) {
    case "duplicate":
      return {
        title: ROLE_EDITOR_LABELS.duplicateTitle,
        description: ROLE_EDITOR_LABELS.duplicateDescription,
        submitLabel: ROLE_EDITOR_LABELS.duplicateSubmit,
      };
    case "edit-meta":
      return {
        title: ROLE_EDITOR_LABELS.renameTitle,
        description: ROLE_EDITOR_LABELS.renameDescription,
        submitLabel: ROLE_EDITOR_LABELS.renameSubmit,
      };
    case "create":
    default:
      return {
        title: ROLE_EDITOR_LABELS.createTitle,
        description: ROLE_EDITOR_LABELS.createDescription,
        submitLabel: ROLE_EDITOR_LABELS.createSubmit,
      };
  }
}
