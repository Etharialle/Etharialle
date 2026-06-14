import http from 'node:http';
import { extractRecipeFromUrl } from './extractor.mjs';
import { applyCorsHeaders, loadAllowedOrigins, privateErrorMessage, publicErrorMessage } from './httpSecurity.mjs';
import { renderUsageDashboard } from './usageDashboard.mjs';
import { createUsageStore } from './usageStore.mjs';

const PORT = Number(process.env.PORT || 8787);
const TESTER_KEYS = loadTesterKeys();
const ALLOWED_ORIGINS = loadAllowedOrigins();
const DASHBOARD_USERNAME = process.env.SUPPERSTACK_DASHBOARD_USERNAME || '';
const DASHBOARD_PASSWORD = process.env.SUPPERSTACK_DASHBOARD_PASSWORD || '';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 8);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 4096);
const DAILY_SUCCESS_LIMIT = Number(process.env.DAILY_SUCCESS_LIMIT || 25);
const usageStore = createUsageStore();
const rateLimitBuckets = new Map();

const server = http.createServer(async (request, response) => {
  const corsAllowed = applyCorsHeaders(request, response, ALLOWED_ORIGINS);

  if (request.method === 'OPTIONS') {
    if (headerValue(request, 'origin') && !corsAllowed) {
      sendJson(response, 403, { error: 'CORS origin is not allowed.' });
      return;
    }

    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && request.url === '/admin/usage') {
    if (!enforceDashboardAuth(request, response)) return;

    sendHtml(response, 200, renderUsageDashboard(usageStore.summary()));
    return;
  }

  if (request.method === 'POST' && request.url === '/extract-recipe') {
    let testerId = 'unknown';
    let sourceHost = '';
    let usage = undefined;
    try {
      testerId = enforceTesterKey(request);
      enforceRateLimit(request, testerId);
      enforceDailySuccessLimit(testerId);
      const body = await readJson(request);
      const sourceUrl = validateUrl(body?.url);
      sourceHost = new URL(sourceUrl).hostname;
      const result = await extractRecipeFromUrl(sourceUrl);
      usage = result.usage;
      recordUsage({ testerId, sourceHost, statusCode: 200, usage, moderation: result.moderation });
      sendJson(response, 200, clientExtractionResult(result));
      logExtraction({ testerId, sourceHost, statusCode: 200, usage, moderation: result.moderation });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      recordUsage({
        testerId,
        sourceHost,
        statusCode,
        errorType: classifyError(error, statusCode),
        moderation: error.moderation
      });
      logExtraction({
        testerId,
        sourceHost,
        statusCode,
        errorType: classifyError(error, statusCode),
        error: privateErrorMessage(error),
        moderation: error.moderation
      });
      sendJson(response, statusCode, {
        error: publicErrorMessage(error)
      });
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

server.listen(PORT, () => {
  console.log(`Supperstack recipe import server listening on http://localhost:${PORT}`);
});

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(html);
}

async function readJson(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw badRequest('Request body is too large.');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function enforceTesterKey(request) {
  if (TESTER_KEYS.size === 0) {
    throw httpError('Recipe import server is not configured for authenticated test access.', 503);
  }

  const testerKey = headerValue(request, 'x-supperstack-tester-key');
  const testerId = TESTER_KEYS.get(testerKey);

  if (!testerId) {
    throw httpError('Invalid SupperStack tester key.', 401);
  }

  return testerId;
}

function enforceRateLimit(request, testerId) {
  const now = Date.now();
  const clientId = testerId || clientIp(request);
  const bucket = rateLimitBuckets.get(clientId) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateLimitBuckets.set(clientId, bucket);

  if (bucket.count > RATE_LIMIT_MAX) {
    throw httpError('Too many recipe import requests. Please wait a minute and try again.', 429);
  }
}

function loadTesterKeys() {
  const testerKeys = new Map();
  const entries = (process.env.SUPPERSTACK_TESTER_KEYS || '').split(',');
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
      console.warn(`Ignoring invalid SUPPERSTACK_TESTER_KEYS entry for internal tester access.`);
      continue;
    }

    const testerId = trimmed.slice(0, separatorIndex).trim();
    const testerKey = trimmed.slice(separatorIndex + 1).trim();
    if (testerId && testerKey) {
      testerKeys.set(testerKey, testerId);
    }
  }

  return testerKeys;
}

function headerValue(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value || '';
}

function clientIp(request) {
  return request.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || request.socket.remoteAddress
    || 'unknown';
}

function clientExtractionResult(result) {
  const { moderation, ...clientResult } = result;
  return clientResult;
}

function recordUsage({ testerId, sourceHost, statusCode, errorType = 'none', usage, moderation }) {
  usageStore.record({
    testerId,
    sourceHost,
    statusCode,
    errorType,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    moderation
  });
}

function logExtraction({ testerId, sourceHost, statusCode, errorType = 'none', error, usage, moderation }) {
  console.info(JSON.stringify({
    event: 'extract-recipe',
    testerId,
    sourceHost,
    statusCode,
    errorType,
    inputTokens: usage?.inputTokens || 0,
    outputTokens: usage?.outputTokens || 0,
    totalTokens: usage?.totalTokens || 0,
    moderationFlagged: Boolean(moderation?.flagged),
    moderationBlocked: Boolean(moderation?.blocked),
    moderationCategories: moderation?.categories || [],
    moderationMaxScore: moderation?.maxScore || 0,
    moderationMode: moderation?.mode || '',
    error: error ? sanitizeLogValue(error) : undefined,
    timestamp: new Date().toISOString()
  }));
}

function sanitizeLogValue(value) {
  return value.replace(/\s+/g, ' ').slice(0, 160);
}

function classifyError(error, statusCode) {
  if (error?.errorType) return error.errorType;
  if (statusCode === 401) return 'auth';
  if (statusCode === 429) return 'rate_limit';
  if (statusCode === 400) return 'bad_request';
  if (statusCode === 422) return 'not_enough_recipe_detail';
  if (statusCode === 502) return 'upstream';
  if (error instanceof SyntaxError) return 'bad_json';
  return 'server_error';
}

function enforceDashboardAuth(request, response) {
  if (!DASHBOARD_USERNAME || !DASHBOARD_PASSWORD) {
    sendJson(response, 503, { error: 'Usage dashboard is not configured.' });
    return false;
  }

  const credentials = parseBasicAuth(headerValue(request, 'authorization'));
  if (credentials?.username === DASHBOARD_USERNAME && credentials.password === DASHBOARD_PASSWORD) {
    return true;
  }

  response.writeHead(401, {
    'www-authenticate': 'Basic realm="SupperStack usage", charset="UTF-8"',
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end('Authentication required.');
  return false;
}

function parseBasicAuth(value) {
  if (!value.startsWith('Basic ')) return null;

  try {
    const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

function enforceDailySuccessLimit(testerId) {
  if (usageStore.successfulExtractionsToday(testerId) >= DAILY_SUCCESS_LIMIT) {
    throw httpError('Daily recipe import limit reached for this test environment.', 429);
  }
}

function validateUrl(value) {
  if (typeof value !== 'string') throw badRequest('URL is required.');

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw badRequest('Enter a valid recipe URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw badRequest('Recipe URL must start with http:// or https://.');
  }

  return parsed.toString();
}

function badRequest(message) {
  return httpError(message, 400);
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
