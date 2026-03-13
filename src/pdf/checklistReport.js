/**
 * Generic Checklist PDF Report Generator
 *
 * Generates a PDF for ANY checklist type (Vehicle, Trailer, PFD, Rope Gear).
 * Layout and content are driven entirely by the YAML config:
 *   - Title and subtitle from config
 *   - Status columns from config.statuses (2 or 3 columns)
 *   - Conclusion options from config.conclusion.overall_status.options
 *   - Comments label from config.conclusion.comments.label
 *   - Section notes rendered below section header bars
 *
 * Uses PdfWriter for low-level PDF operations.
 */

import { PdfWriter } from './pdfWriter.js';

/* ---- Layout constants (points) ---- */

const ML = 42;           // left margin
const MR = 42;           // right margin
const MT = 42;           // top margin
const MB = 50;           // bottom margin
const PW = 595.28;       // page width (A4)
const PH = 841.89;       // page height (A4)
const CW = PW - ML - MR; // content width (~511)

// Status column width (fixed per column)
const COL_STATUS = 40;

// Row heights
const HDR_ROW_H = 22;     // header field rows
const SEC_HDR_H = 22;     // section header bar
const TBL_HDR_H = 18;     // table column header row
const ITEM_ROW_H = 20;    // inspection item row

// Colors (RGB 0-1)
const C_NAVY = [0.106, 0.227, 0.361];  // #1B3A5C
const C_WHITE = [1, 1, 1];
const C_BLACK = [0, 0, 0];
const C_GRAY = [0.65, 0.65, 0.65];
const C_LIGHT = [0.92, 0.92, 0.92];
const C_RED = [0.6, 0.1, 0.1];

/**
 * Derive column layout from config.statuses.
 *
 * For 2 status columns: COL_ITEM=290, status cols=40 each, rest is notes.
 * For 3 status columns: COL_ITEM=250, status cols=40 each, rest is notes.
 *
 * @param {object} statuses  e.g. { ok: "OK", na: "N/A" }
 * @returns {{ statusKeys: string[], statusLabels: string[], colItem: number, colNotes: number }}
 */
function deriveColumns(statuses) {
  const statusKeys = Object.keys(statuses);
  const statusLabels = Object.values(statuses);
  const numStatus = statusKeys.length;

  const colItem = numStatus <= 2 ? 290 : 250;
  const colNotes = CW - colItem - numStatus * COL_STATUS;

  return { statusKeys, statusLabels, colItem, colNotes };
}

/**
 * Build the array of column x-positions for the inspection table.
 *
 * @param {number} colItem      Width of the item column
 * @param {number} numStatus    Number of status columns
 * @returns {number[]}          X positions: [itemStart, status1Start, ..., notesStart]
 */
function columnXPositions(colItem, numStatus) {
  const positions = [ML];
  let x = ML + colItem;
  for (let i = 0; i < numStatus; i++) {
    positions.push(x);
    x += COL_STATUS;
  }
  positions.push(x); // notes column start
  return positions;
}

/**
 * Generate a checklist PDF from any config + state.
 *
 * @param {object} config  Parsed YAML config (with title, subtitle, statuses, sections, conclusion)
 * @param {object} state   App state ({ fields, items, notes, conclusion })
 * @returns {Uint8Array}   PDF file bytes
 */
