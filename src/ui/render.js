/**
 * Render functions for PSAR OHS Checklist Suite.
 * Each function returns an HTML string for injection into #view-root.
 */

/* ===== Landing Page ===== */

export function renderLanding() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  return `
    <div class="landing">
      <div class="landing-brand">
        <img class="landing-logo" src="./assets/psar_logo.png" alt="Parkland Search & Rescue">
        <h1>PSAR OHS Checklist Suite</h1>
        <p class="subtle">Safety checklists for Search & Rescue</p>
      </div>
      <div class="landing-actions">
        <button class="btn btn-accent btn-block" data-action="open-checklist" data-id="vehicle_safety_check">
          Vehicle Safety Check
        </button>
        <button class="btn btn-block btn-future" disabled>
          Trailer Safety Check
        </button>
        <button class="btn btn-block btn-future" disabled>
          Annual PFD Buoyancy Check
        </button>
        <button class="btn btn-block btn-future" disabled>
          Annual Technical Rope Gear Check
        </button>
      </div>
      <div class="landing-bottom">
        <div class="landing-meta">
          <img class="qr-code" src="./assets/PSAR_OHS_Checklist_Suite_QR.png" alt="App QR Code" width="44" height="44" role="button" tabindex="0" data-action="show-qr">
          <button class="btn btn-sm" data-action="toggle-theme">${theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</button>
        </div>
      </div>
    </div>`;
}


/* ===== Checklist Page ===== */

export function renderChecklist(config, state) {
  if (!config) return '<div class="panel"><p>Error loading checklist configuration.</p></div>';

  const sections = config.sections;
  const allInsp = getAllInspectionIds(sections);
  const completed = allInsp.filter(id => state.items[id]).length;

  let html = `
    <div class="checklist-header">
      <div class="checklist-title-area">
        <h2 class="checklist-title">${esc(config.title)}</h2>
        <span class="overall-progress badge">${completed}/${allInsp.length}</span>
      </div>
      ${config.subtitle ? `<p class="subtle checklist-subtitle">${esc(config.subtitle)}</p>` : ''}
      <div class="row between align-center gap-sm checklist-controls">
        <div class="row gap-sm">
          <button class="btn btn-xs" data-action="back">&larr; Back</button>
          <button class="btn btn-xs" data-action="expand-all">Expand All</button>
          <button class="btn btn-xs" data-action="collapse-all">Collapse All</button>
        </div>
        <div id="connectivity-pill" class="connectivity-pill online">Online</div>
      </div>
    </div>`;

  // Header fields (date, inspector, vehicle info)
  html += renderHeaderFields(config, state);

  // Inspection sections
  for (const [sectionId, section] of Object.entries(sections)) {
    const isCollapsed = state.collapsedSections.includes(sectionId);
    const items = section.items || {};
    const inspIds = Object.entries(items).filter(([_, i]) => i.type === 'inspection').map(([id]) => id);
    const sectionDone = inspIds.filter(id => state.items[id]).length;

    html += `
      <section class="checklist-section">
        <div class="section-header" data-action="toggle-section" data-section="${sectionId}">
          <h3>${esc(section.title)}</h3>
          <span class="section-progress badge-sm">${sectionDone}/${inspIds.length}</span>
          <span class="section-chevron${isCollapsed ? ' rotated' : ''}">&#9660;</span>
        </div>
        <div class="section-body${isCollapsed ? ' collapsed' : ''}" data-section-body="${sectionId}">`;

    for (const [itemId, item] of Object.entries(items)) {
      html += renderItem(itemId, item, state);
    }

    html += `
        </div>
      </section>`;
  }

  // Conclusion section
  html += renderConclusionSection(config, state);

  // Footer actions
  html += `
    <div class="checklist-footer">
      <button class="btn btn-accent btn-block" data-action="generate-report">Generate Report / Share PDF</button>
      <button class="btn btn-danger btn-sm" data-action="reset">Reset Checklist</button>
    </div>`;

  return html;
}


/* ---- Header fields ---- */

