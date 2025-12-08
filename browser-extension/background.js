// Background service worker for HyveWyre VanillaSoft Extension

console.log('HyveWyre Extension: Background service worker loaded');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('HyveWyre Extension installed');

    // Open welcome page
    chrome.tabs.create({
      url: 'https://trippdrip-v8-sprint1-ouusl0ocj-tripptraps-projects.vercel.app/settings'
    });
  } else if (details.reason === 'update') {
    console.log('HyveWyre Extension updated');
  }
});

// Listen for icon clicks
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked on tab:', tab.url);
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);

  if (request.action === 'importLead') {
    // Handle lead import in background
    importLeadToHyveWyre(request.lead)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'checkConnection') {
    checkHyveWyreConnection()
      .then(connected => sendResponse({ connected }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }
});

async function importLeadToHyveWyre(lead) {
  const { apiKey } = await chrome.storage.sync.get(['apiKey']);

  if (!apiKey) {
    throw new Error('No API key configured');
  }

  const response = await fetch('https://trippdrip-v8-sprint1-ouusl0ocj-tripptraps-projects.vercel.app/api/leads/import', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      leads: [lead]
    })
  });

  if (!response.ok) {
    throw new Error('Import failed');
  }

  return await response.json();
}

async function checkHyveWyreConnection() {
  const { apiKey } = await chrome.storage.sync.get(['apiKey']);

  if (!apiKey) {
    return false;
  }

  try {
    const response = await fetch('https://trippdrip-v8-sprint1-ouusl0ocj-tripptraps-projects.vercel.app/api/leads/list', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

// Badge management
function updateBadge(text, color = '#10b981') {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Set initial badge
updateBadge('');
