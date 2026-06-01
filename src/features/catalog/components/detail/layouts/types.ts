import type { IPart } from "@/shared/types";

/** Shared contract for the three layout composers — they only arrange cards. */
export interface IPartLayoutProps {
  part: IPart;
}
