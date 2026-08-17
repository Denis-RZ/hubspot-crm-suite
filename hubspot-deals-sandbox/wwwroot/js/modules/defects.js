// Manufacturing QA module: defect/inspection records.
// Deliberately self-contained - it does not import forms.js/renders.js
// (those are CRM-record-shaped) to prove a new, unrelated domain can be
// added to the module system with its own small, independent panel.
import { apiFetch, normalizeApiError } from '../api.js';
import { refreshAll } from '../runtime.js';
import { state } from '../state.js';
import { escapeHtml, setError, setLoading, setResult, toast, validateRequired } from '../ui.js';
import { getPage, setPage, resetPage, clampPage, getPageSize, setPageSize, paginate, renderPaginator } from '../pagination.js';

const PAGE_KEY = 'defects';

let crudMode = 'create';
let editingId = null;

// Traditional Chinese (Taiwan) labels for the fixed value sets. Shown next
// to the English value so the panel reads correctly with or without the
// "中文" toggle in the topbar.
const ZH_SEVERITY = { Low: '低', Medium: '中', High: '高', Critical: '嚴重' };
const ZH_STATUS = { Open: '待處理', InReview: '審查中', Resolved: '已解決' };
const ZH_SOURCE = { Manual: '人工', VisionSystem: '視覺系統' };

function withZh(value, map) {
  const zh = map[value];
  return zh ? `${escapeHtml(value)}<span class="zh">${zh}</span>` : escapeHtml(value || '—');
}

// Cross-module reference: a defect can point at a company from the
// Companies module by id. No separate association table like Deals uses -
// just a plain foreign key, resolved against the shared app state.
function companyName(companyId) {
  if (!companyId) return null;
  const company = (state.companies || []).find(c => c.id === companyId);
  return company?.properties?.name || null;
}

function renderCompanyOptions(selectedId) {
  const select = document.getElementById('defect-company');
  if (!select) return;
  const companies = state.companies || [];
  const zhOn = document.body.classList.contains('zh-visible');
  const noneLabel = zhOn ? 'None 無' : 'None';
  select.innerHTML = `<option value="">${noneLabel}</option>` +
    companies.map(c => {
      const name = c.properties?.name || c.id;
      return `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(name)}</option>`;
    }).join('');
}

function severityClass(severity) {
  return {
    Critical: 'pill filter-active',
    High: 'pill filter-active',
    Medium: 'pill',
    Low: 'pill',
  }[severity] || 'pill';
}

function resetForm() {
  crudMode = 'create';
  editingId = null;
  document.getElementById('defect-sku').value = '';
  document.getElementById('defect-station').value = '';
  document.getElementById('defect-type').value = '';
  document.getElementById('defect-severity').value = 'Medium';
  document.getElementById('defect-source').value = 'Manual';
  document.getElementById('defect-reportedby').value = '';
  document.getElementById('defect-notes').value = '';
  renderCompanyOptions('');
  document.getElementById('defect-form-title').innerHTML = 'Log Defect<span class="zh">登錄瑕疵</span>';
  document.getElementById('btn-save-defect').innerHTML = 'Log defect<span class="zh">登錄瑕疵</span>';
  document.getElementById('btn-cancel-defect-edit')?.classList.add('hidden');
}

function fillForm(record) {
  const p = record.properties || {};
  document.getElementById('defect-sku').value = p.sku || '';
  document.getElementById('defect-station').value = p.station || '';
  document.getElementById('defect-type').value = p.defecttype || '';
  document.getElementById('defect-severity').value = p.severity || 'Medium';
  document.getElementById('defect-source').value = p.source || 'Manual';
  document.getElementById('defect-reportedby').value = p.reportedby || '';
  document.getElementById('defect-notes').value = p.notes || '';
  renderCompanyOptions(p.companyid || '');
  document.getElementById('defect-form-title').innerHTML =
    `Editing ${escapeHtml(record.id)}<span class="zh">編輯 ${escapeHtml(record.id)}</span>`;
  document.getElementById('btn-save-defect').innerHTML = 'Save changes<span class="zh">儲存變更</span>';
  document.getElementById('btn-cancel-defect-edit')?.classList.remove('hidden');
}

function renderOptions(selectId, options, selected, zhMap) {
  const select = document.getElementById(selectId);
  if (!select) return;
  // <option> only holds text, so it cannot use the <span class="zh"> CSS
  // toggle other elements use - Chinese is only appended when the topbar
  // toggle is already on, and options are re-rendered when it changes.
  const zhOn = document.body.classList.contains('zh-visible');
  select.innerHTML = options.map(o => {
    const label = o === '' ? 'All' : o;
    const zh = zhOn ? (o === '' ? '全部' : zhMap?.[o]) : null;
    const text = zh ? `${label} ${zh}` : label;
    return `<option value="${escapeHtml(o)}" ${o === selected ? 'selected' : ''}>${escapeHtml(text)}</option>`;
  }).join('');
}

