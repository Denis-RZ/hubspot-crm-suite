import { apiFetch, normalizeApiError } from '../api.js';
import {
  buildCompanyPayload,
  clearCompanyForm,
  crudState,
  fillCompanyForm,
  setFormMode,
  syncCrudForms,
} from '../forms.js';
import {
  insertPanelRow,
  renderCompanyFilterOptions,
  renderCompanyIndustryOptions,
  renderCompanyLinksRow,
  renderCompanyRowEdit,
  renderCompanyTable,
} from '../renders.js';
import { refreshAll } from '../runtime.js';
import { state } from '../state.js';
import { setError, setLoading, setResult, showPanel, toast, validateRequired } from '../ui.js';
import { linksPanelAvailable } from '../utility-panels.js';
import { openAssociateModal } from '../associate-modal.js';
import { cancelInlineEdit, cancelAnyOpenEdit } from '../inline-edit.js';
import { getPage, setPage, resetPage, clampPage, getPageSize, setPageSize } from '../pagination.js';

const ASSOCIATION_REFRESH_RETRY_MS = 500;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function associationIds(records) {
  return (records || [])
    .map(record => String(record?.id ?? record?.toObjectId ?? record?.objectId ?? ''))
    .filter(Boolean);
}

function linkedDeals(ids) {
  return ids.map(id =>
    state.deals.find(deal => String(deal.id) === id) ?? { id, _missing: true, properties: {} });
}

async function loadCompanyDealAssociations(companyId) {
  return await apiFetch(`/api/associations/companies/${encodeURIComponent(companyId)}/deals`);
}

function getIndustryOptions() {
  return state.companyIndustryOptions.length
    ? state.companyIndustryOptions
    : undefined;
}

function resetCompanyForm() {
  clearCompanyForm();
  renderCompanyIndustryOptions(getIndustryOptions());
  setFormMode('company', 'create');
}

function renderCompanyUi() {
  syncCrudForms(state);
  renderCompanyIndustryOptions(getIndustryOptions());
  renderCompanyFilterOptions(getIndustryOptions());

  if (crudState.company.mode === 'edit') {
    const editedCompany = state.companies.find(company => company.id === crudState.company.id);
    if (editedCompany) {
      fillCompanyForm(editedCompany);
    }
  }

  renderCompanyTable(state.companies, {
    linksEnabled: linksPanelAvailable(),
    page: clampPage('companies', state.companies.length),
    pageSize: getPageSize('companies'),
  });
}

