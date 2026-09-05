"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId?: string;
  descriptionId?: string;
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
  closeDisabled?: boolean;
}

export function DialogContent({ children, className, closeDisabled = false }: DialogContentProps) {
  const { open, onOpenChange } = useDialogContext();
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const content = contentRef.current;
    const focusableSelector = [
      "button:not([disabled])",
      "[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusables = () => Array.from(content?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    const initialTarget = content?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? content;
    initialTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!closeDisabled) onOpenChangeRef.current(false);
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const targets = focusables();
      if (targets.length === 0) {
        event.preventDefault();
        content?.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [closeDisabled, mounted, open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex min-h-dvh w-screen items-center justify-center overflow-y-auto p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 min-h-dvh w-screen bg-black/50"
        onClick={() => {
          if (!closeDisabled) onOpenChange(false);
        }}
        aria-hidden="true"
      />
      {/* Content */}
      <div
        ref={contentRef}
        className={cn(
          "relative z-10 w-full max-w-lg",
          "rounded-lg border bg-background p-6 shadow-lg",
          "flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <DialogContext.Provider value={{ open, onOpenChange, titleId, descriptionId }}>
          {children}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={closeDisabled}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "absolute right-4 top-4 h-8 w-8 shrink-0 p-0",
            )}
            aria-label="Cerrar"
            aria-disabled={closeDisabled}
            title={closeDisabled ? "Espera a que termine la carga" : "Cerrar"}
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
    <div className={cn("shrink-0 flex flex-col gap-1.5 text-center sm:text-left", className)}>
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
  const { descriptionId } = useDialogContext();
  return (
    <p id={descriptionId} className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

interface DialogBodyProps {
  children: ReactNode;
  className?: string;
}

export function DialogBody({ children, className }: DialogBodyProps) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>
      {children}
    </div>
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
        "shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2",
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
