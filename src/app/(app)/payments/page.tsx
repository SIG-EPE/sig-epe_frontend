import { CreditCard, Receipt, Landmark, Wallet } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// -------------------------------------------------------
// Payments page — placeholder (base page)
// -------------------------------------------------------

const SECTIONS = [
  {
    icon: CreditCard,
    title: "Pagos pendientes",
    description:
      "Cola de transferencias bancarias aprobadas pendientes de ejecución.",
  },
  {
    icon: Receipt,
    title: "Registro de telecrédito",
    description:
      "Carga y confirmación de operaciones de telecrédito realizadas.",
  },
  {
    icon: Landmark,
    title: "Comisiones bancarias",
    description:
      "Seguimiento y conciliación de comisiones cobradas por el banco.",
  },
  {
    icon: Wallet,
    title: "Gastos con tarjeta",
    description:
      "Gestión de pagos realizados con tarjeta corporativa y su respaldo.",
  },
] as const;

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Cola de Pagos</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            En desarrollo
          </span>
        </div>
        <p className="text-muted-foreground">
          Gestión y registro de transferencias bancarias pendientes
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
