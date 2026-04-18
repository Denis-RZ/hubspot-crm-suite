import { apiFetch, normalizeApiError } from './api.js';
import { buildCsvRow, CSV_COLUMNS, parseCSV, validateImportRow } from './csv.js';
import {
  renderAssociationPlaceholder,
  renderAssociations,
  renderImportEmptyState,
  renderImportPreview,
  renderLinkSelectors,
} from './renders.js';
import { refreshAll } from './runtime.js';
import { state } from './state.js';
import { readValue, setError, setLoading, setResult, showPanel, toast } from './ui.js';

function getEnabledCsvObjectTypes() {
  return state.enabledModules.filter(moduleId => CSV_COLUMNS[moduleId]);
}

function getObjectLabel(objectType) {
  return objectType.charAt(0).toUpperCase() + objectType.slice(1);
}

function getRecords(objectType) {
  return state[objectType] ?? [];
}

function appendPanel(descriptor) {
  document.getElementById('module-nav').insertAdjacentHTML('beforeend', descriptor.renderNav());
  document.getElementById('module-panels').insertAdjacentHTML('beforeend', descriptor.renderPanel());
  descriptor.mount(document.getElementById(`panel-${descriptor.id}`));
}

function setAssociationDeal(dealId) {
  ['link-deal-contact', 'link-deal-company', 'association-deal'].forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.value = dealId;
    }
  });
}

export function linksPanelAvailable() {
  return state.enabledModules.includes('deals') &&
    (state.enabledModules.includes('contacts') || state.enabledModules.includes('companies'));
}

function importPanelAvailable() {
  return getEnabledCsvObjectTypes().length > 0;
}

export function useDealInLinks(dealId) {
  if (!linksPanelAvailable()) {
    toast('Links panel is not available with the current module set.', 'info');
    return;
  }

  setAssociationDeal(dealId);
  showPanel('links');
  toast(`Deal ${dealId} pre-selected in Links tab`, 'info');
}

export function useContactInLinks(contactId) {
  if (!linksPanelAvailable()) {
    toast('Links panel is not available with the current module set.', 'info');
    return;
  }

  const select = document.getElementById('link-contact');
  if (select) {
    select.value = contactId;
  }

  showPanel('links');
  toast(`Contact ${contactId} pre-selected for linking`, 'info');
}

export function useCompanyInLinks(companyId) {
  if (!linksPanelAvailable()) {
    toast('Links panel is not available with the current module set.', 'info');
    return;
  }

  const select = document.getElementById('link-company');
  if (select) {
    select.value = companyId;
  }

  showPanel('links');
  toast(`Company ${companyId} pre-selected for linking`, 'info');
}

async function associateSelected(objectType, button) {
  const dealId = objectType === 'contacts'
    ? readValue('link-deal-contact')
    : readValue('link-deal-company');
  const objectId = objectType === 'contacts'
    ? readValue('link-contact')
    : readValue('link-company');

  if (!dealId || !objectId) {
    toast('Select both a deal and an object first.', 'error');
    return;
  }

  setLoading(button, true);
  try {
    const result = await apiFetch('/api/associate', 'POST', { dealId, objectType, objectId });
    setAssociationDeal(dealId);
    await loadAssociations(objectType);
    setResult(result);
    toast(`Deal linked to ${objectType.slice(0, -1)} successfully!`, 'success');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Association failed: ' + message, 'error');
  }
  finally {
    setLoading(button, false);
  }
}

