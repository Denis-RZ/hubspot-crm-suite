import { clearResult, initLiveValidation, setError, showPanel, toast } from './ui.js';
import { loadModules } from './module-registry.js';
import { refreshAll } from './runtime.js';
import { mountUtilityPanels } from './utility-panels.js';
import { initAssociateModal } from './associate-modal.js';

const NAV_ORDER_KEY = 'crm-nav-order';

// Marks the English content right before every .zh element as .en, so the
// 中文 toggle is a real language switch (show one, hide the other) instead
// of stacking both languages. Panels re-render on every data refresh, so
// this runs continuously via a MutationObserver rather than once on load.
const ZH_BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'LI', 'TR', 'TD', 'TH']);

function wrapEnglishBeforeZh(root) {
  root.querySelectorAll('.zh').forEach(zhEl => {
    let firstMeaningful = zhEl.previousSibling;
    while (firstMeaningful && firstMeaningful.nodeType === Node.TEXT_NODE && !firstMeaningful.textContent.trim()) {
      firstMeaningful = firstMeaningful.previousSibling;
    }
    if (!firstMeaningful) return;

    if (firstMeaningful.nodeType === Node.ELEMENT_NODE &&
        (firstMeaningful.classList.contains('zh') || firstMeaningful.classList.contains('en'))) {
      return;
    }

    if (firstMeaningful.nodeType === Node.ELEMENT_NODE && ZH_BLOCK_TAGS.has(firstMeaningful.tagName)) {
      firstMeaningful.classList.add('en');
      return;
    }

    const collected = [];
    let node = zhEl.previousSibling;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList.contains('zh') || node.classList.contains('en')) break;
        if (ZH_BLOCK_TAGS.has(node.tagName)) break;
      }
      const prev = node.previousSibling;
      collected.unshift(node);
      node = prev;
    }
    if (collected.length === 0) return;
    const enSpan = document.createElement('span');
    enSpan.className = 'en';
    collected.forEach(n => enSpan.appendChild(n));
    zhEl.parentNode.insertBefore(enSpan, zhEl);
  });
}

function initZhLanguageSwitch() {
  wrapEnglishBeforeZh(document.body);
  const observer = new MutationObserver(() => wrapEnglishBeforeZh(document.body));
  observer.observe(document.body, { childList: true, subtree: true });
}

function initActionMenus() {
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-action="open-menu"]');

    document.querySelectorAll('.action-menu.open').forEach(menu => {
      if (!menu.contains(event.target)) {
        menu.classList.remove('open');
      }
    });

    if (trigger) {
      const menu = trigger.closest('.action-menu');
      if (menu) {
        menu.classList.toggle('open');
      }
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.action-menu.open').forEach(menu => menu.classList.remove('open'));
    }
  });
}

function applyStoredNavOrder() {
  const nav = document.getElementById('module-nav');
  if (!nav) return;

  let stored = [];
  try { stored = JSON.parse(localStorage.getItem(NAV_ORDER_KEY) || '[]'); }
  catch { stored = []; }
  if (!stored.length) return;

  const buttonsById = new Map(
    [...nav.querySelectorAll('.nav-button')]
      .map(button => [button.dataset.panel, button])
      .filter(([id]) => id));

  const ordered = [];
  stored.forEach(id => {
    const button = buttonsById.get(id);
    if (!button) return;
    ordered.push(button);
    buttonsById.delete(id);
  });

  const remaining = [...buttonsById.values()];
  const settings = remaining.filter(button => button.dataset.panel === 'settings');
  const nonSettings = remaining.filter(button => button.dataset.panel !== 'settings');
  [...ordered, ...nonSettings, ...settings].forEach(button => nav.appendChild(button));
}

function initShellListeners() {
  document.getElementById('module-nav')?.addEventListener('click', event => {
    const button = event.target.closest('.nav-button');
    if (button?.dataset.panel) {
      showPanel(button.dataset.panel);
    }
  });

  document.getElementById('btn-refresh-all')?.addEventListener('click', event =>
    refreshAll(event.currentTarget));

  document.getElementById('btn-clear-result')?.addEventListener('click', clearResult);

  document.getElementById('zh-toggle')?.addEventListener('click', event => {
    const on = document.body.classList.toggle('zh-visible');
    event.currentTarget.classList.toggle('active', on);
    // <option> text can't hold a toggleable <span>, so modules that put
    // Chinese into <select> options re-render on this event.
    document.dispatchEvent(new CustomEvent('crm:zh-toggled', { detail: { on } }));
  });
}

async function initializeApp() {
  initActionMenus();
  initAssociateModal();
  initLiveValidation();
  initZhLanguageSwitch();

  try {
    await loadModules();
    await mountUtilityPanels();
    applyStoredNavOrder();
    initShellListeners();

    const firstPanel = document.querySelector('.nav-button')?.dataset.panel;
    if (firstPanel) {
      showPanel(firstPanel);
    }

    await refreshAll();
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setError(message);
    toast('App startup failed: ' + message, 'error');

    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }
}

initializeApp();
