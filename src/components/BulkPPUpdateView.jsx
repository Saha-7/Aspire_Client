// src/components/BulkPPUpdateView.jsx
// ─────────────────────────────────────────────────────────────
// Bulk Purchase Price update via CSV upload.
// 3 stages:
//   Stage 1 — Download blank template + instructions
//   Stage 2 — Upload filled CSV, client-side parse + validate
//   Stage 3 — Preview table (valid + warning + unidentified rows), confirm import
//
// KEY BEHAVIOURS (updated):
//   - Unidentified SKUs (not found in DB) are WARNINGS, not blockers.
//     They are passed to bulkUpdatePP() and stored in UnIdentifiedProducts.
//   - Client-format errors (empty SKU, bad PP, duplicate) still block import.
//   - % change column shows how much new PP differs from current PP (≥10% = warning badge).
//     Green = increase, Red = decrease. Only shown for matched SKUs.
// ─────────────────────────────────────────────────────────────

import { useState, useRef } from 'react';
import { downloadPPTemplate, validateBulkPP, bulkUpdatePP, fetchStockSnapshot, bulkUpdateStock } from '../services/api';

// ── Stage constants ───────────────────────────────────────────
const STAGE = { UPLOAD: 'upload', PREVIEW: 'preview', DONE: 'done' };

// ── Formatters ────────────────────────────────────────────────
const fmt = (val) =>
  val != null
    ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '—';

// ── % change calculation ──────────────────────────────────────
// Returns null if currentPP is unavailable or new PP is invalid.
function calcPctChange(currentPP, newPP) {
  if (currentPP == null || currentPP === 0 || newPP == null) return null;
  return ((newPP - currentPP) / currentPP) * 100;
}

// Live Shopify stock is read for every uploaded SKU, so stock uploads are capped
// (keep in sync with the 500-row limit on /api/bulk-update-stock).
const MAX_STOCK_SKUS = 500;

// ── CSV helpers ───────────────────────────────────────────────
// Split one CSV line honouring "quoted, cells" and "" escapes.
function splitCSVLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
const cleanCell = (v) => String(v ?? '').replace(/[^\x20-\x7E]/g, '').trim();

// ── Parse CSV text → { rows, locations, fileErrors } ──────────
// Columns: SKU, PP, then ANY number of location columns (Delhi, Mumbai, ...).
//   - blank PP        → PP not touched for that row
//   - all location cells blank → stock not touched for that row
//   - location cell:  number → stock (0 = active, no stock) · NA → location inactive
//                     blank  → 0 if the location is active, stays inactive otherwise
// Strips UTF-8 BOM that Excel adds.
function parseCSV(text) {
  const cleaned = text.replace(/^\uFEFF/, '');

  const lines = cleaned
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], locations: [], fileErrors: ['The file is empty.'] };
  }

  const headerCells = splitCSVLine(lines[0]).map(cleanCell);

  if (headerCells[0]?.toLowerCase() !== 'sku' || headerCells[1]?.toLowerCase() !== 'pp') {
    return {
      rows: [], locations: [],
      fileErrors: [
        `Invalid headers. Expected "SKU,PP,<location columns>" but got "${lines[0].replace(/[^\x20-\x7E]/g, '')}". ` +
        'Download the template and use it as the starting point.',
      ],
    };
  }

  // Location columns = every non-empty header after SKU and PP
  const locations = []; // [{ name, idx }]
  const seenLoc = new Set();
  for (let c = 2; c < headerCells.length; c++) {
    const name = headerCells[c];
    if (!name) continue;
    if (seenLoc.has(name.toLowerCase())) {
      return { rows: [], locations: [], fileErrors: [`Location column "${name}" appears more than once.`] };
    }
    seenLoc.add(name.toLowerCase());
    locations.push({ name, idx: c });
  }
  const hasLocations = locations.length > 0;

  if (lines.length === 1) {
    return { rows: [], locations: [], fileErrors: ['The file has headers but no data rows.'] };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i]);
    const rawSKU = cleanCell(parts[0]);
    const rawPP  = cleanCell(parts[1]);
    const stock  = {};
    for (const loc of locations) stock[loc.name] = cleanCell(parts[loc.idx]);
    rows.push({ sku: rawSKU, rawPP, stock, rowNum: i + 1, errors: [] });
  }

  // A row is "active" if it provides a PP, or if the file has location
  // columns (a blank location means 0, so the row always carries stock info).
  const isActiveRow = (row) => (row.rawPP !== '' && row.rawPP !== null) || hasLocations;

  // Duplicate-SKU check — only among active rows.
  const seenSKUs = new Map();
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (!isActiveRow(row)) continue;

    const skuKey = row.sku.toLowerCase();
    if (seenSKUs.has(skuKey)) {
      const firstIdx = seenSKUs.get(skuKey);
      if (!rows[firstIdx].errors.includes('Duplicate SKU')) {
        rows[firstIdx].errors.push('Duplicate SKU');
      }
      row.errors.push('Duplicate SKU');
    } else {
      seenSKUs.set(skuKey, idx);
    }
  }

  for (const row of rows) {
    const ppProvided = row.rawPP !== '' && row.rawPP !== null;

    // Nothing to do for this row: no PP, and no stock typed in any location column.
    const stockAllBlank = locations.every(loc => row.stock[loc.name] === '');
    if (!ppProvided && stockAllBlank) {
      row.skipped = true;
      continue;
    }

    if (!row.sku) {
      row.errors.push('SKU is empty');
    }

    if (ppProvided) {
      const ppNum = parseFloat(row.rawPP);
      if (isNaN(ppNum)) {
        row.errors.push(`PP "${row.rawPP}" is not a number`);
      } else if (ppNum <= 0) {
        row.errors.push('PP must be greater than 0');
      } else {
        row.pp = ppNum;
      }
    }

    for (const loc of locations) {
      const v = row.stock[loc.name];
      if (v !== '' && !/^(na|n\/a)$/i.test(v) && !/^-?\d+$/.test(v)) {
        row.errors.push(`Stock for ${loc.name} "${v}" must be a whole number, 0, or NA`);
      }
    }
  }

  return { rows, locations: locations.map(l => l.name), fileErrors: [] };
}

