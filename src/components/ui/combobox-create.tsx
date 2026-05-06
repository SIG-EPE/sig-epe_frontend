"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronsUpDown, Check, Plus, X } from "lucide-react";

// -------------------------------------------------------
// ComboboxCreate — combobox inline con opción de crear
// Para uso en campos de jerarquía (Componente, Acción Operativa)
// -------------------------------------------------------

interface ComboboxCreateProps<T> {
  value: string | null;
  placeholder?: string;
  displayValue?: string;
  disabled?: boolean;
  hasError?: boolean;

  items: T[];
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;

  onChange: (id: string | null) => void;
  /** Si se pasa, aparece "Agregar '[query]'" cuando no hay coincidencia exacta */
  onCreateNew?: (name: string) => Promise<{ id: string; name: string }>;
}

function normalize(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function ComboboxCreate<T>({
  value,
  placeholder = "Buscar o agregar...",
  displayValue,
  disabled,
  hasError,
  items,
  getItemId,
  getItemLabel,
  onChange,
  onCreateNew,
}: ComboboxCreateProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Foco en input al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = normalize(query);
    return items.filter((item) => normalize(getItemLabel(item)).includes(q));
  }, [items, query, getItemLabel]);

  // El query no coincide exactamente con ningún ítem existente
  const canCreate = useMemo(() => {
    if (!onCreateNew || !query.trim()) return false;
    const q = normalize(query.trim());
    return !items.some((item) => normalize(getItemLabel(item)) === q);
  }, [items, query, getItemLabel, onCreateNew]);

  const handleSelect = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const handleCreate = async () => {
    if (!onCreateNew || !query.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const created = await onCreateNew(query.trim());
      onChange(created.id);
      setOpen(false);
      setQuery("");
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    if (e.key === "Enter" && canCreate) { e.preventDefault(); void handleCreate(); }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(true)}
        className={[
          "flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-1 text-base shadow-sm transition-colors text-left",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          hasError ? "border-destructive" : "border-input",
        ].join(" ")}
      >
        <span className={value && displayValue ? "text-foreground truncate" : "text-muted-foreground truncate"}>
          {value && displayValue ? displayValue : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0 ml-2">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => e.key === "Enter" && handleClear(e as unknown as React.MouseEvent)}
              className="rounded p-0.5 hover:bg-muted/60 cursor-pointer"
            >
              <X className="h-3 w-3 opacity-50" />
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {/* Búsqueda */}
          <div className="border-b px-2 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Lista */}
          <div className="max-h-52 overflow-y-auto">
            {/* Limpiar selección */}
            {value && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="w-full flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 transition-colors border-b"
              >
                — Sin selección —
              </button>
            )}

            {filtered.map((item) => {
              const id = getItemId(item);
              const label = getItemLabel(item);
              const isSelected = value === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(id)}
                  className={[
                    "w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors",
                    isSelected ? "bg-muted font-medium" : "",
                  ].join(" ")}
                >
                  <span className="truncate">{label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 ml-2 text-primary" />}
                </button>
              );
            })}

            {filtered.length === 0 && !canCreate && (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                Sin resultados
              </p>
            )}
          </div>

          {/* Agregar nuevo */}
          {canCreate && (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={isCreating}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary border-t hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              <Plus className="h-4 w-4 shrink-0" />
              {isCreating ? "Agregando..." : `Agregar "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
