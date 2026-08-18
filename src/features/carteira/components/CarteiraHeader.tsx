import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";

export interface ICarteiraHeaderProps {
  totalCustomers: number;
  sellerCount: number;
  coverageCount: number;
  coveredCustomers: number;
  unassigned: number;
  isLoading: boolean;
  canManage: boolean;
  onNewCoverage: () => void;
  onTransferCustomers: () => void;
}

const TRIGGER_CLASS =
  "relative rounded-none border-0 bg-transparent px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground shadow-none transition-colors data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-sm after:bg-transparent data-[state=active]:after:bg-primary";

/**
 * Page header: the wallet's headline numbers, then the one action that can be
 * completed here.
 *
 * "Nova cobertura" is primary because it is the only transfer this screen can
 * finish on its own. Permanent transfers need a customer in hand, so they are a
 * secondary link out to Clientes with a label that says so, instead of a menu
 * item that fires a toast and navigates away.
 */
export function CarteiraHeader({
  totalCustomers,
  sellerCount,
  coverageCount,
  coveredCustomers,
  unassigned,
  isLoading,
  canManage,
  onNewCoverage,
  onTransferCustomers,
}: ICarteiraHeaderProps) {
  const strings = CARTEIRA_STRINGS.page;

  return (
    <div className="border-b border-border/40 bg-background/85 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
      <div className="flex flex-wrap items-start gap-3.5 px-4 pb-3 pt-4 md:px-6">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold uppercase tracking-[0.02em] text-foreground">
            {strings.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[13px]">
            {isLoading ? (
              <span className="text-muted-foreground">Carregando a carteira…</span>
            ) : (
              <>
                <span className="text-foreground/70">
                  <b className="font-semibold tabular-nums text-foreground">
                    {totalCustomers.toLocaleString("pt-BR")}
                  </b>{" "}
                  clientes entre <b className="font-semibold text-foreground">{sellerCount}</b>{" "}
                  {sellerCount === 1 ? "vendedor" : "vendedores"}
                </span>
                <span className="text-muted-foreground/70">·</span>
                {coverageCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-severity-warning">
                    <Icon icon="mdi:clock-outline" size={14} />
                    {strings.coverageSummary(coverageCount, coveredCustomers)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{strings.noCoverage}</span>
                )}
                {unassigned > 0 && (
                  <>
                    <span className="text-muted-foreground/70">·</span>
                    <span className="inline-flex items-center gap-1.5 text-severity-critical">
                      <Icon icon="mdi:account-off-outline" size={14} />
                      {strings.unassignedSummary(unassigned)}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {canManage && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTransferCustomers}
              title={strings.transferCustomersHint}
            >
              <Icon icon="mdi:account-multiple-outline" size={14} />
              {strings.transferCustomers}
              <Icon icon="mdi:open-in-new" size={12} className="text-muted-foreground" />
            </Button>
            <Button type="button" size="sm" onClick={onNewCoverage}>
              <Icon icon="mdi:plus" size={15} />
              {strings.newCoverage}
            </Button>
          </div>
        )}
      </div>

      <TabsList className="h-auto w-full justify-start gap-0.5 rounded-none border-0 bg-transparent p-0 px-4 md:px-6">
        <TabsTrigger value="wallet" className={TRIGGER_CLASS}>
          {CARTEIRA_STRINGS.tabs.wallet}
        </TabsTrigger>
        <TabsTrigger value="history" className={TRIGGER_CLASS}>
          {CARTEIRA_STRINGS.tabs.history}
        </TabsTrigger>
        <TabsTrigger value="audit" className={TRIGGER_CLASS}>
          {CARTEIRA_STRINGS.tabs.audit}
        </TabsTrigger>
      </TabsList>
    </div>
  );
}
