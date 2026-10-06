import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MV3 worker policy permits only bundled workers', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const review = await readFile(new URL('../extension/review.js', import.meta.url), 'utf8');
  const directives = Object.fromEntries(manifest.content_security_policy.extension_pages.split(';').map(value => value.trim().split(/\s+/)).filter(parts => parts[0]).map(([name, ...sources]) => [name, sources]));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(directives['worker-src'], ["'self'"]);
  assert.deepEqual(directives['script-src'], ["'self'", "'wasm-unsafe-eval'"]);
  assert.match(review, /workerBlobURL:\s*false/);
});
