import { handleMessage } from './router.js';
import { Storage } from '../shared/storage/index.js';

// Open dashboard when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
});

// Message handler for newtab page requests
chrome.runtime.onMessage.addListener((message: unknown, _sender: unknown, sendResponse: (response: unknown) => void) => {
  handleMessage(message as Record<string, unknown>)
    .then(sendResponse)
    .catch((error: Error) => sendResponse({ error: error.message }));
  return true; // Keep channel open for async response
});

// Alarm cleanup: periodic content cache cleanup (guard alarms existence for test/non-extension envs)
function setupCleanupAlarm() {
  const alarms = (chrome as unknown as { alarms?: typeof chrome.alarms }).alarms;
  if (!alarms) return;
  alarms.create('cleanup', { periodInMinutes: 60 });
  Storage.cleanupCache();
}

if ((chrome as unknown as { alarms?: typeof chrome.alarms }).alarms) {
  // immediate wiring for current service worker lifetime
  setupCleanupAlarm();
  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    if (alarm.name === 'cleanup') Storage.cleanupCache();
  });
}

// Re-establish alarm on extension install/update and on browser startup
if (chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => setupCleanupAlarm());
}
if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => setupCleanupAlarm());
}

console.log('[TabOrganizer] Tab Organizer Dashboard extension loaded');
