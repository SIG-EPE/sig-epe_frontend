"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api, ApiRequestError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import {
  syncAuthSession,
  toSessionSyncInput,
} from "@/lib/auth/session-sync";
import { startSsoExchange } from "@/lib/auth/sso-exchange";
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

const LOGIN_PHASE = {
  SSO_PENDING: "sso-pending",
  MANUAL_READY: "manual-ready",
  NAVIGATING: "navigating",
} as const;

type LoginPhase = (typeof LOGIN_PHASE)[keyof typeof LOGIN_PHASE];

export function LoginForm({ ssoToken }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<LoginPhase>(
    ssoToken ? LOGIN_PHASE.SSO_PENDING : LOGIN_PHASE.MANUAL_READY,
  );

  // ── SSO auto-login ──────────────────────────────────────
  useEffect(() => {
    if (!ssoToken) return;

    let cancelled = false;
    const exchange = startSsoExchange(ssoToken, api);

    async function doSsoLogin() {
      try {
        const data = await exchange;
        if (cancelled) return;

        syncAuthSession(toSessionSyncInput(data));
        const normalizedUser = { ...data.user, role: data.user.roles?.[0] ?? data.user.role };
        const roleCode = normalizedUser.role?.code;
        const destination = data.onboardingRequired
          ? ROUTES.ONBOARDING
          : getRoleHomePath(roleCode ?? "");

        setPhase(LOGIN_PHASE.NAVIGATING);

        if (!data.onboardingRequired && !roleCode) {
          console.warn("[SSO] role code missing in response — falling back to /dashboard");
        }

        window.location.href = destination;
      } catch (error) {
        if (cancelled) return;
        setPhase(LOGIN_PHASE.MANUAL_READY);

        if (error instanceof ApiRequestError) {
          const code = error.body.code;
          if (code === "SSO_INACTIVE") {
            toast.error("Tu usuario está inactivo o suspendido.");
          } else if (code === "SSO_BUSY") {
            toast.error("El acceso ya se está procesando. Intenta nuevamente en unos segundos.");
          } else if (code === "SSO_PROVISIONING_FAILED") {
            toast.error("No se pudo preparar tu acceso. Tu sesión anterior se conserva; inicia sesión manualmente.");
          } else if (code === "SSO_SESSION_PERSISTENCE_FAILED") {
            toast.error("No se pudo guardar la nueva sesión. Tu sesión anterior se conserva; inicia sesión manualmente.");
          } else if (code === "SSO_FINALIZE_FAILED") {
            toast.error("No se pudo finalizar el acceso automático. Tu sesión anterior se conserva; intenta nuevamente o inicia sesión manualmente.");
          } else if (
            error.status === 401 ||
            ["SSO_INVALID", "SSO_EXPIRED", "SSO_REPLAY"].includes(code ?? "")
          ) {
            toast.error("El enlace de acceso es inválido, expiró o ya fue utilizado. Inicia sesión manualmente.");
          } else {
            toast.error("Error al procesar el acceso automático. Tu sesión anterior se conserva; inicia sesión manualmente.");
          }
        } else {
          toast.error("Error de conexión al procesar el acceso automático. Tu sesión anterior se conserva.");
        }
      }
    }

    doSsoLogin();

    return () => {
      cancelled = true;
    };
    // The handoff is intentionally derived only from the initial server prop.
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

  const isSubmitting =
    form.formState.isSubmitting || phase === LOGIN_PHASE.NAVIGATING;

  async function onSubmit(values: LoginFormValues) {
    if (phase !== LOGIN_PHASE.MANUAL_READY) return;

    try {
      const data = await api.post<LoginResponse>("/auth/login", values);

      syncAuthSession(toSessionSyncInput(data));
      const normalizedUser = {
        ...data.user,
        role: data.user.roles?.[0] ?? data.user.role,
      };

      // Mark navigating BEFORE window.location.href so the button stays
      // disabled during the full page reload. react-hook-form's isSubmitting
      // resets to false when this async function returns, but the browser has
      // not yet left the page — the explicit phase keeps the button disabled.
      setPhase(LOGIN_PHASE.NAVIGATING);

      // Use full page navigation so the browser sends the cookie in the very
      // first request and the Edge middleware can read it without timing issues.
      if (data.onboardingRequired) {
        window.location.href = ROUTES.ONBOARDING;
      } else {
        window.location.href = getRoleHomePath(normalizedUser.role?.code ?? "");
      }
    } catch (error) {
      // Navigation did not happen — return to the operable manual phase.
      setPhase(LOGIN_PHASE.MANUAL_READY);

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
      {phase === LOGIN_PHASE.SSO_PENDING && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Iniciando sesión automáticamente…</p>
        </div>
      )}
      {phase !== LOGIN_PHASE.SSO_PENDING && (
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
