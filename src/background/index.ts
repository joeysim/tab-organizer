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

// Alarm cleanup: periodic content cache cleanup
if ((chrome as unknown as { alarms?: typeof chrome.alarms }).alarms) {
  Storage.cleanupCache();
  chrome.alarms.create('cleanup', { periodInMinutes: 60 });
  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    if (alarm.name === 'cleanup') {
      Storage.cleanupCache();
    }
  });
}

console.log('[TabOrganizer] Tab Organizer Dashboard extension loaded');
