import { apiFetch, normalizeApiError } from './api.js';
import { getDisabledPluginIds } from './module-registry.js';
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

const DISABLED_PLUGINS_KEY  = 'crm-disabled-plugins';
const DISABLED_UTILITY_KEY  = 'crm-disabled-utility';
const UTILITY_ORDER_KEY     = 'crm-utility-order';

const _descriptorCache = new Map(); // id → utility descriptor

function getDisabledUtilityIds() {
  try { return JSON.parse(localStorage.getItem(DISABLED_UTILITY_KEY) || '[]'); }
  catch { return []; }
}

function getStoredUtilityOrder() {
  try { return JSON.parse(localStorage.getItem(UTILITY_ORDER_KEY) || '{}'); }
  catch { return {}; }
}

function buildUtilityRow(desc, enabled) {
  const navOrder = desc._navOrder ?? 9500;
  return `
    <div class="module-toggle-row" data-utility-id="${desc.id}" data-nav-order="${navOrder}">
      <input type="checkbox" class="module-checkbox utility-toggle" value="${desc.id}" ${enabled ? 'checked' : ''}>
      <span class="module-toggle-label">
        ${desc.label ?? desc.id}
        <span class="utility-badge">Auto</span>
      </span>
      <div class="module-order-btns">
        <button class="module-order-btn" data-dir="up">↑</button>
        <button class="module-order-btn" data-dir="down">↓</button>
      </div>
    </div>`;
}

function setPluginDisabled(id) {
  const list = getDisabledPluginIds();
  if (!list.includes(id)) {
    localStorage.setItem(DISABLED_PLUGINS_KEY, JSON.stringify([...list, id]));
  }
}

function setPluginEnabled(id) {
  localStorage.setItem(DISABLED_PLUGINS_KEY,
    JSON.stringify(getDisabledPluginIds().filter(d => d !== id)));
}

function buildPluginRow(p, enabled) {
  return `
    <div class="module-toggle-row" data-plugin-id="${p.id}" data-nav-order="${p.navOrder}">
      <input type="checkbox" class="module-checkbox plugin-toggle" value="${p.id}" ${enabled ? 'checked' : ''}>
      <span class="module-toggle-label">
        ${p.label ?? p.id}
        <span class="plugin-badge">Plugin</span>
      </span>
      <div class="module-order-btns">
        <button class="module-order-btn" data-dir="up">↑</button>
        <button class="module-order-btn" data-dir="down">↓</button>
        <button data-unload-id="${p.id}" class="plugin-delete-btn">Delete</button>
      </div>
    </div>`;
}

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
  removePanel(descriptor.id, false);
  document.getElementById('module-nav').insertAdjacentHTML('beforeend', descriptor.renderNav());
  document.getElementById('module-panels').insertAdjacentHTML('beforeend', descriptor.renderPanel());
  descriptor.mount(document.getElementById(`panel-${descriptor.id}`));
  state.loadedModules = [
    ...state.loadedModules.filter(module => module.id !== descriptor.id),
    descriptor,
  ];
}

function removePanel(id, switchIfActive = true) {
  let wasActive = false;
  document.querySelectorAll('#module-nav .nav-button').forEach(button => {
    if (button.dataset.panel === id) {
      wasActive = wasActive || button.classList.contains('active');
      button.remove();
    }
  });

  document.getElementById(`panel-${id}`)?.remove();
  state.loadedModules = state.loadedModules.filter(module => module.id !== id);

  if (wasActive && switchIfActive) {
    const nextPanel = document.querySelector('#module-nav .nav-button')?.dataset.panel;
    if (nextPanel) {
      showPanel(nextPanel);
    }
  }
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
    label: 'Associations',
    renderNav: () => `
      <button class="nav-button" data-panel="links">
        Associations <span class="nav-badge">-</span>
      </button>`,
    renderPanel: () => `
      <section id="panel-links" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Associations</h2>
            <p>Use <strong>Associate…</strong> in any record's ⋯ menu to link a deal to a
               contact or company. This panel lets you inspect existing links.</p>
          </div>
          <div class="sub-badge">No hand-typed IDs</div>
        </div>

        <div class="grid-2">
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
            <p>In HubSpot, deals don't contain contact or company data — they reference them
               through separate association records created via a PUT request.</p>
            <div class="association-item">
              <strong>Association type IDs</strong>
              HubSpot uses fixed numeric IDs per object pair: deal↔contact = 3, deal↔company = 5.
            </div>
            <div class="association-item" style="margin-top:10px">
              <strong>How to create a link</strong>
              Open the ⋯ menu on any Deal, Contact, or Company row and choose
              <em>Associate…</em> to link it without leaving the table.
            </div>
          </article>
        </div>
      </section>`,
    mount: container => {
      container.querySelector('#btn-show-contacts')?.addEventListener('click', event =>
        loadAssociations('contacts', event.currentTarget));
      container.querySelector('#btn-show-companies')?.addEventListener('click', event =>
        loadAssociations('companies', event.currentTarget));

      document.addEventListener('crm:data-refreshed', () => {
        const sel = container.querySelector('#association-deal');
        if (sel) renderAssociationPlaceholder();
        renderLinkSelectors(state);
      });
      renderLinkSelectors(state);
    }
  };
}

