"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePenLine,
  MoreHorizontal,
  Plus,
  Power,
  RefreshCcw,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CatalogStatusBadge } from "@/components/catalogs/shared/catalog-status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isPoaCatalogAliasWorkflowEnabled } from "@/config/features";
import {
  POA_NODE_ACTION,
  POA_NODE_LEVEL,
  type PoaNodeActionRequest,
  type PoaNodeLevel,
} from "@/hooks/use-poa-hierarchy";
import type {
  OperativeAction,
  PoaHierarchyData,
  PoaResource,
  StrategicComponent,
} from "@/types/catalogs";

export interface PoaHierarchyUiAction extends PoaNodeActionRequest {
  currentName?: string;
  fullCode?: string;
}

interface PoaHierarchyTreeProps {
  data: PoaHierarchyData;
  canManage: boolean;
  onAction: (action: PoaHierarchyUiAction) => void;
}

interface PoaNodeRowProps {
  name: string;
  fullCode: string;
  isActive: boolean;
  dependencyCount: number;
  published: boolean;
  level: PoaNodeLevel;
  id: string;
  parentId: string;
  hasChildren: boolean;
  expanded: boolean;
  canManage: boolean;
  onToggle: () => void;
  onAction: (action: PoaHierarchyUiAction) => void;
}

function ExpandButton({ expanded, name, onToggle }: Pick<PoaNodeRowProps, "expanded" | "name" | "onToggle">) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={`${expanded ? "Contraer" : "Expandir"} ${name}`}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </Button>
  );
}

