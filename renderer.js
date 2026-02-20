const { ipcRenderer } = require('electron');

// ═══════════════════════════════════════════════════════════════
// Config and state
// ═══════════════════════════════════════════════════════════════

let lastEnabledPlatforms = { chatgpt: true, claude: true, gemini: true };
let panelWidths = {}; // { chatgpt: '400px', ... }
let savedTabs = [];
let initialLoad = true;

async function loadConfig() {
  lastEnabledPlatforms = await ipcRenderer.invoke('store-get', 'enabledPlatforms', { chatgpt: true, claude: true, gemini: true });
  panelWidths = await ipcRenderer.invoke('store-get', 'panelWidths', {});
  savedTabs = await ipcRenderer.invoke('store-get', 'savedTabs', []);
}

function saveConfig() {
  ipcRenderer.send('store-set', 'enabledPlatforms', lastEnabledPlatforms);
}

function saveTabs() {
  if (initialLoad) return;
  const tabsToSave = tabs.map(t => {
    const urls = {};
    for (const p of Object.keys(PLATFORMS)) {
      if (t.webviews[p]) {
        try { urls[p] = t.webviews[p].getURL(); } catch (e) {}
      }
    }
    return {
      name: t.name,
      urls,
      enabledPlatforms: t.enabledPlatforms,
      userRenamed: t.userRenamed,
      querySent: t.querySent
    };
  });
  ipcRenderer.send('store-set', 'savedTabs', tabsToSave);
  const idx = tabs.findIndex(t => t.id === activeTabId);
  ipcRenderer.send('store-set', 'activeTabIndex', idx >= 0 ? idx : 0);
}

// ═══════════════════════════════════════════════════════════════
// Platform configuration
// ═══════════════════════════════════════════════════════════════

const PLATFORMS = {
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com', css: 'chatgpt' },
  claude:  { label: 'Claude',  url: 'https://claude.ai',    css: 'claude' },
  gemini:  { label: 'Gemini',  url: 'https://gemini.google.com/app', css: 'gemini' }
};

// ═══════════════════════════════════════════════════════════════
// Injection scripts
// ═══════════════════════════════════════════════════════════════

const DEEP_QUERY_HELPER = `
  function deepQuery(root, selector) {
    let el = root.querySelector(selector);
    if (el) return el;
    const all = root.querySelectorAll('*');
    for (const node of all) {
      if (node.shadowRoot) { el = deepQuery(node.shadowRoot, selector); if (el) return el; }
    }
    return null;
  }
`;

function chatgptScript(query) {
  const q = JSON.stringify(query);
  return `(async () => {
    ${DEEP_QUERY_HELPER}
    let input = document.querySelector('#prompt-textarea');
    if (!input) input = document.querySelector('div[contenteditable="true"][data-placeholder]');
    if (!input) input = document.querySelector('div[contenteditable="true"]');
    if (!input) input = document.querySelector('textarea');
    if (!input) return 'ERR: Input not found';
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, ${q});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(input); sel.removeAllRanges(); sel.addRange(range);
      document.execCommand('insertText', false, ${q});
    }
    await new Promise(r => setTimeout(r, 500));
    let sendBtn = document.querySelector('[data-testid="send-button"]');
    if (!sendBtn) sendBtn = document.querySelector('button[aria-label="Send prompt"]');
    if (!sendBtn) sendBtn = document.querySelector('button[aria-label*="Send"]');
    if (!sendBtn) { const buttons = document.querySelectorAll('form button'); for (const btn of buttons) { if (btn.querySelector('svg') && !btn.disabled) { sendBtn = btn; break; } } }
    if (sendBtn && !sendBtn.disabled) { sendBtn.click(); return 'OK'; }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return 'OK (Enter)';
  })()`;
}

function claudeScript(query) {
  const q = JSON.stringify(query);
  return `(async () => {
    let input = document.querySelector('div.ProseMirror[contenteditable="true"]');
    if (!input) input = document.querySelector('[contenteditable="true"].ProseMirror');
    if (!input) input = document.querySelector('fieldset [contenteditable="true"]');
    if (!input) input = document.querySelector('[contenteditable="true"]');
    if (!input) return 'ERR: Input not found';
    input.focus();
    const sel = window.getSelection(); const range = document.createRange();
    range.selectNodeContents(input); sel.removeAllRanges(); sel.addRange(range);
    document.execCommand('insertText', false, ${q});
    await new Promise(r => setTimeout(r, 500));
    let sendBtn = document.querySelector('button[aria-label="Send Message"]');
    if (!sendBtn) sendBtn = document.querySelector('button[aria-label*="Send"]');
    if (!sendBtn) sendBtn = document.querySelector('[data-testid="send-button"]');
    if (!sendBtn) { const fs = document.querySelector('fieldset'); if (fs) { for (const btn of fs.querySelectorAll('button')) { if (btn.querySelector('svg') && !btn.disabled) sendBtn = btn; } } }
    if (sendBtn && !sendBtn.disabled) { sendBtn.click(); return 'OK'; }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return 'OK (Enter)';
  })()`;
}

