// Content script for VanillaSoft pages
// Enhanced with keyboard shortcuts, MutationObserver, and preview page scraping

console.log('HyveWyre VanillaSoft Extension: Content script loaded');

// State
let lastExtractedLead = null;
let isExtracting = false;
let observer = null;

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getLead') {
    const lead = extractLeadData();
    sendResponse({ lead });
  } else if (request.action === 'quickImport') {
    quickImportLead();
    sendResponse({ success: true });
  }
  return true;
});

// Initialize
function initialize() {
  setupKeyboardShortcuts();
  setupMutationObserver();
  addExtensionIndicator();

  // Check if on preview page and extract data
  if (isPreviewPage()) {
    console.log('HyveWyre: Preview page detected');
    const lead = scrapePublicProfile();
    if (lead) {
      lastExtractedLead = lead;
      showToast('Lead data detected on preview page');
    }
  }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Alt+Shift+L - Quick add lead
    if (e.altKey && e.shiftKey && e.key === 'L') {
      e.preventDefault();
      quickImportLead();
    }

    // Alt+Shift+O - Open popup
    if (e.altKey && e.shiftKey && e.key === 'O') {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openPopup' });
    }

    // Escape - Hide any extension UI
    if (e.key === 'Escape') {
      hideAllExtensionUI();
    }
  });
}

// MutationObserver for dynamic DOM changes
function setupMutationObserver() {
  // Only set up once
  if (observer) return;

  const targetNode = document.body;
  const config = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['value']
  };

  let debounceTimer = null;

  observer = new MutationObserver((mutations) => {
    // Debounce to avoid excessive extraction
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      // Check if relevant changes occurred (form fields, lead data)
      const hasRelevantChanges = mutations.some(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
          return true;
        }
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          return addedNodes.some(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            // Check for form fields or lead data containers
            return node.querySelector?.('input, [class*="lead"], [class*="contact"]') !== null;
          });
        }
        return false;
      });

      if (hasRelevantChanges && !isExtracting) {
        console.log('HyveWyre: DOM changes detected, re-extracting lead data');
        const lead = extractLeadData();
        if (lead && hasSignificantChanges(lead, lastExtractedLead)) {
          lastExtractedLead = lead;
          updateIndicatorWithLead(lead);
        }
      }
    }, 500);
  });

  observer.observe(targetNode, config);
  console.log('HyveWyre: MutationObserver active');
}

function hasSignificantChanges(newLead, oldLead) {
  if (!oldLead) return true;
  return (
    newLead.firstName !== oldLead.firstName ||
    newLead.lastName !== oldLead.lastName ||
    newLead.phone !== oldLead.phone ||
    newLead.email !== oldLead.email
  );
}

// Check if on preview/public profile page
function isPreviewPage() {
  const url = window.location.href.toLowerCase();
  return (
    url.includes('/preview') ||
    url.includes('/public') ||
    url.includes('/profile') ||
    document.querySelector('[class*="preview"], [class*="public-profile"]') !== null
  );
}

// Scrape public profile pages
function scrapePublicProfile() {
  try {
    const lead = {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      company: '',
      state: '',
      notes: ''
    };

    // Try various preview page patterns

    // Pattern 1: Structured data (JSON-LD)
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        if (data['@type'] === 'Person' || data['@type'] === 'Organization') {
          if (data.name) {
            const names = data.name.split(' ');
            lead.firstName = names[0] || '';
            lead.lastName = names.slice(1).join(' ') || '';
          }
          lead.email = data.email || '';
          lead.phone = data.telephone || '';
          lead.company = data.worksFor?.name || data.memberOf?.name || '';
        }
      } catch (e) {
        console.log('HyveWyre: JSON-LD parse error', e);
      }
    }

    // Pattern 2: Open Graph / Meta tags
    if (!lead.firstName) {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
      if (ogTitle) {
        const names = ogTitle.split(' ');
        lead.firstName = names[0] || '';
        lead.lastName = names.slice(1).join(' ') || '';
      }
    }

    // Pattern 3: Profile card elements
    const profileSelectors = [
      '[class*="profile-name"]',
      '[class*="contact-name"]',
      '[class*="lead-name"]',
      'h1[class*="name"]',
      '.name',
      '.full-name'
    ];

    for (const selector of profileSelectors) {
      const el = document.querySelector(selector);
      if (el && !lead.firstName) {
        const text = el.textContent.trim();
        const names = text.split(' ');
        lead.firstName = names[0] || '';
        lead.lastName = names.slice(1).join(' ') || '';
        break;
      }
    }

    // Pattern 4: Contact info elements
    const contactSelectors = {
      email: ['[class*="email"]', '[href^="mailto:"]', 'a[href*="@"]'],
      phone: ['[class*="phone"]', '[href^="tel:"]', '[class*="mobile"]'],
      company: ['[class*="company"]', '[class*="organization"]', '[class*="employer"]'],
      state: ['[class*="state"]', '[class*="location"]', '[class*="address"]']
    };

    for (const [field, selectors] of Object.entries(contactSelectors)) {
      if (!lead[field]) {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            let value = el.textContent.trim();

            // Extract from mailto/tel links
            if (el.href) {
              if (el.href.startsWith('mailto:')) {
                value = el.href.replace('mailto:', '').split('?')[0];
              } else if (el.href.startsWith('tel:')) {
                value = el.href.replace('tel:', '');
              }
            }

            if (value) {
              lead[field] = value;
              break;
            }
          }
        }
      }
    }

    // Pattern 5: vCard data
    const vcardElements = document.querySelectorAll('[class*="vcard"], [itemtype*="Person"]');
    vcardElements.forEach(vcard => {
      if (!lead.firstName) {
        const fn = vcard.querySelector('.fn, [itemprop="name"]');
        if (fn) {
          const names = fn.textContent.trim().split(' ');
          lead.firstName = names[0] || '';
          lead.lastName = names.slice(1).join(' ') || '';
        }
      }
      if (!lead.email) {
        const email = vcard.querySelector('.email, [itemprop="email"]');
        if (email) lead.email = email.textContent.trim();
      }
      if (!lead.phone) {
        const tel = vcard.querySelector('.tel, [itemprop="telephone"]');
        if (tel) lead.phone = tel.textContent.trim();
      }
      if (!lead.company) {
        const org = vcard.querySelector('.org, [itemprop="worksFor"]');
        if (org) lead.company = org.textContent.trim();
      }
    });

    // Clean up phone number
    if (lead.phone) {
      lead.phone = formatPhone(lead.phone);
    }

    // Clean up email
    if (lead.email) {
      lead.email = lead.email.toLowerCase().trim();
    }

    console.log('HyveWyre: Scraped public profile:', lead);
    return lead;

  } catch (error) {
    console.error('HyveWyre: Error scraping public profile:', error);
    return null;
  }
}

