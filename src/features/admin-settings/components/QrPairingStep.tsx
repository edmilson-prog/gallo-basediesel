import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import type { IEvolutionPairing } from "../hooks/useEvolutionPairing";

/**
 * Presentational pairing step: white QR card (camera contrast — deliberate
 * exception to semantic tokens), countdown ring, WhatsApp Web-style steps and
 * an aria-live status line. All behavior lives in useEvolutionPairing.
 */

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface IQrPairingStepProps {
  pairing: IEvolutionPairing;
}

export function QrPairingStep({ pairing }: IQrPairingStepProps) {
  const { phase, qrBase64, secondsLeft, ttlSeconds, errorMessage, renew } = pairing;
  const ringOffset = RING_CIRCUMFERENCE * (1 - secondsLeft / Math.max(1, ttlSeconds));

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {/* QR over pure white — required quiet zone for camera scanning. */}
      <div className="mx-auto shrink-0">
        <div className="relative rounded-lg bg-white p-4">
          {phase === "loading-qr" || !qrBase64 ? (
            <div className="flex h-64 w-64 items-center justify-center">
              <Icon icon="mdi:loading" size={32} className="animate-spin text-neutral-400" />
            </div>
          ) : (
            <img
              src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
              alt="QR code de conexão do WhatsApp"
              className="h-64 w-64"
            />
          )}
          {phase === "expired" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/85">
              <Icon icon="mdi:refresh" size={28} className="text-neutral-600" />
              <Button size="sm" onClick={renew}>
                Gerar novo código
              </Button>
            </div>
          )}
        </div>
        {(phase === "qr" || phase === "loading-qr") && (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle
                cx="11"
                cy="11"
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.2"
                strokeWidth="2.5"
              />
              <circle
                cx="11"
                cy="11"
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 11 11)"
                className="text-primary motion-reduce:hidden"
              />
            </svg>
            <span aria-live="off">Expira em {formatSeconds(secondsLeft)}</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>
            Abra o <strong>WhatsApp</strong> no celular
          </li>
          <li>
            Toque em <strong>⋮ Menu</strong> → <strong>Dispositivos conectados</strong>
          </li>
          <li>
            Toque em <strong>Conectar dispositivo</strong>
          </li>
          <li>Aponte a câmera para este código</li>
        </ol>

        {phase === "error" ? (
          <p
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-1.5 text-sm text-severity-critical"
          >
            <Icon icon="mdi:alert-circle-outline" size={16} className="mt-0.5 shrink-0" />
            {errorMessage}
          </p>
        ) : (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 text-sm text-severity-info"
          >
            {phase === "loading-qr" && (
              <>
                <Icon icon="mdi:loading" size={16} className="animate-spin" />
                Gerando código de conexão…
              </>
            )}
            {phase === "qr" && (
              <>
                <Icon icon="mdi:qrcode-scan" size={16} />
                Escaneie o código com seu celular.
              </>
            )}
            {phase === "connecting" && (
              <>
                <Icon icon="mdi:cellphone-link" size={16} />
                Celular detectado! Pareando o número…
              </>
            )}
            {phase === "expired" && (
              <>
                <Icon icon="mdi:refresh" size={16} />O código expirou. Gere um novo para continuar.
              </>
            )}
          </p>
        )}

        {phase === "error" && (
          <Button size="sm" variant="outline" onClick={renew}>
            <Icon icon="mdi:refresh" size={14} className="mr-1.5" />
            Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}