function geminiScript(query) {
  const q = JSON.stringify(query);
  return `(async () => {
    ${DEEP_QUERY_HELPER}
    let input = document.querySelector('.ql-editor[contenteditable="true"]');
    if (!input) { const r = document.querySelector('rich-textarea'); if (r?.shadowRoot) { input = r.shadowRoot.querySelector('[contenteditable="true"]') || r.shadowRoot.querySelector('.ql-editor'); } }
    if (!input) { const ia = document.querySelector('input-area-v2'); if (ia?.shadowRoot) { const r = ia.shadowRoot.querySelector('rich-textarea'); if (r?.shadowRoot) input = r.shadowRoot.querySelector('[contenteditable="true"]'); } }
    if (!input) input = deepQuery(document, '.ql-editor[contenteditable="true"]');
    if (!input) input = deepQuery(document, '[contenteditable="true"]');
    if (!input) input = document.querySelector('textarea');
    if (!input) return 'ERR: Input not found';
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, ${q}); input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(input); sel.removeAllRanges(); sel.addRange(range);
      document.execCommand('insertText', false, ${q});
    }
    await new Promise(r => setTimeout(r, 500));
    let sendBtn = document.querySelector('button[aria-label="Send message"]');
    if (!sendBtn) sendBtn = document.querySelector('button[aria-label*="Send"]');
    if (!sendBtn) sendBtn = deepQuery(document, 'button[aria-label*="Send"]');
    if (!sendBtn) sendBtn = deepQuery(document, '.send-button') || deepQuery(document, 'button.send-button');
    if (!sendBtn) { for (const btn of document.querySelectorAll('button')) { const l = (btn.getAttribute('aria-label')||'').toLowerCase(); const t = (btn.textContent||'').toLowerCase(); if (l.includes('send') || t.includes('send')) { sendBtn = btn; break; } } }
    if (sendBtn && !sendBtn.disabled) { sendBtn.click(); return 'OK'; }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return 'OK (Enter)';
  })()`;
}

const INJECT_SCRIPTS = { chatgpt: chatgptScript, claude: claudeScript, gemini: geminiScript };

// ═══════════════════════════════════════════════════════════════
// Tab management
// ═══════════════════════════════════════════════════════════════

let tabs = [];
let activeTabId = null;
let nextTabId = 0;
const toggleEls = {}; // platform -> toggle button element
const titleDebounceTimers = {}; // tabId -> timeout

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) || null;
}

// ── Auto-naming helpers ──

const GENERIC_TITLES = new Set([
  'new chat', 'home', 'claude', 'chatgpt', 'gemini', 'google gemini',
  'claude.ai', 'chat', '', 'untitled'
]);

const TITLE_PREFIXES = [
  /^Claude\s*[-–—:]\s*/i,
  /^ChatGPT\s*[-–—:]\s*/i,
  /^Gemini\s*[-–—:]\s*/i,
  /^Google Gemini\s*[-–—:]\s*/i,
];

const TITLE_SUFFIXES = [
  /\s*[-–—|]\s*Claude(\.ai)?$/i,
  /\s*[-–—|]\s*ChatGPT$/i,
  /\s*[-–—|]\s*Gemini$/i,
  /\s*[-–—|]\s*Google Gemini$/i,
];

function cleanTitle(platform, rawTitle) {
  if (!rawTitle) return null;
  // Remove zero-width characters and LRM/RLM marks (fixes Gemini titles)
  let title = rawTitle.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '').trim();

  for (const re of TITLE_PREFIXES) {
    title = title.replace(re, '');
  }
  for (const re of TITLE_SUFFIXES) {
    title = title.replace(re, '');
  }
  title = title.trim();

  if (!title || GENERIC_TITLES.has(title.toLowerCase())) return null;
  return title;
}

function deriveAutoName(tab) {
  // Priority: claude > chatgpt > gemini
  const priorities = ['claude', 'chatgpt', 'gemini'];
  for (const p of priorities) {
    const t = tab.autoTitles[p];
    if (t) return t;
  }
  return null;
}

