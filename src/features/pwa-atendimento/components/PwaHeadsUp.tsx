import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import type { IHeadsUpNotice } from "../hooks/useHeadsUpNotice";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

interface IPwaHeadsUpProps {
  notice: IHeadsUpNotice | null;
  onDismiss: () => void;
}

/**
 * Faixa de aviso para mensagem que chegou em OUTRA conversa.
 *
 * Duas decisões de leitura, ambas vindas de um print do aparelho:
 *
 * 1. **Abaixo da barra de status.** `top-2` cru punha o cartão por cima do
 *    relógio e da bateria do iPhone — em modo app a janela começa no topo
 *    físico da tela. `env(safe-area-inset-top)` desce até onde a tela é
 *    realmente do app; em aparelho sem entalhe o valor é 0 e nada muda.
 * 2. **Papel, não carvão.** O cartão escuro se dissolvia no app escuro e na
 *    faixa preta do sistema logo acima. O kit já tem um sinal para "mensagem
 *    que chegou": o balão de entrada é papel claro sobre o app escuro. A faixa
 *    passa a falar a mesma língua, com o filete dourado do kit na lateral.
 */
export function PwaHeadsUp({ notice, onDismiss }: IPwaHeadsUpProps) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className="absolute inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[70] flex animate-in overflow-hidden rounded-lg bg-foreground text-background shadow-lg duration-200 fade-in slide-in-from-top-2"
    >
      <span className="w-[3px] shrink-0 bg-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link
          to="/atendimento/conversa/$id"
          params={{ id: notice.conversationId }}
          onClick={onDismiss}
          className="flex gap-3 px-3 pb-2.5 pt-3 text-left"
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-background">
            <Icon
              icon={notice.icon ?? "mdi:message-badge-outline"}
              size={18}
              className="text-primary"
            />
          </span>
          <span className="min-w-0 flex-1">
            {/* O nome do app não cabe aqui: dentro do app, dizer "GALLO
                Atendimento" gasta a linha mais visível para informar o que a
                pessoa já sabe. O que ela não sabe é o que chegou. */}
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-background/55">
              {S.push.headsUpEyebrow}
              <span className="text-background/35">·</span>
              <span className="normal-case tracking-normal text-background/45">
                {S.push.headsUpNow}
              </span>
            </span>
            {notice.title && (
              <span className="mt-1 block truncate text-sm font-extrabold text-background">
                {notice.title}
              </span>
            )}
            <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-background/70">
              {notice.body}
            </span>
          </span>
        </Link>
        <div className="flex border-t border-background/15">
          <Link
            to="/atendimento/conversa/$id"
            params={{ id: notice.conversationId }}
            onClick={onDismiss}
            className="flex min-h-[44px] flex-1 items-center justify-center text-[13px] font-extrabold text-background"
          >
            {S.push.headsUpOpen}
          </Link>
          <span className="w-px bg-background/15" aria-hidden />
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[44px] flex-1 text-[13px] font-bold text-background/55"
          >
            {S.push.headsUpDismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
