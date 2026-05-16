// -------------------------------------------------------
// Budget page — Dashboard de saldos presupuestales
// -------------------------------------------------------

import { BalanceDashboard } from "@/components/budget/balance";

export default function BudgetPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Presupuesto</h1>
        <p className="text-muted-foreground">
          Saldos disponibles en tiempo real por partida presupuestal
        </p>
      </div>

      {/* Dashboard de balance */}
      <BalanceDashboard />
    </div>
  );
}
