"use client";

import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  DRAFT: { label: "Borrador", className: "bg-gray-100 text-gray-700" },
  ACTIVE: { label: "Activo", className: "bg-green-100 text-green-700" },
  CLOSED: { label: "Cerrado", className: "bg-red-100 text-red-700" },
} as const;

type FiscalYearStatus = keyof typeof STATUS_CONFIG;

interface FiscalYearStatusBadgeProps {
  status: FiscalYearStatus;
  className?: string;
}

export function FiscalYearStatusBadge({ status, className }: FiscalYearStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
