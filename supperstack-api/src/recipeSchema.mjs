export const recipeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'sourceUrl',
    'title',
    'ingredients',
    'prepTime',
    'cookTime',
    'totalTime',
    'cookTemperature',
    'servings',
    'steps',
    'notes'
  ],
  properties: {
    sourceUrl: { type: 'string' },
    title: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
    prepTime: { type: 'string' },
    cookTime: { type: 'string' },
    totalTime: { type: 'string' },
    cookTemperature: { type: 'string' },
    servings: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' }
  }
};

export function normalizeRecipe(candidate, sourceUrl) {
  return {
    sourceUrl,
    title: stringOrEmpty(candidate?.title),
    ingredients: stringArray(candidate?.ingredients),
    prepTime: stringOrEmpty(candidate?.prepTime),
    cookTime: stringOrEmpty(candidate?.cookTime),
    totalTime: stringOrEmpty(candidate?.totalTime),
    cookTemperature: stringOrEmpty(candidate?.cookTemperature),
    servings: stringOrEmpty(candidate?.servings),
    steps: stringArray(candidate?.steps),
    notes: stringOrEmpty(candidate?.notes)
  };
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => stringOrEmpty(item)).filter(Boolean)
    : [];
}
