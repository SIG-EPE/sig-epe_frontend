"use client";

import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  DRAFT: { label: "Borrador", className: "bg-gray-100 text-gray-700" },
  SUBMITTED: { label: "Enviado", className: "bg-blue-100 text-blue-700" },
  APPROVED: { label: "Aprobado", className: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rechazado", className: "bg-red-100 text-red-700" },
} as const;

type Status = keyof typeof STATUS_CONFIG;

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
