import {
  appendCanonicalQueueParam,
  readStrictQueueParams,
  updateQueueFilterUrl,
  type QueueFilterParseResult,
  type QueueFilterRouteAdapter,
} from "@/lib/queue-filters/codec";
import { isQueueFilterUuid, parsePositiveInteger, QUEUE_FILTER_ALL_VALUE } from "@/lib/queue-filters/primitives";
import { GIOF_WORK_SCOPE, type GiofWorkScope } from "@/types/giof-work";
import {
  RENDITION_BUCKET,
  RENDITION_DEADLINE_BUCKET,
  RENDITION_SORT_DIRECTION,
  RENDITION_SORT_FIELD,
  RENDITION_STATUS,
  type RenditionsInboxFilters,
} from "@/types/requests";

export interface RenditionsQueueUrlFilters extends Omit<RenditionsInboxFilters, "bucket" | "due_from" | "due_to"> {}

export const RENDITIONS_QUEUE_QUERY_KEY = {
  PAGE: "page",
  LIMIT: "limit",
  STATUS: "status",
  SEARCH: "search",
  WORK_SCOPE: "work_scope",
  ASSIGNEE_ID: "assignee_id",
  DEADLINE_FROM: "deadline_from",
  DEADLINE_TO: "deadline_to",
  DEADLINE_BUCKET: "deadline_bucket",
  SORT: "sort",
  DIRECTION: "direction",
  DUE_FROM: "due_from",
  DUE_TO: "due_to",
  BUCKET: "bucket",
} as const;

export type RenditionsQueueQueryKey =
  (typeof RENDITIONS_QUEUE_QUERY_KEY)[keyof typeof RENDITIONS_QUEUE_QUERY_KEY];

const QUERY_KEYS = Object.values(RENDITIONS_QUEUE_QUERY_KEY);
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

function isDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function addInvalid(keys: RenditionsQueueQueryKey[], ...nextKeys: RenditionsQueueQueryKey[]): void {
  for (const key of nextKeys) if (!keys.includes(key)) keys.push(key);
}

function resolveAlias(
  canonical: string | undefined,
  alias: string | undefined,
  canonicalKey: RenditionsQueueQueryKey,
  aliasKey: RenditionsQueueQueryKey,
  invalidKeys: RenditionsQueueQueryKey[],
): string | undefined {
  if (canonical !== undefined && alias !== undefined && canonical !== alias) {
    addInvalid(invalidKeys, canonicalKey, aliasKey);
    return undefined;
  }
  return canonical ?? alias;
}

export function parseRenditionsQueueUrl(
  params: URLSearchParams,
): QueueFilterParseResult<RenditionsQueueUrlFilters, RenditionsQueueQueryKey> {
  const strict = readStrictQueueParams(params, QUERY_KEYS);
  const invalidKeys = [...strict.duplicateKeys];
  const raw = strict.values;
  const filters: RenditionsQueueUrlFilters = {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
    sort: RENDITION_SORT_FIELD.LAST_ACTIVITY,
    direction: RENDITION_SORT_DIRECTION.DESC,
  };

  if (raw.page !== undefined) {
    const page = parsePositiveInteger(raw.page);
    if (page) filters.page = page;
    else addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.PAGE);
  }
  if (raw.limit !== undefined) {
    const limit = parsePositiveInteger(raw.limit, 100);
    if (limit) filters.limit = limit;
    else addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.LIMIT);
  }
  if (raw.status !== undefined && raw.status !== QUEUE_FILTER_ALL_VALUE) {
    if ((Object.values(RENDITION_STATUS) as readonly string[]).includes(raw.status)) filters.status = raw.status as NonNullable<typeof filters.status>;
    else addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.STATUS);
  }
  if (raw.search !== undefined) {
    const search = raw.search.trim();
    if (search.length <= 200) {
      if (search) filters.search = search;
    } else addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.SEARCH);
  }
  if (raw.work_scope !== undefined) {
    if (Object.values(GIOF_WORK_SCOPE).includes(raw.work_scope as GiofWorkScope)) filters.work_scope = raw.work_scope as GiofWorkScope;
    else addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.WORK_SCOPE);
  }
  if (raw.assignee_id !== undefined) {
    if (isQueueFilterUuid(raw.assignee_id)) filters.assignee_id = raw.assignee_id;
    else addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.ASSIGNEE_ID);
  }
  if (filters.work_scope === GIOF_WORK_SCOPE.ASSIGNEE) {
    if (!filters.assignee_id) addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.WORK_SCOPE, RENDITIONS_QUEUE_QUERY_KEY.ASSIGNEE_ID);
  } else if (filters.assignee_id) {
    addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.ASSIGNEE_ID);
  }

  const deadlineFrom = resolveAlias(raw.deadline_from, raw.due_from, RENDITIONS_QUEUE_QUERY_KEY.DEADLINE_FROM, RENDITIONS_QUEUE_QUERY_KEY.DUE_FROM, invalidKeys);
  const deadlineTo = resolveAlias(raw.deadline_to, raw.due_to, RENDITIONS_QUEUE_QUERY_KEY.DEADLINE_TO, RENDITIONS_QUEUE_QUERY_KEY.DUE_TO, invalidKeys);
  const validDeadlineRange = (!deadlineFrom || isDateOnly(deadlineFrom))
    && (!deadlineTo || isDateOnly(deadlineTo))
    && (!deadlineFrom || !deadlineTo || deadlineFrom <= deadlineTo);
  if (validDeadlineRange) {
    filters.deadline_from = deadlineFrom;
    filters.deadline_to = deadlineTo;
  } else {
    if (deadlineFrom) addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.DEADLINE_FROM);
    if (deadlineTo) addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.DEADLINE_TO);
  }

  const legacyBucket = raw.bucket === QUEUE_FILTER_ALL_VALUE ? undefined : raw.bucket;
  if (legacyBucket !== undefined && legacyBucket !== RENDITION_BUCKET.DUE_SOON) {
    addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.BUCKET);
  }
  const canonicalBucket = raw.deadline_bucket === QUEUE_FILTER_ALL_VALUE ? undefined : raw.deadline_bucket;
  const deadlineBucket = resolveAlias(canonicalBucket, legacyBucket, RENDITIONS_QUEUE_QUERY_KEY.DEADLINE_BUCKET, RENDITIONS_QUEUE_QUERY_KEY.BUCKET, invalidKeys);
  if (deadlineBucket !== undefined) {
    if ((Object.values(RENDITION_DEADLINE_BUCKET) as readonly string[]).includes(deadlineBucket)) filters.deadline_bucket = deadlineBucket as NonNullable<typeof filters.deadline_bucket>;
    else addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.DEADLINE_BUCKET);
  }

  if (raw.sort !== undefined) {
    if ((Object.values(RENDITION_SORT_FIELD) as readonly string[]).includes(raw.sort)) filters.sort = raw.sort as NonNullable<typeof filters.sort>;
    else addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.SORT);
  }
  if (raw.direction !== undefined) {
    if ((Object.values(RENDITION_SORT_DIRECTION) as readonly string[]).includes(raw.direction)) filters.direction = raw.direction as NonNullable<typeof filters.direction>;
    else addInvalid(invalidKeys, RENDITIONS_QUEUE_QUERY_KEY.DIRECTION);
  }

  return { filters, invalidKeys, unknownKeys: strict.unknownKeys };
}

