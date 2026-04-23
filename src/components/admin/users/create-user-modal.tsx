"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  useCreateUser,
  type CreateUserPayload,
} from "@/hooks/use-users";
import { Button } from "@/components/ui/button";

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// Roles disponibles para creacion de usuarios
const ROLES = [
  { code: "SOLICITANTE_EPE", label: "Solicitante EPE" },
  { code: "PATROCINADOR", label: "Patrocinador" },
  { code: "GIOF_GESTOR", label: "GIOF Gestor" },
  { code: "AUDITOR_DIRECCION", label: "Auditor Direccion" },
  { code: "ADMIN_SISTEMA", label: "Admin Sistema" },
] as const;

export function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const { createUser, isLoading } = useCreateUser();
  const [form, setForm] = useState<CreateUserPayload>({
    firstName: "",
    lastName: "",
    epeDni: "",
    email: "",
    roleCode: "SOLICITANTE_EPE",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser({
        ...form,
        email: form.email?.trim() || undefined,
      });
      toast.success("Usuario creado exitosamente");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear usuario");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Agregar usuario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nombre *</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Apellido *</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">DNI EPE *</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.epeDni}
              onChange={(e) => setForm((f) => ({ ...f, epeDni: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Email (opcional)</label>
            <input
              type="email"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Rol *</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.roleCode}
              onChange={(e) => setForm((f) => ({ ...f, roleCode: e.target.value }))}
              required
            >
              {ROLES.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-muted-foreground">
            La contrasena temporal sera <strong>Temporal2030#</strong>. El usuario debera cambiarla en su primer acceso.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
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