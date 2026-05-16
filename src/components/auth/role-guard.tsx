"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { getRoleHomePath } from "@/lib/auth/role-redirect";
import type { RoleCode } from "@/lib/constants";
import { ROUTES } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

interface RoleGuardProps {
  allowedRoles: RoleCode[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const roleCode = user?.role?.code as RoleCode | undefined;
  const isAllowed = Boolean(roleCode && allowedRoles.includes(roleCode));

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace(ROUTES.LOGIN);
      return;
    }

    if (!isAllowed && roleCode) {
      router.replace(getRoleHomePath(roleCode) as Parameters<typeof router.replace>[0]);
    }
  }, [isAllowed, isLoading, roleCode, router, user]);

  if (isLoading || !user || !isAllowed) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
