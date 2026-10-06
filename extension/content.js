(() => {
  if (window.__teleAgentInstalled) return;
  window.__teleAgentInstalled = true;
  let target, token, cleanup;
  const allowed = element => element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && ['text', 'search', 'tel', 'number', 'email', 'url', ''].includes(element.type));
  const notice = text => {
    const node = document.createElement('div');
    node.textContent = text;
    Object.assign(node.style, { position: 'fixed', top: '12px', left: '12px', padding: '14px', background: '#093a43', color: 'white', zIndex: '2147483647', font: '16px system-ui', borderRadius: '8px', pointerEvents: 'none' });
    document.documentElement.append(node);
    return node;
  };
  const request = async message => {
    const result = await chrome.runtime.sendMessage(message);
    if (result?.error) throw new Error(result.error);
    return result;
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'fill') {
      if (message.token !== token || !target?.isConnected || !allowed(target) || target.disabled || target.readOnly) {
        respond({ error: 'The selected field changed. Select it again.' });
        return;
      }
      const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(target, message.text);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.focus();
      if (target.value !== message.text) {
        respond({ error: 'The website rejected this value. Check the field format.' });
      } else {
        token = null;
        respond({ ok: true });
      }
      return;
    }
    if (message.type !== 'select-field') return;
    cleanup?.();
    const hint = notice('Click the answer field, then drag over the matching text on the bill. Esc cancels.');
    const cancel = event => { if (event.key === 'Escape') cleanup?.(); };
    const pick = async event => {
      if (!allowed(event.target) || event.target.disabled || event.target.readOnly) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      target = event.target;
      token = crypto.randomUUID();
      const label = target.labels?.[0]?.textContent?.trim() || target.getAttribute('aria-label') || target.placeholder || 'Selected field';
      cleanup();
      try {
        // Capture before adding the selection overlay so OCR sees only the bill.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const { image } = await request({ type: 'capture' });
        selectRegion(image, label);
      } catch (error) { const n = notice(error.message); setTimeout(() => n.remove(), 6000); }
    };
    cleanup = () => { hint.remove(); document.removeEventListener('click', pick, true); document.removeEventListener('keydown', cancel, true); cleanup = null; };
    document.addEventListener('click', pick, true);
    document.addEventListener('keydown', cancel, true);
    respond({ ok: true });
  });

  function selectRegion(image, label) {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483646', cursor: 'crosshair', touchAction: 'none', background: `url("${image}") 0 0 / 100% 100% no-repeat` });
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'absolute', border: '2px solid #00c6d2', background: '#00c6d230', pointerEvents: 'none', boxSizing: 'border-box' });
    overlay.append(box);
    document.documentElement.append(overlay);
    const hint = notice('Drag a tight box around the answer text only. Esc cancels.');
    let start;
    const width = innerWidth, height = innerHeight;
    const cancel = event => { if (event.key === 'Escape') cleanup?.(); };
    cleanup = () => { overlay.remove(); hint.remove(); document.removeEventListener('keydown', cancel, true); cleanup = null; };
    document.addEventListener('keydown', cancel, true);
    overlay.onpointerdown = event => { if (event.button !== 0) return; start = { x: event.clientX, y: event.clientY }; overlay.setPointerCapture(event.pointerId); };
    overlay.onpointermove = event => {
      if (!start) return;
      Object.assign(box.style, { left: Math.min(start.x, event.clientX) + 'px', top: Math.min(start.y, event.clientY) + 'px', width: Math.abs(event.clientX - start.x) + 'px', height: Math.abs(event.clientY - start.y) + 'px' });
    };
    overlay.onpointerup = async event => {
      if (!start) return;
      const region = { x: Math.min(start.x, event.clientX), y: Math.min(start.y, event.clientY), width: Math.abs(event.clientX - start.x), height: Math.abs(event.clientY - start.y) };
      if (region.width < 8 || region.height < 8) { start = null; return; }
      cleanup();
      try { await request({ type: 'review', job: { image, region, viewport: { width, height }, label, token } }); }
      catch (error) { const n = notice(error.message); setTimeout(() => n.remove(), 6000); }
    };
  }
})();