export function normalizeRenditionsQueueFilters(filters: RenditionsQueueUrlFilters): RenditionsQueueUrlFilters {
  return parseRenditionsQueueUrl(serializeRaw(filters)).filters;
}

function serializeRaw(filters: RenditionsQueueUrlFilters): URLSearchParams {
  const params = new URLSearchParams();
  appendCanonicalQueueParam(params, "page", filters.page);
  appendCanonicalQueueParam(params, "limit", filters.limit);
  appendCanonicalQueueParam(params, "status", filters.status, { sentinelValues: [QUEUE_FILTER_ALL_VALUE] });
  appendCanonicalQueueParam(params, "search", filters.search);
  appendCanonicalQueueParam(params, "work_scope", filters.work_scope);
  appendCanonicalQueueParam(params, "assignee_id", filters.assignee_id);
  appendCanonicalQueueParam(params, "deadline_from", filters.deadline_from);
  appendCanonicalQueueParam(params, "deadline_to", filters.deadline_to);
  appendCanonicalQueueParam(params, "deadline_bucket", filters.deadline_bucket, { sentinelValues: [QUEUE_FILTER_ALL_VALUE] });
  appendCanonicalQueueParam(params, "sort", filters.sort);
  appendCanonicalQueueParam(params, "direction", filters.direction);
  return params;
}

export function serializeRenditionsQueueUrl(filters: RenditionsQueueUrlFilters): URLSearchParams {
  const normalized = normalizeRenditionsQueueFilters(filters);
  const params = new URLSearchParams();
  appendCanonicalQueueParam(params, "page", normalized.page, { defaultValue: DEFAULT_PAGE });
  appendCanonicalQueueParam(params, "limit", normalized.limit, { defaultValue: DEFAULT_LIMIT });
  appendCanonicalQueueParam(params, "status", normalized.status);
  appendCanonicalQueueParam(params, "search", normalized.search);
  appendCanonicalQueueParam(params, "work_scope", normalized.work_scope);
  appendCanonicalQueueParam(params, "assignee_id", normalized.assignee_id);
  appendCanonicalQueueParam(params, "deadline_from", normalized.deadline_from);
  appendCanonicalQueueParam(params, "deadline_to", normalized.deadline_to);
  appendCanonicalQueueParam(params, "deadline_bucket", normalized.deadline_bucket);
  appendCanonicalQueueParam(params, "sort", normalized.sort, { defaultValue: RENDITION_SORT_FIELD.LAST_ACTIVITY });
  appendCanonicalQueueParam(params, "direction", normalized.direction, { defaultValue: RENDITION_SORT_DIRECTION.DESC });
  return params;
}

export const RENDITIONS_QUEUE_FILTER_ADAPTER: QueueFilterRouteAdapter<RenditionsQueueUrlFilters> = {
  parse: parseRenditionsQueueUrl,
  serialize: serializeRenditionsQueueUrl,
};

export function updateRenditionsQueueUrl(
  current: URLSearchParams,
  patch: Partial<RenditionsQueueUrlFilters>,
): URLSearchParams {
  return updateQueueFilterUrl(current, patch, RENDITIONS_QUEUE_FILTER_ADAPTER);
}
