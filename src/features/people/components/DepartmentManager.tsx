import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ID, IDepartment, ISeller } from "@/shared/types";
import { useDepartmentsProvider, useSellersProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { useAuth } from "@/features/auth/useAuth";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DEPARTMENTS_LABELS as L } from "../i18n/pt-BR";

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

/** Sentinel value for the "no manager" option (Select can't hold an empty string). */
const NO_MANAGER = "__none__";

const departmentFormSchema = z.object({
  name: z.string().trim().min(1, L.nameRequired),
  managerId: z.string(),
  sellerIds: z.array(z.string()),
});

type DepartmentFormValues = z.infer<typeof departmentFormSchema>;

/**
 * Departments (Departamentos) management screen — PRD-211 Task 12.
 *
 * Lists each department with its name, resolved manager name and member count;
 * a Dialog handles create/edit (name + manager Select + member multi-select),
 * delete sits behind an AlertDialog confirm. Owner manages every department; a
 * Gestor manages only the ones they own (`managerId === own seller id`).
 *
 * Membership lives on `sellers.department_id`, NOT on the department record —
 * both the mock and Supabase providers reconcile membership internally when
 * `sellerIds` is passed to create/update, so this UI just forwards the array
 * (verified in `impl/{mock,supabase}/departments.ts` + `mocks/api/departments.ts`).
 */
