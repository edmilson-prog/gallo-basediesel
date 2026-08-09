import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PixKeyType } from "@/shared/types";
import { toCanonicalPixKey, toDisplayPixKey, isValidPixKey } from "../../engine/pixKeyFormat";
import { toAscii, RECEIVER_NAME_MAX, RECEIVER_CITY_MAX } from "../../engine/pixBrCode";
import { CopyKeyButton } from "../CopyKeyButton";
import { PixPreviewThread } from "./PixPreviewThread";
import { PIX_STRINGS, PIX_TYPE_LABEL, PIX_TYPE_ICON, PIX_TYPE_PLACEHOLDER } from "../../i18n/pt-BR";
import type { PixKeyDraft } from "../../hooks/usePixKeyAdmin";

export interface IPixKeyEditorProps {
  /** Omitted in create mode. */
  initial?: PixKeyDraft;
  onSubmit: (v: PixKeyDraft) => Promise<void> | void;
  onCancel?: () => void;
  /**
   * Every shortcut already taken — PIX keys AND quick replies — minus the one
   * belonging to the row being edited. Assembled by the page.
   */
  existingShortcuts: string[];
}

/** Same grammar as the quick replies: leading slash, no whitespace. */
const SHORTCUT_RE = /^\/\S+$/;

/** CNPJ first: it is the key a parts distributor registers on day one. */
const KEY_TYPES: readonly PixKeyType[] = ["cnpj", "cpf", "phone", "email", "random"];

/** Big enough never to truncate — we want the true length, not a clamp. */
const COUNT_NO_LIMIT = 512;

/**
 * Counts what the BR Code builder actually measures. `buildPixPayload` validates
 * `toAscii(name).length`, so counting raw characters would let an emoji-padded
 * name read "over the limit" while the payload builds fine — and vice versa.
 */
function asciiLength(value: string): number {
  return toAscii(value, COUNT_NO_LIMIT).length;
}

const EMPTY_DRAFT: PixKeyDraft = {
  alias: "",
  keyType: "cnpj",
  keyValue: "",
  receiverName: "",
  receiverCity: "",
  defaultContext: "",
  shortcut: "",
  // Mirrors the column defaults in 20260807130000_create_pix_keys_table.sql.
  defaultSendText: true,
  defaultSendQr: false,
  isDefault: false,
  isActive: true,
};

/**
 * Form for creating or editing a PIX key, with the live message preview beside
 * it. Plain `useState` like `QuickReplyEditor` — react-hook-form + zod exist in
 * the project but the neighbour screen does not use them, and one screen is not
 * the place to fork the convention.
 *
 * The key is held CANONICAL in state: the input displays
 * `toDisplayPixKey(type, canonical)` while every write — the provider, the
 * preview and `CopyKeyButton` — reads the canonical value. A display value
 * copied by accident is a money bug (see `pixKeyFormat.ts`).
 */
