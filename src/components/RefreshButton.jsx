// src/components/RefreshButton.jsx
// ─────────────────────────────────────────────────────────────
// Per-row manual refresh button for the price table.
// Handles its own loading / success / error state so the
// parent table stays clean.
//
// Props:
//   refreshFn     — optional async () => result; replaces the single-URL refresh
//   skuId         — our internal SKU_ID
//   competitorUrl — the competitor product URL to re-scrape
//   onRefreshed   — callback(skuId, result) called on success
//                   so parent can update its row data
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { refreshProduct } from '../services/api';

const STATUS = {
  IDLE    : 'idle',
  LOADING : 'loading',
  SUCCESS : 'success',
  ERROR   : 'error',
};

export default function RefreshButton({ skuId, competitorUrl, onRefreshed, refreshFn }) {
  const [status, setStatus]   = useState(STATUS.IDLE);
  const [tooltip, setTooltip] = useState('');

  async function handleClick() {
    if (status === STATUS.LOADING) return;

    if (!refreshFn && !competitorUrl) {
      setStatus(STATUS.ERROR);
      setTooltip('No competitor URL available for this product');
      setTimeout(() => setStatus(STATUS.IDLE), 3000);
      return;
    }

    setStatus(STATUS.LOADING);
    setTooltip('');

    try {
      // refreshFn (Basic table) refreshes ALL stored competitor URLs of the SKU
      const result = refreshFn ? await refreshFn() : await refreshProduct(competitorUrl, skuId);

      setStatus(STATUS.SUCCESS);
      setTooltip(result.message ?? `Updated ₹${result.newCompetitorPrice?.toLocaleString('en-IN')}`);

      // Notify parent to update this row
      if (onRefreshed) onRefreshed(skuId, result);

      // Reset to idle after 3s
      setTimeout(() => {
        setStatus(STATUS.IDLE);
        setTooltip('');
      }, 3000);

    } catch (err) {
      setStatus(STATUS.ERROR);
      const msg = err?.response?.data?.error || err.message || 'Refresh failed';
      setTooltip(msg.substring(0, 60));
      setTimeout(() => {
        setStatus(STATUS.IDLE);
        setTooltip('');
      }, 4000);
    }
  }

  // ── Icon variants per status ────────────────────────────
  const iconClass = status === STATUS.LOADING ? 'animate-spin' : '';

  const colorClass = {
    [STATUS.IDLE]   : 'text-slate-500 hover:text-violet-400',
    [STATUS.LOADING]: 'text-violet-400 cursor-not-allowed',
    [STATUS.SUCCESS]: 'text-emerald-400',
    [STATUS.ERROR]  : 'text-red-400',
  }[status];

  return (
    <div className="relative group inline-flex items-center justify-center">
      <button
        onClick={handleClick}
        disabled={status === STATUS.LOADING}
        className={`p-1 rounded transition-colors ${colorClass}`}
        aria-label={`Refresh price for ${skuId}`}
      >
        {status === STATUS.SUCCESS ? (
          // Checkmark on success
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : status === STATUS.ERROR ? (
          // X on error
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          // Refresh icon (spinning when loading)
          <svg className={`w-3.5 h-3.5 ${iconClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )}
      </button>

      {/* Tooltip — shows on hover (idle) or always when status message exists */}
      {(tooltip || status === STATUS.IDLE) && (
        <div className={`
          absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5
          px-2 py-1 rounded-md text-xs whitespace-nowrap shadow-lg pointer-events-none
          transition-opacity duration-150
          ${tooltip
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100'
          }
          ${status === STATUS.ERROR
            ? 'bg-red-900/90 text-red-300 border border-red-700'
            : status === STATUS.SUCCESS
            ? 'bg-emerald-900/90 text-emerald-300 border border-emerald-700'
            : 'bg-slate-700 text-slate-200 border border-slate-600'
          }
        `}>
          {tooltip || 'Refresh competitor price'}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
        </div>
      )}
    </div>
  );
}