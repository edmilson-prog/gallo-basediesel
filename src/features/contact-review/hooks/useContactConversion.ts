import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ICustomer, ID } from "@/shared/types";
import { useCustomersProvider, type IConvertPendingContactInput } from "@/providers/data";

export interface IUseContactConversionResult {
  saving: boolean;
  convert: (input: IConvertPendingContactInput, conversationId?: ID | null) => Promise<ICustomer>;
  discard: (customerId: ID, conversationId?: ID | null) => Promise<ICustomer>;
}

export function useContactConversion(): IUseContactConversionResult {
  const provider = useCustomersProvider();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Invalidate ONLY customer/queue/conversation-detail keys — never the frozen
  // Atendimento message/media caches (#137).
  const invalidate = useCallback(
    (customerId: ID, conversationId?: ID | null) => {
      void queryClient.invalidateQueries({ queryKey: ["customer-profile", customerId] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-contacts"] });
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: ["conversation-detail", conversationId] });
      }
    },
    [queryClient],
  );

  const convert = useCallback(
    async (input: IConvertPendingContactInput, conversationId?: ID | null) => {
      setSaving(true);
      try {
        const result = await provider.convertPendingContact(input);
        invalidate(input.customerId, conversationId);
        return result;
      } finally {
        setSaving(false);
      }
    },
    [provider, invalidate],
  );

  const discard = useCallback(
    async (customerId: ID, conversationId?: ID | null) => {
      setSaving(true);
      try {
        const result = await provider.markContactNotCustomer(customerId);
        invalidate(customerId, conversationId);
        return result;
      } finally {
        setSaving(false);
      }
    },
    [provider, invalidate],
  );

  return { saving, convert, discard };
}
