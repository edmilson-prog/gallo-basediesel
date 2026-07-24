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
import { cn } from "@/lib/utils";
import type { ICustomerDocumentMatch } from "@/providers/data";
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
type ConvertMode = "new" | "link";
type B2bStep = 1 | 2;

/**
 * What the "link" mode actually needs: an id plus two display lines. Kept
 * lighter than {@link ICustomer} on purpose — a duplicate surfaced by the
 * document guard may belong to ANOTHER seller, so `customers_select` would
 * hide the full row from a non-staff caller and `get()` would 406. The guard's
 * RPC returns just enough to identify it and link to it.
 */
interface ILinkTarget {
  id: ID;
  label: string;
  sublabel: string;
}

function customerToLinkTarget(c: ICustomer): ILinkTarget {
  const doc = c.type === "B2B" ? `CNPJ ${c.cnpj}` : `CPF ${c.cpf}`;
  return {
    id: c.id,
    label: (c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName) || "—",
    sublabel: `${doc} · ${c.phone}`,
  };
}

function matchToLinkTarget(m: ICustomerDocumentMatch): ILinkTarget {
  return {
    id: m.id,
    label: m.displayName,
    sublabel: m.sellerName ? COPY.duplicateOwner(m.sellerName) : COPY.duplicateOwnerQueue,
  };
}

/** Visual validation state for the CNPJ field (drives icon + message). */
type CnpjFieldState = "idle" | "checking" | "valid" | "invalid" | "warning";

export interface IConvertLeadModalProps {
  lead: ILead | null;
  onClose: () => void;
  onConverted?: (customerId: ID) => void;
  /** Mode the modal opens in — lets a caller (e.g. the lead panel's split
   *  button) jump straight into "link to existing customer" without going
   *  through the in-modal toggle. Defaults to "new". */
  initialMode?: ConvertMode;
}

