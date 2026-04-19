import { escapeHtml } from './ui.js';
import { INDUSTRY_OPTIONS } from './csv.js';
import { LIFECYCLE_STAGES } from './forms.js';
import { paginate, renderPaginator } from './pagination.js';

const STAGE_WON = new Set(['closedwon', 'customer', 'closed won']);
const STAGE_LOST = new Set(['closedlost', 'closed lost']);
const STAGE_LEAD = new Set(['lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'subscriber']);
const STAGE_ACTIVE = new Set([
  'appointmentscheduled', 'qualifiedtobuy', 'presentationscheduled',
  'decisionmakerboughtin', 'contractsent', 'opportunity',
]);

export function actionMenu(id, actions) {
  const items = actions.map(action => {
    if (action.divider) {
      return '<div class="action-divider"></div>';
    }

    const dangerClass = action.danger ? ' action-item-danger' : '';
    return `<button class="action-item${dangerClass}" data-action="${action.action}" data-id="${escapeHtml(id)}">${action.label}</button>`;
  }).join('');

  return `
    <div class="action-menu">
      <button class="action-trigger" data-action="open-menu" title="Actions">⋯</button>
      <div class="action-dropdown">${items}</div>
    </div>`;
}

export function stagePill(value) {
  if (!value || value === '-') {
    return '<span class="mono" style="color:var(--muted)">-</span>';
  }

  const key = value.toLowerCase().replace(/\s/g, '');
  let className = '';

  if (STAGE_WON.has(key)) className = 'won';
  if (STAGE_LOST.has(key)) className = 'lost';
  if (STAGE_ACTIVE.has(key)) className = 'active';
  if (STAGE_LEAD.has(key)) className = 'lead';

  return `<span class="stage-pill ${className}">${escapeHtml(value)}</span>`;
}

export function renderPipelineSelectors(state, selectedPipeline = '', selectedStage = '') {
  const pipelineSelect = document.getElementById('deal-pipeline');
  if (!pipelineSelect) return;

  pipelineSelect.innerHTML = '';

  state.pipelines.forEach(pipeline => {
    const option = document.createElement('option');
    option.value = pipeline.id;
    option.textContent = `${pipeline.label} (${pipeline.id})`;
    pipelineSelect.appendChild(option);
  });

  const targetPipeline = selectedPipeline || pipelineSelect.value || 'default';
  const matchedPipeline = state.pipelines.find(pipeline => pipeline.id === targetPipeline)
    || state.pipelines.find(pipeline => pipeline.id === 'default')
    || state.pipelines[0];

  if (matchedPipeline) {
    pipelineSelect.value = matchedPipeline.id;
  }

  pipelineSelect.disabled = state.pipelines.length === 0;
  renderStageOptions(state, selectedStage);
}

export function renderStageOptions(state, selectedStage = '') {
  const pipelineSelect = document.getElementById('deal-pipeline');
  const stageSelect = document.getElementById('deal-stage');
  if (!pipelineSelect || !stageSelect) return;

  const pipelineId = pipelineSelect.value;
  const pipeline = state.pipelines.find(item => item.id === pipelineId);
  const stages = pipeline?.stages || [];

  stageSelect.innerHTML = '';

  stages.forEach(stage => {
    const option = document.createElement('option');
    option.value = stage.id;
    option.textContent = `${stage.label} (${stage.id})`;
    stageSelect.appendChild(option);
  });

  if (selectedStage && stages.some(stage => stage.id === selectedStage)) {
    stageSelect.value = selectedStage;
  }

  stageSelect.disabled = stages.length === 0;
}

export function renderCompanyIndustryOptions(options = INDUSTRY_OPTIONS) {
  const select = document.getElementById('company-industry');
  if (!select) return;

  select.innerHTML = '<option value="">Not set</option>';
  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
}

export function renderDealFilterOptions(state) {
  const stages = [...new Set(state.deals.map(deal => deal.properties.dealstage).filter(Boolean))].sort();
  const pipelines = [...new Set(state.deals.map(deal => deal.properties.pipeline).filter(Boolean))].sort();

  fillFilterSelect('filter-deal-stage', stages, value => value, value => value);
  fillFilterSelect('filter-deal-pipeline', pipelines, value => value, value => value);
}

export function renderContactFilterOptions(state) {
  const stages = [...new Set(state.contacts.map(contact => contact.properties.lifecyclestage).filter(Boolean))].sort();
  fillFilterSelect('filter-contact-lifecycle', stages, value => value, value => value);
}

export function renderCompanyFilterOptions(options = INDUSTRY_OPTIONS) {
  fillFilterSelect(
    'filter-company-industry',
    options.map(option => ({ value: option.value, label: option.label })),
    option => option.value,
    option => option.label);
}

function fillFilterSelect(id, items, getValue, getLabel) {
  const select = document.getElementById(id);
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="">All</option>';

  items.forEach(item => {
    const option = document.createElement('option');
    option.value = getValue(item);
    option.textContent = getLabel(item);
    select.appendChild(option);
  });

  if (currentValue && items.some(item => getValue(item) === currentValue)) {
    select.value = currentValue;
  }
}

export function renderDealTable(records, searchActive, options = {}) {
  const { linksEnabled = true, page = 1, pageSize = 10 } = options;
  const body = document.getElementById('deal-table-body');
  const countEl = document.getElementById('deal-count');
  if (!body || !countEl) return;

  countEl.className = searchActive ? 'pill filter-active' : 'pill';
  countEl.textContent = searchActive ? `${records.length} filtered` : `${records.length} deals`;

  if (records.length === 0) {
    body.innerHTML = `<tr><td colspan="5">
      <div class="empty-state">
        <div class="icon">DL</div>
        <p>${searchActive
          ? 'No deals match the current filters.'
          : 'No deals yet.<br>Create your first deal using the form on the left.'}</p>
        ${searchActive ? '<button class="button button-secondary" data-action="clear-deal-filters">Clear filters</button>' : ''}
      </div>
    </td></tr>`;
    renderPaginator('deal-paginator', 0, 1, 'deals');
    return;
  }

  body.innerHTML = '';
  paginate(records, page, pageSize).forEach(deal => {
    const row = document.createElement('tr');
    row.dataset.id = deal.id;
    row.innerHTML = `
      <td><strong>${escapeHtml(deal.properties.dealname || '-')}</strong></td>
      <td>${stagePill(deal.properties.dealstage || '')}</td>
      <td>${deal.properties.amount ? escapeHtml(deal.properties.amount) : '<span style="color:var(--muted)">-</span>'}</td>
      <td>${escapeHtml(deal.properties.pipeline || '-')}</td>
      <td style="text-align:right">
        ${actionMenu(deal.id, [
          ...(linksEnabled ? [{ label: 'Associate…', action: 'associate-deal' }] : []),
          { label: 'Edit', action: 'edit-deal' },
          { divider: true },
          { label: 'Delete', action: 'delete-deal', danger: true },
        ])}
      </td>`;
    body.appendChild(row);
  });
  renderPaginator('deal-paginator', records.length, page, 'deals');
}

export function renderContactTable(records, options = {}) {
  const {
    linksEnabled = true,
    countClass = 'pill',
    countLabel = `${records.length} contacts`,
    emptyMessage = 'No contacts yet.<br>Create the first contact using the form on the left.',
    page = 1,
    pageSize = 10,
  } = options;

  const body = document.getElementById('contact-table-body');
  const countEl = document.getElementById('contact-count');
  if (!body || !countEl) return;

  countEl.className = countClass;
  countEl.textContent = countLabel;

  if (records.length === 0) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state">
      <div class="icon">CT</div>
      <p>${emptyMessage}</p>
    </div></td></tr>`;
    renderPaginator('contact-paginator', 0, 1, 'contacts');
    return;
  }

  body.innerHTML = '';
  paginate(records, page, pageSize).forEach(contact => {
    const name = [contact.properties.firstname, contact.properties.lastname]
      .filter(Boolean)
      .join(' ') || '-';

    const row = document.createElement('tr');
    row.dataset.id = contact.id;
    row.innerHTML = `
      <td><strong>${escapeHtml(name)}</strong></td>
      <td>${escapeHtml(contact.properties.email || '-')}</td>
      <td>${escapeHtml(contact.properties.phone || '-')}</td>
      <td>${stagePill(contact.properties.lifecyclestage || '')}</td>
      <td style="text-align:right">
        ${actionMenu(contact.id, [
          ...(linksEnabled ? [{ label: 'Associate…', action: 'associate-contact' }] : []),
          { label: 'Edit', action: 'edit-contact' },
          { divider: true },
          { label: 'Delete', action: 'delete-contact', danger: true },
        ])}
      </td>`;
    body.appendChild(row);
  });
  renderPaginator('contact-paginator', records.length, page, 'contacts');
}

export function renderCompanyTable(records, options = {}) {
  const {
    linksEnabled = true,
    countClass = 'pill',
    countLabel = `${records.length} companies`,
    emptyMessage = 'No companies yet.<br>Create the first company using the form on the left.',
    page = 1,
    pageSize = 10,
  } = options;

  const body = document.getElementById('company-table-body');
  const countEl = document.getElementById('company-count');
  if (!body || !countEl) return;

  countEl.className = countClass;
  countEl.textContent = countLabel;

  if (records.length === 0) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state">
      <div class="icon">CO</div>
      <p>${emptyMessage}</p>
    </div></td></tr>`;
    renderPaginator('company-paginator', 0, 1, 'companies');
    return;
  }

  body.innerHTML = '';
  paginate(records, page, pageSize).forEach(company => {
    const row = document.createElement('tr');
    row.dataset.id = company.id;
    row.innerHTML = `
      <td><strong>${escapeHtml(company.properties.name || '-')}</strong></td>
      <td>${escapeHtml(company.properties.domain || '-')}</td>
      <td>${escapeHtml(company.properties.city || '-')}</td>
      <td>${escapeHtml(company.properties.industry || '-')}</td>
      <td style="text-align:right">
        ${actionMenu(company.id, [
          ...(linksEnabled ? [{ label: 'Associate…', action: 'associate-company' }] : []),
          { label: 'Edit', action: 'edit-company' },
          { divider: true },
          { label: 'Delete', action: 'delete-company', danger: true },
        ])}
      </td>`;
    body.appendChild(row);
  });
  renderPaginator('company-paginator', records.length, page, 'companies');
}

export function renderLinkSelectors(state) {
  const dealLabel = deal =>
    `${deal.properties.dealname || 'Untitled'} [${deal.id}] · ${deal.properties.dealstage || 'no stage'}`;
  const contactLabel = contact => {
    const name = [contact.properties.firstname, contact.properties.lastname]
      .filter(Boolean)
      .join(' ') || contact.properties.email || 'Unnamed';
    return `${name} [${contact.id}]`;
  };
  const companyLabel = company => `${company.properties.name || 'Unnamed'} [${company.id}]`;

  fillSelect('link-deal-contact', state.deals, deal => deal.id, dealLabel);
  fillSelect('link-deal-company', state.deals, deal => deal.id, dealLabel);
  fillSelect('association-deal', state.deals, deal => deal.id, dealLabel);
  fillSelect('link-contact', state.contacts, contact => contact.id, contactLabel);
  fillSelect('link-company', state.companies, company => company.id, companyLabel);
}

function fillSelect(id, items, getValue, getLabel) {
  const select = document.getElementById(id);
  if (!select) return;

  if (!items || items.length === 0) {
    select.innerHTML = '<option value="">No records available</option>';
    select.disabled = true;
    return;
  }

  const currentValue = select.value;
  select.disabled = false;
  select.innerHTML = '';

  items.forEach(item => {
    const option = document.createElement('option');
    option.value = getValue(item);
    option.textContent = getLabel(item);
    select.appendChild(option);
  });

  if (currentValue && items.some(item => getValue(item) === currentValue)) {
    select.value = currentValue;
  }
}

export function renderAssociations(objectType, records) {
  const container = document.getElementById('association-output');
  if (!container) return;

  if (!records || records.length === 0) {
    container.innerHTML = `<div class="empty-note">No linked ${objectType} found for this deal.</div>`;
    return;
  }

  container.innerHTML = '';
  records.forEach(record => {
    const card = document.createElement('div');
    card.className = 'association-item';
    card.innerHTML = `
      <strong>${escapeHtml(objectType.slice(0, -1))} ${escapeHtml(record.id)}</strong>
      <div class="mono">${escapeHtml(record.type || 'association')}</div>`;
    container.appendChild(card);
  });
}

export function renderAssociationPlaceholder() {
  const container = document.getElementById('association-output');
  if (!container) return;

  container.innerHTML =
    '<div class="empty-note">Select a deal above and click a button to see its links.</div>';
}

export function insertPanelRow(parentRow, colSpan, html) {
  parentRow.classList.add('row-editing-parent');

  const panelRow = document.createElement('tr');
  panelRow.className = 'row-edit-panel';
  panelRow.dataset.editFor = parentRow.dataset.id;
  panelRow.innerHTML = `<td colspan="${colSpan}"><div class="edit-panel">${html}</div></td>`;

  parentRow.after(panelRow);
  return panelRow;
}

export function renderDealRowEdit(parentRow, deal, state) {
  const pipelineOptions = state.pipelines.map(pipeline =>
    `<option value="${escapeHtml(pipeline.id)}" ${pipeline.id === deal.properties.pipeline ? 'selected' : ''}>${escapeHtml(pipeline.label)}</option>`
  ).join('');

  const activePipeline = state.pipelines.find(pipeline => pipeline.id === deal.properties.pipeline) || state.pipelines[0];
  const stageOptions = (activePipeline?.stages || []).map(stage =>
    `<option value="${escapeHtml(stage.id)}" ${stage.id === deal.properties.dealstage ? 'selected' : ''}>${escapeHtml(stage.label)}</option>`
  ).join('');

  const closeDate = deal.properties.closedate
    ? new Date(deal.properties.closedate).toISOString().slice(0, 10)
    : '';

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
      <button class="button button-primary" data-action="save-deal-inline" data-id="${escapeHtml(deal.id)}">Save changes</button>
      <button class="button button-secondary" data-action="cancel-inline" data-id="${escapeHtml(deal.id)}">Cancel</button>
    </div>`);

  const pipelineSelect = panelRow.querySelector('[data-field="pipeline"]');
  const stageSelect = panelRow.querySelector('[data-field="dealstage"]');

  pipelineSelect.addEventListener('change', () => {
    const pipeline = state.pipelines.find(item => item.id === pipelineSelect.value);
    stageSelect.innerHTML = (pipeline?.stages || []).map(stage =>
      `<option value="${escapeHtml(stage.id)}">${escapeHtml(stage.label)}</option>`
    ).join('');
  });

  panelRow.querySelector('[data-field="dealname"]').focus();
}

export function renderContactRowEdit(parentRow, contact) {
  const lifecycleOptions = LIFECYCLE_STAGES.map(stage =>
    `<option value="${stage}" ${stage === contact.properties.lifecyclestage ? 'selected' : ''}>${stage}</option>`
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
      <button class="button button-primary" data-action="save-contact-inline" data-id="${escapeHtml(contact.id)}">Save changes</button>
      <button class="button button-secondary" data-action="cancel-inline" data-id="${escapeHtml(contact.id)}">Cancel</button>
    </div>`);

  panelRow.querySelector('[data-field="email"]').focus();
}

