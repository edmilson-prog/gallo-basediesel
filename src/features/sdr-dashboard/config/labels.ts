import type { SdrFinishReason, SdrEscalationReason, SdrEscalationMode } from "@/shared/types";

export const FINISH_REASON_LABEL: Record<SdrFinishReason, string> = {
  completed: "Concluído",
  escalated: "Escalado",
  abandoned: "Abandonado",
  paused_by_human: "Pausado por humano",
};

export const FINISH_REASON_COLOR: Record<SdrFinishReason, string> = {
  completed: "#10b981",
  escalated: "#f59e0b",
  abandoned: "#94a3b8",
  paused_by_human: "#3b82f6",
};

export const ESCALATION_REASON_LABEL: Record<SdrEscalationReason, string> = {
  customer_requested: "Cliente solicitou",
  negotiation_detected: "Negociação detectada",
  sdr_failed: "SDR falhou",
  complexity: "Complexidade alta",
  out_of_scope: "Fora do escopo",
  qualified_handoff: "Triagem concluída",
};

export const ESCALATION_REASON_COLOR: Record<SdrEscalationReason, string> = {
  customer_requested: "#3b82f6",
  negotiation_detected: "#f59e0b",
  sdr_failed: "#ef4444",
  complexity: "#a855f7",
  out_of_scope: "#94a3b8",
  qualified_handoff: "#16a34a",
};

export const ESCALATION_MODE_LABEL: Record<SdrEscalationMode, string> = {
  urgent: "Urgente",
  normal: "Normal",
  standard: "Padrão",
};

export const ESCALATION_MODE_COLOR: Record<SdrEscalationMode, string> = {
  urgent: "#ef4444",
  normal: "#f59e0b",
  standard: "#10b981",
};

export const FAQ_CATEGORY_LABEL: Record<string, string> = {
  horario: "Horário",
  entrega: "Entrega",
  pagamento: "Pagamento",
  garantia: "Garantia",
};

export const PERIOD_LABEL = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  today: "Hoje",
  custom: "Personalizado",
} as const;
