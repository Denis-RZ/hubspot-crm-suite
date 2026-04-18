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
}

// ── Sidebar counters ──────────────────────────────────────────────────────────

export function updateBadges(state) {
  document.getElementById('badge-deals').textContent     = state.deals.length     || '0';
  document.getElementById('badge-contacts').textContent  = state.contacts.length  || '0';
  document.getElementById('badge-companies').textContent = state.companies.length || '0';
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

// Clears the invalid state from a field as the user types.
// Call once at startup to attach to the whole document.
export function initLiveValidation() {
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
    el.classList.remove('invalid');
    const err = document.getElementById('err-' + el.id);
    if (err) err.classList.remove('visible');
  });
}