function currentFilters() {
  return {
    query: (document.getElementById('filter-defect-query')?.value || '').toLowerCase(),
    status: document.getElementById('filter-defect-status')?.value || '',
    severity: document.getElementById('filter-defect-severity')?.value || '',
  };
}

function applyFilters(records) {
  const { query, status, severity } = currentFilters();
  return records.filter(record => {
    const p = record.properties || {};
    if (query) {
      const text = [p.sku, p.defecttype, p.station, p.reportedby].filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(query)) return false;
    }
    if (status && p.status !== status) return false;
    if (severity && p.severity !== severity) return false;
    return true;
  });
}

function renderTable() {
  const all = state.defects || [];
  const filtered = applyFilters(all);
  const isFilterActive = !!(currentFilters().query || currentFilters().status || currentFilters().severity);

  const countEl = document.getElementById('defect-count');
  if (countEl) {
    countEl.className = isFilterActive ? 'pill filter-active' : 'pill';
    countEl.innerHTML = isFilterActive
      ? `${filtered.length} filtered<span class="zh">已篩選 ${filtered.length} 筆</span>`
      : `${all.length} defects<span class="zh">共 ${all.length} 筆瑕疵</span>`;
  }

  const page = clampPage(PAGE_KEY, filtered.length);
  const pageSize = getPageSize(PAGE_KEY);
  const pageRecords = paginate(filtered, page, pageSize);

  const body = document.getElementById('defect-table-body');
  if (!body) return;

  if (pageRecords.length === 0) {
    body.innerHTML = `<tr><td colspan="9"><p class="empty-note">${
      isFilterActive
        ? 'No defects match the current filters.<span class="zh">沒有符合篩選條件的瑕疵。</span>'
        : 'No defects logged yet.<br>Use the form on the left to log the first one.<span class="zh">尚無瑕疵紀錄，請使用左側表單登錄第一筆。</span>'
    }</p></td></tr>`;
  } else {
    body.innerHTML = pageRecords.map(record => {
      const p = record.properties || {};
      const detected = p.detectedat ? new Date(p.detectedat).toLocaleString() : '—';
      const linkedCompany = companyName(p.companyid);
      return `
        <tr data-id="${record.id}">
          <td>${escapeHtml(p.sku || '—')}</td>
          <td>${linkedCompany ? escapeHtml(linkedCompany) : '<span class="empty-note" style="margin:0">—</span>'}</td>
          <td>${escapeHtml(p.station || '—')}</td>
          <td>${escapeHtml(p.defecttype || '—')}</td>
          <td><span class="${severityClass(p.severity)}">${withZh(p.severity, ZH_SEVERITY)}</span></td>
          <td><span class="pill">${withZh(p.status || 'Open', ZH_STATUS)}</span></td>
          <td>${withZh(p.source === 'VisionSystem' ? 'VisionSystem' : 'Manual', ZH_SOURCE)}</td>
          <td>${escapeHtml(detected)}</td>
          <td class="actions-cell">
            ${p.status !== 'Resolved' ? `<button class="button button-secondary button-sm" data-action="resolve-defect" data-id="${record.id}">Resolve<span class="zh">已解決</span></button>` : ''}
            <button class="button button-secondary button-sm" data-action="edit-defect" data-id="${record.id}">Edit<span class="zh">編輯</span></button>
            <button class="button button-danger button-sm" data-action="delete-defect" data-id="${record.id}">Delete<span class="zh">刪除</span></button>
          </td>
        </tr>`;
    }).join('');
  }

  renderPaginator('defect-paginator', filtered.length, page, PAGE_KEY);
}

function renderUi() {
  renderOptions('defect-severity', state.defectSeverityOptions?.length ? state.defectSeverityOptions : ['Low', 'Medium', 'High', 'Critical'],
    document.getElementById('defect-severity')?.value || 'Medium', ZH_SEVERITY);
  renderOptions('defect-source', state.defectSourceOptions?.length ? state.defectSourceOptions : ['Manual', 'VisionSystem'],
    document.getElementById('defect-source')?.value || 'Manual', ZH_SOURCE);
  renderOptions('filter-defect-status', ['', ...(state.defectStatusOptions?.length ? state.defectStatusOptions : ['Open', 'InReview', 'Resolved'])],
    document.getElementById('filter-defect-status')?.value || '', ZH_STATUS);
  renderOptions('filter-defect-severity', ['', ...(state.defectSeverityOptions?.length ? state.defectSeverityOptions : ['Low', 'Medium', 'High', 'Critical'])],
    document.getElementById('filter-defect-severity')?.value || '', ZH_SEVERITY);
  renderCompanyOptions(document.getElementById('defect-company')?.value || '');
  renderTable();
}

