import { FileText, PlusCircle, Clock, Paperclip } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// -------------------------------------------------------
// Requests page — placeholder (base page)
// -------------------------------------------------------

const SECTIONS = [
  {
    icon: FileText,
    title: "Lista de solicitudes",
    description:
      "Visualiza y filtra todas las solicitudes de pago registradas en el sistema.",
  },
  {
    icon: PlusCircle,
    title: "Nueva solicitud",
    description:
      "Crea una nueva solicitud de pago adjuntando los documentos requeridos.",
  },
  {
    icon: Clock,
    title: "Historial y estados",
    description:
      "Consulta el historial de cambios de estado de cada solicitud.",
  },
  {
    icon: Paperclip,
    title: "Documentos adjuntos",
    description:
      "Gestiona los archivos y documentos de respaldo vinculados a cada solicitud.",
  },
] as const;

export default function RequestsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Solicitudes</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            En desarrollo
          </span>
        </div>
        <p className="text-muted-foreground">
          Gestión y seguimiento de solicitudes de pago
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