function NodeActions(props: PoaNodeRowProps) {
  const dispatch = (kind: PoaNodeActionRequest["kind"]) => props.onAction({
    kind,
    level: props.level,
    id: props.id,
    parentId: props.parentId,
    currentName: props.name,
    fullCode: props.fullCode,
  });
  const childLevel = props.level === POA_NODE_LEVEL.COMPONENT
    ? POA_NODE_LEVEL.ACTION
    : POA_NODE_LEVEL.RESOURCE;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {props.level !== POA_NODE_LEVEL.RESOURCE && props.isActive && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Crear ${childLevel === POA_NODE_LEVEL.ACTION ? "acción" : "recurso"} en ${props.name}`}
          onClick={() => props.onAction({ kind: POA_NODE_ACTION.CREATE, level: childLevel, parentId: props.id })}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones de ${props.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => dispatch(POA_NODE_ACTION.RENAME)}>
            <FilePenLine /> Renombrar
          </DropdownMenuItem>
          {!props.published && (
            <DropdownMenuItem onSelect={() => dispatch(POA_NODE_ACTION.PUBLISH)}>
              <Send /> Publicar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => dispatch(props.isActive ? POA_NODE_ACTION.DEACTIVATE : POA_NODE_ACTION.REACTIVATE)}>
            {props.isActive ? <Power /> : <RefreshCcw />}
            {props.isActive ? "Desactivar" : "Reactivar"}
          </DropdownMenuItem>
          {isPoaCatalogAliasWorkflowEnabled() && (
            <DropdownMenuItem onSelect={() => dispatch(POA_NODE_ACTION.REPLACEMENT)}>
              <RefreshCcw /> Crear reemplazo
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PoaNodeRow(props: PoaNodeRowProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {props.hasChildren ? (
          <ExpandButton expanded={props.expanded} name={props.name} onToggle={props.onToggle} />
        ) : (
          <span className="h-8 w-8 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <code className="block break-all text-xs text-muted-foreground">{props.fullCode}</code>
          <p className="break-words font-medium">{props.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CatalogStatusBadge isActive={props.isActive} />
            <span>{props.published ? "Publicado" : "Borrador"}</span>
            <span>{props.dependencyCount} dependencias</span>
          </div>
        </div>
      </div>
      {props.canManage && <NodeActions {...props} />}
    </div>
  );
}

function TreeBranch({ children }: { children: ReactNode }) {
  return <ul role="group" className="ml-3 space-y-2 border-l pl-3 sm:ml-5 sm:pl-5">{children}</ul>;
}

export function PoaHierarchyTree({ data, canManage, onAction }: PoaHierarchyTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  if (data.programs.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No se encontraron nodos para los filtros seleccionados.</p>;
  }

  const renderResource = (resource: PoaResource) => (
    <li role="treeitem" key={resource.id}>
      <PoaNodeRow
        name={resource.name} fullCode={resource.fullCode} isActive={resource.isActive}
        dependencyCount={resource.dependencies?.total ?? 0} published={Boolean(resource.publishedAt)}
        level={POA_NODE_LEVEL.RESOURCE} id={resource.id} parentId={resource.actionId}
        hasChildren={false} expanded={false} canManage={canManage} onToggle={() => undefined} onAction={onAction}
      />
    </li>
  );

  const renderAction = (action: OperativeAction) => {
    const resources = data.resources.filter((resource) => resource.actionId === action.id);
    const isExpanded = expanded.has(action.id);
    return (
      <li role="treeitem" key={action.id} aria-expanded={resources.length ? isExpanded : undefined}>
        <PoaNodeRow
          name={action.name} fullCode={action.fullCode} isActive={action.isActive}
          dependencyCount={action.dependencies?.total ?? 0} published={Boolean(action.publishedAt)}
          level={POA_NODE_LEVEL.ACTION} id={action.id} parentId={action.componentId}
          hasChildren={resources.length > 0} expanded={isExpanded} canManage={canManage}
          onToggle={() => toggle(action.id)} onAction={onAction}
        />
        {isExpanded && resources.length > 0 && <TreeBranch>{resources.map(renderResource)}</TreeBranch>}
      </li>
    );
  };

  const renderComponent = (component: StrategicComponent) => {
    const actions = data.actions.filter((action) => action.componentId === component.id);
    const isExpanded = expanded.has(component.id);
    return (
      <li role="treeitem" key={component.id} aria-expanded={actions.length ? isExpanded : undefined}>
        <PoaNodeRow
          name={component.name} fullCode={component.fullCode} isActive={component.isActive}
          dependencyCount={component.dependencies?.total ?? 0} published={Boolean(component.publishedAt)}
          level={POA_NODE_LEVEL.COMPONENT} id={component.id} parentId={component.programId}
          hasChildren={actions.length > 0} expanded={isExpanded} canManage={canManage}
          onToggle={() => toggle(component.id)} onAction={onAction}
        />
        {isExpanded && actions.length > 0 && <TreeBranch>{actions.map(renderAction)}</TreeBranch>}
      </li>
    );
  };

  return (
    <ul role="tree" aria-label="Jerarquía POA" className="min-w-0 space-y-3">
      {data.programs.map((program) => {
        const components = data.components.filter((component) => component.programId === program.id);
        const isExpanded = expanded.has(program.id);
        return (
          <li role="treeitem" key={program.id} aria-expanded={components.length ? isExpanded : undefined}>
            <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 p-3">
              {components.length > 0 ? (
                <ExpandButton expanded={isExpanded} name={program.name} onToggle={() => toggle(program.id)} />
              ) : <span className="h-8 w-8 shrink-0" />}
              <div className="min-w-0 flex-1">
                <code className="text-xs text-muted-foreground">{program.code}</code>
                <p className="break-words font-semibold">{program.name}</p>
              </div>
              <CatalogStatusBadge isActive={program.is_active} />
              {canManage && program.is_active && (
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                  aria-label={`Crear componente en ${program.name}`}
                  onClick={() => onAction({ kind: POA_NODE_ACTION.CREATE, level: POA_NODE_LEVEL.COMPONENT, parentId: program.id })}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            {isExpanded && components.length > 0 && <TreeBranch>{components.map(renderComponent)}</TreeBranch>}
          </li>
        );
      })}
    </ul>
  );
}
