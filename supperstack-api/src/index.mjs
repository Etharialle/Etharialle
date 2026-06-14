import http from 'node:http';
import { extractRecipeFromUrl } from './extractor.mjs';
import { applyCorsHeaders, loadAllowedOrigins, privateErrorMessage, publicErrorMessage } from './httpSecurity.mjs';
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
      recordUsage({ testerId, sourceHost, statusCode: 200, usage });
      sendJson(response, 200, result);
      logExtraction({ testerId, sourceHost, statusCode: 200, usage });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      recordUsage({
        testerId,
        sourceHost,
        statusCode,
        errorType: classifyError(error, statusCode)
      });
      logExtraction({
        testerId,
        sourceHost,
        statusCode,
        errorType: classifyError(error, statusCode),
        error: privateErrorMessage(error)
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
  console.log(`Supperstack extraction server listening on http://localhost:${PORT}`);
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
    throw httpError('Extraction server is not configured for authenticated test access.', 503);
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
    throw httpError('Too many extraction requests. Please wait a minute and try again.', 429);
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

function recordUsage({ testerId, sourceHost, statusCode, errorType = 'none', usage }) {
  usageStore.record({
    testerId,
    sourceHost,
    statusCode,
    errorType,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens
  });
}

function logExtraction({ testerId, sourceHost, statusCode, errorType = 'none', error, usage }) {
  console.info(JSON.stringify({
    event: 'extract-recipe',
    testerId,
    sourceHost,
    statusCode,
    errorType,
    inputTokens: usage?.inputTokens || 0,
    outputTokens: usage?.outputTokens || 0,
    totalTokens: usage?.totalTokens || 0,
    error: error ? sanitizeLogValue(error) : undefined,
    timestamp: new Date().toISOString()
  }));
}

function sanitizeLogValue(value) {
  return value.replace(/\s+/g, ' ').slice(0, 160);
}

function classifyError(error, statusCode) {
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

function renderUsageDashboard(summary) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SupperStack Usage</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f5ef; color: #17221b; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 18px 48px; }
    h1 { margin: 0 0 4px; font-size: 30px; }
    h2 { margin-top: 32px; font-size: 20px; }
    p { color: #56665c; margin: 0 0 18px; }
    table { width: 100%; border-collapse: collapse; background: #fffdf7; border: 1px solid #d9ded7; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e5e8e2; text-align: left; font-size: 14px; }
    th { background: #eef3ef; color: #26352c; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    td.number, th.number { text-align: right; font-variant-numeric: tabular-nums; }
    .empty { padding: 18px; background: #fffdf7; border: 1px solid #d9ded7; color: #56665c; }
  </style>
</head>
<body>
  <main>
    <h1>SupperStack Usage</h1>
    <p>Internal extraction usage. Full recipe URLs and tester keys are not shown.</p>
    ${renderTable('Daily Summary', summary.daily, ['day', 'testerId', 'statusCode', 'errorType', 'requests', 'inputTokens', 'outputTokens', 'totalTokens'])}
    ${renderTable('Monthly Summary', summary.monthly, ['month', 'testerId', 'statusCode', 'errorType', 'requests', 'inputTokens', 'outputTokens', 'totalTokens'])}
    ${renderTable('Recent Events', summary.recent, ['createdAt', 'testerId', 'sourceHost', 'statusCode', 'errorType', 'inputTokens', 'outputTokens', 'totalTokens'])}
  </main>
</body>
</html>`;
}

function renderTable(title, rows, columns) {
  if (!rows.length) {
    return `<section><h2>${escapeHtml(title)}</h2><div class="empty">No usage events recorded yet.</div></section>`;
  }

  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr>${columns.map((column) => `<th class="${isNumberColumn(column) ? 'number' : ''}">${escapeHtml(labelForColumn(column))}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${columns.map((column) => `<td class="${isNumberColumn(column) ? 'number' : ''}">${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  </section>`;
}

function labelForColumn(column) {
  return column.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

function isNumberColumn(column) {
  return ['statusCode', 'requests', 'inputTokens', 'outputTokens', 'totalTokens'].includes(column);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function enforceDailySuccessLimit(testerId) {
  if (usageStore.successfulExtractionsToday(testerId) >= DAILY_SUCCESS_LIMIT) {
    throw httpError('Daily extraction limit reached for this test environment.', 429);
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
