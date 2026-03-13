/**
 * Minimal PDF writer for generating form-style documents.
 *
 * Produces valid PDF 1.4 files using built-in Type1 fonts (no embedding needed).
 * Supports text, lines, rectangles, and basic styling.
 *
 * Fonts available:
 *   'normal'  — Helvetica          (/F1)
 *   'bold'    — Helvetica-Bold     (/F2)
 *   'symbol'  — ZapfDingbats       (/F3)  — use char '4' for checkmark
 *   'italic'  — Helvetica-Oblique  (/F4)
 *
 * Coordinate system: origin at top-left, Y increases downward (converted
 * internally to PDF's bottom-left origin).
 */

const FONT_MAP = { normal: '/F1', bold: '/F2', symbol: '/F3', italic: '/F4' };

// Approximate Helvetica character widths (per 1000 units of font size)
const HELVETICA_WIDTHS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667,
  "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333,
  '.': 278, '/': 278, '0': 556, '1': 556, '2': 556, '3': 556, '4': 556,
  '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, ':': 278, ';': 278,
  '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667,
  Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667,
  Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556,
  i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556,
  q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500,
  y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584
};

// Bold Helvetica is ~5-8% wider on average; use a simple multiplier
const BOLD_SCALE = 1.06;

export class PdfWriter {

  constructor(options = {}) {
    this.W = options.width || 595.28;   // A4 width in points
    this.H = options.height || 841.89;  // A4 height in points
    this.pages = [];       // finalized page content strings
    this._content = '';    // current page being built
    this._started = false;
  }

  /* ---- Page management ---- */

  addPage() {
    if (this._started) {
      this.pages.push(this._content);
    }
    this._content = '';
    this._started = true;
    return this;
  }

  /* ---- Text ---- */

  /**
   * Draw text at (x, y) with options.
   * @param {string} str   Text to draw
   * @param {number} x     X position (left edge)
   * @param {number} y     Y position (top-left origin, baseline)
   * @param {object} opts  { font, size, color, maxWidth }
   */
  text(str, x, y, opts = {}) {
    const font = FONT_MAP[opts.font || 'normal'] || '/F1';
    const size = opts.size || 10;
    const escaped = this._escPdf(str);
    const py = this._py(y);

    // Always set fill color explicitly — prevents stale color from prior
    // operations (e.g. white section-header text) bleeding into later text.
    const [r, g, b] = opts.color || [0, 0, 0];
    let cmds = `${f(r)} ${f(g)} ${f(b)} rg `;
    cmds += `BT ${font} ${size} Tf ${f(x)} ${f(py)} Td (${escaped}) Tj ET\n`;
    this._content += cmds;
    return this;
  }

  /** Draw text centered horizontally on the page. */
  textCentered(str, y, opts = {}) {
    const w = this.measureText(str, opts.size || 10, opts.font || 'normal');
    return this.text(str, (this.W - w) / 2, y, opts);
  }

  /* ---- Shapes ---- */

  line(x1, y1, x2, y2, opts = {}) {
    const lw = opts.width || 0.5;
    let cmds = `${f(lw)} w `;
    if (opts.color) {
      const [r, g, b] = opts.color;
      cmds += `${f(r)} ${f(g)} ${f(b)} RG `;
    } else {
      cmds += '0 0 0 RG ';
    }
    cmds += `${f(x1)} ${f(this._py(y1))} m ${f(x2)} ${f(this._py(y2))} l S\n`;
    this._content += cmds;
    return this;
  }

  rect(x, y, w, h, opts = {}) {
    const py = this._py(y + h); // PDF y is bottom-left of rect
    let cmds = '';
    if (opts.lineWidth) cmds += `${f(opts.lineWidth)} w `;
    if (opts.fill) {
      const [r, g, b] = opts.fill;
      cmds += `${f(r)} ${f(g)} ${f(b)} rg `;
    }
    if (opts.stroke) {
      const [r, g, b] = opts.stroke;
      cmds += `${f(r)} ${f(g)} ${f(b)} RG `;
    }
    cmds += `${f(x)} ${f(py)} ${f(w)} ${f(h)} re `;
    if (opts.fill && opts.stroke) cmds += 'B';
    else if (opts.fill) cmds += 'f';
    else cmds += 'S';
    cmds += '\n';
    this._content += cmds;
    return this;
  }

