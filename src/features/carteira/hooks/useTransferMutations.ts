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
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
    },
  });
}

export function useRevertTransfer() {
  const provider = useTransfersProvider();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transferId: ID) => provider.revert(transferId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["carteira-transfers"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
    },
  });
}

export function useExpireTransfer() {
  const provider = useTransfersProvider();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transferId: ID) => provider.expire(transferId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["carteira-transfers"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
    },
  });
}
