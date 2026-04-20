import { AuthHydrationProvider } from "@/components/auth/auth-hydration-provider";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Enseña Perú logo + app name */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img
            src="/logo-ensena.svg"
            alt="Enseña Perú"
            width={72}
            height={80}
            className="h-20 w-auto object-contain"
          />
          <h1 className="text-xl font-bold text-foreground">SIG-EPE</h1>
          <p className="text-sm text-muted-foreground">
            Sistema Integrado de Gestión de Solicitudes
          </p>
        </div>

        <AuthHydrationProvider>{children}</AuthHydrationProvider>
      </div>
    </div>
  );
}
