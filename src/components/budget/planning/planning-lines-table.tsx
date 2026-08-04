"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { RejectModal } from "./reject-modal";
import { useAuthStore } from "@/stores/auth-store";
import type { PlanningLine } from "@/types/budget";
import { api } from "@/lib/api-client";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  getPlanningLineMutationErrorMessage,
  recoverFromPlanningLineStateConflict,
} from "@/hooks/use-budget";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/lib/constants";
import { isUnclassifiedLabel } from "@/lib/poa-territory-selection";
import { getPoaTerritorySelectionFeatures } from "@/config/poa-territory-selection";

interface PlanningLinesTableProps {
  lines: PlanningLine[];
  isLoading: boolean;
  onRefetch: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PlanningLinesTable({ lines, isLoading, onRefetch }: PlanningLinesTableProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const isGiof = user?.role?.code === "GIOF" || user?.role?.code === "GIOF_GESTOR";
  const userId = user?.id;
  const territoryFeatures = getPoaTerritorySelectionFeatures();

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectLineId, setRejectLineId] = useState<string | null>(null);
  const [loadingLineId, setLoadingLineId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Línea</TableHead>
            <TableHead>Código POA</TableHead>
            <TableHead>Descripcion</TableHead>
            <TableHead>Unidad organica</TableHead>
            <TableHead>Tipo recurso</TableHead>
            <TableHead>Costo generado</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 9 }).map((_, j) => (
                <TableCell key={j}>
                  <div className="h-4 w-full rounded bg-muted animate-pulse" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>No hay lineas para los filtros seleccionados</p>
      </div>
    );
  }

  async function handleSubmit(line: PlanningLine) {
    setLoadingLineId(line.id);
    try {
      await api.post(`/budget/planning-lines/${line.id}/submit`);
      toast.success("Linea enviada");
      onRefetch();
    } catch (error) {
      const conflictMessage = recoverFromPlanningLineStateConflict(error);
      toast.error(conflictMessage ?? getPlanningLineMutationErrorMessage(error) ?? "Error al enviar la linea");
      if (conflictMessage) onRefetch();
    } finally {
      setLoadingLineId(null);
    }
  }

  async function handleApprove(line: PlanningLine) {
    setLoadingLineId(line.id);
    try {
      await api.post(`/budget/planning-lines/${line.id}/approve`);
      toast.success("Linea aprobada");
      onRefetch();
    } catch (error) {
      const conflictMessage = recoverFromPlanningLineStateConflict(error);
      toast.error(conflictMessage ?? getPlanningLineMutationErrorMessage(error) ?? "Error al aprobar la linea");
      if (conflictMessage) onRefetch();
    } finally {
      setLoadingLineId(null);
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Línea</TableHead>
            <TableHead>Código POA</TableHead>
            <TableHead>Descripcion</TableHead>
            <TableHead>Unidad organica</TableHead>
            <TableHead>Tipo recurso</TableHead>
            <TableHead>Costo generado</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="w-12">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const isOwner = line.created_by === userId;
            const categoryLabel = line.budgetCategory?.name ?? line.budget_category?.name;
            const hasUnclassifiedFunding = (line.fundingSources ?? line.partners ?? []).some(
              (source) => isUnclassifiedLabel(source.fundingSource?.name),
            );
            const isUnclassified = territoryFeatures.readEnabled
              && (isUnclassifiedLabel(categoryLabel) || hasUnclassifiedFunding);
            return (
              <TableRow key={line.id}>
                <TableCell className="font-mono text-xs">
                  {line.id.slice(0, 8).toUpperCase()}
                </TableCell>
                <TableCell>
                  {line.line_code ? (
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {line.line_code}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {line.resource_description}
                </TableCell>
                <TableCell>
                  {line.organizationalUnit?.name ?? line.organizational_unit?.name ?? "-"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <span>{line.planning_type}</span>
                    {isUnclassified && <Badge variant="outline">POR CLASIFICAR</Badge>}
                  </div>
                </TableCell>
                <TableCell className="font-mono">
                  {formatCurrency(line.total_cost)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={line.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(line.created_at)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onClick={() => router.push(`${ROUTES.BUDGET_PLANNING}/${line.id}`)}
                      >
                        Ver detalle
                      </DropdownMenuItem>

                      {isUnclassified && line.status === "DRAFT" && (isOwner || isGiof) && (
                        <DropdownMenuItem
                          onClick={() => router.push(`${ROUTES.BUDGET_PLANNING}/${line.id}`)}
                        >
                          Reclasificar
                        </DropdownMenuItem>
                      )}

                      {line.status === "DRAFT" && isOwner && (
                        <DropdownMenuItem
                          onClick={() => handleSubmit(line)}
                          disabled={loadingLineId === line.id}
                        >
                          Enviar
                        </DropdownMenuItem>
                      )}

                      {line.status === "SUBMITTED" && isGiof && (
                        <>
                          <DropdownMenuItem
                            onClick={() => handleApprove(line)}
                            disabled={loadingLineId === line.id}
                          >
                            Aprobar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setRejectLineId(line.id);
                              setRejectModalOpen(true);
                            }}
                          >
                            Rechazar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {rejectLineId && (
        <RejectModal
          lineId={rejectLineId}
          open={rejectModalOpen}
          onOpenChange={setRejectModalOpen}
          onSuccess={onRefetch}
        />
      )}
    </>
  );
}
