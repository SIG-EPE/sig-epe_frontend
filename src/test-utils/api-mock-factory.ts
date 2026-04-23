// src/test-utils/api-mock-factory.ts
// Factory functions for mocking api.get / api.post per test
import { vi } from "vitest";
import type { ApiRequestError } from "@/lib/api-client";

// -------------------------------------------------------
// Mock builders
// -------------------------------------------------------

/**
 * Mock api.get to return a successful response.
 */
export function mockApiGet<T>(
  path: string,
  payload: T,
  status = 200,
): ReturnType<typeof vi.fn> {
  const { api } = require("@/lib/api-client");
  return vi.mocked(api.get).mockResolvedValueOnce(payload as T);
}

/**
 * Mock api.post to return a successful response.
 */
export function mockApiPost<T>(
  path: string,
  payload: T,
  status = 200,
): ReturnType<typeof vi.fn> {
  const { api } = require("@/lib/api-client");
  return vi.mocked(api.post).mockResolvedValueOnce(payload as T);
}

/**
 * Mock api.post or api.get to throw an ApiRequestError.
 */
export function mockApiFailure(
  path: string,
  message: string,
  status: number,
  method: "get" | "post" = "post",
): ReturnType<typeof vi.fn> {
  const { api, ApiRequestError } = require("@/lib/api-client");

  const body = {
    statusCode: status,
    message,
    error: status >= 500 ? "Internal Server Error" : "Bad Request",
    timestamp: new Date().toISOString(),
    path,
  };

  const error = new ApiRequestError(status, body);
  const mockFn = vi.mocked(api[method]);

  return mockFn.mockRejectedValueOnce(error);
}

/**
 * Mock api.post to return a 401 (unauthorized).
 */
export function mockApi401(
  path: string,
  method: "get" | "post" = "post",
): ReturnType<typeof vi.fn> {
  return mockApiFailure(path, "Unauthorized", 401, method);
}

/**
 * Mock api.post to return a 409 (conflict).
 */
export function mockApi409(
  path: string,
  message = "Conflict",
): ReturnType<typeof vi.fn> {
  return mockApiFailure(path, message, 409, "post");
}

/**
 * Chain multiple responses for retry testing.
 * Pass an array of status codes; the last one should be 200.
 */
export function mockApiChain(
  path: string,
  responses: Array<{ status: number; payload?: unknown }>,
): void {
  const { api, ApiRequestError } = require("@/lib/api-client");

  const mapped = responses.map(({ status, payload }) => {
    if (status >= 200 && status < 300) {
      return Promise.resolve(payload);
    }
    const body = {
      statusCode: status,
      message: "Error",
      error: "Error",
      timestamp: new Date().toISOString(),
      path,
    };
    return Promise.reject(new ApiRequestError(status, body));
  });

  vi.mocked(api.get).mockResolvedValueOnce(mapped as unknown as Promise<unknown>);
}
