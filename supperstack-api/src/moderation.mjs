const DEFAULT_MODERATION_MODEL = 'omni-moderation-latest';
const DEFAULT_BLOCK_CATEGORIES = [
  'sexual/minors',
  'self-harm/instructions',
  'violence/graphic'
];
const DEFAULT_BLOCK_SCORE = 0.85;

export function loadModerationConfig(env = process.env) {
  const mode = normalizeMode(env.MODERATION_MODE || 'observe');
  return {
    mode,
    model: env.OPENAI_MODERATION_MODEL || DEFAULT_MODERATION_MODEL,
    blockCategories: parseList(env.MODERATION_BLOCK_CATEGORIES).length
      ? parseList(env.MODERATION_BLOCK_CATEGORIES)
      : DEFAULT_BLOCK_CATEGORIES,
    blockScore: Number(env.MODERATION_BLOCK_SCORE || DEFAULT_BLOCK_SCORE)
  };
}

export function moderationRequest(config) {
  return config.mode === 'off' ? undefined : { model: config.model };
}

export function normalizeModeration(payload, config = loadModerationConfig()) {
  const results = collectModerationResults(payload);
  const categories = new Set();
  let flagged = false;
  let maxScore = 0;
  const categoryScores = {};

  for (const result of results) {
    flagged = flagged || Boolean(result.flagged);

    for (const [category, value] of Object.entries(result.categories || {})) {
      if (value) categories.add(category);
    }

    for (const [category, value] of Object.entries(result.category_scores || result.categoryScores || {})) {
      const score = Number(value || 0);
      if (!Number.isFinite(score)) continue;

      categoryScores[category] = Math.max(categoryScores[category] || 0, score);
      maxScore = Math.max(maxScore, score);
    }
  }

  for (const [category, score] of Object.entries(categoryScores)) {
    if (score >= config.blockScore) categories.add(category);
  }

  const categoryList = [...categories].sort();
  const blocked = config.mode === 'enforce'
    && categoryList.some((category) => config.blockCategories.includes(category) && (categoryScores[category] || 0) >= config.blockScore);

  return {
    flagged,
    blocked,
    categories: categoryList,
    maxScore: Number(maxScore.toFixed(4)),
    mode: config.mode
  };
}

function collectModerationResults(value, results = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);

  if (typeof value.flagged === 'boolean' && (value.categories || value.category_scores || value.categoryScores)) {
    results.push(value);
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) collectModerationResults(item, results, seen);
    } else if (child && typeof child === 'object') {
      collectModerationResults(child, results, seen);
    }
  }

  return results;
}

function normalizeMode(value) {
  return ['off', 'observe', 'enforce'].includes(value) ? value : 'observe';
}

function parseList(value = '') {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
