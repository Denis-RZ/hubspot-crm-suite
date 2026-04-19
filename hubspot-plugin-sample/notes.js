import { apiFetch, normalizeApiError } from '../api.js';
import { toast } from '../ui.js';

async function loadNotes() {
  const notes = await apiFetch('/api/plugin/notes/list');
  const list = document.getElementById('notes-list');
  if (!list) return;
  if (notes.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);padding:4px 0">No notes yet.</p>';
    return;
  }
  list.innerHTML = notes.map(n => `
    <div class="note-item">
      <span>${escapeHtml(n.text)}</span>
      <button class="note-delete" data-action="delete-note" data-id="${n.id}" title="Delete">✕</button>
    </div>`).join('');
}

async function addNote(button) {
  const input = document.getElementById('notes-input');
  const text = input?.value.trim();
  if (!text) { input?.focus(); return; }
  try {
    await apiFetch('/api/plugin/notes/add', 'POST', { text });
    input.value = '';
    await loadNotes();
    toast('Note saved!', 'success');
  } catch (e) {
    toast(normalizeApiError(e), 'error');
  }
}

async function deleteNote(id) {
  try {
    await apiFetch(`/api/plugin/notes/delete/${id}`, 'DELETE');
    await loadNotes();
  } catch (e) {
    toast(normalizeApiError(e), 'error');
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export default {
  id: 'notes',
  label: 'Notes',
  navOrder: 90,

  renderNav() {
    return `<button class="nav-button" data-panel="notes">Notes</button>`;
  },

  renderPanel() {
    return `
      <section id="panel-notes" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Notes</h2>
            <p>A sample plugin loaded dynamically from a ZIP file — no recompile needed.</p>
          </div>
          <div class="sub-badge">Dynamic plugin</div>
        </div>
        <div class="grid-2">
          <article class="section-card">
            <h3>Add Note</h3>
            <p>Notes are stored in memory and cleared on server restart.</p>
            <textarea id="notes-input" rows="4" placeholder="Write a note..."
              style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line);
                     border-radius:10px;font:inherit;resize:vertical;margin-bottom:12px"></textarea>
            <div class="actions">
              <button id="btn-add-note" class="button button-primary">Save note</button>
            </div>
          </article>
          <article class="table-card">
            <div class="table-toolbar">
              <div><h3>Saved Notes</h3></div>
            </div>
            <div style="padding:14px 18px 18px" id="notes-list"></div>
          </article>
        </div>
      </section>`;
  },

  mount(container) {
    container.querySelector('#btn-add-note')?.addEventListener('click', e => addNote(e.currentTarget));
    container.addEventListener('click', e => {
      const btn = e.target.closest('button[data-action="delete-note"]');
      if (btn) deleteNote(btn.dataset.id);
    });
    loadNotes();
  }
};
