import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyBillingPurchase } from './billingVerifier.mjs';

const packProduct = {
  productId: 'supperstack_imports_50',
  kind: 'pack'
};

test('mock billing token verifies for internal test builds', async () => {
  const result = await verifyBillingPurchase({
    product: packProduct,
    purchaseToken: 'mock:test-purchase'
  });

  assert.deepEqual(result, { verified: true, provider: 'mock' });
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