export function DepartmentManager() {
  const departmentsProvider = useDepartmentsProvider();
  const sellersProvider = useSellersProvider();
  const queryClient = useQueryClient();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? DEFAULT_STORE_ID;
  const { currentUser, userRole } = useAuth();
  // The current user's own seller id — drives the "Gestor edits only own" rule.
  const currentSellerId = currentUser?.sellerId ?? null;
  const isOwner = userRole === "Owner";
  // Staff-level create permission (resource seller / action edit, store scope).
  const canManage = usePermission("seller", "edit", "store");

  const [search, setSearch] = useState("");
  const [formFor, setFormFor] = useState<IDepartment | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteFor, setDeleteFor] = useState<IDepartment | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search field; Escape clears + blurs it (UX guideline).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const departmentsQuery = useQuery({
    queryKey: ["departments", storeId],
    queryFn: () => departmentsProvider.list({ storeId }),
  });
  const sellersQuery = useQuery({
    queryKey: ["sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId }),
  });

  const departments = departmentsQuery.data;
  const sellers = sellersQuery.data;

  // Fast lookup seller-id → full name for manager/member resolution.
  const sellerNameById = useMemo(() => {
    const map = new Map<ID, string>();
    for (const s of sellers ?? []) map.set(s.id, s.fullName);
    return map;
  }, [sellers]);

  const filtered = useMemo(() => {
    if (!departments) return [];
    const term = search.trim().toLowerCase();
    if (!term) return departments;
    return departments.filter((d) => {
      const managerName = d.managerId ? (sellerNameById.get(d.managerId) ?? "") : "";
      return d.name.toLowerCase().includes(term) || managerName.toLowerCase().includes(term);
    });
  }, [departments, search, sellerNameById]);

  /** Owner manages all; a Gestor only the departments they manage. */
  const canEditDepartment = (dept: IDepartment): boolean => {
    if (isOwner) return true;
    if (!canManage) return false;
    return Boolean(currentSellerId) && dept.managerId === currentSellerId;
  };

  const removeMutation = useMutation({
    mutationFn: (id: ID) => departmentsProvider.remove(id),
    onSuccess: async (_data, id) => {
      const name = departments?.find((d) => d.id === id)?.name ?? "";
      toast.success(L.deleteSuccess(name));
      await queryClient.invalidateQueries({ queryKey: ["departments", storeId] });
      // Membership cleared on the seller side — refresh sellers too.
      await queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      setDeleteFor(null);
    },
    onError: (err: Error) => toast.error(L.deleteError, { description: err.message }),
  });

  const isLoading = departmentsQuery.isLoading || sellersQuery.isLoading;
  const isError = departmentsQuery.isError || sellersQuery.isError;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Glassmorphism page header */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/85 px-6 py-4 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{L.pageTitle}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{L.pageDescription}</p>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!canManage}
            title={canManage ? undefined : L.newDepartmentForbidden}
            onClick={() => {
              setFormFor(null);
              setCreating(true);
            }}
          >
            <Icon icon="mdi:account-multiple-plus-outline" size={16} />
            {L.newDepartment}
          </Button>
        </div>

        {/* Search */}
        <div className="relative mt-4 max-w-sm">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                searchInputRef.current?.blur();
              }
            }}
            placeholder={L.searchPlaceholder}
            className="pl-9 pr-16"
            aria-label={L.searchPlaceholder}
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
            /
          </kbd>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isError ? (
          <ErrorState onRetry={() => void departmentsQuery.refetch()} />
        ) : isLoading || !departments || !sellers ? (
          <LoadingState />
        ) : departments.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{L.noSearchResults}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((dept) => {
              const managerName = dept.managerId
                ? (sellerNameById.get(dept.managerId) ?? null)
                : null;
              const memberCount = dept.sellerIds.length;
              const editable = canEditDepartment(dept);
              return (
                <li
                  key={dept.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {dept.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                        <Icon icon="mdi:account-tie-outline" size={14} className="shrink-0" />
                        <span className="truncate">
                          {managerName ? (
                            <>
                              <span className="text-muted-foreground">{L.managerLabel}: </span>
                              <span className="text-foreground">{managerName}</span>
                            </>
                          ) : (
                            L.noManager
                          )}
                        </span>
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 gap-1">
                      <Icon icon="mdi:account-group-outline" size={12} />
                      {memberCount === 0 ? L.noMembers : L.membersLabel(memberCount)}
                    </Badge>
                  </div>

                  <div className="mt-auto flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      disabled={!editable}
                      title={editable ? undefined : L.editForbidden}
                      onClick={() => {
                        setCreating(false);
                        setFormFor(dept);
                      }}
                    >
                      <Icon icon="mdi:pencil-outline" size={14} />
                      {L.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={!editable}
                      title={editable ? undefined : L.editForbidden}
                      onClick={() => setDeleteFor(dept)}
                    >
                      <Icon icon="mdi:trash-can-outline" size={14} />
                      {L.delete}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Create / edit dialog */}
      {(creating || formFor) && sellers && (
        <DepartmentFormDialog
          storeId={storeId}
          department={formFor}
          sellers={sellers}
          open={creating || formFor !== null}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false);
              setFormFor(null);
            }
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={deleteFor !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteFor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{L.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFor ? L.deleteBody(deleteFor.name) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>
              {L.deleteCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteFor) removeMutation.mutate(deleteFor.id);
              }}
            >
              {removeMutation.isPending ? L.saving : L.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface IDepartmentFormDialogProps {
  storeId: ID;
  /** Present = edit mode; absent = create mode. */
  department?: IDepartment | null;
  sellers: ISeller[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create/edit dialog for a department. Forwards `sellerIds` to the provider,
 * which reconciles `sellers.department_id` on both backends.
 */
function DepartmentFormDialog({
  storeId,
  department,
  sellers,
  open,
  onOpenChange,
}: IDepartmentFormDialogProps) {
  const isEdit = Boolean(department);
  const provider = useDepartmentsProvider();
  const queryClient = useQueryClient();
  const [memberPopoverOpen, setMemberPopoverOpen] = useState(false);

  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: {
      name: department?.name ?? "",
      managerId: department?.managerId || NO_MANAGER,
      sellerIds: department?.sellerIds ?? [],
    },
  });

  // Re-sync when the dialog opens for a different department.
  useEffect(() => {
    if (!open) return;
    form.reset({
      name: department?.name ?? "",
      managerId: department?.managerId || NO_MANAGER,
      sellerIds: department?.sellerIds ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, department?.id]);

  const selectedSellerIds = form.watch("sellerIds");

  const mutation = useMutation({
    mutationFn: async (values: DepartmentFormValues) => {
      const managerId = values.managerId === NO_MANAGER ? undefined : values.managerId;
      if (isEdit && department) {
        return provider.update(department.id, {
          name: values.name.trim(),
          // Empty string clears the manager on the provider side.
          managerId: managerId ?? "",
          sellerIds: values.sellerIds,
        });
      }
      return provider.create({
        storeId,
        name: values.name.trim(),
        managerId,
        sellerIds: values.sellerIds,
      });
    },
    onSuccess: async (saved) => {
      toast.success(isEdit ? L.updateSuccess(saved.name) : L.createSuccess(saved.name));
      await queryClient.invalidateQueries({ queryKey: ["departments", storeId] });
      // Membership writes touch sellers.department_id — refresh sellers too.
      await queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error(isEdit ? L.updateError : L.createError, { description: err.message }),
  });

  const sortedSellers = useMemo(
    () => [...sellers].sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR")),
    [sellers],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit && department ? L.editTitle(department.name) : L.createTitle}
          </DialogTitle>
          <DialogDescription>{isEdit ? L.editDescription : L.createDescription}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4 py-2"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{L.nameLabel}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" placeholder={L.namePlaceholder} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="managerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{L.managerSelectLabel}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={L.managerPlaceholder} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_MANAGER}>{L.managerNone}</SelectItem>
                      {sortedSellers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sellerIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{L.membersSelectLabel}</FormLabel>
                  <Popover open={memberPopoverOpen} onOpenChange={setMemberPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={memberPopoverOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className={cn(field.value.length === 0 && "text-muted-foreground")}>
                          {L.membersTrigger(field.value.length)}
                        </span>
                        <Icon
                          icon="mdi:unfold-more-horizontal"
                          size={16}
                          className="ml-2 shrink-0 opacity-50"
                        />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={L.membersSearchPlaceholder} />
                        <CommandList>
                          <CommandEmpty>{L.membersEmpty}</CommandEmpty>
                          <CommandGroup>
                            <ScrollArea className="max-h-60">
                              {sortedSellers.map((s) => {
                                const checked = field.value.includes(s.id);
                                return (
                                  <CommandItem
                                    key={s.id}
                                    value={`${s.fullName} ${s.id}`}
                                    onSelect={() => {
                                      const next = checked
                                        ? field.value.filter((id) => id !== s.id)
                                        : [...field.value, s.id];
                                      field.onChange(next);
                                    }}
                                    className="gap-2"
                                  >
                                    <Checkbox checked={checked} className="pointer-events-none" />
                                    <span className="truncate">{s.fullName}</span>
                                  </CommandItem>
                                );
                              })}
                            </ScrollArea>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedSellerIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedSellerIds.map((id) => {
                        const seller = sellers.find((s) => s.id === id);
                        if (!seller) return null;
                        return (
                          <Badge key={id} variant="secondary" className="gap-1">
                            {seller.fullName}
                            <button
                              type="button"
                              aria-label={`Remover ${seller.fullName}`}
                              className="ml-0.5 rounded-full hover:text-foreground"
                              onClick={() =>
                                field.onChange(field.value.filter((sid) => sid !== id))
                              }
                            >
                              <Icon icon="mdi:close" size={12} />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                {L.cancel}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? L.saving : isEdit ? L.save : L.create}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <Skeleton className="h-28 w-full rounded-lg" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
      <Icon icon="mdi:account-group-outline" size={32} className="text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{L.emptyTitle}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{L.emptyBody}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
      <Icon icon="mdi:alert-circle-outline" size={32} className="text-severity-critical" />
      <p className="text-sm text-muted-foreground">{L.errorTitle}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {L.retry}
      </button>
    </div>
  );
}
