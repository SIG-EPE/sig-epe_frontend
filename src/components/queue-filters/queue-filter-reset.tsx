"use client";

import { Button } from "@/components/ui/button";

interface QueueFilterResetProps {
  message: string;
  onReset: () => void;
}

export function QueueFilterReset({ message, onReset }: QueueFilterResetProps) {
  return (
    <div className="space-y-3 rounded-md border border-destructive/40 p-4" role="alert">
      <p className="text-sm text-destructive">{message}</p>
      <Button type="button" size="sm" variant="outline" onClick={onReset}>
        Restablecer filtros
      </Button>
    </div>
  );
}
