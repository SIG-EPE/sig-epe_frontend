import { render, screen, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { Form } from "@/components/ui/form";
import { ReimbursementSstWarningDialog, RequestTypeSelector, shouldShowReimbursementSstWarning } from "@/components/requests/request-type-selector";
import { REQUEST_TYPE } from "@/types/requests";
import type { RequestFormValues } from "@/components/requests/request-form";

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
});

function RequestTypeSelectorHarness({ initialType = REQUEST_TYPE.ADVANCE }: { initialType?: RequestFormValues["request_type"] }) {
  const form = useForm<RequestFormValues>({
    defaultValues: {
      request_type: initialType,
      budget_planning_line_id: "line-1",
      requested_amount: 100,
      concept: "Solicitud de prueba",
      scheduled_rendition_at: "",
      beneficiary_name: "",
      beneficiary_document_type: "",
      beneficiary_document_number: "",
      bank_code: "",
      bank_name: "",
      bank_account: "",
      bank_cci: "",
      account_type: "",
      supplier_ruc: "",
      supplier_name: "",
    },
  });

  return (
    <Form {...form}>
      <RequestTypeSelector control={form.control} />
    </Form>
  );
}

describe("RequestTypeSelector", () => {
  it("activa el recordatorio solo al cambiar a Reembolso desde otro tipo", () => {
    expect(shouldShowReimbursementSstWarning(REQUEST_TYPE.ADVANCE, REQUEST_TYPE.REIMBURSEMENT)).toBe(true);
    expect(shouldShowReimbursementSstWarning(REQUEST_TYPE.SUPPLIER_PAYMENT, REQUEST_TYPE.REIMBURSEMENT)).toBe(true);
    expect(shouldShowReimbursementSstWarning(REQUEST_TYPE.REIMBURSEMENT, REQUEST_TYPE.REIMBURSEMENT)).toBe(false);
    expect(shouldShowReimbursementSstWarning(REQUEST_TYPE.REIMBURSEMENT, REQUEST_TYPE.ADVANCE)).toBe(false);
  });

  it("no abre el recordatorio si el formulario ya inicia como Reembolso", () => {
    render(<RequestTypeSelectorHarness initialType={REQUEST_TYPE.REIMBURSEMENT} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("muestra la copia institucional del recordatorio SST", () => {
    render(<ReimbursementSstWarningDialog open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Antes de continuar con un reembolso")).toBeInTheDocument();
    expect(within(dialog).getByText(/situaciones excepcionales vinculadas a Seguridad y Salud en el Trabajo \(SST\)/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/solicita un anticipo antes de realizar la actividad/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Entendido" })).toBeInTheDocument();
  });
});
