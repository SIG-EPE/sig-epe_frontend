"use client";

import { FileText, Clock, DollarSign } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// -------------------------------------------------------
// Dashboard page — Sprint 1 (placeholder stats)
// -------------------------------------------------------

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  // Skeleton while user data loads
  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }

  const displayName = `${user.firstName} ${user.lastName}`.trim();

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bienvenido/a, {displayName}
        </h1>
        <p className="text-muted-foreground">
          Panel principal del Sistema Integrado de Gestión de Solicitudes.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Active requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Solicitudes activas
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Sin solicitudes registradas
            </p>
          </CardContent>
        </Card>

        {/* Pending approval */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pendientes de aprobación
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Sin solicitudes pendientes
            </p>
          </CardContent>
        </Card>

        {/* Available budget */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Presupuesto disponible
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">S/ 0.00</div>
            <p className="text-xs text-muted-foreground">
              Sin presupuesto asignado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info note */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            El sistema está en configuración inicial. Las funcionalidades de
            solicitudes, presupuesto y reportes estarán disponibles en
            próximas versiones.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
