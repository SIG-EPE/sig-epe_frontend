"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api, ApiRequestError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { getRoleHomePath } from "@/lib/auth/role-redirect";
import type { LoginResponse } from "@/types/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
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

import { Mail, ShieldCheck, Bell } from "lucide-react";

// -------------------------------------------------------
// Validation schemas — conditional by authSource
// -------------------------------------------------------

const epeSchema = z.object({
  email: z
    .string()
    .min(1, "Ingresa tu correo electrónico")
    .email("Ingresa un correo válido"),
});

const localSchema = z
  .object({
    email: z
      .string()
      .min(1, "Ingresa tu correo electrónico")
      .email("Ingresa un correo válido"),
    newPassword: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Debe incluir mayúscula, minúscula y número",
      ),
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type EpeFormValues = z.infer<typeof epeSchema>;
type LocalFormValues = z.infer<typeof localSchema>;
type OnboardingFormValues = EpeFormValues | LocalFormValues;

// -------------------------------------------------------
// OnboardingForm component
// -------------------------------------------------------

interface OnboardingFormProps {
  epeUserName: string;
  authSource: "LOCAL" | "EPE";
}

export function OnboardingForm({
  epeUserName,
  authSource,
}: OnboardingFormProps) {
  const setAuth = useAuthStore((state) => state.setAuth);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isLocal = authSource === "LOCAL";
  const schema = isLocal ? localSchema : epeSchema;

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: isLocal
      ? { email: "", newPassword: "", confirmPassword: "" }
      : { email: "" },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: OnboardingFormValues) {
    try {
      const payload: Record<string, string> = { email: values.email };

      if (isLocal && "newPassword" in values) {
        payload.newPassword = values.newPassword;
        payload.confirmPassword = values.confirmPassword;
      }

      const data = await api.post<LoginResponse>("/auth/onboarding", payload);

      const normalizedUser = { ...data.user, role: data.user.roles?.[0] ?? data.user.role };
      setAuth(normalizedUser, data.accessToken);

      // Set cookie so Next.js middleware (Edge Runtime) can verify the new JWT
      // with scope=full. Without this, the middleware still reads the old
      // scope=onboarding token and redirects back to /onboarding in a loop.
      document.cookie = `access_token=${data.accessToken}; path=/; SameSite=Strict; Max-Age=900`;

      toast.success("¡Perfil configurado exitosamente!");

      // Use full page navigation so the browser sends the updated cookie in the
      // very first request and the Edge middleware can read it without timing issues.
      window.location.href = getRoleHomePath(normalizedUser.role?.code ?? "");
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.status === 409) {
          toast.error("Este correo ya está en uso");
        } else {
          toast.error("Error al configurar tu perfil. Intenta de nuevo.");
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
          Bienvenido/a, {epeUserName}
        </CardTitle>
        <CardDescription className="text-center">
          {isLocal
            ? "Configura tu correo y establece tu contraseña de acceso al SIG-EPE"
            : "Configura tu correo electrónico para recibir notificaciones y gestionar tu cuenta"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Why email matters */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
          <p className="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200">
            ¿Por qué es obligatorio el correo?
          </p>
          <ul className="space-y-1.5 text-sm text-blue-700 dark:text-blue-300">
            <li className="flex items-start gap-2">
              <Bell className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Recibirás notificaciones sobre tus solicitudes y pagos</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Te permite recuperar tu contraseña si la olvidas</span>
            </li>
            <li className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Es el canal oficial de comunicación del equipo GIOF contigo
              </span>
            </li>
          </ul>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Email field */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo electrónico</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="usuario@correo.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Password fields — only for LOCAL users */}
            {isLocal && (
              <>
                {/* New password field */}
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nueva contraseña</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showNewPassword ? "text" : "password"}
                            placeholder="Mínimo 8 caracteres"
                            autoComplete="new-password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setShowNewPassword((prev) => !prev)
                            }
                            tabIndex={-1}
                          >
                            {showNewPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            <span className="sr-only">
                              {showNewPassword ? "Ocultar" : "Mostrar"}{" "}
                              contraseña
                            </span>
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Confirm password field */}
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar contraseña</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Repite tu contraseña"
                            autoComplete="new-password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setShowConfirmPassword((prev) => !prev)
                            }
                            tabIndex={-1}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            <span className="sr-only">
                              {showConfirmPassword ? "Ocultar" : "Mostrar"}{" "}
                              contraseña
                            </span>
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* Submit button */}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Configurando…
                </>
              ) : (
                "Configurar acceso"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
