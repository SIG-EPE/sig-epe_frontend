import { Control } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { sanitizeDigits } from "@/lib/requests";
import type { RequestFormValues } from "./request-form";

interface SupplierFieldsProps {
  control: Control<RequestFormValues>;
}

export function SupplierFields({ control }: SupplierFieldsProps) {
  return (
    <section className="space-y-4 rounded-md border border-blue-200 bg-blue-50/60 p-4">
      <h2 className="text-base font-semibold">Datos del proveedor</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField control={control} name="supplier_ruc" render={({ field }) => (
          <FormItem>
            <FormLabel>RUC del proveedor *</FormLabel>
            <FormControl>
              <Input
                {...field}
                inputMode="numeric"
                maxLength={11}
                placeholder="20123456789"
                onChange={(event) => field.onChange(sanitizeDigits(event.target.value, 11))}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="supplier_name" render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre del proveedor *</FormLabel>
            <FormControl><Input {...field} placeholder="Razón social" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
    </section>
  );
}
