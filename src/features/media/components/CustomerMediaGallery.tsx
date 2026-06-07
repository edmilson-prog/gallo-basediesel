// src/features/media/components/CustomerMediaGallery.tsx
import type { ID } from "@/shared/types";
import { useCustomerMedia } from "../hooks/useCustomerMedia";
import { useMediaGridColumns } from "../hooks/useMediaGridColumns";
import { MediaGallery } from "./MediaGallery";

interface ICustomerMediaGalleryProps {
  customerId: ID;
}

/** Aggregated media across all the customer's conversations (Ficha tab, PRD-012). */
export function CustomerMediaGallery({ customerId }: ICustomerMediaGalleryProps) {
  const media = useCustomerMedia(customerId);
  // Responsive column count: 2 (mobile) → 3 (sm) → 4 (md) → 5 (lg) → 6 (xl+).
  // Previously hardcoded to 4, which left tiles cramped on narrow viewports (360px).
  const columns = useMediaGridColumns();
  return (
    <div className="h-[70vh] min-h-[420px]">
      <MediaGallery
        scope="customer"
        assets={media.assets}
        isLoading={media.isLoading}
        isError={media.isError}
        onRetryLoad={media.refetch}
        columns={columns}
      />
    </div>
  );
}
