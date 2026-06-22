// Pure step-index math for the tour runtime.

export function clampStep(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.min(Math.max(index, 0), stepCount - 1);
}

export function nextStep(index: number, stepCount: number): number {
  return clampStep(index + 1, stepCount);
}

export function prevStep(index: number, stepCount: number): number {
  return clampStep(index - 1, stepCount);
}

export function isFirstStep(index: number): boolean {
  return index <= 0;
}

export function isLastStep(index: number, stepCount: number): boolean {
  return index >= stepCount - 1;
}
