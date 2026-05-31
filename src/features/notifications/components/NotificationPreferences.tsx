/**
 * NotificationPreferences — channel×category preference matrix (PRD-009 / Chime).
 *
 * Abordagem A "Matriz Completa":
 *   - inApp + toast: editable Switches
 *   - email / whatsapp / sms / push: shown disabled with a "Fase 2" badge
 *   - inApp on transactional + system: locked (always on, non-silenceable)
 *   - Desktop: Table grid  |  Mobile: per-category Cards
 *   - Legend below the grid decodes the three cell states
 *
 * Accepts `audience="customer"` to trim rows/columns for the portal.
 */

import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORY_ICON, CATEGORY_LABEL } from "@/features/notifications/lib/severity";
import {
  isChannelLocked,
  isCategoryFullyOptional,
  useNotificationPreferences,
} from "@/providers/notifications";
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationRecipientType,
} from "@/providers/notifications";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NotificationPreferencesProps {
  recipientId: string;
  recipientType: NotificationRecipientType;
  /** Customer view trims to customer-relevant rows/columns. Default "internal". */
  audience?: "internal" | "customer";
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const INTERNAL_CATEGORIES: NotificationCategory[] = [
  "transactional",
  "operational",
  "commercial",
  "gamification",
  "system",
  "marketing",
];

const CUSTOMER_CATEGORIES: NotificationCategory[] = ["transactional", "commercial", "marketing"];

interface IChannelMeta {
  id: NotificationChannel;
  label: string;
  phase2: boolean;
}

const INTERNAL_CHANNELS: IChannelMeta[] = [
  { id: "inApp", label: "No app", phase2: false },
  { id: "toast", label: "Toast", phase2: false },
  { id: "email", label: "E-mail", phase2: true },
  { id: "whatsapp", label: "WhatsApp", phase2: true },
  { id: "sms", label: "SMS", phase2: true },
  { id: "push", label: "Push", phase2: true },
];

const CUSTOMER_CHANNELS: IChannelMeta[] = [
  { id: "inApp", label: "No app", phase2: false },
  { id: "email", label: "E-mail", phase2: true },
  { id: "whatsapp", label: "WhatsApp", phase2: true },
];

type CellState = "editable" | "locked" | "phase2";

function cellState(category: NotificationCategory, ch: IChannelMeta): CellState {
  if (ch.phase2) return "phase2";
  if (isChannelLocked(category, ch.id)) return "locked";
  return "editable";
}

// ---------------------------------------------------------------------------
// Cell sub-components
// ---------------------------------------------------------------------------

interface ICellControlProps {
  state: CellState;
  checked: boolean;
  isUpdating: boolean;
  ariaLabel: string;
  onToggle: (next: boolean) => void;
}

function CellControl({ state, checked, isUpdating, ariaLabel, onToggle }: ICellControlProps) {
  if (state === "editable") {
    return (
      <Switch
        checked={checked}
        disabled={isUpdating}
        onCheckedChange={onToggle}
        aria-label={ariaLabel}
      />
    );
  }

  if (state === "locked") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Wrapper needed: disabled elements don't fire pointer events */}
          <span className="inline-flex items-center gap-1">
            <Switch checked disabled aria-label={ariaLabel} />
            <Icon icon="mdi:lock" size={12} className="text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Sempre ativo (crítico)</TooltipContent>
      </Tooltip>
    );
  }

  // phase2
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex opacity-50">
          <Switch checked={checked} disabled aria-label={ariaLabel} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">Disponível na Fase 2</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function PreferencesSkeleton({
  categoryCount,
  channelCount,
}: {
  categoryCount: number;
  channelCount: number;
}) {
  return (
    <div className="space-y-4">
      {/* Desktop skeleton */}
      <div className="hidden md:block">
        <div className="overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="h-10 w-40 px-2">
                  <Skeleton className="h-4 w-20" />
                </th>
                {Array.from({ length: channelCount }).map((_, i) => (
                  <th key={i} className="h-10 px-4 text-center">
                    <Skeleton className="mx-auto h-4 w-14" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: categoryCount }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="px-2 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  {Array.from({ length: channelCount }).map((_, j) => (
                    <td key={j} className="px-4 py-3 text-center">
                      <Skeleton className="mx-auto h-5 w-9 rounded-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Mobile skeleton */}
      <div className="space-y-3 md:hidden">
        {Array.from({ length: categoryCount }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-3">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: Math.min(channelCount, 3) }).map((_, j) => (
              <div key={j} className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function PreferencesLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 text-xs text-muted-foreground">
      {/* Editable */}
      <span className="flex items-center gap-2">
        <Switch checked className="pointer-events-none scale-90" aria-hidden />
        <span>Editável</span>
      </span>
      {/* Locked */}
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <Switch checked disabled className="pointer-events-none scale-90" aria-hidden />
          <Icon icon="mdi:lock" size={12} />
        </span>
        <span>Sempre ativo — crítico</span>
      </span>
      {/* Phase 2 */}
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 opacity-50">
          <Switch checked={false} disabled className="pointer-events-none scale-90" aria-hidden />
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          Fase 2
        </Badge>
        <span>Disponível em breve</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NotificationPreferences({
  recipientId,
  recipientType,
  audience = "internal",
}: NotificationPreferencesProps) {
  const { preferences, isLoading, isError, update, isUpdating } = useNotificationPreferences(
    recipientId,
    recipientType,
  );

  const categories = audience === "customer" ? CUSTOMER_CATEGORIES : INTERNAL_CATEGORIES;
  const channels = audience === "customer" ? CUSTOMER_CHANNELS : INTERNAL_CHANNELS;

  const handleToggle = (
    category: NotificationCategory,
    channel: NotificationChannel,
    next: boolean,
  ) => {
    if (!preferences) return;
    const nextMatrix = {
      ...preferences.matrix,
      [category]: { ...preferences.matrix[category], [channel]: next },
    };
    void update({ ...preferences, matrix: nextMatrix, updatedAt: new Date().toISOString() });
  };

  // ---- Error state -------------------------------------------------------
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">Não foi possível carregar as preferências.</p>
    );
  }

  // ---- Loading / skeleton ------------------------------------------------
  if (isLoading || !preferences) {
    return <PreferencesSkeleton categoryCount={categories.length} channelCount={channels.length} />;
  }

  // ---- Desktop grid (Table) ----------------------------------------------
  const desktopGrid = (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-40 min-w-[8rem]">
              Categoria
            </TableHead>
            {channels.map((ch) => (
              <TableHead key={ch.id} scope="col" className="text-center min-w-[5rem]">
                <div className="flex flex-col items-center gap-1">
                  <span>{ch.label}</span>
                  {ch.phase2 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                      Fase 2
                    </Badge>
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => (
            <TableRow key={category}>
              {/* Row header */}
              <TableHead scope="row" className="font-medium">
                <span className="flex items-center gap-2">
                  <Icon icon={CATEGORY_ICON[category]} size={16} className="shrink-0" />
                  <span>{CATEGORY_LABEL[category]}</span>
                  {isCategoryFullyOptional(category) && (
                    <span className="text-xs text-muted-foreground font-normal">opcional</span>
                  )}
                </span>
              </TableHead>
              {/* Channel cells */}
              {channels.map((ch) => {
                const state = cellState(category, ch);
                const checked =
                  state === "locked" ? true : (preferences.matrix[category][ch.id] ?? false);
                return (
                  <TableCell key={ch.id} className="text-center">
                    <div className="flex justify-center">
                      <CellControl
                        state={state}
                        checked={checked}
                        isUpdating={isUpdating}
                        ariaLabel={`${CATEGORY_LABEL[category]} — ${ch.label}`}
                        onToggle={(next) => handleToggle(category, ch.id, next)}
                      />
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  // ---- Mobile cards ------------------------------------------------------
  const mobileCards = (
    <div className="space-y-3 md:hidden">
      {categories.map((category) => (
        <Card key={category}>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Icon icon={CATEGORY_ICON[category]} size={16} className="shrink-0" />
              <span>{CATEGORY_LABEL[category]}</span>
              {isCategoryFullyOptional(category) && (
                <span className="text-xs font-normal text-muted-foreground">opcional</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {channels.map((ch) => {
              const state = cellState(category, ch);
              const checked =
                state === "locked" ? true : (preferences.matrix[category][ch.id] ?? false);
              return (
                <div key={ch.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-sm">
                    {ch.label}
                    {ch.phase2 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        Fase 2
                      </Badge>
                    )}
                  </span>
                  <CellControl
                    state={state}
                    checked={checked}
                    isUpdating={isUpdating}
                    ariaLabel={`${CATEGORY_LABEL[category]} — ${ch.label}`}
                    onToggle={(next) => handleToggle(category, ch.id, next)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-2">
        {desktopGrid}
        {mobileCards}
        <PreferencesLegend />
      </div>
    </TooltipProvider>
  );
}
