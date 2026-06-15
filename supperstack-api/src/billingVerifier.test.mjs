import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyBillingPurchase } from './billingVerifier.mjs';

const packProduct = {
  productId: 'supperstack_imports_50',
  kind: 'pack'
};

const subscriptionProduct = {
  productId: 'supperstack_monthly_100',
  kind: 'subscription'
};

test('mock billing token verifies only when explicitly enabled', async () => {
  const previous = process.env.SUPPERSTACK_ENABLE_MOCK_BILLING;
  process.env.SUPPERSTACK_ENABLE_MOCK_BILLING = 'true';

  try {
    const result = await verifyBillingPurchase({
      product: packProduct,
      purchaseToken: 'mock:test-purchase'
    });

    assert.deepEqual(result, { verified: true, provider: 'mock' });
  } finally {
    if (previous === undefined) {
      delete process.env.SUPPERSTACK_ENABLE_MOCK_BILLING;
    } else {
      process.env.SUPPERSTACK_ENABLE_MOCK_BILLING = previous;
    }
  }
});

test('mock billing token is rejected by default', async () => {
  await assert.rejects(
    () => verifyBillingPurchase({
      product: packProduct,
      purchaseToken: 'mock:test-purchase'
    }),
    /Mock purchases are disabled/
  );
});

test('real purchase verification requires Google Play configuration', async () => {
  await assert.rejects(
    () => verifyBillingPurchase({
      product: packProduct,
      purchaseToken: 'real-play-token'
    }),
    /Google Play service account is not configured/
  );
});

test('completed Google Play product purchase verifies', async () => {
  const restoreEnv = setGooglePlayEnv();
  const requests = [];

  try {
    const result = await verifyBillingPurchase({
      product: packProduct,
      purchaseToken: 'real-play-token',
      fetchImpl: async (url, options = {}) => {
        requests.push({ url: String(url), options });

        if (String(url).includes('oauth2.googleapis.com')) {
          return jsonResponse({ access_token: 'access-token' });
        }

        return jsonResponse({ purchaseState: 0 });
      }
    });

    assert.deepEqual(result, { verified: true, provider: 'google-play' });
    assert.equal(requests.length, 2);
    assert.match(requests[1].url, /purchases\/products\/supperstack_imports_50\/tokens\/real-play-token/);
  } finally {
    restoreEnv();
  }
});

test('incomplete Google Play product purchase is rejected', async () => {
  const restoreEnv = setGooglePlayEnv();

  try {
    await assert.rejects(
      () => verifyBillingPurchase({
        product: packProduct,
        purchaseToken: 'real-play-token',
        fetchImpl: async (url) => {
          if (String(url).includes('oauth2.googleapis.com')) {
            return jsonResponse({ access_token: 'access-token' });
          }

          return jsonResponse({ purchaseState: 1 });
        }
      }),
      /Purchase is not complete/
    );
  } finally {
    restoreEnv();
  }
});

test('active Google Play subscription verifies only for the matching product', async () => {
  const restoreEnv = setGooglePlayEnv();
  const future = new Date(Date.now() + 60_000).toISOString();

  try {
    const result = await verifyBillingPurchase({
      product: subscriptionProduct,
      purchaseToken: 'real-sub-token',
      fetchImpl: async (url) => {
        if (String(url).includes('oauth2.googleapis.com')) {
          return jsonResponse({ access_token: 'access-token' });
        }

        return jsonResponse({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          lineItems: [{ productId: 'supperstack_monthly_100', expiryTime: future }]
        });
      }
    });

    assert.deepEqual(result, { verified: true, provider: 'google-play' });
  } finally {
    restoreEnv();
  }
});

test('inactive or expired Google Play subscription is rejected', async () => {
  const restoreEnv = setGooglePlayEnv();
  const past = new Date(Date.now() - 60_000).toISOString();

  try {
    await assert.rejects(
      () => verifyBillingPurchase({
        product: subscriptionProduct,
        purchaseToken: 'real-sub-token',
        fetchImpl: async (url) => {
          if (String(url).includes('oauth2.googleapis.com')) {
            return jsonResponse({ access_token: 'access-token' });
          }

          return jsonResponse({
            subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
            lineItems: [{ productId: 'supperstack_monthly_100', expiryTime: past }]
          });
        }
      }),
      /Subscription is not active/
    );
  } finally {
    restoreEnv();
  }
});

test('Google Play subscription token must match the requested product', async () => {
  const restoreEnv = setGooglePlayEnv();
  const future = new Date(Date.now() + 60_000).toISOString();

  try {
    await assert.rejects(
      () => verifyBillingPurchase({
        product: subscriptionProduct,
        purchaseToken: 'real-sub-token',
        fetchImpl: async (url) => {
          if (String(url).includes('oauth2.googleapis.com')) {
            return jsonResponse({ access_token: 'access-token' });
          }

          return jsonResponse({
            subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
            lineItems: [{ productId: 'other_subscription', expiryTime: future }]
          });
        }
      }),
      /Subscription product does not match/
    );
  } finally {
    restoreEnv();
  }
});

