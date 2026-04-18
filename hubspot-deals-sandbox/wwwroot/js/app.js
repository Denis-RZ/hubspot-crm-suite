import { clearResult, initLiveValidation, setError, showPanel, toast } from './ui.js';
import { loadModules } from './module-registry.js';
import { refreshAll } from './runtime.js';
import { mountUtilityPanels } from './utility-panels.js';

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
}

async function initializeApp() {
  initActionMenus();
  initLiveValidation();

  try {
    await loadModules();
    await mountUtilityPanels();
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
