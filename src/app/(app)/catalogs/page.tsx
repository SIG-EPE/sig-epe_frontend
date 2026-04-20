import { Tag, Building2, Package, Handshake } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// -------------------------------------------------------
// Catalogs page — placeholder (base page)
// -------------------------------------------------------

const SECTIONS = [
  {
    icon: Tag,
    title: "Conceptos de gasto",
    description:
      "Administra los conceptos y rubros de gasto reconocidos por el sistema.",
  },
  {
    icon: Building2,
    title: "Áreas y programas",
    description:
      "Gestión de áreas orgánicas y programas presupuestales de la entidad.",
  },
  {
    icon: Package,
    title: "Tipos de recurso",
    description:
      "Clasificación de recursos (RO, RDR, donaciones) disponibles para gasto.",
  },
  {
    icon: Handshake,
    title: "Socios y financiadores",
    description:
      "Directorio de organismos cooperantes y entidades financiadoras.",
  },
] as const;

export default function CatalogsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Catálogos</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            En desarrollo
          </span>
        </div>
        <p className="text-muted-foreground">
          Administración de datos maestros del sistema
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
