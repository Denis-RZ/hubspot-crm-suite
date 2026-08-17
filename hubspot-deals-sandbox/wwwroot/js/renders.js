import { escapeHtml } from './ui.js';
import { INDUSTRY_OPTIONS } from './csv.js';
const LIFECYCLE_STAGES_FALLBACK = [
  'subscriber', 'lead', 'marketingqualifiedlead',
  'salesqualifiedlead', 'opportunity', 'customer',
];
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

  select.innerHTML = '<option value="">Not set · 未設定</option>';
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
  select.innerHTML = '<option value="">All · 全部</option>';

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
  const { linksEnabled = true, linkedObjectTypes = ['contacts', 'companies'], page = 1, pageSize = 10 } = options;
  const body = document.getElementById('deal-table-body');
  const countEl = document.getElementById('deal-count');
  if (!body || !countEl) return;
  const canExpand = linksEnabled && linkedObjectTypes.length > 0;
  const expandTitle = linkedObjectTypes.length === 1
    ? `View linked ${linkedObjectTypes[0]}`
    : 'View linked contacts and companies';

  countEl.className = searchActive ? 'pill filter-active' : 'pill';
  countEl.innerHTML = searchActive
    ? `${records.length} filtered<span class="zh">已篩選 ${records.length} 筆</span>`
    : `${records.length} deals<span class="zh">共 ${records.length} 筆交易</span>`;

  if (records.length === 0) {
    body.innerHTML = `<tr><td colspan="6">
      <div class="empty-state">
        <div class="icon">DL</div>
        <p>${searchActive
          ? 'No deals match the current filters.<span class="zh">沒有符合篩選條件的交易。</span>'
          : 'No deals yet.<br>Create your first deal using the form on the left.<span class="zh">尚無交易，請使用左側表單建立第一筆。</span>'}</p>
        ${searchActive ? '<button class="button button-secondary" data-action="clear-deal-filters">Clear filters<span class="zh">清除篩選</span></button>' : ''}
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
      <td class="col-expand">${canExpand ? `<button class="row-expand-toggle" data-action="view-deal-links" data-id="${escapeHtml(deal.id)}" title="${expandTitle}">▶</button>` : ''}</td>
      <td><strong>${escapeHtml(deal.properties.dealname || '-')}</strong></td>
      <td>${stagePill(deal.properties.dealstage || '')}</td>
      <td>${deal.properties.amount ? escapeHtml(deal.properties.amount) : '<span style="color:var(--muted)">-</span>'}</td>
      <td>${escapeHtml(deal.properties.pipeline || '-')}</td>
      <td style="text-align:right">
        ${actionMenu(deal.id, [
          ...(linksEnabled ? [{ label: 'Associate…<span class="zh">建立關聯…</span>', action: 'associate-deal' }] : []),
          { label: 'Edit<span class="zh">編輯</span>', action: 'edit-deal' },
          { divider: true },
          { label: 'Delete<span class="zh">刪除</span>', action: 'delete-deal', danger: true },
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
    countLabel = `${records.length} contacts<span class="zh">共 ${records.length} 筆聯絡人</span>`,
    emptyMessage = 'No contacts yet.<br>Create the first contact using the form on the left.<span class="zh">尚無聯絡人，請使用左側表單建立第一筆。</span>',
    page = 1,
    pageSize = 10,
  } = options;

  const body = document.getElementById('contact-table-body');
  const countEl = document.getElementById('contact-count');
  if (!body || !countEl) return;
  const canExpand = linksEnabled;

  countEl.className = countClass;
  countEl.innerHTML = countLabel;

  if (records.length === 0) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state">
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
      <td class="col-expand">${canExpand ? `<button class="row-expand-toggle" data-action="view-contact-links" data-id="${escapeHtml(contact.id)}" title="View linked deals">▶</button>` : ''}</td>
      <td><strong>${escapeHtml(name)}</strong></td>
      <td>${escapeHtml(contact.properties.email || '-')}</td>
      <td>${escapeHtml(contact.properties.phone || '-')}</td>
      <td>${stagePill(contact.properties.lifecyclestage || '')}</td>
      <td style="text-align:right">
        ${actionMenu(contact.id, [
          ...(linksEnabled ? [{ label: 'Associate…<span class="zh">建立關聯…</span>', action: 'associate-contact' }] : []),
          { label: 'Edit<span class="zh">編輯</span>', action: 'edit-contact' },
          { divider: true },
          { label: 'Delete<span class="zh">刪除</span>', action: 'delete-contact', danger: true },
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
    countLabel = `${records.length} companies<span class="zh">共 ${records.length} 筆公司</span>`,
    emptyMessage = 'No companies yet.<br>Create the first company using the form on the left.<span class="zh">尚無公司，請使用左側表單建立第一筆。</span>',
    page = 1,
    pageSize = 10,
  } = options;

  const body = document.getElementById('company-table-body');
  const countEl = document.getElementById('company-count');
  if (!body || !countEl) return;
  const canExpand = linksEnabled;

  countEl.className = countClass;
  countEl.innerHTML = countLabel;

  if (records.length === 0) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state">
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
      <td class="col-expand">${canExpand ? `<button class="row-expand-toggle" data-action="view-company-links" data-id="${escapeHtml(company.id)}" title="View linked deals">▶</button>` : ''}</td>
      <td><strong>${escapeHtml(company.properties.name || '-')}</strong></td>
      <td>${escapeHtml(company.properties.domain || '-')}</td>
      <td>${escapeHtml(company.properties.city || '-')}</td>
      <td>${escapeHtml(company.properties.industry || '-')}</td>
      <td style="text-align:right">
        ${actionMenu(company.id, [
          ...(linksEnabled ? [{ label: 'Associate…<span class="zh">建立關聯…</span>', action: 'associate-company' }] : []),
          { label: 'Edit<span class="zh">編輯</span>', action: 'edit-company' },
          { divider: true },
          { label: 'Delete<span class="zh">刪除</span>', action: 'delete-company', danger: true },
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

function linksTable(rows, emptyText, headers = []) {
  if (!rows.length) return `<p class="empty-note">${emptyText}</p>`;
  // Headers are always trusted literals from the calling code (may contain
  // a <span class="zh"> translation) - only cell data, which comes from
  // user-entered record properties, is escaped.
  const thead = headers.length
    ? `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`
    : '';
  return `<table class="links-mini-table">${thead}<tbody>${rows.map(cells =>
    `<tr>${cells.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
  ).join('')}</tbody></table>`;
}

function contactLinkTitle(contact) {
  const props = contact.properties ?? {};
  return [props.firstname, props.lastname].filter(Boolean).join(' ')
    || props.email
    || `Contact ${contact.id}`;
}

function companyLinkTitle(company) {
  const props = company.properties ?? {};
  return props.name || props.domain || `Company ${company.id}`;
}

function dealLinkTitle(deal) {
  return deal.properties?.dealname || `Deal ${deal.id}`;
}

export function renderDealLinksRow(parentRow, contacts, companies, enabledTypes = ['contacts', 'companies']) {
  const contactRows = contacts.map(c => [
    contactLinkTitle(c),
    c._missing ? `ID ${c.id}` : c.properties?.email || c.id,
  ]);
  const companyRows = companies.map(c => [
    companyLinkTitle(c),
    c._missing ? `ID ${c.id}` : c.properties?.domain || c.id,
  ]);
  const sections = [];

  if (enabledTypes.includes('contacts')) {
    sections.push(`
      <div>
        <p class="edit-panel-label">Linked contacts (${contacts.length})<span class="zh">已連結聯絡人（${contacts.length}）</span></p>
        ${linksTable(contactRows, 'None linked<span class="zh">尚無關聯</span>', ['Name<span class="zh">姓名</span>', 'Email<span class="zh">電子郵件</span>'])}
      </div>`);
  }

  if (enabledTypes.includes('companies')) {
    sections.push(`
      <div>
        <p class="edit-panel-label">Linked companies (${companies.length})<span class="zh">已連結公司（${companies.length}）</span></p>
        ${linksTable(companyRows, 'None linked<span class="zh">尚無關聯</span>', ['Name<span class="zh">名稱</span>', 'Domain<span class="zh">網域</span>'])}
      </div>`);
  }

  return insertPanelRow(parentRow, 6, `
    <div class="links-expand-grid${sections.length === 1 ? ' single' : ''}">
      ${sections.join('')}
    </div>`, { kind: 'links' });
}

export function renderContactLinksRow(parentRow, deals) {
  const rows = deals.map(d => [
    dealLinkTitle(d),
    d._missing ? 'ID only' : d.properties?.dealstage || '-',
    d.properties?.amount || '-',
  ]);
  return insertPanelRow(parentRow, 6, `
    <div>
      <p class="edit-panel-label">Linked deals (${deals.length})<span class="zh">已連結交易（${deals.length}）</span></p>
      ${linksTable(rows, 'None linked<span class="zh">尚無關聯</span>', ['Deal<span class="zh">交易</span>', 'Stage<span class="zh">階段</span>', 'Amount<span class="zh">金額</span>'])}
    </div>`, { kind: 'links' });
}

export function renderCompanyLinksRow(parentRow, deals) {
  const rows = deals.map(d => [
    dealLinkTitle(d),
    d._missing ? 'ID only' : d.properties?.dealstage || '-',
    d.properties?.amount || '-',
  ]);
  return insertPanelRow(parentRow, 6, `
    <div>
      <p class="edit-panel-label">Linked deals (${deals.length})<span class="zh">已連結交易（${deals.length}）</span></p>
      ${linksTable(rows, 'None linked<span class="zh">尚無關聯</span>', ['Deal<span class="zh">交易</span>', 'Stage<span class="zh">階段</span>', 'Amount<span class="zh">金額</span>'])}
    </div>`, { kind: 'links' });
}

export function renderAssociationPlaceholder() {
  const container = document.getElementById('association-output');
  if (!container) return;

  container.innerHTML =
    '<div class="empty-note">Select a deal to see its links.</div>';
}

export function insertPanelRow(parentRow, colSpan, html, options = {}) {
  const kind = options.kind || 'edit';
  parentRow.classList.add(kind === 'links' ? 'row-links-parent' : 'row-editing-parent');

  const panelRow = document.createElement('tr');
  panelRow.className = kind === 'links' ? 'row-edit-panel row-links-panel' : 'row-edit-panel';
  panelRow.dataset.panelKind = kind;
  if (kind === 'edit') panelRow.dataset.editFor = parentRow.dataset.id;
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

  const panelRow = insertPanelRow(parentRow, 6, `
    <p class="edit-panel-label">Edit deal<span class="zh">編輯交易</span></p>
    <div class="form-grid cols-2">
      <div>
        <label>Deal name<span class="zh">交易名稱</span> <span class="label-hint">required<span class="zh">必填</span></span></label>
        <input data-field="dealname" value="${escapeHtml(deal.properties.dealname || '')}" placeholder="Deal name">
      </div>
      <div>
        <label>Amount<span class="zh">金額</span></label>
        <input data-field="amount" value="${escapeHtml(deal.properties.amount || '')}" placeholder="25000">
      </div>
      <div>
        <label>Pipeline<span class="zh">銷售流程</span></label>
        <select data-field="pipeline">${pipelineOptions}</select>
      </div>
      <div>
        <label>Stage<span class="zh">階段</span></label>
        <select data-field="dealstage">${stageOptions}</select>
      </div>
      <div>
        <label>Close date<span class="zh">預計成交日</span></label>
        <input type="date" data-field="closedate" value="${escapeHtml(closeDate)}">
      </div>
    </div>
    <div class="edit-panel-actions">
      <button class="button button-primary" data-action="save-deal-inline" data-id="${escapeHtml(deal.id)}">Save changes<span class="zh">儲存變更</span></button>
      <button class="button button-secondary" data-action="cancel-inline" data-id="${escapeHtml(deal.id)}">Cancel<span class="zh">取消</span></button>
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

export function renderContactRowEdit(parentRow, contact, lifecycleOptions = []) {
  const stages = lifecycleOptions.length ? lifecycleOptions : LIFECYCLE_STAGES_FALLBACK.map(v => ({ value: v, label: v }));
  const lifecycleHtml = stages.map(o => {
    const value = o.value ?? o;
    const label = o.label ?? o;
    return `<option value="${escapeHtml(value)}" ${value === contact.properties.lifecyclestage ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');

  const panelRow = insertPanelRow(parentRow, 6, `
    <p class="edit-panel-label">Edit contact<span class="zh">編輯聯絡人</span></p>
    <div class="form-grid cols-2">
      <div>
        <label>First name<span class="zh">名字</span></label>
        <input data-field="firstname" value="${escapeHtml(contact.properties.firstname || '')}" placeholder="Alice">
      </div>
      <div>
        <label>Last name<span class="zh">姓氏</span></label>
        <input data-field="lastname" value="${escapeHtml(contact.properties.lastname || '')}" placeholder="Chen">
      </div>
      <div>
        <label>Email<span class="zh">電子郵件</span> <span class="label-hint">required<span class="zh">必填</span></span></label>
        <input data-field="email" type="email" value="${escapeHtml(contact.properties.email || '')}" placeholder="alice@example.com">
      </div>
      <div>
        <label>Phone<span class="zh">電話</span></label>
        <input data-field="phone" value="${escapeHtml(contact.properties.phone || '')}" placeholder="+1-000-000-0000">
      </div>
      <div>
        <label>Lifecycle stage<span class="zh">生命週期階段</span></label>
        <select data-field="lifecyclestage"><option value="">Not set · 未設定</option>${lifecycleHtml}</select>
      </div>
    </div>
    <div class="edit-panel-actions">
      <button class="button button-primary" data-action="save-contact-inline" data-id="${escapeHtml(contact.id)}">Save changes<span class="zh">儲存變更</span></button>
      <button class="button button-secondary" data-action="cancel-inline" data-id="${escapeHtml(contact.id)}">Cancel<span class="zh">取消</span></button>
    </div>`);

  panelRow.querySelector('[data-field="email"]').focus();
}

export function renderCompanyRowEdit(parentRow, company) {
  const industryOptions = INDUSTRY_OPTIONS.map(option =>
    `<option value="${escapeHtml(option.value)}" ${option.value === company.properties.industry ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  ).join('');

  const panelRow = insertPanelRow(parentRow, 6, `
    <p class="edit-panel-label">Edit company<span class="zh">編輯公司</span></p>
    <div class="form-grid cols-2">
      <div>
        <label>Company name<span class="zh">公司名稱</span> <span class="label-hint">required<span class="zh">必填</span></span></label>
        <input data-field="name" value="${escapeHtml(company.properties.name || '')}" placeholder="Northwind Data Systems">
      </div>
      <div>
        <label>Domain<span class="zh">網域</span></label>
        <input data-field="domain" value="${escapeHtml(company.properties.domain || '')}" placeholder="northwind.example">
      </div>
      <div>
        <label>City<span class="zh">城市</span></label>
        <input data-field="city" value="${escapeHtml(company.properties.city || '')}" placeholder="Taoyuan">
      </div>
      <div>
        <label>Industry<span class="zh">產業</span></label>
        <select data-field="industry"><option value="">Not set · 未設定</option>${industryOptions}</select>
      </div>
    </div>
    <div class="edit-panel-actions">
      <button class="button button-primary" data-action="save-company-inline" data-id="${escapeHtml(company.id)}">Save changes<span class="zh">儲存變更</span></button>
      <button class="button button-secondary" data-action="cancel-inline" data-id="${escapeHtml(company.id)}">Cancel<span class="zh">取消</span></button>
    </div>`);

  panelRow.querySelector('[data-field="name"]').focus();
}

export function renderImportEmptyState(message = 'Upload a CSV file and click Preview to validate rows before saving them.<span class="zh">上傳 CSV 檔案並點擊「預覽匯入」以在儲存前驗證各列資料。</span>') {
  const countEl = document.getElementById('import-preview-count');
  const body = document.getElementById('import-preview-body');
  if (!countEl || !body) return;

  countEl.innerHTML = 'No preview yet<span class="zh">尚無預覽</span>';
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
