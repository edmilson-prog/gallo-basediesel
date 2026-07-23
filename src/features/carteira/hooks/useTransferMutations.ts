import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useTransfersProvider } from "@/providers/data";
import type { ICreateTransferInput } from "@/providers/data";

export function useCreateTransfer() {
  const provider = useTransfersProvider();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ICreateTransferInput) => provider.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["carteira-transfers"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
    },
  });
}

export interface IRevertOrExpireArgs {
  transferId: ID;
  /** ISeller.id of the acting user — attributes the audit_logs entry. */
  actorId?: ID;
}

export function useRevertTransfer() {
  const provider = useTransfersProvider();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transferId, actorId }: IRevertOrExpireArgs) =>
      provider.revert(transferId, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["carteira-transfers"] });
      void queryClient.invalidateQueries({ queryKey: ["carteira-audit"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
    },
  });
}

export function useExpireTransfer() {
  const provider = useTransfersProvider();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transferId, actorId }: IRevertOrExpireArgs) =>
      provider.expire(transferId, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["carteira-transfers"] });
      void queryClient.invalidateQueries({ queryKey: ["carteira-audit"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
    },
  });
}
