const BUSINESS_EXPORT_QUEUE = {
  REVIEW: "solicitudes-revision",
  PAYMENTS: "pagos",
  RENDITIONS: "rendiciones",
} as const;

type BusinessExportQueue = (typeof BUSINESS_EXPORT_QUEUE)[keyof typeof BUSINESS_EXPORT_QUEUE];

export function businessExportFilename(
  queue: BusinessExportQueue,
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${queue}_${values.year}-${values.month}-${values.day}_${values.hour}-${values.minute}.xlsx`;
}

export function safeBusinessExportFilename(
  queue: BusinessExportQueue,
  filename: string | null,
): string {
  const pattern = new RegExp(
    `^${queue}_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}\\.xlsx$`,
  );
  return filename && pattern.test(filename)
    ? filename
    : businessExportFilename(queue);
}
