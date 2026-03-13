/**
 * PSAR OHS Checklist Suite — Main application module
 *
 * Handles routing, state management, persistence, and event delegation.
 * Mirrors the SAR Checklist App architecture with adaptations for
 * OHS inspection checklists (OK/N/A/Notes pattern, PDF output).
 *
 * Supports multiple checklists via per-checklist config caching and
 * per-checklist state persistence (session_<checklistId> keys).
 */

import { loadChecklistConfig } from './model/configLoader.js';
import { getValue, setValue } from './storage/db.js';
import {
  renderLanding, renderChecklist, renderReport, getAllInspectionIds
} from './ui/render.js';
import { generateChecklistPdf } from './pdf/checklistReport.js';

/* ---- Config cache ---- */

const configCache = {};

async function loadConfigForChecklist(checklistId) {
  if (configCache[checklistId]) {
    config = configCache[checklistId];
    return;
  }
  const result = await loadChecklistConfig(checklistId);
  if (result.ok) {
    configCache[checklistId] = result.config;
    config = result.config;
  } else {
    config = null;
  }
}

/* ---- State ---- */

let config = null;
let state = defaultState();

function defaultState(checklistId) {
  return {
    checklistId: checklistId || 'vehicle_safety_check',
    startedAt: null,
    fields: {},            // Header fields: date, inspector_name, etc.
    items: {},             // Inspection status: { itemId: 'ok' | 'na' }
    notes: {},             // Per-item notes: { itemId: 'text' }
    conclusion: {},        // Conclusion fields: overall_status, comments, signatures
    collapsedSections: []
  };
}

/* ---- Persistence (debounced, IndexedDB) ---- */

let saveTimer = null;

function debounceSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await setValue(`session_${state.checklistId}`, state);
  }, 250);
}

async function hydrate(checklistId) {
  const key = `session_${checklistId}`;
  let saved = await getValue(key, null);

  // Migrate legacy 'session' key → 'session_vehicle_safety_check'
  if (!saved && checklistId === 'vehicle_safety_check') {
    saved = await getValue('session', null);
    if (saved) {
      // Persist under the new per-checklist key and remove the old one
      await setValue(key, saved);
      await setValue('session', undefined);
    }
  }

  // Legacy localStorage fallback (only for vehicle_safety_check)
  if (!saved && checklistId === 'vehicle_safety_check') {
    try {
      const raw = localStorage.getItem('ohs-checklist-session');
      if (raw) {
        saved = JSON.parse(raw);
        localStorage.removeItem('ohs-checklist-session');
      }
    } catch { /* ignore */ }
  }

  if (saved) {
    state = { ...defaultState(checklistId), ...saved, checklistId };
    if (!Array.isArray(state.collapsedSections)) state.collapsedSections = [];
    if (typeof state.items !== 'object' || state.items === null) state.items = {};
    if (typeof state.notes !== 'object' || state.notes === null) state.notes = {};
    if (typeof state.fields !== 'object' || state.fields === null) state.fields = {};
    if (typeof state.conclusion !== 'object' || state.conclusion === null) state.conclusion = {};
  } else {
    state = defaultState(checklistId);
  }
}

/* ---- Theme ---- */

function loadTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  route();
}

/* ---- Date prefill ---- */

function prefillDates() {
  if (!config) return;
  const today = new Date().toISOString().slice(0, 10);

  // Header fields
  if (config.header_fields) {
    for (const [id, field] of Object.entries(config.header_fields)) {
      if (field.prefill === 'today' && !state.fields[id]) {
        state.fields[id] = today;
      }
    }
  }

  // Conclusion date fields
  if (config.conclusion) {
    for (const [id, field] of Object.entries(config.conclusion)) {
      if (field && field.prefill === 'today' && !state.conclusion[id]) {
        state.conclusion[id] = today;
      }
    }
  }
}

/* ---- Routing ---- */

async function route() {
  const hash = location.hash || '#/';
  const viewRoot = document.getElementById('view-root');

  if (hash === '#/' || hash === '#') {
    config = null;
    viewRoot.innerHTML = renderLanding();
  } else if (hash.startsWith('#/checklist/')) {
    const id = hash.split('/')[2];
    await loadConfigForChecklist(id);
    if (!config) {
      location.hash = '#/';
      return;
    }
    // Load per-checklist state when switching checklists
    if (state.checklistId !== id) {
      await hydrate(id);
    }
    if (!state.startedAt) {
      state.startedAt = new Date().toISOString();
    }
    prefillDates();
    debounceSave();
    viewRoot.innerHTML = renderChecklist(config, state);
    updateConnectivity();
  } else if (hash === '#/report') {
    viewRoot.innerHTML = renderReport(config, state);
  } else {
    location.hash = '#/';
  }
}

