import type { IQueueCounters } from "../engine/queueOrder";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

function Box({ value, label, dotClass }: { value: number; label: string; dotClass: string }) {
  return (
    <div className="flex-1 rounded bg-card px-3 py-2.5 ring-1 ring-inset ring-border">
      <div className="flex items-center gap-1.5">
        <span className={`h-[7px] w-[7px] rounded-full ${dotClass}`} aria-hidden />
        <span className="font-display text-[26px] font-extrabold leading-none tabular-nums text-foreground">
          {value}
        </span>
      </div>
      <p className="mt-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/** The three counters at the top of the waiting screen. */
export function PwaQueueCounters({ counters }: { counters: IQueueCounters }) {
  return (
    <div className="flex gap-2 px-3.5 pb-3.5 pt-3">
      <Box value={counters.critical} label={S.queue.critical} dotClass="bg-severity-critical" />
      <Box value={counters.warning} label={S.queue.warning} dotClass="bg-severity-warning" />
      <Box value={counters.total} label={S.queue.total} dotClass="bg-muted-foreground" />
    </div>
  );
}
