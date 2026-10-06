import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.includes('..')) throw new Error();
    const data = await readFile(root + '/dist' + path);
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.setHeader('Content-Type', type); res.end(data);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const source = await browser.newPage();
  await source.goto(origin + '/review.html');
  const image = await source.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 100; const x = c.getContext('2d');
    x.fillStyle = 'white'; x.fillRect(0, 0, 600, 100); x.fillStyle = 'black'; x.font = '36px Arial'; x.fillText('Signature On File', 20, 65);
    return c.toDataURL();
  });
  const review = await browser.newPage();
  await review.addInitScript(({ origin, image }) => {
    window.jobs = { smoke: { image, region: { x: 0, y: 0, width: 600, height: 100 }, viewport: { width: 600, height: 100 }, label: 'Treating Dentist SOF', token: 'smoke', tabId: 1 } };
    window.chrome = { runtime: { getURL: path => origin + '/' + path }, storage: { session: { get: async id => ({ [id]: window.jobs[id] }), set: async data => Object.assign(window.jobs, data), remove: async id => delete window.jobs[id] } } };
  }, { origin, image });
  // All browser HTTP requests must remain on the local test server.
  await review.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await review.goto(origin + '/review.html#smoke');
  await review.waitForFunction(() => !document.querySelector('#answer').disabled || document.querySelector('#status').textContent.startsWith('Could not'), null, { timeout: 60000 });
  const text = await review.locator('#answer').inputValue();
  assert.match(text, /Signature On File/);
  assert.equal(await review.evaluate(() => window.jobs.smoke.image), undefined);
  console.log('Offline Chromium OCR passed:', text, '(Chrome storage API mocked). Screenshot purged.');
  await source.setContent('<label for="answer">Treating Dentist SOF</label><textarea id="answer"></textarea><button id="accept">Accept</button>');
  await source.evaluate(image => {
    window.messages = []; window.accepted = false;
    window.chrome = { runtime: { onMessage: { addListener: callback => window.listener = callback }, sendMessage: async message => {
      window.messages.push(message); return message.type === 'capture' ? { image } : { ok: true };
    } } };
    document.querySelector('#accept').onclick = () => window.accepted = true;
  }, image);
  await source.addScriptTag({ content: await readFile(root + '/extension/content.js', 'utf8') });
  await source.evaluate(() => window.listener({ type: 'select-field' }, {}, () => {}));
  await source.locator('#answer').click();
  await source.waitForFunction(() => [...document.querySelectorAll('div')].some(n => n.style.cursor === 'crosshair'));
  await source.mouse.move(10, 10); await source.mouse.down(); await source.mouse.move(220, 80); await source.mouse.up();
  await source.waitForFunction(() => window.messages.some(m => m.type === 'review'));
  const result = await source.evaluate(() => {
    const job = window.messages.find(m => m.type === 'review').job;
    let response; window.listener({ type: 'fill', token: job.token, text: 'Signature On File' }, {}, value => response = value);
    return { response, text: document.querySelector('#answer').value, accepted: window.accepted };
  });
  assert.equal(result.response.ok, true); assert.equal(result.text, 'Signature On File'); assert.equal(result.accepted, false);
  console.log('Chromium DOM selection/fill passed; Accept untouched (extension messaging mocked).');
} finally { await browser.close(); server.close(); }
