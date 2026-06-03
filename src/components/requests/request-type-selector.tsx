"use client";

import { useState } from "react";
import type { Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REQUEST_TYPE_OPTIONS } from "@/lib/requests";
import { REQUEST_TYPE, type RequestType } from "@/types/requests";
import type { RequestFormValues } from "./request-form";

interface RequestTypeSelectorProps {
  control: Control<RequestFormValues>;
}

export function shouldShowReimbursementSstWarning(previousType: RequestType, nextType: RequestType): boolean {
  return nextType === REQUEST_TYPE.REIMBURSEMENT && previousType !== REQUEST_TYPE.REIMBURSEMENT;
}

interface ReimbursementSstWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReimbursementSstWarningDialog({ open, onOpenChange }: ReimbursementSstWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Antes de continuar con un reembolso</DialogTitle>
          <DialogDescription className="space-y-3">
            <span className="block">
              Te recordamos que los reembolsos deben utilizarse solo en situaciones excepcionales vinculadas a Seguridad y Salud en el Trabajo (SST), como emergencias o incidentes relacionados con el bienestar y la seguridad durante actividades laborales.
            </span>
            <span className="block">
              Para actividades programadas, movilizaciones, materiales, alimentación u otros gastos planificados, solicita un anticipo antes de realizar la actividad. Esto ayuda a evitar que uses dinero personal y permite una mejor organización de los recursos.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestTypeSelector({ control }: RequestTypeSelectorProps) {
  const [showReimbursementWarning, setShowReimbursementWarning] = useState(false);

  return (
    <>
      <FormField
        control={control}
        name="request_type"
        render={({ field }) => {
          function handleRequestTypeChange(value: string): void {
            const nextValue = value as RequestType;
            const previousValue = field.value;
            field.onChange(nextValue);
            if (shouldShowReimbursementSstWarning(previousValue, nextValue)) {
              setShowReimbursementWarning(true);
            }
          }

          return (
            <FormItem>
              <FormLabel>Tipo de solicitud *</FormLabel>
              <Select value={field.value} onValueChange={handleRequestTypeChange}>
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
              <FormDescription>Solo se incluyen Anticipo, Pago a Proveedor y Reembolso.</FormDescription>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <ReimbursementSstWarningDialog open={showReimbursementWarning} onOpenChange={setShowReimbursementWarning} />
    </>
  );
}
