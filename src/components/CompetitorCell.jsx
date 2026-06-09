// src/components/CompetitorCell.jsx
// ─────────────────────────────────────────────────────────────
// Shows the lowest competitor (price + store) inline — same as before.
// On hover OR clicking "Expand" → lazy-fetches /api/competitor-details/:skuId
// and shows ALL competitors ranked 1st–4th with store, price, stock, link.
//
// The primary API (/api/recommendations) is NOT changed.
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import { fetchCompetitorDetails } from '../services/api';

const fmt = (val) =>
  val != null
    ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '—';

const RANK_COLORS = ['text-sky-400', 'text-violet-300', 'text-slate-300', 'text-slate-400'];
const RANK_LABELS = ['1st', '2nd', '3rd', '4th'];

// ── Single competitor row ─────────────────────────────────────
function CompetitorRow({ competitor, rank, border = true }) {
  const { CompetitorPrice, StoreName, StockStatus, ProductURL } = competitor;

  return (
    <div className={`flex items-center gap-2 py-1.5 ${border ? 'border-t border-slate-700/60' : ''}`}>

      {/* Rank */}
      <span className={`text-[10px] font-bold w-6 flex-shrink-0 ${RANK_COLORS[rank] ?? 'text-slate-500'}`}>
        {RANK_LABELS[rank] ?? `${rank + 1}th`}
      </span>

      {/* Store */}
      <span className="text-xs text-slate-300 font-medium w-[72px] truncate flex-shrink-0 capitalize">
        {StoreName ?? '—'}
      </span>

      {/* Price */}
      <span className={`text-xs font-semibold flex-shrink-0 w-[72px] text-right ${RANK_COLORS[rank] ?? 'text-slate-400'}`}>
        {fmt(CompetitorPrice)}
      </span>

      {/* Stock */}
      <div className="flex-1 flex justify-center">
        <StatusBadge status={StockStatus} />
      </div>

      {/* Link */}
      {ProductURL ? (
        <a
          href={ProductURL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px]
            text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
        >
          Visit
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      ) : (
        <span className="flex-shrink-0 w-8 text-slate-600 text-[10px]">—</span>
      )}
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────
function SkeletonRows() {
  return (
    <div className="space-y-1 py-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`flex items-center gap-2 py-1.5 animate-pulse ${i > 0 ? 'border-t border-slate-700/60' : ''}`}>
          <div className="w-6 h-3 bg-slate-700 rounded" />
          <div className="w-[72px] h-3 bg-slate-700 rounded" />
          <div className="w-[72px] h-3 bg-slate-700 rounded ml-auto" />
          <div className="w-14 h-4 bg-slate-700 rounded mx-auto" />
          <div className="w-8 h-3 bg-slate-700 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Panel content shared by tooltip + expand panel ────────────
function CompetitorPanel({ skuId, cache }) {
  const state = cache[skuId];

  if (!state || state.status === 'loading') return <SkeletonRows />;

  if (state.status === 'error') {
    return (
      <p className="text-xs text-red-400 py-2 text-center">
        Failed to load — check console
      </p>
    );
  }

  const competitors = state.data ?? [];
  if (competitors.length === 0) {
    return <p className="text-xs text-slate-500 py-2 text-center">No competitors found</p>;
  }

  return (
    <>
      {competitors.map((c, i) => (
        <CompetitorRow
          key={`${c.StoreName}-${i}`}
          competitor={c}
          rank={i}
          border={i > 0}
        />
      ))}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────
// cache + setCache are lifted to PriceTable so fetched data persists
// across hover/expand cycles — no re-fetching on every open.
export default function CompetitorCell({
  skuId,
  competitorPrice,
  storeName,
  competitorUrl,
  competitorStockStatus,
  cache,
  setCache,
}) {
  const [expanded, setExpanded]   = useState(false);
  const [tooltipOpen, setTooltip] = useState(false);
  const hoverTimer                = useRef(null);

  // ── Fetch once; result lives in parent cache ──────────────
  const triggerFetch = useCallback(() => {
    // Already fetched or fetching — skip
    if (cache[skuId]) return;

    setCache(prev => ({ ...prev, [skuId]: { status: 'loading' } }));

    fetchCompetitorDetails(skuId)
      .then(data  => setCache(prev => ({ ...prev, [skuId]: { status: 'ok',    data  } })))
      .catch(()   => setCache(prev => ({ ...prev, [skuId]: { status: 'error'        } })));
  }, [skuId, cache, setCache]);

  // ── Hover handlers ────────────────────────────────────────
  function handleMouseEnter() {
    clearTimeout(hoverTimer.current);
    setTooltip(true);
    triggerFetch();
  }

  function handleMouseLeave() {
    hoverTimer.current = setTimeout(() => setTooltip(false), 220);
  }

  // ── Expand toggle ─────────────────────────────────────────
  function handleExpandClick() {
    setExpanded(v => {
      if (!v) triggerFetch();
      return !v;
    });
  }

  return (
    <div className="relative inline-flex flex-col items-center gap-0.5 w-full">

      {/* ── Inline primary price + store (always visible) ── */}
      <div
        className="flex flex-col items-center gap-0.5 cursor-default"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span className="text-sky-400 font-semibold text-xs">
          {fmt(competitorPrice)}
        </span>
        <span className="text-slate-500 text-[10px] capitalize">{storeName}</span>
      </div>

      {/* ── Expand / Less toggle button ── */}
      <button
        onClick={handleExpandClick}
        className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded transition-colors
          ${expanded
            ? 'bg-violet-900/50 text-violet-300 border border-violet-700/60'
            : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-slate-700/60'
          }`}
      >
        {expanded ? (
          <>
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
            Less
          </>
        ) : (
          <>
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
            Expand
          </>
        )}
      </button>

      {/* ── Hover tooltip (hidden when expand panel is open) ── */}
      {tooltipOpen && !expanded && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
            bg-slate-800 border border-slate-600 rounded-xl shadow-2xl px-3 py-2 min-w-[380px]"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Caret */}
          <div className="absolute top-full left-1/2 -translate-x-1/2
            border-8 border-transparent border-t-slate-600" />

          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
            Competitor Prices
          </p>
          <CompetitorPanel skuId={skuId} cache={cache} />
        </div>
      )}

      {/* ── Expand panel (inline below cell, persists on click) ── */}
      {expanded && (
        <div
          className="absolute z-40 top-full left-1/2 -translate-x-1/2 mt-2
            bg-slate-800 border border-slate-600 rounded-xl shadow-2xl px-3 py-2 min-w-[380px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Caret */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2
            border-8 border-transparent border-b-slate-600" />

          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
            Competitor Prices
          </p>
          <CompetitorPanel skuId={skuId} cache={cache} />
        </div>
      )}
    </div>
  );
}