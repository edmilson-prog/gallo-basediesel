import { useEffect, useMemo, useState } from "react";
import type { ICustomer, ID, ISeller } from "@/shared/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { useDebounce } from "@/shared/hooks/useDebounce";
import {
  formatCnpj,
  formatCpf,
  formatPhone,
  isValidCnpj,
  isValidCpf,
  isValidPhone,
  onlyDigits,
} from "../../utils/cnpjCpf";
import { useMinhaReceita } from "../../hooks/useMinhaReceita";

export interface INewCustomerModalProps {
  open: boolean;
  sellers: ISeller[];
  defaultSellerId: ID | null;
  sellerLocked: boolean;
  storeId: ID;
  onClose: () => void;
  onSubmit: (input: Omit<ICustomer, "id" | "createdAt" | "notes">) => Promise<void>;
}

type CustomerType = ICustomer["type"];

/** Visual validation state for the document field (drives icon + message). */
type DocFieldState = "idle" | "checking" | "valid" | "invalid" | "warning";

export function NewCustomerModal({
  open,
  sellers,
  defaultSellerId,
  sellerLocked,
  storeId,
  onClose,
  onSubmit,
}: INewCustomerModalProps) {
  const [type, setType] = useState<CustomerType>("B2B");
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sellerId, setSellerId] = useState<ID | "">(defaultSellerId ?? "");
  const [contactName, setContactName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const {
    lookup: lookupCnpj,
    reset: resetCnpj,
    status: cnpjStatus,
    data: cnpjData,
  } = useMinhaReceita();
  const debouncedDocument = useDebounce(document, 500);

  useEffect(() => {
    if (open) {
      setType("B2B");
      setName("");
      setDocument("");
      setPhone("");
      setEmail("");
      setSellerId(defaultSellerId ?? "");
      setContactName("");
      setErrors({});
      resetCnpj();
    }
  }, [open, defaultSellerId, resetCnpj]);

  // CNPJ lookup against Minha Receita once a valid 14-digit number is typed.
  // Autofill only happens into empty fields so the user's input is never lost.
  useEffect(() => {
    if (type !== "B2B") {
      resetCnpj();
      return;
    }
    const digits = onlyDigits(debouncedDocument);
    if (digits.length !== 14 || !isValidCnpj(debouncedDocument)) {
      resetCnpj();
      return;
    }
    let active = true;
    void lookupCnpj(debouncedDocument).then((company) => {
      if (!active || !company) return;
      const filled = company.razaoSocial || company.nomeFantasia;
      if (filled) setName((prev) => (prev.trim() ? prev : filled));
    });
    return () => {
      active = false;
    };
  }, [debouncedDocument, type, lookupCnpj, resetCnpj]);

  // Document field visual state: instant for CPF, API-driven for CNPJ.
  const docState = useMemo<DocFieldState>(() => {
    const digits = onlyDigits(document);
    if (type === "B2C") {
      if (digits.length < 11) return "idle";
      return isValidCpf(document) ? "valid" : "invalid";
    }
    if (digits.length < 14) return "idle";
    if (!isValidCnpj(document)) return "invalid";
    if (cnpjStatus === "loading") return "checking";
    if (cnpjStatus === "invalid") return "invalid";
    if (cnpjStatus === "error") return "warning";
    if (cnpjStatus === "success") return "valid";
    return "checking";
  }, [type, document, cnpjStatus]);

  // Local gate for submit: a network failure (warning) must not block, a
  // 404 (invalid) must. CPF is purely local.
  const documentValid = useMemo(() => {
    if (type === "B2C") return isValidCpf(document);
    if (!isValidCnpj(document)) return false;
    return cnpjStatus !== "invalid";
  }, [type, document, cnpjStatus]);

  const cnpjChecking = type === "B2B" && cnpjStatus === "loading";

  const phoneValid = useMemo(() => isValidPhone(phone), [phone]);

  const formValid =
    name.trim().length > 0 &&
    documentValid &&
    phoneValid &&
    sellerId !== "" &&
    (type === "B2C" || contactName.trim().length > 0);

  const documentLabel = type === "B2B" ? "CNPJ" : "CPF";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) {
      const next: Record<string, string> = {};
      if (!name.trim()) next.name = "Obrigatório.";
      if (!documentValid) {
        if (type === "B2C") next.document = "CPF inválido.";
        else if (cnpjStatus === "invalid") next.document = "CNPJ não encontrado na Receita.";
        else next.document = "CNPJ inválido.";
      }
      if (!phoneValid) next.phone = "Telefone inválido.";
      if (sellerId === "") next.seller = "Selecione um vendedor.";
      if (type === "B2B" && !contactName.trim()) next.contactName = "Obrigatório.";
      setErrors(next);
      return;
    }
    setIsSubmitting(true);
    try {
      const base = {
        storeId,
        phone: phone.replace(/\D/g, ""),
        email: email.trim() || undefined,
        sellerId: sellerId as ID,
        status: "ativo" as const,
        tags: [],
      };
      const input: Omit<ICustomer, "id" | "createdAt" | "notes"> =
        type === "B2B"
          ? {
              ...base,
              type: "B2B",
              cnpj: document.replace(/\D/g, ""),
              razaoSocial: name.trim(),
              nomeFantasia: name.trim(),
              contactName: contactName.trim(),
            }
          : {
              ...base,
              type: "B2C",
              cpf: document.replace(/\D/g, ""),
              fullName: name.trim(),
            };
      await onSubmit(input);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
            <DialogDescription>
              Cadastro rápido — você poderá completar endereço e dados extras na ficha após criar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <RadioGroup
                value={type}
                onValueChange={(v) => {
                  setType(v as CustomerType);
                  setDocument("");
                  setErrors((prev) => ({ ...prev, document: "" }));
                }}
                className="grid grid-cols-2 gap-2"
              >
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
                  <RadioGroupItem value="B2B" />
                  <span>Pessoa jurídica (CNPJ)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
                  <RadioGroupItem value="B2C" />
                  <span>Pessoa física (CPF)</span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer-name">
                {type === "B2B" ? "Razão social / Nome fantasia" : "Nome completo"}
              </Label>
              <Input
                id="customer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === "B2B" ? "Frota XYZ Ltda" : "Maria Santos"}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            {type === "B2B" && (
              <div className="space-y-1.5">
                <Label htmlFor="customer-contact">Contato principal</Label>
                <Input
                  id="customer-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Nome do responsável"
                />
                {errors.contactName && (
                  <p className="text-xs text-destructive">{errors.contactName}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="customer-document">{documentLabel}</Label>
                <div className="relative">
                  <Input
                    id="customer-document"
                    inputMode="numeric"
                    className="pr-9"
                    value={document}
                    aria-invalid={docState === "invalid"}
                    aria-describedby="customer-document-msg"
                    onChange={(e) => {
                      setDocument(
                        type === "B2B" ? formatCnpj(e.target.value) : formatCpf(e.target.value),
                      );
                      if (errors.document) setErrors((prev) => ({ ...prev, document: "" }));
                    }}
                    placeholder={type === "B2B" ? "00.000.000/0000-00" : "000.000.000-00"}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {docState === "checking" && (
                      <Icon
                        icon="mdi:loading"
                        size={16}
                        className="animate-spin text-muted-foreground motion-reduce:animate-none"
                      />
                    )}
                    {docState === "valid" && (
                      <Icon icon="mdi:check-circle" size={16} className="text-success" />
                    )}
                    {docState === "invalid" && (
                      <Icon icon="mdi:alert-circle" size={16} className="text-destructive" />
                    )}
                    {docState === "warning" && (
                      <Icon icon="mdi:cloud-alert-outline" size={16} className="text-warning" />
                    )}
                  </span>
                </div>
                <div id="customer-document-msg" className="min-h-4" aria-live="polite">
                  {docState === "checking" && (
                    <p className="text-xs text-muted-foreground">Consultando Receita…</p>
                  )}
                  {docState === "valid" && type === "B2C" && (
                    <p className="text-xs text-success">CPF válido.</p>
                  )}
                  {docState === "invalid" && (
                    <p role="alert" className="text-xs text-destructive">
                      {type === "B2C"
                        ? "CPF inválido."
                        : cnpjStatus === "invalid"
                          ? "CNPJ não encontrado na Receita."
                          : "CNPJ inválido."}
                    </p>
                  )}
                  {docState === "idle" && errors.document && (
                    <p role="alert" className="text-xs text-destructive">
                      {errors.document}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer-phone">Telefone</Label>
                <Input
                  id="customer-phone"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(55) 99800-0000"
                />
                <div className="min-h-4">
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                </div>
              </div>
            </div>

            {type === "B2B" && docState === "valid" && cnpjData?.razaoSocial && (
              <p className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5 text-xs text-success">
                <Icon icon="mdi:office-building-outline" size={14} />
                <span className="font-medium">{cnpjData.razaoSocial}</span>
              </p>
            )}

            {type === "B2B" && docState === "warning" && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                <Icon icon="mdi:cloud-alert-outline" size={14} />
                <span>Não foi possível validar o CNPJ na Receita agora.</span>
                <button
                  type="button"
                  onClick={() => void lookupCnpj(document)}
                  className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
                >
                  <Icon icon="mdi:refresh" size={14} />
                  Tentar novamente
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="customer-email">Email (opcional)</Label>
              <Input
                id="customer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@empresa.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer-seller">Vendedor responsável</Label>
              <Select
                value={sellerId === "" ? undefined : sellerId}
                onValueChange={(v) => setSellerId(v)}
                disabled={sellerLocked}
              >
                <SelectTrigger id="customer-seller">
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.seller && <p className="text-xs text-destructive">{errors.seller}</p>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!formValid || isSubmitting || cnpjChecking}>
              {isSubmitting ? "Criando…" : cnpjChecking ? "Validando CNPJ…" : "Criar cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
