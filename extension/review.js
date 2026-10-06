import { createWorker } from 'tesseract.js';
import { cropBounds, cleanText } from './ocr-utils.js';
const id = location.hash.slice(1);
const status = document.querySelector('#status'), answer = document.querySelector('#answer'), fill = document.querySelector('#fill');
let worker;
document.querySelector('#clear').onclick = async () => { await chrome.storage.session.remove(id); window.close(); };
fill.onclick = async () => {
  fill.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'fill', id, text: answer.value });
    if (result?.error) throw new Error(result.error);
    answer.disabled = true;
    status.textContent = 'Filled. Review the value on the website, then click Accept yourself.';
  } catch (error) { status.textContent = error.message; fill.disabled = false; }
};
async function run() {
  const stored = await chrome.storage.session.get(id), job = stored[id];
  if (!job) throw new Error('Selection expired. Return to the website and select again.');
  document.querySelector('#label').textContent = job.label;
  const image = new Image(); image.src = job.image; await image.decode();
  const bounds = cropBounds(job.region, job.viewport, { width: image.naturalWidth, height: image.naturalHeight });
  const canvas = document.querySelector('#crop');
  canvas.width = bounds.width * 2; canvas.height = bounds.height * 2;
  canvas.getContext('2d').drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);
  // Retain only the cropped bill region in transient session storage.
  await chrome.storage.session.set({ [id]: { tabId: job.tabId, token: job.token, label: job.label } });
  worker = await createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
    corePath: chrome.runtime.getURL('ocr/core'),
    langPath: chrome.runtime.getURL('ocr/lang'),
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: progress => { status.textContent = `${progress.status} ${Math.round((progress.progress || 0) * 100)}%`; }
  });
  const { data } = await worker.recognize(canvas);
  answer.value = cleanText(data.text);
  answer.disabled = false; fill.disabled = false;
  status.textContent = answer.value ? `OCR finished (reported confidence ${Math.round(data.confidence)}%). Verify every character.` : 'No text found. Enter the answer manually or select a clearer region.';
}
run().catch(error => { status.textContent = 'Could not read the bill: ' + error.message; }).finally(async () => { if (worker) await worker.terminate(); });
