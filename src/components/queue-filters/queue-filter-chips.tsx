"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface QueueFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface QueueFilterChipsProps {
  chips: readonly QueueFilterChip[];
  onClear: () => void;
}

export function QueueFilterChips({ chips, onClear }: QueueFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {chip.label}
          <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Quitar filtro ${chip.label}`} onClick={chip.onRemove}>
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
      {chips.length > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear} aria-label="Limpiar todos los filtros">
          Limpiar todos
        </Button>
      )}
    </div>
  );
}
