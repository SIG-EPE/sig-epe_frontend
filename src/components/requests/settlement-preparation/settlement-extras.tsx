"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SettlementExtrasProps {
  reference: string | null;
  optionalContent?: ReactNode;
  hasBlocker?: boolean;
}

export function SettlementExtras({ reference, optionalContent, hasBlocker = false }: SettlementExtrasProps) {
  const [isOpen, setIsOpen] = useState(hasBlocker);

  useEffect(() => {
    if (hasBlocker) setIsOpen(true);
  }, [hasBlocker]);

  return (
    <Card data-testid="settlement-extras">
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-full justify-between rounded-xl p-4 whitespace-normal"
        aria-expanded={isOpen}
        aria-controls="settlement-extras-content"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="text-left">
          <span className="block font-semibold">Extras</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {optionalContent ? "Referencia y contenido opcional" : "Referencia opcional de la operación"}
          </span>
        </span>
        <ChevronDown className={isOpen ? "rotate-180" : ""} aria-hidden="true" />
      </Button>
      <CardContent id="settlement-extras-content" className="space-y-4 p-4 pt-0" hidden={!isOpen}>
        <div>
          <p className="text-xs text-muted-foreground">Referencia de operación</p>
          <p className="text-sm font-medium">{reference?.trim() || "Sin referencia informada"}</p>
        </div>
        {optionalContent ? <div aria-label="Contenido opcional">{optionalContent}</div> : null}
      </CardContent>
    </Card>
  );
}
