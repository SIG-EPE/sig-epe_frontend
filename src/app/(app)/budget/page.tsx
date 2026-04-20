import { BarChart3, List, Target, LayoutDashboard } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// -------------------------------------------------------
// Budget page — placeholder (base page)
// -------------------------------------------------------

const SECTIONS = [
  {
    icon: BarChart3,
    title: "Panel de saldos",
    description:
      "Visualización en tiempo real de saldos disponibles por partida presupuestal.",
  },
  {
    icon: List,
    title: "Catálogo de partidas",
    description:
      "Listado completo de partidas presupuestales habilitadas en el periodo.",
  },
  {
    icon: Target,
    title: "Plan de gastos",
    description:
      "Proyección y programación de gastos según el presupuesto aprobado.",
  },
  {
    icon: LayoutDashboard,
    title: "Vista consolidada",
    description:
      "Resumen ejecutivo del estado presupuestal por área y programa.",
  },
] as const;

export default function BudgetPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Presupuesto</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            En desarrollo
          </span>
        </div>
        <p className="text-muted-foreground">
          Partidas presupuestales y saldos disponibles en tiempo real
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
