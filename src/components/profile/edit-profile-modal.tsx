"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useAuthStore } from "@/stores/auth-store";
import { useUpdateMyProfile } from "@/hooks/use-users";
import {
  ONBOARDING_EMAIL_RECOMMENDATION_MESSAGE,
  isValidEmailFormat,
  shouldShowOnboardingEmailRecommendation,
} from "@/lib/onboarding-domain";
import { Button } from "@/components/ui/button";

interface EditProfileModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function EditProfileModal({ onClose, onSuccess }: EditProfileModalProps) {
  const user = useAuthStore((state) => state.user);
  const { updateMyProfile, isLoading } = useUpdateMyProfile();

  if (!user) return null;

  const isLocal = user.authSource === "LOCAL";

  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? "",
  });
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.email.trim().length > 0 && !isValidEmailFormat(form.email)) {
      setEmailError("Ingresa un correo válido");
      return;
    }

    setEmailError(null);

    try {
      await updateMyProfile({
        firstName: isLocal ? form.firstName : undefined,
        lastName: isLocal ? form.lastName : undefined,
        email: form.email || undefined,
      });
      toast.success("Perfil actualizado");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar perfil");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Editar perfil</h2>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {isLocal && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="edit-first-name" className="text-sm font-medium">Nombre</label>
                <input
                  id="edit-first-name"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="edit-last-name" className="text-sm font-medium">Apellido</label>
                <input
                  id="edit-last-name"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="edit-email" className="text-sm font-medium">Correo electronico</label>
            <input
              id="edit-email"
              type="email"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.email}
              onChange={(e) => {
                setForm((f) => ({ ...f, email: e.target.value }));
                setEmailError(null);
              }}
              placeholder="correo@ejemplo.com"
              aria-invalid={emailError ? "true" : "false"}
              required
            />
            {emailError ? (
              <p className="text-sm text-destructive">{emailError}</p>
            ) : shouldShowOnboardingEmailRecommendation(form.email) ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {ONBOARDING_EMAIL_RECOMMENDATION_MESSAGE}
              </p>
            ) : null}
          </div>

          {!isLocal && (
            <p className="text-xs text-muted-foreground">
              Los usuarios EPE no pueden cambiar nombre ni apellido (se sincronizan desde el sistema EPE).
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
