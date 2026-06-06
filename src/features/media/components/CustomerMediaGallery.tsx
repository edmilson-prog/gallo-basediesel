// src/features/media/components/CustomerMediaGallery.tsx
import type { ID } from "@/shared/types";
import { useCustomerMedia } from "../hooks/useCustomerMedia";
import { MediaGallery } from "./MediaGallery";

interface ICustomerMediaGalleryProps {
  customerId: ID;
}

/** Aggregated media across all the customer's conversations (Ficha tab, PRD-012). */
export function CustomerMediaGallery({ customerId }: ICustomerMediaGalleryProps) {
  const media = useCustomerMedia(customerId);
  return (
    <div className="h-[70vh] min-h-[420px]">
      <MediaGallery
        scope="customer"
        assets={media.assets}
        isLoading={media.isLoading}
        isError={media.isError}
        onRetryLoad={media.refetch}
        columns={4}
      />
    </div>
  );
}
