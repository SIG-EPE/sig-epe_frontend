"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api, ApiRequestError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ROUTES } from "@/lib/constants";
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

export function LoginForm() {
  const setAuth = useAuthStore((state) => state.setAuth);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: LoginFormValues) {
    try {
      const data = await api.post<LoginResponse>("/auth/login", values);

      const normalizedUser = { ...data.user, role: data.user.roles?.[0] ?? data.user.role };
      setAuth(normalizedUser, data.accessToken);

      // Set cookie so Next.js middleware (Edge Runtime) can verify the JWT.
      // The access token is already in Zustand memory; the cookie is needed
      // only for server-side route protection — not a security regression.
      document.cookie = `access_token=${data.accessToken}; path=/; SameSite=Strict`;

      // Use full page navigation so the browser sends the cookie in the very
      // first request and the Edge middleware can read it without timing issues.
      if (data.onboardingRequired) {
        window.location.href = ROUTES.ONBOARDING;
      } else {
        window.location.href = getRoleHomePath(normalizedUser.role?.code ?? "");
      }
    } catch (error) {
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
  );
}
