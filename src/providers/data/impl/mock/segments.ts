import { segmentsApi } from "@/mocks";
import type { ISegmentsProvider } from "../../contracts/segments";

export const mockSegmentsProvider: ISegmentsProvider = {
  list: (params) => segmentsApi.list(params),
};
