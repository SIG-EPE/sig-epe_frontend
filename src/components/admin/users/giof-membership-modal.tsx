"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type UserDto, useSetGiofMembership } from "@/hooks/use-users";

interface GiofMembershipModalProps {
  user: UserDto;
  enabled: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function GiofMembershipModal({
  user,
  enabled,
  onClose,
  onSuccess,
}: GiofMembershipModalProps) {
  const { setGiofMembership, isLoading } = useSetGiofMembership();
  const actionLabel = enabled ? "Conceder rol GIOF" : "Retirar rol GIOF";

  const handleConfirm = async () => {
    try {
      await setGiofMembership(user.id, enabled);
      toast.success(enabled ? "Rol GIOF concedido" : "Rol GIOF retirado");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : enabled
            ? "Error al conceder el rol GIOF"
            : "Error al retirar el rol GIOF",
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent closeDisabled={isLoading}>
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>
            {enabled ? "Se concedera" : "Se retirara"} el rol GIOF a{" "}
            <strong className="text-foreground">
              {user.firstName} {user.lastName}
            </strong>
            . El backend validara nuevamente que la transicion siga permitida.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={enabled ? "default" : "destructive"}
            onClick={() => void handleConfirm()}
            disabled={isLoading}
          >
            {isLoading ? "Procesando..." : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
