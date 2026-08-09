import { sellersApi } from "@/mocks";
import type { ID } from "@/shared/types";
import type { ISellersProvider } from "../../contracts/sellers";
import { scopedListParams } from "./_storeScope";

/** Reads the picked file as a data URL — the mock stand-in for a bucket upload. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("[mock] sellers.uploadAvatar failed: unreadable file"));
    reader.readAsDataURL(file);
  });
}

export const mockSellersProvider: ISellersProvider = {
  list: (params) => sellersApi.list(scopedListParams(params, "seller")),
  get: (id) => sellersApi.get(id),
  setAvailability: (id, availability) => sellersApi.setAvailability(id, availability),
  update: (id, patch) => sellersApi.update(id, patch),
  // No bucket in the mock backend: the photo lives inline in the store, so it
  // survives a re-render but not a reload — enough to exercise the flow.
  uploadAvatar: (_id: ID, file: File) => readAsDataUrl(file),
  create: (input) => sellersApi.create(input),
  remove: (id) => sellersApi.remove(id),
};
