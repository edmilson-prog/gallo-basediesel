import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { formatDateTimeBR } from "@/shared/utils/format";
import { DetailCard } from "./DetailCard";

/** Structural shape of an audit entry — avoids coupling to the exact audit type. */
export interface IDetailHistoryEntry {
  id: string;
  action: string;
  timestamp: string;
  actorId: string;
}

export interface IDetailHistoryProps {
  audits: IDetailHistoryEntry[];
  describeAction: (action: string) => string;
  footer?: ReactNode;
}

export function DetailHistory({ audits, describeAction, footer }: IDetailHistoryProps) {
  return (
    <DetailCard icon="mdi:history" title="Histórico">
      {audits.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem eventos registrados ainda.</p>
      ) : (
        <ol className="space-y-2">
          {audits.map((a) => (
            <li key={a.id} className="flex items-start gap-3 border-l-2 border-border pl-3 text-xs">
              <Icon icon="mdi:circle-medium" size={14} className="-ml-[18px] mt-0.5 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-foreground">{describeAction(a.action)}</p>
                <p className="text-muted-foreground">
                  {formatDateTimeBR(a.timestamp)} · {a.actorId}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {footer}
    </DetailCard>
  );
}
