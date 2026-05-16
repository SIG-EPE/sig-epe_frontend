"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  useUpdateUser,
  type UserDto,
} from "@/hooks/use-users";
import { Button } from "@/components/ui/button";

interface EditUserModalProps {
  user: UserDto;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const { updateUser, isLoading } = useUpdateUser();
  const isLocal = user.authSource === "LOCAL";

  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLocal) {
        // LOCAL: puede editar todo
        await updateUser(user.id, {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || undefined,
        });
      } else {
        // EPE: solo email (nombre y apellido vienen del sistema EPE)
        await updateUser(user.id, {
          email: form.email || undefined,
        });
      }
      toast.success("Usuario actualizado");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar usuario");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Editar usuario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nombre *</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                disabled={!isLocal}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Apellido *</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                disabled={!isLocal}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="usuario@ejemplo.com"
            />
          </div>

          {!isLocal && (
            <p className="text-xs text-muted-foreground">
              Los usuarios EPE no pueden cambiar nombre ni apellido (se sincronizan desde el sistema EPE).
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}