import { Suspense } from "react";
import { NewPlanningLineForm } from "@/components/budget/planning/new-planning-line-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/lib/constants";

function Loading() {
  return <div className="p-6"><p>Cargando formulario...</p></div>;
}

export default function NewPlanningLinePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={ROUTES.BUDGET_PLANNING}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Planificación
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva Línea POA</h1>
        <p className="text-muted-foreground">
          Completa todos los campos para registrar una nueva línea del Plan Operativo Anual.
        </p>
      </div>

      <Suspense fallback={<Loading />}>
        <NewPlanningLineForm />
      </Suspense>
    </div>
  );
}
