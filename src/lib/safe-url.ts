const SAFE_EXTERNAL_PROTOCOLS = ["https:"] as const;
const SAFE_INTERNAL_PREFIXES = ["/api/", "/auth/", "/requests/"] as const;

function isSafeInternalUrl(value: string): boolean {
  return SAFE_INTERNAL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function getSafeDocumentUrl(value: string | null | undefined): string | null {
  const url = value?.trim();
  if (!url) return null;

  if (isSafeInternalUrl(url)) return url;

  try {
    const parsedUrl = new URL(url);
    return SAFE_EXTERNAL_PROTOCOLS.includes(parsedUrl.protocol as (typeof SAFE_EXTERNAL_PROTOCOLS)[number])
      ? parsedUrl.toString()
      : null;
  } catch {
    return null;
  }
}
