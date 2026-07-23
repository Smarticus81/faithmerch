/**
 * Shared HTTP plumbing for every external API client. No raw fetch in route
 * handlers — all outbound calls go through here so retries and error
 * logging are uniform.
 */

export class ApiError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number,
    public readonly body: string,
    public readonly url: string
  ) {
    super(`${service} responded ${status} for ${url}: ${body.slice(0, 300)}`);
    this.name = "ApiError";
  }
}

export interface RetryOptions {
  /** Total attempts including the first. */
  attempts?: number;
  /** Base backoff in ms; doubles per retry. */
  backoffMs?: number;
  /** Statuses that should be retried. Defaults to 429 and 5xx. */
  retryOn?: (status: number) => boolean;
}

const defaultRetryOn = (status: number) => status === 429 || status >= 500;

function logStructured(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>
): void {
  const line = JSON.stringify({ level, event, ...fields, ts: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export { logStructured };

/**
 * fetch with exponential backoff. Throws ApiError on a non-ok final
 * response and TypeError/network errors after exhausting retries.
 */
export async function fetchWithRetry(
  service: string,
  url: string,
  init: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const attempts = options.attempts ?? 4;
  const backoffMs = options.backoffMs ?? 1000;
  const retryOn = options.retryOn ?? defaultRetryOn;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      const body = await res.text();
      if (attempt < attempts && retryOn(res.status)) {
        logStructured("warn", "api_retry", {
          service,
          url,
          status: res.status,
          attempt,
          body: body.slice(0, 200),
        });
      } else {
        logStructured("error", "api_error", {
          service,
          url,
          status: res.status,
          attempt,
          body: body.slice(0, 500),
        });
        throw new ApiError(service, res.status, body, url);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      lastError = err;
      if (attempt >= attempts) {
        logStructured("error", "api_network_error", {
          service,
          url,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      logStructured("warn", "api_network_retry", {
        service,
        url,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await new Promise((r) => setTimeout(r, backoffMs * 2 ** (attempt - 1)));
  }
  throw lastError ?? new Error(`${service}: exhausted retries for ${url}`);
}
