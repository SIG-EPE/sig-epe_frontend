"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordRule {
  label: string;
  met: boolean;
}

interface PasswordChecklistProps {
  password: string;
}

function getRules(password: string): PasswordRule[] {
  return [
    { label: "Mínimo 8 caracteres",           met: password.length >= 8 },
    { label: "Al menos una minúscula",         met: /[a-z]/.test(password) },
    { label: "Al menos una mayúscula",         met: /[A-Z]/.test(password) },
    { label: "Al menos un número",             met: /\d/.test(password) },
    { label: "Al menos un carácter especial",  met: /[^a-zA-Z0-9]/.test(password) },
  ];
}

const STRENGTH_CONFIG = [
  { label: "Muy débil", color: "bg-red-500" },
  { label: "Débil",     color: "bg-orange-500" },
  { label: "Regular",   color: "bg-orange-400" },
  { label: "Buena",     color: "bg-yellow-400" },
  { label: "Fuerte",    color: "bg-green-500" },
] as const;

export function PasswordChecklist({ password }: PasswordChecklistProps) {
  if (password.length === 0) return null;

  const rules = getRules(password);
  const metCount = rules.filter((r) => r.met).length;
  const strength = STRENGTH_CONFIG[metCount - 1] ?? null;

  return (
    <div className="mt-2 space-y-2.5">
      {/* Barra de seguridad */}
      <div className="space-y-1">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            role="meter"
            aria-valuemin={0}
            aria-valuemax={5}
            aria-valuenow={metCount}
            aria-label="Fortaleza de la contraseña"
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-in-out",
              metCount === 1 && "w-1/5 bg-red-500",
              metCount === 2 && "w-2/5 bg-orange-500",
              metCount === 3 && "w-3/5 bg-orange-400",
              metCount === 4 && "w-4/5 bg-yellow-400",
              metCount === 5 && "w-full bg-green-500",
            )}
          />
        </div>
        {strength && (
          <p
            className={cn(
              "text-xs font-medium transition-colors duration-300",
              metCount === 1 && "text-red-500",
              metCount === 2 && "text-orange-500",
              metCount === 3 && "text-orange-400",
              metCount === 4 && "text-yellow-500",
              metCount === 5 && "text-green-600",
            )}
          >
            {strength.label}
          </p>
        )}
      </div>

      {/* Checklist de reglas */}
      <ul
        aria-label="Requisitos de contraseña"
        aria-live="polite"
        aria-atomic="false"
        className="space-y-1"
      >
        {rules.map((rule) => (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-1.5 text-sm transition-colors duration-200",
              rule.met ? "text-green-600" : "text-red-500",
            )}
          >
            {rule.met ? (
              <CheckCircle2
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <XCircle
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
