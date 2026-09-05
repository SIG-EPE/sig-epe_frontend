import {
  appendCanonicalQueueParam,
  readStrictQueueParams,
  updateQueueFilterUrl,
  type QueueFilterParseResult,
  type QueueFilterRouteAdapter,
} from "@/lib/queue-filters/codec";
import { isMoneyValue, isQueueFilterUuid, parsePositiveInteger } from "@/lib/queue-filters/primitives";
import { GIOF_WORK_SCOPE, type GiofWorkScope } from "@/types/giof-work";
import {
  DRIVE_PAYMENT_PROJECTION_STATUS,
  DRIVE_SOURCE_ACCOUNT,
  PAYMENT_COMPLETENESS,
  PAYMENT_QUEUE_SORT,
  PAYMENT_REXAN_STATUS,
  REQUEST_CURRENCY,
  type DrivePaymentProjectionStatus,
  type DriveSourceAccount,
  type PaymentCompleteness,
  type PaymentQueueFilters,
  type PaymentQueueRexanStatus,
  type PaymentQueueSort,
  type RequestCurrency,
} from "@/types/requests";

export const PAYMENT_QUEUE_TAB = {
  APPROVED: "approved",
  PAID: "paid",
  PENDING_DATA: "pending-data",
} as const;

export type PaymentQueueTab =
  (typeof PAYMENT_QUEUE_TAB)[keyof typeof PAYMENT_QUEUE_TAB];

export interface PaymentQueueUrlFilters extends Omit<PaymentQueueFilters, "status" | "pending_proof" | "pending_details" | "pending_data"> {
  tab?: PaymentQueueTab;
}

export const PAYMENT_QUEUE_QUERY_KEY = {
  TAB: "tab",
  PAGE: "page",
  LIMIT: "limit",
  SEARCH: "search",
  WORK_SCOPE: "work_scope",
  ASSIGNEE_ID: "assignee_id",
  APPROVED_FROM: "approved_from",
  APPROVED_TO: "approved_to",
  PAID_FROM: "paid_from",
  PAID_TO: "paid_to",
  SOURCE_ACCOUNT_KEY: "source_account_key",
  COMPLETENESS: "completeness",
  DRIVE_STATUS: "drive_status",
  REXAN_STATUS: "rexan_status",
  CURRENCY: "currency",
  AMOUNT_MIN: "amount_min",
  AMOUNT_MAX: "amount_max",
  SORT: "sort",
} as const;

export type PaymentQueueQueryKey =
  (typeof PAYMENT_QUEUE_QUERY_KEY)[keyof typeof PAYMENT_QUEUE_QUERY_KEY];

const PAYMENT_QUEUE_QUERY_KEYS = Object.values(PAYMENT_QUEUE_QUERY_KEY);
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function addInvalid(invalidKeys: PaymentQueueQueryKey[], key: PaymentQueueQueryKey): void {
  if (!invalidKeys.includes(key)) invalidKeys.push(key);
}

