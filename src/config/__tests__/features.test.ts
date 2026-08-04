import { afterEach, describe, expect, it } from "vitest";

import { isPoaCatalogAliasWorkflowEnabled, isPoaCatalogCodeModelEnabled } from "../features";

const originalFlag = process.env.NEXT_PUBLIC_POA_CATALOG_CODE_MODEL_ENABLED;
const originalAliasFlag = process.env.NEXT_PUBLIC_POA_CATALOG_ALIAS_WORKFLOW_ENABLED;

afterEach(() => {
  if (originalAliasFlag === undefined) delete process.env.NEXT_PUBLIC_POA_CATALOG_ALIAS_WORKFLOW_ENABLED;
  else process.env.NEXT_PUBLIC_POA_CATALOG_ALIAS_WORKFLOW_ENABLED = originalAliasFlag;
  if (originalFlag === undefined) {
    delete process.env.NEXT_PUBLIC_POA_CATALOG_CODE_MODEL_ENABLED;
    return;
  }
  process.env.NEXT_PUBLIC_POA_CATALOG_CODE_MODEL_ENABLED = originalFlag;
});

describe("POA catalog code model feature gate", () => {
  it.each([undefined, "", "false", "TRUE", "1"])('defaults off for %s', (value) => {
    if (value === undefined) delete process.env.NEXT_PUBLIC_POA_CATALOG_CODE_MODEL_ENABLED;
    else process.env.NEXT_PUBLIC_POA_CATALOG_CODE_MODEL_ENABLED = value;

    expect(isPoaCatalogCodeModelEnabled()).toBe(false);
  });

  it('enables only for the literal true value', () => {
    process.env.NEXT_PUBLIC_POA_CATALOG_CODE_MODEL_ENABLED = "true";

    expect(isPoaCatalogCodeModelEnabled()).toBe(true);
  });

  it("keeps the replacement alias workflow off independently by default", () => {
    process.env.NEXT_PUBLIC_POA_CATALOG_CODE_MODEL_ENABLED = "true";
    delete process.env.NEXT_PUBLIC_POA_CATALOG_ALIAS_WORKFLOW_ENABLED;

    expect(isPoaCatalogCodeModelEnabled()).toBe(true);
    expect(isPoaCatalogAliasWorkflowEnabled()).toBe(false);
  });
});
