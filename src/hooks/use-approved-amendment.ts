"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { invalidateQueryTag } from "@/lib/query-cache";
import type { ApprovedAmendmentRequest } from "@/lib/approved-amendment";
import type { PlanningLine, PlanningLineHierarchyInput } from "@/types/budget";

export interface ApprovedAmendmentRevision {
  line_id: string;
  revision: string;
  /** Solo true cuando el servidor habilita edición de categoría y fuentes. */
  category_funding_edit_ready?: boolean;
}
export interface ApprovedAmendmentWarning {
  code:
    | "BELOW_EXPOSURE"
    | "CEILING_EXCEEDED"
    | "PENDING_PROJECTED"
    | "PENDING_PRESENT"
    | "HISTORICAL_OVERRUN"
    | "UNKNOWN_VALUATION";
  scope: "MONTH" | "TOTAL" | "UNIT_YEAR";
  status: "BREACH" | "ADVISORY" | "UNKNOWN";
  month?: number;
  fiscalYear?: number;
}
export interface ApprovedAmendmentResult {
  line: {
    id: string;
    status: "APPROVED";
    unit_price: string;
    quantity: string;
    total_cost: string;
    importance: string;
    frequency: string;
    resource_description: string;
    line_code?: string;
    hierarchy?: PlanningLineHierarchyInput & { resource_id: string | null };
    monthly: { month: number; planned_amount: string }[];
  };
  revision: string;
  valuationComplete: boolean;
  warnings: ApprovedAmendmentWarning[];
}

export function useApprovedAmendment(lineId: string) {
  const [isSaving, setIsSaving] = useState(false);
  const readRevision = (signal?: AbortSignal) =>
    api.get<ApprovedAmendmentRevision>(
      `/budget/planning-lines/${lineId}/approved-amendment/revision`,
      { cache: "no-store", signal },
    );
  const readDetail = (signal?: AbortSignal) =>
    api.get<PlanningLine>(`/budget/planning-lines/${lineId}`, {
      cache: "no-store",
      signal,
    });
  const save = async (
    body: ApprovedAmendmentRequest,
  ): Promise<ApprovedAmendmentResult> => {
    setIsSaving(true);
    try {
      const result = await api.patch<ApprovedAmendmentResult>(
        `/budget/planning-lines/${lineId}/approved-amendment`,
        body,
      );
      invalidateQueryTag("budget");
      invalidateQueryTag("poa");
      invalidateQueryTag("dashboard");
      return result;
    } finally {
      setIsSaving(false);
    }
  };
  return { readRevision, readDetail, save, isSaving };
}
