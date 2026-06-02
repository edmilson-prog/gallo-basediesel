import type { ID, IProductIndicator } from "@/shared/types";
import { selectAllIndicators } from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListIndicatorsParams extends IPaginationParams {
  storeId?: ID;
  scopeLevel?: IProductIndicator["scopeLevel"];
  sellerId?: ID;
  metric?: IProductIndicator["metric"];
  status?: IProductIndicator["status"];
}

export const indicatorsApi = {
  list(params: IListIndicatorsParams = {}): Promise<IPaginatedResult<IProductIndicator>> {
    return runApi(
      "indicatorsApi",
      "list",
      () => {
        let all = selectAllIndicators();
        if (params.storeId) all = all.filter((i) => i.storeId === params.storeId);
        if (params.scopeLevel) all = all.filter((i) => i.scopeLevel === params.scopeLevel);
        if (params.sellerId) all = all.filter((i) => i.sellerId === params.sellerId);
        if (params.metric) all = all.filter((i) => i.metric === params.metric);
        if (params.status) all = all.filter((i) => i.status === params.status);
        const sorted = [...all].sort((a, b) => b.period.end.localeCompare(a.period.end));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async upsert(indicator: IProductIndicator): Promise<IProductIndicator> {
    return runApi("indicatorsApi", "upsert", () =>
      upsert("indicators", { ...indicator, updatedAt: new Date().toISOString() }),
    );
  },

  async update(id: ID, patch: Partial<IProductIndicator>): Promise<IProductIndicator> {
    return runApi("indicatorsApi", "update", () => {
      const updated = patchById("indicators", id, {
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      if (!updated) throw new MockNotFoundError("indicator", id);
      return updated;
    });
  },
};
