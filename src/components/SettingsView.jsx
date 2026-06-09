// src/components/SettingsView.jsx
// ─────────────────────────────────────────────────────────────
// Full-page Settings panel with two tabs:
//   1. Business Variables — GST, CostOfBusiness, ProfitMargin per category
//   2. Scraping Config    — ScrapFreqDays, IsScrapEnabled per category
//
// System defaults shown as placeholders when a value is NULL.
// Saving NULL explicitly reverts to the system default.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { fetchCategorySettings, updateCategorySettings } from '../services/api';

// ── System-wide defaults (mirrored from recommendation_engine.js) ──
const SYSTEM_DEFAULTS = {
  GST            : 18,
  CostOfBusiness : 7,
  ProfitMargin   : 5,
};

const TABS = { BUSINESS: 'business', SCRAPING: 'scraping' };

// ── Formatters ────────────────────────────────────────────────
function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Save status per row ───────────────────────────────────────
const STATUS = { IDLE: 'idle', SAVING: 'saving', SAVED: 'saved', ERROR: 'error' };

// ─────────────────────────────────────────────────────────────
// Business Variables Row
// ─────────────────────────────────────────────────────────────
function BusinessRow({ row, onSaved }) {
  const [editing, setEditing]   = useState(false);
  const [fields, setFields]     = useState({});
  const [status, setStatus]     = useState(STATUS.IDLE);
  const [errMsg, setErrMsg]     = useState('');

  function handleEdit() {
    setFields({
      GST           : row.GST            ?? '',
      CostOfBusiness: row.CostOfBusiness ?? '',
      ProfitMargin  : row.ProfitMargin   ?? '',
    });
    setEditing(true);
    setStatus(STATUS.IDLE);
    setErrMsg('');
  }

  function handleCancel() {
    setEditing(false);
    setStatus(STATUS.IDLE);
  }

  // Validate a single field — returns error string or null
  function validateField(name, val) {
    if (val === '' || val === null) return null; // empty = revert to default, that's fine
    const n = parseFloat(val);
    if (isNaN(n) || n < 0 || n > 100) return `${name} must be 0–100`;
    return null;
  }

  async function handleSave() {
    // Validate
    for (const [key, val] of Object.entries(fields)) {
      const err = validateField(key, val);
      if (err) { setErrMsg(err); return; }
    }

    setStatus(STATUS.SAVING);
    setErrMsg('');

    try {
      // Convert empty string → null (revert to default)
      const payload = {
        GST           : fields.GST            === '' ? null : parseFloat(fields.GST),
        CostOfBusiness: fields.CostOfBusiness === '' ? null : parseFloat(fields.CostOfBusiness),
        ProfitMargin  : fields.ProfitMargin   === '' ? null : parseFloat(fields.ProfitMargin),
        // Preserve existing scrap settings — don't overwrite them
        ScrapFreqDays : row.ScrapFreqDays,
        IsScrapEnabled: row.IsScrapEnabled,
      };

      const updated = await updateCategorySettings(row.CategoryName, payload);
      setEditing(false);
      setStatus(STATUS.SAVED);
      onSaved(updated);
      setTimeout(() => setStatus(STATUS.IDLE), 3000);
    } catch (err) {
      setStatus(STATUS.ERROR);
      setErrMsg(err?.response?.data?.error || err.message || 'Save failed');
    }
  }

  // Multiplier preview
  const gstVal  = fields.GST            !== '' ? parseFloat(fields.GST  || 0)             : (row.GST            ?? SYSTEM_DEFAULTS.GST);
  const cobVal  = fields.CostOfBusiness !== '' ? parseFloat(fields.CostOfBusiness  || 0)  : (row.CostOfBusiness ?? SYSTEM_DEFAULTS.CostOfBusiness);
  const mgnVal  = fields.ProfitMargin   !== '' ? parseFloat(fields.ProfitMargin    || 0)  : (row.ProfitMargin   ?? SYSTEM_DEFAULTS.ProfitMargin);
  const multiplier = editing
    ? (1 + (isNaN(gstVal) ? 0 : gstVal) / 100 + (isNaN(cobVal) ? 0 : cobVal) / 100 + (isNaN(mgnVal) ? 0 : mgnVal) / 100).toFixed(4)
    : null;

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
      {/* Category */}
      <td className="px-4 py-3 text-left">
        <span className="font-medium text-slate-200 text-sm">{row.CategoryName}</span>
      </td>

      {/* GST */}
      <td className="px-4 py-3 text-center">
        {editing ? (
          <PercentInput
            value={fields.GST}
            onChange={v => setFields(f => ({ ...f, GST: v }))}
            placeholder={`${SYSTEM_DEFAULTS.GST} (default)`}
          />
        ) : (
          <ValueOrDefault value={row.GST} defaultVal={SYSTEM_DEFAULTS.GST} />
        )}
      </td>

      {/* Cost of Business */}
      <td className="px-4 py-3 text-center">
        {editing ? (
          <PercentInput
            value={fields.CostOfBusiness}
            onChange={v => setFields(f => ({ ...f, CostOfBusiness: v }))}
            placeholder={`${SYSTEM_DEFAULTS.CostOfBusiness} (default)`}
          />
        ) : (
          <ValueOrDefault value={row.CostOfBusiness} defaultVal={SYSTEM_DEFAULTS.CostOfBusiness} />
        )}
      </td>

      {/* Profit Margin */}
      <td className="px-4 py-3 text-center">
        {editing ? (
          <PercentInput
            value={fields.ProfitMargin}
            onChange={v => setFields(f => ({ ...f, ProfitMargin: v }))}
            placeholder={`${SYSTEM_DEFAULTS.ProfitMargin} (default)`}
          />
        ) : (
          <ValueOrDefault value={row.ProfitMargin} defaultVal={SYSTEM_DEFAULTS.ProfitMargin} />
        )}
      </td>

      {/* Multiplier preview */}
      <td className="px-4 py-3 text-center">
        {editing ? (
          <span className="text-amber-400 font-mono text-xs font-semibold">
            ×{multiplier}
          </span>
        ) : (
          <span className="text-slate-500 font-mono text-xs">
            ×{(
              1 +
              (row.GST            ?? SYSTEM_DEFAULTS.GST)            / 100 +
              (row.CostOfBusiness ?? SYSTEM_DEFAULTS.CostOfBusiness) / 100 +
              (row.ProfitMargin   ?? SYSTEM_DEFAULTS.ProfitMargin)   / 100
            ).toFixed(4)}
          </span>
        )}
      </td>

      {/* Last updated */}
      <td className="px-4 py-3 text-center">
        {row.UpdatedBy ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-slate-300 text-[11px]">{row.UpdatedBy}</span>
            <span className="text-slate-600 text-[10px]">{fmtDate(row.UpdatedAt)}</span>
          </div>
        ) : (
          <span className="text-slate-600 text-xs">—</span>
        )}
      </td>

      {/* Action */}
      <td className="px-4 py-3 text-center">
        {editing ? (
          <div className="flex flex-col items-center gap-1.5">
            {errMsg && <span className="text-[10px] text-red-400 max-w-[120px] text-center">{errMsg}</span>}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSave}
                disabled={status === STATUS.SAVING}
                className="px-2.5 py-1 text-[10px] font-medium rounded bg-violet-600 hover:bg-violet-500
                  disabled:opacity-50 text-white transition-colors"
              >
                {status === STATUS.SAVING ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={status === STATUS.SAVING}
                className="px-2.5 py-1 text-[10px] font-medium rounded bg-slate-700 hover:bg-slate-600
                  text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={handleEdit}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded
                bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            {status === STATUS.SAVED && (
              <span className="text-[10px] text-emerald-400">✓ Saved</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// Scraping Config Row
// ─────────────────────────────────────────────────────────────
function ScrapingRow({ row, onSaved }) {
  const [editing, setEditing]   = useState(false);
  const [freqVal, setFreqVal]   = useState('');
  const [enabled, setEnabled]   = useState(true);
  const [status, setStatus]     = useState(STATUS.IDLE);
  const [errMsg, setErrMsg]     = useState('');

  function handleEdit() {
    setFreqVal(row.ScrapFreqDays ?? 7);
    setEnabled(row.IsScrapEnabled ?? true);
    setEditing(true);
    setStatus(STATUS.IDLE);
    setErrMsg('');
  }

  function handleCancel() {
    setEditing(false);
    setStatus(STATUS.IDLE);
  }

  async function handleSave() {
    const freq = parseInt(freqVal);
    if (isNaN(freq) || freq < 1 || freq > 365) {
      setErrMsg('Frequency must be 1–365 days');
      return;
    }

    setStatus(STATUS.SAVING);
    setErrMsg('');

    try {
      const payload = {
        // Preserve existing business variable settings
        GST           : row.GST,
        CostOfBusiness: row.CostOfBusiness,
        ProfitMargin  : row.ProfitMargin,
        ScrapFreqDays : freq,
        IsScrapEnabled: enabled,
      };

      const updated = await updateCategorySettings(row.CategoryName, payload);
      setEditing(false);
      setStatus(STATUS.SAVED);
      onSaved(updated);
      setTimeout(() => setStatus(STATUS.IDLE), 3000);
    } catch (err) {
      setStatus(STATUS.ERROR);
      setErrMsg(err?.response?.data?.error || err.message || 'Save failed');
    }
  }

  const isEnabled = row.IsScrapEnabled === true || row.IsScrapEnabled === 1;

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
      {/* Category */}
      <td className="px-4 py-3 text-left">
        <span className="font-medium text-slate-200 text-sm">{row.CategoryName}</span>
      </td>

      {/* Enabled toggle */}
      <td className="px-4 py-3 text-center">
        {editing ? (
          <button
            onClick={() => setEnabled(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
              ${enabled ? 'bg-emerald-600' : 'bg-slate-600'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform
              ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
        ) : (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
            ${isEnabled
              ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/60'
              : 'bg-slate-700/50 text-slate-500 border border-slate-600/60'
            }`}
          >
            {isEnabled ? '● Active' : '○ Paused'}
          </span>
        )}
      </td>

      {/* Frequency */}
      <td className="px-4 py-3 text-center">
        {editing ? (
          <div className="flex items-center justify-center gap-1.5">
            <input
              type="number"
              min="1"
              max="365"
              value={freqVal}
              onChange={e => setFreqVal(e.target.value)}
              className="w-16 px-2 py-1 text-xs text-slate-100 bg-slate-700 border border-slate-600
                rounded-lg outline-none text-center focus:border-violet-500
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-slate-500 text-xs">days</span>
          </div>
        ) : (
          <span className="text-slate-200 text-sm font-medium">
            {row.ScrapFreqDays ?? 7}
            <span className="text-slate-500 text-xs ml-1">days</span>
          </span>
        )}
      </td>

      {/* Next scrape due */}
      <td className="px-4 py-3 text-center">
        <span className="text-slate-500 text-xs">{fmtDate(row.NextScrapDueAt)}</span>
      </td>

      {/* Last scraped */}
      <td className="px-4 py-3 text-center">
        <span className="text-slate-500 text-xs">{fmtDate(row.LastScrapedAt)}</span>
      </td>

      {/* Last updated by */}
      <td className="px-4 py-3 text-center">
        {row.UpdatedBy ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-slate-300 text-[11px]">{row.UpdatedBy}</span>
            <span className="text-slate-600 text-[10px]">{fmtDate(row.UpdatedAt)}</span>
          </div>
        ) : (
          <span className="text-slate-600 text-xs">—</span>
        )}
      </td>

      {/* Action */}
      <td className="px-4 py-3 text-center">
        {editing ? (
          <div className="flex flex-col items-center gap-1.5">
            {errMsg && <span className="text-[10px] text-red-400">{errMsg}</span>}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSave}
                disabled={status === STATUS.SAVING}
                className="px-2.5 py-1 text-[10px] font-medium rounded bg-violet-600 hover:bg-violet-500
                  disabled:opacity-50 text-white transition-colors"
              >
                {status === STATUS.SAVING ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={status === STATUS.SAVING}
                className="px-2.5 py-1 text-[10px] font-medium rounded bg-slate-700 hover:bg-slate-600
                  text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={handleEdit}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded
                bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            {status === STATUS.SAVED && (
              <span className="text-[10px] text-emerald-400">✓ Saved</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// Small shared components
// ─────────────────────────────────────────────────────────────

function PercentInput({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      <input
        type="number"
        min="0"
        max="100"
        step="0.1"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-20 px-2 py-1 text-xs text-slate-100 bg-slate-700 border border-slate-600
          rounded-lg outline-none text-center focus:border-violet-500
          placeholder:text-slate-600
          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
          [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-slate-500 text-xs">%</span>
    </div>
  );
}

function ValueOrDefault({ value, defaultVal }) {
  if (value != null) {
    return (
      <span className="text-slate-200 text-sm font-medium">
        {parseFloat(value).toFixed(1)}
        <span className="text-slate-500 text-xs ml-0.5">%</span>
      </span>
    );
  }
  return (
    <span className="text-slate-500 text-xs italic">
      {defaultVal}% <span className="text-slate-600">(default)</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Main SettingsView
// ─────────────────────────────────────────────────────────────
export default function SettingsView({ onClose }) {
  const [activeTab, setActiveTab]   = useState(TABS.BUSINESS);
  const [data, setData]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCategorySettings();
      setData(rows);
    } catch (err) {
      setError('Failed to load settings. Check the API server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // When a row is saved, update it in local state so the table
  // reflects the change without a full reload
  function handleRowSaved(updated) {
    setData(prev => prev.map(row =>
      row.CategoryName === updated.CategoryName ? { ...row, ...updated } : row
    ));
  }

  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">

      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
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
              <div className="w-7 h-7 rounded-lg bg-slate-600 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Settings</h1>
                <p className="text-xs text-slate-500">Category-level configuration</p>
              </div>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg
              bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors"
          >
            <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex gap-0 border-b border-slate-800 -mb-px">
            {[
              {
                key  : TABS.BUSINESS,
                label: 'Business Variables',
                icon : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ),
              },
              {
                key  : TABS.SCRAPING,
                label: 'Scraping Config',
                icon : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors
                  ${activeTab === tab.key
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading settings...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Business Variables Tab ── */}
        {!loading && !error && activeTab === TABS.BUSINESS && (
          <>
            {/* Info notice */}
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60
              border border-slate-700/60 mb-5 text-xs text-slate-400">
              <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                These values are used by the recommendation engine to calculate
                <span className="text-slate-200 font-medium"> floor price = PP × (1 + GST + Cost of Business + Profit Margin)</span>.
                Leave a field blank to use the system default. Changes take effect on the next recommendation engine run.
              </span>
            </div>

            {/* System defaults callout */}
            <div className="flex items-center gap-6 px-4 py-2.5 rounded-xl bg-violet-900/20
              border border-violet-700/40 mb-5 text-xs">
              <span className="text-slate-500 font-medium">System defaults:</span>
              <span className="text-violet-300">GST: {SYSTEM_DEFAULTS.GST}%</span>
              <span className="text-violet-300">Cost of Business: {SYSTEM_DEFAULTS.CostOfBusiness}%</span>
              <span className="text-violet-300">Profit Margin: {SYSTEM_DEFAULTS.ProfitMargin}%</span>
              <span className="text-violet-300">Multiplier: ×{(1 + SYSTEM_DEFAULTS.GST / 100 + SYSTEM_DEFAULTS.CostOfBusiness / 100 + SYSTEM_DEFAULTS.ProfitMargin / 100).toFixed(4)}</span>
            </div>

            <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700">
                    {['Category', 'GST (%)', 'Cost of Business (%)', 'Profit Margin (%)', 'Multiplier', 'Last Updated By', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider
                        first:text-left text-center">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <BusinessRow
                      key={row.CategoryName}
                      row={row}
                      onSaved={handleRowSaved}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Scraping Config Tab ── */}
        {!loading && !error && activeTab === TABS.SCRAPING && (
          <>
            {/* Info notice */}
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60
              border border-slate-700/60 mb-5 text-xs text-slate-400">
              <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                Controls how often the scheduler scrapes competitor prices for each category.
                Pausing a category skips it entirely in the next scheduler run.
                <span className="text-slate-200 font-medium"> Next scrape due</span> and
                <span className="text-slate-200 font-medium"> Last scraped</span> timestamps
                are updated automatically after each run.
              </span>
            </div>

            <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700">
                    {['Category', 'Status', 'Scrape Frequency', 'Next Scrape Due', 'Last Scraped', 'Last Updated By', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider
                        first:text-left text-center">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <ScrapingRow
                      key={row.CategoryName}
                      row={row}
                      onSaved={handleRowSaved}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}