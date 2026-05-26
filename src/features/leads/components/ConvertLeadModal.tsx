import { useEffect, useState } from "react";
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
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePipelineSettings } from "../hooks/usePipelineSettings";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { CLOSING_STAGE_ID } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.convertModal;

type CustomerType = "B2B" | "B2C";

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
  }, [lead]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (type === "B2C") {
      if (!fullName.trim()) next.fullName = COPY.requiredFullName;
      const digits = cpf.replace(/\D/g, "");
      if (digits.length !== 11) next.cpf = COPY.requiredCpf;
    } else {
      if (!razaoSocial.trim()) next.razaoSocial = COPY.requiredRazao;
      if (!nomeFantasia.trim()) next.nomeFantasia = COPY.requiredFantasia;
      const digits = cnpj.replace(/\D/g, "");
      if (digits.length !== 14) next.cnpj = COPY.requiredCnpj;
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

      const customer =
        type === "B2B"
          ? await customersProvider.create({
              ...baseCustomer,
              type: "B2B",
              cnpj: cnpj.replace(/\D/g, ""),
              razaoSocial: razaoSocial.trim(),
              nomeFantasia: nomeFantasia.trim(),
              contactName: contactName.trim(),
            } as Omit<ICustomer, "id" | "createdAt" | "notes">)
          : await customersProvider.create({
              ...baseCustomer,
              type: "B2C",
              cpf: cpf.replace(/\D/g, ""),
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
                <Input
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder={COPY.cnpjPlaceholder}
                />
              </Field>
              <Field label={COPY.contactName} error={errors.contactName}>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </Field>
              <Field label={COPY.email} colSpan={2}>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {COPY.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? COPY.submitting : COPY.submit}
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
