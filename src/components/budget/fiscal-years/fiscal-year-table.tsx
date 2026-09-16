"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  useFiscalYears,
  useActivateFiscalYear,
  useCloseFiscalYear,
} from "@/hooks/use-budget";
import type { FiscalYear } from "@/types/budget";
import { FiscalYearStatusBadge } from "./fiscal-year-status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_CAPABILITY, hasRoleCapability } from "@/lib/role-capabilities";
import {
  annualUitInputSchema,
  fiscalYearErrorMessage,
  formatAnnualUit,
} from "@/lib/fiscal-year-uit";
import { FiscalYearUitForm } from "./fiscal-year-uit-form";

// -------------------------------------------------------
// ConfirmarActivacion — sub-componente con hooks
// -------------------------------------------------------

interface ConfirmarActivacionProps {
  fiscalYear: FiscalYear;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function ConfirmarActivacion({
  fiscalYear,
  open,
  onClose,
  onSuccess,
}: ConfirmarActivacionProps) {
  const { activate, isLoading } = useActivateFiscalYear(fiscalYear.id);
  const pending = useRef(false);

  const handleConfirm = async () => {
    if (
      pending.current ||
      !annualUitInputSchema.safeParse(fiscalYear.annual_uit).success
    ) return;
    pending.current = true;
    try {
      await activate();
      toast.success("Año fiscal activado exitosamente");
      onSuccess();
    } catch (error) {
      toast.error(fiscalYearErrorMessage(error));
      onSuccess();
    } finally {
      pending.current = false;
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" closeDisabled={isLoading}>
        <DialogHeader>
          <DialogTitle>Activar año fiscal</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que deseas activar el año fiscal{" "}
            {fiscalYear.year}? Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Procesando..." : "Activar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------
// ConfirmarCierre — sub-componente con hooks
// -------------------------------------------------------

interface ConfirmarCierreProps {
  fiscalYear: FiscalYear;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function ConfirmarCierre({
  fiscalYear,
  open,
  onClose,
  onSuccess,
}: ConfirmarCierreProps) {
  const { close, isLoading } = useCloseFiscalYear(fiscalYear.id);

  const handleConfirm = async () => {
    try {
      await close();
      toast.success("Año fiscal cerrado exitosamente");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cerrar año fiscal");
    } finally {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar año fiscal</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que deseas cerrar el año fiscal{" "}
            {fiscalYear.year}? Una vez cerrado no se podrá modificar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Procesando..." : "Cerrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface FiscalYearTableProps {
  onRefetch: () => void;
}

// -------------------------------------------------------
// FiscalYearTable component
// -------------------------------------------------------

export function FiscalYearTable({ onRefetch }: FiscalYearTableProps) {
  const { data: fiscalYears, isLoading, error, refetch } = useFiscalYears();
  const user = useAuthStore((s) => s.user);

  const roleCode = user?.role?.code;
  const canManage = hasRoleCapability(roleCode, ROLE_CAPABILITY.BUDGET_ADMIN);

  // Estado para dialogos de confirmacion
  const [confirmActivacion, setConfirmActivacion] = useState<FiscalYear | null>(null);
  const [confirmCierre, setConfirmCierre] = useState<FiscalYear | null>(null);
  const [editUit, setEditUit] = useState<FiscalYear | null>(null);
  const [uitBusy, setUitBusy] = useState(false);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (isLoading && !fiscalYears) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error && !fiscalYears) {
    return (
      <p className="text-sm text-destructive">
        Error al cargar años fiscales: {String(error)}
      </p>
    );
  }

  if (!fiscalYears || fiscalYears.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay años fiscales. Crea tu primer año fiscal.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p role="alert">
          No se pudo actualizar la lista. Cierre el formulario y vuelva a
          consultar antes de continuar.{" "}
          <Button onClick={() => void refetch()}>Volver a consultar</Button>
        </p>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Año</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Valor UIT (PEN)</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Fecha creación</TableHead>
              {canManage && <TableHead>Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fiscalYears.map((fy) => (
              <TableRow key={fy.id}>
                <TableCell className="font-medium">{fy.year}</TableCell>
                <TableCell>
                  <FiscalYearStatusBadge status={fy.status} />
                </TableCell>
                <TableCell>{formatAnnualUit(fy.annual_uit)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {fy.notes ?? "-"}
                </TableCell>
                <TableCell>{formatDate(fy.created_at)}</TableCell>
                {canManage && (
                  <TableCell>
                    {(fy.status === "DRAFT" ||
                      (fy.status === "ACTIVE" && fy.annual_uit === null)) && (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isLoading || Boolean(error)}
                        onClick={() => setEditUit(fy)}
                      >
                        {fy.status === "DRAFT"
                          ? "Editar Valor UIT"
                          : "Inicializar Valor UIT"}
                      </Button>
                    )}
                    {fy.status === "DRAFT" && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setConfirmActivacion(fy)}
                        disabled={
                          isLoading || Boolean(error) ||
                          !annualUitInputSchema.safeParse(fy.annual_uit).success
                        }
                        aria-describedby={`uit-activation-${fy.id}`}
                      >
                        Activar
                      </Button>
                    )}
                    {fy.status === "DRAFT" && (
                      <p id={`uit-activation-${fy.id}`} className="text-xs text-muted-foreground">
                        {annualUitInputSchema.safeParse(fy.annual_uit).success
                          ? "La activación fija el Valor UIT. Solo puede existir un año activo."
                          : "Configure un Valor UIT positivo antes de activar."}
                      </p>
                    )}
                    {fy.status === "ACTIVE" && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setConfirmCierre(fy)}
                      >
                        Cerrar
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialogos de confirmacion */}
      {editUit && (
        <Dialog
          open
          onOpenChange={(open) => !open && !uitBusy && setEditUit(null)}
        >
          <DialogContent closeDisabled={uitBusy}>
            <DialogHeader>
              <DialogTitle>Valor UIT · Año fiscal {editUit.year}</DialogTitle>
              <DialogDescription>
                Administración anual en PEN. El servidor valida el estado y los
                permisos.
              </DialogDescription>
            </DialogHeader>
            <FiscalYearUitForm
              fiscalYear={editUit}
              onClose={() => setEditUit(null)}
              onSuccess={() => void refetch({ force: true })}
              onRefresh={refetch}
              onBusyChange={setUitBusy}
            />
          </DialogContent>
        </Dialog>
      )}
      {confirmActivacion && (
        <ConfirmarActivacion
          fiscalYear={confirmActivacion}
          open
          onClose={() => setConfirmActivacion(null)}
          onSuccess={onRefetch}
        />
      )}

      {confirmCierre && (
        <ConfirmarCierre
          fiscalYear={confirmCierre}
          open
          onClose={() => setConfirmCierre(null)}
          onSuccess={onRefetch}
        />
      )}
    </>
  );
}