/* ---- Event delegation ---- */

function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  switch (action) {
    case 'open-checklist': {
      const id = btn.dataset.id;
      location.hash = `#/checklist/${id}`;
      break;
    }
    case 'toggle-theme':
      toggleTheme();
      break;

    case 'show-qr':
      showQrOverlay();
      break;

    case 'back':
      location.hash = '#/';
      break;

    case 'back-to-checklist':
      location.hash = `#/checklist/${state.checklistId}`;
      break;

    case 'toggle-section': {
      const sectionId = btn.dataset.section;
      const idx = state.collapsedSections.indexOf(sectionId);
      if (idx >= 0) state.collapsedSections.splice(idx, 1);
      else state.collapsedSections.push(sectionId);
      const body = document.querySelector(`[data-section-body="${sectionId}"]`);
      const chevron = btn.querySelector('.section-chevron');
      if (body) body.classList.toggle('collapsed');
      if (chevron) chevron.classList.toggle('rotated');
      debounceSave();
      break;
    }
    case 'expand-all':
      state.collapsedSections = [];
      document.querySelectorAll('.section-body').forEach(el => el.classList.remove('collapsed'));
      document.querySelectorAll('.section-chevron').forEach(el => el.classList.remove('rotated'));
      debounceSave();
      break;

    case 'collapse-all':
      if (config) {
        state.collapsedSections = Object.keys(config.sections);
        document.querySelectorAll('.section-body').forEach(el => el.classList.add('collapsed'));
        document.querySelectorAll('.section-chevron').forEach(el => el.classList.add('rotated'));
        debounceSave();
      }
      break;

    case 'set-status': {
      const itemId = btn.dataset.item;
      const status = btn.dataset.status;
      // Toggle: if already set to this status, clear it
      if (state.items[itemId] === status) {
        delete state.items[itemId];
      } else {
        state.items[itemId] = status;
      }
      updateInspectionItem(itemId);
      updateProgress();
      debounceSave();
      break;
    }

    case 'toggle-item-notes': {
      const itemId = btn.dataset.item;
      const notesDiv = document.querySelector(`[data-notes-for="${itemId}"]`);
      if (notesDiv) {
        notesDiv.classList.toggle('hidden');
        if (!notesDiv.classList.contains('hidden')) {
          const input = notesDiv.querySelector('input');
          if (input) input.focus();
        }
      }
      break;
    }

    case 'generate-report':
      location.hash = '#/report';
      break;

    case 'share-pdf':
      sharePdf();
      break;

    case 'download-pdf':
      downloadPdf();
      break;

    case 'print':
      window.print();
      break;

    case 'reset':
      if (confirm('Reset checklist? This will clear all progress.')) {
        const currentId = state.checklistId;
        state = defaultState(currentId);
        debounceSave();
        location.hash = '#/';
      }
      break;
  }
}

function handleInput(e) {
  const el = e.target;

  // Header / text fields
  if (el.dataset.field) {
    state.fields[el.dataset.field] = el.value;
    debounceSave();
  }

  // Per-item notes
  if (el.dataset.itemNotes) {
    state.notes[el.dataset.itemNotes] = el.value;
    // Update notes toggle button styling
    const toggleBtn = document.querySelector(`[data-action="toggle-item-notes"][data-item="${el.dataset.itemNotes}"]`);
    if (toggleBtn) {
      toggleBtn.classList.toggle('has-notes', !!el.value);
    }
    debounceSave();
  }

  // Conclusion fields (text, textarea)
  if (el.dataset.conclusion && el.type !== 'radio') {
    state.conclusion[el.dataset.conclusion] = el.value;
    debounceSave();
  }
}

function handleChange(e) {
  const el = e.target;

  // Conclusion radio buttons
  if (el.dataset.conclusion && el.type === 'radio') {
    state.conclusion[el.dataset.conclusion] = el.value;
    debounceSave();
  }

  // Date inputs may only fire 'change' (not 'input') on some mobile browsers
  if (el.type === 'date') {
    if (el.dataset.field) {
      state.fields[el.dataset.field] = el.value;
      debounceSave();
    }
    if (el.dataset.conclusion) {
      state.conclusion[el.dataset.conclusion] = el.value;
      debounceSave();
    }
  }
}