export function renderCompanyRowEdit(parentRow, company) {
  const industryOptions = INDUSTRY_OPTIONS.map(option =>
    `<option value="${escapeHtml(option.value)}" ${option.value === company.properties.industry ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
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
      <button class="button button-primary" data-action="save-company-inline" data-id="${escapeHtml(company.id)}">Save changes</button>
      <button class="button button-secondary" data-action="cancel-inline" data-id="${escapeHtml(company.id)}">Cancel</button>
    </div>`);

  panelRow.querySelector('[data-field="name"]').focus();
}

export function renderImportEmptyState(message = 'Upload a CSV file and click Preview to validate rows before writing to HubSpot.') {
  const countEl = document.getElementById('import-preview-count');
  const body = document.getElementById('import-preview-body');
  if (!countEl || !body) return;

  countEl.textContent = 'No preview yet';
  countEl.className = 'pill';
  body.innerHTML = `<tr><td colspan="5"><div class="empty-state">
      <div class="icon" style="font-size:22px;font-family:monospace;font-weight:800">CSV</div>
      <p>${message}</p>
    </div></td></tr>`;
}

export function renderImportPreview(preview) {
  const badge = document.getElementById('import-preview-count');
  const body = document.getElementById('import-preview-body');
  if (!badge || !body) return;

  badge.className = preview.errorRows > 0 ? 'pill filter-active' : 'pill success';
  badge.textContent = `${preview.readyRows} ready / ${preview.errorRows} errors`;

  body.innerHTML = preview.rows.map(row => {
    const messages = [
      ...(row.errors || []).map(message => `<span style="color:var(--danger)">x ${escapeHtml(message)}</span>`),
      ...(row.warnings || []).map(message => `<span style="color:var(--warning)">! ${escapeHtml(message)}</span>`),
    ];

    if (!messages.length) {
      messages.push('<span style="color:var(--success)">ok Ready to create</span>');
    }

    return `<tr>
      <td class="mono">${escapeHtml(row.rowNumber)}</td>
      <td>${escapeHtml(row.action)}</td>
      <td class="mono">${escapeHtml(row.recordId || '-')}</td>
      <td>${escapeHtml(row.status)}</td>
      <td style="line-height:1.8">${messages.join('<br>')}</td>
    </tr>`;
  }).join('');
}
