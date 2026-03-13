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
        <button class="btn btn-accent btn-block" data-action="open-checklist" data-id="trailer_safety_check">
          Trailer Safety Check
        </button>
        <button class="btn btn-accent btn-block" data-action="open-checklist" data-id="pfd_buoyancy_check">
          Annual PFD Buoyancy Check
        </button>
        <button class="btn btn-accent btn-block" data-action="open-checklist" data-id="rope_gear_check">
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
  const statuses = config.statuses || { ok: 'OK', na: 'N/A' };
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

    if (section.note) {
      html += `<p class="subtle section-note">${esc(section.note)}</p>`;
    }

    for (const [itemId, item] of Object.entries(items)) {
      html += renderItem(itemId, item, state, statuses);
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

function renderItem(id, item, state, statuses) {
  if (item.type === 'inspection') return renderInspection(id, item, state, statuses);
  if (item.type === 'text') return renderTextField(id, item, state);
  return '';
}

function renderInspection(id, item, state, statuses) {
  const status = state.items[id] || '';
  const notes = state.notes[id] || '';
  const hasNotes = notes ? ' has-notes' : '';
  const notesVisible = notes ? '' : ' hidden';

  let statusButtons = '';
  for (const [key, label] of Object.entries(statuses)) {
    const active = status === key ? ' active' : '';
    statusButtons += `<button class="status-btn ${key}-btn${active}" data-action="set-status" data-item="${id}" data-status="${key}">${esc(label)}</button>`;
  }

  return `
    <div class="inspection-item">
      <div class="inspection-row">
        <span class="inspection-label">${esc(item.label)}${item.helper ? `<span class="helper-text">${esc(item.helper)}</span>` : ''}</span>
        <div class="inspection-actions">
          ${statusButtons}
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

function getOptionClass(index, total) {
  if (index === 0) return 'safe';
  if (index === total - 1) return 'danger-opt';
  return 'warning';
}

function getStatusClass(value, options) {
  if (!options || options.length === 0) return 'status-safe';
  const idx = options.indexOf(value);
  if (idx === 0) return 'status-safe';
  if (idx === options.length - 1) return 'status-danger';
  return 'status-warning';
}

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
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const checked = selected === opt ? 'checked' : '';
      const cls = getOptionClass(i, options.length);
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

  const statuses = config.statuses || { ok: 'OK', na: 'N/A' };
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
  const detailsHeading = config.details_heading || config.title + ' Details';
  const headerFields = config.header_fields || {};
  const filledFields = [];
  for (const [id, field] of Object.entries(headerFields)) {
    if (state.fields[id]) {
      filledFields.push({ label: field.label, value: state.fields[id] });
    }
  }
  if (filledFields.length > 0) {
    html += `<div class="report-section"><h3>${esc(detailsHeading)}</h3><dl class="report-fields">`;
    for (const f of filledFields) {
      html += `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`;
    }
    html += '</dl></div>';
  }

  // Inspection results by section
  const conclusionOptions = (config.conclusion && config.conclusion.overall_status)
    ? config.conclusion.overall_status.options || []
    : [];

  for (const [sectionId, section] of Object.entries(config.sections)) {
    const items = section.items || {};
    const entries = Object.entries(items).filter(([id]) => state.items[id]);
    if (entries.length === 0) continue;

    html += `<div class="report-section"><h3>${esc(section.title)}</h3><ul>`;
    for (const [id, item] of entries) {
      const statusKey = state.items[id];
      const statusLabel = statuses[statusKey] || statusKey.toUpperCase();
      const notes = state.notes[id] ? ` — ${esc(state.notes[id])}` : '';
      html += `<li>[${esc(statusLabel)}] ${esc(item.label)}${notes}</li>`;
    }
    html += '</ul></div>';
  }

  // Conclusion
  if (concState.overall_status) {
    const statusClass = getStatusClass(concState.overall_status, conclusionOptions);
    html += `<div class="report-section"><h3>Overall Conclusion</h3><p class="${statusClass}">${esc(concState.overall_status)}</p></div>`;
  }
  if (concState.comments) {
    const commentsLabel = (config.conclusion && config.conclusion.comments)
      ? config.conclusion.comments.label
      : 'Comments';
    html += `<div class="report-section"><h3>${esc(commentsLabel)}</h3><p>${esc(concState.comments)}</p></div>`;
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