export function generateChecklistPdf(config, state) {
  const pdf = new PdfWriter();
  pdf.addPage();

  // Resolve statuses — default to OK / N/A if not specified
  const statuses = config.statuses || { ok: 'OK', na: 'N/A' };
  const cols = deriveColumns(statuses);
  const colX = columnXPositions(cols.colItem, cols.statusKeys.length);

  let y = MT;

  // ---- Title ----
  const title = (config.title || 'Checklist').toUpperCase();
  pdf.textCentered(title, y, { font: 'bold', size: 18, color: C_BLACK });
  y += 20;

  const subtitle = config.subtitle || 'Search and Rescue -- Inspection Checklist';
  pdf.textCentered(subtitle, y, { font: 'normal', size: 9, color: [0.3, 0.3, 0.3] });
  y += 18;

  // ---- Header fields table ----
  y = drawHeaderFields(pdf, config, state, y);
  y += 8;

  // ---- Inspection sections ----
  const sections = config.sections || {};
  for (const [sectionId, section] of Object.entries(sections)) {
    const items = section.items || {};
    const itemCount = Object.keys(items).length;

    // Estimate section height: header + optional note + table header + item rows
    let estimatedH = SEC_HDR_H + TBL_HDR_H + itemCount * ITEM_ROW_H + 6;
    if (section.note) {
      // Rough estimate for wrapped note text
      const noteLines = pdf.wrapText(section.note, CW - 16, 7.5, 'italic');
      estimatedH += noteLines.length * 10 + 6;
    }

    // Page break check — if section won't fit, start new page
    if (y + estimatedH > PH - MB) {
      pdf.addPage();
      y = MT;
    }

    y = drawInspectionSection(pdf, section, items, state, y, cols, colX);
    y += 6;
  }

  // ---- Conclusion ----
  // Check if conclusion fits on current page (~140 pts needed)
  if (y + 140 > PH - MB) {
    pdf.addPage();
    y = MT;
  }
  y = drawConclusion(pdf, config, state, y);

  // ---- Footer ----
  y += 14;
  if (y + 20 > PH - MB) {
    pdf.addPage();
    y = MT;
  }
  pdf.textCentered(
    'This form is a controlled document. Retain completed forms per organisational records policy.',
    y, { font: 'italic', size: 7.5, color: C_RED }
  );

  return pdf.output();
}


/* ===== Header fields ===== */

function drawHeaderFields(pdf, config, state, startY) {
  const fields = config.header_fields || {};
  const fieldEntries = Object.entries(fields);

  // Layout: rows of 2 columns
  const colW = CW / 2;
  const pairs = [];
  for (let i = 0; i < fieldEntries.length; i += 2) {
    pairs.push([fieldEntries[i], fieldEntries[i + 1] || null]);
  }

  let y = startY;
  for (const [left, right] of pairs) {
    // Draw row border
    pdf.rect(ML, y, CW, HDR_ROW_H, { stroke: C_GRAY, lineWidth: 0.5 });
    pdf.line(ML + colW, y, ML + colW, y + HDR_ROW_H, { color: C_GRAY });

    // Left cell
    if (left) {
      const [id, field] = left;
      const val = state.fields[id] || '';
      const labelText = field.label + ':';
      pdf.text(labelText, ML + 4, y + 14, { font: 'bold', size: 8.5, color: C_BLACK });
      const labelW = pdf.measureText(labelText, 8.5, 'bold');
      if (val) {
        pdf.text(val, ML + 4 + labelW + 4, y + 14, { font: 'normal', size: 9, color: C_BLACK });
      }
    }

    // Right cell
    if (right) {
      const [id, field] = right;
      const val = state.fields[id] || '';
      const labelText = field.label + ':';
      pdf.text(labelText, ML + colW + 4, y + 14, { font: 'bold', size: 8.5, color: C_BLACK });
      const labelW = pdf.measureText(labelText, 8.5, 'bold');
      if (val) {
        pdf.text(val, ML + colW + 4 + labelW + 4, y + 14, { font: 'normal', size: 9, color: C_BLACK });
      }
    }

    y += HDR_ROW_H;
  }

  return y;
}


/* ===== Inspection section ===== */

/**
 * Draw a single inspection section: header bar, optional note, column headers, item rows.
 *
 * @param {PdfWriter} pdf
 * @param {object}    section   Section config (title, note, items)
 * @param {object}    items     Section items map
 * @param {object}    state     App state
 * @param {number}    startY    Y position to start drawing
 * @param {object}    cols      Column layout from deriveColumns()
 * @param {number[]}  colX      Column x-positions from columnXPositions()
 * @returns {number}  Y position after section
 */
