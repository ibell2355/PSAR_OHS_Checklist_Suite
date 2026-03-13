# PSAR OHS Checklist Suite

Offline-first OHS safety checklists for Parkland Search & Rescue field use.
Built as a PWA — works on mobile and desktop, online or offline.

## Current checklists

| Checklist | Status |
|-----------|--------|
| Vehicle Safety Check | Active |
| Trailer Safety Check | Planned |
| Annual PFD Buoyancy Check | Planned |
| Annual Technical Rope Gear Check | Planned |

## How to run

1. Open a terminal in the project root.
2. Run `py -3 -m http.server 4175 --bind 127.0.0.1` (or double-click `run.bat`).
3. Open `http://127.0.0.1:4175` in a browser.

On mobile, the app can be added to the home screen via "Add to Home Screen" in the browser menu, then it runs as a standalone PWA.

## Project structure

```
index.html              — Single-page app entry point
service-worker.js       — Offline caching (network-first strategy)
manifest.webmanifest    — PWA manifest
package.json            — Version metadata
run.bat                 — Windows dev server launcher

assets/                 — Logo, PWA icons
config/                 — YAML checklist definitions
  vehicle_safety_check.yaml

src/
  main.js               — Routing, state, events, persistence
  ui/
    render.js            — HTML rendering (landing, checklist, report)
    styles.css           — All styling (light + dark themes)
  model/
    configLoader.js      — YAML config loader
  storage/
    db.js                — IndexedDB persistence
  utils/
    simpleYaml.js        — Lightweight YAML parser
  pdf/
    pdfWriter.js         — Minimal PDF file builder (no dependencies)
    vehicleReport.js     — Vehicle Safety Check form layout for PDF

docs/                   — Source PDFs, logo, brand materials
```

## How the YAML config works

Each checklist is defined in `config/<checklist_id>.yaml`. The app loads this file at startup and renders the checklist UI from it.

### Top-level keys

| Key | Purpose |
|-----|---------|
| `id` | Unique checklist identifier |
| `title` | Display title |
| `subtitle` | Subtitle shown below title |
| `version` | Config version number |
| `header_fields` | Form header inputs (date, inspector, vehicle info) |
| `sections` | Inspection sections with items |
| `conclusion` | Conclusion fields (overall status, comments, signatures) |

### Item types

| Type | Description | State stored |
|------|-------------|-------------|
| `inspection` | OK / N/A check with optional notes | `state.items[id]` = `'ok'` or `'na'` |
| `text` | Text input field | `state.fields[id]` = string |
| `date` | Date input (use `prefill: today` for auto-fill) | `state.fields[id]` = string |
| `radio` | Single-select from `options` list | `state.conclusion[id]` = string |
| `textarea` | Multi-line text input | `state.conclusion[id]` = string |

### Optional item fields

| Field | Type | Purpose |
|-------|------|---------|
| `helper` | string | Helper text shown below the item |
| `placeholder` | string | Input placeholder text |
| `prefill` | `'today'` | Auto-fill date fields with today's date |
| `report` | boolean | Include in report output |
| `options` | array | Options list for radio type |

### Editing the YAML

To change checklist content, edit the YAML file directly. Changes take effect on the next app load (or force-refresh). No code changes are needed for content updates.

Example — adding an inspection item:
```yaml
sections:
  my_section:
    title: MY SECTION
    items:
      new_item:
        type: inspection
        label: New inspection item description
```

## How the PDF renderer works

The PDF output is generated entirely in the browser with zero dependencies, using `src/pdf/pdfWriter.js` (generic PDF builder) and `src/pdf/vehicleReport.js` (form-specific layout).

### Architecture

- **`pdfWriter.js`** — Low-level PDF builder. Produces valid PDF 1.4 files using built-in Type1 fonts (Helvetica, Helvetica-Bold, ZapfDingbats, Helvetica-Oblique). Provides `text()`, `line()`, `rect()`, `checkMark()`, text measurement, and word wrapping.

- **`vehicleReport.js`** — Uses PdfWriter to lay out the Vehicle Safety Check form matching the paper PDF. Contains the form's specific layout constants (margins, column widths, colors) and section drawing functions.

### Updating the PDF layout

If the paper form changes:

1. **Content changes** (items added/removed): Update the YAML config. The PDF renderer iterates through config sections, so new items appear automatically.

2. **Layout changes** (columns, spacing): Edit the layout constants at the top of `vehicleReport.js` (margins, column widths, row heights, colors).

3. **Structural changes** (new section types, different form structure): Modify the drawing functions in `vehicleReport.js` — `drawHeaderFields()`, `drawInspectionSection()`, `drawConclusion()`.

### PDF sharing

The app generates a real PDF file and shares it via:
1. **Native Share API** (mobile) — shares the PDF file directly to email, messaging, etc.
2. **Download fallback** (desktop / unsupported) — downloads the PDF file.
3. **Print** — opens the browser's print dialog.

## Adding future checklists

To add a new checklist (e.g., Trailer Safety Check):

1. **Create the YAML config** — `config/trailer_safety_check.yaml` following the same structure.

2. **Create a PDF renderer** — `src/pdf/trailerReport.js` that uses PdfWriter to lay out the specific form.

3. **Update `render.js`** — Change the placeholder button on the landing page to an active button.

4. **Update `main.js`** — Add the config loading and PDF generation for the new checklist type.

5. **Update `service-worker.js`** — Add the new files to the `APP_SHELL` array and bump `CACHE_NAME`.

## Offline behavior

- The app caches all files via Service Worker on first load.
- Works fully offline after the initial visit.
- Checklist progress is saved to IndexedDB with debounced writes (250ms).
- State persists across app close/reopen until explicitly reset.
- Online/offline status is shown in the checklist header.

## Theming

Light and dark themes are available via the toggle on the landing page. Theme preference is stored in localStorage.