async function saveCompany(button) {
  const ok = validateRequired([
    { inputId: 'company-name', errorId: 'err-company-name' },
  ]);
  if (!ok) return;

  const payload = buildCompanyPayload();
  const isEdit = crudState.company.mode === 'edit';
  const recordId = crudState.company.id;
  const method = isEdit ? 'PATCH' : 'POST';
  const url = isEdit ? `/api/companies/${encodeURIComponent(recordId)}` : '/api/companies';

  setLoading(button, true);
  try {
    const saved = await apiFetch(url, method, payload);
    await refreshAll();
    resetCompanyForm();
    setResult(saved);
    toast(`Company "${payload.name || recordId || 'Unnamed'}" ${isEdit ? 'updated' : 'created'}!`, 'success');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast(`Failed to ${isEdit ? 'update' : 'create'} company`, 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function startEditCompany(companyId) {
  const company = state.companies.find(record => record.id === companyId);
  if (!company) {
    toast('Company not found in the current list.', 'error');
    return;
  }

  fillCompanyForm(company);
  setFormMode('company', 'edit', company.id);
  showPanel('companies');
}

async function deleteCompany(companyId, button) {
  const company = state.companies.find(record => record.id === companyId);
  const label = company?.properties?.name || companyId;

  if (!confirm(`Delete company "${label}"? This cannot be undone.\n刪除公司「${label}」？此操作無法復原。`)) {
    return;
  }

  setLoading(button, true);
  try {
    const result = await apiFetch(`/api/companies/${encodeURIComponent(companyId)}`, 'DELETE');
    await refreshAll();
    setResult(result);
    toast('Company deleted!', 'success');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Failed to delete company', 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function applyCompanyFilters() {
  const query = document.getElementById('filter-company-name').value.toLowerCase();
  const industry = document.getElementById('filter-company-industry').value;
  const isActive = !!(query || industry);

  const visibleCompanies = isActive
    ? state.companies.filter(company => {
      const text = [company.properties.name, company.properties.domain]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (query && !text.includes(query)) return false;
      if (industry && company.properties.industry !== industry) return false;
      return true;
    })
    : state.companies;

  resetPage('companies');
  renderCompanyTable(visibleCompanies, {
    linksEnabled: linksPanelAvailable(),
    countClass: isActive ? 'pill filter-active' : 'pill',
    countLabel: isActive ? `${visibleCompanies.length} filtered` : `${state.companies.length} companies`,
    emptyMessage: isActive
      ? 'No companies match the current filters.'
      : 'No companies yet.<br>Create the first company using the form on the left.',
    page: 1,
    pageSize: getPageSize('companies'),
  });
}

function clearCompanyFilters() {
  document.getElementById('filter-company-name').value = '';
  document.getElementById('filter-company-industry').value = '';
  applyCompanyFilters();
}

function startInlineEditCompany(companyId) {
  const company = state.companies.find(record => record.id === companyId);
  if (!company) return;

  cancelAnyOpenEdit();
  const row = document.querySelector(`#company-table-body tr[data-id="${companyId}"]`);
  if (row) {
    renderCompanyRowEdit(row, company);
  }
}

async function saveInlineEditCompany(companyId, button) {
  const panelRow = document.querySelector(`tr[data-edit-for="${companyId}"]`);
  if (!panelRow) return;

  const nameInput = panelRow.querySelector('[data-field="name"]');
  if (!nameInput.value.trim()) {
    nameInput.classList.add('invalid');
    nameInput.focus();
    return;
  }

  const payload = { name: nameInput.value.trim() };
  const domain = panelRow.querySelector('[data-field="domain"]')?.value.trim();
  const city = panelRow.querySelector('[data-field="city"]')?.value.trim();
  const industry = panelRow.querySelector('[data-field="industry"]')?.value;

  if (domain) payload.domain = domain;
  if (city) payload.city = city;
  if (industry) payload.industry = industry;

  setLoading(button, true);
  try {
    const saved = await apiFetch(`/api/companies/${encodeURIComponent(companyId)}`, 'PATCH', payload);
    setResult(saved);
    toast('Company updated!', 'success');
    await refreshAll();
  }
  catch (error) {
    setError(normalizeApiError(error));
    toast('Failed to update company', 'error');
    setLoading(button, false);
  }
}

function collapseCompanyLinksPanel(companyId) {
  const panel = document.querySelector(`#company-table-body tr[data-links-for="${companyId}"]`);
  if (!panel) return;
  const parentRow = panel.previousElementSibling;
  panel.remove();
  parentRow?.classList.remove('row-editing-parent', 'row-links-parent');
  const toggle = document.querySelector(`#company-table-body button[data-action="view-company-links"][data-id="${companyId}"]`);
  if (toggle) { toggle.textContent = '▶'; toggle.classList.remove('open'); }
}

async function showCompanyLinks(companyId, options = {}) {
  const { refresh = false } = options;
  const existingPanel = document.querySelector(`#company-table-body tr[data-links-for="${companyId}"]`);
  if (existingPanel && !refresh) { collapseCompanyLinksPanel(companyId); return; }

  const row = document.querySelector(`#company-table-body tr[data-id="${companyId}"]`);
  if (!row) return;
  if (!refresh) {
    cancelAnyOpenEdit();
  }

  const loadingRow = existingPanel
    ?? insertPanelRow(row, 6, '<p class="empty-note" style="margin:0">Loading…</p>', { kind: 'links' });
  if (existingPanel) {
    existingPanel.innerHTML = '<td colspan="6"><div class="edit-panel"><p class="empty-note" style="margin:0">Refreshing...</p></div></td>';
  }
  loadingRow.dataset.linksFor = companyId;

  try {
    let assocs = await loadCompanyDealAssociations(companyId);
    if (refresh && options.expectedDealId &&
      !associationIds(assocs).includes(String(options.expectedDealId))) {
      await delay(ASSOCIATION_REFRESH_RETRY_MS);
      assocs = await loadCompanyDealAssociations(companyId);
    }
    const deals = linkedDeals(associationIds(assocs));

    loadingRow.remove();
    row.classList.remove('row-editing-parent', 'row-links-parent');
    const panelRow = renderCompanyLinksRow(row, deals);
    panelRow.dataset.linksFor = companyId;

    const toggle = row.querySelector('button[data-action="view-company-links"]');
    if (toggle) { toggle.textContent = '▼'; toggle.classList.add('open'); }
  }
  catch {
    loadingRow.querySelector('p').textContent = 'Failed to load links.';
  }
}

function refreshCompanyLinksIfOpen(event) {
  const { objectType, objectId } = event.detail ?? {};
  if (objectType !== 'companies' || !objectId) return;
  if (!document.querySelector(`#company-table-body tr[data-links-for="${objectId}"]`)) return;
  void showCompanyLinks(objectId, {
    refresh: true,
    expectedDealId: event.detail?.dealId,
  });
}

export default {
  id: 'companies',
  label: 'Companies',
  navOrder: 3,
  renderNav() {
    return `
      <button class="nav-button" data-panel="companies">
        Companies<span class="zh">公司</span> <span class="nav-badge" data-module-badge="companies">...</span>
      </button>`;
  },
  renderPanel() {
    return `
      <section id="panel-companies" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Companies<span class="zh">公司</span></h2>
            <p>Companies are organizations. Deals are typically linked to a company
               before they are meaningful in a CRM.<span class="zh">公司代表組織。在 CRM 中，交易通常需要先連結到公司才有意義。</span></p>
          </div>
          <div class="sub-badge">Create organization first<span class="zh">先建立組織</span></div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3 id="company-form-title">Create Company<span class="zh">建立公司</span></h3>
            <p>Company name is the anchor. Domain, city, and industry help when browsing records.<span class="zh">公司名稱是核心欄位。網域、城市與產業則有助於瀏覽資料。</span></p>
            <div class="form-grid cols-2">
              <div>
                <label for="company-name">Company name<span class="zh">公司名稱</span> <span class="label-hint">required<span class="zh">必填</span></span></label>
                <input id="company-name" type="text" placeholder="Northwind Data Systems">
                <div class="field-error" id="err-company-name">Company name is required.</div>
              </div>
              <div>
                <label for="company-domain">Domain<span class="zh">網域</span></label>
                <input id="company-domain" type="text" placeholder="northwind.example">
              </div>
              <div>
                <label for="company-city">City<span class="zh">城市</span></label>
                <input id="company-city" type="text" placeholder="Taoyuan">
              </div>
              <div>
                <label for="company-industry">Industry<span class="zh">產業</span></label>
                <select id="company-industry"></select>
                <div class="helper">This comes from a fixed set of allowed options, so the value is always valid.<span class="zh">選項來自固定清單，因此數值永遠有效。</span></div>
              </div>
            </div>
            <div class="actions">
              <button id="btn-save-company" class="button button-primary">Create company<span class="zh">建立公司</span></button>
              <button id="btn-cancel-company-edit" class="button button-secondary hidden">Cancel edit<span class="zh">取消編輯</span></button>
            </div>
          </article>

          <article class="table-card">
            <div class="table-toolbar">
              <div>
                <h3>Company Records<span class="zh">公司紀錄</span></h3>
                <p>Use ⋯ → <strong>Associate…</strong> to link a company to a deal.<span class="zh">使用 ⋯ → 「建立關聯…」將公司連結到交易。</span></p>
              </div>
              <span id="company-count" class="pill">0 companies</span>
            </div>
            <div class="table-filters">
              <input id="filter-company-name" class="filter-input" type="search" placeholder="Search by name or domain...">
              <select id="filter-company-industry" class="filter-select"><option value="">All industries</option></select>
              <button id="btn-clear-company-filters" class="filter-clear">Clear<span class="zh">清除</span></button>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th class="col-expand"></th><th>Name<span class="zh">名稱</span></th><th>Domain<span class="zh">網域</span></th><th>City<span class="zh">城市</span></th><th>Industry<span class="zh">產業</span></th><th>Actions<span class="zh">操作</span></th></tr>
                </thead>
                <tbody id="company-table-body"></tbody>
              </table>
            </div>
            <div id="company-paginator"></div>
          </article>
        </div>
      </section>`;
  },
  mount(container) {
    container.querySelector('#btn-save-company')?.addEventListener('click', event =>
      saveCompany(event.currentTarget));
    container.querySelector('#btn-cancel-company-edit')?.addEventListener('click', resetCompanyForm);
    container.querySelector('#filter-company-name')?.addEventListener('input', applyCompanyFilters);
    container.querySelector('#filter-company-industry')?.addEventListener('change', applyCompanyFilters);
    container.querySelector('#btn-clear-company-filters')?.addEventListener('click', clearCompanyFilters);
    container.querySelector('#company-table-body')?.addEventListener('click', async event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;

      const { action, id } = button.dataset;
      if (action === 'associate-company') {
        const co = state.companies.find(x => x.id === id);
        openAssociateModal('company', id, co?.properties.name || id);
      }
      if (action === 'view-company-links') await showCompanyLinks(id);
      if (action === 'edit-company') startInlineEditCompany(id);
      if (action === 'delete-company') await deleteCompany(id, button);
      if (action === 'save-company-inline') await saveInlineEditCompany(id, button);
      if (action === 'cancel-inline') cancelInlineEdit(id);
    });

    container.addEventListener('click', event => {
      const btn = event.target.closest('button[data-action="goto-page"]');
      if (!btn) return;
      setPage('companies', parseInt(btn.dataset.page, 10));
      renderCompanyUi();
    });
    container.addEventListener('change', event => {
      const sel = event.target.closest('select[data-action="change-page-size"]');
      if (!sel) return;
      setPageSize('companies', sel.value);
      resetPage('companies');
      renderCompanyUi();
    });

    document.addEventListener('crm:data-refreshed', renderCompanyUi);
    document.addEventListener('crm:association-created', refreshCompanyLinksIfOpen);
    renderCompanyUi();
  }
};
