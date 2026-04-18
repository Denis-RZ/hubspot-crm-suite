// Entry point — wires up all event listeners and drives the bootstrap/refresh cycle.
// Import order shows the dependency tree at a glance.

import { apiFetch, normalizeApiError }                from './api.js';
import { state }                                       from './state.js';
import {
  toast, setLoading, showPanel, updateBadges,
  setResult, setError, clearResult,
  readValue, validateRequired, initLiveValidation,
}                                                      from './ui.js';
import {
  renderPipelineSelectors, renderStageOptions,
  renderCompanyIndustryOptions,
  renderDealFilterOptions, renderContactFilterOptions, renderCompanyFilterOptions,
  renderDealTable, renderContactTable, renderCompanyTable,
  renderDealRowEdit, renderContactRowEdit, renderCompanyRowEdit,
  renderLinkSelectors,
  renderAssociations, renderAssociationPlaceholder,
  renderImportEmptyState, renderImportPreview,
}                                                      from './renders.js';
import {
  crudState, setFormMode, syncCrudForms,
  buildDealPayload, buildContactPayload, buildCompanyPayload,
  fillDealForm, fillContactForm, fillCompanyForm,
  clearDealForm, clearContactForm, clearCompanyForm,
  renderLifecycleOptions,
}                                                      from './forms.js';
import { CSV_COLUMNS, parseCSV, buildCsvRow, validateImportRow } from './csv.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Fetches all data in one request and re-renders the whole UI.
// Called once on page load and again after every write operation.

async function refreshAll(button) {
  setLoading(button, true);
  try {
    const data = await apiFetch('/api/bootstrap');
    state.pipelines  = data.pipelines  || [];
    state.deals      = data.deals      || [];
    state.contacts   = data.contacts   || [];
    state.companies  = data.companies  || [];
    state.visibleDeals  = [...state.deals];
    state.searchActive  = false;

    renderPipelineSelectors(state);
    renderCompanyIndustryOptions();
    renderDealFilterOptions(state);
    renderContactFilterOptions(state);
    renderCompanyFilterOptions();
    renderDealTable(state.visibleDeals, false);
    renderContactTable(state.contacts);
    renderCompanyTable(state.companies);
    renderLinkSelectors(state);
    renderAssociationPlaceholder();
    syncCrudForms(state);
    updateBadges(state);
    if (!state.importPreview) renderImportEmptyState();

    setResult({
      message: 'Data refreshed.',
      counts: { deals: state.deals.length, contacts: state.contacts.length, companies: state.companies.length },
    });
    if (button) toast('Data refreshed successfully', 'success');
  } catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Failed to refresh: ' + message, 'error');
  } finally {
    setLoading(button, false);
    document.getElementById('loading-overlay').style.display = 'none';
  }
}

// ── Shared save/delete helpers ────────────────────────────────────────────────

async function saveEntity(button, entity, baseUrl, payload, displayLabel) {
  const isEdit   = crudState[entity].mode === 'edit';
  const recordId = crudState[entity].id;
  const method   = isEdit ? 'PATCH' : 'POST';
  const url      = isEdit ? `${baseUrl}/${encodeURIComponent(recordId)}` : baseUrl;
  const caption  = entity.charAt(0).toUpperCase() + entity.slice(1);

  setLoading(button, true);
  try {
    const saved = await apiFetch(url, method, payload);
    await refreshAll();
    resetForm(entity);
    setResult(saved);
    toast(`${caption} "${displayLabel}" ${isEdit ? 'updated' : 'created'}!`, 'success');
  } catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast(`Failed to ${isEdit ? 'update' : 'create'} ${entity}`, 'error');
  } finally {
    setLoading(button, false);
  }
}

async function deleteEntity(button, entity, baseUrl, recordId, displayLabel) {
  if (!confirm(`Delete ${entity} "${displayLabel}"? This writes to the live HubSpot sandbox.`)) return;
  setLoading(button, true);
  const caption = entity.charAt(0).toUpperCase() + entity.slice(1);
  try {
    const result = await apiFetch(`${baseUrl}/${encodeURIComponent(recordId)}`, 'DELETE');
    await refreshAll();
    setResult(result);
    toast(`${caption} deleted!`, 'success');
  } catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast(`Failed to delete ${entity}`, 'error');
  } finally {
    setLoading(button, false);
  }
}