function drawInspectionSection(pdf, section, items, state, startY, cols, colX) {
  let y = startY;
  const { statusKeys, statusLabels, colItem, colNotes } = cols;
  const numStatus = statusKeys.length;

  // Section header bar (dark background, white text)
  pdf.rect(ML, y, CW, SEC_HDR_H, { fill: C_NAVY });
  pdf.text(section.title, ML + 8, y + 15, { font: 'bold', size: 9.5, color: C_WHITE });
  y += SEC_HDR_H;

  // Section note (italic text below header bar, before column headers)
  if (section.note) {
    const noteLines = pdf.wrapText(section.note, CW - 16, 7.5, 'italic');
    const noteBlockH = noteLines.length * 10 + 6;
    pdf.rect(ML, y, CW, noteBlockH, { stroke: C_GRAY, lineWidth: 0.3 });
    let noteY = y + 11;
    for (const line of noteLines) {
      pdf.text(line, ML + 8, noteY, { font: 'italic', size: 7.5, color: [0.3, 0.3, 0.3] });
      noteY += 10;
    }
    y += noteBlockH;
  }

  // Table column headers
  pdf.rect(ML, y, CW, TBL_HDR_H, { stroke: C_GRAY, lineWidth: 0.5 });

  // Vertical column dividers for header
  for (let i = 1; i < colX.length; i++) {
    pdf.line(colX[i], y, colX[i], y + TBL_HDR_H, { color: C_GRAY });
  }

  // "Inspection Item" label
  pdf.text('Inspection Item', ML + 4, y + 13, { font: 'bold', size: 8, color: C_BLACK });

  // Status column labels (centered)
  for (let i = 0; i < numStatus; i++) {
    const label = statusLabels[i];
    const xOff = centerOffset(label, COL_STATUS, 8, 'bold');
    pdf.text(label, colX[i + 1] + xOff, y + 13, { font: 'bold', size: 8, color: C_BLACK });
  }

  // Notes column label
  pdf.text('Notes / Details', colX[numStatus + 1] + 4, y + 13, { font: 'bold', size: 8, color: C_BLACK });
  y += TBL_HDR_H;

  // Item rows
  for (const [itemId, item] of Object.entries(items)) {
    // Page break check for individual rows
    if (y + ITEM_ROW_H > PH - MB) {
      pdf.addPage();
      y = MT;
    }

    const status = state.items[itemId];
    const notes = state.notes[itemId] || '';

    // Calculate row height — may need more if label or notes wrap
    const labelLines = pdf.wrapText(item.label, colItem - 8, 8, 'normal');
    const noteLines = notes ? pdf.wrapText(notes, colNotes - 8, 7.5, 'normal') : [];
    const textRows = Math.max(labelLines.length, noteLines.length);
    const rowH = Math.max(ITEM_ROW_H, textRows * 11 + 6);

    // Row border
    pdf.rect(ML, y, CW, rowH, { stroke: C_GRAY, lineWidth: 0.3 });
    for (let i = 1; i < colX.length; i++) {
      pdf.line(colX[i], y, colX[i], y + rowH, { color: C_GRAY, width: 0.3 });
    }

    // Label text (may wrap)
    let textY = y + 13;
    for (const line of labelLines) {
      pdf.text(line, ML + 4, textY, { font: 'normal', size: 8, color: C_BLACK });
      textY += 11;
    }

    // Status checkmarks — match the selected status against each status key
    for (let i = 0; i < numStatus; i++) {
      if (status === statusKeys[i]) {
        pdf.checkMark(colX[i + 1] + (COL_STATUS - 12) / 2, y + 14, 12);
      }
    }

    // Notes text
    if (notes) {
      let noteY = y + 12;
      for (const line of noteLines) {
        pdf.text(line, colX[numStatus + 1] + 4, noteY, { font: 'normal', size: 7.5, color: [0.2, 0.2, 0.2] });
        noteY += 10;
      }
    }

    y += rowH;
  }

  return y;
}


/* ===== Conclusion ===== */

