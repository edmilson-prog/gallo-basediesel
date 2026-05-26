import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ILead, ISeller, LeadTemperature } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { formatBRL, formatDateBR, formatPhone } from "@/shared/utils/format";
import { ORIGIN_META, TEMPERATURE_META, getNextActionInfo } from "../../utils/leadDisplay";
import { LEAD_TEMPERATURES } from "../../utils/listFilters";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail;

export interface ILeadDataCardProps {
  lead: ILead;
  seller?: ISeller;
  canEdit: boolean;
  editing: boolean;
  onCancelEdit: () => void;
}

export function LeadDataCard({ lead, seller, canEdit, editing, onCancelEdit }: ILeadDataCardProps) {
  const provider = useLeadsProvider();
  const queryClient = useQueryClient();
  const [estimatedValue, setEstimatedValue] = useState(
    lead.estimatedValue !== undefined ? String(lead.estimatedValue) : "",
  );
  const [nextActionAt, setNextActionAt] = useState(
    lead.nextActionAt ? lead.nextActionAt.slice(0, 10) : "",
  );
  const [temperature, setTemperature] = useState<LeadTemperature>(lead.temperature);
  const [busy, setBusy] = useState(false);

  const tempMeta = TEMPERATURE_META[lead.temperature];
  const originMeta = ORIGIN_META[lead.origin];
  const nextAction = getNextActionInfo(lead.nextActionAt);

  const handleSave = async () => {
    setBusy(true);
    try {
      const value = estimatedValue.trim() ? Number(estimatedValue.replace(",", ".")) : undefined;
      const patch = {
        temperature,
        estimatedValue: Number.isFinite(value) ? value : undefined,
        nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
      };
      await provider.update(lead.id, patch);
      auditLog({
        action: "lead.updated",
        resource: "lead",
        resourceId: lead.id,
        before: {
          temperature: lead.temperature,
          estimatedValue: lead.estimatedValue,
          nextActionAt: lead.nextActionAt,
        },
        after: patch,
      });
      toast.success(LEADS_STRINGS.toasts.updated);
      await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      onCancelEdit();
    } catch {
      toast.error(LEADS_STRINGS.toasts.updateError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{COPY.data}</h2>
      </div>

      {editing && canEdit ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{COPY.fields.estimatedValue}</Label>
            <Input
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{COPY.fields.nextAction}</Label>
            <Input
              type="date"
              value={nextActionAt}
              onChange={(e) => setNextActionAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{COPY.fields.temperature}</Label>
            <Select value={temperature} onValueChange={(v) => setTemperature(v as LeadTemperature)}>
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
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancelEdit} disabled={busy}>
              {COPY.cancel}
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={busy}>
              {COPY.editAction}
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row
            label={COPY.fields.estimatedValue}
            value={lead.estimatedValue !== undefined ? formatBRL(lead.estimatedValue) : "—"}
          />
          <Row
            label={COPY.fields.nextAction}
            value={nextAction.label}
            valueClass={nextAction.tone}
          />
          <Row
            label={COPY.fields.temperature}
            value={
              <span className="inline-flex items-center gap-1">
                <Icon icon={tempMeta.icon} size={12} />
                {tempMeta.label}
              </span>
            }
          />
          <Row
            label={COPY.fields.origin}
            value={
              <span className="inline-flex items-center gap-1">
                <Icon icon={originMeta.icon} size={12} />
                {originMeta.label}
              </span>
            }
          />
          <Row label={COPY.fields.phone} value={formatPhone(lead.phone)} />
          <Row label={COPY.fields.email} value={lead.email ?? "—"} />
          <Row label={COPY.seller} value={seller?.fullName ?? "—"} />
          <Row label={COPY.createdAt} value={formatDateBR(lead.createdAt)} />
          {lead.lossReason && (
            <Row
              label={COPY.lossReason}
              value={lead.lossReason}
              valueClass="text-red-700 dark:text-red-300"
            />
          )}
          {lead.lossNotes && <Row label={COPY.lossNotes} value={lead.lossNotes} />}
          {lead.tags.length > 0 && (
            <Row
              label={COPY.fields.tags}
              value={
                <span className="flex flex-wrap gap-1">
                  {lead.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              }
            />
          )}
        </dl>
      )}
    </div>
  );
}

interface IRowProps {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}

function Row({ label, value, valueClass }: IRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0 sm:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-right text-sm font-medium text-foreground ${valueClass ?? ""}`}>
        {value}
      </dd>
    </div>
  );
}
