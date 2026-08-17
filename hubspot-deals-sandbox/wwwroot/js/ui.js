// Generic UI helpers that are not tied to any specific CRM object.
// Import these wherever you need toasts, spinners, panel switching, or validation.

// ── Toasts ───────────────────────────────────────────────────────────────────

export function toast(message, type = 'info', duration = 3500) {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

// ── Button loading state ──────────────────────────────────────────────────────

export function setLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button._originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner-sm"></span>${button.textContent.trim()}`;
  } else {
    button.disabled = false;
    button.innerHTML = button._originalHTML || button.innerHTML;
  }
}

// ── Panel navigation ──────────────────────────────────────────────────────────

export function showPanel(panelName) {
  document.querySelectorAll('.nav-button').forEach(b => {
    b.classList.toggle('active', b.dataset.panel === panelName);
  });
  document.querySelectorAll('[id^="panel-"]').forEach(p => {
    p.classList.toggle('panel-hidden', p.id !== 'panel-' + panelName);
  });
  document.querySelectorAll('.workflow-step').forEach(s => {
    s.classList.toggle('active-step', s.dataset.step === panelName);
  });
  document.dispatchEvent(new CustomEvent('crm:panel-shown', {
    detail: { panel: panelName },
  }));
}

// ── Sidebar counters ──────────────────────────────────────────────────────────

export function updateBadges(state) {
  const counts = {
    deals: state.deals.length,
    contacts: state.contacts.length,
    companies: state.companies.length,
    defects: state.defects.length,
  };

  document.querySelectorAll('[data-module-badge]').forEach(badge => {
    badge.textContent = counts[badge.dataset.moduleBadge] ?? '0';
  });
}

// ── API result panel ──────────────────────────────────────────────────────────

export function setResult(data, ok = true) {
  document.getElementById('result').textContent = JSON.stringify(data, null, 2);
  const badge = document.getElementById('result-status');
  badge.style.display = '';
  badge.className = `result-status ${ok ? 'ok' : 'err'}`;
  badge.textContent = ok ? 'OK' : 'Error';
}

export function setError(message) {
  document.getElementById('result').textContent = message;
  const badge = document.getElementById('result-status');
  badge.style.display = '';
  badge.className = 'result-status err';
  badge.textContent = 'Error';
}

export function clearResult() {
  document.getElementById('result').textContent = '// Results will appear here…';
  document.getElementById('result-status').style.display = 'none';
}

// ── Small utilities ───────────────────────────────────────────────────────────

export function readValue(id) {
  return document.getElementById(id).value.trim();
}

