import type { ID, ILead } from "@/shared/types";
import { CLOSING_STAGE_ID, daysInStage, isConverted } from "./leadDisplay";

export interface IStageMetrics {
  stageId: ID;
  count: number;
  averageDays: number;
}

export interface IGlobalMetrics {
  total: number;
  activeCount: number;
  convertedCount: number;
  lostCount: number;
  conversionRate: number;
  averageCycleDays: number;
  averageValue: number;
}

const PERIOD_DAYS = 30;

export function computeStageMetrics(
  leads: ILead[],
  stageId: ID,
  now: Date = new Date(),
): IStageMetrics {
  const inStage = leads.filter((l) => l.stage.id === stageId);
  const days = inStage.map((l) => daysInStage(l, now));
  const total = days.reduce((acc, d) => acc + d, 0);
  return {
    stageId,
    count: inStage.length,
    averageDays: inStage.length === 0 ? 0 : total / inStage.length,
  };
}

export function computeGlobalMetrics(leads: ILead[], now: Date = new Date()): IGlobalMetrics {
  const total = leads.length;
  const converted = leads.filter(isConverted);
  const lost = leads.filter(
    (l) => l.lossReason !== undefined && l.convertedToCustomerId === undefined,
  );
  const active = leads.filter((l) => l.stage.id !== CLOSING_STAGE_ID);

  const periodStart = now.getTime() - PERIOD_DAYS * 86_400_000;
  const periodLeads = leads.filter((l) => new Date(l.createdAt).getTime() >= periodStart);
  const periodConverted = periodLeads.filter(isConverted);
  const conversionRate = periodLeads.length === 0 ? 0 : periodConverted.length / periodLeads.length;

  // Tempo médio total — usa updatedAt como proxy de conversion timestamp
  const cycleDays = converted.map((l) => {
    const start = new Date(l.createdAt).getTime();
    const end = new Date(l.updatedAt).getTime();
    return Math.max(0, (end - start) / 86_400_000);
  });
  const averageCycleDays =
    cycleDays.length === 0 ? 0 : cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length;

  const convertedValues = converted.map((l) => l.estimatedValue ?? 0).filter((v) => v > 0);
  const averageValue =
    convertedValues.length === 0
      ? 0
      : convertedValues.reduce((a, b) => a + b, 0) / convertedValues.length;

  return {
    total,
    activeCount: active.length,
    convertedCount: converted.length,
    lostCount: lost.length,
    conversionRate,
    averageCycleDays,
    averageValue,
  };
}
