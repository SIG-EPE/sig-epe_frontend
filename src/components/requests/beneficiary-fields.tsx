import type { Control, UseFormSetValue, UseFormWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ACCOUNT_TYPE_OPTIONS,
  BANK_OPTIONS,
  BENEFICIARY_DOCUMENT_TYPE_OPTIONS,
  getBeneficiaryDocumentInputMode,
  getBeneficiaryDocumentHelp,
  getBeneficiaryDocumentMaxLength,
  getBeneficiaryDocumentPlaceholder,
  sanitizeBeneficiaryDocumentNumber,
  sanitizeDigits,
} from "@/lib/requests";
import type { AuthUser } from "@/types/auth";
import { BENEFICIARY_DOCUMENT_TYPE, type BeneficiaryDocumentType } from "@/types/requests";
import type { RequestFormValues } from "./request-form";

interface BeneficiaryFieldsProps {
  control: Control<RequestFormValues>;
  user: AuthUser | null;
  setValue: UseFormSetValue<RequestFormValues>;
  watch: UseFormWatch<RequestFormValues>;
}

export function BeneficiaryFields({ control, user, setValue, watch }: BeneficiaryFieldsProps) {
  const documentType = watch("beneficiary_document_type") as BeneficiaryDocumentType | "" | undefined;
  const documentNumber = watch("beneficiary_document_number") ?? "";

  function useRequesterAsBeneficiary(): void {
    const fullName = [user?.firstName, user?.lastName].filter((value): value is string => Boolean(value?.trim())).join(" ");
    setValue("beneficiary_name", fullName, { shouldDirty: true, shouldValidate: true });
    setValue("beneficiary_document_type", BENEFICIARY_DOCUMENT_TYPE.DNI, { shouldDirty: true, shouldValidate: true });
    setValue("beneficiary_document_number", sanitizeBeneficiaryDocumentNumber(user?.documentNumber ?? "", BENEFICIARY_DOCUMENT_TYPE.DNI), { shouldDirty: true, shouldValidate: true });
  }

  function changeDocumentType(nextDocumentType: BeneficiaryDocumentType): void {
    setValue("beneficiary_document_type", nextDocumentType, { shouldDirty: true, shouldValidate: true });
    setValue("beneficiary_document_number", sanitizeBeneficiaryDocumentNumber(documentNumber, nextDocumentType), { shouldDirty: true, shouldValidate: true });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 border-b pb-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold">3. Beneficiario y cuenta bancaria</h2>
        <Button type="button" variant="outline" size="sm" onClick={useRequesterAsBeneficiary} disabled={!user} data-testid="request-use-my-data-button">
          Usar mis datos como beneficiario
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField control={control} name="beneficiary_document_type" render={({ field }) => (
          <FormItem>
            <FormLabel>Tipo de documento</FormLabel>
            <Select value={field.value ?? ""} onValueChange={changeDocumentType}>
              <FormControl><SelectTrigger><SelectValue placeholder="Selecciona tipo" /></SelectTrigger></FormControl>
              <SelectContent>
                {BENEFICIARY_DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="beneficiary_document_number" render={({ field }) => (
          <FormItem>
            <FormLabel>Número de documento</FormLabel>
            <FormControl>
              <Input
                {...field}
                inputMode={getBeneficiaryDocumentInputMode(documentType)}
                maxLength={getBeneficiaryDocumentMaxLength(documentType)}
                placeholder={getBeneficiaryDocumentPlaceholder(documentType)}
                onChange={(event) => field.onChange(sanitizeBeneficiaryDocumentNumber(event.target.value, documentType))}
              />
            </FormControl>
            <FormDescription>{getBeneficiaryDocumentHelp(documentType)}</FormDescription>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="beneficiary_name" render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre del beneficiario</FormLabel>
            <FormControl><Input {...field} placeholder="Nombre completo o razón social" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="bank_code" render={({ field }) => (
          <FormItem>
            <FormLabel>Banco</FormLabel>
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <FormControl><SelectTrigger data-testid="request-bank-select"><SelectValue placeholder="Selecciona banco" /></SelectTrigger></FormControl>
              <SelectContent>
                {BANK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="account_type" render={({ field }) => (
          <FormItem>
            <FormLabel>Tipo de cuenta</FormLabel>
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <FormControl><SelectTrigger data-testid="request-account-type-select"><SelectValue placeholder="Selecciona tipo" /></SelectTrigger></FormControl>
              <SelectContent>
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="bank_account" render={({ field }) => (
          <FormItem>
            <FormLabel>Cuenta bancaria</FormLabel>
            <FormControl>
              <Input
                {...field}
                inputMode="numeric"
                maxLength={30}
                placeholder="6 a 30 dígitos"
                data-testid="request-bank-account-input"
                onChange={(event) => field.onChange(sanitizeDigits(event.target.value, 30))}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="bank_cci" render={({ field }) => (
          <FormItem>
            <FormLabel>CCI</FormLabel>
            <FormControl>
              <Input
                {...field}
                inputMode="numeric"
                maxLength={20}
                placeholder="20 dígitos"
                data-testid="request-bank-cci-input"
                onChange={(event) => field.onChange(sanitizeDigits(event.target.value, 20))}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
    </section>
  );
}
