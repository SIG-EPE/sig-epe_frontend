"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { resolvePostAuthDestination, sanitizeReturnTo } from "@/lib/auth/return-to";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  const [, startTransition] = useTransition();
  const user = useAuthStore((state) => state.user);
  const authSource = useAuthStore((state) => state.user?.authSource) ?? "LOCAL";

  // needsOnboarding: onboarding incompleto O email no seteado
  const needsOnboarding =
    user && (!user.onboardingCompleted || !user.email);

  useEffect(() => {
    if (user && !needsOnboarding) {
      startTransition(() => {
        router.push(
          resolvePostAuthDestination(returnTo, user.role?.code ?? "") as Parameters<
            typeof router.push
          >[0],
        );
      });
    }
  }, [user, needsOnboarding, returnTo, router]);

  if (!user || !needsOnboarding) {
    return null;
  }

  const displayName = `${user.firstName} ${user.lastName}`.trim() || "Usuario";

  return (
    <OnboardingForm
      epeUserName={displayName}
      authSource={authSource}
      returnTo={returnTo}
    />
  );
}
