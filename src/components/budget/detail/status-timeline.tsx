"use client";

import { Check, X } from "lucide-react";

interface StatusTimelineProps {
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STEPS = [
  { key: "DRAFT", label: "Borrador" },
  { key: "SUBMITTED", label: "Enviado" },
  { key: "APPROVED", label: "Aprobado" },
] as const;

export function StatusTimeline({
  status,
  submittedAt,
  approvedAt,
  rejectionReason,
}: StatusTimelineProps) {
  const isRejected = status === "REJECTED";

  // Determine completed steps index
  const statusOrder = ["DRAFT", "SUBMITTED", "APPROVED"] as const;
  const currentIndex = statusOrder.indexOf(status as typeof statusOrder[number]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {STEPS.map((step, idx) => {
          const completed =
            (!isRejected && idx < currentIndex) ||
            (!isRejected && status === step.key) ||
            (isRejected && step.key === "SUBMITTED");
          const active = !isRejected && status === step.key;
          const rejected = isRejected && step.key === "SUBMITTED";

          return (
            <div key={step.key} className="flex items-center gap-2">
              {/* Step circle */}
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium ${
                  rejected
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : completed || active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted bg-muted text-muted-foreground"
                }`}
              >
                {rejected ? (
                  <X className="h-4 w-4" />
                ) : completed || active ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              {/* Label */}
              <div className="flex flex-col">
                <span
                  className={`text-sm font-medium ${
                    active || rejected ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
                {step.key === "SUBMITTED" && submittedAt && !isRejected && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(submittedAt)}
                  </span>
                )}
                {step.key === "APPROVED" && approvedAt && !isRejected && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(approvedAt)}
                  </span>
                )}
              </div>
              {/* Connector */}
              {idx < STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-8 ${
                    !isRejected && idx < currentIndex
                      ? "bg-primary"
                      : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Rejection reason */}
      {isRejected && rejectionReason && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-destructive">Motivo del rechazo:</p>
          <p className="mt-1 text-sm text-foreground">{rejectionReason}</p>
        </div>
      )}
    </div>
  );
}
