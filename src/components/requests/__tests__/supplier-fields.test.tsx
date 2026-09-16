import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Form } from "@/components/ui/form";
import { SupplierFields } from "../supplier-fields";
import { BeneficiaryFields } from "../beneficiary-fields";
import type { RequestFormValues } from "../request-form";

function Harness() {
  const form = useForm<RequestFormValues>({ defaultValues: {
    supplier_document_type: "DNI", supplier_document_number: "12345678", supplier_name: "Supplier A",
    beneficiary_document_type: "CE", beneficiary_document_number: "AB1234", beneficiary_name: "Payee B",
    declares_rus: null, declares_casa_de_retiro: false,
  } });
  return <Form {...form}><SupplierFields control={form.control} /><BeneficiaryFields control={form.control} setValue={form.setValue} watch={form.watch} user={null} /><output data-testid="values">{JSON.stringify(form.watch())}</output></Form>;
}

describe("one provider and independent bank payee", () => {
  it("edits only the provider and retains three-state declarations", () => {
    render(<Harness />);
    expect(screen.getAllByLabelText("Nombre del proveedor *")).toHaveLength(1);
    expect(screen.getByLabelText("Proveedor acogido al RUS")).toHaveValue("unknown");
    expect(screen.getByLabelText("Casa de Retiro")).toHaveValue("false");
    fireEvent.change(screen.getByLabelText("Nombre del proveedor *"), { target: { value: "Supplier C" } });
    fireEvent.change(screen.getByLabelText("Proveedor acogido al RUS"), { target: { value: "false" } });
    expect(screen.getByLabelText("Nombre del beneficiario *")).toHaveValue("Payee B");
    expect(JSON.parse(screen.getByTestId("values").textContent ?? "{}")).toMatchObject({ supplier_name: "Supplier C", declares_rus: false, beneficiary_document_number: "AB1234" });
  });
});
