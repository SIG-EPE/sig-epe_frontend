import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Form } from "@/components/ui/form";
import { SupplierFields } from "../supplier-fields";
import { BeneficiaryFields } from "../beneficiary-fields";
import type { RequestFormValues } from "../request-form";

function Harness() {
  const form = useForm<RequestFormValues>({
    defaultValues: {
      supplier_document_type: "DNI",
      supplier_document_number: "12345678",
      supplier_name: "Supplier A",
      beneficiary_document_type: "CE",
      beneficiary_document_number: "AB1234",
      beneficiary_name: "Payee B",
    },
  });
  return (
    <Form {...form}>
      <SupplierFields control={form.control} />
      <BeneficiaryFields
        control={form.control}
        setValue={form.setValue}
        watch={form.watch}
        user={null}
      />
      <output data-testid="values">{JSON.stringify(form.watch())}</output>
    </Form>
  );
}

describe("one provider and independent bank payee", () => {
  it("edits only the provider without supplier declaration controls", () => {
    render(<Harness />);
    expect(screen.getAllByLabelText("Nombre del proveedor *")).toHaveLength(1);
    expect(
      screen.queryByLabelText("Proveedor acogido al RUS"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Casa de Retiro")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre del proveedor *"), {
      target: { value: "Supplier C" },
    });
    expect(screen.getByLabelText("Nombre del beneficiario *")).toHaveValue(
      "Payee B",
    );
    expect(
      JSON.parse(screen.getByTestId("values").textContent ?? "{}"),
    ).toMatchObject({
      supplier_name: "Supplier C",
      beneficiary_document_number: "AB1234",
    });
  });
});
