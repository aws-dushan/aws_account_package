import { cookies } from "next/headers";
import { AUTH_COOKIE } from "./jwt";

const BASE = process.env.API_BASE_URL ?? "http://localhost:5247";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/** The JWT from the httpOnly cookie (server-side only). */
export async function authToken(): Promise<string | undefined> {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j && typeof j.error === "string") return j.error;
  } catch {
    /* non-JSON body */
  }
  return `Request failed (HTTP ${res.status}).`;
}

type Init = Omit<RequestInit, "body"> & { body?: BodyInit };

/** Low-level call to the .NET API with the caller's bearer token attached. */
export async function apiFetch(path: string, init: Init = {}): Promise<Response> {
  const token = await authToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${BASE}${path}`, { ...init, headers, cache: "no-store" });
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return (await res.json()) as T;
}

/** GET that returns null on 404/403 instead of throwing (for "not found" pages). */
export async function apiGetOrNull<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return (await res.json()) as T;
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await apiFetch(path, { method: "POST", headers, body: payload });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PUT",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: "DELETE" });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export const apiBase = BASE;
