"use client";

import dynamic from "next/dynamic";

import { OrgUnitExecutionDashboardSkeleton } from "@/components/performance/route-skeletons";

export const DynamicOrgUnitExecutionDashboard = dynamic(
  () => import("./org-unit-execution-dashboard").then((module) => module.OrgUnitExecutionDashboard),
  {
    loading: () => <OrgUnitExecutionDashboardSkeleton />,
    ssr: false,
  },
);
