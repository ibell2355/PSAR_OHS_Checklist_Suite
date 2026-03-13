/**
 * Vehicle Safety Check — PDF Report Generator
 *
 * Generates a PDF that closely mirrors the paper Vehicle Safety Check form.
 * Uses PdfWriter for low-level PDF operations.
 *
 * Layout approach:
 *   - The form is rendered on A4 pages with fixed margins.
 *   - Header fields are laid out as a 3-row, 2-column table.
 *   - Each inspection section has a dark header bar and a table with
 *     columns: Inspection Item | OK | N/A | Notes / Details.
 *   - The conclusion section has radio-style checkboxes, a comments area,
 *     and signature/date rows.
 *
 * To update the PDF layout for a changed form:
 *   1. Adjust the section rendering in drawInspectionSection()
 *   2. Adjust column widths in the LAYOUT constants
 *   3. Adjust the conclusion layout in drawConclusion()
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

// Inspection table column widths
const COL_ITEM = 290;
const COL_OK = 40;
const COL_NA = 40;
const COL_NOTES = CW - COL_ITEM - COL_OK - COL_NA;

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
 * Generate the Vehicle Safety Check PDF.
 * @param {object} config  Parsed YAML config
 * @param {object} state   App state (fields, items, notes, conclusion)
 * @returns {Uint8Array}   PDF file bytes
 */
export function generateVehicleCheckPdf(config, state) {
  const pdf = new PdfWriter();
  pdf.addPage();

  let y = MT;

  // ---- Title ----
  pdf.textCentered('VEHICLE SAFETY CHECK', y, { font: 'bold', size: 18, color: C_BLACK });
  y += 20;
  pdf.textCentered('Search and Rescue -- Pre-Use Inspection Checklist', y, { font: 'normal', size: 9, color: [0.3, 0.3, 0.3] });
  y += 18;

  // ---- Header fields table ----
  y = drawHeaderFields(pdf, config, state, y);
  y += 8;

  // ---- Inspection sections ----
  const sections = config.sections || {};
  for (const [sectionId, section] of Object.entries(sections)) {
    const items = section.items || {};
    const itemCount = Object.keys(items).length;
    // Estimated height: section header + table header + items
    const estimatedH = SEC_HDR_H + TBL_HDR_H + itemCount * ITEM_ROW_H + 6;

    // Page break check — if section won't fit, start new page
    if (y + estimatedH > PH - MB) {
      pdf.addPage();
      y = MT;
    }

    y = drawInspectionSection(pdf, section, items, state, y);
    y += 6;
  }

  // ---- Conclusion ----
  // Check if conclusion fits on current page (~130 pts needed)
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

  // Layout: 3 rows x 2 columns
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
      pdf.text(labelText, ML + 4, y + 14, { font: 'bold', size: 8.5 });
      const labelW = pdf.measureText(labelText, 8.5, 'bold');
      if (val) {
        pdf.text(val, ML + 4 + labelW + 4, y + 14, { font: 'normal', size: 9 });
      }
    }

    // Right cell
    if (right) {
      const [id, field] = right;
      const val = state.fields[id] || '';
      const labelText = field.label + ':';
      pdf.text(labelText, ML + colW + 4, y + 14, { font: 'bold', size: 8.5 });
      const labelW = pdf.measureText(labelText, 8.5, 'bold');
      if (val) {
        pdf.text(val, ML + colW + 4 + labelW + 4, y + 14, { font: 'normal', size: 9 });
      }
    }

    y += HDR_ROW_H;
  }

  return y;
}


/* ===== Inspection section ===== */