function maybeAutoRename(tab) {
  if (tab.userRenamed || !tab.querySent) return;
  // Only auto-rename once the highest-priority platform with an enabled
  // webview has produced a title, so faster lower-priority platforms
  // (e.g. Gemini) don't flash their name before Claude/ChatGPT respond.
  const priorities = ['claude', 'chatgpt', 'gemini'];
  const topEnabled = priorities.find(p => tab.enabledPlatforms[p]);
  if (topEnabled && !tab.autoTitles[topEnabled]) return;

  const name = deriveAutoName(tab);
  if (name) {
    tab.name = name.length > 40 ? name.slice(0, 37) + '...' : name;
    renderTabBar();
  }
}

function createTab(name = 'New Chat', initialData = null) {
  const id = ++nextTabId;
  const tab = {
    id,
    name: initialData ? initialData.name : name,
    webviews: {},
    statusEls: {},
    panels: {},
    enabledPlatforms: initialData ? { ...initialData.enabledPlatforms } : { ...lastEnabledPlatforms },
    autoTitles: {},
    userRenamed: initialData ? initialData.userRenamed : false,
    querySent: initialData ? initialData.querySent : false,
    container: null
  };

  const container = document.createElement('div');
  container.className = 'tab-content';
  container.dataset.tabId = id;

  const platformKeys = Object.keys(PLATFORMS);
  tab.resizeHandles = [];

  for (let i = 0; i < platformKeys.length; i++) {
    const platform = platformKeys[i];
    const cfg = PLATFORMS[platform];

    const panel = document.createElement('div');
    panel.className = 'panel';
    if (panelWidths[platform]) {
      panel.style.flex = panelWidths[platform];
    }

    const header = document.createElement('div');
    header.className = `panel-header ${cfg.css}`;

    const dot = document.createElement('span');
    dot.className = 'dot';

    const labelNode = document.createTextNode(' ' + cfg.label);

    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = 'Loading...';

    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'panel-btn reload';
    reloadBtn.title = 'Reload';
    reloadBtn.innerHTML = '&#x21bb;';

    const devtoolsBtn = document.createElement('button');
    devtoolsBtn.className = 'panel-btn devtools';
    devtoolsBtn.title = 'DevTools';
    devtoolsBtn.textContent = 'F12';

    header.append(dot, labelNode, status, reloadBtn, devtoolsBtn);

    const wv = document.createElement('webview');
    wv.src = (initialData && initialData.urls && initialData.urls[platform]) ? initialData.urls[platform] : cfg.url;
    wv.setAttribute('partition', `persist:${platform}`);
    wv.setAttribute('allowpopups', '');

    reloadBtn.addEventListener('click', () => wv.reload());
    devtoolsBtn.addEventListener('click', () => {
      wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools();
    });

    wv.addEventListener('did-start-loading', () => { status.textContent = 'Loading...'; status.className = 'status active'; });
    wv.addEventListener('did-stop-loading', () => { status.textContent = 'Ready'; status.className = 'status'; });
    wv.addEventListener('did-finish-load', () => { status.textContent = 'Ready'; status.className = 'status'; });
    wv.addEventListener('did-fail-load', (e) => { if (e.errorCode !== -3) { status.textContent = 'Load failed'; status.className = 'status error'; } });
    wv.addEventListener('dom-ready', () => { status.textContent = 'Ready'; status.className = 'status'; });

    // Save tabs on navigation to persist chat history URL
    wv.addEventListener('did-navigate', () => saveTabs());
    wv.addEventListener('did-navigate-in-page', () => saveTabs());

    // Auto-naming: listen for page title updates
    wv.addEventListener('page-title-updated', (e) => {
      const cleaned = cleanTitle(platform, e.title);
      if (cleaned) {
        tab.autoTitles[platform] = cleaned;
      }
      // Debounce per tab to avoid flicker
      clearTimeout(titleDebounceTimers[tab.id]);
      titleDebounceTimers[tab.id] = setTimeout(() => maybeAutoRename(tab), 500);
    });

    panel.append(header, wv);
    container.appendChild(panel);

    tab.webviews[platform] = wv;
    tab.statusEls[platform] = status;
    tab.panels[platform] = panel;

    // Add resize handle between panels (not after the last one)
    if (i < platformKeys.length - 1) {
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.dataset.leftPlatform = platform;
      handle.dataset.rightPlatform = platformKeys[i + 1];
      container.appendChild(handle);
      tab.resizeHandles.push(handle);
      initResizeHandle(handle, tab);
    }
  }

  tab.container = container;
  document.getElementById('panels-container').appendChild(container);
  tabs.push(tab);

  switchToTab(id);
  renderTabBar();
  saveTabs();
  return tab;
}

