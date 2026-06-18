import { DynamicOrgUnitExecutionDashboard } from "@/components/budget/dashboard/org-unit-execution-dashboard-dynamic";

export default function OrgUnitExecutionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Programado vs Ejecutado</h1>
        <p className="text-muted-foreground">Seguimiento POA por unidad orgánica, componente, acción operativa y recurso.</p>
      </div>
      <DynamicOrgUnitExecutionDashboard />
    </div>
  );
}
