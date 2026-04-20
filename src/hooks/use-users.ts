"use client";

import { useState, useEffect, useCallback } from "react";

import { api } from "@/lib/api-client";

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

// -------------------------------------------------------
// useUsers — paginated list
// -------------------------------------------------------

export function useUsers(page: number, limit: number) {
  const [data, setData] = useState<UsersListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<UsersListResponse>(
        `/users?page=${page}&limit=${limit}`,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar usuarios");
    } finally {
      setIsLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

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
    } finally {
      setIsLoading(false);
    }
  };

  return { createUser, isLoading };
}
