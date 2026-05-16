"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CatalogStatusBadgeProps {
  isActive: boolean;
  className?: string;
}

export function CatalogStatusBadge({ isActive, className }: CatalogStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        isActive
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-red-200 bg-red-50 text-red-700",
        className
      )}
    >
      {isActive ? "Activo" : "Inactivo"}
    </Badge>
  );
}
