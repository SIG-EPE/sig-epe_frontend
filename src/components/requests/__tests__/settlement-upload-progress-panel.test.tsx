import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettlementUploadProgressPanel } from "@/components/requests/settlement-preparation/settlement-upload-progress-panel";
import type { RequestDocumentUploadQueueController } from "@/hooks/use-request-document-upload-queue";
import {
  REQUEST_DOCUMENT_UPLOAD_BATCH_STATE,
  REQUEST_DOCUMENT_UPLOAD_FILE_STATE,
  createRequestDocumentUploadQueueState,
  getRequestDocumentUploadQueueSummary,
  type RequestDocumentUploadQueueState,
} from "@/lib/request-document-upload-queue";
import { REQUEST_DOCUMENT_CATEGORY } from "@/types/requests";

function makeController(state: RequestDocumentUploadQueueState): RequestDocumentUploadQueueController {
  return {
    state,
    items: state.items,
    summary: getRequestDocumentUploadQueueSummary(state),
    isRunning: state.batchState === REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.RUNNING,
    isNavigationBlocked: true,
    enqueue: vi.fn(),
    start: vi.fn(),
    pauseAfterCurrent: vi.fn(),
    resume: vi.fn(),
    retry: vi.fn(),
    retryFailed: vi.fn(),
    remove: vi.fn(),
    minimize: vi.fn(),
    restore: vi.fn(),
    reset: vi.fn(),
  };
}

function makeState(overrides: Partial<RequestDocumentUploadQueueState> = {}): RequestDocumentUploadQueueState {
  return {
    ...createRequestDocumentUploadQueueState(),
    batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.RUNNING,
    items: [
      {
        id: "saved",
        file: new File(["ok"], "guardado.pdf", { type: "application/pdf" }),
        documentCategory: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
        state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.SAVED,
        retryable: false,
        hasPersistentWarning: false,
      },
      {
        id: "failed",
        file: new File(["error"], "fallido.pdf", { type: "application/pdf" }),
        documentCategory: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
        state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.ERROR,
        retryable: true,
        errorMessage: "Drive temporalmente limitado",
        hasPersistentWarning: false,
      },
      {
        id: "queued",
        file: new File(["queue"], "pendiente.pdf", { type: "application/pdf" }),
        documentCategory: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
        state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED,
        retryable: true,
        hasPersistentWarning: false,
      },
    ],
    ...overrides,
  };
}

describe("SettlementUploadProgressPanel", () => {
  it("muestra guardados/total, progreso por archivos, estados textuales y retry individual/global", async () => {
    const user = userEvent.setup();
    const controller = makeController(makeState({ batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.SETTLED }));
    render(<SettlementUploadProgressPanel queue={controller} />);

    expect(screen.getByRole("complementary", { name: "Progreso de carga de documentos" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1/3 archivos guardados");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("En cola")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Drive temporalmente limitado");

    await user.click(screen.getByRole("button", { name: "Reintentar fallido.pdf" }));
    expect(controller.retry).toHaveBeenCalledWith("failed");
    await user.click(screen.getByRole("button", { name: "Reintentar todos los errores" }));
    expect(controller.retryFailed).toHaveBeenCalledOnce();
  });

  it("minimiza sin perder errores y restaura desde launcher móvil/desktop", async () => {
    const user = userEvent.setup();
    const state = makeState();
    const controller = makeController(state);
    const { rerender } = render(<SettlementUploadProgressPanel queue={controller} />);

    await user.click(screen.getByRole("button", { name: "Minimizar progreso de carga" }));
    expect(controller.minimize).toHaveBeenCalledOnce();

    const minimizedController = makeController({ ...state, minimized: true });
    rerender(<SettlementUploadProgressPanel queue={minimizedController} />);
    const launcher = screen.getByRole("button", { name: "Abrir progreso de carga: 1 archivo con error" });
    expect(launcher).toHaveClass("fixed");
    expect(launcher).toHaveClass("min-h-11");
    await user.click(launcher);
    expect(minimizedController.restore).toHaveBeenCalledOnce();
  });

  it("ofrece pausa después del actual y reanudación sin prometer cancelar backend", async () => {
    const user = userEvent.setup();
    const runningController = makeController(makeState());
    const { rerender } = render(<SettlementUploadProgressPanel queue={runningController} />);

    await user.click(screen.getByRole("button", { name: "Pausar después del actual" }));
    expect(runningController.pauseAfterCurrent).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();

    const pausedController = makeController(makeState({ batchState: REQUEST_DOCUMENT_UPLOAD_BATCH_STATE.PAUSED }));
    rerender(<SettlementUploadProgressPanel queue={pausedController} />);
    await user.click(screen.getByRole("button", { name: "Continuar cargas" }));
    expect(pausedController.resume).toHaveBeenCalledOnce();
  });

  it("expone estructura móvil 320/375, live region moderada y movimiento reducido", () => {
    const state = makeState();
    const controller = makeController({
      ...state,
      items: state.items.map((item, index) => index === 2
        ? { ...item, state: REQUEST_DOCUMENT_UPLOAD_FILE_STATE.UPLOADING }
        : item),
    });
    render(<SettlementUploadProgressPanel queue={controller} />);

    const panel = screen.getByRole("complementary", { name: "Progreso de carga de documentos" });
    expect(panel).toHaveClass("max-md:w-full");
    expect(panel).toHaveClass("max-md:left-0");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemin", "0");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("motion-reduce:transition-none");
    expect(screen.getByText("Subiendo").querySelector("svg")).toHaveClass("motion-reduce:animate-none");
  });
});
