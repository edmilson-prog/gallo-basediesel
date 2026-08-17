/**
 * Custo médio ponderado (PRD-216, RC-04).
 *
 * Chamado uma vez por peça no lançamento da nota. Saldo zero ou negativo e
 * média desconhecida caem no custo da entrada — não há média a preservar, e
 * misturar um saldo negativo na ponderação produziria custo sem sentido.
 */

export interface IAverageCostInput {
  currentStock: number;
  currentAverage: number;
  incomingQuantity: number;
  incomingUnitCost: number;
}

export function weightedAverageCost(input: IAverageCostInput): number {
  if (input.incomingQuantity <= 0) return input.currentAverage;
  if (input.currentStock <= 0 || input.currentAverage <= 0) return input.incomingUnitCost;

  const currentValue = input.currentStock * input.currentAverage;
  const incomingValue = input.incomingQuantity * input.incomingUnitCost;
  return (currentValue + incomingValue) / (input.currentStock + input.incomingQuantity);
}
