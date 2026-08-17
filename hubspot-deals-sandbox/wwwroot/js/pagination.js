export const PAGE_SIZES = [5, 10, 20, 50];

const pages = {};
const sizes = {};

export const getPage = key => pages[key] ?? 1;
export const setPage = (key, page) => { pages[key] = page; };
export const resetPage = key => { pages[key] = 1; };
export const getPageSize = key => sizes[key] ?? 10;
export const setPageSize = (key, size) => { sizes[key] = Number(size); };

export function paginate(records, page, pageSize) {
  const start = (page - 1) * pageSize;
  return records.slice(start, start + pageSize);
}

export function totalPages(count, pageSize) {
  return Math.max(1, Math.ceil(count / pageSize));
}

export function clampPage(key, count) {
  const pageSize = getPageSize(key);
  const max = totalPages(count, pageSize);
  if ((pages[key] ?? 1) > max) pages[key] = max;
  return pages[key] ?? 1;
}

export function renderPaginator(containerId, total, currentPage, pageKey) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const pageSize = getPageSize(pageKey);
  const maxPage = totalPages(total, pageSize);

  const navHtml = maxPage > 1 ? `
    <button class="page-btn" data-action="goto-page" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>←</button>
    <span class="page-info">${currentPage} / ${maxPage}</span>
    <button class="page-btn" data-action="goto-page" data-page="${currentPage + 1}" ${currentPage >= maxPage ? 'disabled' : ''}>→</button>` : '';

  // <option> can only hold text, so it can't use the <span class="zh">
  // toggle other elements use - show both languages together here since
  // it's a small, low-conflict control (a page-size number).
  const sizeOptions = PAGE_SIZES.map(s =>
    `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s} per page · 每頁 ${s} 筆</option>`
  ).join('');

  el.innerHTML = `
    <div class="paginator">
      <div class="paginator-nav">${navHtml}</div>
      <select class="page-size-select" data-action="change-page-size" data-page-key="${pageKey}">${sizeOptions}</select>
    </div>`;
}