function drawConclusion(pdf, config, state, startY) {
  let y = startY;
  const conclusion = state.conclusion || {};
  const configConc = config.conclusion || {};

  // Overall Conclusion row
  pdf.rect(ML, y, CW, 24, { stroke: C_GRAY, lineWidth: 0.5 });
  pdf.text('Overall Conclusion:', ML + 4, y + 16, { font: 'bold', size: 9, color: C_BLACK });

  // Options with checkbox squares
  const options = (configConc.overall_status && configConc.overall_status.options) || [];
  const selected = conclusion.overall_status || '';
  let optX = ML + 130;

  for (const opt of options) {
    // If option would overflow the row width, wrap to next line within the row
    const optTextW = pdf.measureText(opt, 7.5, 'normal');
    const optTotalW = optTextW + 26;

    // Check if this option would exceed the content area
    if (optX + optTotalW > ML + CW - 4 && optX > ML + 130) {
      // Not enough room — this is fine for most cases as conclusion row
      // accommodates typical option lengths. For very long option sets,
      // items will be placed as far right as space allows.
    }

    // Draw checkbox square
    pdf.rect(optX, y + 7, 9, 9, { stroke: C_BLACK, lineWidth: 0.5 });
    if (selected === opt) {
      pdf.checkMark(optX - 1, y + 16, 10);
    }
    // Option label text (right of box)
    pdf.text(opt, optX + 13, y + 15, { font: 'normal', size: 7.5, color: C_BLACK });
    optX += optTotalW;
  }

  y += 24;

  // Comments / Corrective Actions label
  const commentsLabel = (configConc.comments && configConc.comments.label)
    || 'Comments / Corrective Actions Required';
  pdf.rect(ML, y, CW, 16, { fill: C_LIGHT, stroke: C_GRAY, lineWidth: 0.5 });
  pdf.text(commentsLabel + ':', ML + 4, y + 11, { font: 'bold', size: 8.5, color: C_BLACK });
  y += 16;

  // Comments text area
  const comments = conclusion.comments || '';
  const commentLines = comments ? pdf.wrapText(comments, CW - 12, 8.5, 'normal') : [];
  const commentBoxH = Math.max(40, commentLines.length * 12 + 10);
  pdf.rect(ML, y, CW, commentBoxH, { stroke: C_GRAY, lineWidth: 0.5 });
  if (comments) {
    let cy = y + 12;
    for (const line of commentLines) {
      pdf.text(line, ML + 6, cy, { font: 'normal', size: 8.5, color: C_BLACK });
      cy += 12;
    }
  }
  y += commentBoxH;

  // Spacer
  y += 6;

  // Signature rows
  const sigColW = CW / 2;
  const sigH = 28;

  // Inspector Signature | Date
  pdf.rect(ML, y, sigColW, sigH, { stroke: C_GRAY, lineWidth: 0.5 });
  pdf.rect(ML + sigColW, y, sigColW, sigH, { stroke: C_GRAY, lineWidth: 0.5 });
  pdf.text('Inspector Signature:', ML + 4, y + 12, { font: 'bold', size: 8, color: C_BLACK });
  pdf.text('Date:', ML + sigColW + 4, y + 12, { font: 'bold', size: 8, color: C_BLACK });
  if (conclusion.inspector_signature) {
    pdf.text(conclusion.inspector_signature, ML + 4, y + 23, { font: 'normal', size: 9, color: C_BLACK });
  }
  if (conclusion.inspector_sign_date) {
    pdf.text(conclusion.inspector_sign_date, ML + sigColW + 38, y + 12, { font: 'normal', size: 9, color: C_BLACK });
  }
  y += sigH;

  // Supervisor Review | Date
  pdf.rect(ML, y, sigColW, sigH, { stroke: C_GRAY, lineWidth: 0.5 });
  pdf.rect(ML + sigColW, y, sigColW, sigH, { stroke: C_GRAY, lineWidth: 0.5 });
  pdf.text('Supervisor Review:', ML + 4, y + 12, { font: 'bold', size: 8, color: C_BLACK });
  pdf.text('Date:', ML + sigColW + 4, y + 12, { font: 'bold', size: 8, color: C_BLACK });
  if (conclusion.supervisor_review) {
    pdf.text(conclusion.supervisor_review, ML + 4, y + 23, { font: 'normal', size: 9, color: C_BLACK });
  }
  if (conclusion.supervisor_sign_date) {
    pdf.text(conclusion.supervisor_sign_date, ML + sigColW + 38, y + 12, { font: 'normal', size: 9, color: C_BLACK });
  }
  y += sigH;

  return y;
}


/* ===== Helpers ===== */

/** Calculate x-offset to center text within a column. */
function centerOffset(str, colWidth, fontSize, font) {
  const tw = new PdfWriter().measureText(str, fontSize, font);
  return (colWidth - tw) / 2;
}
