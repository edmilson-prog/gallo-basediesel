import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { IAssetLibraryItem } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssetLibraryProvider } from "@/providers/data";
import { isSensitiveAsset } from "../../engine/assetSensitivity";
import { SharedSnippetsManager } from "./SharedSnippetsManager";
import { AssetUsageStatsPage } from "./AssetUsageStatsPage";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface ILibraryManagerPageProps {}

const STATUS_TONE: Record<IAssetLibraryItem["status"], string> = {
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  draft: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  archived: "border-border bg-muted text-muted-foreground",
};

/**
 * Library governance hub (D-12/D-13). Per-asset publish/unpublish, version bump
 * and sensitivity toggle; tabs to shared snippets + usage stats. All mutations
 * route through useAssetLibraryProvider which audits via logMockMutation.
 */
export function LibraryManagerPage(_: ILibraryManagerPageProps) {
  const s = QUICK_SEND_STRINGS.library;
  const provider = useAssetLibraryProvider();
  const [items, setItems] = useState<IAssetLibraryItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    void provider
      .list({ pageSize: 200 })
      .then((res) => setItems(res.data));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const filtered = (items ?? []).filter((i) =>
    search.trim() ? i.title.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  const run = async (id: string, op: () => Promise<unknown>, okMsg: string) => {
    setBusyId(id);
    try {
      await op();
      toast.success(okMsg);
      refresh();
    } catch {
      toast.error(s.actionFailed);
    } finally {
      setBusyId(null);
    }
  };

  const togglePublish = (item: IAssetLibraryItem) =>
    run(
      item.id,
      () => (item.status === "published" ? provider.unpublish(item.id) : provider.publish(item.id)),
      item.status === "published" ? s.unpublishedToast : s.publishedToast,
    );

  const bump = (item: IAssetLibraryItem) =>
    run(
      item.id,
      () => provider.bumpVersion(item.id, { storageRef: item.storageRef, url: item.url }),
      s.versionBumpedToast,
    );

  const toggleSensitive = (item: IAssetLibraryItem) =>
    run(
      item.id,
      () =>
        provider.update(item.id, {
          sensitivity: item.sensitivity === "sensitive" ? "normal" : "sensitive",
        }),
      s.permissionUpdatedToast,
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.managerTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.managerDesc}</p>
      </div>

      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">{s.tabAssets}</TabsTrigger>
          <TabsTrigger value="snippets">{s.tabSnippets}</TabsTrigger>
          <TabsTrigger value="usage">{s.tabUsage}</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={s.searchAssets}
            className="max-w-sm"
          />
          <div className="rounded-lg border border-border bg-card">
            {items === null ? (
              <div className="p-4">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {s.assetsEmpty}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((item) => {
                  const sensitive = isSensitiveAsset(item);
                  const busy = busyId === item.id;
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {item.title}
                          </span>
                          <Badge variant="outline" className={STATUS_TONE[item.status]}>
                            {item.status === "published"
                              ? s.statusPublished
                              : item.status === "draft"
                                ? s.draft
                                : s.archived}
                          </Badge>
                          <Badge variant="secondary" className="font-mono text-[11px]">
                            v{item.version}
                          </Badge>
                          {sensitive && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            >
                              <Icon icon="mdi:lock-outline" size={11} />
                              {s.sensitive}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {item.brand ? `${item.brand} · ` : ""}
                          {item.category}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <Button
                          variant={item.status === "published" ? "outline" : "default"}
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => togglePublish(item)}
                        >
                          <Icon
                            icon={item.status === "published" ? "mdi:eye-off-outline" : "mdi:publish"}
                            size={14}
                          />
                          {item.status === "published" ? s.unpublish : s.publish}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => bump(item)}
                        >
                          <Icon icon="mdi:numeric-positive-1" size={14} />
                          {s.version}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => toggleSensitive(item)}
                        >
                          <Icon icon={sensitive ? "mdi:lock-open-outline" : "mdi:lock-outline"} size={14} />
                          {s.permission}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="snippets">
          <SharedSnippetsManager />
        </TabsContent>

        <TabsContent value="usage">
          <AssetUsageStatsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
