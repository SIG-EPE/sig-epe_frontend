import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <p className="text-xl text-muted-foreground">
        Página no encontrada
      </p>
      <Link
        href="/dashboard"
        className="mt-4 rounded-md bg-primary px-6 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Ir al inicio
      </Link>
    </div>
  );
}
