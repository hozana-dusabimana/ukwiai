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

// Turn a Pydantic/FastAPI loc array (e.g. ["body", "court_type"]) into a
// human label like "Court type". Skips the request-part prefix.
function fieldLabel(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;
  const parts = loc.filter(
    (p) => typeof p === "string" && !["body", "query", "path", "form", "header"].includes(p)
  ) as string[];
  const field = parts[parts.length - 1];
  if (!field) return null;
  const words = field
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// FastAPI returns 422 validation errors as { detail: [{ loc, msg, type }, ...] }.
// Render them as readable sentences instead of dumping raw JSON.
function formatValidationErrors(detail: any[]): string {
  const messages = detail.map((item) => {
    const label = fieldLabel(item?.loc);
    const msg = typeof item?.msg === "string" ? item.msg : "is invalid";
    if (item?.type === "missing") return label ? `${label} is required` : "A required field is missing";
    if (!label) return msg.charAt(0).toUpperCase() + msg.slice(1);
    // Pydantic messages read as "Input should be ...". Prefix with the field name.
    return `${label}: ${msg.replace(/^Input should be/i, "must be")}`;
  });
  return Array.from(new Set(messages)).join(". ") + ".";
}

async function parseError(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") return body.detail;
      if (Array.isArray(body?.detail) && body.detail.length > 0) return formatValidationErrors(body.detail);
      if (typeof body?.error === "string") return body.error;
      if (typeof body?.message === "string") return body.message;
      return res.statusText || "Request failed";
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
