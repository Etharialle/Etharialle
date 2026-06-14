import { normalizeRecipe, recipeSchema } from './recipeSchema.mjs';
import { extractJsonLd, htmlToText } from './sanitize.mjs';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function extractRecipeFromUrl(sourceUrl) {
  const html = await fetchRecipePage(sourceUrl);
  const pageText = htmlToText(html);
  const jsonLd = extractJsonLd(html);

  if (!OPENAI_API_KEY) {
    const recipe = heuristicRecipe(sourceUrl, pageText);
    ensureRecipeLike(recipe);
    return {
      recipe,
      extractionMode: 'heuristic'
    };
  }

  const result = await extractWithOpenAI({ sourceUrl, pageText, jsonLd });
  ensureRecipeLike(result.recipe);
  return { ...result, extractionMode: 'ai' };
}

async function fetchRecipePage(sourceUrl) {
  const response = await fetch(sourceUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: {
      'user-agent': 'SupperstackRecipeExtractor/0.1 (+local MVP)'
    }
  });

  if (!response.ok) {
    throw httpError(`Recipe page returned HTTP ${response.status}.`, 502);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw httpError('That link does not look like an HTML recipe page.', 400);
  }

  return response.text();
}

async function extractWithOpenAI({ sourceUrl, pageText, jsonLd }) {
  const prompt = [
    'Distill this recipe page into one concise recipe JSON object.',
    'Strip blog narrative, ads, comments, navigation, newsletter text, and duplicate instructions.',
    'Preserve ingredient quantities and units exactly when available.',
    'Extract oven or cooking temperatures into cookTemperature or the relevant instruction step.',
    'Leave unknown fields as empty strings or empty arrays. Do not invent missing details.',
    '',
    `Source URL: ${sourceUrl}`,
    jsonLd ? `JSON-LD candidates:\n${jsonLd}` : 'JSON-LD candidates: none found',
    '',
    `Visible page text:\n${pageText}`
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'recipe',
          schema: recipeSchema,
          strict: true
        }
      }
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw httpError(payload?.error?.message || 'OpenAI recipe extraction failed.', 502);
  }

  const outputText = payload?.output_text || payload?.output?.flatMap((item) => item.content || [])
    .find((content) => content.type === 'output_text')?.text;

  if (!outputText) {
    throw httpError('OpenAI returned no recipe text.', 502);
  }

  return {
    recipe: normalizeRecipe(JSON.parse(outputText), sourceUrl),
    usage: normalizeUsage(payload?.usage)
  };
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined;

  return {
    inputTokens: Number(usage.input_tokens || 0),
    outputTokens: Number(usage.output_tokens || 0),
    totalTokens: Number(usage.total_tokens || 0)
  };
}

function heuristicRecipe(sourceUrl, pageText) {
  const lines = pageText.split('\n').map((line) => line.trim()).filter(Boolean);
  const title = lines.find((line) => line.length > 8 && line.length < 90) || '';
  const temp = pageText.match(/\b\d{3}\s?°?\s?F\b|\b\d{3}\s?degrees\b/i)?.[0] || '';
  const ingredientStart = lines.findIndex((line) => /ingredients?/i.test(line));
  const instructionStart = lines.findIndex((line) => /(instructions?|directions?|method|preparation)/i.test(line));
  const ingredients = ingredientStart >= 0
    ? lines.slice(ingredientStart + 1, instructionStart > ingredientStart ? instructionStart : ingredientStart + 16).slice(0, 20)
    : [];
  const steps = instructionStart >= 0
    ? lines.slice(instructionStart + 1, instructionStart + 9).slice(0, 8)
    : [];

  return normalizeRecipe({
    title,
    ingredients,
    prepTime: firstMatch(pageText, /prep(?:aration)? time:?\s*([^\n.]+)/i),
    cookTime: firstMatch(pageText, /cook time:?\s*([^\n.]+)/i),
    totalTime: firstMatch(pageText, /total time:?\s*([^\n.]+)/i),
    cookTemperature: temp,
    servings: firstMatch(pageText, /serv(?:es|ings)?:?\s*([^\n.]+)/i),
    steps,
    notes: 'Heuristic draft only. Set OPENAI_API_KEY on the server for AI-assisted extraction.'
  }, sourceUrl);
}

function firstMatch(value, pattern) {
  return value.match(pattern)?.[1]?.trim().slice(0, 80) || '';
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureRecipeLike(recipe) {
  if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
    throw httpError('That page did not contain enough recipe detail to extract.', 422);
  }
}

