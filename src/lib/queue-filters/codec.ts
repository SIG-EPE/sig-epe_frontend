export interface StrictQueueParams<K extends string> {
  values: Partial<Record<K, string>>;
  duplicateKeys: K[];
  unknownKeys: string[];
}

export interface QueueFilterParseResult<T, K extends string = string> {
  filters: T;
  invalidKeys: K[];
  unknownKeys: string[];
}

export interface QueueFilterRouteAdapter<T> {
  parse: (params: URLSearchParams) => QueueFilterParseResult<T>;
  serialize: (filters: T) => URLSearchParams;
}

interface CanonicalQueueParamOptions {
  defaultValue?: string | number;
  sentinelValues?: readonly (string | number)[];
}

interface UpdateQueueFilterUrlOptions {
  preservedKeys?: readonly string[];
  paginationKeys?: readonly string[];
}

export function readStrictQueueParams<K extends string>(
  params: URLSearchParams,
  knownKeys: readonly K[],
): StrictQueueParams<K> {
  const knownKeySet = new Set<string>(knownKeys);
  const duplicateKeys: K[] = [];
  const values: Partial<Record<K, string>> = {};

  for (const key of knownKeys) {
    const entries = params.getAll(key);
    if (entries.length > 1) duplicateKeys.push(key);
    else if (entries.length === 1) values[key] = entries[0];
  }

  const unknownKeys = [...new Set([...params.keys()].filter((key) => !knownKeySet.has(key)))];
  return { values, duplicateKeys, unknownKeys };
}

export function appendCanonicalQueueParam(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
  options: CanonicalQueueParamOptions = {},
): void {
  if (value === undefined || value === "") return;
  if (options.defaultValue !== undefined && value === options.defaultValue) return;
  if (options.sentinelValues?.includes(value)) return;
  params.set(key, String(value));
}

export function updateQueueFilterUrl<T extends { page?: number }>(
  current: URLSearchParams,
  patch: Partial<T>,
  adapter: QueueFilterRouteAdapter<T>,
  options: UpdateQueueFilterUrlOptions = {},
): URLSearchParams {
  const paginationKeys = options.paginationKeys ?? ["page", "limit"];
  const changesView = Object.keys(patch).some((key) => !paginationKeys.includes(key));
  const currentFilters = adapter.parse(current).filters;
  const nextFilters = {
    ...currentFilters,
    ...patch,
    page: changesView ? 1 : (patch.page ?? currentFilters.page),
  };
  const next = new URLSearchParams();

  for (const key of options.preservedKeys ?? []) {
    const value = current.get(key);
    if (value !== null) next.set(key, value);
  }
  adapter.serialize(nextFilters).forEach((value, key) => next.set(key, value));
  return next;
}
