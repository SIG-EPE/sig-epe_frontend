import { type Control } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
        {(["declares_rus", "declares_casa_de_retiro"] as const).map((name) => (
          <FormField key={name} control={control} name={name} render={({ field }) => (
            <FormItem>
              <FormLabel>{name === "declares_rus" ? "Proveedor acogido al RUS" : "Casa de Retiro"}</FormLabel>
              <FormControl><select ref={field.ref} name={field.name} onBlur={field.onBlur} value={field.value == null ? "unknown" : String(field.value)} onChange={(event) => field.onChange(event.target.value === "true")} className="h-10 w-full rounded-md border bg-background px-3">
                <option value="unknown" disabled>Sin declarar</option><option value="true">Sí</option><option value="false">No</option>
              </select></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        ))}
      </div>
    </section>
  );
}
