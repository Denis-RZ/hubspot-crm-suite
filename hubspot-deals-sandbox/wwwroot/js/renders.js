// All DOM rendering — tables, dropdowns, associations, import preview.
// Pure "data in, DOM out": no API calls, no state mutations.

import { escapeHtml } from './ui.js';
import { INDUSTRY_OPTIONS } from './csv.js';
import { LIFECYCLE_STAGES } from './forms.js';

// ── Action dropdown menu builder ──────────────────────────────────────────────
// Produces a single "⋯" button that opens a contextual menu per row.
// Actions: [{ label, action }, { divider: true }, { label, action, danger }]

function actionMenu(id, actions) {
  const items = actions.map(a => {
    if (a.divider) return '<div class="action-divider"></div>';
    const danger = a.danger ? ' action-item-danger' : '';
    return `<button class="action-item${danger}" data-action="${a.action}" data-id="${escapeHtml(id)}">${a.label}</button>`;
  }).join('');

  return `
    <div class="action-menu">
      <button class="action-trigger" data-action="open-menu" title="Actions">⋯</button>
      <div class="action-dropdown">${items}</div>
    </div>`;
}

// ── Stage pill ────────────────────────────────────────────────────────────────
// Maps HubSpot stage/lifecycle IDs to a color class.

const STAGE_WON   = new Set(['closedwon', 'customer', 'closed won']);
const STAGE_LOST  = new Set(['closedlost', 'closed lost']);
const STAGE_LEAD  = new Set(['lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'subscriber']);
const STAGE_ACTIVE = new Set([
  'appointmentscheduled', 'qualifiedtobuy', 'presentationscheduled',
  'decisionmakerboughtin', 'contractsent', 'opportunity',
]);

function stagePill(value) {
  if (!value || value === '—') return '<span class="mono" style="color:var(--muted)">—</span>';
  const key = value.toLowerCase().replace(/\s/g, '');
  let cls = '';
  if (STAGE_WON.has(key))    cls = 'won';
  if (STAGE_LOST.has(key))   cls = 'lost';
  if (STAGE_ACTIVE.has(key)) cls = 'active';
  if (STAGE_LEAD.has(key))   cls = 'lead';
  return `<span class="stage-pill ${cls}">${escapeHtml(value)}</span>`;
}

// ── Pipeline / stage dropdowns (in the Create Deal form) ─────────────────────

export function renderPipelineSelectors(state, selectedPipeline = '', selectedStage = '') {
  const pipelineSel = document.getElementById('deal-pipeline');
  pipelineSel.innerHTML = '';

  state.pipelines.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.label} (${p.id})`;
    pipelineSel.appendChild(opt);
  });

  const target = selectedPipeline || pipelineSel.value || 'default';
  const match  = state.pipelines.find(p => p.id === target)
               || state.pipelines.find(p => p.id === 'default');
  if (match) pipelineSel.value = match.id;
  pipelineSel.disabled = state.pipelines.length === 0;

  renderStageOptions(state, selectedStage);
}

export function renderStageOptions(state, selectedStage = '') {
  const pipelineId = document.getElementById('deal-pipeline').value;
  const stageSel   = document.getElementById('deal-stage');
  const pipeline   = state.pipelines.find(p => p.id === pipelineId);
  const stages     = pipeline?.stages || [];

  stageSel.innerHTML = '';
  stages.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.label} (${s.id})`;
    stageSel.appendChild(opt);
  });

  if (selectedStage && stages.some(s => s.id === selectedStage)) stageSel.value = selectedStage;
  stageSel.disabled = stages.length === 0;
}

export function renderCompanyIndustryOptions() {
  const select = document.getElementById('company-industry');
  select.innerHTML = '<option value="">Not set</option>';
  INDUSTRY_OPTIONS.forEach(({ value, label }) => {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = label;
    select.appendChild(el);
  });
}

