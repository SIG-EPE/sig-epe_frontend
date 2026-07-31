// -------------------------------------------------------
// API response types — SIG-EPE
// -------------------------------------------------------

/** Standard success envelope from backend */
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** Standard error shape from backend */
export interface ApiError {
  statusCode: number;
  code?: string;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

/** Paginated list metadata */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Paginated response envelope */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
