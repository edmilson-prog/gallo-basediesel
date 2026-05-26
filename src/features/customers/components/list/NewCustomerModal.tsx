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
import {
  formatCnpj,
  formatCpf,
  formatPhone,
  isValidCnpj,
  isValidCpf,
  isValidPhone,
} from "../../utils/cnpjCpf";

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
    }
  }, [open, defaultSellerId]);

  const documentValid = useMemo(
    () => (type === "B2B" ? isValidCnpj(document) : isValidCpf(document)),
    [type, document],
  );

  const phoneValid = useMemo(() => isValidPhone(phone), [phone]);

  const formValid =
    name.trim().length > 0 &&
    documentValid &&
    phoneValid &&
    sellerId !== "" &&
    (type === "B2C" || contactName.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) {
      const next: Record<string, string> = {};
      if (!name.trim()) next.name = "Obrigatório.";
      if (!documentValid) next.document = type === "B2B" ? "CNPJ inválido." : "CPF inválido.";
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
                <Label htmlFor="customer-document">{type === "B2B" ? "CNPJ" : "CPF"}</Label>
                <Input
                  id="customer-document"
                  inputMode="numeric"
                  value={document}
                  onChange={(e) =>
                    setDocument(
                      type === "B2B" ? formatCnpj(e.target.value) : formatCpf(e.target.value),
                    )
                  }
                  placeholder={type === "B2B" ? "00.000.000/0000-00" : "000.000.000-00"}
                />
                {errors.document && <p className="text-xs text-destructive">{errors.document}</p>}
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
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>
            </div>

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
            <Button type="submit" disabled={!formValid || isSubmitting}>
              {isSubmitting ? "Criando…" : "Criar cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