async function loadAssociations(objectType, button) {
  const dealId = readValue('association-deal');
  if (!dealId) {
    toast('Select a deal first.', 'error');
    return;
  }

  setLoading(button, true);
  try {
    const result = await apiFetch(`/api/associations/${encodeURIComponent(dealId)}/${encodeURIComponent(objectType)}`);
    renderAssociations(objectType, result);
    setResult(result);
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Could not load associations', 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function renderLinksUi() {
  renderLinkSelectors(state);
  renderAssociationPlaceholder();
}

function buildObjectTypeOptions() {
  return getEnabledCsvObjectTypes()
    .map(objectType => `<option value="${objectType}">${getObjectLabel(objectType)}</option>`)
    .join('');
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

async function downloadCsv(templateOnly, button) {
  const objectType = readValue('export-object-type') || 'deals';
  const columns = CSV_COLUMNS[objectType];

  setLoading(button, true);
  try {
    let csvText;
    if (templateOnly) {
      const exampleRow = columns.map(column => column === 'record_id' ? '' : `example_${column}`);
      csvText = buildCsvRow(columns) + '\n' + buildCsvRow(exampleRow);
    }
    else {
      const records = getRecords(objectType);
      const dataRows = records.map(record =>
        columns.map(column => column === 'record_id' ? record.id : (record.properties[column] || '')));
      csvText = [buildCsvRow(columns), ...dataRows.map(buildCsvRow)].join('\n');
    }

    triggerDownload(`\uFEFF${csvText}`, `${objectType}-${templateOnly ? 'template' : 'export'}.csv`);

    const exportedCount = templateOnly ? 1 : getRecords(objectType).length;
    setResult({
      message: templateOnly ? 'Template downloaded.' : `Exported ${exportedCount} ${objectType}.`,
      columns,
    });
    toast(templateOnly ? 'Template downloaded' : `Exported ${exportedCount} ${objectType}`, 'success');
  }
  catch (error) {
    setError(error.message);
    toast('Download failed', 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function resetImportPreview() {
  state.importPreview = null;

  const applyButton = document.getElementById('btn-apply-import');
  if (applyButton) {
    applyButton.disabled = true;
  }

  renderImportEmptyState();
}

async function previewImport(button) {
  const objectType = readValue('import-object-type') || 'deals';
  const fileInput = document.getElementById('import-file');
  const file = fileInput?.files?.[0];

  if (!file) {
    toast('Choose a CSV file first.', 'error');
    return;
  }

  setLoading(button, true);
  try {
    const text = await file.text();
    const { rows: rawRows } = parseCSV(text);

    if (rawRows.length === 0) {
      renderImportEmptyState('The file has no data rows.');
      toast('File is empty or headers only.', 'info');
      return;
    }

    const validatedRows = rawRows.map((row, index) =>
      validateImportRow(row, objectType, index + 2, state));
    const readyRows = validatedRows.filter(row => row.status === 'Ready').length;
    const errorRows = validatedRows.filter(row => row.status === 'Error').length;
    const skipRows = validatedRows.filter(row => row.status === 'Skip').length;
    const canApply = readyRows > 0 && errorRows === 0;

    const preview = { rows: validatedRows, readyRows, errorRows, skipRows, canApply };
    state.importPreview = preview;
    renderImportPreview(preview);

    const applyButton = document.getElementById('btn-apply-import');
    if (applyButton) {
      applyButton.disabled = !canApply;
    }

    setResult({ readyRows, errorRows, skipRows, canApply }, canApply);
    toast(
      canApply
        ? `${readyRows} rows ready to import`
        : `${errorRows} error(s) - fix CSV and re-preview`,
      canApply ? 'success' : 'info');
  }
  catch (error) {
    state.importPreview = null;

    const applyButton = document.getElementById('btn-apply-import');
    if (applyButton) {
      applyButton.disabled = true;
    }

    setError(error.message);
    renderImportEmptyState('Preview failed. See the API Result panel.');
    toast('Preview failed', 'error');
  }
  finally {
    setLoading(button, false);
  }
}

async function applyImport(button) {
  const preview = state.importPreview;
  if (!preview) {
    toast('Run preview first.', 'error');
    return;
  }

  const objectType = readValue('import-object-type') || 'deals';
  const readyRows = preview.rows.filter(row => row.status === 'Ready');
  if (readyRows.length === 0) {
    toast('No ready rows to import.', 'error');
    return;
  }

  setLoading(button, true);
  let succeeded = 0;
  let failed = 0;
  const results = [];

  for (const row of readyRows) {
    try {
      const { record_id, ...properties } = row.rawRow;
      Object.keys(properties).forEach(key => {
        if (!properties[key]) {
          delete properties[key];
        }
      });

      await apiFetch(`/api/${objectType}`, 'POST', properties);
      succeeded++;
      results.push({ row: row.rowNumber, status: 'Created' });
    }
    catch (error) {
      failed++;
      let message;
      try {
        message = JSON.parse(error.message)?.message || error.message;
      }
      catch {
        message = error.message;
      }

      results.push({ row: row.rowNumber, status: 'Failed', error: message });
    }
  }

  await refreshAll();
  state.importPreview = null;

  const fileInput = document.getElementById('import-file');
  if (fileInput) {
    fileInput.value = '';
  }

  const applyButton = document.getElementById('btn-apply-import');
  if (applyButton) {
    applyButton.disabled = true;
  }

  renderImportEmptyState('Import finished. Upload another CSV to preview the next batch.');
  setResult({ succeeded, failed, results }, failed === 0);
  toast(
    `Import done: ${succeeded} created${failed ? `, ${failed} failed` : ''}`,
    failed === 0 ? 'success' : 'info');
  setLoading(button, false);
}

function createLinksDescriptor() {
  const hasContacts = state.enabledModules.includes('contacts');
  const hasCompanies = state.enabledModules.includes('companies');

  return {
    id: 'links',
    renderNav: () => `
      <button class="nav-button" data-panel="links">
        Links <span class="nav-badge">-</span>
      </button>`,
    renderPanel: () => `
      <section id="panel-links" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Links</h2>
            <p>A link never creates a record - it connects an existing deal to an existing
               contact or company. Every picker is populated from records already in HubSpot.</p>
          </div>
          <div class="sub-badge">No hand-typed IDs</div>
        </div>

        <div class="association-grid">
          ${hasContacts ? `
          <article class="section-card">
            <h3>Link Deal - Contact</h3>
            <p>Select a real deal and a real contact, then create the link.</p>
            <div class="form-grid">
              <div>
                <label for="link-deal-contact">Deal</label>
                <select id="link-deal-contact"></select>
              </div>
              <div>
                <label for="link-contact">Contact</label>
                <select id="link-contact"></select>
              </div>
            </div>
            <div class="actions">
              <button id="btn-link-contact" class="button button-primary">Link to contact</button>
            </div>
          </article>` : ''}

          ${hasCompanies ? `
          <article class="section-card">
            <h3>Link Deal - Company</h3>
            <p>Select a real deal and a real company, then create the link.</p>
            <div class="form-grid">
              <div>
                <label for="link-deal-company">Deal</label>
                <select id="link-deal-company"></select>
              </div>
              <div>
                <label for="link-company">Company</label>
                <select id="link-company"></select>
              </div>
            </div>
            <div class="actions">
              <button id="btn-link-company" class="button button-primary">Link to company</button>
            </div>
          </article>` : ''}
        </div>

        <div class="grid-2" style="margin-top: 18px;">
          <article class="section-card">
            <h3>View Existing Links</h3>
            <p>Pick a deal, then load its linked records.</p>
            <div class="form-grid">
              <div>
                <label for="association-deal">Deal</label>
                <select id="association-deal"></select>
              </div>
            </div>
            <div class="actions">
              ${hasContacts ? '<button id="btn-show-contacts" class="button button-primary">Show linked contacts</button>' : ''}
              ${hasCompanies ? '<button id="btn-show-companies" class="button button-secondary">Show linked companies</button>' : ''}
            </div>
            <div id="association-output" class="association-list">
              <div class="empty-note">Select a deal above and click a button to see its links.</div>
            </div>
          </article>

          <article class="section-card">
            <h3>How associations work</h3>
            <p>In HubSpot, deals don't contain contact or company data - they reference them
               through separate association records. This panel sends a PUT request to create
               the link and a GET to read it back.</p>
            <div class="association-item">
              <strong>Association type IDs</strong>
              HubSpot uses fixed numeric IDs per object pair: deal-contact = 3, deal-company = 5.
            </div>
            <div class="association-item" style="margin-top:10px">
              <strong>Why dropdowns instead of text inputs</strong>
              Associations fail silently if you reference an ID that doesn't exist.
              Dropdowns eliminate that class of error entirely.
            </div>
          </article>
        </div>
      </section>`,
    mount: container => {
      container.querySelector('#btn-link-contact')?.addEventListener('click', event =>
        associateSelected('contacts', event.currentTarget));
      container.querySelector('#btn-link-company')?.addEventListener('click', event =>
        associateSelected('companies', event.currentTarget));
      container.querySelector('#btn-show-contacts')?.addEventListener('click', event =>
        loadAssociations('contacts', event.currentTarget));
      container.querySelector('#btn-show-companies')?.addEventListener('click', event =>
        loadAssociations('companies', event.currentTarget));

      document.addEventListener('crm:data-refreshed', renderLinksUi);
      renderLinksUi();
    }
  };
}

function createImportDescriptor() {
  const objectTypeOptions = buildObjectTypeOptions();

  return {
    id: 'import',
    renderNav: () => `
      <button class="nav-button" data-panel="import">
        Import / Export <span class="nav-badge">CSV</span>
      </button>`,
    renderPanel: () => `
      <section id="panel-import" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Import / Export</h2>
            <p>Use CSV for round-trip data work. Export current records, edit them in a
               spreadsheet flow, preview validation, then apply changes back to HubSpot.</p>
          </div>
          <div class="sub-badge">Preview before write</div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3>Export CSV</h3>
            <p>Exports include <span class="mono">record_id</span>. Keep that column to
               update existing HubSpot records later.</p>
            <div class="form-grid">
              <div>
                <label for="export-object-type">Object type</label>
                <select id="export-object-type">${objectTypeOptions}</select>
              </div>
            </div>
            <div class="actions">
              <button id="btn-export-data" class="button button-primary">Download export</button>
              <button id="btn-download-template" class="button button-secondary">Download template</button>
            </div>
            <div class="helper">
              Professional round-trip pattern: export - edit - preview - apply.
              Template downloads only the approved columns.
            </div>
          </article>

          <article class="section-card">
            <h3>Import CSV</h3>
            <p>Preview validates headers, required fields, HubSpot pipeline/stage values,
               company industry options, email format, dates, and numeric amounts before
               any write runs.</p>
            <div class="form-grid">
              <div>
                <label for="import-object-type">Object type</label>
                <select id="import-object-type">${objectTypeOptions}</select>
              </div>
              <div>
                <label for="import-file">CSV file</label>
                <input id="import-file" type="file" accept=".csv,text/csv">
              </div>
            </div>
            <div class="actions">
              <button id="btn-preview-import" class="button button-primary">Preview import</button>
              <button id="btn-apply-import" class="button button-secondary" disabled>Apply to HubSpot</button>
            </div>
            <div class="helper">
              Blank <span class="mono">record_id</span> means create.
              Existing <span class="mono">record_id</span> means update that HubSpot record.
            </div>
          </article>
        </div>

        <article class="table-card" style="margin-top: 18px;">
          <div class="table-toolbar">
            <div>
              <h3>Import Preview</h3>
              <p>Every row must be valid before the apply button is enabled.</p>
            </div>
            <span id="import-preview-count" class="pill">No preview yet</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Row</th><th>Action</th><th>Record ID</th><th>Status</th><th>Details</th></tr>
              </thead>
              <tbody id="import-preview-body"></tbody>
            </table>
          </div>
        </article>
      </section>`,
    mount: container => {
      container.querySelector('#import-file')?.addEventListener('change', resetImportPreview);
      container.querySelector('#import-object-type')?.addEventListener('change', resetImportPreview);
      container.querySelector('#btn-export-data')?.addEventListener('click', event =>
        downloadCsv(false, event.currentTarget));
      container.querySelector('#btn-download-template')?.addEventListener('click', event =>
        downloadCsv(true, event.currentTarget));
      container.querySelector('#btn-preview-import')?.addEventListener('click', event =>
        previewImport(event.currentTarget));
      container.querySelector('#btn-apply-import')?.addEventListener('click', event =>
        applyImport(event.currentTarget));

      renderImportEmptyState();
    }
  };
}

function refreshOrderButtons(list) {
  const rows = [...list.querySelectorAll('.module-toggle-row')];
  rows.forEach((row, i) => {
    row.querySelector('[data-dir="up"]').disabled   = i === 0;
    row.querySelector('[data-dir="down"]').disabled = i === rows.length - 1;
  });
}

function createSettingsDescriptor(availableModules) {
  return {
    id: 'settings',
    renderNav: () => `
      <button class="nav-button" data-panel="settings">
        Settings
      </button>`,
    renderPanel: () => `
      <section id="panel-settings" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Module Settings</h2>
            <p>Enable or disable modules and drag them into the order you want.
               Changes are saved to <span class="mono">appsettings.json</span>
               and take effect after a server restart.</p>
          </div>
          <div class="sub-badge">Requires restart</div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3>Modules</h3>
            <p>Check to enable. Use ↑ ↓ to set sidebar order.</p>
            <div id="module-order-list" class="module-toggle-list">
              ${availableModules.map((m, i) => `
                <div class="module-toggle-row" data-module-id="${m.id}">
                  <input type="checkbox" class="module-checkbox" value="${m.id}" ${m.enabled ? 'checked' : ''}>
                  <span class="module-toggle-label">${m.label}</span>
                  <div class="module-order-btns">
                    <button class="module-order-btn" data-dir="up"   ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="module-order-btn" data-dir="down" ${i === availableModules.length - 1 ? 'disabled' : ''}>↓</button>
                  </div>
                </div>`).join('')}
            </div>
            <div class="actions" style="margin-top:20px">
              <button id="btn-save-modules" class="button button-primary">Save changes</button>
            </div>
            <div class="helper">After saving, stop and restart the server — then reload the page.</div>
          </article>

          <article class="section-card">
            <h3>How modules work</h3>
            <p>Each module is a self-contained unit: it owns its API endpoints,
               its bootstrap data, and its UI panel. Disabling a module removes
               its routes from the server and its panel from the sidebar.</p>
            <div class="association-item" style="margin-top:12px">
              <strong>Links panel</strong>
              Appears automatically when Deals + at least one of Contacts or Companies is enabled.
            </div>
            <div class="association-item" style="margin-top:10px">
              <strong>Import / Export</strong>
              Appears for every enabled module that has a CSV column definition.
            </div>
          </article>
        </div>
      </section>`,
    mount(container) {
      const list = container.querySelector('#module-order-list');

      list.addEventListener('click', e => {
        const btn = e.target.closest('.module-order-btn');
        if (!btn) return;
        const row  = btn.closest('.module-toggle-row');
        const dir  = btn.dataset.dir;
        const sibling = dir === 'up' ? row.previousElementSibling : row.nextElementSibling;
        if (!sibling) return;
        if (dir === 'up') list.insertBefore(row, sibling);
        else              list.insertBefore(sibling, row);
        refreshOrderButtons(list);
      });

      container.querySelector('#btn-save-modules')?.addEventListener('click', async event => {
        const btn = event.currentTarget;
        const ordered = [...list.querySelectorAll('.module-toggle-row')]
          .filter(row => row.querySelector('.module-checkbox').checked)
          .map(row => row.dataset.moduleId);
        if (!ordered.length) {
          toast('Enable at least one module.', 'error');
          return;
        }
        setLoading(btn, true);
        try {
          await apiFetch('/api/modules', 'POST', ordered);
          toast('Saved. Reloading in 3 seconds…', 'success');
          setTimeout(() => location.reload(), 3000);
        } catch (error) {
          toast('Failed to save: ' + normalizeApiError(error), 'error');
          setLoading(btn, false);
        }
      });
    },
  };
}

export async function mountUtilityPanels() {
  if (linksPanelAvailable()) {
    appendPanel(createLinksDescriptor());
  }

  if (importPanelAvailable()) {
    appendPanel(createImportDescriptor());
  }

  try {
    const availableModules = await apiFetch('/api/modules/available');
    appendPanel(createSettingsDescriptor(availableModules));
  } catch {
    // Settings panel is non-critical — skip silently if the endpoint fails
  }
}
