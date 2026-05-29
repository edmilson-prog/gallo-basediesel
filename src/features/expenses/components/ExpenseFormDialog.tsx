import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseRecurrenceFrequency,
  ID,
  IExpense,
} from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/Icon";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_FREQUENCY_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSES_STRINGS as S,
} from "../i18n/pt-BR";
import { dateInputToIso, isoToDateInput, monthStartIso } from "../utils/dateInput";
import type {
  ExpenseSeriesScope,
  ICreateExpenseInput,
  IUpdateExpenseSeriesInput,
} from "@/providers/data";

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
const METHODS = Object.keys(EXPENSE_PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[];
const FREQUENCIES = Object.keys(EXPENSE_FREQUENCY_LABELS) as ExpenseRecurrenceFrequency[];

interface IFormState {
  description: string;
  category: ExpenseCategory;
  amount: string;
  competenceMonth: string; // yyyy-MM
  dueDate: string; // yyyy-MM-dd
  supplier: string;
  paymentMethod: ExpensePaymentMethod | "";
  isRecurring: boolean;
  frequency: ExpenseRecurrenceFrequency;
  dayOfMonth: string;
  recurrenceEndMonth: string; // yyyy-MM
  notes: string;
}

function emptyState(): IFormState {
  const now = new Date();
  return {
    description: "",
    category: "outros",
    amount: "",
    competenceMonth: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    dueDate: "",
    supplier: "",
    paymentMethod: "",
    isRecurring: false,
    frequency: "mensal",
    dayOfMonth: "5",
    recurrenceEndMonth: "",
    notes: "",
  };
}

function fromExpense(e: IExpense): IFormState {
  const d = new Date(e.competenceDate);
  return {
    description: e.description,
    category: e.category,
    amount: String(e.amount),
    competenceMonth: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    dueDate: isoToDateInput(e.dueDate),
    supplier: e.supplier ?? "",
    paymentMethod: e.paymentMethod ?? "",
    isRecurring: e.isRecurring,
    frequency: e.recurrenceConfig?.frequency ?? "mensal",
    dayOfMonth: String(e.recurrenceConfig?.dayOfMonth ?? 5),
    recurrenceEndMonth: e.recurrenceConfig?.endDate
      ? isoToDateInput(e.recurrenceConfig.endDate).slice(0, 7)
      : "",
    notes: e.notes ?? "",
  };
}

interface IExpenseFormDialogProps {
  open: boolean;
  expense: IExpense | null;
  storeId: ID;
  createdBy: ID;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: ICreateExpenseInput) => Promise<IExpense>;
  onUpdate: (id: ID, patch: Partial<IExpense>) => Promise<IExpense>;
  onUpdateSeries: (input: IUpdateExpenseSeriesInput) => Promise<IExpense[]>;
  onSaved: () => void;
}

