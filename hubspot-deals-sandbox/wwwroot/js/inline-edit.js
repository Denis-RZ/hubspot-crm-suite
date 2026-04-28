// Shared inline-edit helpers used by all entity modules.
// Operates purely on DOM — no entity-specific knowledge.

function clearPanelParentState(parentRow) {
  if (!parentRow) return;
  parentRow.classList.remove('row-editing-parent', 'row-links-parent');
  const toggle = parentRow.querySelector('.row-expand-toggle.open');
  if (toggle) {
    toggle.textContent = '▶';
    toggle.classList.remove('open');
  }
}

export function cancelInlineEdit(id) {
  const panelRow = document.querySelector(`tr[data-edit-for="${id}"]`);
  if (!panelRow) return;
  const parentRow = panelRow.previousElementSibling;
  panelRow.remove();
  clearPanelParentState(parentRow);
}

export function cancelAnyOpenEdit() {
  document.querySelectorAll('tr.row-edit-panel').forEach(panelRow => {
    const parentRow = panelRow.previousElementSibling;
    panelRow.remove();
    clearPanelParentState(parentRow);
  });
}
