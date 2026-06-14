export function loadAllowedOrigins(value = process.env.SUPPERSTACK_ALLOWED_ORIGINS || '') {
  return new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean));
}

export function applyCorsHeaders(request, response, allowedOrigins) {
  const origin = headerValue(request, 'origin');
  if (!origin || !isAllowedOrigin(origin, allowedOrigins)) return false;

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', 'content-type,x-supperstack-tester-key');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Max-Age', '600');
  return true;
}

export function isAllowedOrigin(origin, allowedOrigins) {
  return allowedOrigins.has(origin) || allowedOrigins.has('*');
}

export function publicErrorMessage(error) {
  if (error?.publicMessage) return error.publicMessage;
  if (error?.expose) return error.message;
  if (Number(error?.statusCode || 500) < 500) return error?.message || 'Request failed.';
  return 'Recipe import failed. Please try again later.';
}

export function privateErrorMessage(error) {
  return error?.privateMessage || error?.message || 'Unexpected recipe import error.';
}

function headerValue(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value || '';
}
