// src/components/InternalRecommendationsTable.jsx
// ─────────────────────────────────────────────────────────────
// Basic Recommendations table.
//
// Recommended SP = the "floor": PP × (1 + GST + COB + margin) plus packing and
// shipping, grossed up for the Shopify fee and payment gateway % (see
// server/src/services/pricing.js — the tooltip lists every component).
// If the SKU is MATCHED with competitors (SKU match only), the lowest
// in-stock competitor price is used too: 1% below it when that is above
// the floor, otherwise the floor. Unmatched SKUs show the plain floor and
// an empty Competitor Price cell.
//
// `data` arrives pre-filtered by the parent (search / Category / Brand /
// PP-availability / competitor filter all live in App.jsx). This component
// is presentational: it renders whatever rows it's given. Rows with no PP
// show "Set PP first" instead of a price (competitor prices still show).
// The PP cell has an inline Edit (see PPCell) — saving recalculates only
// that row via `onRowUpdated`. The row Refresh re-scrapes every stored
// competitor URL of the SKU and swaps in the fresh row.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import TakeActionCell from "./TakeActionCell";
import PPCell from "./PPCell";
import CompetitorCell from "./CompetitorCell";
import RefreshButton from "./RefreshButton";
import { refreshSkuCompetitors } from "../services/api";
import { pricingBreakdownLines, rowToBreakdown } from "../utils/pricingTooltip";

const fmt = (val) =>
  val != null
    ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '—';

// Recommended SP is always a whole rupee (server rounds up) — show no decimals
const fmtWhole = (val) =>
  val != null ? '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—';

export default function InternalRecommendationsTable({ data, onRowUpdated }) {
  // Lazy-loaded competitor lists, kept here so hover/expand never refetches
  const [competitorCache, setCompetitorCache] = useState({});

  async function refreshRow(skuId) {
    const result = await refreshSkuCompetitors(skuId);
    // Drop the cached store list so the next hover shows the fresh prices
    setCompetitorCache((prev) => {
      const next = { ...prev };
      delete next[skuId];
      return next;
    });
    onRowUpdated?.(result.row);
    return result;
  }

  return (
    <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-visible">
      <table className="w-full text-sm border-collapse table-fixed">
        <thead>
          <tr className="bg-slate-800/80 border-b border-slate-700">
            {['Product SKU', 'Title', 'Category', 'PP (₹)', 'Current SP (₹)', 'Recommended SP (₹)', 'Competitor Price (₹)', 'Take Action', 'Refresh'].map(h => (
              <th key={h} className="px-2 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.SKU_ID}
              className={`border-b border-slate-800 transition-colors
                ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'} hover:bg-slate-800/50`}
            >
              <td className="px-2 py-3 text-center align-middle">
                <span className="font-mono text-xs text-violet-300 break-all">{row.SKU_ID}</span>
              </td>
              <td className="px-2 py-3 text-center align-middle">
                <span className="text-slate-200 text-xs leading-snug">{row.Title}</span>
              </td>
              <td className="px-2 py-3 text-center align-middle">
                <span className="text-slate-400 text-xs">{row.Category ?? '—'}</span>
              </td>
              <td className="px-2 py-3 text-center align-middle">
                <PPCell row={row} onRowUpdated={onRowUpdated} />
              </td>
              <td className="px-2 py-3 text-center align-middle">
                <span className="text-slate-300 text-xs">{fmt(row.SP)}</span>
              </td>
              <td className="px-2 py-3 text-center align-middle">
                {row.RecommendedSP != null ? (
                  <div className="relative group inline-block">
                    <span className="text-emerald-400 font-bold text-sm cursor-default">
                      {fmtWhole(row.RecommendedSP)}
                    </span>
                    <div className="
                      absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
                      px-2.5 py-1.5 rounded-lg bg-slate-700 border border-slate-600
                      text-xs text-slate-200 whitespace-nowrap shadow-xl
                      opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150
                    ">
                      {row.PricingStrategy === 'optimized' && (
                        <div className="font-semibold text-slate-100 mb-1">
                          1% below lowest competitor ({row.StoreName ?? 'store'})
                        </div>
                      )}
                      <div className="font-semibold text-slate-100 mb-0.5">
                        {row.PricingStrategy === 'optimized' ? 'Minimum price includes' : 'Includes'}
                      </div>
                      {pricingBreakdownLines(rowToBreakdown(row)).map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
                    </div>
                  </div>
                ) : (
                  <span className="text-amber-400/90 text-xs font-medium">Set PP first</span>
                )}
              </td>

              {/* Competitor Price — only for SKUs matched with a competitor */}
              <td className="px-2 py-3 text-center align-middle">
                {row.HasCompetitor ? (
                  <CompetitorCell
                    skuId                 = {row.SKU_ID}
                    competitorPrice       = {row.CompetitorPrice}
                    storeName             = {row.StoreName}
                    competitorStockStatus = {row.CompetitorStockStatus}
                    cache                 = {competitorCache}
                    setCache              = {setCompetitorCache}
                    all
                  />
                ) : (
                  <span className="text-slate-600 text-xs">—</span>
                )}
              </td>

              <td className="px-2 py-3 text-center align-middle">
                {row.RecommendedSP != null ? (
                  <TakeActionCell skuId={row.SKU_ID} recommendedSP={row.RecommendedSP} onPushed={() => {}} />
                ) : (
                  <span className="text-slate-600 text-xs" title="Set the PP first — nothing to push yet">—</span>
                )}
              </td>

              {/* Refresh — re-scrapes every stored competitor URL of this SKU */}
              <td className="px-2 py-3 text-center align-middle">
                {row.HasCompetitor ? (
                  <RefreshButton
                    skuId     = {row.SKU_ID}
                    refreshFn = {() => refreshRow(row.SKU_ID)}
                  />
                ) : (
                  <span className="text-slate-600 text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}