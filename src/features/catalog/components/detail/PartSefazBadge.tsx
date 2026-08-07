import { toast } from "sonner";
import type { SefazStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { formatDateBR } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.sefaz;

export interface IPartSefazBadgeProps {
  status?: SefazStatus;
  checkedAt?: string;
}

/** SEFAZ validation badge — colour + icon + text (never colour alone). */
export function PartSefazBadge({ status = "not_checked", checkedAt }: IPartSefazBadgeProps) {
  if (status === "validated") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-severity-success/15 px-2 py-0.5 text-[11px] font-medium text-severity-success">
        <Icon icon="mdi:check-decagram" size={12} />
        {checkedAt ? COPY.validatedAt(formatDateBR(checkedAt)) : COPY.validated}
      </span>
    );
  }

  if (status === "invalid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <Icon icon="mdi:alert-circle-outline" size={12} />
        {COPY.invalid}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-severity-warning/15 px-2 py-0.5 text-[11px] font-medium text-severity-warning">
        <Icon icon="mdi:shield-alert-outline" size={12} />
        {COPY.notChecked}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 cursor-pointer px-2 text-[11px]"
        onClick={() => toast.info(COPY.checkSoon)}
      >
        {COPY.check}
      </Button>
    </span>
  );
}