// ── Filter selects (quick-filter bar above each table) ────────────────────────
// Populated from the data already in state after a refresh.

export function renderDealFilterOptions(state) {
  const stages    = [...new Set(state.deals.map(d => d.properties.dealstage).filter(Boolean))].sort();
  const pipelines = [...new Set(state.deals.map(d => d.properties.pipeline).filter(Boolean))].sort();

  fillFilterSelect('filter-deal-stage',    stages,    v => v, v => v);
  fillFilterSelect('filter-deal-pipeline', pipelines, v => v, v => v);
}

export function renderContactFilterOptions(state) {
  const stages = [...new Set(state.contacts.map(c => c.properties.lifecyclestage).filter(Boolean))].sort();
  fillFilterSelect('filter-contact-lifecycle', stages, v => v, v => v);
}

export function renderCompanyFilterOptions() {
  const options = INDUSTRY_OPTIONS.map(o => ({ value: o.value, label: o.label }));
  fillFilterSelect('filter-company-industry', options, o => o.value, o => o.label);
}

function fillFilterSelect(id, items, getValue, getLabel) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.value;
  el.innerHTML = '<option value="">All</option>';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value       = getValue(item);
    opt.textContent = getLabel(item);
    el.appendChild(opt);
  });
  if (current) el.value = current;
}

// ── Deal table ────────────────────────────────────────────────────────────────

export function renderDealTable(records, searchActive) {
  const body    = document.getElementById('deal-table-body');
  const countEl = document.getElementById('deal-count');

  countEl.className   = searchActive ? 'pill filter-active' : 'pill';
  countEl.textContent = searchActive ? `${records.length} filtered` : `${records.length} deals`;

  if (records.length === 0) {
    body.innerHTML = `<tr><td colspan="5">
      <div class="empty-state">
        <div class="icon">📋</div>
        <p>${searchActive
          ? 'No deals match the current filters.'
          : 'No deals yet.<br>Create your first deal using the form on the left.'}</p>
        ${searchActive ? '<button class="button button-secondary" data-action="clear-deal-filters">Clear filters</button>' : ''}
      </div>
    </td></tr>`;
    return;
  }

  body.innerHTML = '';
  records.forEach(deal => {
    const row = document.createElement('tr');
    row.dataset.id = deal.id;
    row.innerHTML = `
      <td><strong>${escapeHtml(deal.properties.dealname || '—')}</strong></td>
      <td>${stagePill(deal.properties.dealstage || '')}</td>
      <td>${deal.properties.amount ? escapeHtml(deal.properties.amount) : '<span style="color:var(--muted)">—</span>'}</td>
      <td>${escapeHtml(deal.properties.pipeline || '—')}</td>
      <td style="text-align:right">
        ${actionMenu(deal.id, [
          { label: 'Use in Links', action: 'use-deal-links' },
          { label: 'Edit',         action: 'edit-deal' },
          { divider: true },
          { label: 'Delete',       action: 'delete-deal', danger: true },
        ])}
      </td>`;
    body.appendChild(row);
  });
}

// ── Contact table ─────────────────────────────────────────────────────────────

