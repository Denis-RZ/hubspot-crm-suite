// Single place for all HTTP calls to the backend.
// Throws on non-2xx so callers only need a try/catch, not status checks.

export class ApiError extends Error {
  constructor({ status, url, method, payload }) {
    const fieldErrors = extractFieldErrors(payload, { url, method });
    super(extractMessage(payload, fieldErrors));
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.method = method;
    this.payload = payload;
    this.fieldErrors = fieldErrors;
  }
}

export async function apiFetch(url, method = 'GET', body = null) {
  const options = { method, headers: {} };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  dispatchApiEvent('crm:api-request-start', { url, method });

  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) {
    const error = new ApiError({ status: response.status, url, method, payload: json });
    dispatchApiEvent('crm:api-error', error);
    throw error;
  }
  return json;
}

// Extracts a human-readable message from an API error.
// API errors are nested JSON strings, so we unwrap them here.
export function normalizeApiError(error) {
  if (error instanceof ApiError) {
    if (error.fieldErrors.length) {
      return [
        error.message,
        ...error.fieldErrors.map(item => `${item.field}: ${item.message}`),
      ].join('\n');
    }
    return error.message;
  }

  try {
    const parsed = JSON.parse(error.message);
    return parsed.message || parsed.error || JSON.stringify(parsed, null, 2);
  } catch {
    return error.message;
  }
}

function dispatchApiEvent(name, detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function extractMessage(payload, fieldErrors = []) {
  const message = findFirstString(payload, ['message', 'error', 'title', 'detail'])
    || 'Request failed.';

  if (message.includes('[') && fieldErrors.length) {
    return message.slice(0, message.indexOf('[')).replace(/[:\s]+$/, '.');
  }

  return message;
}

function extractFieldErrors(payload, request) {
  const errors = [];
  collectFieldErrors(payload, errors);
  inferFieldErrors(payload, request, errors);
  return dedupeFieldErrors(errors);
}

function collectFieldErrors(value, errors) {
  if (!value) return;

  if (typeof value === 'string') {
    collectEmbeddedJsonErrors(value, errors);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectFieldErrors(item, errors));
    return;
  }

  if (typeof value !== 'object') return;

  const field = pickFieldName(value);
  const message = pickFieldMessage(value);
  if (field && message) {
    errors.push({ field, message });
  }

  if (value.context && typeof value.context === 'object') {
    for (const [key, contextValue] of Object.entries(value.context)) {
      if (/property|field|name/i.test(key)) {
        const contextFields = Array.isArray(contextValue) ? contextValue : [contextValue];
        contextFields
          .filter(item => typeof item === 'string')
          .forEach(item => errors.push({ field: item, message: message || 'Invalid value.' }));
      }
    }
  }

  Object.values(value).forEach(item => collectFieldErrors(item, errors));
}

function collectEmbeddedJsonErrors(message, errors) {
  const snippets = [];
  const arrayStart = message.indexOf('[');
  const arrayEnd = message.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    snippets.push(message.slice(arrayStart, arrayEnd + 1));
  }

  const objectStart = message.indexOf('{');
  const objectEnd = message.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    snippets.push(message.slice(objectStart, objectEnd + 1));
  }

  snippets.forEach(snippet => {
    try {
      collectFieldErrors(JSON.parse(snippet), errors);
    }
    catch {
      // Not all messages contain valid embedded JSON.
    }
  });
}

function inferFieldErrors(payload, request, errors) {
  if (errors.length > 0) return;

  const message = extractMessage(payload).toLowerCase();
  const url = request.url.toLowerCase();
  const method = request.method.toUpperCase();

  if (method === 'POST' && url.includes('/api/contacts') && /already exists|duplicate/.test(message)) {
    errors.push({ field: 'email', message: 'A contact with this email already exists.' });
  }

  if (method === 'POST' && url.includes('/api/companies') && /already exists|duplicate/.test(message)) {
    errors.push({ field: 'domain', message: 'A company with this domain may already exist.' });
  }
}

function pickFieldName(value) {
  return [
    value.name,
    value.propertyName,
    value.property,
    value.field,
    value.fieldName,
  ].find(item => typeof item === 'string' && item.trim());
}

function pickFieldMessage(value) {
  return [
    value.message,
    value.error,
    value.reason,
    value.detail,
  ].find(item => typeof item === 'string' && item.trim()) || 'Invalid value.';
}

function findFirstString(value, keys) {
  if (!value || typeof value !== 'object') return '';
  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return value[key].trim();
    }
  }
  return '';
}

function dedupeFieldErrors(errors) {
  const seen = new Set();
  return errors
    .map(item => ({
      field: String(item.field || '').trim(),
      message: String(item.message || 'Invalid value.').trim(),
    }))
    .filter(item => {
      if (!item.field) return false;
      const key = `${item.field.toLowerCase()}|${item.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
