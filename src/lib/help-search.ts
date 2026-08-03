import type { FaqItem } from "@/lib/help-content";

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const WHITESPACE = /\s+/g;

export function normalizeFaqSearchText(value: string): string {
  return value
    .trim()
    .replace(WHITESPACE, " ")
    .toLocaleLowerCase("es-PE")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "");
}

export function filterFaqItems(items: readonly FaqItem[], query: string): readonly FaqItem[] {
  const normalizedQuery = normalizeFaqSearchText(query);
  if (!normalizedQuery) return items;

  return items.filter((item) =>
    [item.question, item.answer, ...item.keywords].some((value) =>
      normalizeFaqSearchText(value).includes(normalizedQuery),
    ),
  );
}
