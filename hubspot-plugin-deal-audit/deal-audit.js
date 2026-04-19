import { apiFetch, normalizeApiError } from '../api.js';
import { setError, setLoading, setResult, toast } from '../ui.js';

let lastReport = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function severityClass(severity) {
  if (severity === 'high') return 'filter-active';
  if (severity === 'clean') return 'success';
  return '';
}

function issueText(row) {
  if (!row.issues?.length) return '<span style="color:var(--success)">Clean</span>';
  return row.issues.map(issue => `
    <span title="${escapeHtml(issue.description)}">${escapeHtml(issue.label)}</span>
  `).join('<br>');
}

function renderSummary(container, report) {
  const summary = report.summary;
  container.querySelector('[data-audit-summary]').innerHTML = `
    <div class="audit-metrics">
      <div class="audit-metric">
        <strong>${summary.dealsScanned}</strong>
        <span>Deals scanned</span>
      </div>
      <div class="audit-metric">
        <strong>${summary.averageScore}</strong>
        <span>Average score</span>
      </div>
      <div class="audit-metric">
        <strong>${summary.highRiskDeals}</strong>
        <span>High risk</span>
      </div>
      <div class="audit-metric">
        <strong>${summary.cleanDeals}</strong>
        <span>Clean deals</span>
      </div>
    </div>
    <div class="audit-breakdown">
      <span>Missing contacts: <strong>${summary.missingContacts}</strong></span>
      <span>Missing companies: <strong>${summary.missingCompanies}</strong></span>
      <span>Missing amount: <strong>${summary.missingAmount}</strong></span>
      <span>Missing close date: <strong>${summary.missingCloseDate}</strong></span>
    </div>`;
}