function setGooglePlayEnv() {
  const previous = {
    packageName: process.env.SUPPERSTACK_GOOGLE_PLAY_PACKAGE_NAME,
    clientEmail: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY
  };

  process.env.SUPPERSTACK_GOOGLE_PLAY_PACKAGE_NAME = 'com.etharialle.serenity.supperstack';
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL = 'billing-test@example.iam.gserviceaccount.com';
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY = [
    '-----BEGIN PRIVATE KEY-----',
    'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC1O3/2r4HOy3LD',
    'bN/6m+VhLrzjdXxBAIWJVnGUu4spCbgBBc+vFIshWlu53WUFarlZZG4ggXeAmQO0',
    '3KYbk1f5bomKQKj14RVPTt307MwYiFm9H7O6hJCQ+/E305aHZLenVBPnpYwIp5bV',
    'EbT+IU1egcPnvpvk5pvI70vXNU2HfVnBTamWPlj4aWIDGooCQWRKREFfPbuY8wyK',
    'hd0SsIuP0RI6u6JnjeKtFXRRyStNxcPJQVWXqwY/SVfcvSYh0J7kGRfnbYZbgrCL',
    '6fbT0kethdp7UzZ02k0b2hnF/stbdSEftxnXRhokbD0mGekVX5U4aIq9uFyFj92S',
    'VaU+XHRdAgMBAAECggEADu4a6aClyfp6ttzGSugC6pGmH/ryxIwddCX5723P1g6l',
    '6Peol1zS5WmDOvmhM+QJ5vJeHDFuPdrdMk4nJQhra/IORKR1BuSHE+SEZoQHgFHj',
    'SrBM5yW6nycSRS4aLYc/lfpYNXIu6hucUmtGBNWLgSihkfri7uWMme4UymLqwymN',
    '5nYiIMPtWKJWteoA1FlUz6Um5RqHvLk/uTy+D9gKMkyWqUvl4IixL44tR8heEvWp',
    '9TirC9uvpD0lhuTodj87O+UhjybZszO2Sc+DhjPLzZks/iceQ4eO0iWWBa85R4Sk',
    'h5WaXQl7PXFyZ4Px0nNKofGQ1/4jRzJ65ALelTxNpQKBgQDlnMTWW9iB19/2MyrK',
    '6C9uXuEuJe0iOXarHDP/DsGJLMRhKuaNb94sNerFZHeuvQ5IOZc0fgy1Fwt4r0KI',
    '5SYLwDVU54Bb4r+TYwHQIcHPQv6zI8DFl+XBDZKoHIRuAkDdNaySw8bO0CLrVaTA',
    '1CwsUxbsYcQSEOX5DMOUGwBobwKBgQDKD2Kgi4Y4ZgQ2dQF+B7Zkcp6m0YAqQ8uj',
    'pfbchIWBosmBOW/vWJP80cMKEBdQT3wG0/YsE19G912atO0nozHUkYvIfJBtR1W/',
    'uaFj7F79x3b07E+03+dNJgPqUsoe0Zj5mi+cDRp5a936AFTZz0Eb7Zt0p2TwWV0G',
    '4A1SJAdd8wKBgQDKVW4jEwZjzO5fjtE7woThdpxpxSQEz6xhtlWfgcpL7fYTRfGq',
    'WxTl0pFSZmkMwy5NuOokaJscDPWf4Jj59yuimTql2eaDkfmNkGZtmQGneXrmMzBR',
    'LrxYdXRxzcdpBXVROVYccobDgifzRyIKhi1y1blSjghwfxGYeIX0AiNG4wKBgDob',
    'qJJg7Y2EkQuUJIS49RP3/nYc443EB2kdjlumZLp+NRLLkMw1HgHj1QIs1HeNFC7m',
    'f/H29Dx1YN7fzx/KB8eIv7k9UU+L5zYGzUnuLPcwiJ4w408x4NPH7fJSMrwgLK0D',
    'UVPAVO+8PI7rz3r/5kqAz2cByL5yBJW4kzwfDltPAoGBALg757a3siX6kAcCW9nH',
    'psZUn5n9zcTgYJf0JHp6BWJGLyJp2LQV5H8mLjI0kFnuaGLFmM810kJagUNXewUc',
    'aQXCpUgjxiriGZQZQIpzrM6oX7l+ER9BEkCF/VSy+EjOeifSm6J6048RqNtGy4zQ',
    '8JZdoXleY8OXOQxEaMiPr154',
    '-----END PRIVATE KEY-----'
  ].join('\n');

  return () => {
    restoreEnvValue('SUPPERSTACK_GOOGLE_PLAY_PACKAGE_NAME', previous.packageName);
    restoreEnvValue('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', previous.clientEmail);
    restoreEnvValue('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', previous.privateKey);
  };
}

function restoreEnvValue(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
