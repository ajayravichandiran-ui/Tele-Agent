import test from 'node:test';
import assert from 'node:assert/strict';
import { cropBounds, cleanText } from '../extension/ocr-utils.js';
test('crop uses screenshot pixel scale rather than CSS coordinates', () => {
  assert.deepEqual(cropBounds({ x: 10, y: 20, width: 100, height: 30 }, { width: 1000, height: 500 }, { width: 2000, height: 1000 }), { x: 20, y: 40, width: 200, height: 60 });
});
test('crop clamps at screenshot edges', () => {
  assert.deepEqual(cropBounds({ x: 90, y: 90, width: 20, height: 20 }, { width: 100, height: 100 }, { width: 100, height: 100 }), { x: 90, y: 90, width: 10, height: 10 });
});
test('invalid and out-of-image selections fail', () => {
  assert.throws(() => cropBounds({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 100 }, { width: 100, height: 100 }));
  assert.throws(() => cropBounds({ x: 101, y: 0, width: 10, height: 10 }, { width: 100, height: 100 }, { width: 100, height: 100 }));
});
test('crop removes the portion outside the left and top edges', () => {
  assert.deepEqual(cropBounds({ x: -10, y: -20, width: 40, height: 50 }, { width: 100, height: 100 }, { width: 100, height: 100 }), { x: 0, y: 0, width: 30, height: 30 });
});
test('OCR normalization preserves case, punctuation and multiline addresses', () => {
  assert.equal(cleanText('  Signature On File\r\nDN16363  '), 'Signature On File\nDN16363');
});
