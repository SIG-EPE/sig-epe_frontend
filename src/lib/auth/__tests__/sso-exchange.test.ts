import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetSsoExchangeStateForTests,
  startSsoExchange,
  stripSsoTokenFromHistory,
} from "../sso-exchange";

describe("sso-exchange", () => {
  beforeEach(() => {
    resetSsoExchangeStateForTests();
    window.history.replaceState(null, "", "/login?token=secret&reason=test");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("elimina el token de URL e historial sin navegar", () => {
    const replaceState = vi.spyOn(History.prototype, "replaceState");
    stripSsoTokenFromHistory();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/login");
    expect(window.location.href).not.toContain("secret");
    expect(JSON.stringify(window.history.state ?? {})).not.toContain("secret");
  });

  it("mantiene single-flight para Strict Mode, remount y doble efecto", async () => {
    const response = { accessToken: "access" } as never;
    const api = { get: vi.fn().mockResolvedValue(response) };

    const first = startSsoExchange("same-token", api);
    const remount = startSsoExchange("same-token", api);

    expect(api.get).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe(response);
    await expect(remount).resolves.toBe(response);
    expect(first).toBe(remount);
  });

  it("does not expose a global stale-generation business guard", () => {
    const api = { get: vi.fn().mockReturnValue(new Promise(() => undefined)) };
    const attemptA = startSsoExchange("token-a", api);
    const attemptB = startSsoExchange("token-b", api);

    expect(attemptA).toBeInstanceOf(Promise);
    expect(attemptB).toBeInstanceOf(Promise);
    expect("isCurrent" in attemptA).toBe(false);
    expect("isCurrent" in attemptB).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("reintenta una vez un fallo transitorio con la misma clave idempotente", async () => {
    const api = {
      get: vi
        .fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValueOnce({ accessToken: "recovered" }),
    };

    const attempt = startSsoExchange("retry-token", api);
    await expect(attempt).resolves.toMatchObject({ accessToken: "recovered" });
    expect(api.get).toHaveBeenCalledTimes(2);
    const firstOptions = api.get.mock.calls[0][1];
    const secondOptions = api.get.mock.calls[1][1];
    expect(secondOptions).toEqual(firstOptions);
  });

  it("respeta Retry-After para SSO_BUSY y conserva la correlación del intento", async () => {
    vi.useFakeTimers();
    const busyError = {
      status: 409,
      body: { code: "SSO_BUSY" },
      headers: new Headers({ "Retry-After": "2" }),
    };
    const api = {
      get: vi
        .fn()
        .mockRejectedValueOnce(busyError)
        .mockResolvedValueOnce({ accessToken: "recovered" }),
    };

    const attempt = startSsoExchange("busy-token", api);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(api.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(attempt).resolves.toMatchObject({ accessToken: "recovered" });
    expect(api.get).toHaveBeenCalledTimes(2);

    const firstOptions = api.get.mock.calls[0][1] as RequestInit;
    const secondOptions = api.get.mock.calls[1][1] as RequestInit;
    expect(secondOptions).toBe(firstOptions);
    expect(firstOptions.headers).toEqual({
      "Idempotency-Key": expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      "X-Request-Id": expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    });
  });

  it.each([
    "SSO_INVALID",
    "SSO_EXPIRED",
    "SSO_REPLAY",
    "SSO_INACTIVE",
    "SSO_PROVISIONING_FAILED",
    "SSO_SESSION_PERSISTENCE_FAILED",
    "SSO_FINALIZE_FAILED",
  ])("no reintenta el error estable terminal %s", async (code) => {
    const error = { status: 409, body: { code } };
    const api = { get: vi.fn().mockRejectedValue(error) };

    await expect(startSsoExchange(`token-${code}`, api)).rejects.toBe(error);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("simula reload/back: URL saneada no inicia otro exchange ni destruye sesión", async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ accessToken: "new-access" }),
    };
    const destroySession = vi.fn();

    const firstToken = new URL(window.location.href).searchParams.get("token");
    if (firstToken) startSsoExchange(firstToken, api);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("");

    // A reload creates a new JS lifecycle. Back sees the replaced history entry.
    resetSsoExchangeStateForTests();
    const reloadToken = new URL(window.location.href).searchParams.get("token");
    if (reloadToken) startSsoExchange(reloadToken, api);

    expect(reloadToken).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(destroySession).not.toHaveBeenCalled();
  });
});
