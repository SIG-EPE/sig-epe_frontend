"use client";

import { toast } from "sonner";

import {
  useReactivateUser,
  type UserDto,
} from "@/hooks/use-users";
import { Button } from "@/components/ui/button";

interface ReactivateUserModalProps {
  user: UserDto;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReactivateUserModal({ user, onClose, onSuccess }: ReactivateUserModalProps) {
  const { reactivateUser, isLoading } = useReactivateUser();

  const handleConfirm = async () => {
    try {
      await reactivateUser(user.id);
      toast.success("Usuario reactivado");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reactivar");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold">Reactivar usuario</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          El usuario <strong>{user.firstName} {user.lastName}</strong> podra volver a iniciar sesion.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Reactivando..." : "Reactivar"}
          </Button>
        </div>
      </div>
    </div>
  );
}