// ── Reset form helpers ────────────────────────────────────────────────────────

function resetForm(entity) {
  if (entity === 'deal') {
    clearDealForm();
    renderPipelineSelectors(state);
    setFormMode('deal', 'create');
  } else if (entity === 'contact') {
    clearContactForm();
    setFormMode('contact', 'create');
  } else if (entity === 'company') {
    clearCompanyForm();
    setFormMode('company', 'create');
  }
}

// ── Deal actions ──────────────────────────────────────────────────────────────

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || 'Enter a valid email address.';
}

async function saveDeal(button) {
  const ok = validateRequired([
    { inputId: 'deal-name', errorId: 'err-deal-name' },
  ]);
  if (!ok) return;
  const payload = buildDealPayload();
  await saveEntity(button, 'deal', '/api/deals', payload, payload.dealname || crudState.deal.id || 'Untitled');
}

function startEditDeal(dealId) {
  const deal = state.deals.find(d => d.id === dealId);
  if (!deal) return toast('Deal not found in the current list.', 'error');
  fillDealForm(deal);
  renderPipelineSelectors(state, deal.properties.pipeline || '', deal.properties.dealstage || '');
  setFormMode('deal', 'edit', deal.id);
  showPanel('deals');
}

async function deleteDeal(dealId, button) {
  const deal  = state.deals.find(d => d.id === dealId);
  const label = deal?.properties?.dealname || dealId;
  await deleteEntity(button, 'deal', '/api/deals', dealId, label);
}

// ── Contact actions ───────────────────────────────────────────────────────────

async function saveContact(button) {
  const ok = validateRequired([
    { inputId: 'contact-email', errorId: 'err-contact-email', validator: isValidEmail },
  ]);
  if (!ok) return;
  const payload = buildContactPayload();
  await saveEntity(button, 'contact', '/api/contacts', payload, payload.email || crudState.contact.id || 'Unnamed');
}

function startEditContact(contactId) {
  const contact = state.contacts.find(c => c.id === contactId);
  if (!contact) return toast('Contact not found in the current list.', 'error');
  fillContactForm(contact);
  setFormMode('contact', 'edit', contact.id);
  showPanel('contacts');
}

async function deleteContact(contactId, button) {
  const contact = state.contacts.find(c => c.id === contactId);
  const label   = contact?.properties?.email
    || [contact?.properties?.firstname, contact?.properties?.lastname].filter(Boolean).join(' ')
    || contactId;
  await deleteEntity(button, 'contact', '/api/contacts', contactId, label);
}

// ── Company actions ───────────────────────────────────────────────────────────

async function saveCompany(button) {
  const ok = validateRequired([
    { inputId: 'company-name', errorId: 'err-company-name' },
  ]);
  if (!ok) return;
  const payload = buildCompanyPayload();
  await saveEntity(button, 'company', '/api/companies', payload, payload.name || crudState.company.id || 'Unnamed');
}

function startEditCompany(companyId) {
  const company = state.companies.find(co => co.id === companyId);
  if (!company) return toast('Company not found in the current list.', 'error');
  fillCompanyForm(company);
  setFormMode('company', 'edit', company.id);
  showPanel('companies');
}

async function deleteCompany(companyId, button) {
  const company = state.companies.find(co => co.id === companyId);
  const label   = company?.properties?.name || companyId;
  await deleteEntity(button, 'company', '/api/companies', companyId, label);
}

// ── Links / associations ──────────────────────────────────────────────────────

async function associateSelected(objectType, button) {
  const dealId   = objectType === 'contacts' ? readValue('link-deal-contact') : readValue('link-deal-company');
  const objectId = objectType === 'contacts' ? readValue('link-contact')      : readValue('link-company');
  if (!dealId || !objectId) return toast('Select both a deal and an object first.', 'error');

  setLoading(button, true);
  try {
    const result = await apiFetch('/api/associate', 'POST', { dealId, objectType, objectId });
    setAssociationDeal(dealId);
    await loadAssociations(objectType);
    setResult(result);
    toast(`Deal linked to ${objectType.slice(0, -1)} successfully!`, 'success');
  } catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Association failed: ' + message, 'error');
  } finally {
    setLoading(button, false);
  }
}

