/** Catálogo mensual: tasas exactas; sin campos de uso financiero ni activación. */
export interface MonthlyFxKey {
  year: number;
  month: number;
}

export interface MonthlyFxMonth extends MonthlyFxKey {
  referenceRate: string;
  closeRate: string | null;
}

export interface MonthlyFxReferenceInput extends MonthlyFxKey {
  referenceRate: string;
}

export interface MonthlyFxPolicy {
  active: boolean;
}

export interface MonthlyFxCloseInput extends MonthlyFxKey {
  closeRate: string;
}
