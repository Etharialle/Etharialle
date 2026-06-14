import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { extractRecipeFromUrl } from './extractor.mjs';
import { htmlToText, extractJsonLd } from './sanitize.mjs';
import { normalizeRecipe } from './recipeSchema.mjs';

test('htmlToText removes page furniture and keeps readable recipe text', () => {
  const text = htmlToText('<html><style>.ad{}</style><script>alert(1)</script><h1>Soup</h1><p>Heat oven to 375°F.</p></html>');
  assert.equal(text.includes('alert'), false);
  assert.equal(text.includes('Soup'), true);
  assert.equal(text.includes('375°F'), true);
});

test('extractJsonLd returns recipe metadata blocks', () => {
  const jsonLd = extractJsonLd('<script type="application/ld+json">{"@type":"Recipe"}</script>');
  assert.equal(jsonLd, '{"@type":"Recipe"}');
});

test('normalizeRecipe leaves missing values blank without inventing data', () => {
  const recipe = normalizeRecipe({ title: 'Kale Pasta', ingredients: [' kale ', null], steps: ['Cook pasta'] }, 'https://example.com/kale');
  assert.deepEqual(recipe, {
    sourceUrl: 'https://example.com/kale',
    title: 'Kale Pasta',
    ingredients: ['kale'],
    prepTime: '',
    cookTime: '',
    totalTime: '',
    cookTemperature: '',
    servings: '',
    steps: ['Cook pasta'],
    notes: ''
  });
});

test('extractRecipeFromUrl rejects non-recipe pages with a useful error', async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><h1>About our farm</h1><p>Weekly news and signup details.</p></html>');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const port = server.address().port;
    await assert.rejects(
      () => extractRecipeFromUrl(`http://127.0.0.1:${port}/not-a-recipe`),
      /did not contain enough recipe detail/
    );
  } finally {
    server.close();
  }
});
