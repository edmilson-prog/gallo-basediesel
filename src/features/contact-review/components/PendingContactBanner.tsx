import { useState } from "react";
import type { IConversation, ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import { ConvertContactDialog } from "./ConvertContactDialog";
import { MarkNotCustomerDialog } from "./MarkNotCustomerDialog";

export interface IPendingContactBannerProps {
  customer: ICustomer;
  conversation?: IConversation | null;
}

export function PendingContactBanner({ customer, conversation }: IPendingContactBannerProps) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon icon="mdi:alert-outline" size={16} className="text-warning" />
        <span className="text-sm font-medium text-warning">{S.banner.title}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => setConvertOpen(true)}>{S.banner.convert}</Button>
        <Button size="sm" variant="outline" onClick={() => setDiscardOpen(true)}>{S.banner.discard}</Button>
      </div>

      <ConvertContactDialog
        customer={customer}
        conversation={conversation}
        open={convertOpen}
        onOpenChange={setConvertOpen}
      />
      <MarkNotCustomerDialog
        customerId={customer.id}
        conversation={conversation}
        open={discardOpen}
        onOpenChange={setDiscardOpen}
      />
    </div>
  );
}
