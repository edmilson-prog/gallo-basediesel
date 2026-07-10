import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  ID,
  ILead,
  IPipelineStage,
  ISeller,
  LeadOrigin,
  LeadTemperature,
} from "@/shared/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { LEAD_ORIGINS, LEAD_TEMPERATURES } from "../utils/listFilters";
import { ORIGIN_META, TEMPERATURE_META } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.newModal;

export interface INewLeadModalProps {
  open: boolean;
  onClose: () => void;
  stages: IPipelineStage[];
  sellers: ISeller[];
  /** `meta.linked` is `false` only when `conversationId` was provided but the post-create link to the conversation failed — callers should skip their own "qualified" messaging in that case. */
  onCreated?: (lead: ILead, meta?: { linked: boolean }) => void;
  /**
   * Set when the lead is being qualified FROM a conversation (conversation
   * menu → "Qualificar como lead"). On save, links `conversation.leadId` and
   * `lead.conversations` both ways instead of just creating a standalone lead.
   */
  conversationId?: ID;
  /** Pre-fills `name` from the conversation's resolved contact, if any. */
  initialName?: string;
  /** Pre-fills `phone` from the conversation's resolved contact, if any. */
  initialPhone?: string;
  /** Pre-selects the seller from `conversation.assignedSellerId`, if present. */
  initialSellerId?: ID;
}

export function NewLeadModal({
  open,
  onClose,
  stages,
  sellers,
  onCreated,
  conversationId,
  initialName,
  initialPhone,
  initialSellerId,
}: INewLeadModalProps) {
  const provider = useLeadsProvider();
  const conversationsProvider = useConversationsProvider();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const role = useCurrentRole();
  const isManagerOrOwner = role === "Owner" || role === "Gestor";

  const initialStage = useMemo(() => stages[0]?.id ?? "", [stages]);
  const initialSeller: ID = useMemo(
    () => initialSellerId ?? currentUser?.sellerId ?? sellers[0]?.id ?? "",
    [initialSellerId, currentUser?.sellerId, sellers],
  );

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [origin, setOrigin] = useState<LeadOrigin>("whatsapp");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [sellerId, setSellerId] = useState<ID>(initialSeller);
  const [stageId, setStageId] = useState<ID>(initialStage);
  const [temperature, setTemperature] = useState<LeadTemperature>("morno");
  const [nextActionAt, setNextActionAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setPhone(initialPhone ?? "");
    setEmail("");
    setOrigin("whatsapp");
    setEstimatedValue("");
    setSellerId(initialSeller);
    setStageId(initialStage);
    setTemperature("morno");
    setNextActionAt("");
    setErrors({});
  }, [open, initialSeller, initialStage, initialName, initialPhone]);

  const handleSave = async () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = COPY.requiredName;
    const phoneDigits = phone.replace(/\D/g, "");
    if (!phoneDigits) next.phone = COPY.requiredPhone;
    else if (phoneDigits.length < 10 || phoneDigits.length > 11) next.phone = COPY.invalidPhone;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = COPY.invalidEmail;
    if (!origin) next.origin = COPY.requiredOrigin;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (!currentStoreId) return;

    const stage = stages.find((s) => s.id === stageId) ?? stages[0];
    if (!stage) return;

    setBusy(true);
    try {
      const value = estimatedValue.trim() ? Number(estimatedValue.replace(",", ".")) : undefined;
      const lead = await provider.create({
        storeId: currentStoreId,
        sellerId,
        name: name.trim(),
        phone: phoneDigits,
        email: email.trim() ? email.trim() : undefined,
        stage,
        temperature,
        origin,
        estimatedValue: Number.isFinite(value) ? value : undefined,
        nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
        tags: [],
      });

      let linked = true;
      if (conversationId) {
        try {
          await provider.update(lead.id, { conversations: [conversationId] });
          await conversationsProvider.update(conversationId, { leadId: lead.id });
          auditLog({
            action: "lead.qualified_from_conversation",
            resource: "lead",
            resourceId: lead.id,
            after: { conversationId, sellerId, stageId: stage.id, origin, temperature },
          });
        } catch {
          // The lead itself was created successfully — surface the link
          // failure separately rather than rolling back the lead. Skip the
          // success toasts below so the user isn't told "qualified" when the
          // conversation link didn't actually happen.
          linked = false;
          toast.error(COPY.linkError);
        }
      } else {
        auditLog({
          action: "lead.created",
          resource: "lead",
          resourceId: lead.id,
          after: { sellerId, stageId: stage.id, origin, temperature },
        });
      }

      if (linked) {
        toast.success(COPY.createdToast);
      }
      onCreated?.(lead, { linked });
    } catch {
      toast.error(COPY.createError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <Field label={COPY.name} error={errors.name}>
            <Input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={COPY.namePlaceholder}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={COPY.phone} error={errors.phone}>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={COPY.phonePlaceholder}
              />
            </Field>
            <Field label={COPY.email} error={errors.email}>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={COPY.emailPlaceholder}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={COPY.origin} error={errors.origin}>
              <Select value={origin} onValueChange={(v) => setOrigin(v as LeadOrigin)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_ORIGINS.map((o) => (
                    <SelectItem key={o} value={o}>
                      <span className="inline-flex items-center gap-2">
                        <Icon icon={ORIGIN_META[o].icon} size={12} />
                        {ORIGIN_META[o].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={COPY.temperature}>
              <Select
                value={temperature}
                onValueChange={(v) => setTemperature(v as LeadTemperature)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_TEMPERATURES.map((t) => (
                    <SelectItem key={t} value={t}>
                      <span className="inline-flex items-center gap-2">
                        <Icon icon={TEMPERATURE_META[t].icon} size={12} />
                        {TEMPERATURE_META[t].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={COPY.estimatedValue}>
              <Input
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>
            <Field label={COPY.nextAction}>
              <Input
                type="date"
                value={nextActionAt}
                onChange={(e) => setNextActionAt(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={COPY.stage}>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={COPY.seller}>
              <Select value={sellerId} onValueChange={setSellerId} disabled={!isManagerOrOwner}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {COPY.cancel}
          </Button>
          <Button onClick={() => void handleSave()} disabled={busy}>
            {busy ? COPY.saving : COPY.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface IFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, error, children }: IFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
