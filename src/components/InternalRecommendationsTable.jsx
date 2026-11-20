// src/components/InternalRecommendationsTable.jsx
// ─────────────────────────────────────────────────────────────
// Internal-data-only RecommendedSP table.
// No competitor matching, no Competitor Price / Comp. Stock /
// Refresh columns — purely PP + business variables.
//
// `data` arrives pre-filtered by the parent (search / Category / Brand /
// PP-availability all live in App.jsx now, inline with the other filters).
// This component is purely presentational: it renders whatever rows it's
// given. The server only sends ACTIVE + IN-STOCK products. Rows with no PP
// (and therefore no RecommendedSP) show "Set PP first" instead of a price.
// The PP cell has an inline Edit (see PPCell) — saving recalculates only that
// row via `onRowUpdated`, and the Take Action buttons appear as soon as the
// row has a RecommendedSP.
// ─────────────────────────────────────────────────────────────

import TakeActionCell from "./TakeActionCell";
import PPCell from "./PPCell";

const fmt = (val) =>
  val != null
    ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '—';

// Recommended SP is always a whole rupee (server rounds up) — show no decimals
const fmtWhole = (val) =>
  val != null ? '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—';

export default function InternalRecommendationsTable({ data, onRowUpdated }) {
  return (
    <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-visible">
      <table className="w-full text-sm border-collapse table-fixed">
        <thead>
          <tr className="bg-slate-800/80 border-b border-slate-700">
            {['Product SKU', 'Title', 'Category', 'PP (₹)', 'Current SP (₹)', 'Recommended SP (₹)', 'Take Action'].map(h => (
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
                      Includes GST ({row.GSTPct}%) &amp; COB ({row.COBPct}%) &amp; Margin ({row.MarginPct}%)
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
                    </div>
                  </div>
                ) : (
                  <span className="text-amber-400/90 text-xs font-medium">Set PP first</span>
                )}
              </td>

              <td className="px-2 py-3 text-center align-middle">
                {row.RecommendedSP != null ? (
                  <TakeActionCell skuId={row.SKU_ID} recommendedSP={row.RecommendedSP} onPushed={() => {}} />
                ) : (
                  <span className="text-slate-600 text-xs" title="Set the PP first — nothing to push yet">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}