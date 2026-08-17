import { apiFetch, normalizeApiError } from './api.js';
import { state } from './state.js';
import { escapeHtml, setError, setResult, toast } from './ui.js';

let _src = null; // { type: 'deal'|'contact'|'company', id, name }

const backdrop    = () => document.getElementById('associate-modal');
const typeSelector = () => document.getElementById('assoc-type-selector');
const recordSelect = () => document.getElementById('associate-record-select');
const recordLabel  = () => document.getElementById('associate-record-label');
const resultEl     = () => document.getElementById('associate-modal-result');
const confirmBtn   = () => document.getElementById('btn-associate-confirm');

function selectedType() {
  return document.querySelector('input[name="assoc-type"]:checked')?.value ?? null;
}

function selectedRecordLabel() {
  return recordSelect().selectedOptions[0]?.textContent?.trim() || recordSelect().value;
}

function associationSingular(objectType) {
  return objectType === 'contacts' ? 'contact' : 'company';
}

function populateSelect(records, labelFn) {
  const sel = recordSelect();
  if (!records.length) {
    sel.innerHTML = '<option disabled value="">— no records available —</option>';
    confirmBtn().disabled = true;
    return;
  }
  confirmBtn().disabled = false;
  sel.innerHTML = records
    .map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(labelFn(r))}</option>`)
    .join('');
}

function refreshList(type) {
  if (type === 'contacts') {
    recordLabel().textContent = 'Contact';
    populateSelect(state.contacts, c => {
      const name = [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ')
        || c.properties.email || c.id;
      return `${name} [${c.id}]`;
    });
  } else if (type === 'companies') {
    recordLabel().textContent = 'Company';
    populateSelect(state.companies, c => `${c.properties.name || c.id} [${c.id}]`);
  } else {
    recordLabel().textContent = 'Deal';
    populateSelect(state.deals, d => {
      const stage = d.properties.dealstage ? ` · ${d.properties.dealstage}` : '';
      return `${d.properties.dealname || d.id}${stage} [${d.id}]`;
    });
  }
}

export function openAssociateModal(sourceType, sourceId, sourceName, preferredType = null) {
  _src = { type: sourceType, id: sourceId, name: sourceName };

  document.getElementById('associate-modal-title').textContent = `Associate: ${sourceName}`;
  resultEl().textContent = '';
  resultEl().style.display = 'none';
  confirmBtn().disabled = false;

  if (sourceType === 'deal') {
    typeSelector().style.display = '';
    const preferred = preferredType === 'companies' ? 'companies' : 'contacts';
    const input = typeSelector().querySelector(`input[name="assoc-type"][value="${preferred}"]`)
      ?? typeSelector().querySelector('input[name="assoc-type"]');
    if (input) input.checked = true;
    refreshList(selectedType() ?? preferred);
  } else {
    typeSelector().style.display = 'none';
    refreshList('deals');
  }

  document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
  backdrop().removeAttribute('hidden');
  recordSelect().focus();
}

function closeModal() {
  backdrop().setAttribute('hidden', '');
  _src = null;
}

async function doAssociate() {
  const btn = confirmBtn();
  btn.disabled = true;
  resultEl().style.display = 'none';

  let dealId, objectType, objectId;

  if (_src.type === 'deal') {
    dealId = _src.id;
    objectType = selectedType() ?? 'contacts';
    objectId = recordSelect().value;
  } else {
    dealId = recordSelect().value;
    objectType = _src.type === 'contact' ? 'contacts' : 'companies';
    objectId = _src.id;
  }

  if (!objectId || !dealId) {
    resultEl().textContent = 'Select a record first.';
    resultEl().style.color = 'var(--danger)';
    resultEl().style.display = '';
    btn.disabled = false;
    return;
  }

  try {
    const dealName = _src.type === 'deal' ? _src.name : selectedRecordLabel();
    const objectName = _src.type === 'deal' ? selectedRecordLabel() : _src.name;
    const singular = associationSingular(objectType);
    const res = await apiFetch('/api/associate', 'POST', { dealId, objectType, objectId });
    resultEl().textContent = `✓ Linked deal to ${singular}.`;
    resultEl().style.color = 'var(--accent)';
    resultEl().style.display = '';
    setResult({
      message: `Linked deal "${dealName}" to ${singular} "${objectName}".`,
      impact: 'The store now has an association between the two existing records. No fields were copied and no duplicate record was created.',
      request: { dealId, objectType, objectId },
      result: res,
    });
    toast(`Linked deal to ${singular}`, 'success');
    document.dispatchEvent(new CustomEvent('crm:association-created', {
      detail: { dealId, dealName, objectType, objectId, objectName },
    }));
    setTimeout(closeModal, 1000);
  } catch (error) {
    const msg = normalizeApiError(error);
    resultEl().textContent = 'Failed: ' + msg;
    resultEl().style.color = 'var(--danger)';
    resultEl().style.display = '';
    setError(msg);
    btn.disabled = false;
  }
}

export function initAssociateModal() {
  document.getElementById('associate-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('btn-associate-cancel')?.addEventListener('click', closeModal);
  document.getElementById('btn-associate-confirm')?.addEventListener('click', doAssociate);
  backdrop()?.addEventListener('click', e => { if (e.target === backdrop()) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !backdrop()?.hasAttribute('hidden')) closeModal();
  });
  typeSelector()?.addEventListener('change', () => refreshList(selectedType() ?? 'contacts'));
}
