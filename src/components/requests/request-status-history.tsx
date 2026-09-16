import { StatusBadge } from "@/components/requests/status-badge";
import { formatRequestDate } from "@/lib/requests";
import type { RequestStatusHistoryItem } from "@/types/requests";

const REQUEST_HISTORY_REASON = {
  PAYMENT_REJECTED: "PAYMENT_REJECTED",
  REQUEST_REJECTED: "REQUEST_REJECTED",
} as const;

interface RequestStatusHistoryProps {
  items: readonly RequestStatusHistoryItem[];
}

function getActorLabel(item: RequestStatusHistoryItem): string {
  const publicName = [item.actor?.first_name, item.actor?.last_name]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  return publicName || item.actor_role || "No informado";
}

function getHistoryTitle(item: RequestStatusHistoryItem): string | null {
  if (item.reason === REQUEST_HISTORY_REASON.PAYMENT_REJECTED)
    return "Pago rechazado";
  if (item.reason === REQUEST_HISTORY_REASON.REQUEST_REJECTED)
    return "Solicitud rechazada";
  return null;
}

export function RequestStatusHistory({ items }: RequestStatusHistoryProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sin historial disponible.</p>
    );
  }

  return items.map((item) => {
    const title = getHistoryTitle(item);
    const isRejection = title !== null;
    return (
      <div key={item.id} className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          {title ? (
            <p className="text-sm font-semibold">{title}</p>
          ) : (
            <StatusBadge status={item.to_status} />
          )}
          <span className="text-xs text-muted-foreground">
            Fecha: {formatRequestDate(item.created_at)}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {isRejection ? "Motivo: " : ""}
          {item.comment ?? item.reason ?? "Cambio de estado"}
        </p>
        {isRejection ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Actor: {getActorLabel(item)}
          </p>
        ) : null}
      </div>
    );
  });
}
