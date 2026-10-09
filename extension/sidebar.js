import { OLLAMA_URL, DEFAULT_MODEL, makeRequest, validateAnswer } from './agent-core.js';
const $ = id => document.getElementById(id);
$('origin-command').textContent = `[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://${chrome.runtime.id}", "User")`;
let busy = false, controller, job, currentTab, lastKey, autoTab;
const status = text => { $('status').textContent = text; };
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Open your bill website, then click the Tele-Agent toolbar icon.');
  if (autoTab && tab.id !== autoTab) { $('auto').checked = false; autoTab = null; throw new Error('Automatic filling paused because you switched tabs.'); }
  return tab;
}
async function message(tabId, data) {
  let result;
  try { result = await chrome.tabs.sendMessage(tabId, data); }
  catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['page-agent.js'] });
    result = await chrome.tabs.sendMessage(tabId, data);
  }
  if (result?.error) throw new Error(result.error);
  return result;
}
async function scan() {
  const tab = await activeTab();
  const selected = tab.id === currentTab ? $('field').value : '';
  currentTab = tab.id;
  let snapshot = await message(tab.id, { type: 'agent-scan', fieldId: selected });
  if (selected && !snapshot.fields.some(f => f.id === selected)) snapshot = await message(tab.id, { type: 'agent-scan' });
  const remembered = snapshot.fields.some(f => f.id === selected) ? selected : '';
  $('field').replaceChildren(new Option('Detect current field', ''));
  for (const field of snapshot.fields) $('field').add(new Option(field.label, field.id));
  $('field').value = remembered;
  $('question').textContent = snapshot.field ? snapshot.field.label : snapshot.fields.length ? 'Multiple fields found. Choose the question’s field above.' : 'No editable answer field found in the main page.';
  return { tab, snapshot };
}
async function checkAI() {
  $('connection').textContent = 'Checking Ollama…';
  try {
    const response = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Ollama returned HTTP ' + response.status);
    const data = await response.json(), model = $('model').value.trim() || DEFAULT_MODEL;
    const installed = data.models?.some(m => m.name === model || m.model === model);
    $('connection').textContent = installed ? model + ' is installed. Local AI is connected.' : `Connected. Install ${model} with “ollama pull ${model}”.`;
    await chrome.storage.local.set({ visionModel: model });
    return installed;
  } catch {
    $('setup').open = true;
    $('connection').textContent = 'Cannot connect. Open Ollama on this computer. If its logs show a 403 origin error, follow the local-origin setup in README.';
    return false;
  }
}
async function analyze() {
  if (busy) return;
  busy = true; $('analyze').disabled = true; $('manual').disabled = true; $('stop').hidden = false; $('result').hidden = true;
  controller = new AbortController(); job = null;
  const timer = setTimeout(() => controller?.abort(), 240000);
  try {
    const { tab, snapshot: scanned } = await scan();
    if (scanned.ambiguous) throw new Error('Select the answer field above. The agent will read the bill automatically.');
    status('Reading the current field, instructions, and bill images…');
    const snapshot = await message(tab.id, { type: 'agent-snapshot', fieldId: scanned.field.id });
    if (snapshot.ambiguous) throw new Error('The field changed. Analyze again.');
    lastKey = snapshot.key;
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if ((await activeTab()).id !== tab.id) throw new Error('The active tab changed. Analyze the bill tab again.');
    status('Local AI is reading the bill and instructions. The first run may take longer…');
    const response = await fetch(OLLAMA_URL + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(makeRequest(snapshot, [screenshot, ...snapshot.images], $('model').value.trim() || DEFAULT_MODEL)), signal: controller.signal });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(response.status === 404 ? 'Vision model is not installed. Open Local AI setup and run the model download command.' : response.status === 403 ? 'Ollama rejected this extension origin. See the local-origin setup in README.' : data.error || 'Local AI returned HTTP ' + response.status);
    }
    const data = await response.json();
    if (controller.signal.aborted) throw new Error('Analysis stopped.');
    if ((await activeTab()).id !== tab.id) throw new Error('The active tab changed during analysis. Return to the bill and analyze again.');
    const result = validateAnswer(JSON.parse(data.message?.content || '{}'), snapshot.field);
    job = { tabId: tab.id, token: snapshot.token };
    $('answer').value = result.answer; $('evidence').textContent = result.evidence || 'No readable evidence.'; $('reason').textContent = result.reason; $('result').hidden = false;
    if (result.needs_review) {
      $('auto').checked = false; autoTab = null;
      status('Needs review. Nothing was filled. Check the evidence and correct the answer.');
    } else {
      await message(tab.id, { type: 'agent-fill', token: snapshot.token, text: result.answer });
      job = null;
      status('Answer filled from the bill and instructions. Review it, then click Accept on the website.');
    }
  } catch (error) {
    $('auto').checked = false; autoTab = null;
    status(error.name === 'AbortError' ? 'Analysis stopped or timed out. Nothing further was filled.' : error.message === 'Failed to fetch' ? 'Cannot reach local AI. Open Local AI setup and start Ollama.' : error.message);
  } finally {
    clearTimeout(timer); busy = false; controller = null; $('analyze').disabled = false; $('stop').hidden = true; $('manual').disabled = !job;
  }
}
$('analyze').onclick = analyze;
$('refresh').onclick = () => scan().catch(error => status(error.message));
$('field').onchange = () => { lastKey = null; scan().catch(error => status(error.message)); };
$('connect').onclick = checkAI;
$('stop').onclick = () => { $('auto').checked = false; autoTab = null; controller?.abort(); };
$('auto').onchange = async () => {
  if (!$('auto').checked) { autoTab = null; return; }
  try { autoTab = (await activeTab()).id; lastKey = null; await analyze(); }
  catch (error) { $('auto').checked = false; autoTab = null; status(error.message); }
};
$('manual').onclick = async () => {
  if (!job) return;
  try {
    if ((await activeTab()).id !== job.tabId) throw new Error('Return to the original bill tab before filling.');
    await message(job.tabId, { type: 'agent-fill', token: job.token, text: $('answer').value });
    job = null; $('manual').disabled = true; status('Reviewed answer filled. You can now check it and click Accept.');
  } catch (error) { status(error.message); }
};
setInterval(async () => {
  if (!$('auto').checked || busy) return;
  try { const { snapshot } = await scan(); if (!snapshot.ambiguous && snapshot.key !== lastKey) await analyze(); }
  catch (error) { $('auto').checked = false; autoTab = null; status(error.message); }
}, 3000);
async function initialize() {
  const data = await chrome.storage.local.get('visionModel');
  $('model').value = data.visionModel || DEFAULT_MODEL;
  scan().catch(error => status(error.message));
  checkAI();
}
initialize().catch(error => status(error.message));