function renderHeaderFields(config, state) {
  const fields = config.header_fields;
  if (!fields) return '';

  let html = '<div class="header-fields-card"><div class="header-fields-grid">';
  for (const [id, field] of Object.entries(fields)) {
    const value = state.fields[id] || '';
    const inputType = field.type === 'date' ? 'date' : 'text';
    html += `
      <div class="field-item">
        <label class="field-label">${esc(field.label)}</label>
        <input type="${inputType}" data-field="${id}" value="${escAttr(value)}" placeholder="${escAttr(field.placeholder || '')}">
      </div>`;
  }
  html += '</div></div>';
  return html;
}


/* ---- Item renderers ---- */

function renderItem(id, item, state) {
  if (item.type === 'inspection') return renderInspection(id, item, state);
  if (item.type === 'text') return renderTextField(id, item, state);
  return '';
}

function renderInspection(id, item, state) {
  const status = state.items[id] || '';
  const notes = state.notes[id] || '';
  const okActive = status === 'ok' ? ' active' : '';
  const naActive = status === 'na' ? ' active' : '';
  const hasNotes = notes ? ' has-notes' : '';
  const notesVisible = notes ? '' : ' hidden';

  return `
    <div class="inspection-item">
      <div class="inspection-row">
        <span class="inspection-label">${esc(item.label)}${item.helper ? `<span class="helper-text">${esc(item.helper)}</span>` : ''}</span>
        <div class="inspection-actions">
          <button class="status-btn ok-btn${okActive}" data-action="set-status" data-item="${id}" data-status="ok">OK</button>
          <button class="status-btn na-btn${naActive}" data-action="set-status" data-item="${id}" data-status="na">N/A</button>
          <button class="notes-toggle${hasNotes}" data-action="toggle-item-notes" data-item="${id}">+ Notes</button>
        </div>
      </div>
      <div class="inspection-notes${notesVisible}" data-notes-for="${id}">
        <input type="text" data-item-notes="${id}" value="${escAttr(notes)}" placeholder="Notes / details...">
      </div>
    </div>`;
}

function renderTextField(id, item, state) {
  const value = state.fields[id] || '';
  return `
    <div class="field-item">
      <label class="field-label">${esc(item.label)}${item.helper ? `<span class="helper-text">${esc(item.helper)}</span>` : ''}</label>
      <input type="text" data-field="${id}" value="${escAttr(value)}" placeholder="${escAttr(item.placeholder || '')}">
    </div>`;
}


/* ---- Conclusion section ---- */

function renderConclusionSection(config, state) {
  const conc = config.conclusion;
  if (!conc) return '';

  const concState = state.conclusion || {};
  let html = '<div class="conclusion-section"><h3>Conclusion</h3>';

  // Overall status radio
  if (conc.overall_status) {
    const selected = concState.overall_status || '';
    const options = conc.overall_status.options || [];
    html += `<div class="field-item"><label class="field-label">${esc(conc.overall_status.label)}</label><div class="radio-group">`;
    for (const opt of options) {
      const checked = selected === opt ? 'checked' : '';
      let cls = 'safe';
      if (opt.includes('DEFECT')) cls = 'warning';
      if (opt.includes('DO NOT')) cls = 'danger-opt';
      html += `
        <label class="radio-option ${cls}">
          <input type="radio" name="overall_status" data-conclusion="overall_status" value="${escAttr(opt)}" ${checked}>
          <span>${esc(opt)}</span>
        </label>`;
    }
    html += '</div></div>';
  }

  // Comments textarea
  if (conc.comments) {
    const val = concState.comments || '';
    html += `
      <div class="field-item">
        <label class="field-label">${esc(conc.comments.label)}</label>
        <textarea data-conclusion="comments" placeholder="${escAttr(conc.comments.placeholder || '')}">${esc(val)}</textarea>
      </div>`;
  }

  // Signature fields
  html += '<div class="sig-grid">';

  if (conc.inspector_signature) {
    html += `
      <div class="field-item">
        <label class="field-label">${esc(conc.inspector_signature.label)}</label>
        <input type="text" data-conclusion="inspector_signature" value="${escAttr(concState.inspector_signature || '')}" placeholder="${escAttr(conc.inspector_signature.placeholder || '')}">
      </div>`;
  }
  if (conc.inspector_sign_date) {
    html += `
      <div class="field-item">
        <label class="field-label">Date</label>
        <input type="date" data-conclusion="inspector_sign_date" value="${escAttr(concState.inspector_sign_date || '')}">
      </div>`;
  }
  if (conc.supervisor_review) {
    html += `
      <div class="field-item">
        <label class="field-label">${esc(conc.supervisor_review.label)}</label>
        <input type="text" data-conclusion="supervisor_review" value="${escAttr(concState.supervisor_review || '')}" placeholder="${escAttr(conc.supervisor_review.placeholder || '')}">
      </div>`;
  }
  if (conc.supervisor_sign_date) {
    html += `
      <div class="field-item">
        <label class="field-label">Date</label>
        <input type="date" data-conclusion="supervisor_sign_date" value="${escAttr(concState.supervisor_sign_date || '')}">
      </div>`;
  }

  html += '</div></div>';
  return html;
}


