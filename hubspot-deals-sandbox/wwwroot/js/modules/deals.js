import { apiFetch, normalizeApiError } from '../api.js';
import { fillDealForm, buildDealPayload, clearDealForm, crudState, setFormMode, syncCrudForms } from '../forms.js';
import {
  renderDealFilterOptions,
  renderDealRowEdit,
  renderDealTable,
  renderPipelineSelectors,
  renderStageOptions,
} from '../renders.js';
import { refreshAll } from '../runtime.js';
import { state } from '../state.js';
import { setError, setLoading, setResult, showPanel, toast, validateRequired } from '../ui.js';
import { linksPanelAvailable } from '../utility-panels.js';
import { openAssociateModal } from '../associate-modal.js';
import { cancelInlineEdit, cancelAnyOpenEdit } from '../inline-edit.js';
import { getPage, setPage, resetPage, clampPage, getPageSize, setPageSize } from '../pagination.js';

function resetDealForm() {
  clearDealForm();
  renderPipelineSelectors(state);
  setFormMode('deal', 'create');
}

function renderDealUi() {
  syncCrudForms(state);
  renderDealFilterOptions(state);

  if (crudState.deal.mode === 'edit') {
    const editedDeal = state.deals.find(deal => deal.id === crudState.deal.id);
    if (editedDeal) {
      fillDealForm(editedDeal);
      renderPipelineSelectors(
        state,
        editedDeal.properties.pipeline || '',
        editedDeal.properties.dealstage || '');
    }
    else {
      renderPipelineSelectors(state);
    }
  }
  else {
    renderPipelineSelectors(state);
  }

  renderDealTable(state.visibleDeals, state.searchActive, {
    linksEnabled: linksPanelAvailable(),
    page: clampPage('deals', state.visibleDeals.length),
    pageSize: getPageSize('deals'),
  });
}

