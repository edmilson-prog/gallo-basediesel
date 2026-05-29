import type {
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  IExpense,
  ID,
} from "@/shared/types";
import { pickWeighted, type ISeededContext } from "./utils";

/**
 * Generate ~120 operational expenses across the last 12 months (PRD-054 RF-002).
 *
 * Composition:
 *  - Folha (payroll): recurring monthly mother + 11 children (~R$ 35k/mês).
 *  - Aluguel: recurring monthly mother + 11 children (~R$ 8k/mês).
 *  - Infraestrutura: 3 variable entries/month (luz, água, internet).
 *  - Avulsas: marketing, fornecedores, logística, manutenção, impostos, outros.
 *
 * Status distribution targets ~70% pago, ~15% pendente, ~10% atrasado, ~5%
 * cancelado, biased so older competences are mostly settled and recent ones
 * carry the open balance.
 */

const round2 = (v: number): number => Math.round(v * 100) / 100;

const PAYMENT_METHODS: ExpensePaymentMethod[] = [
  "pix",
  "boleto",
  "transferencia",
  "debito_automatico",
  "cartao",
];

const STATUS_WEIGHTS = [
  { value: "pago" as const, weight: 70 },
  { value: "pendente" as const, weight: 15 },
  { value: "atrasado" as const, weight: 10 },
  { value: "cancelado" as const, weight: 5 },
];

interface IExpenseGenContext {
  ctx: ISeededContext;
  storeId: ID;
  ownerId: ID;
  now: Date;
}

interface IBuildArgs {
  category: ExpenseCategory;
  description: string;
  amount: number;
  /** 0 = oldest month in the window, 11 = current month. */
  monthOffset: number;
  /** Day of month the bill is due. */
  dueDay: number;
  isRecurring?: boolean;
  recurrenceParentId?: ID;
  /** Force a status instead of the weighted pick (used for recurring series). */
  forcedStatus?: ExpenseStatus;
}

/** UTC midnight of `monthOffset` months before the current month, on `day`. */
function competenceMonthDate(now: Date, monthOffset: number, day = 1): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - monthOffset), day));
}

let seq = 0;
function nextId(): ID {
  seq += 1;
  return `exp-${String(seq).padStart(4, "0")}`;
}

function resolveStatus(
  gen: IExpenseGenContext,
  monthOffset: number,
  forced?: ExpenseStatus,
): ExpenseStatus {
  if (forced) return forced;
  // Months 0..7 (older) settle almost always; the last 4 months hold the open balance.
  if (monthOffset <= 7) return gen.ctx.bool(0.92) ? "pago" : "pendente";
  return pickWeighted(gen.ctx, STATUS_WEIGHTS);
}

function build(gen: IExpenseGenContext, args: IBuildArgs): IExpense {
  const { ctx, storeId, ownerId, now } = gen;
  const competence = competenceMonthDate(now, args.monthOffset, 1);
  const due = competenceMonthDate(now, args.monthOffset, Math.min(args.dueDay, 28));
  const status = resolveStatus(gen, args.monthOffset, args.forcedStatus);

  let paymentDate: string | undefined;
  if (status === "pago") {
    // Paid a few days around the due date — sometimes the following month, to
    // exercise the competence-vs-payment distinction the Cash Flow relies on.
    const slip = ctx.int(-3, 12);
    const paid = new Date(due.getTime());
    paid.setUTCDate(paid.getUTCDate() + slip);
    // Never record a payment in the future relative to `now`.
    paymentDate = paid.getTime() > now.getTime() ? now.toISOString() : paid.toISOString();
  }

  const createdAt = competence.toISOString();
  return {
    id: nextId(),
    description: args.description,
    category: args.category,
    amount: round2(args.amount),
    competenceDate: competence.toISOString(),
    paymentDate,
    status,
    dueDate: due.toISOString(),
    isRecurring: args.isRecurring ?? false,
    recurrenceParentId: args.recurrenceParentId,
    supplier: undefined,
    paymentMethod: status === "cancelado" ? undefined : ctx.pick(PAYMENT_METHODS),
    notes: status === "cancelado" ? "Lançamento cancelado." : undefined,
    storeId,
    createdBy: ownerId,
    createdAt,
    updatedAt: paymentDate ?? createdAt,
  };
}

