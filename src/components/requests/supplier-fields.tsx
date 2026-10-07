import { type Control } from "react-hook-form";

import { RequestPartyIdentityFields } from "./request-party-identity-fields";
import type { RequestFormValues } from "./request-form";

interface SupplierFieldsProps {
  control: Control<RequestFormValues>;
}

export function SupplierFields({ control }: SupplierFieldsProps) {
  return (
    <section className="space-y-4 rounded-md border p-4">
      <h2 className="text-base font-semibold">Datos del proveedor</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <RequestPartyIdentityFields control={control} supplier />
      </div>
    </section>
  );
}
