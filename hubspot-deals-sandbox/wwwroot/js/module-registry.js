import { apiFetch, normalizeApiError } from './api.js';
import { state } from './state.js';
import { setError, toast } from './ui.js';

export async function loadModules() {
  try {
    const enabledModules = await apiFetch('/api/modules');
    state.enabledModules = enabledModules.map(module => module.id);

    const loadedModules = await Promise.all(enabledModules.map(async module => {
      const importedModule = await import(`./modules/${module.id}.js`);
      return importedModule.default;
    }));

    // Preserve server order — user controls order via Settings panel
    state.loadedModules = loadedModules;

    const navHost = document.getElementById('module-nav');
    const panelHost = document.getElementById('module-panels');

    navHost.innerHTML = state.loadedModules.map(module => module.renderNav()).join('');
    panelHost.innerHTML = state.loadedModules.map(module => module.renderPanel()).join('');

    state.loadedModules.forEach(module => {
      module.mount(document.getElementById(`panel-${module.id}`));
    });
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Failed to load enabled modules: ' + message, 'error');
    throw error;
  }
}
