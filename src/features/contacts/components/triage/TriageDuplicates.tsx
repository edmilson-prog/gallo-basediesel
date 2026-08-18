import type { IContact, IContactDuplicatePair } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { CONTACT_SOURCE_LABELS } from "../../utils/labels";

export interface ITriageDuplicatesProps {
  pairs: IContactDuplicatePair[];
  isLoading: boolean;
  isError: boolean;
  /** Pairs the attendant already decided on, by pair id. */
  settled: Set<string>;
  onMerge: (pair: IContactDuplicatePair) => void;
  onKeepBoth: (pair: IContactDuplicatePair) => void;
  busy: boolean;
}

function Side({ contact, keep }: { contact: IContact; keep: boolean }) {
  const rows: { icon: string; value: string }[] = [
    { icon: "mdi:phone-outline", value: contact.phone ?? "sem telefone" },
    { icon: "mdi:office-building-outline", value: contact.customerName ?? "sem cliente" },
    { icon: "mdi:email-outline", value: contact.email ?? "sem e-mail" },
    { icon: "mdi:tag-outline", value: CONTACT_SOURCE_LABELS[contact.source] },
  ];

  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-lg border p-3",
        keep
          ? "border-severity-success/40 bg-severity-success/[0.08]"
          : "border-border bg-muted/20",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{contact.name}</span>
        {keep && (
          <Badge className="border-severity-success/40 bg-severity-success/15 text-[10px] text-severity-success">
            manter
          </Badge>
        )}
      </div>
      {rows.map((row) => (
        <div key={row.icon} className="flex items-center gap-1.5 py-0.5">
          <Icon icon={row.icon} size={13} className="shrink-0 text-muted-foreground/70" />
          <span className="truncate text-xs text-muted-foreground">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Probable duplicates, side by side.
 *
 * The kept record is always on the left and marked, because a merge is not a
 * symmetric operation — the attendant has to know which one survives before
 * clicking, not after.
 */
export function TriageDuplicates({
  pairs,
  isLoading,
  isError,
  settled,
  onMerge,
  onKeepBoth,
  busy,
}: ITriageDuplicatesProps) {
  const pending = pairs.filter((pair) => !settled.has(pair.id));

  if (isLoading) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Varrendo a agenda por números repetidos e e-mails compartilhados…
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <p className="max-w-sm text-sm text-severity-critical">
          Não foi possível procurar duplicados. Tente novamente.
        </p>
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div className="max-w-md">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-severity-success/40 bg-severity-success/15">
            <Icon icon="mdi:check-all" size={26} className="text-severity-success" />
          </span>
          <h2 className="text-lg font-semibold text-foreground">Nenhum duplicado pendente</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A detecção compara o número (tratando a variação do 9º dígito) e o e-mail. Contatos que
            não batem em nenhum dos dois não aparecem aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon icon="mdi:information-outline" size={14} />
          {pending.length} {pending.length === 1 ? "par provável" : "pares prováveis"} — mesmo
          número (com ou sem o 9º dígito) ou mesmo e-mail.
        </p>

        {pending.map((pair) => (
          <div key={pair.id} className="mb-3 rounded-xl border border-border bg-card p-4">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Icon icon="mdi:alert-circle-outline" size={15} className="text-severity-warning" />
              <span className="text-xs font-medium text-severity-warning">{pair.reason}</span>
            </div>

            <div className="flex items-stretch gap-2.5">
              <Side contact={pair.primary} keep />
              <div className="grid shrink-0 place-items-center text-muted-foreground">
                <Icon icon="mdi:arrow-left" size={16} />
              </div>
              <Side contact={pair.duplicate} keep={false} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => onMerge(pair)}>
                <Icon icon="mdi:call-merge" size={15} />
                Mesclar
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onKeepBoth(pair)}>
                Não são a mesma pessoa
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
