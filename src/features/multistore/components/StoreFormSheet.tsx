import { useEffect } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Division, IStore } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { recordAuditLogSync, useSellersProvider, useStoresProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "../hooks/useCurrentStore";
import {
  DIVISION_OPTIONS,
  STORE_TYPE_OPTIONS,
  storeFormSchema,
  type StoreFormValues,
} from "../engine/storeForm";

interface IStoreFormSheetProps {
  /** Present = edit mode; absent = create mode. */
  store?: IStore | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful create/edit so the host list can reload. */
  onSaved?: () => void;
}

/** Sentinel option value — Radix Select forbids empty-string item values. */
const NO_MANAGER = "__none__";

/**
 * Create/edit editor for stores (filiais e parceiras), surfaced as a right-side
 * Sheet. Owner-only (the page gates the trigger). Writes go through the
 * Owner-only RPCs in `supabaseStoresProvider`; on success the multistore roster
 * is refreshed so the switcher and listings update without a reload.
 *
 * @see docs/superpowers/specs/2026-06-19-bloco-a-gestao-lojas-design.md
 */
export function StoreFormSheet({ store, open, onOpenChange, onSaved }: IStoreFormSheetProps) {
  const isEdit = Boolean(store);
  const isMatriz = store?.type === "matriz";
  const provider = useStoresProvider();
  const sellersProvider = useSellersProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId, refreshStores } = useCurrentStore();

  // Manager options are scoped to the store being EDITED (not the active store).
  // A brand-new store has no sellers yet, so the manager field only shows in edit
  // mode; the manager is assigned afterwards. The RPC also enforces that the
  // chosen seller belongs to the store (defense in depth).
  const managerScopeStoreId = store?.id ?? null;
  const sellersQuery = useQuery({
    queryKey: ["sellers", managerScopeStoreId],
    queryFn: () => sellersProvider.list({ storeId: managerScopeStoreId ?? undefined }),
    enabled: open && Boolean(managerScopeStoreId),
  });
  const sellers = sellersQuery.data ?? [];

  const defaults = (): StoreFormValues => ({
    name: store?.name ?? "",
    type: store?.type === "parceira" ? "parceira" : "filial",
    cnpj: store?.cnpj ?? "",
    address: store?.address ?? "",
    managerId: store?.managerId ?? undefined,
    activeDivisions: (store?.activeDivisions as Division[] | undefined)?.length
      ? (store!.activeDivisions as Division[])
      : ["parts"],
  });

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeFormSchema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, store?.id]);

  const mutation = useMutation({
    mutationFn: async (values: StoreFormValues) => {
      const managerId = values.managerId?.trim() || undefined;
      if (isEdit && store) {
        return provider.update(store.id, {
          name: values.name,
          cnpj: values.cnpj,
          address: values.address,
          managerId,
          activeDivisions: values.activeDivisions,
        });
      }
      return provider.create({
        name: values.name,
        type: values.type,
        cnpj: values.cnpj,
        address: values.address,
        managerId,
        activeDivisions: values.activeDivisions,
      });
    },
    onSuccess: async (saved) => {
      recordAuditLogSync({
        storeId: currentStoreId ?? saved.id,
        actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
        action: isEdit ? "store.update" : "store.create",
        resource: "store",
        resourceId: saved.id,
        after: { name: saved.name, type: saved.type, cnpj: saved.cnpj },
      });
      toast.success(isEdit ? `Loja "${saved.name}" atualizada.` : `Loja "${saved.name}" criada.`);
      await refreshStores();
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error(isEdit ? "Não foi possível salvar a loja" : "Não foi possível criar a loja", {
        description: err.message,
      }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Editar loja — ${store?.name}` : "Nova loja"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Atualiza os dados cadastrais da loja."
              : "Cadastra uma filial ou parceira. A configuração inicial usa os padrões de fábrica."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da loja</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" placeholder="Ex.: GALLO Erechim" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isEdit ? (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Input
                    value={isMatriz ? "Matriz" : store?.type === "parceira" ? "Parceira" : "Filial"}
                    disabled
                    readOnly
                  />
                </FormItem>
              ) : (
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STORE_TYPE_OPTIONS.map((opt) => (
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

              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" placeholder="00.000.000/0001-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        autoComplete="off"
                        placeholder="Logradouro, número — bairro, cidade / UF — CEP"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Manager only in edit mode: a new store has no sellers yet, and the
                  manager must belong to the store (enforced by the RPC). */}
              {isEdit && (
                <FormField
                  control={form.control}
                  name="managerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gestor (opcional)</FormLabel>
                      <Select
                        value={field.value ? field.value : NO_MANAGER}
                        onValueChange={(value) =>
                          field.onChange(value === NO_MANAGER ? undefined : value)
                        }
                        disabled={sellersQuery.isLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sem gestor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_MANAGER}>Sem gestor</SelectItem>
                          {sellers.map((s) => (
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
              )}

              <FormField
                control={form.control}
                name="activeDivisions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Divisões ativas</FormLabel>
                    <div className="flex flex-wrap gap-4">
                      {DIVISION_OPTIONS.map((opt) => {
                        const checked = field.value?.includes(opt.value) ?? false;
                        return (
                          <label
                            key={opt.value}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => {
                                const set = new Set(field.value ?? []);
                                if (next) set.add(opt.value);
                                else set.delete(opt.value);
                                field.onChange(Array.from(set));
                              }}
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando…" : isEdit ? "Salvar alterações" : "Criar loja"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
