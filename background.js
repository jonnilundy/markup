const ON = 'markup.enabled';

async function setBadge() {
  const s = await chrome.storage.local.get(ON);
  chrome.action.setBadgeText({ text: s[ON] ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
}

async function toggle() {
  const s = await chrome.storage.local.get(ON);
  await chrome.storage.local.set({ [ON]: !s[ON] });
}

chrome.action.onClicked.addListener(toggle);
chrome.commands.onCommand.addListener((c) => c === 'toggle' && toggle());
chrome.storage.onChanged.addListener((ch) => ch[ON] && setBadge());
chrome.runtime.onInstalled.addListener(setBadge);
chrome.runtime.onStartup.addListener(setBadge);
