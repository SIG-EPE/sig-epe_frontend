import type { Metadata } from "next";
import LoginPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Iniciar sesion | SIG-EPE",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; token?: string }>;
}) {
  const { reason, token } = await searchParams;
  return <LoginPageClient reason={reason} ssoToken={token} />;
}