async function loadAssociations(objectType, button) {
  const dealId = readValue('association-deal');
  if (!dealId) return toast('Select a deal first.', 'error');

  setLoading(button, true);
  try {
    const result = await apiFetch(`/api/associations/${encodeURIComponent(dealId)}/${encodeURIComponent(objectType)}`);
    renderAssociations(objectType, result);
    setResult(result);
  } catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Could not load associations', 'error');
  } finally {
    setLoading(button, false);
  }
}

function setAssociationDeal(dealId) {
  ['link-deal-contact', 'link-deal-company', 'association-deal'].forEach(id => {
    document.getElementById(id).value = dealId;
  });
}

function useDealInLinks(dealId) {
  setAssociationDeal(dealId);
  showPanel('links');
  toast(`Deal ${dealId} pre-selected in Links tab`, 'info');
}

function useContactInLinks(contactId) {
  document.getElementById('link-contact').value = contactId;
  showPanel('links');
  toast(`Contact ${contactId} pre-selected for linking`, 'info');
}

function useCompanyInLinks(companyId) {
  document.getElementById('link-company').value = companyId;
  showPanel('links');
  toast(`Company ${companyId} pre-selected for linking`, 'info');
}

// ── CSV export ────────────────────────────────────────────────────────────────

async function downloadCsv(templateOnly, button) {
  const objectType = readValue('export-object-type') || 'deals';
  const columns    = CSV_COLUMNS[objectType];
  setLoading(button, true);
  try {
    let csvText;
    if (templateOnly) {
      const exampleRow = columns.map(c => c === 'record_id' ? '' : `example_${c}`);
      csvText = buildCsvRow(columns) + '\n' + buildCsvRow(exampleRow);
    } else {
      const records  = objectType === 'deals' ? state.deals
                     : objectType === 'contacts' ? state.contacts
                     : state.companies;
      const dataRows = records.map(r =>
        columns.map(col => col === 'record_id' ? r.id : (r.properties[col] || '')));
      csvText = [buildCsvRow(columns), ...dataRows.map(buildCsvRow)].join('\n');
    }

    triggerDownload('\uFEFF' + csvText, `${objectType}-${templateOnly ? 'template' : 'export'}.csv`);
    const n = templateOnly ? 1
      : (objectType === 'deals' ? state.deals : objectType === 'contacts' ? state.contacts : state.companies).length;
    setResult({ message: templateOnly ? 'Template downloaded.' : `Exported ${n} ${objectType}.`, columns });
    toast(templateOnly ? 'Template downloaded' : `Exported ${n} ${objectType}`, 'success');
  } catch (error) {
    setError(error.message);
    toast('Download failed', 'error');
  } finally {
    setLoading(button, false);
  }
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── CSV import ────────────────────────────────────────────────────────────────

function resetImportPreview() {
  state.importPreview = null;
  document.getElementById('btn-apply-import').disabled = true;
  renderImportEmptyState();
}

async function previewImport(button) {
  const objectType = readValue('import-object-type') || 'deals';
  const file       = document.getElementById('import-file').files[0];
  if (!file) return toast('Choose a CSV file first.', 'error');

  setLoading(button, true);
  try {
    const text          = await file.text();
    const { rows: rawRows } = parseCSV(text);

    if (rawRows.length === 0) {
      renderImportEmptyState('The file has no data rows.');
      return toast('File is empty or headers only.', 'info');
    }

    const validatedRows = rawRows.map((row, i) => validateImportRow(row, objectType, i + 2, state));
    const readyRows  = validatedRows.filter(r => r.status === 'Ready').length;
    const errorRows  = validatedRows.filter(r => r.status === 'Error').length;
    const skipRows   = validatedRows.filter(r => r.status === 'Skip').length;
    const canApply   = readyRows > 0 && errorRows === 0;

    const preview = { rows: validatedRows, readyRows, errorRows, skipRows, canApply };
    state.importPreview = preview;
    renderImportPreview(preview);
    document.getElementById('btn-apply-import').disabled = !canApply;
    setResult({ readyRows, errorRows, skipRows, canApply }, canApply);
    toast(canApply
      ? `${readyRows} rows ready to import`
      : `${errorRows} error(s) — fix CSV and re-preview`,
      canApply ? 'success' : 'info');
  } catch (error) {
    state.importPreview = null;
    document.getElementById('btn-apply-import').disabled = true;
    setError(error.message);
    renderImportEmptyState('Preview failed. See the API Result panel.');
    toast('Preview failed', 'error');
  } finally {
    setLoading(button, false);
  }
}

async function applyImport(button) {
  const preview    = state.importPreview;
  if (!preview) return toast('Run preview first.', 'error');
  const objectType = readValue('import-object-type') || 'deals';
  const readyRows  = preview.rows.filter(r => r.status === 'Ready');
  if (!readyRows.length) return toast('No ready rows to import.', 'error');

  setLoading(button, true);
  let succeeded = 0, failed = 0;
  const results = [];

  for (const row of readyRows) {
    try {
      const { record_id, ...props } = row.rawRow;
      Object.keys(props).forEach(k => { if (!props[k]) delete props[k]; });
      await apiFetch(`/api/${objectType}`, 'POST', props);
      succeeded++;
      results.push({ row: row.rowNumber, status: 'Created' });
    } catch (error) {
      failed++;
      let msg;
      try { msg = JSON.parse(error.message)?.message || error.message; } catch { msg = error.message; }
      results.push({ row: row.rowNumber, status: 'Failed', error: msg });
    }
  }

  await refreshAll();
  state.importPreview = null;
  document.getElementById('import-file').value = '';
  document.getElementById('btn-apply-import').disabled = true;
  renderImportEmptyState('Import finished. Upload another CSV to preview the next batch.');
  setResult({ succeeded, failed, results }, failed === 0);
  toast(`Import done: ${succeeded} created${failed ? `, ${failed} failed` : ''}`, failed === 0 ? 'success' : 'info');
  setLoading(button, false);
}

// ── Inline row editing ────────────────────────────────────────────────────────
// One row at a time: starting a new edit cancels any open one first.

function cancelInlineEdit(entity, id) {
  const panelRow = document.querySelector(`tr[data-edit-for="${id}"]`);
  if (!panelRow) return;
  const parentRow = panelRow.previousElementSibling;
  panelRow.remove();
  parentRow?.classList.remove('row-editing-parent');
}

function cancelAnyOpenEdit() {
  document.querySelectorAll('tr.row-edit-panel').forEach(panelRow => {
    const parentRow = panelRow.previousElementSibling;
    panelRow.remove();
    parentRow?.classList.remove('row-editing-parent');
  });
}

// ── Deal inline edit ──────────────────────────────────────────────────────────

function startInlineEditDeal(dealId) {
  const deal = state.deals.find(d => d.id === dealId);
  if (!deal) return;
  cancelAnyOpenEdit();
  const row = document.querySelector(`#deal-table-body tr[data-id="${dealId}"]`);
  if (row) renderDealRowEdit(row, deal, state);
}

async function saveInlineEditDeal(dealId, btn) {
  const panelRow = document.querySelector(`tr[data-edit-for="${dealId}"]`);
  if (!panelRow) return;

  const nameInput = panelRow.querySelector('[data-field="dealname"]');
  if (!nameInput.value.trim()) {
    nameInput.classList.add('invalid');
    nameInput.focus();
    return;
  }

  const payload = {};
  const name = nameInput.value.trim();
  if (name) payload.dealname = name;
  const stage = panelRow.querySelector('[data-field="dealstage"]')?.value;
  if (stage) payload.dealstage = stage;
  const amount = panelRow.querySelector('[data-field="amount"]')?.value.trim();
  if (amount) payload.amount = amount;
  const pipeline = panelRow.querySelector('[data-field="pipeline"]')?.value;
  if (pipeline) payload.pipeline = pipeline;

  setLoading(btn, true);
  try {
    const saved = await apiFetch(`/api/deals/${encodeURIComponent(dealId)}`, 'PATCH', payload);
    setResult(saved);
    toast('Deal updated!', 'success');
    await refreshAll();
  } catch (error) {
    setError(normalizeApiError(error));
    toast('Failed to update deal', 'error');
    setLoading(btn, false);
  }
}

// ── Contact inline edit ───────────────────────────────────────────────────────

function startInlineEditContact(contactId) {
  const contact = state.contacts.find(c => c.id === contactId);
  if (!contact) return;
  cancelAnyOpenEdit();
  const row = document.querySelector(`#contact-table-body tr[data-id="${contactId}"]`);
  if (row) renderContactRowEdit(row, contact);
}

async function saveInlineEditContact(contactId, btn) {
  const panelRow = document.querySelector(`tr[data-edit-for="${contactId}"]`);
  if (!panelRow) return;

  const emailInput = panelRow.querySelector('[data-field="email"]');
  const emailVal   = emailInput.value.trim();
  if (!emailVal) {
    emailInput.classList.add('invalid');
    emailInput.focus();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    emailInput.classList.add('invalid');
    emailInput.focus();
    toast('Enter a valid email address.', 'error');
    return;
  }

  const payload = { email: emailVal };
  const firstname = panelRow.querySelector('[data-field="firstname"]')?.value.trim();
  const lastname  = panelRow.querySelector('[data-field="lastname"]')?.value.trim();
  const phone     = panelRow.querySelector('[data-field="phone"]')?.value.trim();
  const lifecycle = panelRow.querySelector('[data-field="lifecyclestage"]')?.value;
  if (firstname) payload.firstname      = firstname;
  if (lastname)  payload.lastname       = lastname;
  if (phone)     payload.phone          = phone;
  if (lifecycle) payload.lifecyclestage = lifecycle;

  setLoading(btn, true);
  try {
    const saved = await apiFetch(`/api/contacts/${encodeURIComponent(contactId)}`, 'PATCH', payload);
    setResult(saved);
    toast('Contact updated!', 'success');
    await refreshAll();
  } catch (error) {
    setError(normalizeApiError(error));
    toast('Failed to update contact', 'error');
    setLoading(btn, false);
  }
}

// ── Company inline edit ───────────────────────────────────────────────────────

function startInlineEditCompany(companyId) {
  const company = state.companies.find(co => co.id === companyId);
  if (!company) return;
  cancelAnyOpenEdit();
  const row = document.querySelector(`#company-table-body tr[data-id="${companyId}"]`);
  if (row) renderCompanyRowEdit(row, company);
}

async function saveInlineEditCompany(companyId, btn) {
  const panelRow = document.querySelector(`tr[data-edit-for="${companyId}"]`);
  if (!panelRow) return;

  const nameInput = panelRow.querySelector('[data-field="name"]');
  if (!nameInput.value.trim()) {
    nameInput.classList.add('invalid');
    nameInput.focus();
    return;
  }

  const payload = { name: nameInput.value.trim() };
  const domain   = panelRow.querySelector('[data-field="domain"]')?.value.trim();
  const city     = panelRow.querySelector('[data-field="city"]')?.value.trim();
  const industry = panelRow.querySelector('[data-field="industry"]')?.value;
  if (domain)   payload.domain   = domain;
  if (city)     payload.city     = city;
  if (industry) payload.industry = industry;

  setLoading(btn, true);
  try {
    const saved = await apiFetch(`/api/companies/${encodeURIComponent(companyId)}`, 'PATCH', payload);
    setResult(saved);
    toast('Company updated!', 'success');
    await refreshAll();
  } catch (error) {
    setError(normalizeApiError(error));
    toast('Failed to update company', 'error');
    setLoading(btn, false);
  }
}

// ── Action dropdown menu ──────────────────────────────────────────────────────
// One document-level handler manages all menus: opens on trigger click,
// closes when clicking outside or pressing Escape.

function initActionMenus() {
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-action="open-menu"]');

    // Close any open menu first
    document.querySelectorAll('.action-menu.open').forEach(m => {
      if (!m.contains(e.target)) m.classList.remove('open');
    });

    // Open the clicked menu
    if (trigger) {
      const menu = trigger.closest('.action-menu');
      if (menu) menu.classList.toggle('open');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
    }
  });
}

