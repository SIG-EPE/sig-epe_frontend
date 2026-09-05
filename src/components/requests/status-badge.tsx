import { Badge } from "@/components/ui/badge";
import {
  REQUEST_STATUS_SURFACE,
  formatRequestStatus,
  type RequestStatusSurface,
} from "@/lib/request-status-vocabulary";
import type { RequestStatusLabelContext } from "@/lib/requests";
import { cn } from "@/lib/utils";
import { REQUEST_STATUS, type RequestStatus } from "@/types/requests";

interface StatusBadgeProps {
  status: RequestStatus;
  context?: RequestStatusLabelContext | null;
  surface?: RequestStatusSurface;
}

export function StatusBadge({ status, context, surface = REQUEST_STATUS_SURFACE.DETAIL }: StatusBadgeProps) {
  const effectiveSurface = surface === REQUEST_STATUS_SURFACE.DETAIL
    && context?.request_type === "ADVANCE_SETTLEMENT"
    ? REQUEST_STATUS_SURFACE.RENDITION_LIFECYCLE
    : surface;
  const label = formatRequestStatus(status, {
    surface: effectiveSurface,
    requestType: context?.request_type,
    rexanOutcome: context?.rexan_outcome,
  });
  const domainLabel = effectiveSurface === REQUEST_STATUS_SURFACE.REVIEW
    ? "Estado de solicitud en Review"
    : effectiveSurface === REQUEST_STATUS_SURFACE.PAYMENT
      ? "Estado de pago"
      : effectiveSurface === REQUEST_STATUS_SURFACE.RENDITION_LIFECYCLE
        ? "Lifecycle de rendición"
        : "Estado de solicitud";
  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit",
        status === REQUEST_STATUS.DRAFT && "border-slate-300 bg-slate-50 text-slate-700",
        status === REQUEST_STATUS.SUBMITTED && "border-blue-300 bg-blue-50 text-blue-700",
        status === REQUEST_STATUS.OBSERVED && "border-amber-300 bg-amber-50 text-amber-700",
        status === REQUEST_STATUS.IN_VALIDATION && "border-cyan-300 bg-cyan-50 text-cyan-700",
        status === REQUEST_STATUS.APPROVED && "border-emerald-300 bg-emerald-50 text-emerald-700",
        status === REQUEST_STATUS.REJECTED && "border-red-300 bg-red-50 text-red-700",
        status === REQUEST_STATUS.PAID && "border-purple-300 bg-purple-50 text-purple-700",
        status === REQUEST_STATUS.CLOSED && "border-zinc-400 bg-zinc-100 text-zinc-800",
        status === REQUEST_STATUS.VOIDED && "border-zinc-300 bg-zinc-50 text-zinc-700",
      )}
      aria-label={`${domainLabel}: ${label}`}
    >
      {label}
    </Badge>
  );
}