/* ===== Report / Share Page ===== */

export function renderReport(config, state) {
  if (!config) return '<div class="panel"><p>Error loading configuration.</p></div>';

  const timestamp = state.startedAt
    ? new Date(state.startedAt).toLocaleString()
    : new Date().toLocaleString();

  const concState = state.conclusion || {};

  let html = `
    <div class="report-page">
      <div class="report-header no-print">
        <button class="btn btn-sm" data-action="back-to-checklist">&larr; Back</button>
        <div class="row gap-sm">
          <button class="btn btn-sm btn-accent" data-action="share-pdf">Share PDF</button>
          <button class="btn btn-sm" data-action="download-pdf">Download PDF</button>
          <button class="btn btn-sm" data-action="print">Print</button>
        </div>
      </div>
      <div class="report-content">
        <h1 class="report-title">${esc(config.title)}</h1>
        <p class="report-timestamp">${timestamp}</p>
        <p class="report-disclaimer">This form is a controlled document. Retain completed forms per organisational records policy.</p>`;

  // Header fields summary
  const headerFields = config.header_fields || {};
  const filledFields = [];
  for (const [id, field] of Object.entries(headerFields)) {
    if (state.fields[id]) {
      filledFields.push({ label: field.label, value: state.fields[id] });
    }
  }
  if (filledFields.length > 0) {
    html += '<div class="report-section"><h3>Vehicle Details</h3><dl class="report-fields">';
    for (const f of filledFields) {
      html += `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`;
    }
    html += '</dl></div>';
  }

  // Inspection results by section
  for (const [sectionId, section] of Object.entries(config.sections)) {
    const items = section.items || {};
    const entries = Object.entries(items).filter(([id]) => state.items[id]);
    if (entries.length === 0) continue;

    html += `<div class="report-section"><h3>${esc(section.title)}</h3><ul>`;
    for (const [id, item] of entries) {
      const status = state.items[id] === 'ok' ? 'OK' : 'N/A';
      const notes = state.notes[id] ? ` — ${esc(state.notes[id])}` : '';
      html += `<li>[${status}] ${esc(item.label)}${notes}</li>`;
    }
    html += '</ul></div>';
  }

  // Conclusion
  if (concState.overall_status) {
    let statusClass = 'status-safe';
    if (concState.overall_status.includes('DEFECT')) statusClass = 'status-warning';
    if (concState.overall_status.includes('DO NOT')) statusClass = 'status-danger';
    html += `<div class="report-section"><h3>Overall Conclusion</h3><p class="${statusClass}">${esc(concState.overall_status)}</p></div>`;
  }
  if (concState.comments) {
    html += `<div class="report-section"><h3>Comments</h3><p>${esc(concState.comments)}</p></div>`;
  }

  html += `
      </div>
    </div>`;
  return html;
}


/* ===== Helpers ===== */

export function getAllInspectionIds(sections) {
  const ids = [];
  for (const section of Object.values(sections)) {
    for (const [id, item] of Object.entries(section.items || {})) {
      if (item.type === 'inspection') ids.push(id);
    }
  }
  return ids;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
