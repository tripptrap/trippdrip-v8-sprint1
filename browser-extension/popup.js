// Popup script for HyveWyre VanillaSoft Extension
// Enhanced with AI Chat, Filters, and Export functionality

const HYVEWYRE_URL = 'https://trippdrip-v8-sprint1-ouusl0ocj-tripptraps-projects.vercel.app';

// State management
let currentLead = null;
let chatMessages = [];
let totalTokens = 0;
let currentFilters = {
  status: ['new', 'contacted', 'qualified'],
  priority: ['high', 'medium', 'low'],
  activity: ['week', 'all'],
  profile: ['complete', 'partial']
};
let filteredLeads = [];

// DOM elements - Leads tab
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const apiKeySection = document.getElementById('apiKeySection');
const apiKeyInput = document.getElementById('apiKey');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const messageContainer = document.getElementById('messageContainer');
const leadPreview = document.getElementById('leadPreview');
const leadFields = document.getElementById('leadFields');
const importLeadBtn = document.getElementById('importLead');
const openHyveWyreBtn = document.getElementById('openHyveWyre');
const refreshPageBtn = document.getElementById('refreshPage');
const getApiKeyLink = document.getElementById('getApiKey');
const importText = document.getElementById('importText');
const copyLeadBtn = document.getElementById('copyLeadBtn');

// DOM elements - Chat tab
const chatMessagesEl = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSend');
const clearChatBtn = document.getElementById('clearChat');
const exportChatBtn = document.getElementById('exportChat');
const collapseChatBtn = document.getElementById('collapseChat');
const tokenCountEl = document.getElementById('tokenCount');
const tokenCostEl = document.getElementById('tokenCost');

// DOM elements - Filters tab
const applyFiltersBtn = document.getElementById('applyFilters');
const resetFiltersBtn = document.getElementById('resetFilters');
const exportCSVBtn = document.getElementById('exportCSV');
const exportJSONBtn = document.getElementById('exportJSON');

// DOM elements - Reply suggestions
const suggestionsContainer = document.getElementById('suggestionsContainer');
const suggestionsList = document.getElementById('suggestionsList');
const suggestionTone = document.getElementById('suggestionTone');
const suggestionLength = document.getElementById('suggestionLength');
const refreshSuggestionsBtn = document.getElementById('refreshSuggestions');

// DOM elements - Header buttons
const settingsBtn = document.getElementById('settingsBtn');
const helpBtn = document.getElementById('helpBtn');

// Tab elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkConnection();
  await loadCurrentLead();
  await loadSavedState();
  setupEventListeners();
  setupKeyboardShortcuts();
});

function setupEventListeners() {
  // Leads tab
  saveApiKeyBtn?.addEventListener('click', saveApiKey);
  importLeadBtn?.addEventListener('click', importLead);
  openHyveWyreBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: HYVEWYRE_URL + '/leads' });
  });
  refreshPageBtn?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.reload(tabs[0].id);
      window.close();
    });
  });
  getApiKeyLink?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: HYVEWYRE_URL + '/settings' });
  });
  copyLeadBtn?.addEventListener('click', copyLeadToClipboard);

  // Chat tab
  chatSendBtn?.addEventListener('click', sendChatMessage);
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  clearChatBtn?.addEventListener('click', clearChat);
  exportChatBtn?.addEventListener('click', exportChat);
  collapseChatBtn?.addEventListener('click', toggleChatCollapse);

  // Filters tab
  applyFiltersBtn?.addEventListener('click', applyFilters);
  resetFiltersBtn?.addEventListener('click', resetFilters);
  exportCSVBtn?.addEventListener('click', () => exportLeads('csv'));
  exportJSONBtn?.addEventListener('click', () => exportLeads('json'));

  // Reply suggestions
  refreshSuggestionsBtn?.addEventListener('click', generateSuggestions);
  suggestionTone?.addEventListener('change', generateSuggestions);
  suggestionLength?.addEventListener('change', generateSuggestions);

  // Header buttons
  settingsBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: HYVEWYRE_URL + '/settings' });
  });
  helpBtn?.addEventListener('click', showKeyboardShortcuts);

  // Tab navigation
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Filter checkboxes
  document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', updateFilterState);
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape to close popup
    if (e.key === 'Escape') {
      window.close();
    }

    // Alt+1/2/3 to switch tabs
    if (e.altKey && e.key === '1') {
      switchTab('leads');
    } else if (e.altKey && e.key === '2') {
      switchTab('chat');
    } else if (e.altKey && e.key === '3') {
      switchTab('filters');
    }

    // Ctrl/Cmd+Enter to import lead
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && currentLead) {
      importLead();
    }
  });
}