function switchToTab(id) {
  activeTabId = id;
  for (const t of tabs) {
    t.container.classList.toggle('active', t.id === id);
  }
  updateTogglesUI();
  updatePanelVisibility();
  renderTabBar();
  saveTabs();
}

function closeTab(id) {
  if (tabs.length <= 1) return;
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tab = tabs[idx];
  // Clean up debounce timer
  clearTimeout(titleDebounceTimers[tab.id]);
  delete titleDebounceTimers[tab.id];

  for (const wv of Object.values(tab.webviews)) { try { wv.remove(); } catch {} }
  tab.container.remove();
  tabs.splice(idx, 1);

  if (activeTabId === id) {
    switchToTab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    renderTabBar();
  }
  saveTabs();
}

function resetCurrentTab() {
  const tab = getActiveTab();
  if (!tab) return;
  for (const [platform, cfg] of Object.entries(PLATFORMS)) {
    if (tab.webviews[platform]) tab.webviews[platform].loadURL(cfg.url);
  }
  tab.name = 'New Chat';
  tab.autoTitles = {};
  tab.userRenamed = false;
  tab.querySent = false;
  renderTabBar();
  saveTabs();
}

function renameTab(id, name) {
  const tab = tabs.find(t => t.id === id);
  if (tab) {
    tab.name = name.length > 40 ? name.slice(0, 37) + '...' : name;
    renderTabBar();
    saveTabs();
  }
}

function nextTab() {
  const idx = tabs.findIndex(t => t.id === activeTabId);
  switchToTab(tabs[(idx + 1) % tabs.length].id);
}

function prevTab() {
  const idx = tabs.findIndex(t => t.id === activeTabId);
  switchToTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
}

function gotoTab(index) {
  if (index >= 0 && index < tabs.length) switchToTab(tabs[index].id);
}

function renderTabBar() {
  const bar = document.getElementById('tab-bar');
  const addBtn = document.getElementById('btn-tab-add');
  bar.querySelectorAll('.tab').forEach(el => el.remove());

  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'tab-label';
    labelSpan.textContent = tab.name;
    labelSpan.title = tab.name;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });

    el.append(labelSpan, closeBtn);
    el.addEventListener('click', () => switchToTab(tab.id));
    bar.insertBefore(el, addBtn);
  }
}

// ═══════════════════════════════════════════════════════════════
// Platform toggles (per-tab state, no DOM toggles)
// ═══════════════════════════════════════════════════════════════

function initToggles() {
  const container = document.getElementById('toggle-container');
  for (const [platform, cfg] of Object.entries(PLATFORMS)) {
    const btn = document.createElement('button');
    btn.className = `platform-toggle active ${cfg.css}`;
    btn.dataset.platform = platform;
    btn.innerHTML = `<span class="toggle-check">&#10003;</span>${cfg.label}`;
    btn.addEventListener('click', () => togglePlatform(platform));
    container.appendChild(btn);
    toggleEls[platform] = btn;
  }
}

function togglePlatform(platform) {
  const tab = getActiveTab();
  if (!tab) return;

  // Don't allow disabling all platforms
  const enabled = tab.enabledPlatforms;
  const otherEnabled = Object.entries(enabled).some(([p, v]) => p !== platform && v);
  if (enabled[platform] && !otherEnabled) return;

  enabled[platform] = !enabled[platform];
  lastEnabledPlatforms = { ...enabled };
  saveConfig();
  updateTogglesUI();
  updatePanelVisibility();
  saveTabs();
}

function updateTogglesUI() {
  const tab = getActiveTab();
  if (!tab) return;
  for (const [platform, el] of Object.entries(toggleEls)) {
    el.classList.toggle('active', tab.enabledPlatforms[platform]);
  }
}

