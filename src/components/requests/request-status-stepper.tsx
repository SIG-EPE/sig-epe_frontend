"use client";

import { Ban, Check, Circle, Clock, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  REQUEST_STEPPER_STATE,
  formatRequestDateTime,
  getRequestStatusStepperItems,
} from "@/lib/requests";
import { cn } from "@/lib/utils";
import { REQUEST_STATUS, type PaymentRequest, type RequestStatus } from "@/types/requests";

interface RequestStatusStepperProps {
  request: PaymentRequest;
}

function getStepTone(status: RequestStatus, isBranch: boolean): string {
  if (status === REQUEST_STATUS.REJECTED || status === REQUEST_STATUS.VOIDED) return "destructive";
  if (isBranch) return "warning";
  return "primary";
}

function getStepIcon(status: RequestStatus, state: string, isBranch: boolean) {
  if (status === REQUEST_STATUS.REJECTED || status === REQUEST_STATUS.VOIDED) return X;
  if (isBranch) return Ban;
  if (state === REQUEST_STEPPER_STATE.COMPLETED) return Check;
  if (state === REQUEST_STEPPER_STATE.CURRENT) return Clock;
  return Circle;
}

export function RequestStatusStepper({ request }: RequestStatusStepperProps) {
  const steps = getRequestStatusStepperItems(request.status, request.statusHistory, {
    created_at: request.created_at,
    submitted_at: request.submitted_at,
    observed_at: request.observed_at,
    approved_at: request.approved_at,
    rejected_at: request.rejected_at,
    paid_at: request.paid_at,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avance de la solicitud</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-0" aria-label="Avance de estado de la solicitud">
          {steps.map((step, index) => {
            const tone = getStepTone(step.status, step.isBranch);
            const Icon = getStepIcon(step.status, step.state, step.isBranch);
            const connectorComplete = step.state === REQUEST_STEPPER_STATE.COMPLETED;

            return (
              <div key={`${step.status}-${index}`} className="flex flex-1 gap-3 md:min-w-0 md:flex-col md:gap-2">
                <div className="flex flex-col items-center md:flex-row">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-background",
                      step.state === REQUEST_STEPPER_STATE.PENDING && "border-muted-foreground/25 text-muted-foreground",
                      step.state !== REQUEST_STEPPER_STATE.PENDING && tone === "primary" && "border-primary bg-primary text-primary-foreground",
                      step.state !== REQUEST_STEPPER_STATE.PENDING && tone === "warning" && "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
                      step.state !== REQUEST_STEPPER_STATE.PENDING && tone === "destructive" && "border-destructive bg-destructive/10 text-destructive",
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "h-8 w-px md:h-px md:flex-1",
                        connectorComplete ? "bg-primary" : "bg-border",
                        step.isBranch && step.state !== REQUEST_STEPPER_STATE.PENDING && "bg-amber-500",
                        (step.status === REQUEST_STATUS.REJECTED || step.status === REQUEST_STATUS.VOIDED) && "bg-destructive",
                      )}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="min-w-0 pb-1 md:pr-4">
                  <p
                    className={cn(
                      "text-sm font-medium leading-tight",
                      step.state === REQUEST_STEPPER_STATE.PENDING ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {step.state === REQUEST_STEPPER_STATE.CURRENT ? "Estado actual" : step.state === REQUEST_STEPPER_STATE.COMPLETED ? "Completado" : "Pendiente"}
                  </p>
                  {step.date && <p className="mt-1 text-xs text-muted-foreground">{formatRequestDateTime(step.date)}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
