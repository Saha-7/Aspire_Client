// src/components/PPCell.jsx
// ─────────────────────────────────────────────────────────────
// PP cell for the Basic Recommendations table, with inline edit.
//
//   • No PP set  → "no PP set" + an Edit button, centred in the cell
//   • PP is set  → the PP, and an Edit button just below it
//   • Edit       → number input + Save / Cancel
//   • Save       → saves the PP (same audited /update-pp API used by the
//                  Purchase Price Update page), then recalculates ONLY this
//                  SKU's recommended SP and hands the fresh row to the parent.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { updatePP, fetchInternalRecommendationRow } from '../services/api';
import { useToast } from '../context/ToastContext';

const fmt = (val) =>
  val != null
    ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '—';

const STATUS = { IDLE: 'idle', SAVING: 'saving' };

function PencilIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

export default function PPCell({ row, onRowUpdated }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [status, setStatus] = useState(STATUS.IDLE);
  const [errMsg, setErrMsg] = useState('');

  const saving = status === STATUS.SAVING;

  function handleEdit() {
    setInputVal(row.PP != null ? String(row.PP) : '');
    setErrMsg('');
    setStatus(STATUS.IDLE);
    setEditing(true);
  }

  function handleCancel() {
    if (saving) return;
    setEditing(false);
    setErrMsg('');
  }

  async function handleSave() {
    if (saving) return;

    const parsed = parseFloat(inputVal);
    if (isNaN(parsed) || parsed <= 0) {
      setErrMsg('Enter a valid positive number');
      return;
    }

    setStatus(STATUS.SAVING);
    setErrMsg('');

    // Step 1 — save the PP
    try {
      await updatePP(row.SKU_ID, parsed);
    } catch (err) {
      setStatus(STATUS.IDLE);
      setErrMsg(err?.response?.data?.error || err.message || 'Save failed');
      return;
    }

    // Step 2 — recalculate this SKU only
    try {
      const freshRow = await fetchInternalRecommendationRow(row.SKU_ID);
      onRowUpdated?.(freshRow);
      setEditing(false);
      setStatus(STATUS.IDLE);
      showToast(`PP saved — recommended SP recalculated for ${row.SKU_ID}`, 'success');
    } catch {
      // PP is saved; only the recalculation failed
      setEditing(false);
      setStatus(STATUS.IDLE);
      showToast(
        `PP saved for ${row.SKU_ID}, but the recommended SP could not be recalculated. Please click Refresh.`,
        'error'
      );
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  }

  const editButton = (
    <button
      type="button"
      onClick={handleEdit}
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium
        bg-violet-600 hover:bg-violet-500 text-white shadow-sm transition-colors"
    >
      <PencilIcon />
      Edit
    </button>
  );

  // ── Editing ──
  if (editing) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1">
          <span className="text-slate-400 text-xs">₹</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            disabled={saving}
            className="w-20 px-2 py-1 text-xs text-slate-100 bg-slate-700 border border-slate-600
              rounded-lg outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40
              disabled:opacity-60
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
              [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        {errMsg && <span className="text-[10px] text-red-400 leading-tight">{errMsg}</span>}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-[11px] font-medium rounded-full bg-violet-600 hover:bg-violet-500
              disabled:opacity-50 text-white transition-colors inline-flex items-center gap-1.5"
          >
            {saving && (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="px-3 py-1 text-[11px] font-medium rounded-full bg-slate-700 hover:bg-slate-600
              disabled:opacity-50 text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Not editing ──
  // No PP: just the Edit button, centred. PP set: bold PP + a slim Edit button.
  return (
    <div className="flex flex-col items-center gap-1">
      {row.PP != null && (
        <>
          <span className="text-slate-100 font-bold text-sm">{fmt(row.PP)}</span>
          {row.PPSource === 'manual' && <span className="text-violet-400 text-[10px]">✏ manual</span>}
        </>
      )}
      {editButton}
    </div>
  );
}