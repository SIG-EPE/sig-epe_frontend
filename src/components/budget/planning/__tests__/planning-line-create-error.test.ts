import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import { classifyPlanningLineCreateError } from "../planning-line-create-error";

const failure = (message: string, code?: string) =>
  new ApiRequestError(400, {
    statusCode: 400,
    message,
    code,
    error: "Bad Request",
    timestamp: "",
    path: "",
  });

describe("planning line create 400 classification", () => {
  it("recognizes only the backend ceiling message or stable code", () => {
    expect(
      classifyPlanningLineCreateError(
        failure(
          "El total de líneas aprobadas excede el techo presupuestal de la UO (techo: 1000, aprobado: 900, nuevo: 200)",
        ),
      ),
    ).toBe("ceiling");
    expect(
      classifyPlanningLineCreateError(
        failure("bad request", "ORG_UNIT_CEILING_EXCEEDED"),
      ),
    ).toBe("ceiling");
    expect(
      classifyPlanningLineCreateError(
        failure("Un techo presupuestal no válido"),
      ),
    ).toBe("other");
  });

  it("keeps resource/action validation distinct from unknown 400", () => {
    expect(
      classifyPlanningLineCreateError(
        failure("El nombre del recurso es inválido"),
      ),
    ).toBe("resource");
    expect(
      classifyPlanningLineCreateError(
        failure("La acción operativa seleccionada es inválida"),
      ),
    ).toBe("resource");
    expect(
      classifyPlanningLineCreateError(failure("El año fiscal es inválido")),
    ).toBe("other");
  });
});
