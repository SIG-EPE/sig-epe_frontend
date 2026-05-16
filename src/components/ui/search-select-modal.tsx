"use client";

import { useState } from "react";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// -------------------------------------------------------
// SearchSelectModal — componente genérico de búsqueda modal
// -------------------------------------------------------

interface SearchSelectModalProps<T> {
  // Trigger
  value: string | null;
  placeholder: string;
  displayValue?: string;
  disabled?: boolean;
  hasError?: boolean;

  // Modal
  title: string;
  items: T[];
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  getItemSubLabel?: (item: T) => string;
  searchPlaceholder?: string;
  testId?: string;

  // Callback
  onChange: (id: string | null) => void;
  onClear?: boolean;

  // Inline create
  onCreateNew?: (name: string) => Promise<{ id: string; name: string }>;
}

/** Elimina acentos y normaliza a minúsculas para búsqueda tolerante */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function SearchSelectModal<T>({
  value,
  placeholder,
  displayValue,
  disabled,
  hasError,
  title,
  items,
  getItemId,
  getItemLabel,
  getItemSubLabel,
  searchPlaceholder = "Buscar...",
  testId,
  onChange,
  onClear,
  onCreateNew,
}: SearchSelectModalProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [inlineValue, setInlineValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const filtered = (() => {
    if (!query.trim()) return items;
    const q = normalize(query);
    return items.filter((item) => {
      const labelMatch = normalize(getItemLabel(item)).includes(q);
      const subMatch = getItemSubLabel
        ? normalize(getItemSubLabel(item)).includes(q)
        : false;
      return labelMatch || subMatch;
    });
  })();

  const handleSelect = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("");
      setShowInlineCreate(false);
      setInlineValue("");
    }
    setOpen(next);
  };

  const handleInlineCreate = async () => {
    if (!onCreateNew || !inlineValue.trim()) return;
    setIsCreating(true);
    try {
      const created = await onCreateNew(inlineValue.trim());
      onChange(created.id);
      setOpen(false);
      setQuery("");
      setShowInlineCreate(false);
      setInlineValue("");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      {/* Trigger — aspecto de select nativo */}
      <button
        type="button"
        data-testid={testId}
        disabled={disabled}
        onClick={() => !disabled && setOpen(true)}
        className={[
          "flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-1 text-base shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          hasError ? "border-destructive" : "border-input",
        ].join(" ")}
      >
        <span className={value ? "text-foreground truncate" : "text-muted-foreground"}>
          {value && displayValue ? displayValue : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
      </button>

      {/* Modal de búsqueda */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          {/* Buscador */}
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="mt-1"
          />

          {/* Lista */}
          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border">
            {/* Opción limpiar */}
            {onClear && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 transition-colors border-b"
              >
                <span>— Sin selección —</span>
                {!value && <Check className="h-4 w-4 shrink-0" />}
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                Sin resultados para &ldquo;{query}&rdquo;
              </p>
            ) : (
              filtered.map((item) => {
                const id = getItemId(item);
                const label = getItemLabel(item);
                const subLabel = getItemSubLabel ? getItemSubLabel(item) : undefined;
                const isSelected = value === id;

                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={testId ? `${testId}-option` : undefined}
                    onClick={() => handleSelect(id)}
                    className={[
                      "w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors",
                      "hover:bg-muted/60",
                      isSelected ? "bg-muted font-medium" : "",
                    ].join(" ")}
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="truncate">{label}</span>
                      {subLabel && (
                        <span className="truncate text-xs text-muted-foreground">
                          {subLabel}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 ml-2 text-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Crear nuevo inline */}
          {onCreateNew && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full justify-start text-sm text-muted-foreground"
                onClick={() => setShowInlineCreate(true)}
              >
                <Plus className="mr-2 h-4 w-4" /> Crear nuevo...
              </Button>
              {showInlineCreate && (
                <div className="flex gap-2 mt-2">
                  <Input
                    autoFocus
                    placeholder="Nombre..."
                    value={inlineValue}
                    onChange={(e) => setInlineValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleInlineCreate()}
                  />
                  <Button size="sm" onClick={() => void handleInlineCreate()} disabled={isCreating}>
                    {isCreating ? "..." : "Crear"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowInlineCreate(false)}>✕</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
