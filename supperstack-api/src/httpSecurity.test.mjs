import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyCorsHeaders,
  loadAllowedOrigins,
  privateErrorMessage,
  publicErrorMessage
} from './httpSecurity.mjs';

test('loadAllowedOrigins parses comma-separated origins', () => {
  const origins = loadAllowedOrigins('https://app.example, https://admin.example ');

  assert.equal(origins.has('https://app.example'), true);
  assert.equal(origins.has('https://admin.example'), true);
});

test('applyCorsHeaders only allows configured origins', () => {
  const allowedResponse = fakeResponse();
  const deniedResponse = fakeResponse();
  const origins = loadAllowedOrigins('https://allowed.example');

  assert.equal(applyCorsHeaders(fakeRequest('https://allowed.example'), allowedResponse, origins), true);
  assert.equal(allowedResponse.headers['Access-Control-Allow-Origin'], 'https://allowed.example');

  assert.equal(applyCorsHeaders(fakeRequest('https://denied.example'), deniedResponse, origins), false);
  assert.equal(deniedResponse.headers['Access-Control-Allow-Origin'], undefined);
});

test('publicErrorMessage hides server-side details while privateErrorMessage keeps them for logs', () => {
  const error = new Error('OpenAI project org rate limit details');
  error.statusCode = 502;

  assert.equal(publicErrorMessage(error), 'Recipe extraction failed. Please try again later.');
  assert.equal(privateErrorMessage(error), 'OpenAI project org rate limit details');
});

function fakeRequest(origin) {
  return { headers: { origin } };
}

function fakeResponse() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    }
  };
}