function updatePanelVisibility() {
  const tab = getActiveTab();
  if (!tab) return;

  // Reset flex on all panels when toggling visibility
  for (const [platform, enabled] of Object.entries(tab.enabledPlatforms)) {
    const panel = tab.panels[platform];
    panel.classList.toggle('hidden', !enabled);
    if (!enabled) panel.style.flex = '';
  }

  // Show/hide resize handles based on adjacent panel visibility
  if (tab.resizeHandles) {
    for (const handle of tab.resizeHandles) {
      const leftVisible = tab.enabledPlatforms[handle.dataset.leftPlatform];
      const rightVisible = tab.enabledPlatforms[handle.dataset.rightPlatform];
      handle.style.display = (leftVisible && rightVisible) ? '' : 'none';
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════

function showOnlyPlatform(platform) {
  const tab = getActiveTab();
  if (!tab) return;
  for (const p of Object.keys(PLATFORMS)) {
    tab.enabledPlatforms[p] = (p === platform);
  }
  lastEnabledPlatforms = { ...tab.enabledPlatforms };
  saveConfig();
  updateTogglesUI();
  updatePanelVisibility();
}

function showAllPlatforms() {
  const tab = getActiveTab();
  if (!tab) return;
  for (const p of Object.keys(PLATFORMS)) {
    tab.enabledPlatforms[p] = true;
  }
  lastEnabledPlatforms = { ...tab.enabledPlatforms };
  saveConfig();
  updateTogglesUI();
  updatePanelVisibility();
}

function reloadAllPanels() {
  const tab = getActiveTab();
  if (!tab) return;
  for (const [platform, wv] of Object.entries(tab.webviews)) {
    if (tab.enabledPlatforms[platform]) wv.reload();
  }
}

function reloadPlatform(platform) {
  const tab = getActiveTab();
  if (!tab || !tab.webviews[platform]) return;
  tab.webviews[platform].reload();
}

function toggleDevtools(platform) {
  const tab = getActiveTab();
  if (!tab || !tab.webviews[platform]) return;
  const wv = tab.webviews[platform];
  wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools();
}

function resetPanelWidths() {
  const tab = getActiveTab();
  if (!tab) return;
  for (const panel of Object.values(tab.panels)) {
    panel.style.flex = '';
  }
  panelWidths = {};
  ipcRenderer.send('store-set', 'panelWidths', panelWidths);
}

// ═══════════════════════════════════════════════════════════════
// Panel resize
// ═══════════════════════════════════════════════════════════════

function initResizeHandle(handle, tab) {
  let startX, leftStartWidth, rightStartWidth, leftPanel, rightPanel, containerWidth;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const leftPlatform = handle.dataset.leftPlatform;
    const rightPlatform = handle.dataset.rightPlatform;
    leftPanel = tab.panels[leftPlatform];
    rightPanel = tab.panels[rightPlatform];

    if (!leftPanel || !rightPanel || leftPanel.classList.contains('hidden') || rightPanel.classList.contains('hidden')) return;

    startX = e.clientX;
    leftStartWidth = leftPanel.getBoundingClientRect().width;
    rightStartWidth = rightPanel.getBoundingClientRect().width;
    containerWidth = leftStartWidth + rightStartWidth;

    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // Overlay to prevent webviews from capturing mouse events
    const overlay = document.createElement('div');
    overlay.id = 'resize-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;';
    document.body.appendChild(overlay);

    const onMove = (e) => {
      const delta = e.clientX - startX;
      const newLeft = Math.max(80, Math.min(containerWidth - 80, leftStartWidth + delta));
      const newRight = containerWidth - newLeft;

      leftPanel.style.flex = `0 0 ${newLeft}px`;
      rightPanel.style.flex = `0 0 ${newRight}px`;
    };

    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.getElementById('resize-overlay')?.remove();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      
      panelWidths[leftPlatform] = leftPanel.style.flex;
      panelWidths[rightPlatform] = rightPanel.style.flex;
      ipcRenderer.send('store-set', 'panelWidths', panelWidths);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Double-click to reset to equal widths
  handle.addEventListener('dblclick', () => {
    const leftPlatform = handle.dataset.leftPlatform;
    const rightPlatform = handle.dataset.rightPlatform;
    tab.panels[leftPlatform].style.flex = '';
    tab.panels[rightPlatform].style.flex = '';
    
    delete panelWidths[leftPlatform];
    delete panelWidths[rightPlatform];
    ipcRenderer.send('store-set', 'panelWidths', panelWidths);
  });
}

// ═══════════════════════════════════════════════════════════════
// Command Palette
// ═══════════════════════════════════════════════════════════════

let paletteOpen = false;
let paletteSelectedIndex = 0;
let paletteItems = [];
let paletteMode = 'command'; // 'command' or 'rename'

function getCommands() {
  const commands = [
    // Tabs
    { id: 'new-tab', label: 'New Tab', category: 'Tabs', shortcut: '\u2318T', action: () => { createTab(); document.getElementById('query-input').focus(); } },
    { id: 'close-tab', label: 'Close Tab', category: 'Tabs', shortcut: '\u2318W', action: () => closeTab(activeTabId) },
    { id: 'next-tab', label: 'Next Tab', category: 'Tabs', shortcut: '\u2318\u21e7]', action: () => nextTab() },
    { id: 'prev-tab', label: 'Previous Tab', category: 'Tabs', shortcut: '\u2318\u21e7[', action: () => prevTab() },
    { id: 'new-chat', label: 'New Chat', category: 'Tabs', shortcut: '\u2318N', action: () => resetCurrentTab() },
    { id: 'rename-tab', label: 'Rename Tab', category: 'Tabs', action: () => enterRenameMode() },

    // Platforms
    { id: 'toggle-chatgpt', label: 'Toggle ChatGPT', category: 'Platforms', shortcut: '\u2318\u21e7 1', action: () => togglePlatform('chatgpt') },
    { id: 'toggle-claude', label: 'Toggle Claude', category: 'Platforms', shortcut: '\u2318\u21e7 2', action: () => togglePlatform('claude') },
    { id: 'toggle-gemini', label: 'Toggle Gemini', category: 'Platforms', shortcut: '\u2318\u21e7 3', action: () => togglePlatform('gemini') },
    { id: 'show-only-chatgpt', label: 'Show Only ChatGPT', category: 'Platforms', action: () => showOnlyPlatform('chatgpt') },
    { id: 'show-only-claude', label: 'Show Only Claude', category: 'Platforms', action: () => showOnlyPlatform('claude') },
    { id: 'show-only-gemini', label: 'Show Only Gemini', category: 'Platforms', action: () => showOnlyPlatform('gemini') },
    { id: 'show-all', label: 'Show All Platforms', category: 'Platforms', action: () => showAllPlatforms() },

    // Actions
    { id: 'sync-cookies', label: 'Sync Cookies', category: 'Actions', action: () => syncCookies() },
    { id: 'reload-all', label: 'Reload All Panels', category: 'Actions', shortcut: '\u2318\u21e7R', action: () => reloadAllPanels() },
    { id: 'reload-chatgpt', label: 'Reload ChatGPT', category: 'Actions', action: () => reloadPlatform('chatgpt') },
    { id: 'reload-claude', label: 'Reload Claude', category: 'Actions', action: () => reloadPlatform('claude') },
    { id: 'reload-gemini', label: 'Reload Gemini', category: 'Actions', action: () => reloadPlatform('gemini') },
    { id: 'devtools-chatgpt', label: 'DevTools: ChatGPT', category: 'Actions', action: () => toggleDevtools('chatgpt') },
    { id: 'devtools-claude', label: 'DevTools: Claude', category: 'Actions', action: () => toggleDevtools('claude') },
    { id: 'devtools-gemini', label: 'DevTools: Gemini', category: 'Actions', action: () => toggleDevtools('gemini') },
    { id: 'focus-input', label: 'Focus Input', category: 'Actions', shortcut: '\u2318L', action: () => document.getElementById('query-input').focus() },
    { id: 'reset-widths', label: 'Reset Panel Widths', category: 'Actions', action: () => resetPanelWidths() },
  ];

  // Dynamic: Go to Tab entries
  for (const tab of tabs) {
    commands.push({
      id: `goto-tab-${tab.id}`,
      label: tab.name,
      category: 'Go to Tab',
      action: () => switchToTab(tab.id)
    });
  }

  return commands;
}

function fuzzyMatch(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring match — highest priority
  const subIdx = t.indexOf(q);
  if (subIdx !== -1) {
    return { match: true, score: 1000 - subIdx };
  }

  // Subsequence match with scoring
  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Consecutive bonus
      if (lastMatchIndex === ti - 1) score += 10;
      // Word boundary bonus
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-' || t[ti - 1] === ':') score += 5;
      score += 1;
      lastMatchIndex = ti;
      qi++;
    }
  }

  if (qi === q.length) {
    return { match: true, score };
  }

  return { match: false, score: 0 };
}

function openPalette() {
  paletteOpen = true;
  paletteMode = 'command';

  const backdrop = document.getElementById('palette-backdrop');
  const palette = document.getElementById('palette');
  const input = document.getElementById('palette-input');

  backdrop.classList.add('open');
  palette.classList.add('open');
  input.value = '';
  input.placeholder = 'Type a command...';

  renderPaletteResults('');
  input.focus();
}

function closePalette() {
  paletteOpen = false;
  paletteMode = 'command';

  document.getElementById('palette-backdrop').classList.remove('open');
  document.getElementById('palette').classList.remove('open');
}

function togglePalette() {
  if (paletteOpen) closePalette();
  else openPalette();
}

function enterRenameMode() {
  paletteMode = 'rename';

  const input = document.getElementById('palette-input');
  const tab = getActiveTab();
  input.value = tab ? tab.name : '';
  input.placeholder = 'Enter new tab name...';
  input.select();

  const results = document.getElementById('palette-results');
  results.innerHTML = '<div class="palette-empty">Press Enter to confirm, Esc to cancel</div>';
}

function renderPaletteResults(query) {
  const results = document.getElementById('palette-results');
  results.innerHTML = '';

  if (paletteMode === 'rename') return;

  const commands = getCommands();
  let items;

  if (!query) {
    items = commands;
  } else {
    items = commands
      .map(cmd => ({ ...cmd, ...fuzzyMatch(query, cmd.label) }))
      .filter(cmd => cmd.match)
      .sort((a, b) => b.score - a.score);
  }

  paletteItems = items;
  paletteSelectedIndex = 0;

  if (items.length === 0) {
    results.innerHTML = '<div class="palette-empty">No matching commands</div>';
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const el = document.createElement('div');
    el.className = 'palette-item' + (i === 0 ? ' selected' : '');
    el.dataset.index = i;

    const label = document.createElement('span');
    label.className = 'palette-item-label';
    label.textContent = item.label;

    const cat = document.createElement('span');
    cat.className = 'palette-item-category';
    cat.textContent = item.category;

    el.append(label, cat);

    if (item.shortcut) {
      const shortcutEl = document.createElement('span');
      shortcutEl.className = 'palette-item-shortcut';
      shortcutEl.textContent = item.shortcut;
      el.appendChild(shortcutEl);
    }

    el.addEventListener('click', () => executePaletteItem(i));
    el.addEventListener('mouseenter', () => updatePaletteSelection(i));

    results.appendChild(el);
  }
}

function updatePaletteSelection(index) {
  paletteSelectedIndex = index;
  const items = document.querySelectorAll('.palette-item');
  items.forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });
  // Scroll selected item into view
  const selected = items[index];
  if (selected) selected.scrollIntoView({ block: 'nearest' });
}

