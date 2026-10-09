(() => {
  if (window.__teleAgentSidebar) return;
  window.__teleAgentSidebar = true;
  let pending;
  const fields = new Map();
  const ids = new WeakMap();
  const visible = node => { const r = node.getBoundingClientRect(); const s = getComputedStyle(node); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
  const usable = node => !node.disabled && !node.readOnly && visible(node) && (node instanceof HTMLTextAreaElement || (node instanceof HTMLInputElement && ['text', 'search', 'tel', 'number', 'email', 'url', ''].includes(node.type)));
  const tidy = text => (text || '').replace(/\b\d+s\b/g, '').replace(/\s+/g, ' ').trim();
  function label(node) {
    const labelled = (node.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
    return tidy([...node.labels || []].map(n => n.textContent).join(' ') || labelled || node.getAttribute('aria-label') || node.closest('fieldset')?.querySelector('legend')?.textContent || node.placeholder || node.name || 'Unlabelled answer field');
  }
  function context(node) {
    const description = (node.getAttribute('aria-describedby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
    let ancestor = node.parentElement, text = '';
    for (let depth = 0; ancestor && depth < 4; depth++, ancestor = ancestor.parentElement) {
      const current = tidy(ancestor.innerText);
      if (current.length > 3500) break;
      text = current;
    }
    return tidy(description + ' ' + text).slice(0, 3500);
  }
  function scan() {
    fields.clear();
    return [...document.querySelectorAll('textarea,input')].filter(usable).map(node => {
      if (!ids.has(node)) ids.set(node, crypto.randomUUID());
      const id = ids.get(node); fields.set(id, node);
      return { id, label: label(node), context: context(node), focused: node === document.activeElement, constraints: { type: node.type, maxLength: node.maxLength, pattern: node.getAttribute('pattern'), required: node.required } };
    });
  }
  function fingerprint(node) {
    return JSON.stringify({ url: location.href, label: label(node), context: context(node), images: [...document.images].filter(n => n.naturalWidth >= 350 && n.naturalHeight >= 100).map(n => [n.currentSrc, n.naturalWidth, n.naturalHeight]), document: document.body.innerText.match(/Image:\s*([^\n]+)/)?.[1] || '' });
  }
  function snapshot(id) {
    const candidates = scan();
    const answerAreas = candidates.filter(f => f.constraints.type === 'textarea');
    const field = id ? candidates.find(f => f.id === id) : candidates.find(f => f.focused) || (answerAreas.length === 1 ? answerAreas[0] : candidates.length === 1 ? candidates[0] : null);
    if (!field) return { fields: candidates, ambiguous: true };
    const node = fields.get(field.id), key = fingerprint(node);
    const text = document.body.innerText || '';
    return { field, fields: candidates, key, pageText: text.slice(0, 24000), truncated: text.length > 24000, url: location.href };
  }
  function documentImages() {
    const candidates = [...document.images].filter(node => node.naturalWidth >= 350 && node.naturalHeight >= 100 && visible(node)).sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
    const result = [], seen = new Set();
    for (const image of candidates) {
      if (seen.has(image.currentSrc)) continue;
      seen.add(image.currentSrc);
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        result.push(canvas.toDataURL('image/png'));
      } catch { /* Cross-origin images still appear in the viewport screenshot. */ }
      if (result.length === 2) break;
    }
    return result;
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!['agent-scan', 'agent-snapshot', 'agent-fill'].includes(message.type)) return;
    try {
      if (message.type === 'agent-scan') { const current = snapshot(message.fieldId); respond(current); return; }
      if (message.type === 'agent-snapshot') {
        const current = snapshot(message.fieldId);
        if (current.ambiguous) { respond(current); return; }
        const node = fields.get(current.field.id), token = crypto.randomUUID();
        pending = { node, token, key: current.key, value: node.value };
        respond({ ...current, token, images: documentImages() }); return;
      }
      if (!pending || pending.token !== message.token || !pending.node.isConnected || !usable(pending.node) || fingerprint(pending.node) !== pending.key || pending.node.value !== pending.value) throw new Error('The page, question, or field changed while AI was working. Analyze the current question again.');
      const node = pending.node;
      const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const previous = node.value;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, message.text);
      if (!node.checkValidity()) {
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, previous);
        throw new Error('The answer does not match this field’s format. Review it manually.');
      }
      node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true }));
      pending = null;
      if (node.value !== message.text) throw new Error('The website rejected the answer. Check its format.');
      respond({ ok: true });
    } catch (error) { respond({ error: error.message }); }
  });
})();