async function saveDeal(button) {
  const ok = validateRequired([
    { inputId: 'deal-name', errorId: 'err-deal-name' },
  ]);
  if (!ok) return;

  const payload = buildDealPayload();
  const isEdit = crudState.deal.mode === 'edit';
  const recordId = crudState.deal.id;
  const method = isEdit ? 'PATCH' : 'POST';
  const url = isEdit ? `/api/deals/${encodeURIComponent(recordId)}` : '/api/deals';

  setLoading(button, true);
  try {
    const saved = await apiFetch(url, method, payload);
    await refreshAll();
    resetDealForm();
    setResult(saved);
    toast(`Deal "${payload.dealname || recordId || 'Untitled'}" ${isEdit ? 'updated' : 'created'}!`, 'success');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast(`Failed to ${isEdit ? 'update' : 'create'} deal`, 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function startEditDeal(dealId) {
  const deal = state.deals.find(record => record.id === dealId);
  if (!deal) {
    toast('Deal not found in the current list.', 'error');
    return;
  }

  fillDealForm(deal);
  renderPipelineSelectors(state, deal.properties.pipeline || '', deal.properties.dealstage || '');
  setFormMode('deal', 'edit', deal.id);
  showPanel('deals');
}

async function deleteDeal(dealId, button) {
  const deal = state.deals.find(record => record.id === dealId);
  const label = deal?.properties?.dealname || dealId;

  if (!confirm(`Delete deal "${label}"? This writes to the live HubSpot sandbox.`)) {
    return;
  }

  setLoading(button, true);
  try {
    const result = await apiFetch(`/api/deals/${encodeURIComponent(dealId)}`, 'DELETE');
    await refreshAll();
    setResult(result);
    toast('Deal deleted!', 'success');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Failed to delete deal', 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function applyDealFilters() {
  const name = document.getElementById('filter-deal-name').value.toLowerCase();
  const stage = document.getElementById('filter-deal-stage').value;
  const pipeline = document.getElementById('filter-deal-pipeline').value;
  const isActive = !!(name || stage || pipeline);

  state.visibleDeals = isActive
    ? state.deals.filter(deal => {
      if (name && !(deal.properties.dealname || '').toLowerCase().includes(name)) return false;
      if (stage && deal.properties.dealstage !== stage) return false;
      if (pipeline && deal.properties.pipeline !== pipeline) return false;
      return true;
    })
    : [...state.deals];

  state.searchActive = isActive;
  resetPage('deals');
  renderDealTable(state.visibleDeals, isActive, {
    linksEnabled: linksPanelAvailable(),
    page: 1,
  });
}

function clearDealFilters() {
  document.getElementById('filter-deal-name').value = '';
  document.getElementById('filter-deal-stage').value = '';
  document.getElementById('filter-deal-pipeline').value = '';
  applyDealFilters();
}

function startInlineEditDeal(dealId) {
  const deal = state.deals.find(record => record.id === dealId);
  if (!deal) return;

  cancelAnyOpenEdit();
  const row = document.querySelector(`#deal-table-body tr[data-id="${dealId}"]`);
  if (row) {
    renderDealRowEdit(row, deal, state);
  }
}

async function saveInlineEditDeal(dealId, button) {
  const panelRow = document.querySelector(`tr[data-edit-for="${dealId}"]`);
  if (!panelRow) return;

  const nameInput = panelRow.querySelector('[data-field="dealname"]');
  if (!nameInput.value.trim()) {
    nameInput.classList.add('invalid');
    nameInput.focus();
    return;
  }

  const payload = {};
  const dealName = nameInput.value.trim();
  if (dealName) payload.dealname = dealName;

  const stage = panelRow.querySelector('[data-field="dealstage"]')?.value;
  if (stage) payload.dealstage = stage;

  const amount = panelRow.querySelector('[data-field="amount"]')?.value.trim();
  if (amount) payload.amount = amount;

  const pipeline = panelRow.querySelector('[data-field="pipeline"]')?.value;
  if (pipeline) payload.pipeline = pipeline;

  setLoading(button, true);
  try {
    const saved = await apiFetch(`/api/deals/${encodeURIComponent(dealId)}`, 'PATCH', payload);
    setResult(saved);
    toast('Deal updated!', 'success');
    await refreshAll();
  }
  catch (error) {
    setError(normalizeApiError(error));
    toast('Failed to update deal', 'error');
    setLoading(button, false);
  }
}

export default {
  id: 'deals',
  label: 'Deals',
  navOrder: 1,
  renderNav() {
    return `
      <button class="nav-button" data-panel="deals">
        Deals <span class="nav-badge" data-module-badge="deals">...</span>
      </button>`;
  },
  renderPanel() {
    return `
      <section id="panel-deals" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Deals</h2>
            <p>Create deals with valid pipeline metadata, search by any property,
               then use <strong>Associate…</strong> in the ⋯ menu to link it to a contact or company.</p>
          </div>
          <div class="sub-badge">Stages come from HubSpot</div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3 id="deal-form-title">Create Deal</h3>
            <p id="deal-form-help">The Stage dropdown updates when you change the Pipeline.</p>
            <div class="form-grid cols-2">
              <div>
                <label for="deal-name">Deal name <span class="label-hint">required</span></label>
                <input id="deal-name" type="text" placeholder="AI rack upgrade">
                <div class="field-error" id="err-deal-name">Deal name is required.</div>
              </div>
              <div>
                <label for="deal-amount">Amount</label>
                <input id="deal-amount" type="text" placeholder="25000">
              </div>
              <div>
                <label for="deal-pipeline">Pipeline</label>
                <select id="deal-pipeline" disabled></select>
              </div>
              <div>
                <label for="deal-stage">Stage</label>
                <select id="deal-stage" disabled></select>
              </div>
              <div>
                <label for="deal-close-date">Close date</label>
                <input id="deal-close-date" type="date">
              </div>
            </div>
            <div class="actions">
              <button id="btn-save-deal" class="button button-primary">Create deal</button>
              <button id="btn-cancel-deal-edit" class="button button-secondary hidden">Cancel edit</button>
            </div>
          </article>

          <article class="table-card">
            <div class="table-toolbar">
              <div>
                <h3>Deal Records</h3>
                <p>Use ⋯ → <strong>Associate…</strong> to link a deal to a contact or company.</p>
              </div>
              <span id="deal-count" class="pill">0 deals</span>
            </div>
            <div class="table-filters">
              <input id="filter-deal-name" class="filter-input" type="search" placeholder="Search by name...">
              <select id="filter-deal-stage" class="filter-select"><option value="">All stages</option></select>
              <select id="filter-deal-pipeline" class="filter-select"><option value="">All pipelines</option></select>
              <button id="btn-clear-deal-filters" class="filter-clear">Clear</button>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th><th>Stage</th>
                    <th>Amount</th><th>Pipeline</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody id="deal-table-body"></tbody>
              </table>
            </div>
            <div id="deal-paginator"></div>
          </article>
        </div>
      </section>`;
  },
  mount(container) {
    container.querySelector('#btn-save-deal')?.addEventListener('click', event =>
      saveDeal(event.currentTarget));
    container.querySelector('#btn-cancel-deal-edit')?.addEventListener('click', resetDealForm);
    container.querySelector('#deal-pipeline')?.addEventListener('change', () =>
      renderStageOptions(state));
    container.querySelector('#filter-deal-name')?.addEventListener('input', applyDealFilters);
    container.querySelector('#filter-deal-stage')?.addEventListener('change', applyDealFilters);
    container.querySelector('#filter-deal-pipeline')?.addEventListener('change', applyDealFilters);
    container.querySelector('#btn-clear-deal-filters')?.addEventListener('click', clearDealFilters);
    container.querySelector('#deal-table-body')?.addEventListener('click', async event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;

      const { action, id } = button.dataset;
      if (action === 'clear-deal-filters') clearDealFilters();
      if (action === 'associate-deal') {
        const deal = state.deals.find(d => d.id === id);
        openAssociateModal('deal', id, deal?.properties.dealname || id);
      }
      if (action === 'edit-deal') startInlineEditDeal(id);
      if (action === 'delete-deal') await deleteDeal(id, button);
      if (action === 'save-deal-inline') await saveInlineEditDeal(id, button);
      if (action === 'cancel-inline') cancelInlineEdit(id);
    });

    container.addEventListener('click', event => {
      const btn = event.target.closest('button[data-action="goto-page"]');
      if (!btn) return;
      setPage('deals', parseInt(btn.dataset.page, 10));
      renderDealUi();
    });
    container.addEventListener('change', event => {
      const sel = event.target.closest('select[data-action="change-page-size"]');
      if (!sel) return;
      setPageSize('deals', sel.value);
      resetPage('deals');
      renderDealUi();
    });

    document.addEventListener('crm:data-refreshed', renderDealUi);
    renderDealUi();
  }
};