function extractLeadData() {
  isExtracting = true;

  try {
    // VanillaSoft typically displays lead information in various formats
    // This is a generic extraction that looks for common patterns

    const lead = {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      company: '',
      state: '',
      notes: ''
    };

    // Method 1: Try to extract from form fields
    const firstNameField = document.querySelector('input[name*="first" i], input[id*="first" i]');
    const lastNameField = document.querySelector('input[name*="last" i], input[id*="last" i]');
    const phoneField = document.querySelector('input[name*="phone" i], input[id*="phone" i], input[type="tel"]');
    const emailField = document.querySelector('input[name*="email" i], input[id*="email" i], input[type="email"]');
    const companyField = document.querySelector('input[name*="company" i], input[id*="company" i], input[name*="business" i]');
    const stateField = document.querySelector('input[name*="state" i], select[name*="state" i], input[id*="state" i]');

    if (firstNameField) lead.firstName = firstNameField.value;
    if (lastNameField) lead.lastName = lastNameField.value;
    if (phoneField) lead.phone = phoneField.value;
    if (emailField) lead.email = emailField.value;
    if (companyField) lead.company = companyField.value;
    if (stateField) lead.state = stateField.value;

    // Method 2: Try to extract from labels and spans (display mode)
    if (!lead.firstName || !lead.lastName) {
      const nameElements = document.querySelectorAll('label, span, div');
      nameElements.forEach(el => {
        const text = el.textContent.trim();
        const lowerText = text.toLowerCase();

        if (lowerText.includes('first name:') || lowerText.includes('firstname:')) {
          const value = el.nextElementSibling?.textContent || el.textContent.split(':')[1];
          if (value) lead.firstName = value.trim();
        }

        if (lowerText.includes('last name:') || lowerText.includes('lastname:')) {
          const value = el.nextElementSibling?.textContent || el.textContent.split(':')[1];
          if (value) lead.lastName = value.trim();
        }

        if (lowerText.includes('phone:') && !lead.phone) {
          const value = el.nextElementSibling?.textContent || el.textContent.split(':')[1];
          if (value) lead.phone = value.trim();
        }

        if (lowerText.includes('email:') && !lead.email) {
          const value = el.nextElementSibling?.textContent || el.textContent.split(':')[1];
          if (value) lead.email = value.trim();
        }
      });
    }

    // Method 3: Look for phone numbers using regex anywhere on the page
    if (!lead.phone) {
      const bodyText = document.body.textContent;
      const phoneRegex = /(\+?1\s?)?(\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g;
      const phoneMatches = bodyText.match(phoneRegex);
      if (phoneMatches && phoneMatches.length > 0) {
        // Take the first phone number found
        lead.phone = phoneMatches[0].replace(/[^\d+]/g, '');
      }
    }

    // Method 4: Look for email using regex
    if (!lead.email) {
      const bodyText = document.body.textContent;
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emailMatches = bodyText.match(emailRegex);
      if (emailMatches && emailMatches.length > 0) {
        lead.email = emailMatches[0];
      }
    }

    // Clean up phone number
    if (lead.phone) {
      lead.phone = formatPhone(lead.phone);
    }

    console.log('HyveWyre: Extracted lead data:', lead);
    lastExtractedLead = lead;
    return lead;

  } catch (error) {
    console.error('HyveWyre: Error extracting lead data:', error);
    return null;
  } finally {
    isExtracting = false;
  }
}

function formatPhone(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return '+1' + cleaned;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return '+' + cleaned;
  }
  return cleaned;
}

