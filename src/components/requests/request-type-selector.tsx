import { Control } from "react-hook-form";

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REQUEST_TYPE_OPTIONS } from "@/lib/requests";
import type { RequestFormValues } from "./request-form";

interface RequestTypeSelectorProps {
  control: Control<RequestFormValues>;
}

export function RequestTypeSelector({ control }: RequestTypeSelectorProps) {
  return (
    <FormField
      control={control}
      name="request_type"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Tipo de solicitud *</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger data-testid="request-type-select">
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {REQUEST_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription>Solo se incluyen Anticipo, Reembolso y Pago a Proveedor.</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
