"use client";

import { FundingSourceTypeTable } from "./funding-source-type-table";

export function FundingSourceTypePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tipos de Fuente de Financiamiento</h1>
        <p className="text-muted-foreground">
          Categorías de fuentes: Presupuestado, No Presupuestado, Back Office, etc.
        </p>
      </div>

      <FundingSourceTypeTable />
    </div>
  );
}
