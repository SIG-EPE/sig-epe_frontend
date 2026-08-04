"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { isPoaCatalogCodeModelEnabled } from "@/config/features";
import { usePoaHierarchy } from "@/hooks/use-poa-hierarchy";
import { ROLE_CODE } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { filterPoaHierarchy, POA_STATUS_FILTER, type PoaStatusFilter } from "./poa-hierarchy-filter";
import { PoaHierarchyTree, type PoaHierarchyUiAction } from "./poa-hierarchy-tree";
import { PoaNodeDialog } from "./poa-node-dialog";

export function PoaHierarchyPage() {
  const { data, isLoading, error, refetch } = usePoaHierarchy();
  const roleCode = useAuthStore((state) => state.user?.role?.code);
  const [search, setSearch] = useState("");
  const [programId, setProgramId] = useState("all");
  const [status, setStatus] = useState<PoaStatusFilter>(POA_STATUS_FILTER.ALL);
  const [action, setAction] = useState<PoaHierarchyUiAction | null>(null);
  const canManage = roleCode === ROLE_CODE.GIOF_GESTOR || roleCode === ROLE_CODE.ADMIN_SISTEMA;

  if (!isPoaCatalogCodeModelEnabled()) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Alert>
          <h2 className="mb-1 font-medium">Funcionalidad en preparación</h2>
          <AlertDescription>
            La administración de la jerarquía POA estará disponible cuando se habilite el modelo de códigos.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const filtered = filterPoaHierarchy(data, { search, programId, status });

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader />
      <section aria-label="Filtros de jerarquía" className="grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="poa-hierarchy-search">Buscar por código exacto o nombre</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="poa-hierarchy-search"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="CMP-000001 o nombre"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="poa-program-filter">Programa</Label>
          <Select value={programId} onValueChange={setProgramId}>
            <SelectTrigger id="poa-program-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los programas</SelectItem>
              {data.programs.map((program) => (
                <SelectItem key={program.id} value={program.id}>{program.code} — {program.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="poa-status-filter">Estado</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as PoaStatusFilter)}>
            <SelectTrigger id="poa-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={POA_STATUS_FILTER.ALL}>Activos e inactivos</SelectItem>
              <SelectItem value={POA_STATUS_FILTER.ACTIVE}>Solo activos</SelectItem>
              <SelectItem value={POA_STATUS_FILTER.INACTIVE}>Solo inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {isLoading && <div className="space-y-3" aria-label="Cargando jerarquía POA">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>}
      {error && <Alert variant="destructive"><h2 className="mb-1 font-medium">No se pudo cargar la jerarquía</h2><AlertDescription>{error}</AlertDescription></Alert>}
      {!isLoading && !error && <PoaHierarchyTree data={filtered} canManage={canManage} onAction={setAction} />}

      <PoaNodeDialog action={action} onClose={() => setAction(null)} onSuccess={refetch} />
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Jerarquía POA</h1>
      <p className="text-muted-foreground">
        Administra programas, componentes, acciones y descripciones de recursos con códigos generados por el backend.
      </p>
    </div>
  );
}