export function PixKeyEditor({
  initial,
  onSubmit,
  onCancel,
  existingShortcuts,
}: IPixKeyEditorProps) {
  const s = PIX_STRINGS.editor;
  const base = initial ?? EMPTY_DRAFT;

  const [alias, setAlias] = useState(base.alias);
  const [keyType, setKeyType] = useState<PixKeyType>(base.keyType);
  const [keyValue, setKeyValue] = useState(base.keyValue);
  const [receiverName, setReceiverName] = useState(base.receiverName);
  const [receiverCity, setReceiverCity] = useState(base.receiverCity);
  const [context, setContext] = useState(base.defaultContext ?? "");
  const [shortcut, setShortcut] = useState(base.shortcut ?? "");
  const [sendText, setSendText] = useState(base.defaultSendText);
  const [sendQr, setSendQr] = useState(base.defaultSendQr);
  const [isDefault, setIsDefault] = useState(base.isDefault);
  const [isActive, setIsActive] = useState(base.isActive);
  const [submitting, setSubmitting] = useState(false);

  // --- Derived state ---------------------------------------------------------

  const aliasTrimmed = alias.trim();
  const keyInvalid = keyValue !== "" && !isValidPixKey(keyType, keyValue);
  const keyUsable = keyValue !== "" && !keyInvalid;

  // Counted in ASCII, because that is the length the BR Code rejects on.
  const nameLength = asciiLength(receiverName);
  const cityLength = asciiLength(receiverCity);
  const nameTooLong = nameLength > RECEIVER_NAME_MAX;
  const cityTooLong = cityLength > RECEIVER_CITY_MAX;

  const shortcutTrimmed = shortcut.trim();
  const shortcutInvalid = shortcutTrimmed !== "" && !SHORTCUT_RE.test(shortcutTrimmed);
  const hasCollision =
    shortcutTrimmed !== "" &&
    !shortcutInvalid &&
    existingShortcuts.some(
      (existing) => existing.trim().toLowerCase() === shortcutTrimmed.toLowerCase(),
    );

  const canSubmit =
    aliasTrimmed !== "" &&
    keyUsable &&
    nameLength > 0 &&
    !nameTooLong &&
    cityLength > 0 &&
    !cityTooLong &&
    !shortcutInvalid &&
    !hasCollision;

  // --- Handlers --------------------------------------------------------------

  /** Re-canonicalises the current value under the new type (CNPJ -> phone etc.). */
  function handleTypeChange(next: PixKeyType) {
    setKeyType(next);
    setKeyValue(toCanonicalPixKey(next, keyValue));
  }

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        alias: aliasTrimmed,
        keyType,
        keyValue,
        receiverName: receiverName.trim(),
        receiverCity: receiverCity.trim(),
        // "" and NOT undefined: the providers skip `undefined` keys in the
        // patch, so clearing the message or the shortcut would silently keep
        // the previous value. An empty string is falsy everywhere it is read.
        defaultContext: context.trim(),
        shortcut: shortcutTrimmed,
        defaultSendText: sendText,
        defaultSendQr: sendQr,
        // An inactive key can never be the store default — the composer only
        // ever looks at active keys, so a "default" flag on a disabled key is a
        // contradiction the user should not be able to save.
        isDefault: isDefault && isActive,
        isActive,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render ----------------------------------------------------------------

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* ── Left column: form ── */}
      <div className="space-y-4">
        {/* Alias */}
        <div className="space-y-1">
          <label htmlFor="pix-alias" className="text-sm font-medium text-foreground">
            {s.alias}
          </label>
          <Input
            id="pix-alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder={s.aliasPlaceholder}
            autoComplete="off"
          />
        </div>

        {/* Key type */}
        <div className="space-y-1">
          <label htmlFor="pix-key-type" className="text-sm font-medium text-foreground">
            {s.keyType}
          </label>
          <Select value={keyType} onValueChange={(v) => handleTypeChange(v as PixKeyType)}>
            <SelectTrigger id="pix-key-type" aria-label={s.keyType}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KEY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  <span className="flex items-center gap-2">
                    <Icon icon={PIX_TYPE_ICON[type]} size={15} aria-hidden="true" />
                    {PIX_TYPE_LABEL[type]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Key value — displayed formatted, stored canonical */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="pix-key-value" className="text-sm font-medium text-foreground">
              {s.keyValue}
            </label>
            {/* Only once the key is valid: offering to copy a half-typed key is
                offering to paste the wrong account into a bank app. */}
            {keyUsable && <CopyKeyButton value={keyValue} label={aliasTrimmed} compact />}
          </div>
          <Input
            id="pix-key-value"
            value={toDisplayPixKey(keyType, keyValue)}
            onChange={(e) => setKeyValue(toCanonicalPixKey(keyType, e.target.value))}
            placeholder={PIX_TYPE_PLACEHOLDER[keyType]}
            className={cn(
              "font-mono",
              keyInvalid && "border-severity-warning ring-1 ring-severity-warning/50",
            )}
            aria-invalid={keyInvalid}
            aria-describedby={keyInvalid ? "pix-key-value-error" : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {keyInvalid && (
            <p
              id="pix-key-value-error"
              role="alert"
              className="flex items-center gap-1 text-[11px] text-severity-warning"
            >
              <Icon icon="mdi:alert-outline" size={12} aria-hidden="true" />
              {s.invalidKey}
            </p>
          )}
        </div>

        {/* Receiver name */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="pix-receiver-name" className="text-sm font-medium text-foreground">
              {s.receiverName}
            </label>
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                nameTooLong ? "text-severity-warning" : "text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {s.counter(nameLength, RECEIVER_NAME_MAX)}
            </span>
          </div>
          <Input
            id="pix-receiver-name"
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            className={cn(nameTooLong && "border-severity-warning ring-1 ring-severity-warning/50")}
            aria-invalid={nameTooLong}
            aria-describedby="pix-receiver-name-hint"
            autoComplete="off"
          />
          <p
            id="pix-receiver-name-hint"
            role={nameTooLong ? "alert" : undefined}
            className={cn(
              "flex items-center gap-1 text-[11px]",
              nameTooLong ? "text-severity-warning" : "text-muted-foreground",
            )}
          >
            {nameTooLong && <Icon icon="mdi:alert-outline" size={12} aria-hidden="true" />}
            {nameTooLong ? s.receiverNameTooLong : s.receiverNameHint}
          </p>
        </div>

        {/* Receiver city */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="pix-receiver-city" className="text-sm font-medium text-foreground">
              {s.receiverCity}
            </label>
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                cityTooLong ? "text-severity-warning" : "text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {s.counter(cityLength, RECEIVER_CITY_MAX)}
            </span>
          </div>
          <Input
            id="pix-receiver-city"
            value={receiverCity}
            onChange={(e) => setReceiverCity(e.target.value)}
            className={cn(cityTooLong && "border-severity-warning ring-1 ring-severity-warning/50")}
            aria-invalid={cityTooLong}
            aria-describedby="pix-receiver-city-hint"
            autoComplete="off"
          />
          <p
            id="pix-receiver-city-hint"
            role={cityTooLong ? "alert" : undefined}
            className={cn(
              "flex items-center gap-1 text-[11px]",
              cityTooLong ? "text-severity-warning" : "text-muted-foreground",
            )}
          >
            {cityTooLong && <Icon icon="mdi:alert-outline" size={12} aria-hidden="true" />}
            {cityTooLong ? s.receiverCityTooLong : s.receiverCityHint}
          </p>
        </div>

        {/* Default message */}
        <div className="space-y-1">
          <label htmlFor="pix-context" className="text-sm font-medium text-foreground">
            {s.defaultContext}
          </label>
          <Textarea
            id="pix-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={s.defaultContextPlaceholder}
            rows={3}
            className="resize-none text-base md:text-sm"
          />
        </div>

        {/* Shortcut */}
        <div className="space-y-1">
          <label htmlFor="pix-shortcut" className="text-sm font-medium text-foreground">
            {s.shortcut}
          </label>
          <Input
            id="pix-shortcut"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder={s.shortcutPlaceholder}
            className={cn(
              "font-mono",
              (shortcutInvalid || hasCollision) &&
                "border-severity-warning ring-1 ring-severity-warning/50",
            )}
            aria-invalid={shortcutInvalid || hasCollision}
            aria-describedby={
              shortcutInvalid
                ? "pix-shortcut-error"
                : hasCollision
                  ? "pix-shortcut-collision"
                  : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
          {shortcutInvalid && (
            <p
              id="pix-shortcut-error"
              role="alert"
              className="flex items-center gap-1 text-[11px] text-severity-warning"
            >
              <Icon icon="mdi:alert-outline" size={12} aria-hidden="true" />
              {s.shortcutInvalid}
            </p>
          )}
          {/* Blocking, unlike QuickReplyEditor's advisory warning: two owners of
              one shortcut means `findByShortcut` returns whichever sorted first,
              and here that decides which bank account the customer pays. */}
          {!shortcutInvalid && hasCollision && (
            <p
              id="pix-shortcut-collision"
              role="alert"
              className="flex items-center gap-1 text-[11px] text-severity-warning"
            >
              <Icon icon="mdi:alert-circle-outline" size={12} aria-hidden="true" />
              {s.shortcutCollision(shortcutTrimmed)}
            </p>
          )}
        </div>

        {/* Send defaults */}
        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium text-foreground">{s.sendDefaults}</legend>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="pix-send-text" className="text-sm text-foreground">
              {s.sendTextOption}
            </label>
            <Switch id="pix-send-text" checked={sendText} onCheckedChange={setSendText} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="pix-send-qr" className="text-sm text-foreground">
              {s.sendQrOption}
            </label>
            <Switch id="pix-send-qr" checked={sendQr} onCheckedChange={setSendQr} />
          </div>
        </fieldset>

        {/* Flags */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="pix-is-active" className="text-sm text-foreground">
              {s.isActive}
            </label>
            <Switch id="pix-is-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="pix-is-default"
              className={cn("text-sm", isActive ? "text-foreground" : "text-muted-foreground")}
            >
              {s.isDefault}
            </label>
            <Switch
              id="pix-is-default"
              checked={isDefault && isActive}
              disabled={!isActive}
              onCheckedChange={setIsDefault}
              aria-describedby={!isActive ? "pix-is-default-hint" : undefined}
            />
          </div>
          {!isActive && (
            <p id="pix-is-default-hint" className="text-[11px] text-muted-foreground">
              {s.isDefaultInactiveHint}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            aria-label={s.save}
            title={!canSubmit ? s.missingFields : undefined}
          >
            {submitting && (
              <Icon icon="mdi:loading" size={14} className="animate-spin" aria-hidden="true" />
            )}
            {s.save}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              {s.cancel}
            </Button>
          )}
        </div>
      </div>

      {/* ── Right column: live preview ── */}
      <PixPreviewThread
        alias={alias}
        keyType={keyType}
        keyValue={keyValue}
        receiverName={receiverName}
        receiverCity={receiverCity}
        context={context}
        sendText={sendText}
        sendQr={sendQr}
      />
    </div>
  );
}
