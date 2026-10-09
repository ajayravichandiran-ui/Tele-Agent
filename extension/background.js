chrome.action.onClicked.addListener(async tab => {
  try {
    // Invoke open during the toolbar gesture, before any awaited work.
    await chrome.sidePanel.open({ windowId: tab.windowId });
    if (!tab.id || !/^https?:/.test(tab.url || '')) throw new Error('Open the bill website first.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['page-agent.js'] });
    await chrome.action.setBadgeText({ text: '' });
  } catch (error) {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setTitle({ title: error.message });
  }
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const run = async () => {
    if (message.type === 'capture') {
      if (!sender.tab || sender.frameId !== 0) throw new Error('Invalid source tab.');
      const active = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
      if (active[0]?.id !== sender.tab.id) throw new Error('Keep the bill tab active while selecting.');
      return { image: await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }) };
    }
    if (message.type === 'review') {
      if (!sender.tab || sender.frameId !== 0) throw new Error('Invalid source tab.');
      const id = crypto.randomUUID();
      await chrome.storage.session.set({ [id]: { ...message.job, tabId: sender.tab.id } });
      await chrome.tabs.create({ url: chrome.runtime.getURL('review.html') + '#' + id });
      return { ok: true };
    }
    if (message.type === 'fill') {
      if (sender.tab?.url?.split('#')[0] !== chrome.runtime.getURL('review.html')) throw new Error('Invalid review page.');
      const stored = await chrome.storage.session.get(message.id);
      const job = stored[message.id];
      if (!job) throw new Error('This selection has expired. Select the field again.');
      const result = await chrome.tabs.sendMessage(job.tabId, { type: 'fill', token: job.token, text: message.text });
      if (result?.error) throw new Error(result.error);
      await chrome.tabs.update(job.tabId, { active: true });
      await chrome.storage.session.remove(message.id);
      return { ok: true };
    }
    throw new Error('Unknown request.');
  };
  run().then(respond, error => respond({ error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const jobs = await chrome.storage.session.get(null);
  const expired = Object.entries(jobs).filter(([, job]) => job.tabId === tabId).map(([id]) => id);
  if (expired.length) await chrome.storage.session.remove(expired);
});
