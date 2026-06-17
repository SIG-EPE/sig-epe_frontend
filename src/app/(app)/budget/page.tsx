// -------------------------------------------------------
// Budget page — Dashboard de ejecución presupuestal
// -------------------------------------------------------

import { BalanceDashboard } from "@/components/budget/balance";
import { ROUTES } from "@/lib/constants";
import Link from "next/link";

export default function BudgetPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Presupuesto</h1>
        <p className="text-muted-foreground">
          Indicadores, evolución y cortes de ejecución presupuestal
        </p>
        <Link className="mt-3 inline-flex rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted" href={ROUTES.BUDGET_ORG_UNIT_EXECUTION}>
          Ver Programado vs Ejecutado
        </Link>
      </div>

      {/* Dashboard presupuestal */}
      <BalanceDashboard />
    </div>
  );
}
