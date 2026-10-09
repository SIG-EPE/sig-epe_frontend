"use client";

import { useAuthStore } from "@/stores/auth-store";
import { ROLE_CODE } from "@/lib/constants";
import { MonthlyFxCatalogSection } from "./monthly-fx-catalog-section";

export function MonthlyFxCatalogEntry() {
  const user = useAuthStore((state) => state.user);
  const role = user?.role?.code;
  return role === ROLE_CODE.GIOF_MANAGER ? (
    <MonthlyFxCatalogSection key={user?.id} role={role} />
  ) : null;
}
