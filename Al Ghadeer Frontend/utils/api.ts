/**
 * Standard API response format from the server.
 * All API responses follow { data, error, success }.
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  success: boolean;
}

/**
 * Parses an API response and returns the data payload.
 * Throws with the error message when success is false or response is not ok.
 */
export async function parseApiResponse<T>(response: Response): Promise<T> {
  const json: ApiResponse<T> = await response.json();

  if (!response.ok || !json.success) {
    throw new Error(json.error || (response.ok ? 'Request failed' : `HTTP ${response.status}`));
  }

  return json.data as T;
}

/** Result type for soft 4xx handling - no throw, error shown inline */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

/**
 * For 400-499: returns { ok: false, error, status } - do not throw, show error inline.
 * For 2xx success: returns { ok: true, data }.
 * For 5xx or network: throws.
 */
export async function parseApiResponseWithSoftError<T>(response: Response): Promise<ApiResult<T>> {
  let json: ApiResponse<T>;
  try {
    json = await response.json();
  } catch {
    json = { success: false, error: 'Invalid response' };
  }

  if (response.status >= 400 && response.status < 500) {
    return {
      ok: false,
      error: json.error || (json as { message?: string }).message || `Request failed (${response.status})`,
      status: response.status,
    };
  }

  if (!response.ok || !json.success) {
    throw new Error(json.error || (response.ok ? 'Request failed' : `HTTP ${response.status}`));
  }

  return { ok: true, data: json.data as T };
}
