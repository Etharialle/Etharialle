import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderUsageDashboard } from './usageDashboard.mjs';

test('renderUsageDashboard shows moderation columns and highlighted flagged rows', () => {
  const html = renderUsageDashboard({
    daily: [{
      day: '2026-06-14',
      testerId: 'kit',
      statusCode: 200,
      errorType: 'none',
      requests: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      moderationFlagged: 1,
      moderationBlocked: 0
    }],
    monthly: [],
    recent: [{
      createdAt: '2026-06-14T12:00:00.000Z',
      testerId: 'kit',
      sourceHost: 'example.com',
      statusCode: 200,
      errorType: 'none',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      moderationFlagged: 1,
      moderationBlocked: 0,
      moderationCategories: 'violence/graphic',
      moderationMaxScore: 0.72,
      moderationMode: 'observe'
    }]
  });

  assert.equal(html.includes('Moderation flags are safety signals from OpenAI.'), true);
  assert.equal(html.includes('Moderation Flagged'), true);
  assert.equal(html.includes('moderation-flagged'), true);
  assert.equal(html.includes('Flagged 1'), true);
  assert.equal(html.includes('violence/graphic'), true);
  assert.equal(html.includes('observe'), true);
});
