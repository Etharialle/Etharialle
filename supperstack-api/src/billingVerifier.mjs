import { createSign } from 'node:crypto';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const MOCK_BILLING_ENABLED = process.env.SUPPERSTACK_ENABLE_MOCK_BILLING !== 'false';

export async function verifyBillingPurchase({ product, purchaseToken, fetchImpl = fetch }) {
  const token = String(purchaseToken || '').trim();
  if (!product || !token) {
    throw httpError('Purchase could not be verified.', 402);
  }

  if (token.startsWith('mock:')) {
    if (!MOCK_BILLING_ENABLED) {
      throw httpError('Mock purchases are disabled on this server.', 402);
    }

    return { verified: true, provider: 'mock' };
  }

  if (process.env.SUPPERSTACK_ALLOW_UNVERIFIED_PURCHASES === 'true') {
    return { verified: true, provider: 'unverified-dev' };
  }

  return verifyGooglePlayPurchase({ product, purchaseToken: token, fetchImpl });
}

async function verifyGooglePlayPurchase({ product, purchaseToken, fetchImpl }) {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || process.env.SUPPERSTACK_GOOGLE_PLAY_PACKAGE_NAME || '';
  const accessToken = await googleAccessToken(fetchImpl);

  if (!packageName) {
    throw httpError('Google Play package name is not configured.', 503);
  }

  if (product.kind === 'subscription') {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const payload = await googleJson(url, accessToken, fetchImpl);
    const lineItem = payload.lineItems?.find((item) => item.productId === product.productId) || payload.lineItems?.[0];
    const expiryTime = lineItem?.expiryTime ? new Date(lineItem.expiryTime).getTime() : 0;
    const activeStates = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

    if (!activeStates.has(payload.subscriptionState) || expiryTime <= Date.now()) {
      throw httpError('Subscription is not active.', 402);
    }

    return { verified: true, provider: 'google-play' };
  }

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(product.productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  const payload = await googleJson(url, accessToken, fetchImpl);

  if (payload.purchaseState !== 0) {
    throw httpError('Purchase is not complete.', 402);
  }

  return { verified: true, provider: 'google-play' };
}

async function googleAccessToken(fetchImpl) {
  const clientEmail = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL || '';
  const privateKey = (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw httpError('Google Play service account is not configured.', 503);
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = [
    base64UrlJson({ alg: 'RS256', typ: 'JWT' }),
    base64UrlJson({
      iss: clientEmail,
      scope: ANDROID_PUBLISHER_SCOPE,
      aud: OAUTH_TOKEN_URL,
      exp: now + 3600,
      iat: now
    })
  ].join('.');
  const signature = createSign('RSA-SHA256').update(assertion).sign(privateKey);
  const jwt = `${assertion}.${base64Url(signature)}`;

  const response = await fetchImpl(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString()
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.access_token) {
    throw httpError('Could not authenticate with Google Play.', 502);
  }

  return payload.access_token;
}

async function googleJson(url, accessToken, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw httpError(payload?.error?.message || 'Google Play purchase verification failed.', response.status || 502);
  }

  return payload;
}

function base64UrlJson(value) {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