// Tab management
function switchTab(tabName) {
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === tabName + 'Tab');
  });

  // Focus chat input when switching to chat tab
  if (tabName === 'chat') {
    chatInput?.focus();
  }
}

// Connection management
async function checkConnection() {
  try {
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);

    if (!apiKey) {
      setDisconnected('No API key found');
      apiKeySection?.classList.remove('hidden');
      return;
    }

    // Verify API key with HyveWyre
    const response = await fetchWithTimeout(`${HYVEWYRE_URL}/api/leads/list`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      setConnected('Connected to HyveWyre');
      apiKeySection?.classList.add('hidden');

      // Load leads for export functionality
      const data = await response.json();
      if (data.leads) {
        filteredLeads = data.leads;
      }
    } else {
      setDisconnected('Invalid API key');
      apiKeySection?.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Connection error:', error);
    setDisconnected('Connection error');
    apiKeySection?.classList.remove('hidden');
  }
}

function setConnected(message) {
  statusDot?.classList.remove('disconnected');
  if (statusText) statusText.textContent = message;
}

function setDisconnected(message) {
  statusDot?.classList.add('disconnected');
  if (statusText) statusText.textContent = message;
}

// API key management
async function saveApiKey() {
  const apiKey = apiKeyInput?.value.trim();

  if (!apiKey) {
    showMessage('Please enter an API key', 'error');
    return;
  }

  try {
    await chrome.storage.sync.set({ apiKey });
    await checkConnection();
    showMessage('API key saved successfully!', 'success');
    if (apiKeyInput) apiKeyInput.value = '';
  } catch (error) {
    showMessage('Failed to save API key', 'error');
  }
}

// Lead management
async function loadCurrentLead() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url?.includes('vanillasoft.com')) {
      showMessage('Please navigate to VanillaSoft to import leads', 'info');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getLead' });

    if (response && response.lead) {
      currentLead = response.lead;
      displayLeadPreview(response.lead);
      importLeadBtn?.classList.remove('hidden');
      refreshPageBtn?.classList.remove('hidden');

      // Show suggestions container when lead is available
      suggestionsContainer?.classList.remove('hidden');
      generateSuggestions();
    } else {
      showMessage('No lead data found on this page', 'info');
    }
  } catch (error) {
    console.error('Error loading lead:', error);
    showMessage('Unable to extract lead data. Make sure you\'re on a VanillaSoft lead page.', 'info');
  }
}

function displayLeadPreview(lead) {
  leadPreview?.classList.remove('hidden');

  const fields = [
    { label: 'Name', value: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'N/A' },
    { label: 'Phone', value: formatPhoneDisplay(lead.phone) || 'N/A' },
    { label: 'Email', value: lead.email || 'N/A' },
    { label: 'Company', value: lead.company || 'N/A' },
    { label: 'State', value: lead.state || 'N/A' },
  ];

  if (leadFields) {
    leadFields.innerHTML = fields.map(field => `
      <div class="lead-field">
        <span class="lead-field-label">${field.label}:</span>
        <span class="lead-field-value">${escapeHtml(field.value)}</span>
      </div>
    `).join('');
  }
}

