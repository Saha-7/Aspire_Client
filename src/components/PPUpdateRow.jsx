// src/components/PPUpdateRow.jsx
// ─────────────────────────────────────────────────────────────
// A single row in the PP Update table.
// Handles its own edit state, save loading, success/error feedback.
// Parent (PPUpdateView) does not need to know about edit state.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { updatePP } from '../services/api';

const fmt = (val) =>
  val != null
    ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '—';

function fmtDate(val) {
  if (!val) return null;
  return new Date(val).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtDateTime(val) {
  if (!val) return null;
  return new Date(val).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS = { IDLE: 'idle', SAVING: 'saving', SUCCESS: 'success', ERROR: 'error' };

export default function PPUpdateRow({ row, onSaved }) {
  const [editing, setEditing]   = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [status, setStatus]     = useState(STATUS.IDLE);
  const [errMsg, setErrMsg]     = useState('');

  function handleEdit() {
    // Pre-fill with current PP (strip ₹ and commas)
    setInputVal(row.PP != null ? String(row.PP) : '');
    setEditing(true);
    setStatus(STATUS.IDLE);
    setErrMsg('');
  }

  function handleCancel() {
    setEditing(false);
    setStatus(STATUS.IDLE);
  }

  async function handleSave() {
    const parsed = parseFloat(inputVal);
    if (isNaN(parsed) || parsed <= 0) {
      setErrMsg('Enter a valid positive number');
      return;
    }

    setStatus(STATUS.SAVING);
    setErrMsg('');

    try {
      const updated = await updatePP(row.SKU_ID, parsed);
      setEditing(false);
      setStatus(STATUS.SUCCESS);
      // Notify parent so it can update its row data
      if (onSaved) onSaved(row.SKU_ID, updated);
      setTimeout(() => setStatus(STATUS.IDLE), 3000);
    } catch (err) {
      setStatus(STATUS.ERROR);
      setErrMsg(err?.response?.data?.error || err.message || 'Save failed');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter')  handleSave();
    if (e.key === 'Escape') handleCancel();
  }

  const sourceColor = {
    'manual'                  : 'text-violet-400',
    'manual (no bill date)'   : 'text-violet-400',
    'bill'                    : 'text-slate-400',
    'bill (newer than manual)': 'text-slate-400',
  }[row.PPSource] ?? 'text-slate-500';

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">

      {/* SKU */}
      <td className="px-3 py-3 text-left">
        <span className="font-mono text-xs text-violet-300">{row.SKU_ID}</span>
      </td>

      {/* Title */}
      <td className="px-3 py-3 text-left">
        <span className="text-slate-200 text-xs leading-snug">{row.Title ?? '—'}</span>
      </td>

      {/* Category */}
      <td className="px-3 py-3 text-center">
        <span className="text-slate-400 text-xs">{row.Category ?? '—'}</span>
      </td>

      {/* Current PP + source badge */}
      <td className="px-3 py-3 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className={`text-xs font-semibold ${status === STATUS.SUCCESS ? 'text-emerald-400' : 'text-slate-200'}`}>
            {fmt(row.PP)}
          </span>
          <span className={`text-[10px] ${sourceColor}`}>
            {row.PPSource === 'manual' ? '✏ manual' : ' '}
          </span>
        </div>
      </td>

      {/* Last bill date */}
      <td className="px-3 py-3 text-center">
        <span className="text-slate-500 text-xs">{fmtDate(row.LastBillDate) ?? '—'}</span>
      </td>

      {/* Last updated by */}
      <td className="px-3 py-3 text-center">
        {row.ManualPP_UpdatedBy ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-slate-300 text-[11px]">{row.ManualPP_UpdatedBy}</span>
            <span className="text-slate-600 text-[10px]">{fmtDateTime(row.ManualPP_UpdatedAt)}</span>
          </div>
        ) : (
          <span className="text-slate-600 text-xs">—</span>
        )}
      </td>

      {/* Edit / Save / Cancel */}
      <td className="px-3 py-3 text-center">
        {editing ? (
          <div className="flex flex-col items-center gap-1.5">
            {/* Input */}
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-xs">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-24 px-2 py-1 text-xs text-slate-100 bg-slate-700 border border-slate-600
                  rounded-lg outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                  [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Error */}
            {errMsg && (
              <span className="text-[10px] text-red-400">{errMsg}</span>
            )}

            {/* Save / Cancel buttons */}
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
              Edit PP
            </button>
            {status === STATUS.SUCCESS && (
              <span className="text-[10px] text-emerald-400">✓ Saved</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}