import type { IMessage } from "@/shared/types";
import { formatTime } from "../../utils/messageDisplay";

/**
 * System bubbles are inline annotations such as "Agente SDR ativado" or
 * "Carlos assumiu o atendimento". Centered, italic, no balloon.
 */
export function SystemBubble({ message }: { message: IMessage }) {
  return (
    <div className="my-1 flex items-center justify-center">
      <span className="rounded-full bg-muted/60 px-3 py-1 text-[11px] italic text-muted-foreground">
        {message.text}
        <span className="ml-2 not-italic">· {formatTime(message.sentAt)}</span>
      </span>
    </div>
  );
}
