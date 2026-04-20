import { Inbox, CheckSquare, RotateCcw, UserX } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// -------------------------------------------------------
// Management page — placeholder (base page)
// -------------------------------------------------------

const SECTIONS = [
  {
    icon: Inbox,
    title: "Pendientes Nivel 1",
    description:
      "Solicitudes en espera de revisión y validación documental inicial.",
  },
  {
    icon: CheckSquare,
    title: "Pendientes Nivel 2",
    description:
      "Solicitudes que requieren aprobación presupuestal y autorización final.",
  },
  {
    icon: RotateCcw,
    title: "Solicitudes devueltas",
    description:
      "Solicitudes enviadas de regreso al solicitante por observaciones.",
  },
  {
    icon: UserX,
    title: "Colaboradores bloqueados",
    description:
      "Usuarios con rendiciones pendientes que impiden nuevas solicitudes.",
  },
] as const;

export default function ManagementPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            Bandeja de Gestión
          </h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            En desarrollo
          </span>
        </div>
        <p className="text-muted-foreground">
          Cola de trabajo GIOF: revisión, validación y aprobación de solicitudes
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
