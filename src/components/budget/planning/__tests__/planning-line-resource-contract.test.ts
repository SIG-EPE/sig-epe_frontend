import { describe, expect, it } from 'vitest';

import {
  buildPlanningLineResourceFields,
  poaCatalogOptionLabel,
} from '../planning-line-resource-contract';

describe('planning line POA resource contract', () => {
  it('uses a selected backend resource id and does not send a client-generated code', () => {
    expect(
      buildPlanningLineResourceFields({
        enabled: true,
        resourceId: 'resource-1',
        legacyDescription: 'Legacy',
      }),
    ).toEqual({ resource_id: 'resource-1' });
  });

  it('preserves the legacy description while the feature is disabled', () => {
    expect(
      buildPlanningLineResourceFields({
        enabled: false,
        resourceId: null,
        legacyDescription: 'Legacy resource',
      }),
    ).toEqual({ resource_description: 'Legacy resource' });
  });

  it('renders backend fullCode with the editable name', () => {
    expect(poaCatalogOptionLabel({ fullCode: 'CMP-000001', name: 'Learning' })).toBe(
      'CMP-000001 — Learning',
    );
  });
});
