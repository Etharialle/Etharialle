import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModerationConfig, moderationRequest, normalizeModeration } from './moderation.mjs';

test('moderationRequest is omitted only when moderation mode is off', () => {
  assert.equal(moderationRequest(loadModerationConfig({ MODERATION_MODE: 'off' })), undefined);
  assert.deepEqual(
    moderationRequest(loadModerationConfig({ MODERATION_MODE: 'observe', OPENAI_MODERATION_MODEL: 'omni-moderation-latest' })),
    { model: 'omni-moderation-latest' }
  );
});

test('normalizeModeration extracts flagged categories and max score', () => {
  const moderation = normalizeModeration({
    moderation_results: [{
      flagged: true,
      categories: { 'violence/graphic': true, harassment: false },
      category_scores: { 'violence/graphic': 0.72, harassment: 0.11 }
    }]
  }, loadModerationConfig({ MODERATION_MODE: 'observe' }));

  assert.deepEqual(moderation, {
    flagged: true,
    blocked: false,
    categories: ['violence/graphic'],
    maxScore: 0.72,
    mode: 'observe'
  });
});

test('normalizeModeration blocks configured high-scoring categories in enforce mode', () => {
  const moderation = normalizeModeration({
    moderation: {
      input: {
        flagged: true,
        categories: { 'sexual/minors': true },
        category_scores: { 'sexual/minors': 0.91 }
      }
    }
  }, loadModerationConfig({
    MODERATION_MODE: 'enforce',
    MODERATION_BLOCK_CATEGORIES: 'sexual/minors',
    MODERATION_BLOCK_SCORE: '0.85'
  }));

  assert.equal(moderation.blocked, true);
  assert.deepEqual(moderation.categories, ['sexual/minors']);
});
