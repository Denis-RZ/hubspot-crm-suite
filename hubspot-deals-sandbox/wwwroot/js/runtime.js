import { apiFetch, normalizeApiError } from './api.js';
import { state } from './state.js';
import { setError, setLoading, setResult, toast, updateBadges } from './ui.js';

function buildCounts() {
  return Object.fromEntries(
    (state.enabledModules ?? []).map(id => [id, (state[id] ?? []).length])
  );
}

export async function refreshAll(button) {
  setLoading(button, true);

  try {
    const data = await apiFetch('/api/bootstrap');

    state.pipelines = data.pipelines || [];
    state.deals = data.deals || [];
    state.contacts = data.contacts || [];
    state.companies = data.companies || [];
    state.companyIndustryOptions = data.companyIndustryOptions || [];
    state.contactLifecycleOptions = data.contactLifecycleOptions || [];
    state.defects = data.defects || [];
    state.defectSeverityOptions = data.defectSeverityOptions || [];
    state.defectStatusOptions = data.defectStatusOptions || [];
    state.defectSourceOptions = data.defectSourceOptions || [];
    state.visibleDeals = [...state.deals];
    state.searchActive = false;

    updateBadges(state);
    document.dispatchEvent(new CustomEvent('crm:data-refreshed', { detail: data }));

    setResult({
      message: 'Data refreshed.',
      counts: buildCounts(),
    });

    if (button) {
      toast('Data refreshed successfully', 'success');
    }
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Failed to refresh: ' + message, 'error');
    throw error;
  }
  finally {
    setLoading(button, false);

    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }
}
