import Link from "next/link";
import {
  Globe,
  Package,
  Handshake,
  Map,
  Building2,
  Layers,
  GitBranch,
  ArrowRight,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

// -------------------------------------------------------
// Catalogs index page — 6 catálogos navegables
// -------------------------------------------------------

const CATALOGS = [
  {
    href: ROUTES.CATALOGS_POA_HIERARCHY,
    icon: GitBranch,
    title: "Jerarquía POA",
    description:
      "Programas, componentes, acciones y descripciones de recursos con código canónico.",
  },
  {
    href: "/catalogs/organizational-units",
    icon: Building2,
    title: "Unidades Orgánicas",
    description: "Áreas y unidades orgánicas de la entidad con sus siglas.",
  },
  {
    href: "/catalogs/budget-programs",
    icon: Globe,
    title: "Programas / Proyectos",
    description:
      "Programas presupuestales, proyectos y gestiones de la entidad.",
  },
  {
    href: "/catalogs/funding-source-types",
    icon: Layers,
    title: "Tipos de Fuente de Financiamiento",
    description:
      "Categorías de fuentes: Presupuestado, No Presupuestado, Back Office, etc.",
  },
  {
    href: "/catalogs/funding-sources",
    icon: Handshake,
    title: "Fuentes de Financiamiento",
    description:
      "Directorio de fuentes de financiamiento del sistema presupuestario.",
  },
  {
    href: "/catalogs/territories",
    icon: Map,
    title: "Territorios",
    description:
      "Jerarquía territorial: Región, Provincia, Distrito, Comunidad.",
  },
  {
    href: "/catalogs/budget-categories",
    icon: Package,
    title: "Tipos de Recurso",
    description:
      "Categorías de gasto reconocidas en el sistema presupuestario.",
  },
] as const;

export default function CatalogsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Catálogos</h1>
        <p className="text-muted-foreground">
          Administración de datos maestros del sistema presupuestario
        </p>
      </div>

      {/* Grid de catálogos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOGS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base font-semibold">
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs leading-relaxed">
                  {description}
                </CardDescription>
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                  Gestionar
                  <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
