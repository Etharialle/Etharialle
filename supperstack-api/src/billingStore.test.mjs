import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBillingStore } from './billingStore.mjs';

test('starter imports are consumed only when recorded', () => {
  const store = createBillingStore(':memory:');

  assert.equal(store.status('kit').importsRemaining, 5);
  assert.equal(store.canImport('kit'), true);

  store.recordImport({ testerId: 'kit', sourceHost: 'example.com' });

  assert.equal(store.status('kit').importsUsed, 1);
  assert.equal(store.status('kit').importsRemaining, 4);
  store.close();
});

test('verified pack purchase adds imports once per token', () => {
  const store = createBillingStore(':memory:');

  store.recordPurchase({
    testerId: 'kit',
    productId: 'supperstack_imports_50',
    purchaseToken: 'mock:purchase-1'
  });
  store.recordPurchase({
    testerId: 'kit',
    productId: 'supperstack_imports_50',
    purchaseToken: 'mock:purchase-1'
  });

  const status = store.status('kit');
  assert.equal(status.packImports, 50);
  assert.equal(status.importsRemaining, 55);
  store.close();
});

test('purchase token grants only once across tester keys', () => {
  const store = createBillingStore(':memory:');

  store.recordPurchase({
    testerId: 'kit',
    productId: 'supperstack_imports_50',
    purchaseToken: 'mock:shared-token'
  });
  store.recordPurchase({
    testerId: 'other-tester',
    productId: 'supperstack_imports_50',
    purchaseToken: 'mock:shared-token'
  });

  assert.equal(store.status('kit').packImports, 50);
  assert.equal(store.status('other-tester').packImports, 0);
  assert.equal(store.status('other-tester').importsRemaining, 5);
  store.close();
});

test('subscription purchase adds resetting interval allowance', () => {
  const store = createBillingStore(':memory:', {
    now: () => new Date('2026-06-14T10:00:00.000Z')
  });

  const status = store.recordPurchase({
    testerId: 'kit',
    productId: 'supperstack_monthly_100',
    purchaseToken: 'mock:subscription-1'
  });

  assert.equal(status.subscriptionImports, 100);
  assert.equal(status.importsRemaining, 105);
  assert.equal(status.subscription.resetAt, '2026-07-14T00:00:00.000Z');
  store.close();
});
