// CSV constants, parsing, serialisation, and per-row validation.
// No DOM access here — pure data logic that can be tested in isolation.

// ── Constants ─────────────────────────────────────────────────────────────────

export const INDUSTRY_OPTIONS = [
  { value: 'ACCOUNTING',                          label: 'Accounting' },
  { value: 'AIRLINES_AVIATION',                   label: 'Airlines / Aviation' },
  { value: 'AUTOMOTIVE',                          label: 'Automotive' },
  { value: 'BANKING',                             label: 'Banking' },
  { value: 'BIOTECHNOLOGY',                       label: 'Biotechnology' },
  { value: 'BROADCAST_MEDIA',                     label: 'Broadcast Media' },
  { value: 'COMPUTER_HARDWARE',                   label: 'Computer Hardware' },
  { value: 'COMPUTER_NETWORKING',                 label: 'Computer Networking' },
  { value: 'COMPUTER_SOFTWARE',                   label: 'Computer Software' },
  { value: 'CONSTRUCTION',                        label: 'Construction' },
  { value: 'CONSUMER_ELECTRONICS',                label: 'Consumer Electronics' },
  { value: 'CONSUMER_GOODS',                      label: 'Consumer Goods' },
  { value: 'EDUCATION_MANAGEMENT',                label: 'Education Management' },
  { value: 'ELECTRICAL_ELECTRONIC_MANUFACTURING', label: 'Electrical / Electronic Manufacturing' },
  { value: 'ENTERTAINMENT',                       label: 'Entertainment' },
  { value: 'FINANCIAL_SERVICES',                  label: 'Financial Services' },
  { value: 'FOOD_BEVERAGES',                      label: 'Food & Beverages' },
  { value: 'HEALTH_WELLNESS_FITNESS',             label: 'Health, Wellness & Fitness' },
  { value: 'HOSPITAL_HEALTH_CARE',                label: 'Hospital & Health Care' },
  { value: 'HOSPITALITY',                         label: 'Hospitality' },
  { value: 'INFORMATION_TECHNOLOGY_SERVICES',     label: 'Information Technology & Services' },
  { value: 'INSURANCE',                           label: 'Insurance' },
  { value: 'INTERNET',                            label: 'Internet' },
  { value: 'INVESTMENT_MANAGEMENT',               label: 'Investment Management' },
  { value: 'LEGAL_SERVICES',                      label: 'Legal Services' },
  { value: 'LOGISTICS_SUPPLY_CHAIN',              label: 'Logistics & Supply Chain' },
  { value: 'MANAGEMENT_CONSULTING',               label: 'Management Consulting' },
  { value: 'MARKETING_ADVERTISING',               label: 'Marketing & Advertising' },
  { value: 'MECHANICAL_OR_INDUSTRIAL_ENGINEERING',label: 'Mechanical / Industrial Engineering' },
  { value: 'MEDICAL_DEVICES',                     label: 'Medical Devices' },
  { value: 'PHARMACEUTICALS',                     label: 'Pharmaceuticals' },
  { value: 'REAL_ESTATE',                         label: 'Real Estate' },
  { value: 'RETAIL',                              label: 'Retail' },
  { value: 'SEMICONDUCTORS',                      label: 'Semiconductors' },
  { value: 'TELECOMMUNICATIONS',                  label: 'Telecommunications' },
  { value: 'TRANSPORTATION_TRUCKING_RAILROAD',    label: 'Transportation / Trucking / Railroad' },
  { value: 'UTILITIES',                           label: 'Utilities' },
  { value: 'WHOLESALE',                           label: 'Wholesale' },
];

// Columns included in exports and expected in imports, per object type.
export const CSV_COLUMNS = {
  deals:     ['record_id', 'dealname', 'amount', 'dealstage', 'pipeline', 'closedate'],
  contacts:  ['record_id', 'firstname', 'lastname', 'email', 'phone', 'lifecyclestage'],
  companies: ['record_id', 'name', 'domain', 'city', 'industry'],
};

// ── Parsing ───────────────────────────────────────────────────────────────────

// Splits a single CSV line respecting quoted fields and escaped quotes ("").
function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = splitCsvLine(lines[i]);
    const row  = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

// ── Serialisation ─────────────────────────────────────────────────────────────

function csvQuote(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replaceAll('"', '""')}"` : s;
}

export function buildCsvRow(values) {
  return values.map(csvQuote).join(',');
}

// ── Per-row validation ────────────────────────────────────────────────────────

// Validates a single parsed CSV row against HubSpot rules and the live pipeline list.
// Returns a structured result used by the import preview table.
export function validateImportRow(rawRow, objectType, rowNumber, state) {
  const errors   = [];
  const warnings = [];
  const recordId = rawRow.record_id || '';

  if (recordId) {
    warnings.push('record_id is set — updates are not supported in this sandbox. Row will be skipped.');
    return { rowNumber, action: 'skip', recordId, status: 'Skip', errors, warnings, rawRow };
  }

  if (objectType === 'deals') {
    if (!rawRow.dealname) {
      errors.push('dealname is required.');
    }
    if (rawRow.amount && isNaN(parseFloat(rawRow.amount))) {
      errors.push('amount must be a number.');
    }
    if (rawRow.closedate && isNaN(Date.parse(rawRow.closedate))) {
      errors.push('closedate must be a valid ISO date (e.g. 2025-12-31).');
    }
    if (rawRow.pipeline) {
      const pipeline = state.pipelines.find(p => p.id === rawRow.pipeline);
      if (!pipeline) {
        errors.push(`pipeline "${rawRow.pipeline}" does not exist in HubSpot.`);
      } else if (rawRow.dealstage && !pipeline.stages.find(s => s.id === rawRow.dealstage)) {
        errors.push(`dealstage "${rawRow.dealstage}" not found in pipeline "${rawRow.pipeline}".`);
      }
    }
  }

  if (objectType === 'contacts') {
    if (!rawRow.email) {
      errors.push('email is required.');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawRow.email)) {
      errors.push('email format is invalid.');
    }
  }

  if (objectType === 'companies') {
    if (!rawRow.name) {
      errors.push('name is required.');
    }
    if (rawRow.industry && !INDUSTRY_OPTIONS.find(o => o.value === rawRow.industry)) {
      warnings.push(`"${rawRow.industry}" is not a standard HubSpot industry value.`);
    }
  }

  const status = errors.length ? 'Error' : 'Ready';
  return { rowNumber, action: 'create', recordId: '', status, errors, warnings, rawRow };
}