function renderRows(container, rows) {
  const body = container.querySelector('[data-audit-body]');
  const count = container.querySelector('[data-audit-count]');

  count.textContent = `${rows.length} audited`;
  count.className = rows.some(row => row.severity === 'high') ? 'pill filter-active' : 'pill success';

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <div class="icon">QA</div>
      <p>No deals returned by HubSpot for this audit limit.</p>
    </div></td></tr>`;
    return;
  }

  body.innerHTML = rows.map(row => `
    <tr>
      <td>
        <strong>${escapeHtml(row.name)}</strong>
        <div class="mono">${escapeHtml(row.id)}</div>
      </td>
      <td>${escapeHtml(row.stage || '-')}</td>
      <td>${escapeHtml(row.amount || '-')}</td>
      <td>${escapeHtml(row.closeDate || '-')}</td>
      <td>${row.contactCount}</td>
      <td>${row.companyCount}</td>
      <td><span class="pill ${severityClass(row.severity)}">${row.score}</span></td>
      <td style="line-height:1.7">${issueText(row)}</td>
    </tr>`).join('');
}

async function runAudit(container, button) {
  const limit = container.querySelector('[data-audit-limit]').value || '100';
  setLoading(button, true);

  try {
    const report = await apiFetch(`/api/plugin/deal-audit/run?limit=${encodeURIComponent(limit)}`);
    lastReport = report;
    renderSummary(container, report);
    renderRows(container, report.rows);
    container.querySelector('[data-audit-export]').disabled = false;
    setResult({
      message: 'Deal quality audit complete.',
      summary: report.summary,
    });
    toast('Deal quality audit complete', 'success');
  }
  catch (error) {
    const message = normalizeApiError(error);
    setError(message);
    toast('Audit failed: ' + message, 'error');
  }
  finally {
    setLoading(button, false);
  }
}

function downloadCsv(payload) {
  const blob = new Blob([`\uFEFF${payload.csv}`], { type: payload.contentType || 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = payload.fileName || 'deal-quality-audit.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportAudit(container, button) {
  const limit = container.querySelector('[data-audit-limit]').value || '100';
  setLoading(button, true);

  try {
    const payload = await apiFetch(`/api/plugin/deal-audit/export?limit=${encodeURIComponent(limit)}`);
    downloadCsv(payload);
    toast('Audit CSV downloaded', 'success');
  }
  catch (error) {
    toast('CSV export failed: ' + normalizeApiError(error), 'error');
  }
  finally {
    setLoading(button, false);
  }
}

export default {
  id: 'deal-audit',
  label: 'Audit',
  navOrder: 80,

  renderNav() {
    return `<button class="nav-button" data-panel="deal-audit">Audit <span class="nav-badge">QA</span></button>`;
  },

  renderPanel() {
    return `
      <style>
        #panel-deal-audit .audit-metrics {
          display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px;
        }
        #panel-deal-audit .audit-metric {
          padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: #fff;
        }
        #panel-deal-audit .audit-metric strong {
          display: block; font-size: 24px; line-height: 1; color: var(--accent-deep);
        }
        #panel-deal-audit .audit-metric span {
          display: block; margin-top: 6px; color: var(--muted); font-size: 12px; font-weight: 700;
        }
        #panel-deal-audit .audit-breakdown {
          display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;
          color: var(--muted); font-size: 13px;
        }
        #panel-deal-audit .audit-breakdown span {
          padding: 6px 9px; border-radius: 999px; background: rgba(23,32,51,.06);
        }
        @media (max-width: 980px) {
          #panel-deal-audit .audit-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      </style>
      <section id="panel-deal-audit" class="panel-card panel-hidden">
        <div class="panel-header">
          <div>
            <h2>Deal Quality Audit</h2>
            <p>Scans HubSpot deals for missing CRM hygiene signals: contacts, companies,
               amount, close date, pipeline, stage, and stale open deals.</p>
          </div>
          <div class="sub-badge">Plugin module</div>
        </div>

        <div class="grid-2">
          <article class="section-card">
            <h3>Run Audit</h3>
            <p>This plugin calls HubSpot from its own DLL through the generic plugin dispatcher.</p>
            <div class="form-grid">
              <div>
                <label for="deal-audit-limit">Deal scan limit</label>
                <select id="deal-audit-limit" data-audit-limit>
                  <option value="50">50 deals</option>
                  <option value="100" selected>100 deals</option>
                  <option value="250">250 deals</option>
                </select>
              </div>
            </div>
            <div class="actions">
              <button class="button button-primary" data-audit-run>Run audit</button>
              <button class="button button-secondary" data-audit-export disabled>Export CSV</button>
            </div>
            <div class="helper">Audit rules combine deal properties with HubSpot association records.</div>
          </article>

          <article class="section-card">
            <h3>Summary</h3>
            <div data-audit-summary>
              <div class="empty-note">Run the audit to calculate CRM data quality.</div>
            </div>
          </article>
        </div>

        <article class="table-card" style="margin-top:18px">
          <div class="table-toolbar">
            <div>
              <h3>Audit Findings</h3>
              <p>Rows are sorted by risk, then score.</p>
            </div>
            <span class="pill" data-audit-count>No audit yet</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Stage</th>
                  <th>Amount</th>
                  <th>Close Date</th>
                  <th>Contacts</th>
                  <th>Companies</th>
                  <th>Score</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody data-audit-body>
                <tr><td colspan="8"><div class="empty-state">
                  <div class="icon">QA</div>
                  <p>Run the audit to inspect deal quality.</p>
                </div></td></tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>`;
  },

  mount(container) {
    container.querySelector('[data-audit-run]')?.addEventListener('click', event =>
      runAudit(container, event.currentTarget));

    container.querySelector('[data-audit-export]')?.addEventListener('click', event =>
      exportAudit(container, event.currentTarget));

    if (lastReport) {
      renderSummary(container, lastReport);
      renderRows(container, lastReport.rows);
      container.querySelector('[data-audit-export]').disabled = false;
    }
  },
};
