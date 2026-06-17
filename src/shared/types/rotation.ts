import type { ID, ISO8601 } from "./common";
import type { ISeller } from "./people";

/** Direcionamento da fila por loja (PRD-213). */
export type RotationTargetMode = "direct" | "department";

/**
 * Fila de atendimento — uma por loja (1:1 com IStore). A própria fila é a
 * config por loja (o targetMode NÃO é duplicado em IPlatformSettings).
 */
export interface IRotationQueue {
  id: ID;
  storeId: ID;
  targetMode: RotationTargetMode;
  /** Ponteiro do topo (justiça temporal). null = começar do início. */
  lastAssignedRefId?: ID | null;
  /** Sempre true (decisão 8-A); exposto para flexibilização futura. */
  skipOffline: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/**
 * Participante de uma fila. Dois escopos:
 *  - TOPO: scopeDepartmentId null (refType 'seller' no modo direct,
 *    'department' no modo department).
 *  - INTERNO: scopeDepartmentId preenchido → membro do rodízio interno daquele
 *    departamento (refType 'seller').
 */
export interface IRotationParticipant {
  id: ID;
  queueId: ID;
  scopeDepartmentId?: ID | null;
  refType: "seller" | "department";
  refId: ID;
  order: number;
  enabled: boolean;
  /** Ponteiro INTERNO do departamento (só quando refType='department'). */
  lastAssignedMemberId?: ID | null;
}

/** Motivo pelo qual um participante foi pulado na seleção (RF-023). */
export type RotationSkipReason =
  | "skipped_disabled"
  | "skipped_offline"
  | "skipped_inactive"
  | "skipped_off_hours";

/** Um participante avaliado na seleção (trace + visão ao vivo). */
export interface IRotationCandidate {
  refId: ID;
  refType: "seller" | "department";
  reason: RotationSkipReason | "selected";
  selected: boolean;
}

/** Entrada da seleção pura. */
export interface IRotationSelectionInput {
  queue: IRotationQueue;
  /** Participantes do topo (scopeDepartmentId null). */
  participants: IRotationParticipant[];
  /** Rodízio interno por departamento (chave = departmentId). */
  membersByDepartment: Record<ID, IRotationParticipant[]>;
  /** Sellers indexados por id (availability, workSchedule, active, role). */
  sellersById: Record<ID, ISeller>;
  now: Date;
}

/** Resultado da seleção pura. */
export interface IRotationSelectionResult {
  /** null = ninguém elegível → fluxo segue o fallback do PRD-013. */
  selectedSellerId: ID | null;
  /** Departamento vencedor (só no modo department). */
  selectedDepartmentId: ID | null;
  candidates: IRotationCandidate[];
  /** Novo last_assigned_ref_id (null = inalterado). */
  nextTopPointer: ID | null;
  /** Novos last_assigned_member_id por departamento (modo department). */
  nextMemberPointerByDept: Record<ID, ID>;
}

/** Estado agregado da fila (usado pela UI e pela integração). */
export interface IRotationQueueState {
  queue: IRotationQueue;
  topParticipants: IRotationParticipant[];
  membersByDepartment: Record<ID, IRotationParticipant[]>;
}
