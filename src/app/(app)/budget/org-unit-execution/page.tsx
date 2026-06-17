import { OrgUnitExecutionDashboard } from "@/components/budget/dashboard/org-unit-execution-dashboard";

export default function OrgUnitExecutionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Programado vs Ejecutado</h1>
        <p className="text-muted-foreground">Seguimiento POA por unidad orgánica, componente, acción operativa y recurso.</p>
      </div>
      <OrgUnitExecutionDashboard />
    </div>
  );
}
