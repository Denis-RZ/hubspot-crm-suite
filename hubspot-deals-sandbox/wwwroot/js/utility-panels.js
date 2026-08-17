import { apiFetch, normalizeApiError } from './api.js';
import { openAssociateModal } from './associate-modal.js';
import { getDisabledPluginIds } from './module-registry.js';
import { buildCsvRow, CSV_COLUMNS, parseCSV, validateImportRow } from './csv.js';
import {
  renderImportEmptyState,
  renderImportPreview,
  renderLinkSelectors,
} from './renders.js';
import { refreshAll } from './runtime.js';
import { state } from './state.js';
import { escapeHtml, readValue, setError, setLoading, setResult, showPanel, toast } from './ui.js';

const DISABLED_PLUGINS_KEY  = 'crm-disabled-plugins';
const DISABLED_UTILITY_KEY  = 'crm-disabled-utility';
const UTILITY_ORDER_KEY     = 'crm-utility-order';
const NAV_ORDER_KEY         = 'crm-nav-order';

// Built-in module labels come from the backend as plain English (m.label).
// This maps the known ids to a Chinese label appended as a toggleable span.
const MODULE_LABEL_ZH = {
  deals: '交易',
  contacts: '聯絡人',
  companies: '公司',
  defects: '瑕疵記錄',
  links: '交易關聯',
  import: '匯入／匯出',
  settings: '設定',
};

const OBJECT_TYPE_LABEL_ZH = {
  contacts: '聯絡人',
  companies: '公司',
};

const _descriptorCache = new Map(); // id → utility descriptor
let _lastAssociationEvent = null;
let _bulkLinkPlan = [];

function getDisabledUtilityIds() {
  try { return JSON.parse(localStorage.getItem(DISABLED_UTILITY_KEY) || '[]'); }
  catch { return []; }
}

function getStoredUtilityOrder() {
  try { return JSON.parse(localStorage.getItem(UTILITY_ORDER_KEY) || '{}'); }
  catch { return {}; }
}

function getStoredNavOrder() {
  try {
    const order = JSON.parse(localStorage.getItem(NAV_ORDER_KEY) || '[]');
    return Array.isArray(order) ? order : [];
  }
  catch {
    return [];
  }
}

function getStoredNavOrderValue(id, fallback) {
  const index = getStoredNavOrder().indexOf(id);
  return index >= 0 ? index * 10 : fallback;
}

