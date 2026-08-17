import { apiFetch, normalizeApiError } from '../api.js';
import {
  buildContactPayload,
  clearContactForm,
  crudState,
  fillContactForm,
  renderLifecycleOptions,
  setFormMode,
  syncCrudForms,
} from '../forms.js';
import {
  insertPanelRow,
  renderContactFilterOptions,
  renderContactLinksRow,
  renderContactRowEdit,
  renderContactTable,
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

async function loadContactDealAssociations(contactId) {
  return await apiFetch(`/api/associations/contacts/${encodeURIComponent(contactId)}/deals`);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || 'Enter a valid email address.';
}

function resetContactForm() {
  clearContactForm();
  setFormMode('contact', 'create');
}

function renderContactUi() {
  syncCrudForms(state);
  renderLifecycleOptions(state.contactLifecycleOptions);
  renderContactFilterOptions(state);

  if (crudState.contact.mode === 'edit') {
    const editedContact = state.contacts.find(contact => contact.id === crudState.contact.id);
    if (editedContact) {
      fillContactForm(editedContact);
    }
  }

  renderContactTable(state.contacts, {
    linksEnabled: linksPanelAvailable(),
    page: clampPage('contacts', state.contacts.length),
    pageSize: getPageSize('contacts'),
  });
}

async function saveContact(button) {
  const ok = validateRequired([
    { inputId: 'contact-email', errorId: 'err-contact-email', validator: isValidEmail },
  ]);
  if (!ok) return;

  const payload = buildContactPayload();
  const isEdit = crudState.contact.mode === 'edit';
  const recordId = crudState.contact.id;
  const method = isEdit ? 'PATCH' : 'POST';
  const url = isEdit ? `/api/contacts/${encodeURIComponent(recordId)}` : '/api/contacts';

  setLoading(button, true);
  try {
    const saved = await apiFetch(url, method, payload);
    await refreshAll();
    resetContactForm();
    setResult(saved);
    toast(`Contact "${payload.email || recordId || 'Unnamed'}" ${isEdit ? 'updated' : 'created'}!`, 'success');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast(`Failed to ${isEdit ? 'update' : 'create'} contact`, 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function startEditContact(contactId) {
  const contact = state.contacts.find(record => record.id === contactId);
  if (!contact) {
    toast('Contact not found in the current list.', 'error');
    return;
  }

  fillContactForm(contact);
  setFormMode('contact', 'edit', contact.id);
  showPanel('contacts');
}

async function deleteContact(contactId, button) {
  const contact = state.contacts.find(record => record.id === contactId);
  const label = contact?.properties?.email
    || [contact?.properties?.firstname, contact?.properties?.lastname].filter(Boolean).join(' ')
    || contactId;

  if (!confirm(`Delete contact "${label}"? This cannot be undone.`)) {
    return;
  }

  setLoading(button, true);
  try {
    const result = await apiFetch(`/api/contacts/${encodeURIComponent(contactId)}`, 'DELETE');
    await refreshAll();
    setResult(result);
    toast('Contact deleted!', 'success');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Failed to delete contact', 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function applyContactFilters() {
  const query = document.getElementById('filter-contact-name').value.toLowerCase();
  const lifecycle = document.getElementById('filter-contact-lifecycle').value;
  const isActive = !!(query || lifecycle);

  const visibleContacts = isActive
    ? state.contacts.filter(contact => {
      const text = [contact.properties.firstname, contact.properties.lastname, contact.properties.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (query && !text.includes(query)) return false;
      if (lifecycle && contact.properties.lifecyclestage !== lifecycle) return false;
      return true;
    })
    : state.contacts;

  resetPage('contacts');
  renderContactTable(visibleContacts, {
    linksEnabled: linksPanelAvailable(),
    countClass: isActive ? 'pill filter-active' : 'pill',
    countLabel: isActive ? `${visibleContacts.length} filtered` : `${state.contacts.length} contacts`,
    emptyMessage: isActive
      ? 'No contacts match the current filters.'
      : 'No contacts yet.<br>Create the first contact using the form on the left.',
    page: 1,
    pageSize: getPageSize('contacts'),
  });
}

function clearContactFilters() {
  document.getElementById('filter-contact-name').value = '';
  document.getElementById('filter-contact-lifecycle').value = '';
  applyContactFilters();
}

function startInlineEditContact(contactId) {
  const contact = state.contacts.find(record => record.id === contactId);
  if (!contact) return;

  cancelAnyOpenEdit();
  const row = document.querySelector(`#contact-table-body tr[data-id="${contactId}"]`);
  if (row) {
    renderContactRowEdit(row, contact, state.contactLifecycleOptions);
  }
}

async function saveInlineEditContact(contactId, button) {
  const panelRow = document.querySelector(`tr[data-edit-for="${contactId}"]`);
  if (!panelRow) return;

  const emailInput = panelRow.querySelector('[data-field="email"]');
  const emailValue = emailInput.value.trim();
  if (!emailValue) {
    emailInput.classList.add('invalid');
    emailInput.focus();
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    emailInput.classList.add('invalid');
    emailInput.focus();
    toast('Enter a valid email address.', 'error');
    return;
  }

  const payload = { email: emailValue };
  const firstName = panelRow.querySelector('[data-field="firstname"]')?.value.trim();
  const lastName = panelRow.querySelector('[data-field="lastname"]')?.value.trim();
  const phone = panelRow.querySelector('[data-field="phone"]')?.value.trim();
  const lifecycle = panelRow.querySelector('[data-field="lifecyclestage"]')?.value;

  if (firstName) payload.firstname = firstName;
  if (lastName) payload.lastname = lastName;
  if (phone) payload.phone = phone;
  if (lifecycle) payload.lifecyclestage = lifecycle;

  setLoading(button, true);
  try {
    const saved = await apiFetch(`/api/contacts/${encodeURIComponent(contactId)}`, 'PATCH', payload);
    setResult(saved);
    toast('Contact updated!', 'success');
    await refreshAll();
  }
  catch (error) {
    setError(normalizeApiError(error));
    toast('Failed to update contact', 'error');
    setLoading(button, false);
  }
}

function collapseContactLinksPanel(contactId) {
  const panel = document.querySelector(`#contact-table-body tr[data-links-for="${contactId}"]`);
  if (!panel) return;
  const parentRow = panel.previousElementSibling;
  panel.remove();
  parentRow?.classList.remove('row-editing-parent', 'row-links-parent');
  const toggle = document.querySelector(`#contact-table-body button[data-action="view-contact-links"][data-id="${contactId}"]`);
  if (toggle) { toggle.textContent = '▶'; toggle.classList.remove('open'); }
}

async function showContactLinks(contactId, options = {}) {
  const { refresh = false } = options;
  const existingPanel = document.querySelector(`#contact-table-body tr[data-links-for="${contactId}"]`);
  if (existingPanel && !refresh) { collapseContactLinksPanel(contactId); return; }

  const row = document.querySelector(`#contact-table-body tr[data-id="${contactId}"]`);
  if (!row) return;
  if (!refresh) {
    cancelAnyOpenEdit();
  }

  const loadingRow = existingPanel
    ?? insertPanelRow(row, 6, '<p class="empty-note" style="margin:0">Loading…</p>', { kind: 'links' });
  if (existingPanel) {
    existingPanel.innerHTML = '<td colspan="6"><div class="edit-panel"><p class="empty-note" style="margin:0">Refreshing...</p></div></td>';
  }
  loadingRow.dataset.linksFor = contactId;

  try {
    let assocs = await loadContactDealAssociations(contactId);
    if (refresh && options.expectedDealId &&
      !associationIds(assocs).includes(String(options.expectedDealId))) {
      await delay(ASSOCIATION_REFRESH_RETRY_MS);
      assocs = await loadContactDealAssociations(contactId);
    }
    const deals = linkedDeals(associationIds(assocs));

    loadingRow.remove();
    row.classList.remove('row-editing-parent', 'row-links-parent');
    const panelRow = renderContactLinksRow(row, deals);
    panelRow.dataset.linksFor = contactId;

    const toggle = row.querySelector('button[data-action="view-contact-links"]');
    if (toggle) { toggle.textContent = '▼'; toggle.classList.add('open'); }
  }
  catch {
    loadingRow.querySelector('p').textContent = 'Failed to load links.';
  }
}

function refreshContactLinksIfOpen(event) {
  const { objectType, objectId } = event.detail ?? {};
  if (objectType !== 'contacts' || !objectId) return;
  if (!document.querySelector(`#contact-table-body tr[data-links-for="${objectId}"]`)) return;
  void showContactLinks(objectId, {
    refresh: true,
    expectedDealId: event.detail?.dealId,
  });
}

export default {
  id: 'contacts',
  label: 'Contacts',
  navOrder: 2,
  renderNav() {
    return `
      <button class="nav-button" data-panel="contacts">
        Contacts<span class="zh">聯絡人</span> <span class="nav-badge" data-module-badge="contacts">...</span>
      </button>`;
  },
  renderPanel() {
    return `
      <section id="panel-contacts" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Contacts<span class="zh">聯絡人</span></h2>
            <p>Contacts are people. Create the person before linking a deal to them.<span class="zh">聯絡人是「人」。請先建立這個人，再將交易與其連結。</span></p>
          </div>
          <div class="sub-badge">Create person before linking<span class="zh">先建立人員再連結</span></div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3 id="contact-form-title">Create Contact<span class="zh">建立聯絡人</span></h3>
            <p>Email is required - it is used as the unique key for contacts.<span class="zh">Email 為必填，作為聯絡人的唯一識別鍵。</span></p>
            <div class="form-grid cols-2">
              <div>
                <label for="contact-firstname">First name<span class="zh">名字</span></label>
                <input id="contact-firstname" type="text" placeholder="Alice">
              </div>
              <div>
                <label for="contact-lastname">Last name<span class="zh">姓氏</span></label>
                <input id="contact-lastname" type="text" placeholder="Chen">
              </div>
              <div>
                <label for="contact-email">Email<span class="zh">電子郵件</span> <span class="label-hint">required</span></label>
                <input id="contact-email" type="email" placeholder="alice@example.com">
                <div class="field-error" id="err-contact-email">Email is required.</div>
              </div>
              <div>
                <label for="contact-phone">Phone<span class="zh">電話</span></label>
                <input id="contact-phone" type="text" placeholder="+886-900-000-000">
              </div>
              <div>
                <label for="contact-lifecycle">Lifecycle stage<span class="zh">生命週期階段</span></label>
                <select id="contact-lifecycle"></select>
              </div>
            </div>
            <div class="actions">
              <button id="btn-save-contact" class="button button-primary">Create contact<span class="zh">建立聯絡人</span></button>
              <button id="btn-cancel-contact-edit" class="button button-secondary hidden">Cancel edit<span class="zh">取消編輯</span></button>
            </div>
          </article>

          <article class="table-card">
            <div class="table-toolbar">
              <div>
                <h3>Contact Records<span class="zh">聯絡人紀錄</span></h3>
                <p>Use "Use in Links" to pre-select for association.<span class="zh">使用「Use in Links」預先選取以便建立關聯。</span></p>
              </div>
              <span id="contact-count" class="pill">0 contacts</span>
            </div>
            <div class="table-filters">
              <input id="filter-contact-name" class="filter-input" type="search" placeholder="Search by name or email...">
              <select id="filter-contact-lifecycle" class="filter-select"><option value="">All stages</option></select>
              <button id="btn-clear-contact-filters" class="filter-clear">Clear<span class="zh">清除</span></button>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th class="col-expand"></th><th>Name<span class="zh">姓名</span></th><th>Email<span class="zh">電子郵件</span></th><th>Phone<span class="zh">電話</span></th><th>Lifecycle<span class="zh">生命週期</span></th><th>Actions<span class="zh">操作</span></th></tr>
                </thead>
                <tbody id="contact-table-body"></tbody>
              </table>
            </div>
            <div id="contact-paginator"></div>
          </article>
        </div>
      </section>`;
  },
  mount(container) {
    container.querySelector('#btn-save-contact')?.addEventListener('click', event =>
      saveContact(event.currentTarget));
    container.querySelector('#btn-cancel-contact-edit')?.addEventListener('click', resetContactForm);
    container.querySelector('#filter-contact-name')?.addEventListener('input', applyContactFilters);
    container.querySelector('#filter-contact-lifecycle')?.addEventListener('change', applyContactFilters);
    container.querySelector('#btn-clear-contact-filters')?.addEventListener('click', clearContactFilters);
    container.querySelector('#contact-table-body')?.addEventListener('click', async event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;

      const { action, id } = button.dataset;
      if (action === 'associate-contact') {
        const c = state.contacts.find(x => x.id === id);
        const name = [c?.properties.firstname, c?.properties.lastname].filter(Boolean).join(' ') || id;
        openAssociateModal('contact', id, name);
      }
      if (action === 'view-contact-links') await showContactLinks(id);
      if (action === 'edit-contact') startInlineEditContact(id);
      if (action === 'delete-contact') await deleteContact(id, button);
      if (action === 'save-contact-inline') await saveInlineEditContact(id, button);
      if (action === 'cancel-inline') cancelInlineEdit(id);
    });

    container.addEventListener('click', event => {
      const btn = event.target.closest('button[data-action="goto-page"]');
      if (!btn) return;
      setPage('contacts', parseInt(btn.dataset.page, 10));
      renderContactUi();
    });
    container.addEventListener('change', event => {
      const sel = event.target.closest('select[data-action="change-page-size"]');
      if (!sel) return;
      setPageSize('contacts', sel.value);
      resetPage('contacts');
      renderContactUi();
    });

    document.addEventListener('crm:data-refreshed', renderContactUi);
    document.addEventListener('crm:association-created', refreshContactLinksIfOpen);
    renderContactUi();
  }
};