/* ---- Partial DOM updates ---- */

function updateInspectionItem(itemId) {
  const buttons = document.querySelectorAll(`[data-action="set-status"][data-item="${itemId}"]`);
  const status = state.items[itemId];

  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
}

function updateProgress() {
  if (!config) return;

  for (const [sectionId, section] of Object.entries(config.sections)) {
    const inspItems = Object.entries(section.items || {}).filter(([_, i]) => i.type === 'inspection');
    const done = inspItems.filter(([id]) => state.items[id]).length;
    const badge = document.querySelector(`[data-section="${sectionId}"] .section-progress`);
    if (badge) badge.textContent = `${done}/${inspItems.length}`;
  }

  const allInsp = getAllInspectionIds(config.sections);
  const totalDone = allInsp.filter(id => state.items[id]).length;
  const overall = document.querySelector('.overall-progress');
  if (overall) overall.textContent = `${totalDone}/${allInsp.length}`;
}

/* ---- PDF generation & sharing ---- */

function generatePdfBlob() {
  const pdfBytes = generateChecklistPdf(config, state);
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

function buildPdfFilename() {
  const date = state.fields.date || new Date().toISOString().slice(0, 10);
  const identifier = state.fields.vehicle_rego
    || state.fields.trailer_rego
    || state.fields.asset_id
    || 'checklist';
  const safeName = identifier.replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefix = config && config.title
    ? config.title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_')
    : 'Checklist';
  return `${prefix}_${safeName}_${date}.pdf`;
}

async function sharePdf() {
  const shareTitle = (config && config.title) || 'OHS Checklist';
  try {
    const blob = generatePdfBlob();
    const filename = buildPdfFilename();
    const file = new File([blob], filename, { type: 'application/pdf' });

    // Try native share with file
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: shareTitle,
        files: [file]
      });
      return;
    }

    // Fallback: download the PDF
    downloadBlob(blob, filename);
    showToast('PDF downloaded (sharing not supported on this device)');
  } catch (err) {
    if (err.name !== 'AbortError') {
      // User didn't cancel, try download fallback
      try {
        const blob = generatePdfBlob();
        downloadBlob(blob, buildPdfFilename());
        showToast('PDF downloaded');
      } catch {
        showToast('Unable to generate PDF');
      }
    }
  }
}

function downloadPdf() {
  try {
    const blob = generatePdfBlob();
    downloadBlob(blob, buildPdfFilename());
    showToast('PDF downloaded');
  } catch {
    showToast('Unable to generate PDF');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---- Toast ---- */

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 1800);
}

/* ---- QR overlay ---- */

function showQrOverlay() {
  if (document.getElementById('qr-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'qr-overlay';
  overlay.innerHTML = '<img src="./assets/PSAR_OHS_Checklist_Suite_QR.png" alt="QR Code">';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
}

/* ---- Connectivity ---- */

function updateConnectivity() {
  const pill = document.getElementById('connectivity-pill');
  if (!pill) return;
  const online = navigator.onLine;
  pill.textContent = online ? 'Online' : 'Offline';
  pill.className = `connectivity-pill ${online ? 'online' : 'offline'}`;
}

/* ---- Service Worker ---- */

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js');
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading) { reloading = true; location.reload(); }
    });
  } catch { /* SW not supported or registration failed */ }
}

/* ---- Init ---- */

async function init() {
  loadTheme();

  const pkgInfo = await fetch('./package.json')
    .then(r => r.json())
    .catch(() => ({ version: '?', buildDate: '' }));

  // Version stamp
  const stamp = document.getElementById('build-stamp');
  if (stamp) stamp.textContent = `v${pkgInfo.version} \u00b7 ${pkgInfo.buildDate}`;

  // Event delegation
  const viewRoot = document.getElementById('view-root');
  viewRoot.addEventListener('click', handleClick);
  viewRoot.addEventListener('input', handleInput);
  viewRoot.addEventListener('change', handleChange);

  // Routing
  window.addEventListener('hashchange', () => route());
  window.addEventListener('online', updateConnectivity);
  window.addEventListener('offline', updateConnectivity);

  await route();
  registerSW();
}

init();
