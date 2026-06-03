export const BUSINESS_TIME_ZONE = "America/Lima";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const LIMA_UTC_OFFSET_HOURS = 5;

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid business date");
  }
}

function getBusinessDateParts(date: Date): Record<string, string> {
  assertValidDate(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function getBusinessDateString(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = getBusinessDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getBusinessDateTimeLocalValue(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = getBusinessDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseBusinessDateTimeLocalToIso(value: string): string {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match) {
    throw new Error("Invalid Lima business datetime-local value");
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  const utcTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) + LIMA_UTC_OFFSET_HOURS,
    Number(minute),
    Number(second),
  );

  return new Date(utcTime).toISOString();
}

export function getDateOnlyUtcTime(value?: string | null): number | null {
  if (!value) return null;
  const [datePart] = value.split("T");
  const match = DATE_ONLY_PATTERN.exec(datePart);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

export function formatBusinessDate(value?: string | null, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", { ...options, timeZone: BUSINESS_TIME_ZONE }).format(date);
}

export function formatBusinessDateTime(value?: string | null): string {
  return formatBusinessDate(value, { dateStyle: "medium", timeStyle: "short" });
}
