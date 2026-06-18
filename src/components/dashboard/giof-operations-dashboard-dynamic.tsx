"use client";

import dynamic from "next/dynamic";

import { GiofDashboardPanelSkeleton } from "@/components/performance/route-skeletons";

export const DynamicGiofOperationsDashboardView = dynamic(
  () => import("./giof-operations-dashboard").then((module) => module.GiofOperationsDashboardView),
  {
    loading: () => <GiofDashboardPanelSkeleton />,
    ssr: false,
  },
);