// ── Client-side table filters ─────────────────────────────────────────────────
// These filter the data already in state — no API calls.

function applyDealFilters() {
  const name     = document.getElementById('filter-deal-name').value.toLowerCase();
  const stage    = document.getElementById('filter-deal-stage').value;
  const pipeline = document.getElementById('filter-deal-pipeline').value;
  const isActive = !!(name || stage || pipeline);

  state.visibleDeals = isActive
    ? state.deals.filter(d => {
        if (name     && !(d.properties.dealname  || '').toLowerCase().includes(name))  return false;
        if (stage    && d.properties.dealstage !== stage)                               return false;
        if (pipeline && d.properties.pipeline  !== pipeline)                            return false;
        return true;
      })
    : [...state.deals];

  state.searchActive = isActive;
  renderDealTable(state.visibleDeals, isActive);
}

function clearDealFilters() {
  document.getElementById('filter-deal-name').value     = '';
  document.getElementById('filter-deal-stage').value    = '';
  document.getElementById('filter-deal-pipeline').value = '';
  applyDealFilters();
}

function applyContactFilters() {
  const query     = document.getElementById('filter-contact-name').value.toLowerCase();
  const lifecycle = document.getElementById('filter-contact-lifecycle').value;
  const isActive  = !!(query || lifecycle);

  const visible = isActive
    ? state.contacts.filter(c => {
        const name = [c.properties.firstname, c.properties.lastname, c.properties.email]
          .filter(Boolean).join(' ').toLowerCase();
        if (query     && !name.includes(query))                                     return false;
        if (lifecycle && c.properties.lifecyclestage !== lifecycle)                 return false;
        return true;
      })
    : state.contacts;

  renderContactTable(visible);
  document.getElementById('contact-count').textContent =
    isActive ? `${visible.length} filtered` : `${state.contacts.length} contacts`;
}