export function escapeHtml(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ── Form validation ───────────────────────────────────────────────────────────

// Checks every field in the list at once and highlights all that are empty.
// Pass an optional validator for custom checks (e.g. email format).
// Returns true only when every field passes.
//
// Usage:
//   validateRequired([
//     { inputId: 'contact-email', errorId: 'err-contact-email', validator: isValidEmail },
//   ])
export function validateRequired(fields) {
  let allValid = true;

  fields.forEach(({ inputId, errorId, validator }) => {
    const input = document.getElementById(inputId);
    const err   = errorId ? document.getElementById(errorId) : null;
    const value = input.value.trim();

    let fieldValid = value.length > 0;
    let errorMessage = '';

    if (!fieldValid) {
      errorMessage = err?.dataset.required || 'This field is required.';
    } else if (validator) {
      const validatorResult = validator(value);
      if (validatorResult !== true) {
        fieldValid = false;
        errorMessage = validatorResult;
      }
    }

    input.classList.toggle('invalid', !fieldValid);
    if (err) {
      err.classList.toggle('visible', !fieldValid);
      if (!fieldValid && errorMessage) err.textContent = errorMessage;
    }

    if (!fieldValid) allValid = false;
  });

  if (!allValid) {
    const firstInvalid = fields.find(f => !document.getElementById(f.inputId).value.trim()
      || (f.validator && f.validator(document.getElementById(f.inputId).value.trim()) !== true));
    if (firstInvalid) document.getElementById(firstInvalid.inputId).focus();
  }

  return allValid;
}

const HUBSPOT_FIELD_IDS = {
  amount: ['deal-amount'],
  city: ['company-city'],
  closedate: ['deal-close-date'],
  dealname: ['deal-name'],
  dealstage: ['deal-stage'],
  domain: ['company-domain'],
  email: ['contact-email'],
  firstname: ['contact-firstname'],
  industry: ['company-industry'],
  lastname: ['contact-lastname'],
  lifecyclestage: ['contact-lifecycle'],
  name: ['company-name'],
  phone: ['contact-phone'],
  pipeline: ['deal-pipeline'],
};

const HUBSPOT_FIELD_LABELS = {
  amount: 'Amount',
  city: 'City',
  closedate: 'Close date',
  dealname: 'Deal name',
  dealstage: 'Stage',
  domain: 'Domain',
  email: 'Email',
  firstname: 'First name',
  industry: 'Industry',
  lastname: 'Last name',
  lifecyclestage: 'Lifecycle stage',
  name: 'Company name',
  phone: 'Phone',
  pipeline: 'Pipeline',
};

export function clearApiValidation(root = document) {
  root.querySelectorAll('.api-error-summary').forEach(el => el.remove());
  root.querySelectorAll('[data-api-invalid="true"]').forEach(el => {
    el.classList.remove('invalid');
    el.removeAttribute('aria-invalid');
    if (el.dataset.apiErrorTitle && el.title === el.dataset.apiErrorTitle) {
      el.removeAttribute('title');
    }
    delete el.dataset.apiInvalid;
    delete el.dataset.apiErrorTitle;
  });
  root.querySelectorAll('.field-error[data-api-error="true"]').forEach(el => {
    el.classList.remove('visible');
    if (el.classList.contains('api-field-error')) {
      el.remove();
    }
    else {
      delete el.dataset.apiError;
    }
  });
}

export function showApiValidation(error, root = getActivePanel()) {
  if (!root) return;

  clearApiValidation(root);

  const fieldErrors = Array.isArray(error.fieldErrors) ? error.fieldErrors : [];
  let firstInvalid = null;

  fieldErrors.forEach(item => {
    const fields = findFieldsForHubSpotProperty(root, item.field);
    fields.forEach(field => {
      showFieldError(field, item.message);
      firstInvalid ||= field;
    });
  });

  if (fieldErrors.length || isWriteRequest(error)) {
    renderApiErrorSummary(root, error, fieldErrors, firstInvalid);
  }

  if (firstInvalid) {
    firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
    firstInvalid.focus({ preventScroll: true });
  }
}

// Clears the invalid state from a field as the user types.
// Call once at startup to attach to the whole document.
export function initLiveValidation() {
  const clearField = e => {
    const el = e.target;
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
    el.classList.remove('invalid');
    el.removeAttribute('aria-invalid');
    if (el.dataset.apiErrorTitle && el.title === el.dataset.apiErrorTitle) {
      el.removeAttribute('title');
    }
    delete el.dataset.apiInvalid;
    delete el.dataset.apiErrorTitle;
    const err = document.getElementById('err-' + el.id);
    if (err) err.classList.remove('visible');
    el.closest('div')?.querySelectorAll('.field-error[data-api-error="true"]').forEach(errorEl => {
      errorEl.classList.remove('visible');
      if (errorEl.classList.contains('api-field-error')) {
        errorEl.remove();
      }
    });
    el.closest('.section-card, .edit-panel')?.querySelector('.api-error-summary')?.remove();
  };

  document.addEventListener('input', clearField);
  document.addEventListener('change', clearField);
  window.addEventListener('crm:api-request-start', () => clearApiValidation(getActivePanel()));
  window.addEventListener('crm:api-error', event => showApiValidation(event.detail));
}

function getActivePanel() {
  return document.querySelector('.panel-card:not(.panel-hidden)') || document;
}

function isWriteRequest(error) {
  return ['POST', 'PATCH', 'PUT'].includes(String(error.method || '').toUpperCase());
}

function renderApiErrorSummary(root, error, fieldErrors, firstInvalid) {
  const host = firstInvalid?.closest('.section-card, .edit-panel')
    || root.querySelector('.section-card')
    || root;
  const summary = document.createElement('div');
  summary.className = 'api-error-summary';
  summary.innerHTML = `
    <strong>The request was rejected.</strong>
    <span>${escapeHtml(error.message || 'Check the highlighted fields and try again.')}</span>
    ${fieldErrors.length ? `
      <ul>
        ${fieldErrors.map(item => `
          <li><b>${escapeHtml(getFieldLabel(item.field))}:</b> ${escapeHtml(item.message)}</li>
        `).join('')}
      </ul>` : ''}`;
  host.prepend(summary);
}

function showFieldError(field, message) {
  field.classList.add('invalid');
  field.dataset.apiInvalid = 'true';
  field.dataset.apiErrorTitle = message;
  field.title = message;
  field.setAttribute('aria-invalid', 'true');

  const container = field.closest('div') || field.parentElement;
  if (!container) return;

  let errorEl = field.id
    ? document.getElementById('err-' + field.id)
    : null;

  if (!errorEl || !container.contains(errorEl)) {
    errorEl = container.querySelector('.field-error[data-api-error="true"]');
  }

  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.className = 'field-error api-field-error';
    field.insertAdjacentElement('afterend', errorEl);
  }

  errorEl.dataset.apiError = 'true';
  errorEl.textContent = message;
  errorEl.classList.add('visible');
}

function findFieldsForHubSpotProperty(root, propertyName) {
  const key = String(propertyName || '').trim().toLowerCase();
  if (!key) return [];

  const selectors = [
    `[data-hubspot-field="${cssEscape(key)}"]`,
    `[data-field="${cssEscape(key)}"]`,
    ...(HUBSPOT_FIELD_IDS[key] || []).map(id => `#${cssEscape(id)}`),
  ];

  return [...new Set(selectors.flatMap(selector => [...root.querySelectorAll(selector)]))]
    .filter(el => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
}

function getFieldLabel(propertyName) {
  return HUBSPOT_FIELD_LABELS[String(propertyName || '').toLowerCase()] || propertyName;
}

function cssEscape(value) {
  return window.CSS?.escape
    ? window.CSS.escape(value)
    : String(value).replace(/["\\]/g, '\\$&');
}
