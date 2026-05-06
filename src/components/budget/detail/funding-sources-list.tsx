"use client";

import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import type { LineFundingSource } from "@/hooks/use-budget";

interface FundingSourcesListProps {
  fundingSources?: LineFundingSource[];
}

export function FundingSourcesList({
  fundingSources = [],
}: FundingSourcesListProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fundingSources.length === 0 ? (
          <TableRow>
            <TableCell colSpan={1} className="text-center text-muted-foreground">
              Sin fuentes de financiamiento asignadas
            </TableCell>
          </TableRow>
        ) : (
          fundingSources.map((fs) => (
            <TableRow key={fs.id}>
              <TableCell>
                {fs.fundingSource?.name ?? (
                  <span className="text-muted-foreground text-xs">{fs.funding_source_id}</span>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
