"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import type { ProfileUpdatePayload } from "@/types/auth";

interface UseProfileReturn {
  updateProfile: (data: ProfileUpdatePayload) => Promise<void>;
  isLoading: boolean;
}

/**
 * Hook para actualizar el perfil del usuario autenticado.
 * Solo funciona en cliente, requiere sesion activa.
 */
export function useProfile(): UseProfileReturn {
  const [isLoading, setIsLoading] = useState(false);
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);

  async function updateProfile(data: ProfileUpdatePayload): Promise<void> {
    if (!user) throw new Error("No hay usuario autenticado");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al actualizar perfil");
      const updated = await res.json();
      patchUser(updated);
    } finally {
      setIsLoading(false);
    }
  }

  return { updateProfile, isLoading };
}