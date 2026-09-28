import { useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import { ROLE_CODE } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

export interface PlanningLineCeilingSnapshot {
  ceiling: number | null;
  used: number;
  available: number | null;
  warning: boolean;
}

const CEILING_STATUS = {
  UNAVAILABLE: "unavailable",
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
} as const;

interface CeilingState {
  key: string;
  status: (typeof CEILING_STATUS)[keyof typeof CEILING_STATUS];
  data: PlanningLineCeilingSnapshot | null;
}

function isSnapshot(value: PlanningLineCeilingSnapshot): boolean {
  return (
    (value.ceiling === null ||
      (Number.isFinite(value.ceiling) && value.ceiling >= 0)) &&
    Number.isFinite(value.used) &&
    (value.available === null || Number.isFinite(value.available)) &&
    typeof value.warning === "boolean" &&
    (value.ceiling === null) === (value.available === null)
  );
}

export function usePlanningLineCeiling(
  orgUnitId: string,
  fiscalYearId: string | undefined,
) {
  const role = useAuthStore((state) => state.user?.role?.code);
  const userId = useAuthStore((state) => state.user?.id);
  const sessionExpiresAt = useAuthStore((state) => state.sessionExpiresAt);
  const authLoading = useAuthStore((state) => state.isLoading);
  const token = useAuthStore((state) => state.accessToken);
  const authorized =
    !authLoading &&
    Boolean(token) &&
    (role === ROLE_CODE.GIOF_MANAGER || role === ROLE_CODE.ADMIN_SISTEMA);
  const key =
    authorized && orgUnitId && fiscalYearId
      ? JSON.stringify([userId, sessionExpiresAt, orgUnitId, fiscalYearId])
      : "";
  const [state, setState] = useState<CeilingState>({
    key: "",
    status: CEILING_STATUS.UNAVAILABLE,
    data: null,
  });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let current = true;
    setState({ key, status: CEILING_STATUS.LOADING, data: null });
    const params = new URLSearchParams({
      org_unit_id: orgUnitId,
      fiscal_year_id: fiscalYearId!,
    });
    api
      .get<PlanningLineCeilingSnapshot>(
        `/budget/planning-lines/ceiling-check?${params}`,
        { signal: controller.signal },
      )
      .then((data) => {
        if (current)
          setState({
            key,
            status: isSnapshot(data)
              ? CEILING_STATUS.READY
              : CEILING_STATUS.ERROR,
            data: isSnapshot(data) ? data : null,
          });
      })
      .catch(() => {
        if (current)
          setState({ key, status: CEILING_STATUS.ERROR, data: null });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [key, orgUnitId, fiscalYearId]);

  return key
    ? state.key === key
      ? state
      : { key, status: CEILING_STATUS.LOADING, data: null }
    : { key: "", status: CEILING_STATUS.UNAVAILABLE, data: null };
}