export function ExpenseFormDialog({
  open,
  expense,
  storeId,
  createdBy,
  onOpenChange,
  onCreate,
  onUpdate,
  onUpdateSeries,
  onSaved,
}: IExpenseFormDialogProps) {
  const isEdit = expense !== null;
  const isRecurring = expense?.isRecurring ?? false;
  const [form, setForm] = useState<IFormState>(emptyState());
  const [scope, setScope] = useState<ExpenseSeriesScope>("one");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(expense ? fromExpense(expense) : emptyState());
      setScope("one");
      setError(null);
    }
  }, [open, expense]);

  const set = <K extends keyof IFormState>(key: K, value: IFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    const amount = Number(form.amount);
    if (!form.description.trim()) return setError("Informe uma descrição.");
    if (!Number.isFinite(amount) || amount <= 0)
      return setError("Informe um valor maior que zero.");
    if (!form.competenceMonth) return setError("Informe a competência.");
    const competenceDate = monthStartIso(`${form.competenceMonth}-01`);
    const dueDate = form.dueDate ? dateInputToIso(form.dueDate) : undefined;
    if (dueDate && dueDate < competenceDate) {
      return setError("O vencimento não pode ser anterior à competência.");
    }

    setBusy(true);
    setError(null);
    try {
      if (isEdit && expense) {
        const patch: Partial<IExpense> = {
          description: form.description.trim(),
          category: form.category,
          amount,
          competenceDate,
          dueDate,
          supplier: form.supplier.trim() || undefined,
          paymentMethod: form.paymentMethod || undefined,
          notes: form.notes.trim() || undefined,
        };
        if (isRecurring && scope !== "one") {
          await onUpdateSeries({ id: expense.id, patch, scope });
          toast.success(S.seriesUpdated);
        } else {
          await onUpdate(expense.id, patch);
          toast.success(S.formSaved);
        }
      } else {
        const recurring = form.isRecurring;
        await onCreate({
          description: form.description.trim(),
          category: form.category,
          amount,
          competenceDate,
          paymentDate: undefined,
          dueDate,
          isRecurring: recurring,
          recurrenceConfig: recurring
            ? {
                frequency: form.frequency,
                dayOfMonth: Math.min(28, Math.max(1, Number(form.dayOfMonth) || 1)),
                endDate: form.recurrenceEndMonth
                  ? monthStartIso(`${form.recurrenceEndMonth}-01`)
                  : undefined,
              }
            : undefined,
          supplier: form.supplier.trim() || undefined,
          paymentMethod: form.paymentMethod || undefined,
          attachmentUrl: undefined,
          notes: form.notes.trim() || undefined,
          storeId,
          createdBy,
        });
        toast.success(recurring ? S.formRecurringSaved : S.formSaved);
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error(S.formSaveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? S.editExpense : S.newExpense}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">{S.formDescription}</Label>
            <Input
              id="exp-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Conta de luz - janeiro/2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{S.formCategory}</Label>
              <Select
                value={form.category}
                onValueChange={(v) => set("category", v as ExpenseCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">{S.formAmount}</Label>
              <Input
                id="exp-amount"
                type="number"
                min={0}
                step={0.01}
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                className="text-right tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-competence">{S.formCompetence}</Label>
              <Input
                id="exp-competence"
                type="month"
                value={form.competenceMonth}
                onChange={(e) => set("competenceMonth", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-due">{S.formDueDate}</Label>
              <Input
                id="exp-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-supplier">{S.formSupplier}</Label>
              <Input
                id="exp-supplier"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{S.formPaymentMethod}</Label>
              <Select
                value={form.paymentMethod || "none"}
                onValueChange={(v) =>
                  set("paymentMethod", v === "none" ? "" : (v as ExpensePaymentMethod))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {EXPENSE_PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isEdit && isRecurring && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label>{S.scopeQuestion}</Label>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as ExpenseSeriesScope)}>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="one" /> {S.scopeOne}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="future" /> {S.scopeFuture}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="all" /> {S.scopeAll}
                </label>
              </RadioGroup>
            </div>
          )}

          {!isEdit && (
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="exp-recurring" className="cursor-pointer">
                  {S.formRecurringToggle}
                </Label>
                <Switch
                  id="exp-recurring"
                  checked={form.isRecurring}
                  onCheckedChange={(v) => set("isRecurring", v)}
                />
              </div>
              {form.isRecurring && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{S.formFrequency}</Label>
                    <Select
                      value={form.frequency}
                      onValueChange={(v) => set("frequency", v as ExpenseRecurrenceFrequency)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {EXPENSE_FREQUENCY_LABELS[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{S.formDayOfMonth}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      value={form.dayOfMonth}
                      onChange={(e) => set("dayOfMonth", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{S.formEndDate}</Label>
                    <Input
                      type="month"
                      value={form.recurrenceEndMonth}
                      onChange={(e) => set("recurrenceEndMonth", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="exp-notes">{S.formNotes}</Label>
            <Textarea
              id="exp-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <Icon icon="mdi:paperclip" size={14} />
            {S.formAttachmentPhase2}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {S.formCancel}
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? "Salvando…" : S.formSave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
