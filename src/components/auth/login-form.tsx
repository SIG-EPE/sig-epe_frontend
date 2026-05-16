"use client";

import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api, ApiRequestError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import {
  clearClientAuthSession,
  syncAuthSession,
  toSessionSyncInput,
} from "@/lib/auth/session-sync";
import { getRoleHomePath } from "@/lib/auth/role-redirect";
import type { LoginResponse } from "@/types/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// -------------------------------------------------------
// Validation schema
// -------------------------------------------------------

const loginSchema = z.object({
  identifier: z.string().min(1, "Ingresa tu DNI o correo electrónico"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// -------------------------------------------------------
// LoginForm component
// -------------------------------------------------------

interface LoginFormProps {
  ssoToken?: string;
}

export function LoginForm({ ssoToken }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(!!ssoToken);
  const isNavigating = useRef(false);

  // ── SSO auto-login ──────────────────────────────────────
  useEffect(() => {
    if (!ssoToken) return;

    let cancelled = false;

    async function cleanupPreviousSession() {
      // El handoff SSO es prioritario: antes de intercambiar el token,
      // quitamos cualquier usuario/token local para no conservar una sesión previa.
      clearClientAuthSession();

      try {
        await api.post("/auth/logout");
      } catch {
        // El backend logout es best-effort; la limpieza cliente/cookies debe ganar.
      } finally {
        // No llamar Server Actions desde el handoff SSO: Next las transporta como
        // POST a la URL actual (/login?token=...), lo que enmascara el intercambio
        // real y puede cancelar/remontar el flujo antes de llegar a /auth/sso.
        // El logout del backend revoca/expira la cookie httpOnly y ssoLogin vuelve
        // a revocar cualquier refresh previo recibido por cookie.
        clearClientAuthSession();
      }
    }

    async function doSsoLogin() {
      try {
        await cleanupPreviousSession();

        if (cancelled) return;

        const data = await api.get<LoginResponse>(`/auth/sso?token=${encodeURIComponent(ssoToken!)}`);

        if (cancelled) return;

        syncAuthSession(toSessionSyncInput(data));
        const normalizedUser = { ...data.user, role: data.user.roles?.[0] ?? data.user.role };
        const roleCode = normalizedUser.role?.code;
        const destination = data.onboardingRequired
          ? ROUTES.ONBOARDING
          : getRoleHomePath(roleCode ?? "");

        isNavigating.current = true;

        if (!data.onboardingRequired && !roleCode) {
          console.warn("[SSO] role code missing in response — falling back to /dashboard");
        }

        window.location.href = destination;
      } catch (error) {
        if (cancelled) return;
        clearClientAuthSession();
        setSsoLoading(false);

        if (error instanceof ApiRequestError && error.status === 401) {
          toast.error("El enlace de acceso es inválido o ya expiró. Iniciá sesión manualmente.");
        } else {
          toast.error("Error al procesar el acceso automático. Iniciá sesión manualmente.");
        }
      }
    }

    doSsoLogin();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ────────────────────────────────────────────────────────

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting || isNavigating.current;

  async function onSubmit(values: LoginFormValues) {
    if (ssoToken) return;

    try {
      const data = await api.post<LoginResponse>("/auth/login", values);

      syncAuthSession(toSessionSyncInput(data));
      const normalizedUser = { ...data.user, role: data.user.roles?.[0] ?? data.user.role };

      // Mark navigating BEFORE window.location.href so the button stays
      // disabled during the full page reload. react-hook-form's isSubmitting
      // resets to false when this async function returns, but the browser has
      // not yet left the page — the ref keeps the button disabled.
      isNavigating.current = true;

      // Use full page navigation so the browser sends the cookie in the very
      // first request and the Edge middleware can read it without timing issues.
      if (data.onboardingRequired) {
        window.location.href = ROUTES.ONBOARDING;
      } else {
        window.location.href = getRoleHomePath(normalizedUser.role?.code ?? "");
      }
    } catch (error) {
      // Navigation did not happen — reset the flag so the button re-enables
      isNavigating.current = false;

      if (error instanceof ApiRequestError) {
        if (error.status === 401) {
          toast.error("DNI o contraseña incorrectos");
        } else if (error.status === 403) {
          toast.error("Usuario inactivo o suspendido");
        } else {
          toast.error("Error al iniciar sesión. Intenta de nuevo.");
        }
      } else {
        toast.error("Error de conexión. Verifica tu red.");
      }
    }
  }

  return (
    <>
      {ssoLoading && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Iniciando sesión automáticamente…</p>
        </div>
      )}
      {!ssoLoading && (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-lg">
          Iniciar sesión
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Identifier field */}
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>DNI o correo electrónico</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: 12345678 o usuario@correo.com"
                      autoComplete="username"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Password field */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Tu contraseña"
                        autoComplete="current-password"
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword((prev) => !prev)}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        <span className="sr-only">
                          {showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        </span>
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ingresando…
                </>
              ) : (
                "Ingresar"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
      )}
    </>
  );
}
