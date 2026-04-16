/**
 * Standard API response format from the server.
 * All API responses follow { data, error, success }.
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  success: boolean;
}

type ApiBody<T> = ApiResponse<T> & { message?: string };

function hasApiEnvelope<T>(value: unknown): value is ApiBody<T> {
  return (
    !!value &&
    typeof value === "object" &&
    "success" in value &&
    typeof (value as { success?: unknown }).success === "boolean"
  );
}

async function readApiBody<T>(
  response: Response,
): Promise<{ json: ApiBody<T> | null; rawText: string }> {
  const rawText = await response.text();
  if (!rawText) {
    return { json: null, rawText: "" };
  }

  try {
    return {
      json: JSON.parse(rawText) as ApiBody<T>,
      rawText,
    };
  } catch {
    return { json: null, rawText };
  }
}

function getApiErrorMessage(
  response: Response,
  json: ApiBody<unknown> | null,
  rawText: string,
): string {
  const jsonMessage = json?.error || json?.message;
  if (jsonMessage) {
    return jsonMessage;
  }

  if (!response.ok) {
    const plainText = rawText.trim();
    if (response.status >= 500 && plainText) {
      return `Server unavailable (${response.status}): ${plainText}`;
    }
    return `Request failed (${response.status})`;
  }

  return "Invalid response from server";
}

/**
 * Parses an API response and returns the data payload.
 * Throws with the error message when success is false or response is not ok.
 */
export async function parseApiResponse<T>(response: Response): Promise<T> {
  const { json, rawText } = await readApiBody<T>(response);

  if (!json) {
    throw new Error(getApiErrorMessage(response, null, rawText));
  }

  if (!response.ok || !json.success) {
    throw new Error(getApiErrorMessage(response, json, rawText));
  }

  return json.data as T;
}

/**
 * Parses either the standard { success, data } API response or a raw JSON body.
 * Use this for endpoints that may temporarily return a bare JSON object.
 */
export async function parseApiResponseOrRaw<T>(response: Response): Promise<T> {
  const { json, rawText } = await readApiBody<T>(response);

  if (!json) {
    throw new Error(getApiErrorMessage(response, null, rawText));
  }

  if (hasApiEnvelope<T>(json)) {
    if (!response.ok || !json.success) {
      throw new Error(getApiErrorMessage(response, json, rawText));
    }
    return json.data as T;
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, null, rawText));
  }

  return json as T;
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
export async function parseApiResponseWithSoftError<T>(
  response: Response,
): Promise<ApiResult<T>> {
  const { json, rawText } = await readApiBody<T>(response);

  if (response.status >= 400 && response.status < 500) {
    return {
      ok: false,
      error: getApiErrorMessage(response, json, rawText),
      status: response.status,
    };
  }

  if (!json) {
    throw new Error(getApiErrorMessage(response, null, rawText));
  }

  if (!response.ok || !json.success) {
    throw new Error(getApiErrorMessage(response, json, rawText));
  }

  return { ok: true, data: json.data as T };
}

/**
 * Soft-error variant that accepts either the standard API envelope or a raw JSON body.
 */
export async function parseApiResponseOrRawWithSoftError<T>(
  response: Response,
): Promise<ApiResult<T>> {
  const { json, rawText } = await readApiBody<T>(response);

  if (response.status >= 400 && response.status < 500) {
    return {
      ok: false,
      error: getApiErrorMessage(
        response,
        hasApiEnvelope<unknown>(json) ? json : null,
        rawText,
      ),
      status: response.status,
    };
  }

  if (!json) {
    throw new Error(getApiErrorMessage(response, null, rawText));
  }

  if (hasApiEnvelope<T>(json)) {
    if (!response.ok || !json.success) {
      throw new Error(getApiErrorMessage(response, json, rawText));
    }
    return { ok: true, data: json.data as T };
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, null, rawText));
  }

  return { ok: true, data: json as T };
}
