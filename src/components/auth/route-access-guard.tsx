"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { getRoleHomePath } from "@/lib/auth/role-redirect";
import { canAccessRoute } from "@/lib/auth/route-access";
import { ROUTES } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

export function RouteAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const roleCode = user?.role?.code;
  const access = canAccessRoute(pathname, roleCode);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace(ROUTES.LOGIN);
      return;
    }

    if (access.isProtectedRoute && !access.isAllowed) {
      router.replace(getRoleHomePath(roleCode ?? "") as Parameters<typeof router.replace>[0]);
    }
  }, [access.isAllowed, access.isProtectedRoute, isLoading, roleCode, router, user]);

  if (isLoading || !user || (access.isProtectedRoute && !access.isAllowed)) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
