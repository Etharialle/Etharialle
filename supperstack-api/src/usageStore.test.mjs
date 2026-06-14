import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createUsageStore } from './usageStore.mjs';

test('successfulExtractionsToday persists across store recreation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'supperstack-usage-'));
  const dbPath = join(dir, 'usage.sqlite');

  try {
    const firstStore = createUsageStore(dbPath);
    firstStore.record({
      createdAt: '2026-06-14T12:00:00.000Z',
      testerId: 'kit',
      sourceHost: 'example.com',
      statusCode: 200,
      errorType: 'none'
    });
    firstStore.record({
      createdAt: '2026-06-14T12:01:00.000Z',
      testerId: 'kit',
      sourceHost: 'example.com',
      statusCode: 422,
      errorType: 'not_enough_recipe_detail'
    });
    firstStore.close();

    const secondStore = createUsageStore(dbPath);

    assert.equal(secondStore.successfulExtractionsToday('kit', '2026-06-14'), 1);
    assert.equal(secondStore.successfulExtractionsToday('other', '2026-06-14'), 0);
    secondStore.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
