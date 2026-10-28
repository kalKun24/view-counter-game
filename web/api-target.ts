export const DEFAULT_API_TARGET = "http://localhost:8080";

/**
 * Resolve the dev-server proxy target for /api.
 * API_PROXY_TARGET overrides the default (e.g. http://localhost:9000).
 * An unusable value fails loudly instead of silently falling back to the default.
 */
export function resolveApiTarget(raw: string | undefined): string {
  if (raw === undefined || raw === "") return DEFAULT_API_TARGET;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `API_PROXY_TARGET "${raw}" is not a valid URL (example: http://localhost:8080)`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`API_PROXY_TARGET "${raw}" must start with http:// or https://`);
  }
  return url.origin;
}
