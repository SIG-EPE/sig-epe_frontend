"use client";

import { toast } from "sonner";

import {
  useDeactivateUser,
  type UserDto,
} from "@/hooks/use-users";
import { Button } from "@/components/ui/button";

interface DeactivateUserModalProps {
  user: UserDto;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeactivateUserModal({ user, onClose, onSuccess }: DeactivateUserModalProps) {
  const { deactivateUser, isLoading } = useDeactivateUser();

  const handleConfirm = async () => {
    try {
      await deactivateUser(user.id);
      toast.success("Usuario desactivado");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold">Desactivar usuario</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          ¿Desactivar a <strong>{user.firstName} {user.lastName}</strong>? El usuario no podra iniciar sesion hasta que sea reactivado.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Desactivando..." : "Desactivar"}
          </Button>
        </div>
      </div>
    </div>
  );
}