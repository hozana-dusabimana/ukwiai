// Browser-side API client. Attaches stored JWT to every /api/* call.

const TOKEN_KEY = "ukwi_access_token";
const REFRESH_KEY = "ukwi_refresh_token";
const USER_KEY = "ukwi_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setRefreshToken(token: string | null): void {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}
export function getStoredUser(): unknown | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
export function setStoredUser(user: unknown | null): void {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}
export function clearAuth(): void {
  setToken(null);
  setRefreshToken(null);
  setStoredUser(null);
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function parseError(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") return body.detail;
      if (typeof body?.error === "string") return body.error;
      return JSON.stringify(body);
    } catch {
      return res.statusText;
    }
  }
  return (await res.text()) || res.statusText;
}

type RequestOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: Record<string, string>;
  raw?: boolean; // if true, returns the Response object instead of parsing JSON
};

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body instanceof FormData || options.body instanceof Blob) {
    body = options.body as BodyInit;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(path, { ...options, headers, body });
  if (options.raw) return res as unknown as T;
  if (!res.ok) {
    const message = await parseError(res);
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

// Login: FastAPI expects form-urlencoded { username, password }.
export async function login(email: string, password: string): Promise<{ access_token: string; refresh_token: string; token_type: string }> {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }
  return res.json();
}

export async function register(input: {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  role?: string;
}): Promise<unknown> {
  return api("/api/auth/register", { method: "POST", body: input });
}

export async function me(): Promise<{
  id: number;
  full_name: string;
  email: string;
  role: string;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
}> {
  return api("/api/auth/me");
}