async function importLead() {
  if (!currentLead) {
    showMessage('No lead to import', 'error');
    return;
  }

  const { apiKey } = await chrome.storage.sync.get(['apiKey']);

  if (!apiKey) {
    showMessage('Please configure your API key first', 'error');
    apiKeySection?.classList.remove('hidden');
    return;
  }

  if (importLeadBtn) importLeadBtn.disabled = true;
  if (importText) importText.innerHTML = 'Importing... <span class="loading"></span>';

  try {
    const response = await fetchWithTimeout(`${HYVEWYRE_URL}/api/leads/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leads: [{
          first_name: sanitizeString(currentLead.firstName),
          last_name: sanitizeString(currentLead.lastName),
          phone: sanitizePhone(currentLead.phone),
          email: sanitizeEmail(currentLead.email),
          company: sanitizeString(currentLead.company),
          state: sanitizeString(currentLead.state),
          source: 'VanillaSoft Extension',
          notes: sanitizeString(currentLead.notes || '')
        }]
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showMessage(`Lead imported successfully! ${data.imported || 1} lead added.`, 'success');

      importLeadBtn?.classList.add('btn-success');
      if (importText) importText.textContent = '✓ Lead Imported';

      setTimeout(() => {
        if (importLeadBtn) {
          importLeadBtn.disabled = false;
          importLeadBtn.classList.remove('btn-success');
        }
        if (importText) importText.textContent = 'Import Lead to HyveWyre';
      }, 3000);
    } else {
      throw new Error(data.error || 'Import failed');
    }
  } catch (error) {
    console.error('Import error:', error);
    showMessage(error.message || 'Failed to import lead', 'error');
    if (importLeadBtn) importLeadBtn.disabled = false;
    if (importText) importText.textContent = 'Import Lead to HyveWyre';
  }
}

function copyLeadToClipboard() {
  if (!currentLead) return;

  const leadText = [
    `Name: ${currentLead.firstName || ''} ${currentLead.lastName || ''}`.trim(),
    `Phone: ${currentLead.phone || 'N/A'}`,
    `Email: ${currentLead.email || 'N/A'}`,
    `Company: ${currentLead.company || 'N/A'}`,
    `State: ${currentLead.state || 'N/A'}`
  ].join('\n');

  navigator.clipboard.writeText(leadText).then(() => {
    showMessage('Lead copied to clipboard!', 'success');
  }).catch(() => {
    showMessage('Failed to copy lead', 'error');
  });
}

// Chat functionality
async function sendChatMessage() {
  const message = chatInput?.value.trim();
  if (!message) return;

  // Add user message
  addChatMessage('user', message);
  if (chatInput) chatInput.value = '';

  // Show typing indicator
  showTypingIndicator();

  try {
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);

    if (!apiKey) {
      hideTypingIndicator();
      addChatMessage('assistant', 'Please configure your API key first to use the AI assistant.');
      return;
    }

    // Build context with current lead if available
    let context = '';
    if (currentLead) {
      context = `Current lead context: ${currentLead.firstName} ${currentLead.lastName}, Phone: ${currentLead.phone}, Email: ${currentLead.email}, Company: ${currentLead.company}. `;
    }

    const response = await fetchWithTimeout(`${HYVEWYRE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        context: context,
        history: chatMessages.slice(-10) // Last 10 messages for context
      })
    });

    hideTypingIndicator();

    if (response.ok) {
      const data = await response.json();
      addChatMessage('assistant', data.response || 'I apologize, but I could not generate a response.');

      // Update token usage
      if (data.tokens) {
        totalTokens += data.tokens;
        updateTokenDisplay(totalTokens);
      }
    } else {
      // Fallback response if API fails
      addChatMessage('assistant', generateFallbackResponse(message));
    }
  } catch (error) {
    console.error('Chat error:', error);
    hideTypingIndicator();
    addChatMessage('assistant', generateFallbackResponse(message));
  }

  // Save chat state
  saveChatState();
}

