import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const data = await readFile(root + '/dist' + path);
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html'); res.end(data);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(origin + '/review.html');
  await page.setContent('<h1>Bill</h1><p>Image: bill-001.jpeg</p><section><p>Write SIGNATURE ON FILE in uppercase if printed on the bill.</p><label for="answer">Treating Dentist SOF</label><textarea id="answer"></textarea><button id="accept">Accept</button></section>');
  await page.evaluate(() => {
    window.chrome = { runtime: { onMessage: { addListener: callback => window.agent = callback } } };
    window.accepted = false; document.querySelector('#accept').onclick = () => window.accepted = true;
    window.send = message => new Promise(resolve => window.agent(message, {}, resolve));
  });
  await page.addScriptTag({ content: await readFile(root + '/extension/page-agent.js', 'utf8') });
  const sidebar = await browser.newPage();
  await sidebar.setViewportSize({ width: 400, height: 900 });
  await sidebar.exposeFunction('sendToBill', message => page.evaluate(message => window.send(message), message));
  await sidebar.exposeFunction('captureBill', async () => 'data:image/png;base64,' + (await page.screenshot()).toString('base64'));
  await sidebar.addInitScript(({ origin }) => {
    window.chrome = {
      runtime: { id: 'test-extension' },
      tabs: { query: async () => [{ id: 1, windowId: 1, url: origin + '/bill' }], sendMessage: async (_, message) => window.sendToBill(message), captureVisibleTab: async () => window.captureBill() },
      scripting: { executeScript: async () => {} },
      storage: { local: { get: async () => ({}), set: async () => {} } }
    };
  }, { origin });
  let requests = [], needsReview = false;
  await sidebar.route('http://127.0.0.1:11434/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/api/tags')) return route.fulfill({ json: { models: [{ name: 'qwen3-vl:2b' }] } });
    const body = route.request().postDataJSON(); requests.push(body);
    const npi = JSON.parse(body.messages[1].content).question.includes('NPI');
    await route.fulfill({ json: { message: { content: JSON.stringify({ answer: npi ? '1598837155' : 'SIGNATURE ON FILE', evidence: npi ? 'NPI: 1598837155' : 'Signature On File', needs_review: needsReview, reason: needsReview ? 'Bill is unclear.' : 'Matches the fixture’s field instruction.' }) } } });
  });
  sidebar.on('pageerror', error => console.error('Sidebar browser error:', error.message));
  await sidebar.goto(origin + '/sidebar.html');
  try { await sidebar.waitForFunction(() => document.querySelector('#question').textContent === 'Treating Dentist SOF', null, { timeout: 10000 }); }
  catch (error) { console.error(await sidebar.locator('#status').textContent()); throw error; }
  await sidebar.locator('#analyze').click();
  await sidebar.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Answer filled'));
  assert.equal(await page.locator('#answer').inputValue(), 'SIGNATURE ON FILE');
  assert.equal(await page.evaluate(() => window.accepted), false);
  const input = JSON.parse(requests[0].messages[1].content);
  assert.match(input.field_instructions, /uppercase/); assert.match(input.webpage_text, /bill-001/);
  assert.equal(requests[0].messages[1].images.length, 1);
  console.log('Sidebar screenshot, instruction payload, and automatic fill passed (model and Chrome APIs mocked).');
  needsReview = true;
  await page.locator('#answer').fill('');
  await sidebar.locator('#analyze').click();
  await sidebar.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Needs review'));
  assert.equal(await page.locator('#answer').inputValue(), '');
  console.log('Uncertain answer paused without filling.');
  let snapshot = await page.evaluate(() => window.send({ type: 'agent-snapshot' }));
  await page.evaluate(() => document.querySelector('label').textContent = 'Treating Dentist NPI');
  let response = await page.evaluate(token => window.send({ type: 'agent-fill', token, text: 'wrong' }), snapshot.token);
  assert.match(response.error, /changed/); assert.equal(await page.locator('#answer').inputValue(), '');
  snapshot = await page.evaluate(() => window.send({ type: 'agent-snapshot' }));
  await page.locator('#answer').fill('User correction');
  response = await page.evaluate(token => window.send({ type: 'agent-fill', token, text: 'wrong' }), snapshot.token);
  assert.match(response.error, /changed/); assert.equal(await page.locator('#answer').inputValue(), 'User correction');
  console.log('Changed-question and user-edit protections passed. Accept remained untouched.');
  needsReview = false;
  await page.locator('#answer').fill('');
  await sidebar.locator('#auto').check();
  await page.waitForFunction(() => document.querySelector('#answer').value === '1598837155');
  await page.evaluate(() => { document.querySelector('label').textContent = 'Treating Dentist SOF'; document.querySelector('#answer').value = ''; });
  await page.waitForFunction(() => document.querySelector('#answer').value === 'SIGNATURE ON FILE', null, { timeout: 10000 });
  await sidebar.locator('#auto').uncheck();
  assert.equal(await page.evaluate(() => window.accepted), false);
  console.log('Automatic continuation detected a new question and filled its answer.');
} finally { await browser.close(); server.close(); }
