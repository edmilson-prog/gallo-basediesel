import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ICustomer, ID, ILead } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/Icon";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { formatCnpj, isValidCnpj, onlyDigits } from "@/features/customers/utils/cnpjCpf";
import { isSituacaoAtiva } from "@/features/customers/utils/minhaReceitaMapper";
import { useMinhaReceita } from "@/features/customers/hooks/useMinhaReceita";
import { usePipelineSettings } from "../hooks/usePipelineSettings";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { CLOSING_STAGE_ID } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.convertModal;

type CustomerType = "B2B" | "B2C";

/** Visual validation state for the CNPJ field (drives icon + message). */
type CnpjFieldState = "idle" | "checking" | "valid" | "invalid" | "warning";

export interface IConvertLeadModalProps {
  lead: ILead | null;
  onClose: () => void;
  onConverted?: (customerId: ID) => void;
}

export function ConvertLeadModal({ lead, onClose, onConverted }: IConvertLeadModalProps) {
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const { stages } = usePipelineSettings(currentStoreId);

  const [type, setType] = useState<CustomerType>("B2C");
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const {
    lookup: lookupCnpj,
    reset: resetCnpj,
    status: cnpjStatus,
    data: cnpjData,
  } = useMinhaReceita();
  const debouncedCnpj = useDebounce(cnpj, 500);

  useEffect(() => {
    if (!lead) return;
    setType("B2C");
    setFullName(lead.name);
    setCpf("");
    setRazaoSocial("");
    setNomeFantasia(lead.name);
    setCnpj("");
    setContactName(lead.name);
    setEmail(lead.email ?? "");
    setErrors({});
    resetCnpj();
  }, [lead, resetCnpj]);

  // CNPJ lookup against Minha Receita once a valid 14-digit number is typed.
  // Autofill only into empty fields so the seller's own input is never lost.
  useEffect(() => {
    if (type !== "B2B") {
      resetCnpj();
      return;
    }
    const digits = onlyDigits(debouncedCnpj);
    if (digits.length !== 14 || !isValidCnpj(debouncedCnpj)) {
      resetCnpj();
      return;
    }
    let active = true;
    void lookupCnpj(debouncedCnpj).then((company) => {
      if (!active || !company) return;
      setRazaoSocial((prev) => (prev.trim() ? prev : company.razaoSocial));
      setNomeFantasia((prev) => (prev.trim() ? prev : company.nomeFantasia || company.razaoSocial));
    });
    return () => {
      active = false;
    };
  }, [debouncedCnpj, type, lookupCnpj, resetCnpj]);

  // True while the debounced value hasn't caught up with the latest typed
  // digits yet — cnpjStatus/cnpjData still describe the PREVIOUS CNPJ during
  // this window, so both the field state and the submit gate must treat it
  // as "checking" rather than trusting the stale status.
  const cnpjPendingDebounce = onlyDigits(cnpj) !== onlyDigits(debouncedCnpj);

  const cnpjFieldState = useMemo<CnpjFieldState>(() => {
    if (type !== "B2B") return "idle";
    const digits = onlyDigits(cnpj);
    if (digits.length < 14) return "idle";
    if (!isValidCnpj(cnpj)) return "invalid";
    if (cnpjPendingDebounce || cnpjStatus === "loading") return "checking";
    if (cnpjStatus === "invalid") return "invalid";
    if (cnpjStatus === "error") return "warning";
    if (cnpjStatus === "success") return "valid";
    return "checking";
  }, [type, cnpj, cnpjPendingDebounce, cnpjStatus]);

  const cnpjChecking =
    type === "B2B" && isValidCnpj(cnpj) && (cnpjPendingDebounce || cnpjStatus === "loading");

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (type === "B2C") {
      if (!fullName.trim()) next.fullName = COPY.requiredFullName;
      const digits = cpf.replace(/\D/g, "");
      if (digits.length !== 11) next.cpf = COPY.requiredCpf;
    } else {
      if (!razaoSocial.trim()) next.razaoSocial = COPY.requiredRazao;
      if (!nomeFantasia.trim()) next.nomeFantasia = COPY.requiredFantasia;
      if (!isValidCnpj(cnpj)) next.cnpj = COPY.requiredCnpj;
      else if (cnpjStatus === "invalid") next.cnpj = COPY.cnpjNotFound;
      if (!contactName.trim()) next.contactName = COPY.requiredContact;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!lead) return;
    if (!validate()) return;
    if (!currentStoreId) return;

    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const baseCustomer = {
        storeId: lead.storeId,
        sellerId: lead.sellerId,
        phone: lead.phone,
        email: email.trim() ? email.trim() : lead.email,
        status: "ativo" as const,
        tags: [...lead.tags],
        convertedFromLeadId: lead.id,
        convertedFromLeadAt: nowIso,
        convertedBySellerId: currentUser?.sellerId ?? lead.sellerId,
      };

      // Only attach the Receita address when it matches the CNPJ actually being
      // submitted — guards against a stale lookup from a CNPJ the seller edited afterward.
      const matchingAddress =
        cnpjData && cnpjData.cnpj === onlyDigits(cnpj) ? cnpjData.address : undefined;

      const customer =
        type === "B2B"
          ? await customersProvider.create({
              ...baseCustomer,
              type: "B2B",
              cnpj: onlyDigits(cnpj),
              razaoSocial: razaoSocial.trim(),
              nomeFantasia: nomeFantasia.trim(),
              contactName: contactName.trim(),
              ...(matchingAddress ? { address: matchingAddress } : {}),
            } as Omit<ICustomer, "id" | "createdAt" | "notes">)
          : await customersProvider.create({
              ...baseCustomer,
              type: "B2C",
              cpf: onlyDigits(cpf),
              fullName: fullName.trim(),
            } as Omit<ICustomer, "id" | "createdAt" | "notes">);

      const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
      await leadsProvider.update(lead.id, {
        stage: closingStage,
        convertedToCustomerId: customer.id,
      });

      auditLog({
        action: "lead.converted",
        resource: "lead",
        resourceId: lead.id,
        before: { stageId: lead.stage.id },
        after: { stageId: closingStage.id, customerId: customer.id, type },
      });
      auditLog({
        action: "customer.created",
        resource: "customer",
        resourceId: customer.id,
        after: { from: "lead-conversion", leadId: lead.id, type },
      });

      toast.success(COPY.successToast);
      await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      await queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      onConverted?.(customer.id);
    } catch {
      toast.error(COPY.errorToast);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={lead !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{COPY.typeLabel}</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as CustomerType)}
              className="grid grid-cols-2 gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <RadioGroupItem value="B2C" id="convert-b2c" />
                {COPY.typeB2C}
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <RadioGroupItem value="B2B" id="convert-b2b" />
                {COPY.typeB2B}
              </label>
            </RadioGroup>
          </div>

          {type === "B2C" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={COPY.fullName} error={errors.fullName} colSpan={2}>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label={COPY.cpf} error={errors.cpf}>
                <Input
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder={COPY.cpfPlaceholder}
                />
              </Field>
              <Field label={COPY.email}>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={COPY.razaoSocial} error={errors.razaoSocial} colSpan={2}>
                  <Input
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder={COPY.razaoSocialPlaceholder}
                  />
                </Field>
                <Field label={COPY.nomeFantasia} error={errors.nomeFantasia} colSpan={2}>
                  <Input
                    value={nomeFantasia}
                    onChange={(e) => setNomeFantasia(e.target.value)}
                    placeholder={COPY.nomeFantasiaPlaceholder}
                  />
                </Field>
                <Field label={COPY.cnpj} error={errors.cnpj}>
                  <div className="relative">
                    <Input
                      className="pr-9"
                      value={cnpj}
                      aria-invalid={cnpjFieldState === "invalid"}
                      aria-describedby="convert-cnpj-msg"
                      onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                      placeholder={COPY.cnpjPlaceholder}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                      {cnpjFieldState === "checking" && (
                        <Icon
                          icon="mdi:loading"
                          size={16}
                          className="animate-spin text-muted-foreground motion-reduce:animate-none"
                        />
                      )}
                      {cnpjFieldState === "valid" && (
                        <Icon icon="mdi:check-circle" size={16} className="text-success" />
                      )}
                      {cnpjFieldState === "invalid" && (
                        <Icon icon="mdi:alert-circle" size={16} className="text-destructive" />
                      )}
                      {cnpjFieldState === "warning" && (
                        <Icon icon="mdi:cloud-alert-outline" size={16} className="text-warning" />
                      )}
                    </span>
                  </div>
                </Field>
                <Field label={COPY.contactName} error={errors.contactName}>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </Field>
                <Field label={COPY.email} colSpan={2}>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>

              <div id="convert-cnpj-msg" aria-live="polite" className="space-y-1.5">
                {cnpjFieldState === "checking" && (
                  <p className="text-xs text-muted-foreground">{COPY.cnpjChecking}</p>
                )}
                {cnpjFieldState === "valid" && cnpjData && (
                  <p className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5 text-xs text-success">
                    <Icon icon="mdi:office-building-outline" size={14} />
                    <span className="font-medium">{cnpjData.razaoSocial}</span>
                    {cnpjData.address && (
                      <span className="text-success/80">
                        · {cnpjData.address.city}/{cnpjData.address.state}
                      </span>
                    )}
                  </p>
                )}
                {cnpjFieldState === "valid" &&
                  cnpjData?.situacaoCadastral &&
                  !isSituacaoAtiva(cnpjData.situacaoCadastral) && (
                    <p className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                      <Icon icon="mdi:alert-outline" size={14} />
                      {COPY.cnpjSituacaoWarning(cnpjData.situacaoCadastral)}
                    </p>
                  )}
                {cnpjFieldState === "warning" && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                    <Icon icon="mdi:cloud-alert-outline" size={14} />
                    <span>{COPY.cnpjLookupError}</span>
                    <button
                      type="button"
                      onClick={() => void lookupCnpj(cnpj)}
                      className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
                    >
                      <Icon icon="mdi:refresh" size={14} />
                      {COPY.cnpjRetry}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {COPY.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy || cnpjChecking}>
            {busy ? COPY.submitting : cnpjChecking ? COPY.submittingCnpj : COPY.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface IFieldProps {
  label: string;
  error?: string;
  colSpan?: 1 | 2;
  children: React.ReactNode;
}

function Field({ label, error, colSpan = 1, children }: IFieldProps) {
  return (
    <div className={`space-y-1 ${colSpan === 2 ? "col-span-2" : ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
