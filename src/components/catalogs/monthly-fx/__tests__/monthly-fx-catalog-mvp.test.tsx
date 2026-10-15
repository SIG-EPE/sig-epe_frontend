import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CatalogsPage from "@/app/(app)/catalogs/page";
import { ROLE_CODE } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import type { MonthlyFxMonth } from "@/types/monthly-fx";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn<typeof fetch>();
let rows: MonthlyFxMonth[];
let denial: number | null;
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(
  status === 200 ? { data, meta: { timestamp: "2026-10-08" } } : {
    statusCode: status, message: "Frozen", error: "Conflict", timestamp: "2026-10-08", path: "/catalogs/monthly-fx/rates",
  }), { status, headers: { "Content-Type": "application/json" } });

function login(role = ROLE_CODE.GIOF_MANAGER as string) {
  useAuthStore.getState().setAuth({ id: "manager", firstName: "M", lastName: "G", email: null,
    documentNumber: "1", onboardingCompleted: true, authSource: "LOCAL", role: { code: role, name: role } }, "token");
}

async function openCatalog() {
  render(<CatalogsPage />);
  await screen.findByText("3.75", { selector: "td" });
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Año"));
  await user.type(screen.getByLabelText("Año"), "2026");
  return user;
}

describe("catálogo real → API real → fetch de cierre", () => {
  beforeEach(() => {
    rows = [{ year: 2026, month: 1, referenceRate: "3.75", closeRate: null }];
    denial = null;
    vi.clearAllMocks();
    login();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset().mockImplementation(async (url, options) => {
      const path = String(url);
      if (options?.method === "GET" && path.endsWith("/policy")) return reply({ active: false });
      if (options?.method === "GET" && path.endsWith("/rates")) return reply(rows);
      if (options?.method === "PUT" || path.endsWith("/rates/close")) {
        if (denial) return reply(null, denial);
        const body = JSON.parse(String(options?.body)) as Record<string, string>;
        rows = [{ ...rows[0], ...(options?.method === "PUT" ? { referenceRate: body.referenceRate } : { closeRate: body.closeRate }) }];
        return reply(rows[0]);
      }
      throw new Error(`Unexpected fetch: ${path}`);
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().clearAuth(); });

  it("publica solo tras confirmar, conserva decimal exacto con coma y relee estado", async () => {
    const user = await openCatalog();
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), "999999999999,123456789012");
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/irreversible/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/USD.*no cambian/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Confirmar cierre" }));
    await screen.findByText("Cerrado");
    const posts = fetchMock.mock.calls.filter(([, o]) => o?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(String(posts[0][0])).toMatch(/\/catalogs\/monthly-fx\/rates\/close$/);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ year: 2026, month: 1, closeRate: "999999999999.123456789012" });
    expect(new Headers(posts[0][1]?.headers).get("Authorization")).toBe("Bearer token");
    expect(screen.queryByRole("button", { name: /activar/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("/catalogs/monthly-fx/"))).toBe(true);
  });

  it("edita referencia distinta mediante PUT y muestra solo el GET posterior", async () => {
    const user = await openCatalog();
    await user.type(screen.getByLabelText("TC referencial (PEN por USD)"), "3,812345678901");
    await user.click(screen.getByRole("button", { name: "Editar referencia" }));
    await screen.findByText("3.81");
    const put = fetchMock.mock.calls.find(([, o]) => o?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ year: 2026, month: 1, referenceRate: "3.812345678901" });
  });

  it("409 congela por mensaje del servidor, conserva entrada y no reintenta", async () => {
    denial = 409;
    const user = await openCatalog();
    await user.type(screen.getByLabelText("TC referencial (PEN por USD)"), "3.8");
    await user.click(screen.getByRole("button", { name: "Editar referencia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/congelada/i);
    expect(screen.getByLabelText("TC referencial (PEN por USD)")).toHaveValue("3.8");
    expect(screen.getByText("3.75", { selector: "td" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === "PUT")).toHaveLength(1);
  });

  it.each([ROLE_CODE.GIOF_GESTOR, ROLE_CODE.ADMIN_SISTEMA, ""]) ("no muestra controles ni consulta para %s", async (role) => {
    if (role) login(role); else useAuthStore.getState().clearAuth();
    render(<CatalogsPage />);
    expect(screen.queryByLabelText(/TC de cierre/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancelar no publica; referencia ausente bloquea cierre sin inventar uso financiero", async () => {
    const user = await openCatalog();
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), "3.8");
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await user.selectOptions(screen.getByLabelText("Mes"), "2");
    expect(screen.getByRole("button", { name: "Publicar cierre" })).toBeDisabled();
    expect(screen.getByText(/configura primero la referencia/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
  });

  it("ignora respuesta de cierre tras logout y no inicia recarga", async () => {
    const user = await openCatalog();
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), "3.8");
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar cierre" }));
    const count = fetchMock.mock.calls.length;
    act(() => useAuthStore.getState().clearAuth());
    await act(async () => resolve(reply({ ...rows[0], closeRate: "3.8" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(count);
    expect(screen.queryByLabelText(/TC de cierre/)).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("GET cerrado muestra tasa inmutable sin acción de replay ni POST", async () => {
    rows[0].closeRate = "3.8";
    const user = await openCatalog();
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), "3,800000000000");
    expect(screen.getByLabelText("TC de cierre (PEN por USD)")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("TC de cierre (PEN por USD)")).toHaveValue("3.80");
    expect(screen.queryByRole("button", { name: /Publicar cierre|Reintentar cierre/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("3.80", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByLabelText("TC referencial (PEN por USD)")).toBeDisabled();
    expect(screen.getByText(/Política mensual OFF/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
  });

  it.each([404, 409, 403, 503])("error de cierre %s conserva entrada y estado real, sin POST automático", async (status) => {
    denial = status;
    const user = await openCatalog();
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), "3,8");
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar cierre" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(status === 409 ? /inmutable/i : status === 404 ? /referencia no disponible/i : status === 403 ? /permiso/i : /no se pudo/i);
    expect(screen.getByLabelText("TC de cierre (PEN por USD)")).toHaveValue("3,8");
    expect(screen.queryByText("Cerrado")).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1);
  });

  it("no finaliza optimistamente y bloquea doble envío durante publicación", async () => {
    const user = await openCatalog();
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), "3.8");
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar cierre" }));
    expect(screen.getByRole("button", { name: "Publicando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publicando…" })).toHaveClass("bg-primary", "disabled:opacity-50");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveClass("border", "bg-background");
    expect(screen.getByLabelText("Año")).toBeDisabled();
    expect(screen.getByLabelText("Mes")).toBeDisabled();
    expect(screen.queryByText("Cerrado")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publicando…" }));
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1);
    rows[0].closeRate = "3.8";
    await act(async () => resolve(reply(rows[0])));
    await screen.findByText("Cerrado");
  });

  it("conflicto seguido de GET cerrado sustituye entrada por cierre inmutable", async () => {
    denial = 409;
    const user = await openCatalog();
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), "3.9");
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    rows[0].closeRate = "3.8";
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar cierre" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/inmutable/i);
    await screen.findByText("Cerrado");
    expect(screen.getByText("3.80", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByLabelText("TC de cierre (PEN por USD)")).toHaveValue("3.80");
    expect(screen.getByLabelText("TC de cierre (PEN por USD)")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /Publicar cierre|Reintentar cierre/ })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1);
  });

  it("respuesta perdida permite reenvío manual idéntico antes del GET cerrado", async () => {
    const user = await openCatalog();
    fetchMock.mockImplementationOnce(async () => {
      rows[0].closeRate = "3.785";
      return reply(null, 503);
    });
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), "3.785");
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    await user.click(screen.getByRole("button", { name: "Confirmar cierre" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Cerrado")).not.toBeInTheDocument();
    expect(screen.getByLabelText("TC de cierre (PEN por USD)")).toHaveValue("3.785");
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1);
    fetchMock.mockImplementationOnce(async () => reply(rows[0]));
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    await user.click(screen.getByRole("button", { name: "Confirmar cierre" }));
    await screen.findByText("Cerrado");
    const posts = fetchMock.mock.calls.filter(([, o]) => o?.method === "POST");
    expect(posts).toHaveLength(2);
    for (const [, options] of posts) {
      expect(JSON.parse(String(options?.body))).toEqual({ year: 2026, month: 1, closeRate: "3.785" });
    }
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/reintento idéntico no genera cambios/i));
    expect(screen.getByLabelText("TC de cierre (PEN por USD)")).toHaveValue("3.79");
    expect(screen.queryByRole("button", { name: /Publicar cierre|Reintentar cierre/ })).not.toBeInTheDocument();
  });

  it.each(["0", "1000000000000", "3.1234567890123", "1e3"])("validación UI rechaza %s sin confirmación ni POST", async (rate) => {
    const user = await openCatalog();
    await user.type(screen.getByLabelText("TC de cierre (PEN por USD)"), rate);
    await user.click(screen.getByRole("button", { name: "Publicar cierre" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/positivo/i);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
  });
});
