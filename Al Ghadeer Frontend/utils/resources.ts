const DEFAULT_API_BASE_URL = "http://localhost:3000";

const getApiBaseUrl = (): string => {
  return (process.env.EXPO_PUBLIC_IP_ADDRESS || DEFAULT_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
};

const JWT_TOKEN_PATTERN = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;

const stripQueryAndHash = (value: string): string => {
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const cutAt =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);
  return cutAt >= 0 ? value.slice(0, cutAt) : value;
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const extractResourceToken = (
  resourceLike: string | null | undefined,
): string | null => {
  if (!resourceLike) return null;
  const trimmed = resourceLike.trim();
  if (!trimmed) return null;

  const withoutQuery = stripQueryAndHash(trimmed);

  if (!withoutQuery.includes("/") && JWT_TOKEN_PATTERN.test(withoutQuery)) {
    return withoutQuery;
  }

  const match = withoutQuery.match(/(?:^|\/)resources\/([^/]+)/i);
  if (!match?.[1]) return null;

  const token = safeDecode(match[1].trim());
  return token || null;
};

export const resolveResourceUrl = (
  resourceLike: string | null | undefined,
): string | null => {
  if (!resourceLike) return null;
  const trimmed = resourceLike.trim();
  if (!trimmed) return null;

  if (/^data:/i.test(trimmed)) {
    return trimmed;
  }

  const token = extractResourceToken(trimmed);
  if (token) {
    return `${getApiBaseUrl()}/resources/${token}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return `${getApiBaseUrl()}${trimmed}`;
  }

  return `${getApiBaseUrl()}/${trimmed}`;
};