function addChatMessage(role, content) {
  const message = { role, content, timestamp: new Date().toISOString() };
  chatMessages.push(message);

  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${role}`;
  messageEl.innerHTML = `
    <div class="chat-bubble">${escapeHtml(content)}</div>
    <div class="chat-time">${formatTime(message.timestamp)}</div>
  `;

  // Remove typing indicator if present
  const typingEl = chatMessagesEl?.querySelector('.typing-indicator');
  if (typingEl) typingEl.remove();

  chatMessagesEl?.appendChild(messageEl);
  chatMessagesEl?.scrollTo({ top: chatMessagesEl.scrollHeight, behavior: 'smooth' });
}

function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'chat-message assistant';
  indicator.innerHTML = `
    <div class="typing-indicator">
      <span></span><span></span><span></span>
    </div>
  `;
  chatMessagesEl?.appendChild(indicator);
  chatMessagesEl?.scrollTo({ top: chatMessagesEl.scrollHeight, behavior: 'smooth' });
}

function hideTypingIndicator() {
  const indicator = chatMessagesEl?.querySelector('.typing-indicator');
  if (indicator) indicator.parentElement?.remove();
}

function generateFallbackResponse(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('sms') || lowerMessage.includes('text')) {
    return 'For SMS best practices, keep messages under 160 characters, personalize with the lead\'s name, include a clear call-to-action, and always identify yourself or your company.';
  }
  if (lowerMessage.includes('follow') || lowerMessage.includes('sequence')) {
    return 'A good follow-up sequence typically includes: Day 1 - Introduction, Day 3 - Value proposition, Day 7 - Case study or testimonial, Day 14 - Final check-in. Adjust timing based on your industry.';
  }
  if (lowerMessage.includes('template')) {
    return 'Here\'s a template: "Hi [Name], this is [Your Name] from [Company]. I noticed [specific detail]. Would you be interested in a quick chat about [value prop]? Reply YES to connect!"';
  }
  if (lowerMessage.includes('lead') || lowerMessage.includes('import')) {
    return 'To import leads efficiently: 1) Navigate to a VanillaSoft lead page, 2) Click the Import button, 3) Verify the data preview, 4) Confirm the import. You can use Alt+Shift+L as a shortcut!';
  }

  return 'I\'m here to help with lead management, SMS templates, and campaign strategies. What specific topic would you like to explore?';
}

function clearChat() {
  chatMessages = [];
  if (chatMessagesEl) {
    chatMessagesEl.innerHTML = `
      <div class="chat-message assistant">
        <div class="chat-bubble">Chat cleared. How can I help you today?</div>
        <div class="chat-time">Just now</div>
      </div>
    `;
  }
  totalTokens = 0;
  updateTokenDisplay(0);
  saveChatState();
}

function exportChat() {
  if (chatMessages.length === 0) {
    showMessage('No chat history to export', 'info');
    return;
  }

  const content = chatMessages.map(msg =>
    `[${formatTime(msg.timestamp)}] ${msg.role.toUpperCase()}: ${msg.content}`
  ).join('\n\n');

  downloadFile(`hyvewyre-chat-${formatDate(new Date())}.txt`, content, 'text/plain');
  showMessage('Chat exported!', 'success');
}

function toggleChatCollapse() {
  chatMessagesEl?.classList.toggle('collapsed');
  if (collapseChatBtn) {
    collapseChatBtn.textContent = chatMessagesEl?.classList.contains('collapsed') ? '📂 Expand' : '📁 Collapse';
  }
}

function updateTokenDisplay(tokens) {
  if (tokenCountEl) tokenCountEl.textContent = tokens.toLocaleString();
  // Estimate cost at $0.002 per 1K tokens (rough average)
  const cost = (tokens / 1000) * 0.002;
  if (tokenCostEl) tokenCostEl.textContent = cost.toFixed(4);
}

// Reply suggestions
async function generateSuggestions() {
  if (!currentLead) return;

  const tone = suggestionTone?.value || 'professional';
  const length = suggestionLength?.value || 'medium';

  if (suggestionsList) {
    suggestionsList.innerHTML = '<div class="suggestion-item">Generating suggestions...</div>';
  }

  try {
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);

    if (!apiKey) {
      displayFallbackSuggestions(tone, length);
      return;
    }

    const response = await fetchWithTimeout(`${HYVEWYRE_URL}/api/ai/suggestions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lead: currentLead,
        tone: tone,
        length: length
      })
    });

    if (response.ok) {
      const data = await response.json();
      displaySuggestions(data.suggestions || []);
    } else {
      displayFallbackSuggestions(tone, length);
    }
  } catch (error) {
    console.error('Suggestions error:', error);
    displayFallbackSuggestions(tone, length);
  }
}

