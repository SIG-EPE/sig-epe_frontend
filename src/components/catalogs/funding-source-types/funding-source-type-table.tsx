"use client";

import { useFundingSourceTypes } from "@/hooks/use-catalogs";
import { CatalogStatusBadge } from "../shared/catalog-status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export function FundingSourceTypeTable() {
  const { data, isLoading, error } = useFundingSourceTypes();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Error al cargar tipos de fuente de financiamiento: {String(error)}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay tipos de fuente de financiamiento registrados.
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-muted-foreground">{item.description ?? "-"}</TableCell>
              <TableCell>
                <CatalogStatusBadge isActive={item.is_active} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
