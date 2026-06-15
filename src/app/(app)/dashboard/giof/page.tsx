import { GiofOperationsDashboardView } from "@/components/dashboard/giof-operations-dashboard";

export default function GiofDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard operativo GIOF</h1>
        <p className="text-muted-foreground">
          Seguimiento diario de solicitudes, pagos, rendiciones, carga y excepciones críticas.
        </p>
      </div>
      <GiofOperationsDashboardView />
    </div>
  );
}
