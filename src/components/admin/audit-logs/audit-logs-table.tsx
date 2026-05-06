import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { AuditLogDto } from "@/hooks/use-audit-logs";

// -------------------------------------------------------
// Utilidades
// -------------------------------------------------------

/** Formatea una fecha ISO a formato legible en hora local Argentina */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
}

/** Devuelve variante de badge según el método HTTP */
function methodVariant(
  method: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch (method) {
    case "POST":
      return "default";
    case "PATCH":
    case "PUT":
      return "secondary";
    case "DELETE":
      return "destructive";
    default:
      return "outline";
  }
}

/** Acorta un UUID para mostrar solo los primeros 8 caracteres */
function shortId(id: string | null): string {
  if (!id) return "—";
  return id.slice(0, 8) + "…";
}

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface AuditLogsTableProps {
  logs: AuditLogDto[];
  isLoading: boolean;
}

// -------------------------------------------------------
// Componente
// -------------------------------------------------------

const COLUMNS = 6;

export function AuditLogsTable({ logs, isLoading }: AuditLogsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[160px]">Fecha / Hora</TableHead>
          <TableHead>Usuario</TableHead>
          <TableHead>Metodo</TableHead>
          <TableHead>Accion / Endpoint</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>IP</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          // Skeleton rows mientras carga
          Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: COLUMNS }).map((__, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : logs.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={COLUMNS}
              className="h-24 text-center text-muted-foreground"
            >
              No hay registros de auditoría para los filtros seleccionados.
            </TableCell>
          </TableRow>
        ) : (
          logs.map((log) => (
            <TableRow key={log.id}>
              {/* Fecha / Hora */}
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDate(log.created_at)}
              </TableCell>

              {/* Usuario */}
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  {log.user_email ? (
                    <span className="text-sm">{log.user_email}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {shortId(log.actor_id)}
                    </span>
                  )}
                  {log.user_role && (
                    <span className="text-xs text-muted-foreground">
                      {log.user_role}
                    </span>
                  )}
                </div>
              </TableCell>

              {/* Metodo HTTP */}
              <TableCell>
                {log.http_method ? (
                  <Badge variant={methodVariant(log.http_method)} className="text-xs">
                    {log.http_method}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>

              {/* Accion / Endpoint */}
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{log.action}</span>
                  {log.endpoint && log.endpoint !== log.action && (
                    <span className="text-xs text-muted-foreground">
                      {log.endpoint}
                    </span>
                  )}
                  {log.entity_id && (
                    <span className="text-xs text-muted-foreground">
                      {log.entity_type}: {shortId(log.entity_id)}
                    </span>
                  )}
                </div>
              </TableCell>

              {/* Codigo de estado */}
              <TableCell>
                {log.status_code ? (
                  <span
                    className={
                      log.status_code >= 400
                        ? "text-destructive text-sm font-medium"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {log.status_code}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>

              {/* IP */}
              <TableCell className="text-xs text-muted-foreground">
                {log.ip_address ?? "—"}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
