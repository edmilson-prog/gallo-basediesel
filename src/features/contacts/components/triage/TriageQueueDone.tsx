import { Icon } from "@/components/Icon";

export interface ITriageQueueDoneProps {
  resolved: number;
}

/** The reward for clearing the queue — and where new contacts come from. */
export function TriageQueueDone({ resolved }: ITriageQueueDoneProps) {
  return (
    <div className="grid flex-1 place-items-center px-5 py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-severity-success/40 bg-severity-success/15">
          <Icon icon="mdi:check-all" size={26} className="text-severity-success" />
        </span>
        <h2 className="text-lg font-semibold text-foreground">Fila zerada</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {resolved > 0
            ? `${resolved} ${resolved === 1 ? "contato triado" : "contatos triados"} nesta sessão. `
            : ""}
          Números novos caem aqui automaticamente quando abrem conversa e não batem com nenhum
          cliente.
        </p>
      </div>
    </div>
  );
}
