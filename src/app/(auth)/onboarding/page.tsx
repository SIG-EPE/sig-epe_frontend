"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { getRoleHomePath } from "@/lib/auth/role-redirect";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export default function OnboardingPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authSource = useAuthStore((state) => state.user?.authSource) ?? "EPE";

  // needsOnboarding: onboarding incompleto O email no seteado
  const needsOnboarding =
    user && (!user.onboardingCompleted || !user.email);

  useEffect(() => {
    if (user && !needsOnboarding) {
      router.push(getRoleHomePath(user.role?.code ?? ""));
    }
  }, [user, needsOnboarding, router]);

  if (!user || !needsOnboarding) {
    return null;
  }

  const displayName = `${user.firstName} ${user.lastName}`.trim() || "Usuario";

  return <OnboardingForm epeUserName={displayName} authSource={authSource} />;
}
