import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { extractRecipeFromUrl, extractWithOpenAI, fetchRecipePage } from './extractor.mjs';
import { htmlToText, extractJsonLd } from './sanitize.mjs';
import { normalizeRecipe } from './recipeSchema.mjs';
import { assertSafeHttpUrl, isBlockedIp, parseHttpUrl } from './urlSafety.mjs';

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
      () => extractRecipeFromUrl(`http://127.0.0.1:${port}/not-a-recipe`, {
        allowPrivateHosts: true,
        useOpenAI: false
      }),
      /did not contain enough recipe detail/
    );
  } finally {
    server.close();
  }
});

test('extractRecipeFromUrl extracts a local recipe only when tests opt into private hosts', async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`
      <html>
        <h1>Spring Pea Soup</h1>
        <h2>Ingredients</h2>
        <ul><li>2 cups peas</li><li>1 cup stock</li><li>1 tsp lemon juice</li></ul>
        <h2>Instructions</h2>
        <ol><li>Simmer peas with stock for 8 minutes.</li><li>Blend with lemon juice.</li></ol>
      </html>
    `);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const port = server.address().port;
    const result = await extractRecipeFromUrl(`http://127.0.0.1:${port}/recipe`, {
      allowPrivateHosts: true,
      useOpenAI: false
    });

    assert.equal(result.extractionMode, 'heuristic');
    assert.equal(result.recipe.title, 'Spring Pea Soup');
    assert.equal(result.recipe.ingredients.length >= 2, true);
    assert.equal(result.recipe.steps.length >= 1, true);
  } finally {
    server.close();
  }
});

test('extractRecipeFromUrl blocks loopback URLs by default', async () => {
  await assert.rejects(
    () => extractRecipeFromUrl('http://127.0.0.1:8787/recipe', { useOpenAI: false }),
    /private or internal network|not allowed/
  );
});

test('fetchRecipePage rejects redirects that resolve to private hosts', async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
      response.end();
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html></html>');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const port = server.address().port;
    await assert.rejects(
      () => fetchRecipePage(`http://127.0.0.1:${port}/redirect`, { allowPrivateHosts: true }),
      /private or internal network/
    );
  } finally {
    server.close();
  }
});

test('fetchRecipePage stops reading pages that exceed the byte limit', async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<html>${'x'.repeat(256)}</html>`);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const port = server.address().port;
    await assert.rejects(
      () => fetchRecipePage(`http://127.0.0.1:${port}/large`, {
        allowPrivateHosts: true,
        maxHtmlBytes: 128
      }),
      /too large/
    );
  } finally {
    server.close();
  }
});

test('URL safety rejects unsupported protocols and private DNS results', async () => {
  assert.throws(() => parseHttpUrl('file:///etc/passwd'), /http:\/\/ or https:\/\//);
  assert.equal(isBlockedIp('10.0.0.5'), true);
  assert.equal(isBlockedIp('169.254.169.254'), true);
  assert.equal(isBlockedIp('8.8.8.8'), false);

  await assert.rejects(
    () => assertSafeHttpUrl('https://recipe.example/soup', {
      lookup: async () => [{ address: '192.168.1.10' }]
    }),
    /private or internal network/
  );
});

test('extractWithOpenAI includes moderation request in observe mode', async () => {
  let requestBody;
  const result = await extractWithOpenAI({
    sourceUrl: 'https://example.com/soup',
    pageText: 'Spring Pea Soup Ingredients 2 cups peas 1 cup stock Instructions Simmer and blend.',
    jsonLd: ''
  }, {
    openAiApiKey: 'test-key',
    moderationConfig: { mode: 'observe', model: 'omni-moderation-latest', blockCategories: [], blockScore: 0.85 },
    fetchImpl: async (url, options) => {
      requestBody = JSON.parse(options.body);
      return openAiResponse({
        output_text: JSON.stringify({
          sourceUrl: 'https://example.com/soup',
          title: 'Spring Pea Soup',
          ingredients: ['2 cups peas', '1 cup stock'],
          prepTime: '',
          cookTime: '',
          totalTime: '',
          cookTemperature: '',
          servings: '',
          steps: ['Simmer and blend.'],
          notes: ''
        }),
        moderation_results: [{
          flagged: true,
          categories: { harassment: true },
          category_scores: { harassment: 0.42 }
        }]
      });
    }
  });

  assert.deepEqual(requestBody.moderation, { model: 'omni-moderation-latest' });
  assert.equal(result.moderation.flagged, true);
  assert.equal(result.moderation.blocked, false);
});

test('extractWithOpenAI blocks configured moderation categories in enforce mode', async () => {
  await assert.rejects(
    () => extractWithOpenAI({
      sourceUrl: 'https://example.com/soup',
      pageText: 'Untrusted page text.',
      jsonLd: ''
    }, {
      openAiApiKey: 'test-key',
      moderationConfig: {
        mode: 'enforce',
        model: 'omni-moderation-latest',
        blockCategories: ['sexual/minors'],
        blockScore: 0.85
      },
      fetchImpl: async () => openAiResponse({
        output_text: JSON.stringify({
          sourceUrl: 'https://example.com/soup',
          title: 'Spring Pea Soup',
          ingredients: ['2 cups peas', '1 cup stock'],
          prepTime: '',
          cookTime: '',
          totalTime: '',
          cookTemperature: '',
          servings: '',
          steps: ['Simmer and blend.'],
          notes: ''
        }),
        moderation_results: [{
          flagged: true,
          categories: { 'sexual/minors': true },
          category_scores: { 'sexual/minors': 0.91 }
        }]
      })
    }),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.equal(error.errorType, 'moderation_blocked');
      assert.equal(error.publicMessage, 'This page could not be extracted safely.');
      assert.equal(error.moderation.blocked, true);
      return true;
    }
  );
});

function openAiResponse(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  };
}
