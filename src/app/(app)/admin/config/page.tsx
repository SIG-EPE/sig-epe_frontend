import { Bell, Hourglass, ShieldCheck, AlertTriangle } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// -------------------------------------------------------
// Admin Config page — placeholder (base page)
// -------------------------------------------------------

const SECTIONS = [
  {
    icon: Bell,
    title: "Notificaciones",
    description:
      "Configura alertas y notificaciones automáticas por eventos del sistema.",
  },
  {
    icon: Hourglass,
    title: "Plazos de atención",
    description:
      "Define los tiempos máximos de atención por etapa del flujo de aprobación.",
  },
  {
    icon: ShieldCheck,
    title: "Políticas de validación",
    description:
      "Reglas y criterios de validación aplicados en la revisión de solicitudes.",
  },
  {
    icon: AlertTriangle,
    title: "Umbrales de bloqueo",
    description:
      "Montos y condiciones que activan el bloqueo automático de colaboradores.",
  },
] as const;

export default function AdminConfigPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            Configuración del Sistema
          </h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            En desarrollo
          </span>
        </div>
        <p className="text-muted-foreground">
          Parámetros generales y ajustes operativos del sistema
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
