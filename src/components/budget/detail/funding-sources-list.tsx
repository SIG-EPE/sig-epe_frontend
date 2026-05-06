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
  totalCost: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function FundingSourcesList({
  fundingSources = [],
  totalCost,
}: FundingSourcesListProps) {
  const totalAllocated = fundingSources.reduce(
    (sum, fs) => sum + Number(fs.allocated_amount),
    0,
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fuente de financiamiento</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead className="text-right">Porcentaje</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fundingSources.length === 0 ? (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-muted-foreground">
              Sin fuentes de financiamiento asignadas
            </TableCell>
          </TableRow>
        ) : (
          <>
            {fundingSources.map((fs) => {
              const pct = totalCost > 0 ? (Number(fs.allocated_amount) / totalCost) * 100 : 0;
              return (
                <TableRow key={fs.id}>
                  <TableCell>
                    {fs.funding_source?.name ?? fs.funding_source_id}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(Number(fs.allocated_amount))}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPercent(pct)}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-semibold bg-muted/50">
              <TableCell>Total</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(totalAllocated)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatPercent(totalCost > 0 ? (totalAllocated / totalCost) * 100 : 0)}
              </TableCell>
            </TableRow>
          </>
        )}
      </TableBody>
    </Table>
  );
}
