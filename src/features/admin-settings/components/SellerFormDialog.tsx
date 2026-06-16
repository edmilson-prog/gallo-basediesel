import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import type { ISeller, IScheduleOverride, IWorkScheduleWindow } from "@/shared/types";
import { WorkScheduleTab, buildWorkScheduleRows, validateWorkSchedule } from "@/features/access";
import { useAuth } from "@/features/auth/useAuth";
import { recordAuditLogSync, useDepartmentsProvider, useSellersProvider } from "@/providers/data";
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

/** Sentinel option value — Radix Select forbids empty-string item values. */
const NO_DEPARTMENT = "__none__";

/**
 * Create/edit editor for team members (users CRUD), surfaced as a right-side
 * Sheet with progressive Tabs (PRD-211 Fase 5). The "Geral" tab is the live
 * seller form; "Horário" (PRD-212) and "Rodízio" (PRD-213) are reserved-but-
 * locked placeholders. Creating registers the seller WITHOUT platform access —
 * the existing "Criar acesso" flow grants the login afterwards (two-step
 * decision in the design spec).
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
  const departmentsProvider = useDepartmentsProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();

  // Tab is controlled so an invalid schedule can pull the user to the Horário tab.
  const [tab, setTab] = useState("geral");
  // Work schedule (PRD-212) is owned here and saved together with the rest of
  // the form via the single footer button — no separate save inside the tab.
  const [scheduleRows, setScheduleRows] = useState<IWorkScheduleWindow[]>(() =>
    buildWorkScheduleRows(seller),
  );
  const [scheduleOverrides, setScheduleOverrides] = useState<IScheduleOverride[]>(
    seller?.scheduleOverrides ?? [],
  );
  const scheduleErrors = validateWorkSchedule(scheduleRows.filter((r) => r.enabled));

  const departmentsQuery = useQuery({
    queryKey: ["departments", storeId],
    queryFn: () => departmentsProvider.list({ storeId }),
  });
  const departments = departmentsQuery.data ?? [];

  const form = useForm<SellerFormValues>({
    resolver: zodResolver(sellerFormSchema),
    defaultValues: {
      fullName: seller?.fullName ?? "",
      attendantName: seller?.attendantName ?? "",
      email: seller?.email ?? "",
      phone: seller?.phone ?? "",
      type: seller?.type ?? "internal",
      region: seller?.region ?? "",
      departmentId: seller?.departmentId ?? undefined,
    },
  });

  // Re-sync when the dialog opens for a different seller.
  useEffect(() => {
    if (!open) return;
    form.reset({
      fullName: seller?.fullName ?? "",
      attendantName: seller?.attendantName ?? "",
      email: seller?.email ?? "",
      phone: seller?.phone ?? "",
      type: seller?.type ?? "internal",
      region: seller?.region ?? "",
      departmentId: seller?.departmentId ?? undefined,
    });
    setTab("geral");
    setScheduleRows(buildWorkScheduleRows(seller));
    setScheduleOverrides(seller?.scheduleOverrides ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seller?.id]);

  const watchedType = form.watch("type");
  const watchedEmail = form.watch("email");
  const emailChanged =
    isEdit &&
    hasAccess &&
    watchedEmail.trim().toLowerCase() !== (seller?.email ?? "").toLowerCase();

  const mutation = useMutation({
    mutationFn: async (values: SellerFormValues) => {
      // RHF sends "" for empty inputs — map to undefined before persisting.
      const region = showRegionField(values.type) ? values.region?.trim() || undefined : undefined;
      // Empty department => clear the assignment (null on edit, undefined on create).
      const departmentId = values.departmentId?.trim() || null;
      if (isEdit && seller) {
        // Persist only enabled days; drop blank-date exceptions.
        const enabledRows = scheduleRows.filter((r) => r.enabled);
        const cleanedOverrides = scheduleOverrides.filter((o) => o.date.trim() !== "");
        const saved = await provider.update(seller.id, {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone?.trim() || undefined,
          type: values.type,
          region,
          attendantName: values.attendantName?.trim() || undefined,
          departmentId,
          workSchedule: enabledRows,
          scheduleOverrides: cleanedOverrides,
        });
        const scheduleChanged =
          JSON.stringify(seller.workSchedule ?? []) !== JSON.stringify(enabledRows) ||
          JSON.stringify(seller.scheduleOverrides ?? []) !== JSON.stringify(cleanedOverrides);
        if (scheduleChanged) {
          recordAuditLogSync({
            storeId,
            actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
            action: "work_schedule_updated",
            resource: "seller",
            resourceId: seller.id,
            before: {
              workSchedule: seller.workSchedule ?? [],
              scheduleOverrides: seller.scheduleOverrides ?? [],
            },
            after: { workSchedule: enabledRows, scheduleOverrides: cleanedOverrides },
          });
        }
        return saved;
      }
      return provider.create({
        storeId,
        fullName: values.fullName,
        email: values.email,
        phone: values.phone?.trim() || undefined,
        type: values.type,
        region,
        attendantName: values.attendantName?.trim() || undefined,
        departmentId,
      });
    },
    onSuccess: async (saved) => {
      toast.success(
        isEdit ? `Dados de ${saved.fullName} atualizados.` : `${saved.fullName} cadastrado(a).`,
        {
          description: isEdit
            ? undefined
            : `Use “Criar acesso” quando quiser liberar o login na plataforma.`,
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      // Refresh single-seller caches so the attendant signature updates live.
      await queryClient.invalidateQueries({ queryKey: ["seller"] });
      // Department membership is derived from sellers.department_id — refresh it.
      await queryClient.invalidateQueries({ queryKey: ["departments", storeId] });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error(isEdit ? "Não foi possível salvar" : "Não foi possível cadastrar", {
        description: err.message,
      }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? `Editar usuário — ${seller?.fullName}` : "Novo usuário"}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Atualiza os dados cadastrais do membro da equipe."
              : `Cadastra um membro da equipe. O acesso à plataforma é liberado depois, pelo botão “Criar acesso”.`}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => {
              // Block the save and surface the schedule error in its tab.
              if (isEdit && scheduleErrors.length > 0) {
                setTab("horario");
                toast.error("Corrija o horário de atendimento antes de salvar.");
                return;
              }
              mutation.mutate(values);
            })}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TooltipProvider>
              <Tabs
                value={tab}
                onValueChange={setTab}
                className="flex min-h-0 flex-1 flex-col py-4"
              >
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="geral">Geral</TabsTrigger>
                  <TabsTrigger value="horario" className="gap-1">
                    <Icon icon="mdi:clock-outline" size={13} />
                    Horário
                  </TabsTrigger>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <TabsTrigger value="rodizio" disabled className="gap-1">
                          <Icon icon="mdi:lock-outline" size={13} />
                          Rodízio
                        </TabsTrigger>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Disponível após PRD-212/213</TooltipContent>
                  </Tooltip>
                </TabsList>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <TabsContent value="geral" className="space-y-4">
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
                      name="attendantName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome de exibição nos atendimentos (opcional)</FormLabel>
                          <FormControl>
                            <Input autoComplete="off" placeholder="Ex.: Edmilson" {...field} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Se preenchido, vai na frente das mensagens enviadas — ex.:{" "}
                            <span className="font-medium text-foreground">Edmilson:</span> Bom dia.
                            Deixe em branco para não assinar.
                          </p>
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
                              <Icon
                                icon="mdi:alert-outline"
                                size={14}
                                className="mt-0.5 shrink-0"
                              />
                              O acesso continua pelo e-mail antigo. O e-mail de login não é
                              alterado.
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
                            <Input
                              type="tel"
                              autoComplete="off"
                              placeholder="(55) 99999-9999"
                              {...field}
                            />
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

                    <FormField
                      control={form.control}
                      name="departmentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Departamento (opcional)</FormLabel>
                          <Select
                            value={field.value ? field.value : NO_DEPARTMENT}
                            onValueChange={(value) =>
                              field.onChange(value === NO_DEPARTMENT ? undefined : value)
                            }
                            disabled={departmentsQuery.isLoading}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Sem departamento" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={NO_DEPARTMENT}>Sem departamento</SelectItem>
                              {departments.map((dept) => (
                                <SelectItem key={dept.id} value={dept.id}>
                                  {dept.name}
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
                  </TabsContent>

                  <TabsContent value="horario">
                    {isEdit && seller ? (
                      <WorkScheduleTab
                        seller={seller}
                        storeId={storeId}
                        rows={scheduleRows}
                        onRowsChange={setScheduleRows}
                        overrides={scheduleOverrides}
                        onOverridesChange={setScheduleOverrides}
                        errors={scheduleErrors}
                      />
                    ) : (
                      <div className="rounded-md border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
                        Cadastre e salve o usuário primeiro para definir o horário de atendimento.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="rodizio">
                    <LockedTabPlaceholder />
                  </TabsContent>
                </div>
              </Tabs>
            </TooltipProvider>

            {/* Persistent footer — lives OUTSIDE the tab panels. */}
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
                {mutation.isPending ? "Salvando…" : isEdit ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

/** Reserved-but-disabled empty state for the locked Horário/Rodízio tabs. */
function LockedTabPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
      <Icon icon="mdi:lock-outline" size={24} className="text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">Disponível em breve</p>
      <p className="text-xs text-muted-foreground">
        Horários e rodízio de atendimento chegam com os PRD-212/213.
      </p>
    </div>
  );
}
