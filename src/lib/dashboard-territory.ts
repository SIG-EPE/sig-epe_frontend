import type { BudgetDashboardBreakdownItem } from "@/types/dashboard";

export function getTerritoryDisplayLabel(row: BudgetDashboardBreakdownItem): string {
  return row.display_label ?? row.label;
}

export function getTerritoryBusinessBadge(row: BudgetDashboardBreakdownItem): string | null {
  if (row.is_synthetic_territory) return "Territorio sintético";
  if (row.territory_level === "DISTRITO") return "Distrito";
  if (row.territory_level === "PROVINCIA") return "Provincia";
  if (row.territory_level === "REGION") return "Región";
  if (row.territory_level === "COMUNIDAD") return "Comunidad";
  return null;
}
