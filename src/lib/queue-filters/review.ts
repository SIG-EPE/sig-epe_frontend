import { parseBusinessDateTimeLocalToIso } from "@/lib/business-timezone";
import {
  appendCanonicalQueueParam,
  readStrictQueueParams,
  updateQueueFilterUrl,
  type QueueFilterParseResult,
  type QueueFilterRouteAdapter,
} from "@/lib/queue-filters/codec";
import {
  isMoneyValue,
  isQueueFilterUuid,
  parsePositiveInteger,
} from "@/lib/queue-filters/primitives";
import { GIOF_WORK_SCOPE, type GiofWorkScope } from "@/types/giof-work";
import {
  REQUEST_CURRENCY,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type RequestCurrency,
  type RequestReviewFilters,
  type RequestStatus,
  type RequestType,
} from "@/types/requests";

export const REQUEST_REVIEW_QUERY_KEY = {
  PAGE: "page",
  LIMIT: "limit",
  WORK_SCOPE: "work_scope",
  ASSIGNEE_ID: "assignee_id",
  REQUEST_TYPE: "request_type",
  STATUS: "status",
  SUBMITTED_FROM: "submitted_from",
  SUBMITTED_TO: "submitted_to",
  ASSIGNED_FROM: "assigned_from",
  ASSIGNED_TO: "assigned_to",
  CURRENCY: "currency",
  AMOUNT_MIN: "amount_min",
  AMOUNT_MAX: "amount_max",
  ORG_UNIT_ID: "org_unit_id",
  SEARCH: "search",
} as const;

export type RequestReviewQueryKey =
  (typeof REQUEST_REVIEW_QUERY_KEY)[keyof typeof REQUEST_REVIEW_QUERY_KEY];

const REQUEST_REVIEW_QUERY_KEYS = Object.values(REQUEST_REVIEW_QUERY_KEY);
const REQUEST_REVIEW_DEFAULT_PAGE = 1;
const REQUEST_REVIEW_DEFAULT_LIMIT = 20;
const REQUEST_REVIEW_LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type RequestReviewUrlParseResult = QueueFilterParseResult<
  RequestReviewFilters,
  RequestReviewQueryKey
>;

function isRequestReviewLocalDateTime(value: string): boolean {
  if (!REQUEST_REVIEW_LOCAL_DATE_TIME_PATTERN.test(value)) return false;
  try {
    parseBusinessDateTimeLocalToIso(value);
    return true;
  } catch {
    return false;
  }
}

function addInvalidKey(
  invalidKeys: RequestReviewQueryKey[],
  key: RequestReviewQueryKey,
): void {
  if (!invalidKeys.includes(key)) invalidKeys.push(key);
}

function markIntervalInvalid(
  invalidKeys: RequestReviewQueryKey[],
  fromKey: RequestReviewQueryKey,
  toKey: RequestReviewQueryKey,
): void {
  addInvalidKey(invalidKeys, fromKey);
  addInvalidKey(invalidKeys, toKey);
}

