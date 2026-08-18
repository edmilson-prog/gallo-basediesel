import type { ID, ILeadFunnel, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "../../engine/accentClasses";
import { COPY } from "../../i18n/pt-BR";

export interface IAccessMatrixDialogProps {
  open: boolean;
  onClose: () => void;
  funnels: ILeadFunnel[];
  sellers: ISeller[];
  staffIds: ID[];
  accessByFunnel: Map<ID, ID[]>;
  onGoToFunnel: (funnelId: ID) => void;
}

/**
 * Who reaches which funnel — read-only, on purpose.
 *
 * One place to edit, another to check. An editable matrix was discarded: the
 * cell is ambiguous (does unticking remove the grant or close the funnel?), it
 * invites partial saves, and it is unusable on a phone.
 */
export function AccessMatrixDialog({
  open,
  onClose,
  funnels,
  sellers,
  staffIds,
  accessByFunnel,
  onGoToFunnel,
}: IAccessMatrixDialogProps) {
  const staff = new Set(staffIds);

  const reaches = (seller: ISeller, funnel: ILeadFunnel): boolean =>
    staff.has(seller.id) ||
    funnel.isDefault ||
    funnel.openToStore ||
    (accessByFunnel.get(funnel.id) ?? []).includes(seller.id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{COPY.admin.access.matrixTitle}</DialogTitle>
          <DialogDescription>{COPY.admin.access.matrixHint}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background px-2 py-1.5 text-left font-medium text-muted-foreground">
                  {COPY.admin.access.matrixSeller}
                </th>
                {funnels.map((f) => (
                  <th key={f.id} className="px-2 py-1.5 text-center font-medium">
                    <button
                      type="button"
                      onClick={() => onGoToFunnel(f.id)}
                      className="inline-flex items-center gap-1 rounded px-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        aria-hidden
                        className={cn("size-2 rounded-sm", getAccentClasses(f.accent).dot)}
                      />
                      <span className="max-w-[90px] truncate">{f.name}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="sticky left-0 z-10 truncate bg-background px-2 py-1.5">
                    {s.fullName}
                    {staff.has(s.id) && (
                      <Icon
                        icon="mdi:shield-account-outline"
                        size={11}
                        aria-hidden
                        className="ml-1 inline text-muted-foreground"
                      />
                    )}
                  </td>
                  {funnels.map((f) => (
                    <td key={f.id} className="px-2 py-1.5 text-center">
                      {reaches(s, f) ? (
                        <Icon
                          icon="mdi:check"
                          size={14}
                          aria-label="sim"
                          className="inline text-severity-success"
                        />
                      ) : (
                        <span className="text-muted-foreground" aria-label="não">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