function buildUtilityRow(desc, enabled) {
  const navOrder = getStoredNavOrderValue(desc.id, desc._navOrder ?? 9500);
  const zhLabel = MODULE_LABEL_ZH[desc.id];
  return `
    <div class="module-toggle-row" data-utility-id="${desc.id}" data-nav-order="${navOrder}">
      <input type="checkbox" class="module-checkbox utility-toggle" value="${desc.id}" ${enabled ? 'checked' : ''}>
      <span class="module-toggle-label">
        ${desc.label ?? desc.id}${zhLabel ? `<span class="zh">${zhLabel}</span>` : ''}
        <span class="utility-badge">Auto<span class="zh">自動</span></span>
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
  const navOrder = getStoredNavOrderValue(p.id, p.navOrder);
  return `
    <div class="module-toggle-row" data-plugin-id="${p.id}" data-nav-order="${navOrder}">
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
  void loadSelectedDealAssociations();
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
    notifyAssociationCreated({ dealId, objectType, objectId });
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

function getSelectedAssociationDealId() {
  return document.getElementById('association-deal')?.value?.trim() || '';
}

function getAssociationOutput(objectType) {
  return document.getElementById(`association-${objectType}-output`);
}

function getAssociationRecordId(record) {
  return String(record?.id ?? record?.toObjectId ?? record?.objectId ?? record?.to?.id ?? '');
}

function getAssociationRows(records) {
  return Array.isArray(records) ? records : records?.results ?? [];
}

function getLocalAssociationRecord(objectType, record) {
  const recordId = getAssociationRecordId(record);
  return getRecords(objectType).find(item => String(item.id) === recordId) ?? null;
}

function associationSingular(objectType) {
  return objectType === 'contacts' ? 'contact' : 'company';
}

function associationSingularLabel(objectType) {
  const singular = associationSingular(objectType);
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

function associationTitle(objectType, record) {
  const local = getLocalAssociationRecord(objectType, record);
  const props = local?.properties ?? record?.properties ?? {};

  if (objectType === 'contacts') {
    return [props.firstname, props.lastname].filter(Boolean).join(' ')
      || props.email
      || getAssociationRecordId(record);
  }

  return props.name || props.domain || getAssociationRecordId(record);
}

function dealTitle(deal) {
  return deal?.properties?.dealname || String(deal?.id || '');
}

function recordTitle(objectType, record) {
  const props = record?.properties ?? {};
  if (objectType === 'contacts') {
    return [props.firstname, props.lastname].filter(Boolean).join(' ')
      || props.email
      || String(record?.id || '');
  }

  return props.name || props.domain || String(record?.id || '');
}

function associationEventDetail({ dealId, dealName, objectType, objectId, objectName }) {
  const deal = state.deals.find(record => String(record.id) === String(dealId));
  const object = getRecords(objectType).find(record => String(record.id) === String(objectId));
  return {
    dealId,
    dealName: dealName || dealTitle(deal) || dealId,
    objectType,
    objectId,
    objectName: objectName || recordTitle(objectType, object) || objectId,
  };
}

function notifyAssociationCreated(detail) {
  document.dispatchEvent(new CustomEvent('crm:association-created', {
    detail: associationEventDetail(detail),
  }));
}

function associationMeta(objectType, record) {
  const local = getLocalAssociationRecord(objectType, record);
  const props = local?.properties ?? record?.properties ?? {};
  const parts = objectType === 'contacts'
    ? [props.email, props.phone]
    : [props.domain, props.city];

  const type = record?.type ?? record?.associationType ?? '';
  return [...parts, type].filter(Boolean).join(' · ') || 'association record';
}

function renderAssociationStatus() {
  const container = document.getElementById('association-status');
  if (!container) return;

  if (!_lastAssociationEvent) {
    container.innerHTML = `
      <strong>What changes when you link?<span class="zh">建立關聯後會發生什麼？</span></strong>
      <div>
        This creates a relationship between one deal and an existing contact or company.
        It does not copy fields, move records, or create duplicates.<span class="zh">這會在一筆交易與現有的聯絡人或公司之間建立關係，不會複製欄位、搬移紀錄，也不會建立重複的紀錄。</span>
      </div>
      <div class="helper" style="margin-top:10px">
        Use <strong>Associate…</strong> in any row menu. After success, this panel selects
        that deal automatically and shows the linked records below.<span class="zh">在任一列的選單中使用「建立關聯…」。成功後，此面板會自動選取該交易並在下方顯示已關聯的紀錄。</span>
      </div>`;
    return;
  }

  const singular = associationSingular(_lastAssociationEvent.objectType);
  const singularZh = OBJECT_TYPE_LABEL_ZH[_lastAssociationEvent.objectType] || singular;
  container.innerHTML = `
    <strong>Last link created<span class="zh">最近建立的關聯</span></strong>
    <div>
      Deal <strong>${escapeHtml(_lastAssociationEvent.dealName || _lastAssociationEvent.dealId)}</strong>
      is now linked to ${singular}
      <strong>${escapeHtml(_lastAssociationEvent.objectName || _lastAssociationEvent.objectId)}</strong>.<span class="zh">交易「${escapeHtml(_lastAssociationEvent.dealName || _lastAssociationEvent.dealId)}」現已連結到${singularZh}「${escapeHtml(_lastAssociationEvent.objectName || _lastAssociationEvent.objectId)}」。</span>
    </div>
    <div class="helper" style="margin-top:10px">
      Impact: this record now appears in the list below and both records are now treated as related.<span class="zh">影響：此紀錄現已出現在下方清單中，兩筆紀錄現在視為相關聯。</span>
    </div>`;
}

function renderAssociationMessage(objectType, message, tone = '') {
  const container = getAssociationOutput(objectType);
  if (!container) return;

  const style = tone === 'error' ? ' style="color:var(--danger)"' : '';
  container.innerHTML = `<div class="empty-note"${style}>${escapeHtml(message)}</div>`;
}

function renderAssociationMessageHtml(objectType, html, tone = '') {
  const container = getAssociationOutput(objectType);
  if (!container) return;

  const style = tone === 'error' ? ' style="color:var(--danger)"' : '';
  container.innerHTML = `<div class="empty-note"${style}>${html}</div>`;
}

function renderAssociationRecords(objectType, records) {
  const container = getAssociationOutput(objectType);
  if (!container) return;

  const rows = getAssociationRows(records);
  if (!rows.length) {
    const singular = associationSingular(objectType);
    const zh = OBJECT_TYPE_LABEL_ZH[objectType] || objectType;
    container.innerHTML = `
      <div class="empty-note">
        No linked ${objectType} yet.<span class="zh">尚未關聯任何${zh}。</span>
        <div class="actions" style="margin-top:10px">
          <button class="button button-secondary" data-associate-empty="${objectType}">
            Associate ${singular}<span class="zh">建立${zh}關聯</span>
          </button>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = rows.map(record => {
    const recordId = getAssociationRecordId(record);
    return `
      <div class="association-item">
        <strong>${escapeHtml(associationTitle(objectType, record))}</strong>
        <div class="mono">${escapeHtml(recordId)}</div>
        <div>${escapeHtml(associationMeta(objectType, record))}</div>
      </div>`;
  }).join('');
}

function getBulkLinkObjectTypes() {
  return ['contacts', 'companies'].filter(objectType =>
    state.enabledModules.includes(objectType) && getRecords(objectType).length > 0);
}

function renderBulkLinkEmptyState(message) {
  const body = document.getElementById('bulk-link-body');
  const count = document.getElementById('bulk-link-count');
  const runButton = document.getElementById('btn-run-auto-links');

  if (count) {
    count.className = 'pill';
    count.innerHTML = 'No preview yet<span class="zh">尚無預覽</span>';
  }

  if (runButton) {
    runButton.disabled = true;
  }

  if (!body) return;
  const html = message
    ? escapeHtml(message)
    : 'Preview scans every deal and shows exactly what would be linked before any write happens.<span class="zh">預覽會掃描每一筆交易，並在寫入前準確顯示將建立哪些關聯。</span>';
  body.innerHTML = `<tr><td colspan="4"><div class="empty-state">
    <div class="icon" style="font-size:22px;font-family:monospace;font-weight:800">↔</div>
    <p>${html}</p>
  </div></td></tr>`;
}

function renderBulkLinkRows(rows) {
  const body = document.getElementById('bulk-link-body');
  const count = document.getElementById('bulk-link-count');
  const runButton = document.getElementById('btn-run-auto-links');
  if (!body || !count) return;

  const ready = rows.filter(row => row.action === 'link').length;
  const created = rows.filter(row => row.status === 'Created').length;
  const failed = rows.filter(row => row.status === 'Failed').length;
  const skipped = rows.filter(row => row.action === 'skip').length;

  count.className = failed ? 'pill filter-active' : created ? 'pill success' : 'pill';
  count.textContent = created
    ? `${created} created / ${failed} failed`
    : `${ready} ready / ${skipped} skipped`;

  if (runButton) {
    runButton.disabled = ready === 0 || rows.some(row => row.status === 'Created');
  }

  body.innerHTML = rows.map(row => `
    <tr>
      <td>
        <strong>${escapeHtml(row.dealName)}</strong>
        <div class="mono">${escapeHtml(row.dealId)}</div>
      </td>
      <td>
        ${escapeHtml(row.objectLabel)}
        ${row.objectName ? `<div>${escapeHtml(row.objectName)}</div>` : ''}
        ${row.objectId ? `<div class="mono">${escapeHtml(row.objectId)}</div>` : ''}
      </td>
      <td>${escapeHtml(row.action === 'link' ? 'Create missing link' : 'Skip')}</td>
      <td>${row.status === 'Failed'
        ? `<span style="color:var(--danger)">${escapeHtml(row.error || row.status)}</span>`
        : escapeHtml(row.status)}</td>
    </tr>`).join('');
}

function renderBulkScanProgress(done, total) {
  const count = document.getElementById('bulk-link-count');
  if (!count) return;
  count.className = 'pill';
  count.textContent = `Scanning ${done}/${total}`;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

async function previewBulkAutoLinks(button) {
  const objectTypes = getBulkLinkObjectTypes();
  if (!state.deals.length) {
    renderBulkLinkEmptyState('No deals available to link.');
    toast('No deals available.', 'error');
    return;
  }

  if (!objectTypes.length) {
    renderBulkLinkEmptyState('Enable Contacts or Companies and load at least one record before auto-linking.');
    toast('No contacts or companies available for auto-linking.', 'error');
    return;
  }

  setLoading(button, true);
  _bulkLinkPlan = [];
  renderBulkLinkEmptyState('Scanning existing associations...');
  const checks = state.deals.flatMap((deal, dealIndex) =>
    objectTypes.map(objectType => ({ deal, dealIndex, objectType })));
  let completed = 0;
  renderBulkScanProgress(completed, checks.length);

  try {
    _bulkLinkPlan = await mapWithConcurrency(checks, 8, async ({ deal, dealIndex, objectType }) => {
      const existing = await apiFetch(`/api/associations/${encodeURIComponent(deal.id)}/${encodeURIComponent(objectType)}`);
      const existingRows = getAssociationRows(existing);
      const objectLabel = associationSingularLabel(objectType);
      completed++;
      renderBulkScanProgress(completed, checks.length);

      if (existingRows.length) {
        return {
          dealId: deal.id,
          dealName: dealTitle(deal),
          objectType,
          objectLabel,
          action: 'skip',
          status: `Already has ${existingRows.length} ${objectType}`,
        };
      }

      const candidates = getRecords(objectType);
      const target = candidates[dealIndex % candidates.length];
      return {
        dealId: deal.id,
        dealName: dealTitle(deal),
        objectType,
        objectLabel,
        objectId: target.id,
        objectName: recordTitle(objectType, target),
        action: 'link',
        status: 'Ready',
      };
    });

    renderBulkLinkRows(_bulkLinkPlan);
    const ready = _bulkLinkPlan.filter(row => row.action === 'link').length;
    const skipped = _bulkLinkPlan.length - ready;
    setResult({
      message: `Auto-link preview ready: ${ready} links can be created, ${skipped} already covered.`,
      strategy: 'Round-robin across existing contacts and companies. Existing associations are skipped.',
      ready,
      skipped,
      plan: _bulkLinkPlan,
    });
    toast(`Preview ready: ${ready} links to create`, ready ? 'success' : 'info');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    renderBulkLinkEmptyState('Preview failed. See the API Result panel for details.');
    toast('Auto-link preview failed', 'error');
  }
  finally {
    setLoading(button, false);
    if (_bulkLinkPlan.length) {
      renderBulkLinkRows(_bulkLinkPlan);
    }
  }
}

async function runBulkAutoLinks(button) {
  const rowsToCreate = _bulkLinkPlan.filter(row => row.action === 'link');
  if (!rowsToCreate.length) {
    toast('Run preview first. No missing links are ready.', 'info');
    return;
  }

  setLoading(button, true);
  try {
    for (const row of rowsToCreate) {
      row.status = 'Creating...';
      renderBulkLinkRows(_bulkLinkPlan);
      try {
        row.result = await apiFetch('/api/associate', 'POST', {
          dealId: row.dealId,
          objectType: row.objectType,
          objectId: row.objectId,
        });
        row.status = 'Created';
        notifyAssociationCreated(row);
      }
      catch (error) {
        row.status = 'Failed';
        row.error = normalizeApiError(error);
      }
    }

    renderBulkLinkRows(_bulkLinkPlan);
    const created = _bulkLinkPlan.filter(row => row.status === 'Created').length;
    const failed = _bulkLinkPlan.filter(row => row.status === 'Failed').length;
    const lastCreated = [..._bulkLinkPlan].reverse().find(row => row.status === 'Created');

    if (lastCreated) {
      _lastAssociationEvent = {
        dealId: lastCreated.dealId,
        dealName: lastCreated.dealName,
        objectType: lastCreated.objectType,
        objectId: lastCreated.objectId,
        objectName: lastCreated.objectName,
      };
      setAssociationDeal(lastCreated.dealId);
      renderAssociationStatus();
      await loadSelectedDealAssociations();
    }

    setResult({
      message: `Auto-link finished: ${created} created, ${failed} failed.`,
      created,
      failed,
      skipped: _bulkLinkPlan.filter(row => row.action === 'skip').length,
      results: _bulkLinkPlan,
    }, failed === 0);
    toast(`Auto-link finished: ${created} created${failed ? `, ${failed} failed` : ''}`,
      failed ? 'info' : 'success');
  }
  finally {
    setLoading(button, false);
  }
}

async function loadAssociations(objectType, button, options = {}) {
  const { quiet = false, updateResult = true } = options;
  const dealId = getSelectedAssociationDealId();
  if (!dealId) {
    const zh = OBJECT_TYPE_LABEL_ZH[objectType] || objectType;
    renderAssociationMessageHtml(objectType, `Select a deal to see linked ${objectType}.<span class="zh">請選擇交易以檢視已關聯的${zh}。</span>`);
    if (!quiet) toast('Select a deal first.', 'error');
    return null;
  }

  setLoading(button, true);
  renderAssociationMessage(objectType, `Loading linked ${objectType}...`);
  try {
    const result = await apiFetch(`/api/associations/${encodeURIComponent(dealId)}/${encodeURIComponent(objectType)}`);
    renderAssociationRecords(objectType, result);
    if (updateResult) setResult({ dealId, [objectType]: result });
    return result;
  }
  catch (error) {
    const message = normalizeApiError(error);
    renderAssociationMessage(objectType, `Could not load ${objectType}: ${message}`, 'error');
    if (!quiet) {
      setError(message);
      toast('Could not load associations', 'error');
    }
    return null;
  }
  finally {
    setLoading(button, false);
  }
}

async function loadSelectedDealAssociations() {
  const objectTypes = ['contacts', 'companies'].filter(objectType =>
    state.enabledModules.includes(objectType));

  const dealId = getSelectedAssociationDealId();
  if (!dealId) {
    objectTypes.forEach(objectType => {
      const zh = OBJECT_TYPE_LABEL_ZH[objectType] || objectType;
      renderAssociationMessageHtml(objectType, `Select a deal to see linked ${objectType}.<span class="zh">請選擇交易以檢視已關聯的${zh}。</span>`);
    });
    return;
  }

  const entries = await Promise.all(objectTypes.map(async objectType => [
    objectType,
    await loadAssociations(objectType, null, { quiet: true, updateResult: false }),
  ]));
  const failures = entries.filter(([, records]) => records === null);

  if (failures.length) {
    setError(`Could not load deal links for ${failures.map(([objectType]) => objectType).join(', ')}.`);
    toast('Could not load all deal links', 'error');
    return;
  }

  setResult({
    dealId,
    ...Object.fromEntries(entries),
  });
}

function openAssociationForSelectedDeal(objectType) {
  const dealId = getSelectedAssociationDealId();
  if (!dealId) {
    toast('Select a deal first.', 'error');
    return;
  }

  const deal = state.deals.find(item => String(item.id) === dealId);
  openAssociateModal('deal', dealId, deal?.properties?.dealname || dealId, objectType);
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
      renderImportEmptyState('The file has no data rows.<span class="zh">檔案沒有資料列。</span>');
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
    renderImportEmptyState('Preview failed. See the API Result panel.<span class="zh">預覽失敗，詳情請見 API 結果面板。</span>');
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

  renderImportEmptyState('Import finished. Upload another CSV to preview the next batch.<span class="zh">匯入完成。上傳另一個 CSV 以預覽下一批資料。</span>');
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
    label: 'Deal Links',
    renderNav: () => `
      <button class="nav-button" data-panel="links">
        Deal Links<span class="zh">交易關聯</span> <span class="nav-badge">↔</span>
      </button>`,
    renderPanel: () => `
      <section id="panel-links" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Deal Links — Associations Inspector<span class="zh">交易關聯 — 關聯檢視工具</span></h2>
            <p>This panel answers one question: which contacts and companies are attached
               to the selected deal? New links are created from any row's
               <strong>Associate…</strong> action.<span class="zh">此面板回答一個問題：哪些聯絡人與公司連結到所選的交易？新的關聯可透過任一列的「建立關聯…」建立。</span></p>
          </div>
          <div class="sub-badge">Shows link impact<span class="zh">顯示關聯結果</span></div>
        </div>

        <article class="section-card">
          <h3>Result of linking<span class="zh">關聯結果</span></h3>
          <div id="association-status" class="association-item"></div>
        </article>

        <article class="section-card" style="margin-top:18px">
          <h3>Current deal<span class="zh">目前交易</span></h3>
          <p>This is auto-selected after a successful <strong>Associate…</strong> action.
             You only change it manually when you want to inspect another deal.<span class="zh">成功執行「建立關聯…」後會自動選取。只有在想檢視其他交易時才需要手動變更。</span></p>
          <div class="form-grid">
            <div>
              <label for="association-deal">Inspect links for<span class="zh">檢視關聯對象</span></label>
              <select id="association-deal"></select>
            </div>
          </div>
        </article>

        <article class="section-card" style="margin-top:18px">
          <h3>Auto-link missing deals<span class="zh">自動關聯未連結的交易</span></h3>
          <p>Bulk mode scans every deal, skips existing links, and proposes one contact
             and one company for deals that are still isolated. Preview first, then write.<span class="zh">批次模式會掃描每一筆交易，略過已有關聯的項目，並為尚未連結的交易各建議一位聯絡人與一間公司。請先預覽再寫入。</span></p>
          <div class="actions">
            <button id="btn-preview-auto-links" class="button button-secondary">
              Preview auto-link plan<span class="zh">預覽自動關聯計畫</span>
            </button>
            <button id="btn-run-auto-links" class="button button-primary" disabled>
              Run auto-link<span class="zh">執行自動關聯</span>
            </button>
          </div>
          <div class="helper">
            Matching strategy: round-robin across current contacts and companies so the
            sandbox data becomes connected without duplicating existing associations.<span class="zh">配對策略：在現有聯絡人與公司之間輪流分配，讓範例資料互相連結，且不會重複建立既有的關聯。</span>
          </div>
        </article>

        <div class="association-grid" style="margin-top:18px">
          ${hasContacts ? `
          <article class="section-card">
            <h3>Linked contacts<span class="zh">已關聯的聯絡人</span></h3>
            <p>People associated with the selected deal.<span class="zh">與所選交易相關聯的人員。</span></p>
            <div id="association-contacts-output" class="association-list">
              <div class="empty-note">Select a deal to see linked contacts.<span class="zh">請選擇交易以檢視已關聯的聯絡人。</span></div>
            </div>
          </article>` : ''}

          ${hasCompanies ? `
          <article class="section-card">
            <h3>Linked companies<span class="zh">已關聯的公司</span></h3>
            <p>Companies associated with the selected deal.<span class="zh">與所選交易相關聯的公司。</span></p>
            <div id="association-companies-output" class="association-list">
              <div class="empty-note">Select a deal to see linked companies.<span class="zh">請選擇交易以檢視已關聯的公司。</span></div>
            </div>
          </article>` : ''}
        </div>

        <article class="table-card" style="margin-top:18px">
          <div class="table-toolbar">
            <div>
              <h3>Auto-link results<span class="zh">自動關聯結果</span></h3>
              <p>Each row shows whether a deal was skipped, planned, created, or failed.<span class="zh">每一列顯示該交易是被略過、已規劃、已建立，還是失敗。</span></p>
            </div>
            <span id="bulk-link-count" class="pill">No preview yet<span class="zh">尚無預覽</span></span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Deal<span class="zh">交易</span></th><th>Target<span class="zh">目標</span></th><th>Action<span class="zh">動作</span></th><th>Status<span class="zh">狀態</span></th></tr>
              </thead>
              <tbody id="bulk-link-body"></tbody>
            </table>
          </div>
        </article>

        <details class="section-card" style="margin-top:18px">
          <summary><strong>Developer note<span class="zh">開發者說明</span></strong></summary>
          <p style="margin-top:12px">
            The store keeps deal-contact and deal-company relationships as separate
            association records, not embedded fields on the deal object.<span class="zh">資料儲存區會將「交易—聯絡人」與「交易—公司」的關係保存為獨立的關聯記錄，而不是內嵌在交易物件中的欄位。</span>
          </p>
          <div class="association-item">
            <strong>API behavior<span class="zh">API 行為</span></strong>
            This app creates links through <span class="mono">POST /api/associate</span>
            and reads them through
            <span class="mono">GET /api/associations/{dealId}/{objectType}</span>.<span class="zh">本應用程式透過 <span class="mono">POST /api/associate</span> 建立關聯，並透過 <span class="mono">GET /api/associations/{dealId}/{objectType}</span> 讀取關聯。</span>
          </div>
        </details>
      </section>`,
    mount: container => {
      container.querySelector('#association-deal')?.addEventListener('change', () =>
        loadSelectedDealAssociations());
      container.addEventListener('click', event => {
        const button = event.target.closest('[data-associate-empty]');
        if (!button || !container.contains(button)) return;
        openAssociationForSelectedDeal(button.dataset.associateEmpty);
      });
      container.querySelector('#btn-preview-auto-links')?.addEventListener('click', event =>
        previewBulkAutoLinks(event.currentTarget));
      container.querySelector('#btn-run-auto-links')?.addEventListener('click', event =>
        runBulkAutoLinks(event.currentTarget));

      document.addEventListener('crm:data-refreshed', () => {
        const selectedDealId = getSelectedAssociationDealId();
        renderLinkSelectors(state);
        if (selectedDealId) setAssociationDeal(selectedDealId);
        if (!container.classList.contains('panel-hidden')) {
          void loadSelectedDealAssociations();
        }
      });
      document.addEventListener('crm:panel-shown', event => {
        if (event.detail?.panel === 'links') {
          renderAssociationStatus();
          void loadSelectedDealAssociations();
        }
      });
      document.addEventListener('crm:association-created', event => {
        _lastAssociationEvent = event.detail ?? null;
        if (_lastAssociationEvent?.dealId) {
          setAssociationDeal(_lastAssociationEvent.dealId);
        }
        renderAssociationStatus();
        if (!container.classList.contains('panel-hidden')) {
          void loadSelectedDealAssociations();
        }
      });

      renderLinkSelectors(state);
      renderAssociationStatus();
      renderBulkLinkEmptyState();
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
        Import / Export<span class="zh">匯入／匯出</span> <span class="nav-badge">CSV</span>
      </button>`,
    renderPanel: () => `
      <section id="panel-import" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Import / Export<span class="zh">匯入／匯出</span></h2>
            <p>Use CSV for round-trip data work. Export current records, edit them in a
               spreadsheet flow, preview validation, then apply changes.<span class="zh">使用 CSV 進行資料匯出入。匯出目前的紀錄、在試算表中編輯、預覽驗證結果，最後套用變更。</span></p>
          </div>
          <div class="sub-badge">Preview before write<span class="zh">寫入前先預覽</span></div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3>Export CSV<span class="zh">匯出 CSV</span></h3>
            <p>Exports include <span class="mono">record_id</span>. Keep that column to
               update existing records later.<span class="zh">匯出檔案包含 <span class="mono">record_id</span>。保留該欄位以便日後更新現有紀錄。</span></p>
            <div class="form-grid">
              <div>
                <label for="export-object-type">Object type<span class="zh">物件類型</span></label>
                <select id="export-object-type">${objectTypeOptions}</select>
              </div>
            </div>
            <div class="actions">
              <button id="btn-export-data" class="button button-primary">Download export<span class="zh">下載匯出檔</span></button>
              <button id="btn-download-template" class="button button-secondary">Download template<span class="zh">下載範本</span></button>
            </div>
            <div class="helper">
              Professional round-trip pattern: export - edit - preview - apply.
              Template downloads only the approved columns.<span class="zh">標準流程：匯出 → 編輯 → 預覽 → 套用。範本只會下載已核准的欄位。</span>
            </div>
          </article>

          <article class="section-card">
            <h3>Import CSV<span class="zh">匯入 CSV</span></h3>
            <p>Preview validates headers, required fields, pipeline/stage values,
               company industry options, email format, dates, and numeric amounts before
               any write runs.<span class="zh">預覽會在寫入前驗證標頭、必填欄位、銷售階段值、公司產業選項、電子郵件格式、日期與數值金額。</span></p>
            <div class="form-grid">
              <div>
                <label for="import-object-type">Object type<span class="zh">物件類型</span></label>
                <select id="import-object-type">${objectTypeOptions}</select>
              </div>
              <div>
                <label for="import-file">CSV file<span class="zh">CSV 檔案</span></label>
                <input id="import-file" type="file" accept=".csv,text/csv">
              </div>
            </div>
            <div class="actions">
              <button id="btn-preview-import" class="button button-primary">Preview import<span class="zh">預覽匯入</span></button>
              <button id="btn-apply-import" class="button button-secondary" disabled>Apply changes<span class="zh">套用變更</span></button>
            </div>
            <div class="helper">
              Blank <span class="mono">record_id</span> means create.
              Existing <span class="mono">record_id</span> means update that record.<span class="zh">留空 <span class="mono">record_id</span> 表示新增；填入現有的 <span class="mono">record_id</span> 表示更新該紀錄。</span>
            </div>
          </article>
        </div>

        <article class="table-card" style="margin-top: 18px;">
          <div class="table-toolbar">
            <div>
              <h3>Import Preview<span class="zh">匯入預覽</span></h3>
              <p>Every row must be valid before the apply button is enabled.<span class="zh">所有列都必須驗證通過，套用按鈕才會啟用。</span></p>
            </div>
            <span id="import-preview-count" class="pill">No preview yet<span class="zh">尚無預覽</span></span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Row<span class="zh">列</span></th><th>Action<span class="zh">動作</span></th><th>Record ID<span class="zh">紀錄 ID</span></th><th>Status<span class="zh">狀態</span></th><th>Details<span class="zh">詳細資訊</span></th></tr>
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
  const storedNavOrder = getStoredNavOrder();

  return {
    id: 'settings',
    renderNav: () => `
      <button class="nav-button" data-panel="settings">
        Settings<span class="zh">設定</span>
      </button>`,
    renderPanel: () => `
      <section id="panel-settings" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Module Settings<span class="zh">模組設定</span></h2>
            <p>Module choices are saved to <span class="mono">App_Data/runtime-settings.json</span>.
               Built-in module changes restart the app automatically. Uploaded plugins are listed
               in the same module list and can be deleted immediately.<span class="zh">模組設定會儲存到 App_Data/runtime-settings.json。變更內建模組會自動重新啟動應用程式。已上傳的外掛會列在同一份清單中，可立即刪除。</span></p>
          </div>
          <div class="sub-badge">Modules + plugins<span class="zh">模組與外掛</span></div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3>Modules<span class="zh">模組</span></h3>
            <p>One list for system modules and uploaded plugins. Plugins stay enabled
               while installed; use Delete to uninstall them.<span class="zh">系統模組與已上傳外掛共用同一份清單。外掛安裝後預設啟用，使用刪除可解除安裝。</span></p>
            <div id="module-order-list" class="module-toggle-list">
              ${availableModules.map((m, i) => {
                const enabledIndex = availableModules
                  .slice(0, i + 1)
                  .filter(module => module.enabled)
                  .length;
                const fallbackOrder = m.enabled ? enabledIndex * 100 : 90_000 + i;
                const storedIndex = storedNavOrder.indexOf(m.id);
                const navOrder = storedIndex >= 0 ? storedIndex * 10 : fallbackOrder;
                const zhLabel = MODULE_LABEL_ZH[m.id];
                return `
                <div class="module-toggle-row" data-module-id="${m.id}" data-nav-order="${navOrder}">
                  <input type="checkbox" class="module-checkbox" value="${m.id}" ${m.enabled ? 'checked' : ''}>
                  <span class="module-toggle-label">${m.label}${zhLabel ? `<span class="zh">${zhLabel}</span>` : ''}</span>
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
              <button id="btn-save-modules" class="button button-primary">Save changes<span class="zh">儲存變更</span></button>
            </div>
            <div class="helper">After saving, the app restarts automatically. If IIS blocks the write, the error will name the folder that needs permission.<span class="zh">儲存後應用程式會自動重新啟動。若 IIS 阻擋寫入，錯誤訊息會指出需要權限的資料夾。</span></div>
          </article>

          <article class="section-card">
            <h3>Install Plugin<span class="zh">安裝外掛</span></h3>
            <p>Upload a <span class="mono">.zip</span> containing a
               <span class="mono">*.plugin.dll</span> and a matching
               <span class="mono">&lt;id&gt;.js</span> frontend module.
               The plugin loads instantly — no server restart required.<span class="zh">上傳包含 *.plugin.dll 與對應 &lt;id&gt;.js 前端模組的 .zip 檔，外掛會立即載入，不需重新啟動伺服器。</span></p>
            <div style="display:flex;gap:12px;align-items:center;margin-top:14px;flex-wrap:wrap">
              <input id="plugin-file-input" type="file" accept=".zip"
                style="flex:1;min-width:0;padding:8px;border:1px solid var(--line);
                       border-radius:10px;font:inherit;font-size:13px">
              <button id="btn-upload-plugin" class="button button-primary">Upload<span class="zh">上傳</span></button>
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

          // Save full nav order as flat ID list so menu matches settings on reload
          const navOrderList = rows
            .map(row => row.dataset.moduleId || row.dataset.pluginId || row.dataset.utilityId)
            .filter(Boolean);
          localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(navOrderList));

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
  const storedNavOrder = getStoredNavOrder();

  function registerUtility(desc, defaultNavOrder) {
    const storedNavIndex = storedNavOrder.indexOf(desc.id);
    desc._navOrder = storedNavIndex >= 0
      ? storedNavIndex * 10
      : storedOrder[desc.id] ?? defaultNavOrder;
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
