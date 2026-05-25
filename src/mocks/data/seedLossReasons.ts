import type { ILossReason } from "@/shared/types";

export const SEED_LOSS_REASONS: ILossReason[] = [
  { id: "loss-preco", name: "Preço acima da concorrência", active: true },
  { id: "loss-prazo", name: "Prazo de entrega longo demais", active: true },
  { id: "loss-pagamento", name: "Condição de pagamento incompatível", active: true },
  { id: "loss-sem-estoque", name: "Sem estoque da peça pedida", active: true },
  { id: "loss-comprou-fora", name: "Cliente comprou em outro fornecedor", active: true },
  { id: "loss-desistencia", name: "Cliente desistiu da compra", active: true },
  { id: "loss-sem-contato", name: "Cliente sumiu / sem retorno", active: true },
  { id: "loss-outro", name: "Outro motivo", active: true },
];