function executePaletteItem(index) {
  if (paletteMode === 'rename') return;

  const item = paletteItems[index];
  if (!item) return;

  closePalette();
  item.action();
}

// ═══════════════════════════════════════════════════════════════
// Query injection
// ═══════════════════════════════════════════════════════════════

async function sendQueryToActiveTab(query) {
  const tab = getActiveTab();
  if (!tab) return;

  tab.querySent = true;

  // Query-based naming as immediate fallback
  if (tab.name === 'New Chat' && !tab.userRenamed) {
    renameTab(tab.id, query);
  }

  const enabledPlatforms = Object.entries(tab.enabledPlatforms).filter(([, v]) => v).map(([p]) => p);

  await Promise.allSettled(
    enabledPlatforms.map(async (platform) => {
      const wv = tab.webviews[platform];
      const statusEl = tab.statusEls[platform];
      if (!wv || !statusEl) return;

      statusEl.textContent = 'Injecting...';
      statusEl.className = 'status active';

      try {
        const result = await wv.executeJavaScript(INJECT_SCRIPTS[platform](query));
        if (result && result.startsWith('ERR')) {
          statusEl.textContent = result;
          statusEl.className = 'status error';
        } else {
          statusEl.textContent = 'Sent';
          statusEl.className = 'status sent';
        }
      } catch (err) {
        statusEl.textContent = 'Error';
        statusEl.className = 'status error';
        console.error(`${platform} injection error:`, err);
      }
    })
  );

  setTimeout(() => {
    if (!tab.statusEls) return;
    for (const statusEl of Object.values(tab.statusEls)) {
      statusEl.textContent = 'Ready';
      statusEl.className = 'status';
    }
  }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// Cookie sync (extracted as callable function)
// ═══════════════════════════════════════════════════════════════

async function syncCookies() {
  const syncBtn = document.getElementById('btn-sync');
  const syncStatus = document.getElementById('sync-status');

  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';
  syncBtn.className = 'btn-sync';
  syncStatus.textContent = '';

  try {
    const results = await ipcRenderer.invoke('import-all-cookies');
    const summary = [];
    let allOk = true;

    for (const [platform, result] of Object.entries(results)) {
      if (result.success) {
        summary.push(`${platform}: ${result.imported}`);
      } else {
        summary.push(`${platform}: fail`);
        allOk = false;
      }
    }

    syncStatus.textContent = summary.join(' | ');

    if (allOk) {
      syncBtn.textContent = 'Synced';
      syncBtn.className = 'btn-sync success';
      const tab = getActiveTab();
      if (tab) { for (const wv of Object.values(tab.webviews)) wv.reload(); }
    } else {
      syncBtn.textContent = 'Partial';
      syncBtn.className = 'btn-sync error';
    }

    const profileName = Object.values(results).find(r => r.profileName)?.profileName;
    if (profileName) syncStatus.textContent = `"${profileName}" | ` + syncStatus.textContent;
  } catch (err) {
    syncBtn.textContent = 'Failed';
    syncBtn.className = 'btn-sync error';
    syncStatus.textContent = err.message;
  }

  setTimeout(() => {
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync from Chrome';
    syncBtn.className = 'btn-sync';
  }, 5000);
}

// ═══════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();

  const form = document.getElementById('query-form');
  const input = document.getElementById('query-input');
  const sendBtn = document.getElementById('send-btn');
  const syncBtn = document.getElementById('btn-sync');

  initToggles();
  
  if (savedTabs && savedTabs.length > 0) {
    for (const tabData of savedTabs) {
      createTab(tabData.name, tabData);
    }
    const activeIdx = await ipcRenderer.invoke('store-get', 'activeTabIndex', 0);
    if (activeIdx >= 0 && activeIdx < tabs.length) {
      switchToTab(tabs[activeIdx].id);
    }
  } else {
    createTab();
  }
  
  initialLoad = false;

  document.getElementById('btn-tab-add').addEventListener('click', () => createTab());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    input.value = '';

    await sendQueryToActiveTab(query);

    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    input.focus();
  });

  // ── Chrome cookie sync button ──
  syncBtn.addEventListener('click', () => syncCookies());

  // ── Theme switcher ──
  const THEME_CYCLE = ['system', 'light', 'dark'];
  const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
  const themeBtn = document.getElementById('btn-theme');

  function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (theme === 'light' || theme === 'dark') {
      root.classList.add(theme);
    }
    localStorage.setItem('llmux-theme', theme);
    themeBtn.textContent = THEME_LABELS[theme];
  }

  themeBtn.addEventListener('click', () => {
    const current = localStorage.getItem('llmux-theme') || 'system';
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
    applyTheme(next);
  });

  applyTheme(localStorage.getItem('llmux-theme') || 'system');

  // ── Command palette keyboard handling ──
  document.getElementById('palette-backdrop').addEventListener('click', () => closePalette());

  document.getElementById('palette-input').addEventListener('input', (e) => {
    if (paletteMode === 'rename') return;
    renderPaletteResults(e.target.value);
  });

  document.getElementById('palette-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (paletteMode === 'rename') {
        const newName = e.target.value.trim();
        if (newName) {
          const tab = getActiveTab();
          if (tab) {
            tab.userRenamed = true;
            renameTab(tab.id, newName);
          }
        }
        closePalette();
      } else {
        executePaletteItem(paletteSelectedIndex);
      }
      return;
    }

    if (paletteMode === 'command') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (paletteItems.length > 0) {
          updatePaletteSelection((paletteSelectedIndex + 1) % paletteItems.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (paletteItems.length > 0) {
          updatePaletteSelection((paletteSelectedIndex - 1 + paletteItems.length) % paletteItems.length);
        }
      }
    }
  });

  // ── IPC keyboard shortcuts ──
  ipcRenderer.on('new-chat', () => resetCurrentTab());
  ipcRenderer.on('new-tab', () => { createTab(); input.focus(); });
  ipcRenderer.on('close-tab', () => closeTab(activeTabId));
  ipcRenderer.on('next-tab', () => nextTab());
  ipcRenderer.on('prev-tab', () => prevTab());
  ipcRenderer.on('goto-tab', (_e, index) => gotoTab(index));
  ipcRenderer.on('toggle-command-palette', () => togglePalette());
  ipcRenderer.on('toggle-platform', (_e, platform) => togglePlatform(platform));
  ipcRenderer.on('reload-all', () => reloadAllPanels());
  ipcRenderer.on('focus-input', () => input.focus());
  ipcRenderer.on('focus-leftmost-app', () => {
    const tab = getActiveTab();
    if (!tab) return;
    for (const platform of Object.keys(PLATFORMS)) {
      if (tab.enabledPlatforms[platform] && tab.webviews[platform]) {
        tab.webviews[platform].focus();
        break;
      }
    }
  });

  ipcRenderer.on('deep-link-query', (_e, query) => {
    const tab = createTab();
    // Wait briefly for webviews to initialize
    setTimeout(() => sendQueryToActiveTab(query), 2000);
  });

  input.focus();
});