// ── Stock diff for one row against the live snapshot ──────────
// snapshot.stock: { [skuLower]: { [locationName]: qty } }  - only ACTIVE locations
// are present; a location missing there is inactive (NA).
// Mirrors the server rules (inventoryService.decideCell); the server re-checks.
//   active   + number  → set quantity       active   + blank → set 0     active + NA → error
//   inactive + number  → error (locations are activated in Shopify only)
//   inactive + NA/blank → nothing
function computeStockChanges(row, locations, snapshot) {
  const changes = [];
  const errors  = [];
  if (!snapshot || locations.length === 0) return { changes, errors };

  // Every location cell blank = stock not touched for this row (nothing is zeroed).
  if (locations.every(loc => (row.stock?.[loc] ?? '').trim() === '')) return { changes, errors };

  const levels = snapshot.stock[(row.sku || '').toLowerCase()] || {};
  const byKey  = {};
  for (const [name, qty] of Object.entries(levels)) byKey[name.toLowerCase()] = { name, qty };

  for (const loc of locations) {
    const raw  = (row.stock?.[loc] ?? '').trim();
    const lv   = byKey[loc.toLowerCase()];
    const isNA = /^(na|n\/a)$/i.test(raw);

    if (lv) {                                   // location is active
      if (isNA) { errors.push(`${loc} is active — NA cannot deactivate it (use 0 for no stock)`); continue; }
      const newQty = raw === '' ? 0 : parseInt(raw, 10);
      if (newQty === lv.qty) continue;
      if (newQty < 0) { errors.push(`${loc}: negative stock cannot be entered`); continue; }
      changes.push({ loc: lv.name, oldQty: lv.qty, newQty, action: 'set' });
    } else {                                    // location is inactive (NA)
      if (isNA || raw === '') continue;
      errors.push(`${loc} is not active for this SKU in Shopify — activate it in Shopify first, then upload again`);
    }
  }
  return { changes, errors };
}

// ── Drop zone component ───────────────────────────────────────
function DropZone({ onFile, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleChange(e) {
    const file = e.target.files[0];
    if (file) onFile(file);
    e.target.value = '';
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center gap-3
        border-2 border-dashed rounded-xl px-8 py-12
        transition-colors cursor-pointer
        ${disabled ? 'opacity-50 cursor-not-allowed border-slate-700' :
          dragging
            ? 'border-violet-400 bg-violet-900/20'
            : 'border-slate-600 hover:border-violet-500 hover:bg-slate-800/40'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
      <div className="w-10 h-10 rounded-xl bg-slate-700/60 flex items-center justify-center">
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm text-slate-300 font-medium">
          {dragging ? 'Drop it here' : 'Drop CSV file here'}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">or click to browse</p>
      </div>
    </div>
  );
}

// ── PP % change badge ─────────────────────────────────────────
// Green for increase, red for decrease. Only shown when |pct| ≥ 10%.
function PPChangeBadge({ currentPP, newPP }) {
  const pct = calcPctChange(currentPP, newPP);

  // No current PP available (new product in system but no PP stored)
  if (pct === null) {
    return <span className="text-slate-600 text-[10px]">—</span>;
  }

  const absPct = Math.abs(pct);
  const isIncrease = pct > 0;

  // Under 10% change — show faint indicator, no warning
  if (absPct < 10) {
    return (
      <span className="text-slate-500 text-[10px]">
        {isIncrease ? '+' : ''}{pct.toFixed(1)}%
      </span>
    );
  }

  // ≥ 10% — show prominent warning badge
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`
        inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold
        ${isIncrease
          ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/60'
          : 'bg-red-900/50 text-red-400 border border-red-700/60'
        }
      `}>
        {isIncrease ? (
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
          </svg>
        ) : (
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
        )}
        {isIncrease ? '+' : ''}{pct.toFixed(1)}%
      </span>
      <span className={`text-[9px] ${isIncrease ? 'text-emerald-600' : 'text-red-600'}`}>
        ⚠ Large change
      </span>
    </div>
  );
}

