import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SourceMonthGrid } from '../source-month-grid';
import {
  POA_SOURCE_CELL_KIND,
  POA_SOURCE_SEMANTICS_VERSION,
  type PoaSourceAuthorityDetail,
} from '@/types/budget';

const sourceAuthority: PoaSourceAuthorityDetail = {
  semantics_version: POA_SOURCE_SEMANTICS_VERSION,
  source_months: [
    {
      month: 1,
      cell_kind: POA_SOURCE_CELL_KIND.BLANK,
      unscaled: null,
      scale: null,
      value: null,
    },
    {
      month: 2,
      cell_kind: POA_SOURCE_CELL_KIND.NUMBER,
      unscaled: '0',
      scale: 0,
      value: '0',
    },
  ],
  statistics: {
    semanticsVersion: POA_SOURCE_SEMANTICS_VERSION,
    sum: '0',
    average: '0',
    observedCount: 1,
    blankCount: 1,
    explicitZeroCount: 1,
    expectedCount: 2,
    coverage: '0.5',
    completeness: 'PARTIAL',
  },
};

describe('SourceMonthGrid', () => {
  it('renders blank as Sin dato and explicit zero numerically with coverage', () => {
    render(<SourceMonthGrid sourceAuthority={sourceAuthority} />);

    expect(screen.getByTestId('source-month-1').textContent).toContain('Sin dato');
    expect(screen.getByTestId('source-month-2').textContent?.replace(/\s/gu, ' ')).toContain('S/ 0.00');
    expect(screen.getByText(/Cobertura: 50\.00%/u)).not.toBeNull();
    expect(screen.getByText(/1 sin dato/u)).not.toBeNull();
    expect(screen.getByText(/1 cero explícito/u)).not.toBeNull();
    const statistics = screen.getByTestId('source-statistics').textContent?.replace(/\s/gu, ' ');
    expect(statistics).toContain('SumaS/ 0.00');
    expect(statistics).toContain('Promedio observadoS/ 0.00');
    expect(statistics).toContain('Observados1 de 2');
    expect(statistics).toContain('EstadoParcial');
  });
});