export function parseRequestReviewUrl(params: URLSearchParams): RequestReviewUrlParseResult {
  const strictParams = readStrictQueueParams(params, REQUEST_REVIEW_QUERY_KEYS);
  const invalidKeys = [...strictParams.duplicateKeys];
  const raw = strictParams.values;
  const filters: RequestReviewFilters = {
    page: REQUEST_REVIEW_DEFAULT_PAGE,
    limit: REQUEST_REVIEW_DEFAULT_LIMIT,
  };

  if (raw.page !== undefined) {
    const page = parsePositiveInteger(raw.page);
    if (page) filters.page = page;
    else addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.PAGE);
  }
  if (raw.limit !== undefined) {
    const limit = parsePositiveInteger(raw.limit, 100);
    if (limit) filters.limit = limit;
    else addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.LIMIT);
  }

  if (raw.work_scope !== undefined) {
    if (Object.values(GIOF_WORK_SCOPE).includes(raw.work_scope as GiofWorkScope)) {
      filters.work_scope = raw.work_scope as GiofWorkScope;
    } else addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.WORK_SCOPE);
  }
  if (raw.assignee_id !== undefined) {
    if (isQueueFilterUuid(raw.assignee_id)) filters.assignee_id = raw.assignee_id;
    else addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.ASSIGNEE_ID);
  }
  if (filters.work_scope === GIOF_WORK_SCOPE.ASSIGNEE) {
    if (!filters.assignee_id) {
      addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.WORK_SCOPE);
      addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.ASSIGNEE_ID);
      delete filters.work_scope;
    }
  } else if (filters.assignee_id) {
    addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.ASSIGNEE_ID);
    delete filters.assignee_id;
  }

  if (raw.request_type !== undefined) {
    if (Object.values(REQUEST_TYPE).includes(raw.request_type as RequestType)) {
      filters.request_type = raw.request_type as RequestType;
    } else addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.REQUEST_TYPE);
  }
  if (raw.status !== undefined) {
    if (Object.values(REQUEST_STATUS).includes(raw.status as RequestStatus)) {
      filters.status = raw.status as RequestStatus;
    } else addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.STATUS);
  }

  const intervals = [
    [REQUEST_REVIEW_QUERY_KEY.SUBMITTED_FROM, REQUEST_REVIEW_QUERY_KEY.SUBMITTED_TO],
    [REQUEST_REVIEW_QUERY_KEY.ASSIGNED_FROM, REQUEST_REVIEW_QUERY_KEY.ASSIGNED_TO],
  ] as const;
  for (const [fromKey, toKey] of intervals) {
    const from = raw[fromKey];
    const to = raw[toKey];
    if (from === undefined && to === undefined) continue;
    if (
      from !== undefined
      && to !== undefined
      && isRequestReviewLocalDateTime(from)
      && isRequestReviewLocalDateTime(to)
      && from < to
    ) {
      filters[fromKey] = from;
      filters[toKey] = to;
    } else markIntervalInvalid(invalidKeys, fromKey, toKey);
  }

  if (raw.currency !== undefined) {
    if (Object.values(REQUEST_CURRENCY).includes(raw.currency as RequestCurrency)) {
      filters.currency = raw.currency as RequestCurrency;
    } else addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.CURRENCY);
  }
  const amountMinValid = isMoneyValue(raw.amount_min);
  const amountMaxValid = isMoneyValue(raw.amount_max);
  const hasAmount = raw.amount_min !== undefined || raw.amount_max !== undefined;
  const amountOrderValid = amountMinValid && amountMaxValid && (
    raw.amount_min === undefined
    || raw.amount_max === undefined
    || BigInt(raw.amount_min.replace(".", "")) <= BigInt(raw.amount_max.replace(".", ""))
  );
  if (hasAmount && filters.currency && amountMinValid && amountMaxValid && amountOrderValid) {
    filters.amount_min = raw.amount_min;
    filters.amount_max = raw.amount_max;
  } else if (hasAmount) {
    if (raw.amount_min !== undefined) addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.AMOUNT_MIN);
    if (raw.amount_max !== undefined) addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.AMOUNT_MAX);
  }

  if (raw.org_unit_id !== undefined) {
    if (isQueueFilterUuid(raw.org_unit_id)) filters.org_unit_id = raw.org_unit_id;
    else addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.ORG_UNIT_ID);
  }
  if (raw.search !== undefined) {
    const search = raw.search.trim();
    if (search.length <= 200) {
      if (search) filters.search = search;
    } else addInvalidKey(invalidKeys, REQUEST_REVIEW_QUERY_KEY.SEARCH);
  }

  return { filters, invalidKeys, unknownKeys: strictParams.unknownKeys };
}

export function normalizeRequestReviewFilters(filters: RequestReviewFilters): RequestReviewFilters {
  const rawParams = new URLSearchParams();
  for (const key of REQUEST_REVIEW_QUERY_KEYS) {
    appendCanonicalQueueParam(rawParams, key, filters[key]);
  }
  return parseRequestReviewUrl(rawParams).filters;
}

export function serializeRequestReviewUrl(filters: RequestReviewFilters): URLSearchParams {
  const normalized = normalizeRequestReviewFilters(filters);
  const params = new URLSearchParams();
  for (const key of REQUEST_REVIEW_QUERY_KEYS) {
    appendCanonicalQueueParam(params, key, normalized[key], {
      defaultValue: key === REQUEST_REVIEW_QUERY_KEY.PAGE
        ? REQUEST_REVIEW_DEFAULT_PAGE
        : key === REQUEST_REVIEW_QUERY_KEY.LIMIT
          ? REQUEST_REVIEW_DEFAULT_LIMIT
          : undefined,
    });
  }
  return params;
}

export const REQUEST_REVIEW_FILTER_ADAPTER: QueueFilterRouteAdapter<RequestReviewFilters> = {
  parse: parseRequestReviewUrl,
  serialize: serializeRequestReviewUrl,
};

export function updateRequestReviewUrl(
  current: URLSearchParams,
  patch: Partial<RequestReviewFilters>,
): URLSearchParams {
  return updateQueueFilterUrl(current, patch, REQUEST_REVIEW_FILTER_ADAPTER, {
    preservedKeys: current.get("scope") === "review" ? ["scope"] : [],
  });
}
