import { expect, it } from "vitest";

import {
  isPaymentExportReady,
  isRenditionExportReady,
} from "@/lib/business-queue-export-readiness";

it("habilita independientemente las exportaciones de Pagos y Rendiciones", () => {
  expect(isPaymentExportReady()).toBe(true);
  expect(isRenditionExportReady()).toBe(true);
});
