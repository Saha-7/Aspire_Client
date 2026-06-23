// src/components/InternalRecommendationsTable.jsx
// ─────────────────────────────────────────────────────────────
// Internal-data-only RecommendedSP table.
// No competitor matching, no Competitor Price / Comp. Stock /
// Refresh columns — purely PP + business variables.
// ─────────────────────────────────────────────────────────────

const fmt = (val) =>
  val != null
    ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '—';

export default function InternalRecommendationsTable({ data }) {
  return (
    <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-visible">
      <table className="w-full text-sm border-collapse table-fixed">
        <thead>
          <tr className="bg-slate-800/80 border-b border-slate-700">
            {['Product SKU', 'Title', 'Category', 'PP (₹)', 'Current SP (₹)', 'Recommended SP (₹)'].map(h => (
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
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-slate-300 font-medium text-xs">{fmt(row.PP)}</span>
                  {row.PPSource === 'manual' && (
                    <span className="text-violet-400 text-[10px]">✏ manual</span>
                  )}
                </div>
              </td>
              <td className="px-2 py-3 text-center align-middle">
                <span className="text-slate-300 text-xs">{fmt(row.SP)}</span>
              </td>
              <td className="px-2 py-3 text-center align-middle">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}