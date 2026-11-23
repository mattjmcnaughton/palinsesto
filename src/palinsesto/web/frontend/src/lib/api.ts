/** Same-origin browser transport. Writes carry the session's CSRF token. */

export interface BrowserSession {
  user: { id: string };
  workspace: { id: string; name: string; time_zone: string };
  csrf_token: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number | null,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let csrf = "";
export const setCsrf = (token: string) => {
  csrf = token;
};

async function apiError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`;
  let message = "The request could not be completed.";
  try {
    const detail = (await response.json())?.detail;
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail) && typeof detail[0]?.msg === "string") message = detail[0].msg;
    else if (detail && typeof detail === "object") {
      if (typeof detail.code === "string") code = detail.code;
      if (typeof detail.message === "string") message = detail.message;
    }
  } catch {
    // An error response need not be JSON.
  }
  return new ApiError(response.status, code, message);
}

export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/api/") || path.startsWith("//")) throw new Error("Same-origin API path");
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.method && init.method !== "GET") headers.set("X-CSRF-Token", csrf);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new ApiError(null, "network_unavailable", "Could not reach Palinsesto. Try again.");
  }
  if (!response.ok) throw await apiError(response);
  return (await response.json()) as T;
}

export async function readSession(): Promise<BrowserSession> {
  const session = await fetchJson<BrowserSession>("/api/auth/session");
  setCsrf(session.csrf_token);
  return session;
}
