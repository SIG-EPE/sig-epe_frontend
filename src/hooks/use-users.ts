"use client";

import { useState, useEffect, useCallback } from "react";

import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { ProfileUpdatePayload } from "@/types/auth";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface UserDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  epeDni: string | null;
  isActive: boolean;
  onboardingCompleted: boolean;
  authSource: string;
  roles: { code: string; name: string }[];
  createdAt: string;
}

export interface UsersListResponse {
  users: UserDto[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  epeDni: string;
  email?: string;
  roleCode: string;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
}

// -------------------------------------------------------
// useUsers — paginated list
// -------------------------------------------------------

export function useUsers(page: number, limit: number, search?: string) {
  const [data, setData] = useState<UsersListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wait for auth hydration before fetching — accessToken is null until
  // useAuthHydration resolves /auth/me and calls setAuth (isLoading → false).
  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      const result = await api.get<UsersListResponse>(
        `/users?page=${page}&limit=${limit}${searchParam}`,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar usuarios");
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    // Don't fetch until auth store is hydrated (token is available).
    // We include accessToken in deps so the fetch triggers as soon as the
    // token is set by useAuthHydration (e.g. after SSR pre-hydration fills
    // user but leaves accessToken null until the client-side effect runs).
    if (authIsLoading || !accessToken) return;
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, authIsLoading, accessToken]);

  return {
    users: data?.users ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    limit: data?.limit ?? limit,
    isLoading,
    error,
    refetch,
  };
}

// -------------------------------------------------------
// useAssignRole
// -------------------------------------------------------

export function useAssignRole() {
  const [isLoading, setIsLoading] = useState(false);

  const assignRole = async (userId: string, roleCode: string): Promise<void> => {
    setIsLoading(true);
    try {
      await api.patch(`/users/${userId}/role`, { roleCode });
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { assignRole, isLoading };
}

// -------------------------------------------------------
// useDeactivateUser
// -------------------------------------------------------

export function useDeactivateUser() {
  const [isLoading, setIsLoading] = useState(false);

  const deactivateUser = async (userId: string): Promise<void> => {
    setIsLoading(true);
    try {
      await api.delete(`/users/${userId}`);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { deactivateUser, isLoading };
}

// -------------------------------------------------------
// useCreateUser
// -------------------------------------------------------

export function useCreateUser() {
  const [isLoading, setIsLoading] = useState(false);

  const createUser = async (dto: CreateUserPayload): Promise<void> => {
    setIsLoading(true);
    try {
      await api.post("/users", dto);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { createUser, isLoading };
}

// -------------------------------------------------------
// useUpdateUser
// -------------------------------------------------------

export function useUpdateUser() {
  const [isLoading, setIsLoading] = useState(false);

  const updateUser = async (userId: string, dto: UpdateUserPayload): Promise<void> => {
    setIsLoading(true);
    try {
      await api.patch(`/users/${userId}`, dto);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateUser, isLoading };
}

// -------------------------------------------------------
// useReactivateUser
// -------------------------------------------------------

export function useReactivateUser() {
  const [isLoading, setIsLoading] = useState(false);

  const reactivateUser = async (userId: string): Promise<void> => {
    setIsLoading(true);
    try {
      await api.patch(`/users/${userId}/reactivate`);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { reactivateUser, isLoading };
}

// -------------------------------------------------------
// useResetPassword
// -------------------------------------------------------

export function useResetPassword() {
  const [isLoading, setIsLoading] = useState(false);

  const resetPassword = async (userId: string): Promise<void> => {
    setIsLoading(true);
    try {
      await api.post(`/users/${userId}/reset-password`);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { resetPassword, isLoading };
}

// -------------------------------------------------------
// useUpdateMyProfile — actualiza el perfil del usuario
// que tiene la sesion activa (no es admin).
// -------------------------------------------------------

export function useUpdateMyProfile() {
  const [isLoading, setIsLoading] = useState(false);
  const patchUser = useAuthStore((s) => s.patchUser);

  const updateMyProfile = async (data: ProfileUpdatePayload): Promise<void> => {
    setIsLoading(true);
    try {
      const updated = await api.patch<{ id: string; firstName: string; lastName: string; email: string | null }>(
        "/auth/profile",
        data,
      );
      patchUser(updated);
    } finally {
      setIsLoading(false);
    }
  };

  return { updateMyProfile, isLoading };
}