async function saveDefect(button) {
  const ok = validateRequired([
    { inputId: 'defect-sku', errorId: 'err-defect-sku' },
    { inputId: 'defect-type', errorId: 'err-defect-type' },
  ]);
  if (!ok) return;

  const payload = {
    sku: document.getElementById('defect-sku').value.trim(),
    station: document.getElementById('defect-station').value.trim(),
    defecttype: document.getElementById('defect-type').value.trim(),
    severity: document.getElementById('defect-severity').value,
    source: document.getElementById('defect-source').value,
    reportedby: document.getElementById('defect-reportedby').value.trim(),
    notes: document.getElementById('defect-notes').value.trim(),
    companyid: document.getElementById('defect-company').value,
  };

  const isEdit = crudMode === 'edit';
  const url = isEdit ? `/api/defects/${encodeURIComponent(editingId)}` : '/api/defects';

  setLoading(button, true);
  try {
    const saved = await apiFetch(url, isEdit ? 'PATCH' : 'POST', payload);
    await refreshAll();
    resetForm();
    setResult(saved);
    toast(`Defect ${payload.sku} ${isEdit ? 'updated' : 'logged'}!`, 'success');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast(`Failed to ${isEdit ? 'update' : 'log'} defect`, 'error');
  }
  finally {
    setLoading(button, false);
  }
}

