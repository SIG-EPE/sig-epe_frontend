import { describe, expect, it } from "vitest";

import { toCreateRequestDto, toUpdateRequestDto, type RequestFormValues } from "@/components/requests/request-form";
import { ACCOUNT_TYPE, BANK_CODE, BENEFICIARY_DOCUMENT_TYPE, REQUEST_CURRENCY, REQUEST_TYPE } from "@/types/requests";

function makeValues(overrides: Partial<RequestFormValues> = {}): RequestFormValues {
  return {
    request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
    budget_planning_line_id: "line-1",
    budget_month: 5,
    requested_amount: 250.5,
    concept: "Rendición del anticipo pagado",
    scheduled_rendition_at: "2026-05-30",
    beneficiary_name: "Ana Solicitante",
    beneficiary_document_type: BENEFICIARY_DOCUMENT_TYPE.DNI,
    beneficiary_document_number: "12345678",
    bank_code: BANK_CODE.BCP,
    bank_name: "Banco de Crédito del Perú",
    bank_account: "1234567890",
    bank_cci: "12345678901234567890",
    account_type: ACCOUNT_TYPE.SAVINGS,
    supplier_ruc: "",
    supplier_name: "",
    ...overrides,
  };
}

describe("RequestForm payload helpers", () => {
  it("preserva ADVANCE_SETTLEMENT en creación cuando el backend inicia una REXAN", () => {
    const dto = toCreateRequestDto(makeValues());

    expect(dto).toMatchObject({
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      budget_planning_line_id: "line-1",
      budget_month: 5,
      requested_amount: 250.5,
      currency: REQUEST_CURRENCY.PEN,
    });
  });

  it("no envía request_type ni la convierte a ADVANCE al editar una REXAN existente", () => {
    const dto = toUpdateRequestDto(
      makeValues({ request_type: REQUEST_TYPE.ADVANCE, scheduled_rendition_at: "2026-06-15" }),
      REQUEST_TYPE.ADVANCE_SETTLEMENT,
    );

    expect(dto).not.toHaveProperty("request_type");
    expect(dto).not.toHaveProperty("scheduled_rendition_at");
    expect(dto).toMatchObject({
      budget_planning_line_id: "line-1",
      budget_month: 5,
      requested_amount: 250.5,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Rendición del anticipo pagado",
    });
  });

  it("mantiene la fecha límite solo para edición de anticipos", () => {
    const dto = toUpdateRequestDto(
      makeValues({ request_type: REQUEST_TYPE.ADVANCE, scheduled_rendition_at: "2026-06-15" }),
      REQUEST_TYPE.ADVANCE,
    );

    expect(dto).not.toHaveProperty("request_type");
    expect(dto.scheduled_rendition_at).toBe("2026-06-15");
  });
});
