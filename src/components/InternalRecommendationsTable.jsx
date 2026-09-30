// src/components/InternalRecommendationsTable.jsx
// ─────────────────────────────────────────────────────────────
// Internal-data-only RecommendedSP table.
// No competitor matching, no Competitor Price / Comp. Stock /
// Refresh columns — purely PP + business variables.
//
// `data` now arrives as the WHOLE InternalProducts table (after the
// parent's search/Category/Brand filters), active or inactive, PP
// available or not — so this component adds its own small "PP
// available" filter, the same idea as Purchase Price Update's, and
// renders rows with no PP (and therefore no RecommendedSP) as '—'
// instead of breaking. No new column is added for isActive/isInStock
// per current instructions — inactive / out-of-stock rows are just
// shown a little muted, with a small inline tag under the title, so
// they're still easy to tell apart without a dedicated column.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import TakeActionCell from "./TakeActionCell";

const fmt = (val) =>
  val != null
    ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '—';

// Treats 1 / true / "1" all as "on" — different rows in this table come
// from raw SQL (bit) vs other endpoints, so this keeps both readable.
const isOn = (v) => v === 1 || v === true || v === '1';

export default function InternalRecommendationsTable({ data }) {
  const [ppFilter, setPpFilter] = useState('all'); // 'all' | 'available' | 'unavailable'

  const visibleData = useMemo(() => {
    if (ppFilter === 'available')   return data.filter((r) => r.PP != null);
    if (ppFilter === 'unavailable') return data.filter((r) => r.PP == null);
    return data;
  }, [data, ppFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">PP:</span>
          <select
            value={ppFilter}
            onChange={(e) => setPpFilter(e.target.value)}
            className="pl-2 pr-6 py-1.5 text-xs text-slate-200 bg-slate-800 border border-slate-700
              rounded-lg outline-none cursor-pointer focus:border-violet-500 focus:ring-1
              focus:ring-violet-500/40 transition-colors"
          >
            <option value="all">All PP</option>
            <option value="available">PP available</option>
            <option value="unavailable">PP not available</option>
          </select>
        </div>
        <span className="text-xs text-slate-500">{visibleData.length} products</span>
      </div>

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
            {visibleData.map((row, i) => {
              const inactive = !isOn(row.isActive);
              const outOfStock = !isOn(row.isInStock);
              const muted = inactive || outOfStock;

              return (
                <tr key={row.SKU_ID}
                  className={`border-b border-slate-800 transition-colors
                    ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'} hover:bg-slate-800/50
                    ${muted ? 'opacity-60' : ''}`}
                >
                  <td className="px-2 py-3 text-center align-middle">
                    <span className="font-mono text-xs text-violet-300 break-all">{row.SKU_ID}</span>
                  </td>
                  <td className="px-2 py-3 text-center align-middle">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-slate-200 text-xs leading-snug">{row.Title}</span>
                      {muted && (
                        <span className="text-amber-500 text-[10px]">
                          {inactive && outOfStock ? 'Inactive · Out of stock' : inactive ? 'Inactive' : 'Out of stock'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-center align-middle">
                    <span className="text-slate-400 text-xs">{row.Category ?? '—'}</span>
                  </td>
                  <td className="px-2 py-3 text-center align-middle">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-slate-300 font-medium text-xs">{fmt(row.PP)}</span>
                      {row.PPSource === 'manual' && (
                        <span className="text-violet-400 text-[10px]">✏ manual</span>
                      )}
                      {row.PP == null && (
                        <span className="text-slate-500 text-[10px]">''</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-center align-middle">
                    <span className="text-slate-300 text-xs">{fmt(row.SP)}</span>
                  </td>
                  <td className="px-2 py-3 text-center align-middle">
                    {row.RecommendedSP != null ? (
                      <div className="relative group inline-block">
                        <span className="text-emerald-400 font-semibold text-xs cursor-default">
                          {fmt(row.RecommendedSP)}
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
                      <span className="text-slate-500 text-xs">—</span>
                    )}
                  </td>

                  <td className="px-2 py-3 text-center align-middle">
                    {row.RecommendedSP != null ? (
                      <TakeActionCell skuId={row.SKU_ID} recommendedSP={row.RecommendedSP} onPushed={() => {}} />
                    ) : (
                      <span className="text-slate-600 text-xs" title="No PP set — nothing to push yet">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}







































// // src/components/InternalRecommendationsTable.jsx
// // ─────────────────────────────────────────────────────────────
// // Internal-data-only RecommendedSP table.
// // No competitor matching, no Competitor Price / Comp. Stock /
// // Refresh columns — purely PP + business variables.
// // ─────────────────────────────────────────────────────────────

// import TakeActionCell from "./TakeActionCell";

// const fmt = (val) =>
//   val != null
//     ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
//     : '—';

// export default function InternalRecommendationsTable({ data }) {
//   return (
//     <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-visible">
//       <table className="w-full text-sm border-collapse table-fixed">
//         <thead>
//           <tr className="bg-slate-800/80 border-b border-slate-700">
//             {['Product SKU', 'Title', 'Category', 'PP (₹)', 'Current SP (₹)', 'Recommended SP (₹)', 'Take Action'].map(h => (
//               <th key={h} className="px-2 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
//                 {h}
//               </th>
//             ))}
//           </tr>
//         </thead>
//         <tbody>
//           {data.map((row, i) => (
//             <tr key={row.SKU_ID}
//               className={`border-b border-slate-800 transition-colors
//                 ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'} hover:bg-slate-800/50`}
//             >
//               <td className="px-2 py-3 text-center align-middle">
//                 <span className="font-mono text-xs text-violet-300 break-all">{row.SKU_ID}</span>
//               </td>
//               <td className="px-2 py-3 text-center align-middle">
//                 <span className="text-slate-200 text-xs leading-snug">{row.Title}</span>
//               </td>
//               <td className="px-2 py-3 text-center align-middle">
//                 <span className="text-slate-400 text-xs">{row.Category ?? '—'}</span>
//               </td>
//               <td className="px-2 py-3 text-center align-middle">
//                 <div className="flex flex-col items-center gap-0.5">
//                   <span className="text-slate-300 font-medium text-xs">{fmt(row.PP)}</span>
//                   {row.PPSource === 'manual' && (
//                     <span className="text-violet-400 text-[10px]">✏ manual</span>
//                   )}
//                 </div>
//               </td>
//               <td className="px-2 py-3 text-center align-middle">
//                 <span className="text-slate-300 text-xs">{fmt(row.SP)}</span>
//               </td>
//               <td className="px-2 py-3 text-center align-middle">
//                 <div className="relative group inline-block">
//                   <span className="text-emerald-400 font-semibold text-xs cursor-default">
//                     {fmt(row.RecommendedSP)}
//                   </span>
//                   <div className="
//                     absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
//                     px-2.5 py-1.5 rounded-lg bg-slate-700 border border-slate-600
//                     text-xs text-slate-200 whitespace-nowrap shadow-xl
//                     opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150
//                   ">
//                     Includes GST ({row.GSTPct}%) &amp; COB ({row.COBPct}%) &amp; Margin ({row.MarginPct}%)
//                     <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
//                   </div>
//                 </div>
//               </td>

//               <td className="px-2 py-3 text-center align-middle">
//   <TakeActionCell skuId={row.SKU_ID} recommendedSP={row.RecommendedSP} onPushed={() => {}} />
// </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// }