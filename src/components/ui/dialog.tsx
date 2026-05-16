import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog sub-components must be used within a Dialog");
  }
  return context;
}

// -------------------------------------------------------
// Dialog
// -------------------------------------------------------

interface DialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Dialog({ children, open: controlledOpen, onOpenChange }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (isControlled) {
        onOpenChange?.(newOpen);
      } else {
        setUncontrolledOpen(newOpen);
      }
    },
    [isControlled, onOpenChange],
  );

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
  children: React.ReactNode;
  className?: string;
}

export function DialogContent({ children, className }: DialogContentProps) {
  const { open, onOpenChange } = useDialogContext();

  React.useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Content */}
      <div
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
          "rounded-lg border bg-background p-6 shadow-lg",
          "flex flex-col gap-4",
          className,
        )}
        role="dialog"
        aria-modal="true"
      >
        {children}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "absolute right-4 top-4 h-8 w-8 p-0",
          )}
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

// -------------------------------------------------------
// DialogHeader
// -------------------------------------------------------

interface DialogHeaderProps {
  children: React.ReactNode;
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
  children: React.ReactNode;
  className?: string;
}

export function DialogTitle({ children, className }: DialogTitleProps) {
  return (
    <h2 className={cn("text-lg font-semibold", className)}>
      {children}
    </h2>
  );
}

// -------------------------------------------------------
// DialogDescription
// -------------------------------------------------------

interface DialogDescriptionProps {
  children: React.ReactNode;
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
  children: React.ReactNode;
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
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function DialogClose({ children, onClick, className }: DialogCloseProps) {
  const { onOpenChange } = useDialogContext();

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    onClick?.();
    onOpenChange(false);
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}