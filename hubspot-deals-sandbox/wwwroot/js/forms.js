// Form state management — tracks create/edit mode per entity and handles
// reading, filling, and clearing the three CRM forms (deal, contact, company).
// Payload builders collect only non-empty fields so the API receives clean data.

import { readValue } from './ui.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const LIFECYCLE_STAGES = [
  'subscriber', 'lead', 'marketingqualifiedlead',
  'salesqualifiedlead', 'opportunity', 'customer',
];

export function renderLifecycleOptions() {
  const select = document.getElementById('contact-lifecycle');
  select.innerHTML = '<option value="">Not set</option>' +
    LIFECYCLE_STAGES.map(v => `<option value="${v}">${v}</option>`).join('');
}

// ── CRUD mode tracking ────────────────────────────────────────────────────────

export const crudState = {
  deal:    { mode: 'create', id: null },
  contact: { mode: 'create', id: null },
  company: { mode: 'create', id: null },
};

// Text that changes when switching between create and edit mode.
const FORM_COPY = {
  deal: {
    titleId:        'deal-form-title',
    helpId:         'deal-form-help',
    saveButtonId:   'btn-save-deal',
    cancelButtonId: 'btn-cancel-deal-edit',
    createTitle:    'Create Deal',
    createHelp:     'The Stage dropdown updates when you change the Pipeline.',
    editTitle:      'Edit Deal',
    editHelp:       'Update the selected deal and save the changes back to HubSpot.',
    createButton:   'Create deal',
    editButton:     'Save changes',
  },
  contact: {
    titleId:        'contact-form-title',
    helpId:         null,
    saveButtonId:   'btn-save-contact',
    cancelButtonId: 'btn-cancel-contact-edit',
    createTitle:    'Create Contact',
    createHelp:     'Email is required — HubSpot uses it as the unique key for contacts.',
    editTitle:      'Edit Contact',
    editHelp:       'Update the selected contact and save the changes back to HubSpot.',
    createButton:   'Create contact',
    editButton:     'Save changes',
  },
  company: {
    titleId:        'company-form-title',
    helpId:         null,
    saveButtonId:   'btn-save-company',
    cancelButtonId: 'btn-cancel-company-edit',
    createTitle:    'Create Company',
    createHelp:     'Company name is the anchor. Domain, city, and industry help when browsing records.',
    editTitle:      'Edit Company',
    editHelp:       'Update the selected company and save the changes back to HubSpot.',
    createButton:   'Create company',
    editButton:     'Save changes',
  },
};

export function setFormMode(entity, mode, id = null) {
  crudState[entity].mode = mode;
  crudState[entity].id   = id;
  applyFormCopy(entity);
}

function applyFormCopy(entity) {
  const copy      = FORM_COPY[entity];
  const isEdit    = crudState[entity].mode === 'edit';
  const titleEl   = document.getElementById(copy.titleId);
  const helpEl    = copy.helpId
    ? document.getElementById(copy.helpId)
    : titleEl?.nextElementSibling;

  titleEl.textContent = isEdit ? copy.editTitle   : copy.createTitle;
  if (helpEl) helpEl.textContent = isEdit ? copy.editHelp : copy.createHelp;
  document.getElementById(copy.saveButtonId).textContent   = isEdit ? copy.editButton  : copy.createButton;
  document.getElementById(copy.cancelButtonId).classList.toggle('hidden', !isEdit);
}

// After a refresh, if the record being edited was deleted, reset to create mode.
export function syncCrudForms(state) {
  if (crudState.deal.mode    === 'edit' && !state.deals.some(d  => d.id  === crudState.deal.id))    setFormMode('deal',    'create');
  if (crudState.contact.mode === 'edit' && !state.contacts.some(c  => c.id  === crudState.contact.id)) setFormMode('contact', 'create');
  if (crudState.company.mode === 'edit' && !state.companies.some(co => co.id === crudState.company.id)) setFormMode('company', 'create');

  applyFormCopy('deal');
  applyFormCopy('contact');
  applyFormCopy('company');
}

// ── Payload builders ──────────────────────────────────────────────────────────
// Only include fields that have a value — avoids sending empty strings to HubSpot.

export function buildDealPayload() {
  const payload = {};
  if (readValue('deal-name'))     payload.dealname  = readValue('deal-name');
  if (readValue('deal-amount'))   payload.amount    = readValue('deal-amount');
  if (readValue('deal-pipeline')) payload.pipeline  = readValue('deal-pipeline');
  if (readValue('deal-stage'))    payload.dealstage = readValue('deal-stage');
  const closeDate = document.getElementById('deal-close-date').value;
  if (closeDate) payload.closedate = new Date(closeDate).toISOString();
  return payload;
}

export function buildContactPayload() {
  const payload = {};
  if (readValue('contact-firstname')) payload.firstname      = readValue('contact-firstname');
  if (readValue('contact-lastname'))  payload.lastname       = readValue('contact-lastname');
  if (readValue('contact-email'))     payload.email          = readValue('contact-email');
  if (readValue('contact-phone'))     payload.phone          = readValue('contact-phone');
  if (readValue('contact-lifecycle')) payload.lifecyclestage = readValue('contact-lifecycle');
  return payload;
}

export function buildCompanyPayload() {
  const payload = {};
  if (readValue('company-name'))     payload.name     = readValue('company-name');
  if (readValue('company-domain'))   payload.domain   = readValue('company-domain');
  if (readValue('company-city'))     payload.city     = readValue('company-city');
  if (readValue('company-industry')) payload.industry = readValue('company-industry');
  return payload;
}

// ── Fill forms from existing records (edit mode) ──────────────────────────────

function formatDateForInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function fillDealForm(deal) {
  document.getElementById('deal-name').value       = deal.properties.dealname || '';
  document.getElementById('deal-amount').value     = deal.properties.amount   || '';
  document.getElementById('deal-close-date').value = formatDateForInput(deal.properties.closedate);
  // Pipeline/stage dropdowns are rendered separately by app.js with the right selection.
}

export function fillContactForm(contact) {
  document.getElementById('contact-firstname').value = contact.properties.firstname      || '';
  document.getElementById('contact-lastname').value  = contact.properties.lastname       || '';
  document.getElementById('contact-email').value     = contact.properties.email          || '';
  document.getElementById('contact-phone').value     = contact.properties.phone          || '';
  document.getElementById('contact-lifecycle').value = contact.properties.lifecyclestage || '';
}

export function fillCompanyForm(company) {
  document.getElementById('company-name').value     = company.properties.name     || '';
  document.getElementById('company-domain').value   = company.properties.domain   || '';
  document.getElementById('company-city').value     = company.properties.city     || '';
  document.getElementById('company-industry').value = company.properties.industry || '';
}

// ── Clear forms (reset to empty / create mode) ────────────────────────────────

export function clearDealForm() {
  document.getElementById('deal-name').value       = '';
  document.getElementById('deal-amount').value     = '';
  document.getElementById('deal-close-date').value = '';
  // Pipeline/stage dropdowns are re-rendered by app.js after clearing.
}

export function clearContactForm() {
  ['contact-firstname', 'contact-lastname', 'contact-email', 'contact-phone'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('contact-lifecycle').value = '';
}

export function clearCompanyForm() {
  ['company-name', 'company-domain', 'company-city'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('company-industry').value = '';
}
