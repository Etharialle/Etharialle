import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyBillingPurchase } from './billingVerifier.mjs';

const packProduct = {
  productId: 'supperstack_imports_50',
  kind: 'pack'
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
