import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRequest, validateAnswer, OLLAMA_URL } from '../extension/agent-core.js';
const field = { label: 'Treating Dentist SOF', context: 'Write SIGNATURE ON FILE in uppercase.', constraints: { maxLength: 40 } };
const supported = { answer: 'SIGNATURE ON FILE', evidence: 'Signature On File', needs_review: false, reason: 'Matches the bill and uppercase instruction.' };
test('model receives the requested field, page rules, and bill images', () => {
  const request = makeRequest({ field, pageText: 'Treating Dentist Info. ALLOW: A-Z, 0-9', truncated: false }, ['data:image/png;base64,abcd']);
  const input = JSON.parse(request.messages[1].content);
  assert.equal(input.question, field.label); assert.equal(input.field_instructions, field.context);
  assert.match(input.webpage_text, /ALLOW/); assert.deepEqual(request.messages[1].images, ['abcd']);
  assert.equal(request.stream, false); assert.equal(OLLAMA_URL, 'http://127.0.0.1:11434');
  assert.match(request.messages[0].content, /Existing website field answers are NOT evidence/);
});
test('supported answers can fill while ambiguity or missing evidence requires review', () => {
  assert.equal(validateAnswer(supported, field).needs_review, false);
  assert.equal(validateAnswer({ ...supported, needs_review: true }, field).needs_review, true);
  assert.equal(validateAnswer({ ...supported, evidence: '' }, field).needs_review, true);
});
test('full OCR dumps and invalid field values are held for review', () => {
  assert.equal(validateAnswer({ ...supported, answer: 'bill text '.repeat(100) }, { constraints: {} }).needs_review, true);
  assert.equal(validateAnswer(supported, { constraints: { maxLength: 5 } }).needs_review, true);
  assert.equal(validateAnswer(supported, { constraints: { pattern: '[0-9]{10}' } }).needs_review, true);
  assert.equal(validateAnswer(supported, { constraints: { type: 'number' } }).needs_review, true);
  assert.throws(() => validateAnswer({ ...supported, needs_review: 'false' }, field));
});
