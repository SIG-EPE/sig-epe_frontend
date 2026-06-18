"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { normalizeAuthUser } from "@/lib/auth/session-sync";
import { useAuthStore } from "@/stores/auth-store";
import type { BackendAuthUser, ProfileUpdatePayload } from "@/types/auth";

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
      const updated = await api.patch<BackendAuthUser>("/auth/me", data);
      patchUser(normalizeAuthUser(updated));
    } finally {
      setIsLoading(false);
    }
  }

  return { updateProfile, isLoading };
}