// Quick import functionality
async function quickImportLead() {
  const lead = lastExtractedLead || extractLeadData();

  if (!lead || (!lead.firstName && !lead.phone && !lead.email)) {
    showToast('No lead data found on this page', 'error');
    return;
  }

  showToast('Importing lead...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'importLead',
      lead: {
        first_name: lead.firstName,
        last_name: lead.lastName,
        phone: lead.phone,
        email: lead.email,
        company: lead.company,
        state: lead.state,
        source: 'VanillaSoft Extension (Quick Import)',
        notes: lead.notes || ''
      }
    });

    if (response.success) {
      showToast('Lead imported successfully!', 'success');
    } else {
      showToast(response.error || 'Import failed', 'error');
    }
  } catch (error) {
    console.error('HyveWyre: Quick import error:', error);
    showToast('Import failed. Check your API key.', 'error');
  }
}

// Visual indicator
function addExtensionIndicator() {
  // Remove existing indicator
  const existing = document.getElementById('hyvewyre-indicator');
  if (existing) existing.remove();

  const indicator = document.createElement('div');
  indicator.id = 'hyvewyre-indicator';
  indicator.innerHTML = `
    <div class="hyvewyre-indicator-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </div>
    <div class="hyvewyre-indicator-content">
      <span class="hyvewyre-indicator-title">HyveWyre</span>
      <span class="hyvewyre-indicator-subtitle">Ready</span>
    </div>
    <div class="hyvewyre-indicator-actions">
      <button class="hyvewyre-action-btn" id="hyvewyre-quick-import" title="Quick Import (Alt+Shift+L)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M19 12l-7 7-7-7"/>
        </svg>
      </button>
    </div>
  `;

  // Add styles
  addIndicatorStyles();

  document.body.appendChild(indicator);

  // Add click handlers
  indicator.addEventListener('click', (e) => {
    if (e.target.closest('#hyvewyre-quick-import')) {
      quickImportLead();
    } else if (!e.target.closest('.hyvewyre-indicator-actions')) {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    }
  });

  // Animate in
  setTimeout(() => indicator.classList.add('visible'), 100);
}

function addIndicatorStyles() {
  if (document.getElementById('hyvewyre-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'hyvewyre-styles';
  styles.textContent = `
    #hyvewyre-indicator {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: white;
      padding: 10px 16px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
      cursor: pointer;
      z-index: 999999;
      transform: translateX(120%);
      transition: transform 0.3s ease, box-shadow 0.2s;
    }

    #hyvewyre-indicator.visible {
      transform: translateX(0);
    }

    #hyvewyre-indicator:hover {
      box-shadow: 0 6px 24px rgba(59, 130, 246, 0.5);
    }

    .hyvewyre-indicator-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .hyvewyre-indicator-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .hyvewyre-indicator-title {
      font-weight: 600;
      font-size: 13px;
    }

    .hyvewyre-indicator-subtitle {
      font-size: 10px;
      opacity: 0.8;
    }

    .hyvewyre-indicator-actions {
      display: flex;
      gap: 6px;
      margin-left: 8px;
    }

    .hyvewyre-action-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 6px;
      padding: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      transition: background 0.2s;
    }

    .hyvewyre-action-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    #hyvewyre-toast {
      position: fixed;
      bottom: 80px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: white;
      z-index: 999999;
      transform: translateY(20px);
      opacity: 0;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    #hyvewyre-toast.visible {
      transform: translateY(0);
      opacity: 1;
    }

    #hyvewyre-toast.success {
      background: #10b981;
    }

    #hyvewyre-toast.error {
      background: #ef4444;
    }

    #hyvewyre-toast.info {
      background: #3b82f6;
    }
  `;

  document.head.appendChild(styles);
}

function updateIndicatorWithLead(lead) {
  const subtitle = document.querySelector('.hyvewyre-indicator-subtitle');
  if (subtitle && lead) {
    const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
    subtitle.textContent = name || 'Lead detected';
  }
}

function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.getElementById('hyvewyre-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'hyvewyre-toast';
  toast.className = type;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add('visible'), 10);

  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function hideAllExtensionUI() {
  const toast = document.getElementById('hyvewyre-toast');
  if (toast) {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }
}

// Cleanup
function cleanup() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  const indicator = document.getElementById('hyvewyre-indicator');
  if (indicator) indicator.remove();

  const toast = document.getElementById('hyvewyre-toast');
  if (toast) toast.remove();

  const styles = document.getElementById('hyvewyre-styles');
  if (styles) styles.remove();
}

// Listen for cleanup messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'cleanup') {
    cleanup();
    sendResponse({ success: true });
  }
  return true;
});

// Initialize after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  setTimeout(initialize, 500);
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);
