import { afterEach, describe, expect, it } from "vitest";

import {
  SETTLEMENT_PREPARATION_EXPERIENCE,
  getSettlementPreparationExperience,
  isPoaTerritorySelectionV2Enabled,
} from "@/lib/feature-flags";
import { REQUEST_EDIT_STEP, getRequestEditStepperItems } from "@/lib/requests";
import { REQUEST_STATUS, REQUEST_TYPE } from "@/types/requests";

const originalPoaTerritoryFlag = process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_V2;

afterEach(() => {
  if (originalPoaTerritoryFlag === undefined) delete process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_V2;
  else process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_V2 = originalPoaTerritoryFlag;
});

describe("POA territory selection V2 feature flag", () => {
  it("keeps the legacy sentinel behavior unless the literal V2 flag is enabled", () => {
    delete process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_V2;
    expect(isPoaTerritorySelectionV2Enabled()).toBe(false);

    process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_V2 = "true";
    expect(isPoaTerritorySelectionV2Enabled()).toBe(true);
  });
});

describe("REXAN settlement preparation eligibility", () => {
  it("selecciona la experiencia V2 solo para REXAN editable en modo edición", () => {
    expect(getSettlementPreparationExperience({
      mode: "edit",
      requestType: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      status: REQUEST_STATUS.DRAFT,
    })).toBe(SETTLEMENT_PREPARATION_EXPERIENCE.V2_FOUNDATION);
    expect(getSettlementPreparationExperience({
      mode: "edit",
      requestType: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      status: REQUEST_STATUS.OBSERVED,
    })).toBe(SETTLEMENT_PREPARATION_EXPERIENCE.V2_FOUNDATION);
  });

  it.each([
    { mode: "create" as const, requestType: REQUEST_TYPE.ADVANCE_SETTLEMENT, status: REQUEST_STATUS.DRAFT },
    { mode: "edit" as const, requestType: REQUEST_TYPE.ADVANCE, status: REQUEST_STATUS.DRAFT },
    { mode: "edit" as const, requestType: REQUEST_TYPE.ADVANCE_SETTLEMENT, status: REQUEST_STATUS.SUBMITTED },
    { mode: "edit" as const, requestType: REQUEST_TYPE.ADVANCE_SETTLEMENT, status: null },
  ])("usa fallback legacy para $requestType/$status", (input) => {
    expect(getSettlementPreparationExperience(input)).toBe(SETTLEMENT_PREPARATION_EXPERIENCE.LEGACY);
  });

  it("no altera getRequestEditStepperItems cuando la experiencia V2 está activa", () => {
    expect(getRequestEditStepperItems(REQUEST_EDIT_STEP.DATA, {
      requestType: REQUEST_TYPE.ADVANCE_SETTLEMENT,
    }).map(({ step, label }) => ({ step, label }))).toEqual([
      { step: REQUEST_EDIT_STEP.DATA, label: "Datos del anticipo" },
      { step: REQUEST_EDIT_STEP.DOCUMENTS, label: "Sustentos de rendición" },
      { step: REQUEST_EDIT_STEP.REVIEW, label: "Revisión de rendición" },
    ]);
  });
});