export function ConvertLeadModal({
  lead,
  onClose,
  onConverted,
  initialMode = "new",
}: IConvertLeadModalProps) {
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const { stages } = usePipelineSettings(currentStoreId);

  const [mode, setMode] = useState<ConvertMode>(initialMode);
  const [type, setType] = useState<CustomerType>("B2C");
  const [b2bStep, setB2bStep] = useState<B2bStep>(1);
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<ILinkTarget | null>(null);
  const [searchResults, setSearchResults] = useState<ICustomer[]>([]);
  const debouncedQuery = useDebounce(query, 400);

  // Duplicate guard: the store may already have a customer with this document.
  const [duplicates, setDuplicates] = useState<ICustomerDocumentMatch[]>([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const {
    lookup: lookupCnpj,
    reset: resetCnpj,
    status: cnpjStatus,
    data: cnpjData,
  } = useMinhaReceita();
  const debouncedCnpj = useDebounce(cnpj, 500);

  useEffect(() => {
    if (!lead) return;
    setMode(initialMode);
    setType("B2C");
    setB2bStep(1);
    setFullName(lead.name);
    setCpf("");
    setRazaoSocial("");
    setNomeFantasia(lead.name);
    setCnpj("");
    setContactName(lead.name);
    setEmail(lead.email ?? "");
    setErrors({});
    setQuery("");
    setSelectedCustomer(null);
    setSearchResults([]);
    setDuplicates([]);
    resetCnpj();
  }, [lead, initialMode, resetCnpj]);

  // CNPJ lookup against Minha Receita once a valid 14-digit number is typed.
  // Autofill only into empty fields so the seller's own input is never lost.
  // Gated on mode === "new": switching to "link" must stop background lookups.
  useEffect(() => {
    if (mode !== "new" || type !== "B2B") {
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
  }, [mode, debouncedCnpj, type, lookupCnpj, resetCnpj]);

  // Server-side customer search, scoped to the lead's own store — only while
  // linking and only once selectedCustomer is cleared.
  useEffect(() => {
    if (mode !== "link" || !lead || selectedCustomer) {
      setSearchResults([]);
      return;
    }
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    let active = true;
    void customersProvider
      .list({ storeId: lead.storeId, search: q, pageSize: 8, excludeTags: ["pending_review"] })
      .then((res) => {
        if (active) setSearchResults(res.data);
      })
      .catch(() => {
        if (active) setSearchResults([]);
      });
    return () => {
      active = false;
    };
  }, [mode, lead, selectedCustomer, debouncedQuery, customersProvider]);

  // Duplicate guard — the store already has a customer with this CNPJ/CPF?
  // Runs off a SECURITY DEFINER RPC rather than a customers search on purpose:
  // `customers_select` hides other sellers' customers from a non-staff caller,
  // so a plain search would answer "none" and the duplicate would be created.
  const activeDocument = type === "B2B" ? cnpj : cpf;
  const debouncedDocument = useDebounce(activeDocument, 400);
  useEffect(() => {
    if (mode !== "new") {
      setDuplicates([]);
      return;
    }
    const digits = onlyDigits(debouncedDocument);
    const complete = type === "B2B" ? digits.length === 14 : digits.length === 11;
    if (!complete) {
      setDuplicates([]);
      return;
    }
    let active = true;
    setCheckingDuplicate(true);
    void customersProvider
      .findByDocument(digits)
      .then((rows) => {
        if (active) setDuplicates(rows);
      })
      .catch(() => {
        // Fail open: a guard outage must not block a legitimate conversion.
        if (active) setDuplicates([]);
      })
      .finally(() => {
        if (active) setCheckingDuplicate(false);
      });
    return () => {
      active = false;
    };
  }, [mode, type, debouncedDocument, customersProvider]);

  /** Jump straight into "link" mode with the duplicate pre-selected. */
  const handleLinkToDuplicate = (match: ICustomerDocumentMatch) => {
    setSelectedCustomer(matchToLinkTarget(match));
    setMode("link");
    setErrors({});
    setB2bStep(1);
  };

  // True while the debounced value hasn't caught up with the latest typed
  // digits yet — cnpjStatus/cnpjData still describe the PREVIOUS CNPJ during
  // this window, so both the field state and the submit gate must treat it
  // as "checking" rather than trusting the stale status. (Fix applied during
  // Task 4's review in PR #350 — carried forward unchanged.)
  const cnpjPendingDebounce = onlyDigits(cnpj) !== onlyDigits(debouncedCnpj);

  const cnpjFieldState = useMemo<CnpjFieldState>(() => {
    if (mode !== "new" || type !== "B2B") return "idle";
    const digits = onlyDigits(cnpj);
    if (digits.length < 14) return "idle";
    if (!isValidCnpj(cnpj)) return "invalid";
    if (cnpjPendingDebounce || cnpjStatus === "loading") return "checking";
    if (cnpjStatus === "invalid") return "invalid";
    if (cnpjStatus === "error") return "warning";
    if (cnpjStatus === "success") return "valid";
    return "checking";
  }, [mode, type, cnpj, cnpjPendingDebounce, cnpjStatus]);

  const cnpjChecking =
    mode === "new" &&
    type === "B2B" &&
    isValidCnpj(cnpj) &&
    (cnpjPendingDebounce || cnpjStatus === "loading");

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
    if (!currentStoreId) return;

    if (mode === "link") {
      if (!selectedCustomer) return;
      setBusy(true);
      try {
        const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
        await leadsProvider.markConverted(lead.id, {
          stage: closingStage,
          customerId: selectedCustomer.id,
        });

        auditLog({
          action: "lead.converted",
          resource: "lead",
          resourceId: lead.id,
          before: { stageId: lead.stage.id },
          after: {
            stageId: closingStage.id,
            customerId: selectedCustomer.id,
            linkedExisting: true,
          },
        });

        toast.success(COPY.successToastLinked);
        await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
        await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
        onConverted?.(selectedCustomer.id);
      } catch {
        toast.error(COPY.errorToast);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!validate()) return;

    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const baseCustomer = {
        storeId: lead.storeId,
        // Whoever converts owns the customer (uniform rule). Fallback to the
        // lead's owner if the current user has no seller id.
        sellerId: currentUser?.sellerId ?? lead.sellerId,
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
      await leadsProvider.markConverted(lead.id, {
        stage: closingStage,
        customerId: customer.id,
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

  const inB2bStepOne = mode === "new" && type === "B2B" && b2bStep === 1;
  const inB2bStepTwo = mode === "new" && type === "B2B" && b2bStep === 2;

  const handlePrimaryAction = () => {
    if (inB2bStepOne) {
      setB2bStep(2);
      return;
    }
    void handleSubmit();
  };

  // A confirmed duplicate blocks the "create" path in both flows — the whole
  // point of the guard is that the seller links instead of creating a second
  // ficha for the same document. "link" mode is never blocked.
  const blockedByDuplicate = mode === "new" && duplicates.length > 0;
  const primaryDisabled = inB2bStepOne
    ? cnpjFieldState !== "valid" || checkingDuplicate || blockedByDuplicate
    : busy || cnpjChecking || checkingDuplicate || blockedByDuplicate || (mode === "link" && !selectedCustomer);

  const primaryLabel = inB2bStepOne
    ? COPY.continueLabel
    : busy
      ? COPY.submitting
      : COPY.submit;

  return (
    <Dialog open={lead !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{mode === "link" ? COPY.descriptionLink : COPY.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <SegmentedToggle
            label={COPY.modeLabel}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setErrors({});
              setB2bStep(1);
            }}
            options={[
              { value: "new", label: COPY.modeNew },
              { value: "link", label: COPY.modeLink },
            ]}
          />

          {mode === "link" ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{COPY.searchLabel}</Label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {selectedCustomer.label}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedCustomer.sublabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setQuery("");
                    }}
                  >
                    {COPY.changeCustomer}
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={COPY.searchPlaceholder}
                  />
                  {query.trim().length > 0 && query.trim().length < 2 && (
                    <p className="text-[10px] text-muted-foreground">{COPY.searchHint}</p>
                  )}
                  {debouncedQuery.trim().length >= 2 && (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                      {searchResults.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          {COPY.searchNoResults}
                        </p>
                      ) : (
                        searchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                            onClick={() => setSelectedCustomer(customerToLinkTarget(c))}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {c.type === "B2B" ? c.cnpj : c.cpf}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <SegmentedToggle
                label={COPY.typeLabel}
                value={type}
                onChange={(v) => {
                  setType(v);
                  setB2bStep(1);
                }}
                options={[
                  { value: "B2C", label: COPY.typeB2C },
                  { value: "B2B", label: COPY.typeB2B },
                ]}
              />

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
                  <div className="col-span-2">
                    <DuplicateNotice
                      matches={duplicates}
                      checking={checkingDuplicate}
                      isCnpj={false}
                      onLink={handleLinkToDuplicate}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold",
                        b2bStep === 2
                          ? "bg-success/15 text-success"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {b2bStep === 2 && <Icon icon="mdi:check" size={11} />}
                      {COPY.stepCnpjLabel}
                    </span>
                    <span
                      className={cn("h-px flex-1", b2bStep === 2 ? "bg-success" : "bg-border")}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold",
                        b2bStep === 2
                          ? "bg-primary text-primary-foreground"
                          : "border border-border text-muted-foreground",
                      )}
                    >
                      {COPY.stepContactLabel}
                    </span>
                  </div>

                  {b2bStep === 1 ? (
                    <div className="space-y-3">
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
                              onClick={() =>
                                void lookupCnpj(cnpj).then((company) => {
                                  if (!company) return;
                                  setRazaoSocial((prev) => (prev.trim() ? prev : company.razaoSocial));
                                  setNomeFantasia((prev) =>
                                    prev.trim() ? prev : company.nomeFantasia || company.razaoSocial,
                                  );
                                })
                              }
                              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
                            >
                              <Icon icon="mdi:refresh" size={14} />
                              {COPY.cnpjRetry}
                            </button>
                          </div>
                        )}
                        <DuplicateNotice
                          matches={duplicates}
                          checking={checkingDuplicate}
                          isCnpj
                          onLink={handleLinkToDuplicate}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cnpjData && (
                        <div className="flex items-stretch gap-3 overflow-hidden rounded-lg border border-border bg-card">
                          <div
                            className={cn(
                              "w-1 shrink-0",
                              cnpjData.situacaoCadastral && !isSituacaoAtiva(cnpjData.situacaoCadastral)
                                ? "bg-warning"
                                : "bg-success",
                            )}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1 py-3 pr-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Icon
                                icon="mdi:office-building-outline"
                                size={15}
                                className="shrink-0 text-muted-foreground"
                              />
                              <strong className="text-sm font-semibold text-foreground">
                                {cnpjData.razaoSocial}
                              </strong>
                              {cnpjData.situacaoCadastral && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                    isSituacaoAtiva(cnpjData.situacaoCadastral)
                                      ? "bg-success/15 text-success"
                                      : "bg-warning/15 text-warning",
                                  )}
                                >
                                  <Icon
                                    icon={
                                      isSituacaoAtiva(cnpjData.situacaoCadastral)
                                        ? "mdi:check"
                                        : "mdi:alert-outline"
                                    }
                                    size={10}
                                  />
                                  {cnpjData.situacaoCadastral}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {nomeFantasia || razaoSocial} · CNPJ {formatCnpj(cnpj)}
                            </p>
                            {cnpjData.address && (
                              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <Icon icon="mdi:map-marker-outline" size={13} className="shrink-0" />
                                {cnpjData.address.city}/{cnpjData.address.state}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setB2bStep(1)}
                            className="shrink-0 self-center pr-3 text-xs font-medium text-primary hover:underline"
                          >
                            {COPY.changeCustomer}
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <Field label={COPY.contactName} error={errors.contactName}>
                          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                        </Field>
                        <Field label={COPY.email}>
                          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                        </Field>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={inB2bStepTwo ? () => setB2bStep(1) : onClose}
            disabled={busy}
          >
            {inB2bStepTwo ? COPY.back : COPY.cancel}
          </Button>
          <Button onClick={handlePrimaryAction} disabled={primaryDisabled}>
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Duplicate-document warning. Shown as soon as a complete CNPJ/CPF matches a
 * customer the store already has — including one owned by another seller, which
 * the caller may not be able to see anywhere else in the app.
 */
function DuplicateNotice({
  matches,
  checking,
  isCnpj,
  onLink,
}: {
  matches: ICustomerDocumentMatch[];
  checking: boolean;
  isCnpj: boolean;
  onLink: (match: ICustomerDocumentMatch) => void;
}) {
  if (checking) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon icon="mdi:loading" size={14} className="animate-spin motion-reduce:animate-none" />
        {COPY.duplicateChecking}
      </p>
    );
  }
  if (matches.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        <Icon icon="mdi:account-alert-outline" size={14} />
        {isCnpj ? COPY.duplicateTitleCnpj : COPY.duplicateTitleCpf}
      </p>
      {matches.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{m.displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {m.sellerName ? COPY.duplicateOwner(m.sellerName) : COPY.duplicateOwnerQueue}
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => onLink(m)}>
            <Icon icon="mdi:link-variant" size={14} />
            {COPY.duplicateLinkCta}
          </Button>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">{COPY.duplicateHint}</p>
    </div>
  );
}

interface ISegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Two-option segmented control — same RadioGroup semantics as before (one
 *  exclusive choice), restyled as a sliding pill instead of two bordered boxes. */
function SegmentedToggle<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ISegmentedOption<T>[];
}) {
  const activeIndex = value === options[0]?.value ? 0 : 1;
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as T)}
        className="relative grid grid-cols-2 rounded-lg border border-border bg-muted p-1"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-md bg-primary transition-transform duration-200 ease-out"
          style={{ transform: activeIndex === 1 ? "translateX(100%)" : "translateX(0%)" }}
        />
        {options.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "relative z-10 flex cursor-pointer items-center justify-center rounded-md px-2 py-2 text-center text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
              value === opt.value ? "text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <RadioGroupItem value={opt.value} className="sr-only" />
            {opt.label}
          </label>
        ))}
      </RadioGroup>
    </div>
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
