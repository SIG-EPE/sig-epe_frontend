"use client";

import { useState } from "react";

import { useCachedResource } from "@/hooks/use-cached-resource";
import { api } from "@/lib/api-client";
import { QUERY_CACHE_TTL_MS } from "@/lib/query-cache";
import { QUERY_TAGS, invalidateUserDomain } from "@/lib/query-tags";
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
  const resource = useCachedResource<UsersListResponse>({
    key: [QUERY_TAGS.USERS, "list", { page, limit, search }],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.USERS],
    errorMessage: "Error al cargar usuarios",
    queryFn: () => {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      return api.get<UsersListResponse>(`/users?page=${page}&limit=${limit}${searchParam}`);
    },
  });
  const data = resource.data;

  return {
    users: data?.users ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    limit: data?.limit ?? limit,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error?.message ?? null,
    refetch: resource.refetch,
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
      invalidateUserDomain();
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { assignRole, isLoading };
}

// -------------------------------------------------------
// useSetGiofMembership
// -------------------------------------------------------

export function useSetGiofMembership() {
  const [isLoading, setIsLoading] = useState(false);

  const setGiofMembership = async (userId: string, enabled: boolean): Promise<void> => {
    setIsLoading(true);
    try {
      await api.patch(`/users/${userId}/giof-membership`, { enabled });
    } finally {
      invalidateUserDomain();
      setIsLoading(false);
    }
  };

  return { setGiofMembership, isLoading };
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
      invalidateUserDomain();
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
      invalidateUserDomain();
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
      invalidateUserDomain();
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
      invalidateUserDomain();
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
      invalidateUserDomain();
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
