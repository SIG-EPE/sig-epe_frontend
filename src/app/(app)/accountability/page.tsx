import { Receipt, FolderOpen, ClipboardCheck, GitCompare } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// -------------------------------------------------------
// Accountability page — placeholder (base page)
// -------------------------------------------------------

const SECTIONS = [
  {
    icon: Receipt,
    title: "Detalle de gastos",
    description:
      "Registro detallado de cada gasto ejecutado con su comprobante.",
  },
  {
    icon: FolderOpen,
    title: "Documentación de respaldo",
    description:
      "Carga y organización de facturas, boletas y documentos sustentatorios.",
  },
  {
    icon: ClipboardCheck,
    title: "Estados de rendición",
    description:
      "Seguimiento del estado de aprobación de cada rendición presentada.",
  },
  {
    icon: GitCompare,
    title: "Planificado vs real",
    description:
      "Comparativo entre el monto solicitado y el gasto efectivamente rendido.",
  },
] as const;

export default function AccountabilityPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Rendiciones</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            En desarrollo
          </span>
        </div>
        <p className="text-muted-foreground">
          Rendiciones de cuentas y documentación de gastos ejecutados
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
