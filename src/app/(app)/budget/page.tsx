// -------------------------------------------------------
// Budget page — Dashboard de ejecución presupuestal
// -------------------------------------------------------

import { BalanceDashboard } from "@/components/budget/balance";

export default function BudgetPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Presupuesto</h1>
        <p className="text-muted-foreground">
          Indicadores, evolución y cortes de ejecución presupuestal
        </p>
      </div>

      {/* Dashboard presupuestal */}
      <BalanceDashboard />
    </div>
  );
}
