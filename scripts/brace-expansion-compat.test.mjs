import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const legacyExpand = require('brace-expansion');

test('preserves the callable API expected by legacy minimatch releases', () => {
  assert.deepEqual(legacyExpand('file.{ts,js}'), ['file.ts', 'file.js']);
});

test('exposes the bounded modern API used by patched minimatch releases', async () => {
  const modern = await import('brace-expansion');

  assert.equal(legacyExpand.expand, legacyExpand);
  assert.equal(typeof modern.expand, 'function');

  const results = legacyExpand.expand('{a,b}'.repeat(100), {
    max: 100_000,
    maxLength: 1_000
  });
  const totalLength = results.reduce((sum, result) => sum + result.length, 0);

  assert.equal(results.length, 10);
  assert.equal(totalLength, 1_000);
});
