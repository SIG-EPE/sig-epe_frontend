import { REQUEST_STATUS, REQUEST_TYPE, type RequestStatus, type RequestType } from "@/types/requests";

export const SETTLEMENT_PREPARATION_EXPERIENCE = {
  LEGACY: "legacy",
  V2_FOUNDATION: "v2-foundation",
} as const;

export type SettlementPreparationExperience =
  (typeof SETTLEMENT_PREPARATION_EXPERIENCE)[keyof typeof SETTLEMENT_PREPARATION_EXPERIENCE];

interface SettlementPreparationExperienceInput {
  mode: "create" | "edit";
  requestType: RequestType;
  status: RequestStatus | null;
}

export function getSettlementPreparationExperience({
  mode,
  requestType,
  status,
}: SettlementPreparationExperienceInput): SettlementPreparationExperience {
  const isEditableStatus = status === REQUEST_STATUS.DRAFT || status === REQUEST_STATUS.OBSERVED;
  const usesV2Foundation = mode === "edit"
    && requestType === REQUEST_TYPE.ADVANCE_SETTLEMENT
    && isEditableStatus;

  return usesV2Foundation
    ? SETTLEMENT_PREPARATION_EXPERIENCE.V2_FOUNDATION
    : SETTLEMENT_PREPARATION_EXPERIENCE.LEGACY;
}
