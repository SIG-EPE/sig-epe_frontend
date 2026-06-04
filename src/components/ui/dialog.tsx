"use client";

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId?: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog sub-components must be used within a Dialog");
  }
  return context;
}

// -------------------------------------------------------
// Dialog
// -------------------------------------------------------

interface DialogProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Dialog({ children, open: controlledOpen, onOpenChange }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  function handleOpenChange(newOpen: boolean) {
    if (isControlled) {
      onOpenChange?.(newOpen);
    } else {
      setUncontrolledOpen(newOpen);
    }
  }

  return (
    <DialogContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

// -------------------------------------------------------
// DialogContent
// -------------------------------------------------------

interface DialogContentProps {
  children: ReactNode;
  className?: string;
}

export function DialogContent({ children, className }: DialogContentProps) {
  const { open, onOpenChange } = useDialogContext();
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onOpenChange]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex min-h-dvh w-screen items-center justify-center overflow-y-auto p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 min-h-dvh w-screen bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Content */}
      <div
        className={cn(
          "relative z-10 w-full max-w-lg",
          "rounded-lg border bg-background p-6 shadow-lg",
          "flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <DialogContext.Provider value={{ open, onOpenChange, titleId }}>
          {children}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "absolute right-4 top-4 h-8 w-8 shrink-0 p-0",
            )}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogContext.Provider>
      </div>
    </div>,
    document.body,
  );
}

// -------------------------------------------------------
// DialogHeader
// -------------------------------------------------------

interface DialogHeaderProps {
  children: ReactNode;
  className?: string;
}

export function DialogHeader({ children, className }: DialogHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)}>
      {children}
    </div>
  );
}

// -------------------------------------------------------
// DialogTitle
// -------------------------------------------------------

interface DialogTitleProps {
  children: ReactNode;
  className?: string;
}

export function DialogTitle({ children, className }: DialogTitleProps) {
  const { titleId } = useDialogContext();

  return (
    <h2 id={titleId} className={cn("text-lg font-semibold", className)}>
      {children}
    </h2>
  );
}

// -------------------------------------------------------
// DialogDescription
// -------------------------------------------------------

interface DialogDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function DialogDescription({ children, className }: DialogDescriptionProps) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

// -------------------------------------------------------
// DialogFooter
// -------------------------------------------------------

interface DialogFooterProps {
  children: ReactNode;
  className?: string;
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

// -------------------------------------------------------
// DialogClose
// -------------------------------------------------------

interface DialogCloseProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function DialogClose({ children, onClick, className }: DialogCloseProps) {
  const { onOpenChange } = useDialogContext();

  function handleClick() {
    onClick?.();
    onOpenChange(false);
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
