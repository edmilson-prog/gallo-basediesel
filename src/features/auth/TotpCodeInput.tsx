import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { TOTP_CODE_LENGTH } from "./engine/mfaGate";

interface ITotpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when the sixth digit lands — lets the caller auto-submit. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
}

/**
 * Six-digit TOTP entry, split 3 + 3. Shared by the login challenge and the
 * activation dialog so both read and behave identically.
 */
export function TotpCodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  "aria-label": ariaLabel = "Código de verificação",
}: ITotpCodeInputProps) {
  const half = TOTP_CODE_LENGTH / 2;
  return (
    <InputOTP
      maxLength={TOTP_CODE_LENGTH}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={ariaLabel}
      containerClassName="justify-center"
    >
      <InputOTPGroup>
        {Array.from({ length: half }).map((_, i) => (
          <InputOTPSlot key={i} index={i} className="h-12 w-11 text-lg" />
        ))}
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        {Array.from({ length: TOTP_CODE_LENGTH - half }).map((_, i) => (
          <InputOTPSlot key={half + i} index={half + i} className="h-12 w-11 text-lg" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
