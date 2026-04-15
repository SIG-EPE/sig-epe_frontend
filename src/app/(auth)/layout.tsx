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
            src="/ensenia-logo.webp"
            alt="Enseña Perú"
            width={80}
            height={80}
            className="h-20 w-20"
          />
          <h1 className="text-xl font-bold text-foreground">SIG-EPE</h1>
          <p className="text-sm text-muted-foreground">
            Sistema Integrado de Gestión de Solicitudes
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}