  /** Draw a checkmark using ZapfDingbats (char '4' = heavy check mark). */
  checkMark(x, y, size = 12) {
    const py = this._py(y);
    // Explicitly set black fill so checkmarks are always visible
    this._content += `0 0 0 rg BT /F3 ${size} Tf ${f(x)} ${f(py)} Td (4) Tj ET\n`;
    return this;
  }

  /* ---- Text measurement ---- */

  measureText(str, size = 10, font = 'normal') {
    const safe = this._sanitize(str);
    const scale = font === 'bold' ? BOLD_SCALE : 1;
    let width = 0;
    for (const ch of safe) {
      width += (HELVETICA_WIDTHS[ch] || 500);
    }
    return (width / 1000) * size * scale;
  }

  /**
   * Wrap text to fit within maxWidth. Returns array of lines.
   */
  wrapText(str, maxWidth, size = 10, font = 'normal') {
    const words = this._sanitize(str).split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (this.measureText(test, size, font) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /* ---- Output ---- */

  output() {
    // Finalize current page
    if (this._started) {
      this.pages.push(this._content);
    }
    if (this.pages.length === 0) return new Uint8Array(0);

    const numPages = this.pages.length;

    // Object layout:
    //   1 = Catalog, 2 = Pages, 3 = F1, 4 = F2, 5 = F3, 6 = F4
    //   For page i (0-based): pageDict = 7 + i*2, contentStream = 8 + i*2
    const FIXED = 6; // number of fixed objects
    const pageDictNums = [];
    for (let i = 0; i < numPages; i++) {
      pageDictNums.push(FIXED + 1 + i * 2);
    }
    const totalObjects = FIXED + numPages * 2;

    let out = '%PDF-1.4\n';
    const offsets = new Array(totalObjects + 1).fill(0);

    const writeObj = (num, content) => {
      offsets[num] = out.length;
      out += `${num} 0 obj\n${content}\nendobj\n\n`;
    };

    // Catalog
    writeObj(1, '<< /Type /Catalog /Pages 2 0 R >>');

    // Pages
    const kids = pageDictNums.map(n => `${n} 0 R`).join(' ');
    writeObj(2, `<< /Type /Pages /Kids [${kids}] /Count ${numPages} >>`);

    // Fonts
    writeObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    writeObj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    writeObj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>');
    writeObj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');

    // Pages and content streams
    const resources = '<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >>';
    for (let i = 0; i < numPages; i++) {
      const dictNum = FIXED + 1 + i * 2;
      const streamNum = FIXED + 2 + i * 2;
      const content = this.pages[i];

      writeObj(streamNum, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      writeObj(dictNum, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(this.W)} ${f(this.H)}] /Contents ${streamNum} 0 R /Resources ${resources} >>`);
    }

    // Cross-reference table
    const xrefOffset = out.length;
    out += 'xref\n';
    out += `0 ${totalObjects + 1}\n`;
    out += '0000000000 65535 f \r\n';
    for (let i = 1; i <= totalObjects; i++) {
      out += `${String(offsets[i]).padStart(10, '0')} 00000 n \r\n`;
    }

    // Trailer
    out += 'trailer\n';
    out += `<< /Size ${totalObjects + 1} /Root 1 0 R >>\n`;
    out += 'startxref\n';
    out += `${xrefOffset}\n`;
    out += '%%EOF\n';

    // Convert to Uint8Array
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) {
      bytes[i] = out.charCodeAt(i) & 0xFF;
    }
    return bytes;
  }

  /* ---- Internal helpers ---- */

  /** Convert top-down Y to PDF Y (bottom-up). */
  _py(y) { return this.H - y; }

  /** Sanitize text to ASCII-safe characters for PDF strings. */
  _sanitize(str) {
    return String(str)
      .replace(/[\u2014\u2015]/g, '--')
      .replace(/[\u2013]/g, '-')
      .replace(/[\u2018\u2019\u201A]/g, "'")
      .replace(/[\u201C\u201D\u201E]/g, '"')
      .replace(/[\u2026]/g, '...')
      .replace(/[^\x20-\x7E\n\r\t]/g, '');
  }

  /** Escape a string for use in a PDF text operator. */
  _escPdf(str) {
    const safe = this._sanitize(str);
    return safe.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
}

/** Format a number for PDF (2 decimal places). */
function f(n) { return Number(n).toFixed(2); }
