import { PieChart, TrendingUp, Timer, Download } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// -------------------------------------------------------
// Reports page — placeholder (base page)
// -------------------------------------------------------

const SECTIONS = [
  {
    icon: PieChart,
    title: "Solicitudes por estado",
    description:
      "Distribución de solicitudes por estado: pendientes, aprobadas, rechazadas.",
  },
  {
    icon: TrendingUp,
    title: "Ejecución presupuestal",
    description:
      "Análisis de la ejecución del presupuesto versus lo planificado.",
  },
  {
    icon: Timer,
    title: "Tiempos de atención",
    description:
      "Métricas de tiempo promedio de atención por etapa del proceso.",
  },
  {
    icon: Download,
    title: "Exportar datos",
    description:
      "Descarga reportes en Excel o PDF según rangos de fecha y filtros.",
  },
] as const;

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            En desarrollo
          </span>
        </div>
        <p className="text-muted-foreground">
          Análisis y exportación de datos de gestión
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
