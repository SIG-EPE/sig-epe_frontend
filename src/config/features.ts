export function isPoaCatalogCodeModelEnabled(): boolean {
  return process.env.NEXT_PUBLIC_POA_CATALOG_CODE_MODEL_ENABLED === "true";
}

export function isPoaCatalogAliasWorkflowEnabled(): boolean {
  return process.env.NEXT_PUBLIC_POA_CATALOG_ALIAS_WORKFLOW_ENABLED === "true";
}
