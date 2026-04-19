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
  renderContactFilterOptions,
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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || 'Enter a valid email address.';
}

function resetContactForm() {
  clearContactForm();
  setFormMode('contact', 'create');
}

function renderContactUi() {
  syncCrudForms(state);
  renderLifecycleOptions();
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

  if (!confirm(`Delete contact "${label}"? This writes to the live HubSpot sandbox.`)) {
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
    renderContactRowEdit(row, contact);
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

export default {
  id: 'contacts',
  label: 'Contacts',
  navOrder: 2,
  renderNav() {
    return `
      <button class="nav-button" data-panel="contacts">
        Contacts <span class="nav-badge" data-module-badge="contacts">...</span>
      </button>`;
  },
  renderPanel() {
    return `
      <section id="panel-contacts" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Contacts</h2>
            <p>Contacts are people. Create the person before linking a deal to them.</p>
          </div>
          <div class="sub-badge">Create person before linking</div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3 id="contact-form-title">Create Contact</h3>
            <p>Email is required - HubSpot uses it as the unique key for contacts.</p>
            <div class="form-grid cols-2">
              <div>
                <label for="contact-firstname">First name</label>
                <input id="contact-firstname" type="text" placeholder="Alice">
              </div>
              <div>
                <label for="contact-lastname">Last name</label>
                <input id="contact-lastname" type="text" placeholder="Chen">
              </div>
              <div>
                <label for="contact-email">Email <span class="label-hint">required</span></label>
                <input id="contact-email" type="email" placeholder="alice@example.com">
                <div class="field-error" id="err-contact-email">Email is required.</div>
              </div>
              <div>
                <label for="contact-phone">Phone</label>
                <input id="contact-phone" type="text" placeholder="+886-900-000-000">
              </div>
              <div>
                <label for="contact-lifecycle">Lifecycle stage</label>
                <select id="contact-lifecycle"></select>
              </div>
            </div>
            <div class="actions">
              <button id="btn-save-contact" class="button button-primary">Create contact</button>
              <button id="btn-cancel-contact-edit" class="button button-secondary hidden">Cancel edit</button>
            </div>
          </article>

          <article class="table-card">
            <div class="table-toolbar">
              <div>
                <h3>Contact Records</h3>
                <p>Use "Use in Links" to pre-select for association.</p>
              </div>
              <span id="contact-count" class="pill">0 contacts</span>
            </div>
            <div class="table-filters">
              <input id="filter-contact-name" class="filter-input" type="search" placeholder="Search by name or email...">
              <select id="filter-contact-lifecycle" class="filter-select"><option value="">All stages</option></select>
              <button id="btn-clear-contact-filters" class="filter-clear">Clear</button>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Phone</th><th>Lifecycle</th><th>Actions</th></tr>
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
    renderContactUi();
  }
};
