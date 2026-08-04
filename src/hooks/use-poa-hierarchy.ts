"use client";

import { useEffect, useState } from "react";

import { isPoaCatalogCodeModelEnabled } from "@/config/features";
import { api } from "@/lib/api-client";
import { invalidateCatalogDomain } from "@/lib/query-tags";
import { useAuthStore } from "@/stores/auth-store";
import type {
  BudgetProgram,
  OperativeAction,
  PoaCatalogDependencyCounts,
  PoaHierarchyData,
  PoaResource,
  StrategicComponent,
} from "@/types/catalogs";

export const POA_NODE_LEVEL = {
  COMPONENT: "component",
  ACTION: "action",
  RESOURCE: "resource",
} as const;

export type PoaNodeLevel = (typeof POA_NODE_LEVEL)[keyof typeof POA_NODE_LEVEL];

export const POA_NODE_ACTION = {
  CREATE: "create",
  RENAME: "rename",
  DEACTIVATE: "deactivate",
  REACTIVATE: "reactivate",
  PUBLISH: "publish",
  REPLACEMENT: "replacement",
} as const;

export type PoaNodeActionKind = (typeof POA_NODE_ACTION)[keyof typeof POA_NODE_ACTION];

interface PoaNodeActionBase {
  kind: PoaNodeActionKind;
  level: PoaNodeLevel;
  id?: string;
  name?: string;
  parentId?: string;
  reason?: string;
}

export type PoaNodeActionRequest = PoaNodeActionBase;

const PATH_BY_LEVEL: Record<PoaNodeLevel, string> = {
  component: "/catalogs/strategic-components",
  action: "/catalogs/operative-actions",
  resource: "/catalogs/poa-resources",
};

const PARENT_FIELD_BY_LEVEL: Record<PoaNodeLevel, string> = {
  component: "program_id",
  action: "component_id",
  resource: "action_id",
};

async function attachDependencies<T extends { id: string }>(
  level: PoaNodeLevel,
  nodes: T[],
): Promise<Array<T & { dependencies: PoaCatalogDependencyCounts }>> {
  return Promise.all(nodes.map(async (node) => ({
    ...node,
    dependencies: await api.get<PoaCatalogDependencyCounts>(
      `${PATH_BY_LEVEL[level]}/${node.id}/dependencies`,
    ),
  })));
}

export async function executePoaNodeAction(request: PoaNodeActionRequest): Promise<unknown> {
  const path = PATH_BY_LEVEL[request.level];
  let result: unknown;

  if (request.kind === POA_NODE_ACTION.CREATE) {
    result = await api.post(path, {
      name: request.name,
      [PARENT_FIELD_BY_LEVEL[request.level]]: request.parentId,
    });
  } else if (request.kind === POA_NODE_ACTION.RENAME) {
    result = await api.patch(`${path}/${request.id}`, { name: request.name });
  } else if (request.kind === POA_NODE_ACTION.REPLACEMENT) {
    result = await api.post(`${path}/${request.id}/replacement`, {
      name: request.name,
      parent_id: request.parentId,
      reason: request.reason,
    });
  } else {
    result = await api.patch(`${path}/${request.id}/${request.kind}`);
  }

  invalidateCatalogDomain();
  return result;
}

const EMPTY_HIERARCHY: PoaHierarchyData = {
  programs: [],
  components: [],
  actions: [],
  resources: [],
};

export function usePoaHierarchy() {
  const [data, setData] = useState<PoaHierarchyData>(EMPTY_HIERARCHY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (!isPoaCatalogCodeModelEnabled() || authIsLoading || !accessToken) {
      setData(EMPTY_HIERARCHY);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);
    void Promise.all([
      api.get<BudgetProgram[]>("/catalogs/budget-programs"),
      api.get<StrategicComponent[]>("/catalogs/strategic-components?include_inactive=true"),
      api.get<OperativeAction[]>("/catalogs/operative-actions?include_inactive=true"),
      api.get<PoaResource[]>("/catalogs/poa-resources?include_inactive=true"),
    ])
      .then(async ([programs, components, actions, resources]) => {
        const [componentsWithCounts, actionsWithCounts, resourcesWithCounts] = await Promise.all([
          attachDependencies(POA_NODE_LEVEL.COMPONENT, components),
          attachDependencies(POA_NODE_LEVEL.ACTION, actions),
          attachDependencies(POA_NODE_LEVEL.RESOURCE, resources),
        ]);
        if (!active) return;
        setData({
          programs: programs.map(({ id, code, name, is_active }) => ({ id, code, name, is_active })),
          components: componentsWithCounts,
          actions: actionsWithCounts,
          resources: resourcesWithCounts,
        });
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Error al cargar la jerarquía POA");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, authIsLoading, refreshKey]);

  return {
    data,
    isLoading,
    error,
    refetch: () => setRefreshKey((current) => current + 1),
  };
}
