import { apiFetch, normalizeApiError } from './api.js';
import { state } from './state.js';
import { setError, toast } from './ui.js';

const DISABLED_PLUGINS_KEY = 'crm-disabled-plugins';

export function getDisabledPluginIds() {
  try { return JSON.parse(localStorage.getItem(DISABLED_PLUGINS_KEY) || '[]'); }
  catch { return []; }
}

export async function loadModules() {
  try {
    const [enabledModules, plugins] = await Promise.all([
      apiFetch('/api/modules'),
      apiFetch('/api/admin/plugins').catch(() => []),
    ]);

    state.enabledModules = enabledModules.map(m => m.id);

    const disabledPlugins = getDisabledPluginIds();
    const [builtIn, dynamic] = await Promise.all([
      Promise.all(enabledModules.map(async m => ({
        meta: m,
        descriptor: (await import(`./modules/${m.id}.js`)).default,
        isPlugin: false,
      }))),
      Promise.all(plugins
        .filter(p => !disabledPlugins.includes(p.id))
        .map(async p => ({
          meta: p,
          descriptor: (await import(`./plugin-modules/${p.id}.js?t=${Date.now()}`)).default,
          isPlugin: true,
        }))),
    ]);

    const allModules = [
      ...builtIn,
      ...dynamic,
    ]
      .map(({ meta, descriptor, isPlugin }) => ({
        ...descriptor,
        navOrder: Number(meta.navOrder ?? descriptor.navOrder ?? 0),
        _isPlugin: isPlugin,
      }))
      .sort((a, b) => a.navOrder - b.navOrder);
    state.loadedModules = allModules;

    const navHost   = document.getElementById('module-nav');
    const panelHost = document.getElementById('module-panels');

    navHost.innerHTML   = allModules.map(m => m.renderNav()).join('');
    panelHost.innerHTML = allModules.map(m => m.renderPanel()).join('');
    allModules.forEach(m => m.mount(document.getElementById(`panel-${m.id}`)));
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Failed to load modules: ' + message, 'error');
    throw error;
  }
}