function createImportDescriptor() {
  const objectTypeOptions = buildObjectTypeOptions();

  return {
    id: 'import',
    label: 'Import / Export',
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
  const rows = getOrderRows(list);
  rows.forEach((row, i) => {
    row.querySelector('[data-dir="up"]').disabled   = i === 0;
    row.querySelector('[data-dir="down"]').disabled = i === rows.length - 1;
  });
}

function getOrderRows(list) {
  return [...list.querySelectorAll('.module-toggle-row')].filter(child =>
    child.dataset.moduleId || child.dataset.pluginId || child.dataset.utilityId);
}

function getEnabledModuleRows(rows) {
  return rows.filter(row =>
    row.dataset.moduleId &&
    row.querySelector('.module-checkbox')?.checked);
}

function sortOrderRowsByNavOrder(list) {
  const marker = list.querySelector('#plugin-list');
  getOrderRows(list)
    .sort((a, b) => Number(a.dataset.navOrder || 0) - Number(b.dataset.navOrder || 0))
    .forEach(row => list.insertBefore(row, marker));
}

function buildPluginOrderPayload(rows) {
  const visibleRows = rows.filter(row =>
    row.dataset.pluginId ||
    (row.dataset.moduleId && row.querySelector('.module-checkbox')?.checked));
  const pluginOrders = [];
  let moduleIndex = -1;
  let cursor = 0;

  while (cursor < visibleRows.length) {
    const row = visibleRows[cursor];
    if (row.dataset.moduleId) {
      moduleIndex++;
      cursor++;
      continue;
    }

    const pluginRun = [];
    while (cursor < visibleRows.length && visibleRows[cursor].dataset.pluginId) {
      pluginRun.push(visibleRows[cursor]);
      cursor++;
    }

    const previousOrder = moduleIndex >= 0 ? (moduleIndex + 1) * 100 : 0;
    const hasNextModule = cursor < visibleRows.length && visibleRows[cursor].dataset.moduleId;
    const nextOrder = hasNextModule ? (moduleIndex + 2) * 100 : null;
    const step = nextOrder === null
      ? 100
      : (nextOrder - previousOrder) / (pluginRun.length + 1);

    pluginRun.forEach((pluginRow, index) => {
      pluginOrders.push({
        id: pluginRow.dataset.pluginId,
        navOrder: Math.round(previousOrder + step * (index + 1)),
      });
    });
  }

  return pluginOrders;
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
            <p>System modules are saved to <span class="mono">appsettings.json</span>
               and need a restart. Uploaded plugins are listed in the same module list
               and can be deleted immediately.</p>
          </div>
          <div class="sub-badge">Modules + plugins</div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3>Modules</h3>
            <p>One list for system modules and uploaded plugins. Plugins stay enabled
               while installed; use Delete to uninstall them.</p>
            <div id="module-order-list" class="module-toggle-list">
              ${availableModules.map((m, i) => {
                const enabledIndex = availableModules
                  .slice(0, i + 1)
                  .filter(module => module.enabled)
                  .length;
                const navOrder = m.enabled ? enabledIndex * 100 : 90_000 + i;
                return `
                <div class="module-toggle-row" data-module-id="${m.id}" data-nav-order="${navOrder}">
                  <input type="checkbox" class="module-checkbox" value="${m.id}" ${m.enabled ? 'checked' : ''}>
                  <span class="module-toggle-label">${m.label}</span>
                  <div class="module-order-btns">
                    <button class="module-order-btn" data-dir="up"   ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="module-order-btn" data-dir="down" ${i === availableModules.length - 1 ? 'disabled' : ''}>↓</button>
                  </div>
                </div>`;
              }).join('')}
              <div id="plugin-list" style="display:none"></div>
              <div id="utility-panel-list"></div>
            </div>
            <div class="actions" style="margin-top:20px">
              <button id="btn-save-modules" class="button button-primary">Save changes</button>
            </div>
            <div class="helper">After saving, stop and restart the server — then reload the page.</div>
          </article>

          <article class="section-card">
            <h3>Install Plugin</h3>
            <p>Upload a <span class="mono">.zip</span> containing a
               <span class="mono">*.plugin.dll</span> and a matching
               <span class="mono">&lt;id&gt;.js</span> frontend module.
               The plugin loads instantly — no server restart required.</p>
            <div style="display:flex;gap:12px;align-items:center;margin-top:14px;flex-wrap:wrap">
              <input id="plugin-file-input" type="file" accept=".zip"
                style="flex:1;min-width:0;padding:8px;border:1px solid var(--line);
                       border-radius:10px;font:inherit;font-size:13px">
              <button id="btn-upload-plugin" class="button button-primary">Upload</button>
            </div>
            <div id="plugin-upload-result" style="margin-top:10px;font-size:13px"></div>
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
        const rows = getOrderRows(list);
        const index = rows.indexOf(row);
        const sibling = dir === 'up' ? rows[index - 1] : rows[index + 1];
        if (!sibling) return;
        if (dir === 'up') list.insertBefore(row, sibling);
        else              list.insertBefore(sibling, row);
        refreshOrderButtons(list);
      });

      container.querySelector('#btn-save-modules')?.addEventListener('click', async event => {
        const btn = event.currentTarget;
        const rows = getOrderRows(list);
        const ordered = getEnabledModuleRows(rows)
          .map(row => row.dataset.moduleId);
        if (!ordered.length) {
          toast('Enable at least one module.', 'error');
          return;
        }
        setLoading(btn, true);
        try {
          // Persist utility panel order from current list position
          const utilityOrders = {};
          rows.forEach((row, i) => {
            if (row.dataset.utilityId) utilityOrders[row.dataset.utilityId] = i * 10;
          });
          localStorage.setItem(UTILITY_ORDER_KEY, JSON.stringify(utilityOrders));

          await apiFetch('/api/modules', 'POST', {
            modules: ordered,
            plugins: buildPluginOrderPayload(rows),
          });
          toast('Saved. Reloading in 3 seconds…', 'success');
          setTimeout(() => location.reload(), 3000);
        } catch (error) {
          toast('Failed to save: ' + normalizeApiError(error), 'error');
          setLoading(btn, false);
        }
      });

      const pluginResult = container.querySelector('#plugin-upload-result');
      const pluginListEl = container.querySelector('#plugin-list');

      function syncPluginRowsFromState() {
        list.querySelectorAll('.module-toggle-row[data-plugin-id]').forEach(row => row.remove());
        const loaded = state.loadedModules.filter(m => m._isPlugin);
        if (!loaded.length) { refreshOrderButtons(list); return; }
        pluginListEl.insertAdjacentHTML('beforebegin',
          loaded.map(m => buildPluginRow({ id: m.id, label: m.label, navOrder: m.navOrder }, true)).join(''));
        sortOrderRowsByNavOrder(list);
        refreshOrderButtons(list);
      }

      async function renderPluginList() {
        try {
          const plugins = await apiFetch('/api/admin/plugins');
          const disabled = getDisabledPluginIds();
          list.querySelectorAll('.module-toggle-row[data-plugin-id]').forEach(row => row.remove());
          if (!plugins.length) { refreshOrderButtons(list); return; }
          pluginListEl.insertAdjacentHTML('beforebegin',
            plugins.map(p => buildPluginRow(p, !disabled.includes(p.id))).join(''));
          sortOrderRowsByNavOrder(list);
          refreshOrderButtons(list);
        } catch {
          list.querySelectorAll('.module-toggle-row[data-plugin-id]').forEach(row => row.remove());
          refreshOrderButtons(list);
        }
      }

      list.addEventListener('change', async e => {
        const checkbox = e.target.closest('.plugin-toggle');
        if (!checkbox) return;
        const row = checkbox.closest('.module-toggle-row');
        const id = row?.dataset.pluginId;
        if (!id) return;
        if (checkbox.checked) {
          try {
            const mod = (await import(`./plugin-modules/${id}.js?t=${Date.now()}`)).default;
            appendPanel(mod);
            setPluginEnabled(id);
            toast(`Plugin "${mod.label || id}" enabled.`, 'success');
          } catch {
            checkbox.checked = false;
            toast(`Failed to load plugin "${id}".`, 'error');
          }
        } else {
          removePanel(id);
          setPluginDisabled(id);
          toast(`Plugin "${id}" disabled — still installed.`, 'info');
        }
      });

      list.addEventListener('click', async e => {
        const btn = e.target.closest('[data-unload-id]');
        if (!btn) return;
        const id = btn.dataset.unloadId;
        btn.disabled = true;
        try {
          await apiFetch(`/api/admin/plugins/${encodeURIComponent(id)}`, 'DELETE');
          removePanel(id);
          pluginResult.textContent = `Plugin "${id}" deleted.`;
          pluginResult.style.color = 'var(--success, green)';
          toast(`Plugin "${id}" deleted.`, 'success');
          await renderPluginList();
        } catch (error) {
          toast('Delete failed: ' + normalizeApiError(error), 'error');
          btn.disabled = false;
        }
      });

      container.querySelector('#btn-upload-plugin')?.addEventListener('click', async event => {
        const btn = event.currentTarget;
        const fileInput = container.querySelector('#plugin-file-input');
        const file = fileInput?.files?.[0];
        if (!file) {
          pluginResult.textContent = 'Choose a .zip file first.';
          pluginResult.style.color = 'var(--danger)';
          return;
        }
        const formData = new FormData();
        formData.append('file', file);
        setLoading(btn, true);
        pluginResult.textContent = 'Uploading…';
        pluginResult.style.color = '';
        try {
          const res = await fetch('/api/admin/plugins/upload', { method: 'POST', body: formData });
          if (!res.ok) throw new Error(await res.text());
          const { id } = await res.json();
          pluginResult.textContent = `Plugin "${id}" installed. Reloading UI…`;
          pluginResult.style.color = 'var(--success, green)';
          fileInput.value = '';
          await renderPluginList();
          // Dynamic import of the new module JS and mount it
          try {
            const mod = (await import(`./plugin-modules/${id}.js?t=${Date.now()}`)).default;
            appendPanel(mod);
            showPanel(id);
            toast(`Plugin "${id}" loaded — panel added.`, 'success');
          } catch {
            toast(`Plugin "${id}" installed. Reload the page to activate it.`, 'info');
          }
        } catch (error) {
          pluginResult.textContent = 'Upload failed: ' + normalizeApiError(error);
          pluginResult.style.color = 'var(--danger)';
          toast('Upload failed: ' + normalizeApiError(error), 'error');
        } finally {
          setLoading(btn, false);
        }
      });

      function renderUtilityPanelList() {
        const host = container.querySelector('#utility-panel-list');
        if (!host || !_descriptorCache.size) return;
        const disabled = getDisabledUtilityIds();
        host.innerHTML = [..._descriptorCache.values()]
          .map(desc => buildUtilityRow(desc, !disabled.includes(desc.id))).join('');
        sortOrderRowsByNavOrder(list);
        refreshOrderButtons(list);
      }

      list.addEventListener('change', async e => {
        const checkbox = e.target.closest('.utility-toggle');
        if (!checkbox) return;
        const row = checkbox.closest('.module-toggle-row');
        const id = row?.dataset.utilityId;
        if (!id) return;
        const desc = _descriptorCache.get(id);
        if (!desc) return;
        const disabled = getDisabledUtilityIds();
        if (checkbox.checked) {
          appendPanel(desc);
          localStorage.setItem(DISABLED_UTILITY_KEY,
            JSON.stringify(disabled.filter(d => d !== id)));
          toast(`"${desc.label || id}" enabled.`, 'success');
        } else {
          removePanel(id);
          if (!disabled.includes(id)) {
            localStorage.setItem(DISABLED_UTILITY_KEY, JSON.stringify([...disabled, id]));
          }
          toast(`"${desc.label || id}" disabled.`, 'info');
        }
      });

      syncPluginRowsFromState();
      renderPluginList();
      renderUtilityPanelList();
    },
  };
}

export async function mountUtilityPanels() {
  const disabledUtility = getDisabledUtilityIds();
  const storedOrder = getStoredUtilityOrder();

  function registerUtility(desc, defaultNavOrder) {
    desc._navOrder = storedOrder[desc.id] ?? defaultNavOrder;
    _descriptorCache.set(desc.id, desc);
    if (!disabledUtility.includes(desc.id)) appendPanel(desc);
  }

  if (linksPanelAvailable()) {
    registerUtility(createLinksDescriptor(), 9500);
  }

  if (importPanelAvailable()) {
    registerUtility(createImportDescriptor(), 9600);
  }

  try {
    const availableModules = await apiFetch('/api/modules/available');
    appendPanel(createSettingsDescriptor(availableModules));
  } catch {
    // Settings panel is non-critical — skip silently if the endpoint fails
  }
}