function displayFallbackSuggestions(tone, length) {
  const name = currentLead?.firstName || 'there';
  const company = currentLead?.company || 'your company';

  const suggestions = {
    professional: {
      short: [
        `Hi ${name}, following up on your inquiry. When's a good time to chat?`,
        `${name}, I have information that could help ${company}. 5 min call?`
      ],
      medium: [
        `Hi ${name}, this is [Your Name] from HyveWyre. I noticed you're looking for solutions that could benefit ${company}. Would you have 15 minutes this week for a quick call?`,
        `Good day ${name}! I wanted to reach out about some opportunities that align with ${company}'s goals. When would be convenient to discuss?`
      ],
      long: [
        `Hi ${name}, I hope this message finds you well. I'm reaching out from HyveWyre because I believe we have solutions that could significantly benefit ${company}. Our clients typically see a 30% improvement in efficiency. Would you be available for a 20-minute call this week to explore how we might help you achieve similar results?`
      ]
    },
    friendly: {
      short: [
        `Hey ${name}! Quick question - got a few minutes to chat?`,
        `Hi ${name}! Hope you're having a great day. Got time for a quick call?`
      ],
      medium: [
        `Hey ${name}! I've been thinking about ${company} and have some ideas that might interest you. Coffee chat sometime this week?`,
        `Hi ${name}! Hope all is well. I'd love to share some insights with you when you have a moment. What works for your schedule?`
      ],
      long: [
        `Hey ${name}! I hope you're doing well! I've been researching ${company} and I'm genuinely excited about some ideas that could make a real difference for your team. I'd love to grab a virtual coffee and chat - no pressure, just a friendly conversation about possibilities. What does your week look like?`
      ]
    },
    casual: {
      short: [
        `${name}! Got a sec?`,
        `Hey ${name} - quick question for you!`
      ],
      medium: [
        `${name}! Saw something cool that made me think of ${company}. Mind if I share?`,
        `Hey ${name}! Been meaning to reach out. Got a few minutes to catch up?`
      ],
      long: [
        `Hey ${name}! So I was doing some research the other day and ${company} came up - got me thinking about some ways we might be able to help you out. No sales pitch, I promise! Just thought it'd be cool to chat and see if there's anything useful I can share. Let me know if you're up for it!`
      ]
    },
    urgent: {
      short: [
        `${name} - time-sensitive opportunity. Can we talk today?`,
        `URGENT: ${name}, need 5 minutes of your time ASAP.`
      ],
      medium: [
        `${name}, I have an opportunity that expires soon and immediately thought of ${company}. Are you available for a quick call in the next 24 hours?`,
        `Hi ${name} - I don't usually reach out like this, but there's something time-sensitive I think ${company} should know about. When can we connect?`
      ],
      long: [
        `${name}, I apologize for the urgency but I have an opportunity that I believe could significantly impact ${company} - and it's only available for a limited time. I've seen similar situations transform businesses like yours. I'd hate for you to miss out. Can we schedule a call today or tomorrow to discuss?`
      ]
    }
  };

  const tonesuggestions = suggestions[tone] || suggestions.professional;
  const lengthSuggestions = tonesuggestions[length] || tonesuggestions.medium;

  displaySuggestions(lengthSuggestions);
}

function displaySuggestions(suggestions) {
  if (!suggestionsList) return;

  if (suggestions.length === 0) {
    suggestionsList.innerHTML = '<div class="suggestion-item">No suggestions available</div>';
    return;
  }

  suggestionsList.innerHTML = suggestions.map((suggestion, index) => `
    <div class="suggestion-item" data-index="${index}">
      ${escapeHtml(suggestion)}
    </div>
  `).join('');

  // Add click handlers
  suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      // Copy to clipboard
      navigator.clipboard.writeText(item.textContent.trim()).then(() => {
        item.classList.add('selected');
        showMessage('Suggestion copied!', 'success');
        setTimeout(() => item.classList.remove('selected'), 2000);
      });
    });
  });
}

// Filters functionality
function updateFilterState() {
  const checkboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
  currentFilters = {
    status: [],
    priority: [],
    activity: [],
    profile: []
  };

  checkboxes.forEach(cb => {
    if (cb.checked && cb.name && currentFilters[cb.name]) {
      currentFilters[cb.name].push(cb.value);
    }
  });
}