async function resolveDefect(defectId, button) {
  setLoading(button, true);
  try {
    const saved = await apiFetch(`/api/defects/${encodeURIComponent(defectId)}`, 'PATCH', { status: 'Resolved' });
    await refreshAll();
    setResult(saved);
    toast('Defect marked resolved!', 'success');
  }
  catch (error) {
    setError(normalizeApiError(error));
    toast('Failed to update defect', 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function startEdit(defectId) {
  const record = state.defects.find(r => r.id === defectId);
  if (!record) return;
  crudMode = 'edit';
  editingId = defectId;
  fillForm(record);
}

async function deleteDefect(defectId, button) {
  const record = state.defects.find(r => r.id === defectId);
  const label = record?.properties?.sku || defectId;
  if (!confirm(`Delete defect record "${label}"?\n刪除瑕疵紀錄「${label}」？`)) return;

  setLoading(button, true);
  try {
    const result = await apiFetch(`/api/defects/${encodeURIComponent(defectId)}`, 'DELETE');
    await refreshAll();
    setResult(result);
    toast('Defect deleted!', 'success');
  }
  catch (error) {
    setError(normalizeApiError(error));
    toast('Failed to delete defect', 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function clearFilters() {
  document.getElementById('filter-defect-query').value = '';
  document.getElementById('filter-defect-status').value = '';
  document.getElementById('filter-defect-severity').value = '';
  resetPage(PAGE_KEY);
  renderTable();
}

export default {
  id: 'defects',
  label: 'Defects (QA)',
  navOrder: 4,
  renderNav() {
    return `
      <button class="nav-button" data-panel="defects">
        Defects (QA)<span class="zh"> 瑕疵記錄</span> <span class="nav-badge" data-module-badge="defects">...</span>
      </button>`;
  },
  renderPanel() {
    return `
      <section id="panel-defects" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Defects (QA)<span class="zh">瑕疵記錄（品管）</span></h2>
            <p>Manufacturing quality module - a different domain entirely, built on the same module contract as Deals/Contacts/Companies with its own dedicated storage. Optionally links to a Company record, proving modules here can stand alone or reference each other.<span class="zh">製造品管模組——完全不同的領域，採用與 Deals/Contacts/Companies 相同的模組介面，但有自己專屬的資料儲存。可選擇連結到 Company 紀錄，證明模組之間既能獨立運作，也能互相參照。</span></p>
          </div>
          <div class="sub-badge">Self-contained module<span class="zh">獨立模組</span></div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3 id="defect-form-title">Log Defect<span class="zh">登錄瑕疵</span></h3>
            <p>SKU and defect type are required. Source distinguishes a manual inspector entry from an automated vision/OCR detection.<span class="zh">SKU 與瑕疵類型為必填。「偵測來源」用來區分人工檢驗與自動視覺（OCR）偵測。</span></p>
            <div class="form-grid cols-2">
              <div>
                <label for="defect-sku">Product / SKU<span class="zh">產品 / 料號</span> <span class="label-hint">required<span class="zh">必填</span></span></label>
                <input id="defect-sku" type="text" placeholder="PCB-4471">
                <div class="field-error" id="err-defect-sku">SKU is required.<span class="zh">SKU 為必填。</span></div>
              </div>
              <div>
                <label for="defect-station">Station / line<span class="zh">站別 / 產線</span></label>
                <input id="defect-station" type="text" placeholder="Line 2 - AOI">
              </div>
              <div>
                <label for="defect-type">Defect type<span class="zh">瑕疵類型</span> <span class="label-hint">required<span class="zh">必填</span></span></label>
                <input id="defect-type" type="text" placeholder="Solder bridge">
                <div class="field-error" id="err-defect-type">Defect type is required.<span class="zh">瑕疵類型為必填。</span></div>
              </div>
              <div>
                <label for="defect-severity">Severity<span class="zh">嚴重程度</span></label>
                <select id="defect-severity"></select>
              </div>
              <div>
                <label for="defect-source">Detected by<span class="zh">偵測來源</span></label>
                <select id="defect-source"></select>
              </div>
              <div>
                <label for="defect-reportedby">Reported by<span class="zh">回報人</span></label>
                <input id="defect-reportedby" type="text" placeholder="Inspector or camera ID">
              </div>
              <div>
                <label for="defect-company">Company<span class="zh">公司</span></label>
                <select id="defect-company"></select>
                <div class="helper">Optional link to a record from the Companies module.<span class="zh">選填，可連結到 Companies 模組中的公司。</span></div>
              </div>
              <div>
                <label for="defect-notes">Notes<span class="zh">備註</span></label>
                <input id="defect-notes" type="text" placeholder="Optional detail">
              </div>
            </div>
            <div class="actions">
              <button id="btn-save-defect" class="button button-primary">Log defect<span class="zh">登錄瑕疵</span></button>
              <button id="btn-cancel-defect-edit" class="button button-secondary hidden">Cancel edit<span class="zh">取消編輯</span></button>
            </div>
          </article>

          <article class="table-card">
            <div class="table-toolbar">
              <div>
                <h3>Defect Records<span class="zh">瑕疵紀錄</span></h3>
                <p>Vision-system rows simulate an OCR/AOI feed pushing detections in automatically.<span class="zh">「視覺系統」列模擬 OCR/AOI 自動偵測回傳的資料。</span></p>
              </div>
              <span id="defect-count" class="pill">0 defects</span>
            </div>
            <div class="table-filters">
              <input id="filter-defect-query" class="filter-input" type="search" placeholder="Search SKU, type, station...">
              <select id="filter-defect-status" class="filter-select"></select>
              <select id="filter-defect-severity" class="filter-select"></select>
              <button id="btn-clear-defect-filters" class="filter-clear">Clear<span class="zh">清除</span></button>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Company<span class="zh">公司</span></th>
                    <th>Station<span class="zh">站別</span></th>
                    <th>Defect type<span class="zh">瑕疵類型</span></th>
                    <th>Severity<span class="zh">嚴重程度</span></th>
                    <th>Status<span class="zh">狀態</span></th>
                    <th>Detected by<span class="zh">偵測來源</span></th>
                    <th>Detected at<span class="zh">偵測時間</span></th>
                    <th>Actions<span class="zh">操作</span></th>
                  </tr>
                </thead>
                <tbody id="defect-table-body"></tbody>
              </table>
            </div>
            <div id="defect-paginator"></div>
          </article>
        </div>
      </section>`;
  },
  mount(container) {
    container.querySelector('#btn-save-defect')?.addEventListener('click', event =>
      saveDefect(event.currentTarget));
    container.querySelector('#btn-cancel-defect-edit')?.addEventListener('click', resetForm);
    container.querySelector('#filter-defect-query')?.addEventListener('input', () => { resetPage(PAGE_KEY); renderTable(); });
    container.querySelector('#filter-defect-status')?.addEventListener('change', () => { resetPage(PAGE_KEY); renderTable(); });
    container.querySelector('#filter-defect-severity')?.addEventListener('change', () => { resetPage(PAGE_KEY); renderTable(); });
    container.querySelector('#btn-clear-defect-filters')?.addEventListener('click', clearFilters);

    container.querySelector('#defect-table-body')?.addEventListener('click', async event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const { action, id } = button.dataset;
      if (action === 'resolve-defect') await resolveDefect(id, button);
      if (action === 'edit-defect') startEdit(id);
      if (action === 'delete-defect') await deleteDefect(id, button);
    });

    container.addEventListener('click', event => {
      const btn = event.target.closest('button[data-action="goto-page"]');
      if (!btn) return;
      setPage(PAGE_KEY, parseInt(btn.dataset.page, 10));
      renderTable();
    });
    container.addEventListener('change', event => {
      const sel = event.target.closest('select[data-action="change-page-size"]');
      if (!sel) return;
      setPageSize(PAGE_KEY, sel.value);
      resetPage(PAGE_KEY);
      renderTable();
    });

    document.addEventListener('crm:data-refreshed', renderUi);
    document.addEventListener('crm:zh-toggled', renderUi);
    renderUi();
  }
};
