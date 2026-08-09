"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FAQ_CATEGORIES, type FaqItem } from "@/lib/help-content";
import { filterFaqItems } from "@/lib/help-search";
import { cn } from "@/lib/utils";

interface FaqSearchProps {
  items: readonly FaqItem[];
}

export function FaqSearch({ items }: FaqSearchProps) {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const filteredItems = filterFaqItems(items, query);

  function toggleItem(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-w-0 space-y-8">
      <div className="space-y-2">
        <label htmlFor="faq-search" className="text-sm font-medium">
          Buscar en preguntas frecuentes
        </label>
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="faq-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca por tema, estado o documento"
            className="h-11 pl-10 pr-4"
          />
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div role="status" className="rounded-lg border border-dashed p-6 text-center sm:p-8">
          <p className="font-medium">No encontramos preguntas para tu búsqueda.</p>
          <p className="mt-1 text-sm text-muted-foreground">Prueba otro término o limpia la búsqueda.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => setQuery("")}>
            Limpiar búsqueda
          </Button>
        </div>
      ) : (
        <div className="space-y-8" aria-live="polite">
          {Object.values(FAQ_CATEGORIES).map((category) => {
            const categoryItems = filteredItems.filter((item) => item.category === category);
            if (categoryItems.length === 0) return null;

            return (
              <section key={category} aria-labelledby={`faq-category-${categoryItems[0].id}`}>
                <h2 id={`faq-category-${categoryItems[0].id}`} className="mb-3 text-lg font-semibold">
                  {category}
                </h2>
                <div className="space-y-3">
                  {categoryItems.map((item) => {
                    const isOpen = openIds.has(item.id);
                    const buttonId = `faq-button-${item.id}`;
                    const panelId = `faq-panel-${item.id}`;

                    return (
                      <article key={item.id} className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-sm">
                        <h3>
                          <button
                            id={buttonId}
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => toggleItem(item.id)}
                            className="flex min-h-12 w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-medium outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5 sm:text-base"
                          >
                            <span className="min-w-0 break-words">{item.question}</span>
                            <ChevronDown
                              aria-hidden="true"
                              className={cn("size-5 shrink-0 transition-transform", isOpen && "rotate-180")}
                            />
                          </button>
                        </h3>
                        <div
                          id={panelId}
                          role="region"
                          aria-labelledby={buttonId}
                          hidden={!isOpen}
                          className="border-t px-4 py-4 text-sm leading-6 text-muted-foreground sm:px-5"
                        >
                          <p>{item.answer}</p>
                          {item.href && item.linkLabel && (
                            <Button asChild variant="link" className="mt-2 h-auto p-0">
                              <Link href={item.href}>{item.linkLabel}</Link>
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