export function renderContactTable(records) {
  const body = document.getElementById('contact-table-body');
  document.getElementById('contact-count').textContent = `${records.length} contacts`;

  if (records.length === 0) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state">
      <div class="icon">👤</div>
      <p>No contacts yet.<br>Create the first contact using the form on the left.</p>
    </div></td></tr>`;
    return;
  }

  body.innerHTML = '';
  records.forEach(c => {
    const name = [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || '—';
    const row  = document.createElement('tr');
    row.dataset.id = c.id;
    row.innerHTML = `
      <td><strong>${escapeHtml(name)}</strong></td>
      <td>${escapeHtml(c.properties.email || '—')}</td>
      <td>${escapeHtml(c.properties.phone || '—')}</td>
      <td>${stagePill(c.properties.lifecyclestage || '')}</td>
      <td style="text-align:right">
        ${actionMenu(c.id, [
          { label: 'Use in Links', action: 'use-contact-links' },
          { label: 'Edit',         action: 'edit-contact' },
          { divider: true },
          { label: 'Delete',       action: 'delete-contact', danger: true },
        ])}
      </td>`;
    body.appendChild(row);
  });
}

// ── Company table ─────────────────────────────────────────────────────────────

export function renderCompanyTable(records) {
  const body = document.getElementById('company-table-body');
  document.getElementById('company-count').textContent = `${records.length} companies`;

  if (records.length === 0) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state">
      <div class="icon">🏢</div>
      <p>No companies yet.<br>Create the first company using the form on the left.</p>
    </div></td></tr>`;
    return;
  }

  body.innerHTML = '';
  records.forEach(co => {
    const row = document.createElement('tr');
    row.dataset.id = co.id;
    row.innerHTML = `
      <td><strong>${escapeHtml(co.properties.name || '—')}</strong></td>
      <td>${escapeHtml(co.properties.domain || '—')}</td>
      <td>${escapeHtml(co.properties.city || '—')}</td>
      <td>${escapeHtml(co.properties.industry || '—')}</td>
      <td style="text-align:right">
        ${actionMenu(co.id, [
          { label: 'Use in Links', action: 'use-company-links' },
          { label: 'Edit',         action: 'edit-company' },
          { divider: true },
          { label: 'Delete',       action: 'delete-company', danger: true },
        ])}
      </td>`;
    body.appendChild(row);
  });
}

// ── Links tab selectors ───────────────────────────────────────────────────────

export function renderLinkSelectors(state) {
  const dealLabel    = d  => `${d.properties.dealname || 'Untitled'} [${d.id}] · ${d.properties.dealstage || 'no stage'}`;
  const contactLabel = c  => {
    const name = [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || c.properties.email || 'Unnamed';
    return `${name} [${c.id}]`;
  };
  const companyLabel = co => `${co.properties.name || 'Unnamed'} [${co.id}]`;

  fillSelect('link-deal-contact',  state.deals,     d  => d.id,  dealLabel);
  fillSelect('link-deal-company',  state.deals,     d  => d.id,  dealLabel);
  fillSelect('association-deal',   state.deals,     d  => d.id,  dealLabel);
  fillSelect('link-contact',       state.contacts,  c  => c.id,  contactLabel);
  fillSelect('link-company',       state.companies, co => co.id, companyLabel);
}

function fillSelect(id, items, getValue, getLabel) {
  const select = document.getElementById(id);
  if (!items || items.length === 0) {
    select.innerHTML = '<option value="">No records available</option>';
    select.disabled  = true;
    return;
  }
  select.disabled  = false;
  select.innerHTML = '';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value       = getValue(item);
    opt.textContent = getLabel(item);
    select.appendChild(opt);
  });
}

// ── Associations ──────────────────────────────────────────────────────────────

export function renderAssociations(objectType, records) {
  const container = document.getElementById('association-output');
  if (!records || records.length === 0) {
    container.innerHTML = `<div class="empty-note">No linked ${objectType} found for this deal.</div>`;
    return;
  }
  container.innerHTML = '';
  records.forEach(r => {
    const card = document.createElement('div');
    card.className = 'association-item';
    card.innerHTML = `
      <strong>${escapeHtml(objectType.slice(0, -1))} ${escapeHtml(r.id)}</strong>
      <div class="mono">${escapeHtml(r.type || 'association')}</div>`;
    container.appendChild(card);
  });
}

export function renderAssociationPlaceholder() {
  document.getElementById('association-output').innerHTML =
    '<div class="empty-note">Select a deal above and click a button to see its links.</div>';
}

// ── Inline row editing ────────────────────────────────────────────────────────
// Strategy: keep the original row visible (highlighted), insert a full-width
// panel row directly below it. This way inputs aren't constrained by column widths.

