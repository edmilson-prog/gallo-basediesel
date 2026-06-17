import { Icon } from "@/components/Icon";

interface IAccessBlockedNoticeProps {
  /** ISO instant of the next allowed login window, when known. */
  nextOpenAt?: string | null;
}

const NEXT_OPEN_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatNextOpenAt(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return NEXT_OPEN_FORMATTER.format(parsed);
}

/**
 * Login-screen notice shown when a successful auth is blocked by the user's
 * work-schedule rule (PRD-212). Mirrors the `role="alert"` error block styling.
 */
export function AccessBlockedNotice({ nextOpenAt }: IAccessBlockedNoticeProps) {
  const formatted = nextOpenAt ? formatNextOpenAt(nextOpenAt) : null;

  return (
    <div
      role="alert"
      className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
    >
      <div className="flex items-center gap-2 font-semibold">
        <Icon icon="mdi:clock-alert-outline" size={16} />
        Fora do seu horário de atendimento.
      </div>
      {formatted && <p>Acesso liberado a partir de {formatted}.</p>}
      <p>Precisa entrar agora? Solicite uma liberação temporária ao seu gestor.</p>
    </div>
  );
}
