"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { ROUTES } from "@/lib/constants";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export default function OnboardingPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (user?.onboardingCompleted) {
      router.push(ROUTES.DASHBOARD);
    }
  }, [user, router]);

  // While user loads or if already onboarded, show nothing
  if (!user || user.onboardingCompleted) {
    return null;
  }

  // Build display name from user fields
  const displayName = `${user.firstName} ${user.lastName}`.trim() || "Usuario";

  return <OnboardingForm epeUserName={displayName} />;
}