function drawInspectionSection(pdf, section, items, state, startY) {
  let y = startY;

  // Section header bar (dark background, white text)
  pdf.rect(ML, y, CW, SEC_HDR_H, { fill: C_NAVY });
  pdf.text(section.title, ML + 8, y + 15, { font: 'bold', size: 9.5, color: C_WHITE });
  y += SEC_HDR_H;

  // Table column headers
  pdf.rect(ML, y, CW, TBL_HDR_H, { stroke: C_GRAY, lineWidth: 0.5 });
  const colX = [ML, ML + COL_ITEM, ML + COL_ITEM + COL_OK, ML + COL_ITEM + COL_OK + COL_NA];

  // Vertical column dividers for header
  for (let i = 1; i < colX.length; i++) {
    pdf.line(colX[i], y, colX[i], y + TBL_HDR_H, { color: C_GRAY });
  }

  pdf.text('Inspection Item', ML + 4, y + 13, { font: 'bold', size: 8 });
  pdf.text('OK', colX[1] + centerOffset('OK', COL_OK, 8, 'bold'), y + 13, { font: 'bold', size: 8 });
  pdf.text('N/A', colX[2] + centerOffset('N/A', COL_NA, 8, 'bold'), y + 13, { font: 'bold', size: 8 });
  pdf.text('Notes / Details', colX[3] + 4, y + 13, { font: 'bold', size: 8 });
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

    // Calculate row height — may need more if label wraps
    const labelLines = pdf.wrapText(item.label, COL_ITEM - 8, 8, 'normal');
    const noteLines = notes ? pdf.wrapText(notes, COL_NOTES - 8, 7.5, 'normal') : [];
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
      pdf.text(line, ML + 4, textY, { font: 'normal', size: 8 });
      textY += 11;
    }

    // OK checkmark
    if (status === 'ok') {
      pdf.checkMark(colX[1] + (COL_OK - 12) / 2, y + 14, 12);
    }

    // N/A checkmark
    if (status === 'na') {
      pdf.checkMark(colX[2] + (COL_NA - 12) / 2, y + 14, 12);
    }

    // Notes text
    if (notes) {
      let noteY = y + 12;
      for (const line of noteLines) {
        pdf.text(line, colX[3] + 4, noteY, { font: 'normal', size: 7.5, color: [0.2, 0.2, 0.2] });
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
  pdf.text('Overall Conclusion:', ML + 4, y + 16, { font: 'bold', size: 9 });

  // Options with checkbox squares
  const options = (configConc.overall_status && configConc.overall_status.options) || [];
  const selected = conclusion.overall_status || '';
  let optX = ML + 130;
  for (const opt of options) {
    // Draw checkbox square
    pdf.rect(optX, y + 7, 9, 9, { stroke: C_BLACK, lineWidth: 0.5 });
    if (selected === opt) {
      pdf.checkMark(optX - 1, y + 16, 10);
    }
    // Option label text (right of box)
    pdf.text(opt, optX + 13, y + 15, { font: 'normal', size: 7.5 });
    optX += pdf.measureText(opt, 7.5, 'normal') + 26;
  }

  y += 24;

  // Comments / Corrective Actions
  pdf.rect(ML, y, CW, 16, { fill: C_LIGHT, stroke: C_GRAY, lineWidth: 0.5 });
  pdf.text('Comments / Corrective Actions Required:', ML + 4, y + 11, { font: 'bold', size: 8.5 });
  y += 16;

  // Comments text area
  const comments = conclusion.comments || '';
  const commentLines = comments ? pdf.wrapText(comments, CW - 12, 8.5, 'normal') : [];
  const commentBoxH = Math.max(40, commentLines.length * 12 + 10);
  pdf.rect(ML, y, CW, commentBoxH, { stroke: C_GRAY, lineWidth: 0.5 });
  if (comments) {
    let cy = y + 12;
    for (const line of commentLines) {
      pdf.text(line, ML + 6, cy, { font: 'normal', size: 8.5 });
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
  pdf.text('Inspector Signature:', ML + 4, y + 12, { font: 'bold', size: 8 });
  pdf.text('Date:', ML + sigColW + 4, y + 12, { font: 'bold', size: 8 });
  if (conclusion.inspector_signature) {
    pdf.text(conclusion.inspector_signature, ML + 4, y + 23, { font: 'normal', size: 9 });
  }
  if (conclusion.inspector_sign_date) {
    pdf.text(conclusion.inspector_sign_date, ML + sigColW + 38, y + 12, { font: 'normal', size: 9 });
  }
  y += sigH;

  // Supervisor Review | Date
  pdf.rect(ML, y, sigColW, sigH, { stroke: C_GRAY, lineWidth: 0.5 });
  pdf.rect(ML + sigColW, y, sigColW, sigH, { stroke: C_GRAY, lineWidth: 0.5 });
  pdf.text('Supervisor Review:', ML + 4, y + 12, { font: 'bold', size: 8 });
  pdf.text('Date:', ML + sigColW + 4, y + 12, { font: 'bold', size: 8 });
  if (conclusion.supervisor_review) {
    pdf.text(conclusion.supervisor_review, ML + 4, y + 23, { font: 'normal', size: 9 });
  }
  if (conclusion.supervisor_sign_date) {
    pdf.text(conclusion.supervisor_sign_date, ML + sigColW + 38, y + 12, { font: 'normal', size: 9 });
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
