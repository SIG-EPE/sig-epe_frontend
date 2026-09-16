import { useWatch, type Control } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BENEFICIARY_DOCUMENT_TYPE_OPTIONS, getBeneficiaryDocumentHelp, getBeneficiaryDocumentInputMode, getBeneficiaryDocumentMaxLength, getBeneficiaryDocumentPlaceholder } from "@/lib/requests";
import type { BeneficiaryDocumentType } from "@/types/requests";
import type { RequestFormValues } from "./request-form";

interface RequestPartyIdentityFieldsProps {
  control: Control<RequestFormValues>;
  supplier?: boolean;
  onDocumentTypeChange?: (value: BeneficiaryDocumentType) => void;
  onDocumentNumberChange?: (value: string) => void;
}

// Controles comunes; la identidad del proveedor nunca modifica al beneficiario.
export function RequestPartyIdentityFields({ control, supplier = false, onDocumentTypeChange, onDocumentNumberChange }: RequestPartyIdentityFieldsProps) {
  const typeName = supplier ? "supplier_document_type" : "beneficiary_document_type";
  const documentType = useWatch({ control, name: typeName });
  const suffix = supplier ? " del proveedor" : "";
  return <>
    <FormField control={control} name={typeName} render={({ field }) => (
      <FormItem>
        <FormLabel>Tipo de documento{suffix} *</FormLabel>
        <Select value={field.value ?? ""} onValueChange={(value) => onDocumentTypeChange ? onDocumentTypeChange(value as BeneficiaryDocumentType) : field.onChange(value)}>
          <FormControl><SelectTrigger data-testid={`request-${supplier ? "supplier" : "beneficiary"}-document-type-select`}><SelectValue placeholder="Selecciona tipo" /></SelectTrigger></FormControl>
          <SelectContent>{BENEFICIARY_DOCUMENT_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    )} />
    <FormField control={control} name={supplier ? "supplier_document_number" : "beneficiary_document_number"} render={({ field }) => (
      <FormItem>
        <FormLabel>Número de documento{suffix} *</FormLabel>
        <FormControl><Input {...field} value={field.value ?? ""} inputMode={getBeneficiaryDocumentInputMode(documentType)} maxLength={getBeneficiaryDocumentMaxLength(documentType)} placeholder={getBeneficiaryDocumentPlaceholder(documentType)} data-testid={`request-${supplier ? "supplier" : "beneficiary"}-document-number-input`} onChange={(event) => onDocumentNumberChange ? onDocumentNumberChange(event.target.value) : field.onChange(event.target.value.toUpperCase())} /></FormControl>
        <FormDescription>{getBeneficiaryDocumentHelp(documentType)}</FormDescription>
        <FormMessage />
      </FormItem>
    )} />
    <FormField control={control} name={supplier ? "supplier_name" : "beneficiary_name"} render={({ field }) => (
      <FormItem>
        <FormLabel>Nombre del {supplier ? "proveedor" : "beneficiario"} *</FormLabel>
        <FormControl><Input {...field} value={field.value ?? ""} maxLength={255} placeholder="Nombre completo o razón social" /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  </>;
}
