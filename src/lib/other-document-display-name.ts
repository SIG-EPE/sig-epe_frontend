const SAFE_EXTENSION = /^(.*)(\.[\p{L}\p{N}]{1,10})$/u;
const RESERVED_STEM = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

// Solo para presentación: la procedencia original permanece intacta en el servidor.
export function getSafeOtherDocumentDisplayFilename(value: string): string {
  const basename =
    value
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/[\p{Cc}\p{Cf}<>:"|?*]/gu, "")
      .trim() ?? "";
  const match = basename.match(SAFE_EXTENSION);
  const extension = match?.[2] ?? "";
  const stem = (match?.[1] ?? basename).trim().replace(/^[.\s]+|[.\s]+$/gu, "");
  if (!stem || RESERVED_STEM.test(stem)) {
    return extension ? `Documento${extension}` : "Documento sin nombre";
  }
  return `${stem}${extension}`;
}
