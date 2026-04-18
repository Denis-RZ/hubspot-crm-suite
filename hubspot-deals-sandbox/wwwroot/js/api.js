// Single place for all HTTP calls to the backend.
// Throws on non-2xx so callers only need a try/catch, not status checks.

export async function apiFetch(url, method = 'GET', body = null) {
  const options = { method, headers: {} };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) throw new Error(JSON.stringify(json, null, 2));
  return json;
}

// Extracts a human-readable message from an API error.
// HubSpot errors are nested JSON strings, so we unwrap them here.
export function normalizeApiError(error) {
  try {
    const parsed = JSON.parse(error.message);
    return parsed.message || parsed.error || JSON.stringify(parsed, null, 2);
  } catch {
    return error.message;
  }
}