function insertPanelRow(parentRow, colSpan, html) {
  parentRow.classList.add('row-editing-parent');
  const panelRow = document.createElement('tr');
  panelRow.className = 'row-edit-panel';
  panelRow.dataset.editFor = parentRow.dataset.id;
  panelRow.innerHTML = `<td colspan="${colSpan}"><div class="edit-panel">${html}</div></td>`;
  parentRow.after(panelRow);
  return panelRow;
}

export function renderDealRowEdit(parentRow, deal, state) {
  const pipelineOptions = state.pipelines.map(p =>
    `<option value="${escapeHtml(p.id)}" ${p.id === deal.properties.pipeline ? 'selected' : ''}>${escapeHtml(p.label)}</option>`
  ).join('');

  const activePipeline = state.pipelines.find(p => p.id === deal.properties.pipeline) || state.pipelines[0];
  const stageOptions   = (activePipeline?.stages || []).map(s =>
    `<option value="${escapeHtml(s.id)}" ${s.id === deal.properties.dealstage ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
  ).join('');

  const closeDate = deal.properties.closedate
    ? new Date(deal.properties.closedate).toISOString().slice(0, 10) : '';

  const panelRow = insertPanelRow(parentRow, 5, `
    <p class="edit-panel-label">Edit deal</p>
    <div class="form-grid cols-2">
      <div>
        <label>Deal name <span class="label-hint">required</span></label>
        <input data-field="dealname" value="${escapeHtml(deal.properties.dealname || '')}" placeholder="Deal name">
      </div>
      <div>
        <label>Amount</label>
        <input data-field="amount" value="${escapeHtml(deal.properties.amount || '')}" placeholder="25000">
      </div>
      <div>
        <label>Pipeline</label>
        <select data-field="pipeline">${pipelineOptions}</select>
      </div>
      <div>
        <label>Stage</label>
        <select data-field="dealstage">${stageOptions}</select>
      </div>
      <div>
        <label>Close date</label>
        <input type="date" data-field="closedate" value="${escapeHtml(closeDate)}">
      </div>
    </div>
    <div class="edit-panel-actions">
      <button class="button button-primary"   data-action="save-deal-inline"  data-id="${escapeHtml(deal.id)}">Save changes</button>
      <button class="button button-secondary" data-action="cancel-inline" data-entity="deal" data-id="${escapeHtml(deal.id)}">Cancel</button>
    </div>`);

  // Pipeline → stage cascade
  const pipelineSel = panelRow.querySelector('[data-field="pipeline"]');
  const stageSel    = panelRow.querySelector('[data-field="dealstage"]');
  pipelineSel.addEventListener('change', () => {
    const p = state.pipelines.find(pp => pp.id === pipelineSel.value);
    stageSel.innerHTML = (p?.stages || []).map(s =>
      `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`
    ).join('');
  });

  panelRow.querySelector('[data-field="dealname"]').focus();
}

export function renderContactRowEdit(parentRow, contact) {
  const lifecycleOptions = LIFECYCLE_STAGES.map(v =>
    `<option value="${v}" ${v === contact.properties.lifecyclestage ? 'selected' : ''}>${v}</option>`
  ).join('');

  const panelRow = insertPanelRow(parentRow, 5, `
    <p class="edit-panel-label">Edit contact</p>
    <div class="form-grid cols-2">
      <div>
        <label>First name</label>
        <input data-field="firstname" value="${escapeHtml(contact.properties.firstname || '')}" placeholder="Alice">
      </div>
      <div>
        <label>Last name</label>
        <input data-field="lastname" value="${escapeHtml(contact.properties.lastname || '')}" placeholder="Chen">
      </div>
      <div>
        <label>Email <span class="label-hint">required</span></label>
        <input data-field="email" type="email" value="${escapeHtml(contact.properties.email || '')}" placeholder="alice@example.com">
      </div>
      <div>
        <label>Phone</label>
        <input data-field="phone" value="${escapeHtml(contact.properties.phone || '')}" placeholder="+1-000-000-0000">
      </div>
      <div>
        <label>Lifecycle stage</label>
        <select data-field="lifecyclestage"><option value="">Not set</option>${lifecycleOptions}</select>
      </div>
    </div>
    <div class="edit-panel-actions">
      <button class="button button-primary"   data-action="save-contact-inline"  data-id="${escapeHtml(contact.id)}">Save changes</button>
      <button class="button button-secondary" data-action="cancel-inline" data-entity="contact" data-id="${escapeHtml(contact.id)}">Cancel</button>
    </div>`);

  panelRow.querySelector('[data-field="email"]').focus();
}

export function renderCompanyRowEdit(parentRow, company) {
  const industryOptions = INDUSTRY_OPTIONS.map(o =>
    `<option value="${escapeHtml(o.value)}" ${o.value === company.properties.industry ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');

  const panelRow = insertPanelRow(parentRow, 5, `
    <p class="edit-panel-label">Edit company</p>
    <div class="form-grid cols-2">
      <div>
        <label>Company name <span class="label-hint">required</span></label>
        <input data-field="name" value="${escapeHtml(company.properties.name || '')}" placeholder="Northwind Data Systems">
      </div>
      <div>
        <label>Domain</label>
        <input data-field="domain" value="${escapeHtml(company.properties.domain || '')}" placeholder="northwind.example">
      </div>
      <div>
        <label>City</label>
        <input data-field="city" value="${escapeHtml(company.properties.city || '')}" placeholder="Taoyuan">
      </div>
      <div>
        <label>Industry</label>
        <select data-field="industry"><option value="">Not set</option>${industryOptions}</select>
      </div>
    </div>
    <div class="edit-panel-actions">
      <button class="button button-primary"   data-action="save-company-inline"  data-id="${escapeHtml(company.id)}">Save changes</button>
      <button class="button button-secondary" data-action="cancel-inline" data-entity="company" data-id="${escapeHtml(company.id)}">Cancel</button>
    </div>`);

  panelRow.querySelector('[data-field="name"]').focus();
}

// ── Import preview table ──────────────────────────────────────────────────────

export function renderImportEmptyState(message = 'Upload a CSV file and click Preview to validate rows before writing to HubSpot.') {
  document.getElementById('import-preview-count').textContent = 'No preview yet';
  document.getElementById('import-preview-count').className   = 'pill';
  document.getElementById('import-preview-body').innerHTML    =
    `<tr><td colspan="5"><div class="empty-state">
      <div class="icon" style="font-size:22px;font-family:monospace;font-weight:800">CSV</div>
      <p>${message}</p>
    </div></td></tr>`;
}

export function renderImportPreview(preview) {
  const badge = document.getElementById('import-preview-count');
  badge.className   = preview.errorRows > 0 ? 'pill filter-active' : 'pill success';
  badge.textContent = `${preview.readyRows} ready / ${preview.errorRows} errors`;

  document.getElementById('import-preview-body').innerHTML = preview.rows.map(row => {
    const msgs = [
      ...(row.errors   || []).map(m => `<span style="color:var(--danger)">✕ ${escapeHtml(m)}</span>`),
      ...(row.warnings || []).map(m => `<span style="color:var(--warning)">⚠ ${escapeHtml(m)}</span>`),
    ];
    if (!msgs.length) msgs.push('<span style="color:var(--success)">✓ Ready to create</span>');
    return `<tr>
      <td class="mono">${escapeHtml(row.rowNumber)}</td>
      <td>${escapeHtml(row.action)}</td>
      <td class="mono">${escapeHtml(row.recordId || '—')}</td>
      <td>${escapeHtml(row.status)}</td>
      <td style="line-height:1.8">${msgs.join('<br>')}</td>
    </tr>`;
  }).join('');
}