const MONTH_LABELS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function monthLabel(now: Date, monthOffset: number): string {
  const d = competenceMonthDate(now, monthOffset, 1);
  return `${MONTH_LABELS[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}

export function generateExpenses(gen: IExpenseGenContext): IExpense[] {
  seq = 0;
  const { ctx, storeId, ownerId, now } = gen;
  const out: IExpense[] = [];

  // --- Recurring series: payroll (folha) ~R$ 35k, dueDay 5 ---
  const folhaMother = build(gen, {
    category: "folha",
    description: `Folha de pagamento - ${monthLabel(now, 0)}`,
    amount: 35_000 + ctx.int(-1500, 1500),
    monthOffset: 0,
    dueDay: 5,
    isRecurring: true,
    forcedStatus: "pago",
  });
  folhaMother.recurrenceConfig = { frequency: "mensal", dayOfMonth: 5 };
  out.push(folhaMother);
  for (let m = 1; m <= 11; m += 1) {
    out.push(
      build(gen, {
        category: "folha",
        description: `Folha de pagamento - ${monthLabel(now, m)}`,
        amount: 35_000 + ctx.int(-1500, 1500),
        monthOffset: m,
        dueDay: 5,
        isRecurring: true,
        recurrenceParentId: folhaMother.id,
        forcedStatus: m >= 10 ? undefined : "pago",
      }),
    );
  }

  // --- Recurring series: rent (aluguel) ~R$ 8k, dueDay 10 ---
  const aluguelMother = build(gen, {
    category: "aluguel",
    description: `Aluguel do galpão - ${monthLabel(now, 0)}`,
    amount: 8_000,
    monthOffset: 0,
    dueDay: 10,
    isRecurring: true,
    forcedStatus: "pago",
  });
  aluguelMother.recurrenceConfig = { frequency: "mensal", dayOfMonth: 10 };
  aluguelMother.supplier = "Imobiliária Westphalen";
  out.push(aluguelMother);
  for (let m = 1; m <= 11; m += 1) {
    const child = build(gen, {
      category: "aluguel",
      description: `Aluguel do galpão - ${monthLabel(now, m)}`,
      amount: 8_000,
      monthOffset: m,
      dueDay: 10,
      isRecurring: true,
      recurrenceParentId: aluguelMother.id,
      forcedStatus: m >= 11 ? undefined : "pago",
    });
    child.supplier = "Imobiliária Westphalen";
    out.push(child);
  }

  // --- Infrastructure: 3 variable bills per month ---
  const infraBills: { label: string; base: number; supplier: string; day: number }[] = [
    { label: "Energia elétrica", base: 2_200, supplier: "RGE Sul", day: 15 },
    { label: "Água e esgoto", base: 480, supplier: "CORSAN", day: 18 },
    { label: "Internet e telefonia", base: 690, supplier: "Vivo Empresas", day: 20 },
  ];
  for (let m = 0; m <= 11; m += 1) {
    for (const bill of infraBills) {
      const variance = bill.base * (ctx.rng() * 0.5 - 0.2); // -20% .. +30%
      const e = build(gen, {
        category: "infraestrutura",
        description: `${bill.label} - ${monthLabel(now, m)}`,
        amount: bill.base + variance,
        monthOffset: m,
        dueDay: bill.day,
      });
      e.supplier = bill.supplier;
      out.push(e);
    }
  }

  // --- Avulsas: marketing / fornecedores / logística / manutenção / impostos / outros ---
  const avulsas: {
    category: ExpenseCategory;
    description: string;
    min: number;
    max: number;
    supplier?: string;
  }[] = [
    {
      category: "marketing",
      description: "Campanha de marketing digital",
      min: 800,
      max: 4_500,
      supplier: "Agência Norte RS",
    },
    {
      category: "fornecedores",
      description: "Serviço de limpeza terceirizado",
      min: 600,
      max: 1_800,
      supplier: "Limpa Tudo ME",
    },
    {
      category: "fornecedores",
      description: "Contabilidade externa",
      min: 1_200,
      max: 1_200,
      supplier: "Contabilidade Gallo",
    },
    {
      category: "logistica",
      description: "Combustível frota de entrega",
      min: 900,
      max: 3_200,
      supplier: "Posto BR",
    },
    {
      category: "logistica",
      description: "Frete de transferência entre filiais",
      min: 400,
      max: 1_500,
    },
    {
      category: "manutencao",
      description: "Manutenção de empilhadeira",
      min: 350,
      max: 2_400,
      supplier: "TecnoPeças",
    },
    { category: "manutencao", description: "Manutenção do sistema elétrico", min: 300, max: 1_900 },
    {
      category: "impostos",
      description: "IPTU parcelado",
      min: 700,
      max: 700,
      supplier: "Prefeitura FW",
    },
    { category: "impostos", description: "Taxas e licenças", min: 200, max: 1_100 },
    { category: "outros", description: "Material de escritório", min: 150, max: 900 },
    { category: "outros", description: "Confraternização da equipe", min: 500, max: 3_000 },
  ];
  // Spread ~60 avulsas: pick entries across random months.
  for (let i = 0; i < 60; i += 1) {
    const tpl = ctx.pick(avulsas);
    const m = ctx.int(0, 11);
    const amount = tpl.min === tpl.max ? tpl.min : ctx.int(tpl.min, tpl.max);
    const e = build(gen, {
      category: tpl.category,
      description: `${tpl.description} - ${monthLabel(now, m)}`,
      amount,
      monthOffset: m,
      dueDay: ctx.int(5, 28),
    });
    if (tpl.supplier) e.supplier = tpl.supplier;
    out.push(e);
  }

  return out;
}
