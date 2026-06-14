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
      errorType: 'none',
      moderation: {
        flagged: true,
        blocked: false,
        categories: ['violence/graphic'],
        maxScore: 0.72,
        mode: 'observe'
      }
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
    const summary = secondStore.summary();
    assert.equal(summary.daily[0].moderationFlagged, 1);
    assert.equal(summary.daily[0].moderationBlocked, 0);
    assert.equal(summary.recent.find((event) => event.statusCode === 200).moderationCategories, 'violence/graphic');
    secondStore.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