// ── Row status badge ──────────────────────────────────────────
// Four variants now: valid, client-error, unidentified (warning), skipped
function StatusBadge({ errors, isUnidentified, skipped }) {
  if (skipped) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Skipped — no PP provided
      </span>
    );
  }

  if (errors.length > 0) {
    return (
      <div className="flex flex-col gap-0.5">
        {errors.map((e, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400">
            <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {e}
          </span>
        ))}
      </div>
    );
  }

  if (isUnidentified) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400">
        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        SKU not found in system
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      Valid
    </span>
  );
}

// ── Main component ────────────────────────────────────────────
export default function BulkPPUpdateView({ onClose, user }) {
  const [stage, setStage]               = useState(STAGE.UPLOAD);
  const [fileName, setFileName]         = useState('');
  const [parsedRows, setParsedRows]     = useState([]);
  const [fileErrors, setFileErrors]     = useState([]);
  // Map of lowercase SKU → { found: bool, currentPP: number|null }
  const [skuValidation, setSkuValidation] = useState({});
  const [validating, setValidating]     = useState(false);
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  // Per-location stock (only used when the CSV has location columns)
  const [locations, setLocations]       = useState([]);       // location header names from the file
  const [stockSnapshot, setStockSnapshot] = useState(null);   // live stock from Shopify
  const [stockResult, setStockResult]   = useState(null);
  const [stockError, setStockError]     = useState(null);

  // ── Download blank template ───────────────────────────────
  async function handleDownloadTemplate() {
    setDownloadLoading(true);
    try {
      await downloadPPTemplate();
    } catch (err) {
      console.error('Template download failed:', err);
    } finally {
      setDownloadLoading(false);
    }
  }

  // ── Handle file selected ──────────────────────────────────
  async function handleFile(file) {
    if (!file.name.endsWith('.csv')) {
      setFileErrors(['Please upload a .csv file.']);
      return;
    }

    setFileName(file.name);
    setFileErrors([]);
    setParsedRows([]);
    setSkuValidation({});
    setLocations([]);
    setStockSnapshot(null);

    const text = await file.text();
    const { rows, locations: locNames, fileErrors: ferrs } = parseCSV(text);

    if (ferrs.length > 0) {
      setFileErrors(ferrs);
      return;
    }

    setParsedRows(rows);
    setLocations(locNames);

    // Only validate rows that passed client-side checks AND actually
    // provide a PP — rows with no PP are skipped entirely, no need to
    // check whether their SKU exists at all.
    const clientValidRows = rows.filter(r => r.errors.length === 0 && !r.skipped);
    if (clientValidRows.length === 0) {
      setStage(STAGE.PREVIEW);
      return;
    }

    setValidating(true);
    try {
      const skusToCheck = clientValidRows.map(r => r.sku);
      // Returns { valid: [{ sku, currentPP }], notFound: string[] }
      const result = await validateBulkPP(skusToCheck);

      const validation = {};

      // Mark found SKUs with their current PP
      for (const item of (result.valid || [])) {
        validation[item.sku.toLowerCase()] = { found: true, currentPP: item.currentPP };
      }
      // Mark not-found SKUs
      for (const sku of (result.notFound || [])) {
        validation[sku.toLowerCase()] = { found: false, currentPP: null };
      }

      setSkuValidation(validation);

      // Per-location stock: load live current stock so the preview can show
      // exactly what will change, and reject unknown location columns early.
      if (locNames.length > 0) {
        if (skusToCheck.length > MAX_STOCK_SKUS) {
          setFileErrors([
            `Too many SKUs for a stock update (${skusToCheck.length}). Upload at most ${MAX_STOCK_SKUS} SKUs at a time when the file has location columns.`,
          ]);
          setValidating(false);
          return;
        }
        const snap = await fetchStockSnapshot(skusToCheck);
        const known = new Set(snap.locations.map(l => l.toLowerCase()));
        const unknown = locNames.filter(l => !known.has(l.toLowerCase()));
        if (unknown.length > 0) {
          setFileErrors([
            `Unknown location column(s): ${unknown.join(', ')}. Valid locations: ${snap.locations.join(', ')}.`,
          ]);
          setValidating(false);
          return;
        }
        setStockSnapshot(snap);
      }
    } catch (err) {
      const msg = err?.response?.data?.error;
      setFileErrors([msg ? `Validation failed: ${msg}` : 'Server validation failed. Check the API server.']);
      setValidating(false);
      return;
    }
    setValidating(false);
    setStage(STAGE.PREVIEW);
  }

  // ── Compute final row status split ────────────────────────
  const rowsWithStatus = parsedRows.map(row => {
    // No PP provided — skipped entirely, never looked up against the DB
    if (row.skipped) {
      return { ...row, isUnidentified: false, currentPP: null };
    }

    const key = (row.sku || '').toLowerCase();
    const v   = skuValidation[key];

    // Client-side format error → hard error (blocks import)
    if (row.errors.length > 0) {
      return { ...row, isUnidentified: false, currentPP: null };
    }

    // Not validated yet (shouldn't happen, but guard)
    if (!v) {
      return { ...row, isUnidentified: false, currentPP: null };
    }

    // Found in DB → valid, show % change (+ per-location stock changes)
    if (v.found) {
      const { changes, errors: stockErrors } = computeStockChanges(row, locations, stockSnapshot);
      return {
        ...row,
        errors: [...row.errors, ...stockErrors],
        isUnidentified: false,
        currentPP: v.currentPP,
        stockChanges: changes,
      };
    }

    // Not found in DB → unidentified (warning, not blocking)
    return { ...row, isUnidentified: true, currentPP: null };
  });

  // Skipped = no PP provided at all — excluded from every other bucket,
  // never validated, never sent to the server.
  const skippedRows      = rowsWithStatus.filter(r => r.skipped);
  // Hard errors = client-side format issues (duplicate, empty SKU, bad PP)
  const hardErrorRows    = rowsWithStatus.filter(r => !r.skipped && r.errors.length > 0);
  // Unidentified = SKU not in DB (will be stored in UnIdentifiedProducts)
  const unidentifiedRows = rowsWithStatus.filter(r => !r.skipped && r.errors.length === 0 && r.isUnidentified);
  // Valid = matched in DB, will update InternalProducts
  const validRows        = rowsWithStatus.filter(r => !r.skipped && r.errors.length === 0 && !r.isUnidentified);
  // Large change warnings (≥10%, for display only — does NOT block)
  const largeChangeCount = validRows.filter(r => {
    const pct = calcPctChange(r.currentPP, r.pp);
    return pct !== null && Math.abs(pct) >= 10;
  }).length;

  // Per-location stock summary (preview only; the server re-checks against live stock on import)
  const stockChangeRows  = validRows.filter(r => r.stockChanges?.length > 0);
  const stockChangeCount = stockChangeRows.reduce((n, r) => n + r.stockChanges.length, 0);
  const zeroingCount     = stockChangeRows.reduce(
    (n, r) => n + r.stockChanges.filter(c => c.newQty === 0 && c.oldQty > 0).length, 0);

  // Import is allowed if there are no hard format errors AND there's at least one row to do something with
  const canImport = hardErrorRows.length === 0 && (validRows.length > 0 || unidentifiedRows.length > 0);

  // ── Handle import ─────────────────────────────────────────
  // 1) PP update (existing endpoint)  2) stock update → Shopify (new endpoint).
  // The stock step only sends rows the preview found changes for; the server
  // re-reads live stock, diffs again, pushes only real changes and logs them.
  async function handleImport() {
    if (!canImport) return;
    setImporting(true);
    setFileErrors([]);

    let ppResult = null;
    try {
      const payload      = validRows.filter(r => r.pp != null).map(r => ({ skuId: r.sku, newPP: r.pp }));
      const unidentified = unidentifiedRows.map(r => ({ sku: r.sku, pp: r.pp ?? null }));
      if (payload.length > 0 || unidentified.length > 0) {
        ppResult = await bulkUpdatePP(payload, unidentified, fileName);
      }
    } catch (err) {
      setFileErrors([err?.response?.data?.error || err.message || 'Import failed']);
      setImporting(false);
      return;
    }

    let stockRes = null;
    let stockErr = null;
    const stockRows = validRows
      .filter(r => r.stockChanges?.length > 0)
      .map(r => ({ skuId: r.sku, stock: r.stock }));
    if (stockRows.length > 0) {
      try {
        stockRes = await bulkUpdateStock(stockRows, fileName, ppResult?.sessionId ?? null);
      } catch (err) {
        stockErr = err?.response?.data?.error || err.message || 'Stock update failed';
      }
    }

    setStockResult(stockRes);
    setStockError(stockErr);
    setImportResult(ppResult || {
      updated: 0,
      unidentifiedCount: 0,
      updatedBy: stockRes?.updatedBy || user?.email || '',
      updatedAt: stockRes?.updatedAt || new Date().toISOString(),
    });
    setStage(STAGE.DONE);
    setImporting(false);
  }

  // ── Reset to upload stage ─────────────────────────────────
  function handleReset() {
    setStage(STAGE.UPLOAD);
    setFileName('');
    setParsedRows([]);
    setFileErrors([]);
    setSkuValidation({});
    setImportResult(null);
    setLocations([]);
    setStockSnapshot(null);
    setStockResult(null);
    setStockError(null);
  }

  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">

      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1100px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="w-px h-5 bg-slate-700" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-600/80 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Bulk PP Update</h1>
                <p className="text-xs text-slate-500">Upload a CSV to update multiple purchase prices at once</p>
              </div>
            </div>
          </div>

          {/* Stage indicator */}
          <div className="flex items-center gap-2">
            {['Upload', 'Preview', 'Done'].map((label, i) => {
              const stageKey = [STAGE.UPLOAD, STAGE.PREVIEW, STAGE.DONE][i];
              const isActive  = stage === stageKey;
              const isDone    = (
                (stageKey === STAGE.UPLOAD  && stage !== STAGE.UPLOAD) ||
                (stageKey === STAGE.PREVIEW && stage === STAGE.DONE)
              );
              return (
                <div key={label} className="flex items-center gap-2">
                  {i > 0 && <div className="w-4 h-px bg-slate-700" />}
                  <div className={`flex items-center gap-1.5 text-xs font-medium
                    ${isActive ? 'text-violet-400' : isDone ? 'text-emerald-400' : 'text-slate-600'}`}
                  >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold
                      ${isActive ? 'bg-violet-600 text-white' :
                        isDone   ? 'bg-emerald-600 text-white' :
                                   'bg-slate-700 text-slate-500'}`}
                    >
                      {isDone ? '✓' : i + 1}
                    </div>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-10">

        {/* ══════════════════════════════════════════════════════
            STAGE 1 — UPLOAD
        ══════════════════════════════════════════════════════ */}
        {stage === STAGE.UPLOAD && (
          <div className="max-w-2xl mx-auto">

            {/* Instructions card */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-6 mb-6">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                How to use
              </h2>
              <ol className="space-y-3">
                {[
                  { n: '1', text: 'Download the CSV below (or use "Download CSV" on the PP Update page to get products pre-filled with live PP and stock). Columns: SKU, PP, then one column per vendor location.' },
                  { n: '2', text: 'Enter the new purchase price and the stock count per location. NA = location not active for that SKU (locations are activated in Shopify, not here), 0 = active but no stock. Only stock counts are updated, and they are pushed to Shopify.' },
                  { n: '3', text: "Save the file as CSV and upload it here. You'll see a preview of every PP and stock change before anything is saved." },
                ].map(item => (
                  <li key={item.n} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-violet-900/60 border border-violet-700/60
                      text-violet-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {item.n}
                    </span>
                    <span className="text-xs text-slate-300 leading-relaxed">{item.text}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Template format preview */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 mb-6">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">
                Template format
              </p>
              <div className="font-mono text-xs">
                <div className="flex gap-0">
                  <div className="bg-slate-700/60 text-slate-300 px-4 py-1.5 rounded-tl-md border-b border-slate-600 font-semibold">SKU</div>
                  <div className="bg-slate-700/60 text-slate-300 px-4 py-1.5 border-b border-l border-slate-600 font-semibold w-20">PP</div>
                  <div className="bg-slate-700/60 text-slate-300 px-4 py-1.5 border-b border-l border-slate-600 font-semibold w-24">Delhi</div>
                  <div className="bg-slate-700/60 text-slate-300 px-4 py-1.5 rounded-tr-md border-b border-l border-slate-600 font-semibold w-24">Mumbai</div>
                </div>
                {[
                  ['AMD-5600X', '6900', '12', '5'],
                  ['INTEL-12400F', '7200', 'NA', '8'],
                  ['CP-9020281-IN', '3500', '3', '0'],
                ].map(([sku, pp, a, b], i) => (
                  <div key={i} className="flex">
                    <div className={`px-4 py-1 text-violet-300 border-b border-slate-700/60 w-36
                      ${i === 2 ? 'rounded-bl-md' : ''}`}>{sku}</div>
                    <div className="px-4 py-1 text-emerald-300 border-b border-l border-slate-700/60 w-20">{pp}</div>
                    <div className="px-4 py-1 text-sky-300 border-b border-l border-slate-700/60 w-24">{a}</div>
                    <div className={`px-4 py-1 text-sky-300 border-b border-l border-slate-700/60 w-24
                      ${i === 2 ? 'rounded-br-md' : ''}`}>{b}</div>
                  </div>
                ))}
                <p className="text-[10px] text-slate-500 mt-2 font-sans">
                  NA = location inactive (leave it as NA) · 0 = active, no stock · negative = overbooked. The real template has all your locations.
                </p>
              </div>
            </div>

            {/* Download button */}
            <button
              onClick={handleDownloadTemplate}
              disabled={downloadLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-6
                rounded-xl border border-emerald-700/60 bg-emerald-900/20 hover:bg-emerald-900/40
                text-emerald-400 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {downloadLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              {downloadLoading ? 'Preparing...' : 'Download CSV Template'}
            </button>

            {/* File errors */}
            {fileErrors.length > 0 && (
              <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 mb-4">
                {fileErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-400">{e}</p>
                ))}
              </div>
            )}

            {/* Drop zone */}
            <DropZone onFile={handleFile} disabled={validating} />

            {/* Validating spinner */}
            {validating && (
              <div className="flex items-center justify-center gap-2 mt-4 text-xs text-slate-400">
                <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                Validating SKUs against database...
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            STAGE 2 — PREVIEW
        ══════════════════════════════════════════════════════ */}
        {stage === STAGE.PREVIEW && (
          <div>
            {/* Summary bar */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs text-slate-400">{fileName}</span>
                </div>
                <span className="text-xs text-slate-500">{rowsWithStatus.length} rows parsed</span>
              </div>

              <div className="flex items-center gap-2">
                {validRows.length > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full
                    bg-emerald-900/40 text-emerald-400 border border-emerald-700/50">
                    ✅ {validRows.length} will update
                  </span>
                )}
                {largeChangeCount > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full
                    bg-amber-900/40 text-amber-400 border border-amber-700/50">
                    ⚠ {largeChangeCount} large change{largeChangeCount !== 1 ? 's' : ''}
                  </span>
                )}
                {locations.length > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full
                    bg-sky-900/40 text-sky-300 border border-sky-700/50">
                    📦 {stockChangeCount} stock change{stockChangeCount !== 1 ? 's' : ''}
                  </span>
                )}
                {zeroingCount > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full
                    bg-amber-900/40 text-amber-400 border border-amber-700/50">
                    ⚠ {zeroingCount} → 0
                  </span>
                )}
                {unidentifiedRows.length > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full
                    bg-amber-900/40 text-amber-400 border border-amber-700/50">
                    ⚠ {unidentifiedRows.length} unidentified
                  </span>
                )}
                {skippedRows.length > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full
                    bg-slate-800 text-slate-400 border border-slate-700">
                    — {skippedRows.length} skipped (nothing to update)
                  </span>
                )}
                {hardErrorRows.length > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full
                    bg-red-900/40 text-red-400 border border-red-700/50">
                    ❌ {hardErrorRows.length} error{hardErrorRows.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Hard error notice — blocks import */}
            {hardErrorRows.length > 0 && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/40 mb-3 text-xs text-red-300">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  {hardErrorRows.length} row{hardErrorRows.length !== 1 ? 's have' : ' has'} format errors (duplicate SKU, missing SKU, invalid PP, or an invalid stock value).
                  Correct the CSV and re-upload to proceed.
                </span>
              </div>
            )}

            {/* Unidentified notice — warning only, does NOT block */}
            {unidentifiedRows.length > 0 && hardErrorRows.length === 0 && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/40 mb-3 text-xs text-amber-300">
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  {unidentifiedRows.length} SKU{unidentifiedRows.length !== 1 ? 's were' : ' was'} not found in the system.
                  {validRows.length > 0 ? ` The ${validRows.length} matched SKU${validRows.length !== 1 ? 's' : ''} will still be updated. ` : ' '}
                  Unidentified SKUs will be saved to a separate log for review.
                </span>
              </div>
            )}

            {/* Stock notices */}
            {locations.length > 0 && stockSnapshot && stockSnapshot.source !== 'shopify-live' && hardErrorRows.length === 0 && (
              <div className="px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/40 mb-3 text-xs text-amber-300">
                Live Shopify stock could not be read{stockSnapshot.liveError ? ` (${stockSnapshot.liveError})` : ''}, so the preview uses the last synced values.
                Importing stock changes needs a live read and will be rejected until this is fixed.
              </div>
            )}
            {zeroingCount > 0 && hardErrorRows.length === 0 && (
              <div className="px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/40 mb-3 text-xs text-amber-300">
                {zeroingCount} location stock value{zeroingCount !== 1 ? 's' : ''} will be set to <span className="font-semibold text-white">0</span> (blank
                cells on active locations count as 0). Check the <span className="font-semibold text-white">Stock changes</span> column before confirming.
              </div>
            )}
            {/* Large change warning notice */}
            {largeChangeCount > 0 && hardErrorRows.length === 0 && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-600/60 mb-3 text-xs text-slate-300">
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  {largeChangeCount} product{largeChangeCount !== 1 ? 's have' : ' has'} a PP change of ≥10%. These are highlighted in the
                  <span className="font-semibold text-white"> PP Change</span> column — review before confirming.
                </span>
              </div>
            )}

            {/* Preview table */}
            <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-hidden mb-6">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700">
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider w-14">Row</th>
                    <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-400 uppercase tracking-wider">SKU</th>
                    <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-400 uppercase tracking-wider">Current PP</th>
                    <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-400 uppercase tracking-wider">New PP</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">PP Change</th>
                    {locations.length > 0 && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Stock changes</th>
                    )}
                    <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithStatus.map((row, i) => {
                    const hasHardError = row.errors.length > 0;
                    const rowBg = row.skipped
                      ? 'bg-slate-900/10 opacity-60'
                      : hasHardError
                      ? 'bg-red-900/10'
                      : row.isUnidentified
                      ? 'bg-amber-900/10'
                      : i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20';

                    return (
                      <tr key={i} className={`border-b border-slate-800 transition-colors ${rowBg}`}>
                        {/* Row # */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-slate-600 text-xs">{row.rowNum}</span>
                        </td>

                        {/* SKU */}
                        <td className="px-4 py-3">
                          <span className={`font-mono text-xs ${
                            row.skipped ? 'text-slate-500' :
                            hasHardError ? 'text-red-300' :
                            row.isUnidentified ? 'text-amber-300' :
                            'text-violet-300'
                          }`}>
                            {row.sku || <span className="text-slate-600 italic">empty</span>}
                          </span>
                        </td>

                        {/* Current PP */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-slate-500 text-xs">
                            {row.currentPP != null ? fmt(row.currentPP) : '—'}
                          </span>
                        </td>

                        {/* New PP */}
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-semibold ${
                            hasHardError ? 'text-slate-500' :
                            row.isUnidentified ? 'text-amber-400' :
                            'text-emerald-400'
                          }`}>
                            {row.pp ? fmt(row.pp) : (
                              <span className="text-slate-600 text-xs">{row.rawPP || '—'}</span>
                            )}
                          </span>
                        </td>

                        {/* PP Change % — only for matched rows */}
                        <td className="px-4 py-3 text-center">
                          {!hasHardError && !row.isUnidentified && row.pp != null ? (
                            <PPChangeBadge currentPP={row.currentPP} newPP={row.pp} />
                          ) : (
                            <span className="text-slate-700 text-[10px]">—</span>
                          )}
                        </td>

                        {/* Stock changes */}
                        {locations.length > 0 && (
                          <td className="px-4 py-3">
                            {!hasHardError && !row.isUnidentified && !row.skipped && row.stockChanges?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {row.stockChanges.map((c, k) => (
                                  <span key={k} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                    c.newQty === 0
                                      ? 'bg-red-900/30 text-red-300 border-red-700/40'
                                      : 'bg-sky-900/30 text-sky-300 border-sky-700/40'
                                  }`}>
                                    {c.loc} {c.oldQty} → {c.newQty}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-700 text-[10px]">—</span>
                            )}
                          </td>
                        )}

                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge errors={row.errors} isUnidentified={row.isUnidentified} skipped={row.skipped} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg
                  bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Upload different file
              </button>

              <button
                onClick={handleImport}
                disabled={!canImport || importing}
                className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg
                  transition-colors
                  ${canImport && !importing
                    ? 'bg-violet-600 hover:bg-violet-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  }`}
              >
                {importing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Importing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {!canImport && hardErrorRows.length > 0
                      ? `Fix ${hardErrorRows.length} error${hardErrorRows.length !== 1 ? 's' : ''} first`
                      : !canImport
                      ? 'No rows to process'
                      : validRows.length > 0 && unidentifiedRows.length > 0
                      ? `Confirm — Update ${validRows.length} + Log ${unidentifiedRows.length} unidentified`
                      : validRows.length > 0
                      ? `Confirm & Import ${validRows.length} row${validRows.length !== 1 ? 's' : ''}`
                      : `Log ${unidentifiedRows.length} unidentified SKU${unidentifiedRows.length !== 1 ? 's' : ''}`
                    }
                  </>
                )}
              </button>
            </div>

            {/* Import error */}
            {fileErrors.length > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-red-900/30 border border-red-700/50">
                {fileErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-400">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            STAGE 3 — DONE
        ══════════════════════════════════════════════════════ */}
        {stage === STAGE.DONE && importResult && (
          <div className="max-w-lg mx-auto text-center py-12">
            {/* Success icon */}
            <div className="w-16 h-16 rounded-2xl bg-emerald-900/40 border border-emerald-700/60
              flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Import Complete</h2>
            <p className="text-slate-400 text-sm mb-8">
              {importResult.updated > 0 && stockResult
                ? 'Purchase prices and stock have been updated.'
                : stockResult
                ? 'Stock has been updated in Shopify.'
                : 'Purchase prices have been updated successfully.'}
            </p>

            {/* Stock result */}
            {stockResult && (
              <div className="mb-6 text-left">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="rounded-xl border border-sky-700/40 bg-sky-900/20 p-4 text-center">
                    <p className="text-xs text-slate-500 mb-1">Pushed</p>
                    <p className="text-2xl font-bold text-sky-300">{stockResult.pushed}</p>
                    <p className="text-xs text-slate-500 mt-0.5">to Shopify</p>
                  </div>
                  <div className={`rounded-xl border p-4 text-center ${stockResult.failed > 0
                    ? 'border-red-700/40 bg-red-900/20' : 'border-slate-700/40 bg-slate-900/20'}`}>
                    <p className="text-xs text-slate-500 mb-1">Failed</p>
                    <p className={`text-2xl font-bold ${stockResult.failed > 0 ? 'text-red-400' : 'text-slate-400'}`}>{stockResult.failed}</p>
                    <p className="text-xs text-slate-500 mt-0.5">cells</p>
                  </div>
                  <div className="rounded-xl border border-slate-700/40 bg-slate-900/20 p-4 text-center">
                    <p className="text-xs text-slate-500 mb-1">Unchanged</p>
                    <p className="text-2xl font-bold text-slate-400">{stockResult.unchanged}</p>
                    <p className="text-xs text-slate-500 mt-0.5">cells</p>
                  </div>
                </div>
                {stockResult.failures?.length > 0 && (
                  <div className="rounded-xl bg-red-900/20 border border-red-700/40 px-4 py-3 text-xs text-red-300">
                    <p className="font-semibold mb-1">Not applied (re-upload to retry — unchanged cells are skipped):</p>
                    <ul className="space-y-0.5 font-mono text-[11px]">
                      {stockResult.failures.slice(0, 10).map((f, k) => (
                        <li key={k}>{f.sku} · {f.location}: {f.error}</li>
                      ))}
                      {stockResult.failures.length > 10 && <li>…and {stockResult.failures.length - 10} more</li>}
                    </ul>
                  </div>
                )}
                {stockResult.logWarning && (
                  <p className="mt-2 text-xs text-amber-300">{stockResult.logWarning}</p>
                )}
              </div>
            )}
            {stockError && (
              <div className="mb-6 text-left rounded-xl bg-red-900/20 border border-red-700/40 px-4 py-3 text-xs text-red-300">
                <p className="font-semibold mb-1">Stock update did not complete</p>
                <p>{stockError}</p>
                <p className="mt-1 text-red-400/80">Nothing was pushed for stock. Upload the same file again to retry — unchanged cells are skipped.</p>
              </div>
            )}

            {/* Stats */}
            <div className={`grid gap-3 mb-8 ${importResult.unidentifiedCount > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
                <p className="text-xs text-slate-500 mb-1">Updated</p>
                <p className="text-2xl font-bold text-emerald-400">{importResult.updated}</p>
                <p className="text-xs text-slate-500 mt-0.5">SKUs in DB</p>
              </div>
              {importResult.unidentifiedCount > 0 && (
                <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
                  <p className="text-xs text-slate-500 mb-1">Logged</p>
                  <p className="text-2xl font-bold text-amber-400">{importResult.unidentifiedCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5">unidentified</p>
                </div>
              )}
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/20 p-4">
                <p className="text-xs text-slate-500 mb-1">Updated by</p>
                <p className="text-sm font-semibold text-slate-300 mt-1 truncate">{importResult.updatedBy}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(importResult.updatedAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            {/* Unidentified note */}
            {importResult.unidentifiedCount > 0 && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-900/20
                border border-amber-700/40 text-xs text-amber-300 text-left mb-4">
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  {importResult.unidentifiedCount} unidentified SKU{importResult.unidentifiedCount !== 1 ? 's have' : ' has'} been
                  saved to the <span className="font-semibold text-amber-200">UnIdentifiedProducts</span> table
                  for review. These may be new inventory not yet active in Shopify.
                </span>
              </div>
            )}

            {/* Recommendation engine note */}
            {importResult.updated > 0 && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60
              border border-slate-700/60 text-xs text-slate-400 text-left mb-8">
              <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                PP values are updated. Run the recommendation engine to recalculate RecommendedSP for affected products.
              </span>
            </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-xs font-medium rounded-lg
                  bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                Upload another file
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium rounded-lg
                  bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                Back to dashboard
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}