function clearContactFilters() {
  document.getElementById('filter-contact-name').value      = '';
  document.getElementById('filter-contact-lifecycle').value = '';
  applyContactFilters();
}

function applyCompanyFilters() {
  const query    = document.getElementById('filter-company-name').value.toLowerCase();
  const industry = document.getElementById('filter-company-industry').value;
  const isActive = !!(query || industry);

  const visible = isActive
    ? state.companies.filter(co => {
        const text = [co.properties.name, co.properties.domain].filter(Boolean).join(' ').toLowerCase();
        if (query    && !text.includes(query))                                      return false;
        if (industry && co.properties.industry !== industry)                        return false;
        return true;
      })
    : state.companies;

  renderCompanyTable(visible);
  document.getElementById('company-count').textContent =
    isActive ? `${visible.length} filtered` : `${state.companies.length} companies`;
}

function clearCompanyFilters() {
  document.getElementById('filter-company-name').value     = '';
  document.getElementById('filter-company-industry').value = '';
  applyCompanyFilters();
}

// ── Event listeners ───────────────────────────────────────────────────────────
// Attach all handlers here, in the same place — easy to see every interaction.

function initEventListeners() {
  // Sidebar navigation
  document.querySelector('.sidebar').addEventListener('click', e => {
    const btn = e.target.closest('.nav-button');
    if (btn?.dataset.panel) showPanel(btn.dataset.panel);
  });

  // Workflow steps
  document.querySelector('.workflow').addEventListener('click', e => {
    const step = e.target.closest('.workflow-step');
    if (step?.dataset.step) showPanel(step.dataset.step);
  });

  // Pipeline change → update stage options
  document.getElementById('deal-pipeline').addEventListener('change', () => {
    renderStageOptions(state);
  });

  // Import file / type change → clear old preview
  document.getElementById('import-file').addEventListener('change', resetImportPreview);
  document.getElementById('import-object-type').addEventListener('change', resetImportPreview);

  // Refresh buttons (class-based, used in multiple panels)
  document.querySelectorAll('.js-refresh').forEach(btn => {
    btn.addEventListener('click', () => refreshAll(btn));
  });

  // Result panel
  document.getElementById('btn-refresh-all').addEventListener('click', e => refreshAll(e.currentTarget));
  document.getElementById('btn-clear-result').addEventListener('click', clearResult);

  // Deal form
  document.getElementById('btn-save-deal').addEventListener('click', e => saveDeal(e.currentTarget));
  document.getElementById('btn-cancel-deal-edit').addEventListener('click', () => resetForm('deal'));

  // Contact form
  document.getElementById('btn-save-contact').addEventListener('click', e => saveContact(e.currentTarget));
  document.getElementById('btn-cancel-contact-edit').addEventListener('click', () => resetForm('contact'));

  // Company form
  document.getElementById('btn-save-company').addEventListener('click', e => saveCompany(e.currentTarget));
  document.getElementById('btn-cancel-company-edit').addEventListener('click', () => resetForm('company'));

  // Links tab
  document.getElementById('btn-link-contact').addEventListener('click',  e => associateSelected('contacts',  e.currentTarget));
  document.getElementById('btn-link-company').addEventListener('click',  e => associateSelected('companies', e.currentTarget));
  document.getElementById('btn-show-contacts').addEventListener('click', e => loadAssociations('contacts',   e.currentTarget));
  document.getElementById('btn-show-companies').addEventListener('click', e => loadAssociations('companies', e.currentTarget));

  // Export / import
  document.getElementById('btn-export-data').addEventListener('click',      e => downloadCsv(false, e.currentTarget));
  document.getElementById('btn-download-template').addEventListener('click', e => downloadCsv(true,  e.currentTarget));
  document.getElementById('btn-preview-import').addEventListener('click',   e => previewImport(e.currentTarget));
  document.getElementById('btn-apply-import').addEventListener('click',     e => applyImport(e.currentTarget));

  // Deal quick filters
  document.getElementById('filter-deal-name').addEventListener('input', applyDealFilters);
  document.getElementById('filter-deal-stage').addEventListener('change', applyDealFilters);
  document.getElementById('filter-deal-pipeline').addEventListener('change', applyDealFilters);
  document.getElementById('btn-clear-deal-filters').addEventListener('click', clearDealFilters);

  // Contact quick filters
  document.getElementById('filter-contact-name').addEventListener('input', applyContactFilters);
  document.getElementById('filter-contact-lifecycle').addEventListener('change', applyContactFilters);
  document.getElementById('btn-clear-contact-filters').addEventListener('click', clearContactFilters);

  // Company quick filters
  document.getElementById('filter-company-name').addEventListener('input', applyCompanyFilters);
  document.getElementById('filter-company-industry').addEventListener('change', applyCompanyFilters);
  document.getElementById('btn-clear-company-filters').addEventListener('click', clearCompanyFilters);

  // Table action buttons — one delegated listener per table body
  document.getElementById('deal-table-body').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'clear-deal-filters')  clearDealFilters();
    if (action === 'use-deal-links')      useDealInLinks(id);
    if (action === 'edit-deal')           startInlineEditDeal(id);
    if (action === 'delete-deal')         await deleteDeal(id, btn);
    if (action === 'save-deal-inline')    await saveInlineEditDeal(id, btn);
    if (action === 'cancel-inline')       cancelInlineEdit('deal', id);
  });

  document.getElementById('contact-table-body').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'use-contact-links')   useContactInLinks(id);
    if (action === 'edit-contact')        startInlineEditContact(id);
    if (action === 'delete-contact')      await deleteContact(id, btn);
    if (action === 'save-contact-inline') await saveInlineEditContact(id, btn);
    if (action === 'cancel-inline')       cancelInlineEdit('contact', id);
  });

  document.getElementById('company-table-body').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'use-company-links')   useCompanyInLinks(id);
    if (action === 'edit-company')        startInlineEditCompany(id);
    if (action === 'delete-company')      await deleteCompany(id, btn);
    if (action === 'save-company-inline') await saveInlineEditCompany(id, btn);
    if (action === 'cancel-inline')       cancelInlineEdit('company', id);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

renderLifecycleOptions();
initLiveValidation();
initActionMenus();
initEventListeners();
renderImportEmptyState();
refreshAll();
