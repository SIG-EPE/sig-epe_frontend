"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  useCreateUser,
  type CreateUserPayload,
} from "@/hooks/use-users";
import { ROLE_CODE } from "@/lib/constants";
import { ROLE_CAPABILITY, hasRoleCapability } from "@/lib/role-capabilities";
import {
  EPE_DNI_LENGTH,
  optionalUserEmailSchema,
  sanitizeEpeDni,
} from "@/lib/user-validation";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// Roles disponibles para creacion de usuarios
const ROLES = [
  { code: ROLE_CODE.SOLICITANTE_EPE, label: "Solicitante EPE" },
  { code: ROLE_CODE.GIOF_GESTOR, label: "GIOF Gestor" },
  { code: ROLE_CODE.GIOF_MANAGER, label: "GIOF Manager" },
  { code: ROLE_CODE.AUDITOR_DIRECCION, label: "Auditor Dirección" },
  { code: ROLE_CODE.ADMIN_SISTEMA, label: "Admin Sistema" },
] as const;

const ROLE_LEVEL = {
  [ROLE_CODE.SOLICITANTE_EPE]: 1,
  [ROLE_CODE.AUDITOR_DIRECCION]: 2,
  [ROLE_CODE.GIOF_GESTOR]: 3,
  [ROLE_CODE.GIOF_MANAGER]: 4,
  [ROLE_CODE.ADMIN_SISTEMA]: 5,
} as const;

const INITIAL_FORM: CreateUserPayload = {
  firstName: "",
  lastName: "",
  epeDni: "",
  email: "",
  roleCode: ROLE_CODE.SOLICITANTE_EPE,
};

type CreateUserErrors = Partial<Record<keyof CreateUserPayload, string>>;

export function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const { createUser, isLoading } = useCreateUser();
  const actorRoleCode = useAuthStore((state) => state.user?.role?.code);
  const availableRoles = ROLES.filter((role) => {
    if (!hasRoleCapability(actorRoleCode, ROLE_CAPABILITY.USER_ADMIN)) return false;
    if (actorRoleCode === ROLE_CODE.ADMIN_SISTEMA) return true;
    if (!actorRoleCode || !(actorRoleCode in ROLE_LEVEL)) return false;

    return ROLE_LEVEL[role.code] < ROLE_LEVEL[actorRoleCode as keyof typeof ROLE_LEVEL];
  });
  const [form, setForm] = useState<CreateUserPayload>(INITIAL_FORM);
  const [errors, setErrors] = useState<CreateUserErrors>({});

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateForm = (): boolean => {
    const nextErrors: CreateUserErrors = {};
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const epeDni = sanitizeEpeDni(form.epeDni);
    const email = form.email?.trim() ?? "";

    if (!firstName) nextErrors.firstName = "Ingresa el nombre";
    if (!lastName) nextErrors.lastName = "Ingresa el apellido";
    if (!epeDni) {
      nextErrors.epeDni = "Ingresa el DNI EPE";
    } else if (epeDni.length !== EPE_DNI_LENGTH) {
      nextErrors.epeDni = `El DNI EPE debe tener ${EPE_DNI_LENGTH} dígitos`;
    }
    if (!form.roleCode) nextErrors.roleCode = "Selecciona un rol";
    if (email && !optionalUserEmailSchema.safeParse(email).success) {
      nextErrors.email = "Ingresa un correo válido";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      await createUser({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        epeDni: sanitizeEpeDni(form.epeDni),
        email: form.email?.trim().toLowerCase() || undefined,
        roleCode: form.roleCode,
      });
      toast.success("Usuario creado exitosamente");
      onSuccess();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear usuario");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Agregar usuario</h2>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="create-user-first-name">Nombre *</label>
              <input
                id="create-user-first-name"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.firstName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, firstName: e.target.value }));
                  setErrors((current) => ({ ...current, firstName: undefined }));
                }}
                aria-invalid={!!errors.firstName}
                aria-describedby={errors.firstName ? "create-user-first-name-error" : undefined}
              />
              {errors.firstName && (
                <p id="create-user-first-name-error" className="text-xs font-medium text-destructive">
                  {errors.firstName}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="create-user-last-name">Apellido *</label>
              <input
                id="create-user-last-name"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.lastName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, lastName: e.target.value }));
                  setErrors((current) => ({ ...current, lastName: undefined }));
                }}
                aria-invalid={!!errors.lastName}
                aria-describedby={errors.lastName ? "create-user-last-name-error" : undefined}
              />
              {errors.lastName && (
                <p id="create-user-last-name-error" className="text-xs font-medium text-destructive">
                  {errors.lastName}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="create-user-epe-dni">DNI EPE *</label>
            <input
              id="create-user-epe-dni"
              inputMode="numeric"
              maxLength={EPE_DNI_LENGTH}
              pattern="[0-9]*"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.epeDni}
              onChange={(e) => {
                setForm((f) => ({ ...f, epeDni: sanitizeEpeDni(e.target.value) }));
                setErrors((current) => ({ ...current, epeDni: undefined }));
              }}
              aria-invalid={!!errors.epeDni}
              aria-describedby={errors.epeDni ? "create-user-epe-dni-error" : undefined}
            />
            {errors.epeDni && (
              <p id="create-user-epe-dni-error" className="text-xs font-medium text-destructive">
                {errors.epeDni}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="create-user-email">Email (opcional)</label>
            <input
              id="create-user-email"
              type="email"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.email}
              onChange={(e) => {
                setForm((f) => ({ ...f, email: e.target.value }));
                setErrors((current) => ({ ...current, email: undefined }));
              }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "create-user-email-error" : undefined}
            />
            {errors.email && (
              <p id="create-user-email-error" className="text-xs font-medium text-destructive">
                {errors.email}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="create-user-role">Rol *</label>
            <select
              id="create-user-role"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.roleCode}
              onChange={(e) => {
                setForm((f) => ({ ...f, roleCode: e.target.value }));
                setErrors((current) => ({ ...current, roleCode: undefined }));
              }}
              aria-invalid={!!errors.roleCode}
              aria-describedby={errors.roleCode ? "create-user-role-error" : undefined}
            >
              {availableRoles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            {errors.roleCode && (
              <p id="create-user-role-error" className="text-xs font-medium text-destructive">
                {errors.roleCode}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            La contrasena temporal sera <strong>Temporal2030#</strong>. El usuario debera cambiarla en su primer acceso.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creando..." : "Crear usuario"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