export function parsePaymentQueueUrl(
  params: URLSearchParams,
): QueueFilterParseResult<PaymentQueueUrlFilters, PaymentQueueQueryKey> {
  const strict = readStrictQueueParams(params, PAYMENT_QUEUE_QUERY_KEYS);
  const invalidKeys = [...strict.duplicateKeys];
  const raw = strict.values;
  const filters: PaymentQueueUrlFilters = { page: DEFAULT_PAGE, limit: DEFAULT_LIMIT };

  if (raw.tab !== undefined) {
    if (Object.values(PAYMENT_QUEUE_TAB).includes(raw.tab as PaymentQueueTab)) filters.tab = raw.tab as PaymentQueueTab;
    else addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.TAB);
  }
  if (raw.page !== undefined) {
    const page = parsePositiveInteger(raw.page);
    if (page) filters.page = page;
    else addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.PAGE);
  }
  if (raw.limit !== undefined) {
    const limit = parsePositiveInteger(raw.limit, 100);
    if (limit) filters.limit = limit;
    else addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.LIMIT);
  }
  if (raw.search !== undefined) {
    const search = raw.search.trim();
    if (search.length <= 200) {
      if (search) filters.search = search;
    } else addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.SEARCH);
  }
  if (raw.work_scope !== undefined) {
    if (Object.values(GIOF_WORK_SCOPE).includes(raw.work_scope as GiofWorkScope)) filters.work_scope = raw.work_scope as GiofWorkScope;
    else addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.WORK_SCOPE);
  }
  if (raw.assignee_id !== undefined) {
    if (isQueueFilterUuid(raw.assignee_id)) filters.assignee_id = raw.assignee_id;
    else addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.ASSIGNEE_ID);
  }
  if (filters.work_scope === GIOF_WORK_SCOPE.ASSIGNEE) {
    if (!filters.assignee_id) {
      addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.WORK_SCOPE);
      addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.ASSIGNEE_ID);
      delete filters.work_scope;
    }
  } else if (filters.assignee_id) {
    addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.ASSIGNEE_ID);
    delete filters.assignee_id;
  }

  const dateRanges = [
    [PAYMENT_QUEUE_QUERY_KEY.APPROVED_FROM, PAYMENT_QUEUE_QUERY_KEY.APPROVED_TO],
    [PAYMENT_QUEUE_QUERY_KEY.PAID_FROM, PAYMENT_QUEUE_QUERY_KEY.PAID_TO],
  ] as const;
  for (const [fromKey, toKey] of dateRanges) {
    const from = raw[fromKey];
    const to = raw[toKey];
    const valid = (!from || isDateOnly(from)) && (!to || isDateOnly(to)) && (!from || !to || from <= to);
    if (valid) {
      if (from) filters[fromKey] = from;
      if (to) filters[toKey] = to;
    } else {
      if (from) addInvalid(invalidKeys, fromKey);
      if (to) addInvalid(invalidKeys, toKey);
    }
  }

  const enumFields = [
    [PAYMENT_QUEUE_QUERY_KEY.SOURCE_ACCOUNT_KEY, Object.values(DRIVE_SOURCE_ACCOUNT)],
    [PAYMENT_QUEUE_QUERY_KEY.COMPLETENESS, Object.values(PAYMENT_COMPLETENESS)],
    [PAYMENT_QUEUE_QUERY_KEY.DRIVE_STATUS, Object.values(DRIVE_PAYMENT_PROJECTION_STATUS)],
    [PAYMENT_QUEUE_QUERY_KEY.REXAN_STATUS, Object.values(PAYMENT_REXAN_STATUS)],
    [PAYMENT_QUEUE_QUERY_KEY.CURRENCY, Object.values(REQUEST_CURRENCY)],
    [PAYMENT_QUEUE_QUERY_KEY.SORT, Object.values(PAYMENT_QUEUE_SORT)],
  ] as const;
  for (const [key, values] of enumFields) {
    const value = raw[key];
    if (value === undefined) continue;
    if ((values as readonly string[]).includes(value)) {
      if (key === PAYMENT_QUEUE_QUERY_KEY.SOURCE_ACCOUNT_KEY) filters.source_account_key = value as DriveSourceAccount;
      else if (key === PAYMENT_QUEUE_QUERY_KEY.COMPLETENESS) filters.completeness = value as PaymentCompleteness;
      else if (key === PAYMENT_QUEUE_QUERY_KEY.DRIVE_STATUS) filters.drive_status = value as DrivePaymentProjectionStatus;
      else if (key === PAYMENT_QUEUE_QUERY_KEY.REXAN_STATUS) filters.rexan_status = value as PaymentQueueRexanStatus;
      else if (key === PAYMENT_QUEUE_QUERY_KEY.CURRENCY) filters.currency = value as RequestCurrency;
      else filters.sort = value as PaymentQueueSort;
    } else addInvalid(invalidKeys, key);
  }

  const hasAmount = raw.amount_min !== undefined || raw.amount_max !== undefined;
  const amountsValid = isMoneyValue(raw.amount_min) && isMoneyValue(raw.amount_max);
  const amountOrderValid = amountsValid && (!raw.amount_min || !raw.amount_max
    || BigInt(raw.amount_min.replace(".", "")) <= BigInt(raw.amount_max.replace(".", "")));
  if (hasAmount && filters.currency && amountsValid && amountOrderValid) {
    filters.amount_min = raw.amount_min;
    filters.amount_max = raw.amount_max;
  } else if (hasAmount) {
    if (raw.amount_min !== undefined) addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.AMOUNT_MIN);
    if (raw.amount_max !== undefined) addInvalid(invalidKeys, PAYMENT_QUEUE_QUERY_KEY.AMOUNT_MAX);
  }

  return { filters, invalidKeys, unknownKeys: strict.unknownKeys };
}

export function normalizePaymentQueueFilters(filters: PaymentQueueUrlFilters): PaymentQueueUrlFilters {
  const raw = new URLSearchParams();
  for (const key of PAYMENT_QUEUE_QUERY_KEYS) appendCanonicalQueueParam(raw, key, filters[key]);
  return parsePaymentQueueUrl(raw).filters;
}

export function serializePaymentQueueUrl(filters: PaymentQueueUrlFilters): URLSearchParams {
  const normalized = normalizePaymentQueueFilters(filters);
  const params = new URLSearchParams();
  for (const key of PAYMENT_QUEUE_QUERY_KEYS) {
    appendCanonicalQueueParam(params, key, normalized[key], {
      defaultValue: key === PAYMENT_QUEUE_QUERY_KEY.PAGE
        ? DEFAULT_PAGE
        : key === PAYMENT_QUEUE_QUERY_KEY.LIMIT
          ? DEFAULT_LIMIT
          : key === PAYMENT_QUEUE_QUERY_KEY.TAB
            ? PAYMENT_QUEUE_TAB.APPROVED
            : undefined,
      sentinelValues: ["ALL"],
    });
  }
  return params;
}

export const PAYMENT_QUEUE_FILTER_ADAPTER: QueueFilterRouteAdapter<PaymentQueueUrlFilters> = {
  parse: parsePaymentQueueUrl,
  serialize: serializePaymentQueueUrl,
};

export function updatePaymentQueueUrl(
  current: URLSearchParams,
  patch: Partial<PaymentQueueUrlFilters>,
): URLSearchParams {
  return updateQueueFilterUrl(current, patch, PAYMENT_QUEUE_FILTER_ADAPTER);
}
