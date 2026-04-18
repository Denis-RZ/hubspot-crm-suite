// Shared inline-edit helpers used by all entity modules.
// Operates purely on DOM — no entity-specific knowledge.

export function cancelInlineEdit(id) {
  const panelRow = document.querySelector(`tr[data-edit-for="${id}"]`);
  if (!panelRow) return;
  const parentRow = panelRow.previousElementSibling;
  panelRow.remove();
  parentRow?.classList.remove('row-editing-parent');
}

export function cancelAnyOpenEdit() {
  document.querySelectorAll('tr.row-edit-panel').forEach(panelRow => {
    const parentRow = panelRow.previousElementSibling;
    panelRow.remove();
    parentRow?.classList.remove('row-editing-parent');
  });
}
