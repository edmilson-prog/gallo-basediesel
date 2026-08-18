import type { IPart } from "@/shared/types";
import type { IPartDraft, IPartDraftErrors } from "../../../utils/draft";

/** Shared contract for the three layout composers — they only arrange cards. */
export interface IPartLayoutProps {
  part: IPart;
  editing: boolean;
  draft: IPartDraft;
  onDraftChange: (patch: Partial<IPartDraft>) => void;
  priceLocked: boolean;
  errors: IPartDraftErrors;
  /** Enter edit mode from an in-content affordance (design kit's per-row pencil). */
  onRequestEdit?: () => void;
}
