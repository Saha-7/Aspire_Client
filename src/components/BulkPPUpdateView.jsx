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
import { downloadPPTemplate, validateBulkPP, bulkUpdatePP } from '../services/api';

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

// ── Parse CSV text → array of { sku, pp, rawPP, rowNum, errors } ──
// Strips UTF-8 BOM that Excel adds.
function parseCSV(text) {
  const cleaned = text.replace(/^\uFEFF/, '');

  const lines = cleaned
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], fileErrors: ['The file is empty.'] };
  }

  const headers = lines[0]
    .split(',')
    .map(h => h.replace(/[^\x20-\x7E]/g, '').trim().toLowerCase());

  if (headers[0] !== 'sku' || headers[1] !== 'pp') {
    return {
      rows: [],
      fileErrors: [
        `Invalid headers. Expected "SKU,PP" but got "${lines[0].replace(/[^\x20-\x7E]/g, '')}". ` +
        'Download the template and use it as the starting point.',
      ],
    };
  }

  if (lines.length === 1) {
    return { rows: [], fileErrors: ['The file has headers but no data rows.'] };
  }

  const rows = [];
  const seenSKUs = new Map();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const rawSKU = (parts[0] ?? '').replace(/[^\x20-\x7E]/g, '').trim();
    const rawPP  = (parts[1] ?? '').replace(/[^\x20-\x7E]/g, '').trim();
    const rowNum = i + 1;

    rows.push({ sku: rawSKU, rawPP, rowNum, errors: [] });

    const skuKey = rawSKU.toLowerCase();
    if (seenSKUs.has(skuKey)) {
      const firstIdx = seenSKUs.get(skuKey);
      if (!rows[firstIdx].errors.includes('Duplicate SKU')) {
        rows[firstIdx].errors.push('Duplicate SKU');
      }
      rows[rows.length - 1].errors.push('Duplicate SKU');
    } else {
      seenSKUs.set(skuKey, rows.length - 1);
    }
  }

  for (const row of rows) {
    if (!row.sku) {
      row.errors.push('SKU is empty');
    }

    const ppNum = parseFloat(row.rawPP);
    if (row.rawPP === '' || row.rawPP === null) {
      row.errors.push('PP is empty');
    } else if (isNaN(ppNum)) {
      row.errors.push(`PP "${row.rawPP}" is not a number`);
    } else if (ppNum <= 0) {
      row.errors.push('PP must be greater than 0');
    } else {
      row.pp = ppNum;
    }
  }

  return { rows, fileErrors: [] };
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
// Now three variants: valid, client-error, unidentified (warning)
function StatusBadge({ errors, isUnidentified }) {
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

    const text = await file.text();
    const { rows, fileErrors: ferrs } = parseCSV(text);

    if (ferrs.length > 0) {
      setFileErrors(ferrs);
      return;
    }

    setParsedRows(rows);

    // Only validate rows that passed client-side checks
    const clientValidRows = rows.filter(r => r.errors.length === 0);
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
    } catch (err) {
      setFileErrors(['Server validation failed. Check the API server.']);
      setValidating(false);
      return;
    }
    setValidating(false);
    setStage(STAGE.PREVIEW);
  }

  // ── Compute final row status split ────────────────────────
  const rowsWithStatus = parsedRows.map(row => {
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

    // Found in DB → valid, show % change
    if (v.found) {
      return { ...row, isUnidentified: false, currentPP: v.currentPP };
    }

    // Not found in DB → unidentified (warning, not blocking)
    return { ...row, isUnidentified: true, currentPP: null };
  });

  // Hard errors = client-side format issues (duplicate, empty, bad PP)
  const hardErrorRows    = rowsWithStatus.filter(r => r.errors.length > 0);
  // Unidentified = SKU not in DB (will be stored in UnIdentifiedProducts)
  const unidentifiedRows = rowsWithStatus.filter(r => r.errors.length === 0 && r.isUnidentified);
  // Valid = matched in DB, will update InternalProducts
  const validRows        = rowsWithStatus.filter(r => r.errors.length === 0 && !r.isUnidentified);
  // Large change warnings (≥10%, for display only — does NOT block)
  const largeChangeCount = validRows.filter(r => {
    const pct = calcPctChange(r.currentPP, r.pp);
    return pct !== null && Math.abs(pct) >= 10;
  }).length;

  // Import is allowed if there are no hard format errors AND there's at least one row to do something with
  const canImport = hardErrorRows.length === 0 && (validRows.length > 0 || unidentifiedRows.length > 0);

  // ── Handle import ─────────────────────────────────────────
  async function handleImport() {
    if (!canImport) return;
    setImporting(true);

    try {
      const payload      = validRows.map(r => ({ skuId: r.sku, newPP: r.pp }));
      const unidentified = unidentifiedRows.map(r => ({ sku: r.sku, pp: r.pp ?? null }));
      const result       = await bulkUpdatePP(payload, unidentified, fileName);
      setImportResult(result);
      setStage(STAGE.DONE);
    } catch (err) {
      setFileErrors([err?.response?.data?.error || err.message || 'Import failed']);
    } finally {
      setImporting(false);
    }
  }

  // ── Reset to upload stage ─────────────────────────────────
  function handleReset() {
    setStage(STAGE.UPLOAD);
    setFileName('');
    setParsedRows([]);
    setFileErrors([]);
    setSkuValidation({});
    setImportResult(null);
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
                  { n: '1', text: 'Download the CSV template below — it has two columns: SKU and PP.' },
                  { n: '2', text: 'Fill in the SKUs and new purchase prices. Only add products you want to update.' },
                  { n: '3', text: "Save the file as CSV and upload it here. You'll see a preview before anything is saved." },
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
                  <div className="bg-slate-700/60 text-slate-300 px-4 py-1.5 rounded-tr-md border-b border-l border-slate-600 font-semibold">PP</div>
                </div>
                {[
                  ['AMD-5600X', '6900'],
                  ['INTEL-12400F', '7200'],
                  ['CP-9020281-IN', '3500'],
                ].map(([sku, pp], i) => (
                  <div key={i} className="flex">
                    <div className={`px-4 py-1 text-violet-300 border-b border-slate-700/60 w-36
                      ${i === 2 ? 'rounded-bl-md' : ''}`}>{sku}</div>
                    <div className={`px-4 py-1 text-emerald-300 border-b border-l border-slate-700/60
                      ${i === 2 ? 'rounded-br-md' : ''}`}>{pp}</div>
                  </div>
                ))}
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
                {unidentifiedRows.length > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full
                    bg-amber-900/40 text-amber-400 border border-amber-700/50">
                    ⚠ {unidentifiedRows.length} unidentified
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
                  {hardErrorRows.length} row{hardErrorRows.length !== 1 ? 's have' : ' has'} format errors (duplicate, empty, or invalid PP).
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
                    <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithStatus.map((row, i) => {
                    const hasHardError = row.errors.length > 0;
                    const rowBg = hasHardError
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

                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge errors={row.errors} isUnidentified={row.isUnidentified} />
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
              Purchase prices have been updated successfully.
            </p>

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
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60
              border border-slate-700/60 text-xs text-slate-400 text-left mb-8">
              <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                PP values are updated. Run the recommendation engine
                (<code className="text-violet-300 bg-slate-700 px-1 rounded">npm run recommend</code>)
                to recalculate RecommendedSP for affected products.
              </span>
            </div>

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