async function applyFilters() {
  updateFilterState();

  try {
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);

    if (!apiKey) {
      showMessage('Please configure your API key to filter leads', 'error');
      return;
    }

    const response = await fetchWithTimeout(`${HYVEWYRE_URL}/api/leads/list?${new URLSearchParams({
      status: currentFilters.status.join(','),
      priority: currentFilters.priority.join(','),
      activity: currentFilters.activity.join(','),
      profile: currentFilters.profile.join(',')
    })}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      filteredLeads = data.leads || [];
      showMessage(`Found ${filteredLeads.length} leads matching filters`, 'success');
    } else {
      showMessage('Failed to apply filters', 'error');
    }
  } catch (error) {
    console.error('Filter error:', error);
    showMessage('Failed to apply filters', 'error');
  }

  // Save filter state
  chrome.storage.sync.set({ filters: currentFilters });
}

function resetFilters() {
  currentFilters = {
    status: ['new', 'contacted', 'qualified'],
    priority: ['high', 'medium', 'low'],
    activity: ['week', 'all'],
    profile: ['complete', 'partial']
  };

  // Reset checkboxes
  document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
    const defaultChecked = currentFilters[cb.name]?.includes(cb.value) || false;
    cb.checked = defaultChecked;
  });

  showMessage('Filters reset to default', 'info');
  chrome.storage.sync.set({ filters: currentFilters });
}

// Export functionality
async function exportLeads(format) {
  if (filteredLeads.length === 0) {
    // Try to fetch leads first
    try {
      const { apiKey } = await chrome.storage.sync.get(['apiKey']);

      if (!apiKey) {
        showMessage('Please configure your API key to export leads', 'error');
        return;
      }

      const response = await fetchWithTimeout(`${HYVEWYRE_URL}/api/leads/list`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        filteredLeads = data.leads || [];
      }
    } catch (error) {
      console.error('Export error:', error);
    }
  }

  if (filteredLeads.length === 0) {
    showMessage('No leads to export', 'info');
    return;
  }

  const filename = `hyvewyre-leads-${formatDate(new Date())}`;

  if (format === 'csv') {
    const headers = ['First Name', 'Last Name', 'Phone', 'Email', 'Company', 'State', 'Status', 'Created'];
    const rows = filteredLeads.map(lead => [
      lead.first_name || '',
      lead.last_name || '',
      lead.phone || '',
      lead.email || '',
      lead.company || '',
      lead.state || '',
      lead.status || '',
      lead.created_at || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    downloadFile(`${filename}.csv`, csvContent, 'text/csv');
  } else {
    downloadFile(`${filename}.json`, JSON.stringify(filteredLeads, null, 2), 'application/json');
  }

  showMessage(`Exported ${filteredLeads.length} leads as ${format.toUpperCase()}`, 'success');
}

// State persistence
async function loadSavedState() {
  try {
    const { chatHistory, filters, tokens } = await chrome.storage.local.get(['chatHistory', 'filters', 'tokens']);

    if (chatHistory && chatHistory.length > 0) {
      chatMessages = chatHistory;
      chatMessages.forEach(msg => {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${msg.role}`;
        messageEl.innerHTML = `
          <div class="chat-bubble">${escapeHtml(msg.content)}</div>
          <div class="chat-time">${formatTime(msg.timestamp)}</div>
        `;
        chatMessagesEl?.appendChild(messageEl);
      });
      chatMessagesEl?.scrollTo({ top: chatMessagesEl.scrollHeight });
    }

    if (filters) {
      currentFilters = filters;
      // Restore checkbox states
      document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
        cb.checked = currentFilters[cb.name]?.includes(cb.value) || false;
      });
    }

    if (tokens) {
      totalTokens = tokens;
      updateTokenDisplay(tokens);
    }
  } catch (error) {
    console.error('Error loading saved state:', error);
  }
}

function saveChatState() {
  chrome.storage.local.set({
    chatHistory: chatMessages.slice(-50), // Keep last 50 messages
    tokens: totalTokens
  });
}

// Utility functions
function showMessage(text, type = 'info') {
  const message = document.createElement('div');
  message.className = `message ${type}`;
  message.textContent = text;

  if (messageContainer) {
    messageContainer.innerHTML = '';
    messageContainer.appendChild(message);
  }

  setTimeout(() => message.remove(), 5000);
}

function showKeyboardShortcuts() {
  const shortcuts = `
Keyboard Shortcuts:
─────────────────────
Esc          Close popup
Alt+1        Leads tab
Alt+2        Chat tab
Alt+3        Filters tab
Ctrl+Enter   Import lead
Enter        Send chat message

Page Shortcuts (on VanillaSoft):
─────────────────────
Alt+Shift+L  Quick add lead
Alt+Shift+O  Open popup
  `.trim();

  alert(shortcuts);
}

async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function formatPhoneDisplay(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

// Data sanitization functions
function sanitizeString(str) {
  if (!str) return '';
  return String(str).trim().slice(0, 255);
}

function sanitizePhone(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) return '+1' + cleaned;
  if (cleaned.length === 11 && cleaned[0] === '1') return '+' + cleaned;
  return cleaned;
}

function sanitizeEmail(email) {
  if (!email) return '';
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed) ? trimmed : '';
}
