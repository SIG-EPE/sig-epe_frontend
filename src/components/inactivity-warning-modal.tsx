"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InactivityWarningModalProps {
  open: boolean;
  remainingSeconds: number;
  onContinue: () => void | Promise<void>;
  onLogout: () => void;
}

export function InactivityWarningModal({
  open,
  remainingSeconds,
  onContinue,
  onLogout,
}: InactivityWarningModalProps) {
  const [countdown, setCountdown] = useState(remainingSeconds);
  const logoutCalledRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    logoutCalledRef.current = false;
    const deadline = Date.now() + remainingSeconds * 1000;
    setCountdown(remainingSeconds);

    const interval = setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCountdown(secondsLeft);

      if (secondsLeft === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [open, remainingSeconds]);

  useEffect(() => {
    if (!open || countdown > 0 || logoutCalledRef.current) return;

    logoutCalledRef.current = true;
    onLogout();
  }, [open, countdown, onLogout]);

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
          <button
            type="button"
            onClick={onContinue}
            className="bg-muted text-foreground hover:bg-muted/90 h-10 rounded-md px-4"
          >
            Mantener sesion
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-4"
          >
            Cerrar sesion
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
