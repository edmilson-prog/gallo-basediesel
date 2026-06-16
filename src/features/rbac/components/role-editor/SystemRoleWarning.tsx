import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLE_EDITOR_LABELS } from "../../i18n/pt-BR";

export interface ISystemRoleWarningProps {
  /** Whether the warning dialog is open. */
  open: boolean;
  /** "Do not warn again this session" checkbox state. */
  dontAskAgain: boolean;
  /** Toggles the "do not warn again" checkbox. */
  onDontAskAgainChange: (value: boolean) => void;
  /** User confirmed — proceed with the pending edit. */
  onConfirm: () => void;
  /** User cancelled — drop the pending edit. */
  onCancel: () => void;
}

/**
 * First-edit guard for system roles (PRD-211 Task 10).
 *
 * Fires the first time the user toggles a cell of a `isSystem` role (Owner is
 * excluded — it is immutable and never reaches this path). Confirming applies
 * the pending edit; an opt-out checkbox suppresses the dialog for the rest of
 * the session.
 */
export function SystemRoleWarning({
  open,
  dontAskAgain,
  onDontAskAgainChange,
  onConfirm,
  onCancel,
}: ISystemRoleWarningProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing via overlay / Escape counts as cancel.
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ROLE_EDITOR_LABELS.systemWarningTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {ROLE_EDITOR_LABELS.systemWarningBody}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={dontAskAgain}
            onCheckedChange={(checked) => onDontAskAgainChange(checked === true)}
          />
          {ROLE_EDITOR_LABELS.systemWarningDontAskAgain}
        </label>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {ROLE_EDITOR_LABELS.systemWarningCancel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {ROLE_EDITOR_LABELS.systemWarningConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
