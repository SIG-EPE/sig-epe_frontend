export const QUEUE_FILTER_ALL_VALUE = "ALL";

const MONEY_PATTERN = /^\d+\.\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePositiveInteger(
  rawValue: string | undefined,
  maximum?: number,
): number | undefined {
  if (!rawValue || !/^\d+$/.test(rawValue)) return undefined;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    return undefined;
  }
  return value;
}

export function isQueueFilterUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isCompleteOrderedInterval(from: string, to: string): boolean {
  return (!from && !to) || (Boolean(from) && Boolean(to) && from < to);
}

export function isValidMoneyRange(
  currency: string,
  minimum: string,
  maximum: string,
): boolean {
  if (!minimum && !maximum) return true;
  if (!currency) return false;
  if ((minimum && !MONEY_PATTERN.test(minimum)) || (maximum && !MONEY_PATTERN.test(maximum))) {
    return false;
  }
  if (minimum && maximum) {
    return BigInt(minimum.replace(".", "")) <= BigInt(maximum.replace(".", ""));
  }
  return true;
}

export function isMoneyValue(value: string | undefined): boolean {
  return value === undefined || MONEY_PATTERN.test(value);
}
