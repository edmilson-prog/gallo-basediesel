import { useEffect } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Icon } from "@/components/Icon";
import type { ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import {
  SELLER_TYPE_OPTIONS,
  sellerFormSchema,
  showRegionField,
  type SellerFormValues,
} from "../engine/sellerForm";

interface ISellerFormDialogProps {
  storeId: string;
  /** Present = edit mode; absent = create mode. */
  seller?: ISeller | null;
  /** Whether the seller already has a platform login (edit mode e-mail notice). */
  hasAccess?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create/edit dialog for team members (users CRUD). Creating registers the
 * seller WITHOUT platform access — the existing "Criar acesso" flow grants the
 * login afterwards (two-step decision in the design spec).
 */
export function SellerFormDialog({
  storeId,
  seller,
  hasAccess = false,
  open,
  onOpenChange,
}: ISellerFormDialogProps) {
  const isEdit = Boolean(seller);
  const provider = useSellersProvider();
  const queryClient = useQueryClient();

  const form = useForm<SellerFormValues>({
    resolver: zodResolver(sellerFormSchema),
    defaultValues: {
      fullName: seller?.fullName ?? "",
      email: seller?.email ?? "",
      phone: seller?.phone ?? "",
      type: seller?.type ?? "internal",
      region: seller?.region ?? "",
    },
  });

  // Re-sync when the dialog opens for a different seller.
  useEffect(() => {
    if (!open) return;
    form.reset({
      fullName: seller?.fullName ?? "",
      email: seller?.email ?? "",
      phone: seller?.phone ?? "",
      type: seller?.type ?? "internal",
      region: seller?.region ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seller?.id]);

  const watchedType = form.watch("type");
  const watchedEmail = form.watch("email");
  const emailChanged = isEdit && hasAccess && watchedEmail.trim().toLowerCase() !== seller?.email;

  const mutation = useMutation({
    mutationFn: async (values: SellerFormValues) => {
      // RHF sends "" for empty inputs — map to undefined before persisting.
      const region = showRegionField(values.type) ? values.region?.trim() || undefined : undefined;
      if (isEdit && seller) {
        return provider.update(seller.id, {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone?.trim() || undefined,
          type: values.type,
          region,
        });
      }
      return provider.create({
        storeId,
        fullName: values.fullName,
        email: values.email,
        phone: values.phone?.trim() || undefined,
        type: values.type,
        region,
      });
    },
    onSuccess: (saved) => {
      toast.success(
        isEdit ? `Dados de ${saved.fullName} atualizados.` : `${saved.fullName} cadastrado(a).`,
        {
          description: isEdit
            ? undefined
            : `Use “Criar acesso” quando quiser liberar o login na plataforma.`,
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error(isEdit ? "Não foi possível salvar" : "Não foi possível cadastrar", {
        description: err.message,
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Editar usuário — ${seller?.fullName}` : "Novo usuário"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualiza os dados cadastrais do membro da equipe."
              : `Cadastra um membro da equipe. O acesso à plataforma é liberado depois, pelo botão “Criar acesso”.`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4 py-2"
          >
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="off" {...field} />
                  </FormControl>
                  {emailChanged && (
                    <p className="flex items-start gap-1.5 rounded-md border border-severity-warning/30 bg-severity-warning/10 px-2.5 py-1.5 text-xs text-severity-warning">
                      <Icon icon="mdi:alert-outline" size={14} className="mt-0.5 shrink-0" />
                      O acesso continua pelo e-mail antigo. O e-mail de login não é alterado.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone (opcional)</FormLabel>
                  <FormControl>
                    <Input type="tel" autoComplete="off" placeholder="(55) 99999-9999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      {SELLER_TYPE_OPTIONS.map((opt) => (
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

            {showRegionField(watchedType) && (
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Região de atuação (opcional)</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" placeholder="Ex.: Norte do RS" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando…" : isEdit ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
