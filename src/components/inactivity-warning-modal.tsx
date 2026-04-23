"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

interface InactivityWarningModalProps {
  open: boolean;
  remainingSeconds: number;
  onContinue: () => void;
  onLogout: () => void;
}

export function InactivityWarningModal({
  open,
  remainingSeconds,
  onContinue,
  onLogout,
}: InactivityWarningModalProps) {
  const [countdown, setCountdown] = useState(remainingSeconds);

  useEffect(() => {
    if (!open) return;
    setCountdown(remainingSeconds);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open, remainingSeconds]);

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="[&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Sesion por expirar</DialogTitle>
          <DialogDescription>
            Por inactividad, tu sesion expirara en{" "}
            <strong className="text-foreground">{timeStr}</strong>. Deseas
            continuar?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose className="bg-muted text-foreground hover:bg-muted/90 h-10 px-4 rounded-md">
            Mantener sesion
          </DialogClose>
          <button
            type="button"
            onClick={onLogout}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 rounded-md"
          >
            Cerrar sesion
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}