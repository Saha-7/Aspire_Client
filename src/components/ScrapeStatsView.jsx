// src/components/ScrapeStatsView.jsx
// ─────────────────────────────────────────────────────────────
// Scrape Details / Stats page — answers "we scraped 600+, why did
// only 2 match?" with a per-store/category breakdown:
//   - Matched (strict)  : passes full recommendation-engine criteria
//   - Matched (simple)  : SKU exists in InternalProducts at all
//   - No SKU            : scraper got the product but SKU was null/blank
//   - No internal match : had a SKU, just doesn't exist on our side
//   - In stock / Out of stock / Unknown : from the scraped data itself
//
// Defaults to the latest run; a dropdown lets you pick any older run
// since ScrapeRunStats is append-only (full history, tiny storage).
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { fetchScrapeRuns, fetchScrapeRunDetail } from '../services/api';

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Pct({ num, den }) {
  if (!den) return <span className="text-slate-500">—</span>;
  const pct = ((num / den) * 100).toFixed(1);
  return <span className="text-slate-500">({pct}%)</span>;
}

function StatPill({ label, value, color }) {
  const colors = {
    violet : 'text-violet-300 bg-violet-900/30 border-violet-700/40',
    emerald: 'text-emerald-300 bg-emerald-900/30 border-emerald-700/40',
    amber  : 'text-amber-300 bg-amber-900/30 border-amber-700/40',
    red    : 'text-red-300 bg-red-900/30 border-red-700/40',
    sky    : 'text-sky-300 bg-sky-900/30 border-sky-700/40',
    slate  : 'text-slate-300 bg-slate-800/60 border-slate-700/60',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color] || colors.slate}`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

export default function ScrapeStatsView({ onClose }) {
  const [runs, setRuns]               = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('latest');
  const [runId, setRunId]             = useState(null);
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await fetchScrapeRuns(25);
      setRuns(data);
    } catch (err) {
      console.error('Failed to load run history:', err.message);
    }
  }, []);

  const loadDetail = useCallback(async (which) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScrapeRunDetail(which);
      setRunId(data.runId);
      setRows(data.rows || []);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load scrape stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();
    loadDetail('latest');
  }, [loadRuns, loadDetail]);

  function handleRunChange(e) {
    const value = e.target.value;
    setSelectedRunId(value);
    loadDetail(value);
  }

  const totals = rows.reduce((acc, r) => ({
    TotalScraped       : acc.TotalScraped + (r.TotalScraped || 0),
    MatchedStrict      : acc.MatchedStrict + (r.MatchedStrict || 0),
    MatchedSimple      : acc.MatchedSimple + (r.MatchedSimple || 0),
    NullOrEmptySku     : acc.NullOrEmptySku + (r.NullOrEmptySku || 0),
    SkuNoInternalMatch : acc.SkuNoInternalMatch + (r.SkuNoInternalMatch || 0),
    InStockCount       : acc.InStockCount + (r.InStockCount || 0),
    OutOfStockCount    : acc.OutOfStockCount + (r.OutOfStockCount || 0),
    OutOfStockNullCount: acc.OutOfStockNullCount + (r.OutOfStockNullCount || 0),
    ErrorRows          : acc.ErrorRows + (r.Status === 'error' ? 1 : 0),
  }), {
    TotalScraped: 0, MatchedStrict: 0, MatchedSimple: 0, NullOrEmptySku: 0,
    SkuNoInternalMatch: 0, InStockCount: 0, OutOfStockCount: 0,
    OutOfStockNullCount: 0, ErrorRows: 0,
  });

  const runMeta = rows[0];

  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="w-px h-5 bg-slate-700" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-600 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Scrape Details</h1>
                <p className="text-xs text-slate-500">Per-store match & stock diagnostics</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedRunId}
              onChange={handleRunChange}
              className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg
                px-3 py-1.5 focus:outline-none focus:border-violet-500"
            >
              <option value="latest">Latest run</option>
              {runs.map(r => (
                <option key={r.RunId} value={r.RunId}>
                  {fmtDate(r.RunStartedAt)} — {r.StartedBy || 'unknown'} ({r.TotalScraped} scraped)
                </option>
              ))}
            </select>

            <button onClick={() => { loadRuns(); loadDetail(selectedRunId); }} disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors">
              <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading scrape diagnostics...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-24 text-slate-500 text-sm">
            No scrape stats recorded yet. Run a scrape from Settings → Scraping Config to see diagnostics here.
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
              <div className="text-xs text-slate-500">
                Run started <span className="text-slate-300">{fmtDate(runMeta?.RunStartedAt)}</span> by{' '}
                <span className="text-slate-300">{runMeta?.StartedBy || 'unknown'}</span>
                {totals.ErrorRows > 0 && (
                  <span className="text-red-400 ml-2">· {totals.ErrorRows} store/category failed</span>
                )}
              </div>
              <span className="text-[10px] text-slate-600 font-mono">RunId: {runId}</span>
            </div>

            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60
              border border-slate-700/60 mb-5 text-xs text-slate-400">
              <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <span className="text-slate-200 font-medium">Recommendation Match</span> means the SKUs exists internally & matched with competitor SKUs &
                passes the recommendation engine's full criteria (active + in stock + PP set + competitor in stock).{' '}
                <span className="text-slate-200 font-medium">SKU Matched</span> just means only SKU matched with competitor SKUs & our Products SKUs.
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
              <StatPill label="Total Scraped" value={totals.TotalScraped} color="slate" />
              <StatPill label="Recommendation Match" value={totals.MatchedStrict} color="emerald" />
              <StatPill label="SKU Matched" value={totals.MatchedSimple} color="sky" />
              <StatPill label="No SKU" value={totals.NullOrEmptySku} color="amber" />
              <StatPill label="No SKU Match" value={totals.SkuNoInternalMatch} color="amber" />
              <StatPill label="In Stock" value={totals.InStockCount} color="emerald" />
              <StatPill label="Out of Stock" value={totals.OutOfStockCount} color="red" />
              <StatPill label="Stock Unknown" value={totals.OutOfStockNullCount} color="red" />
            </div>

            {/* ── Per store/category table — table-fixed so columns share
                the container width instead of overflowing it; headers wrap
                to two lines instead of forcing nowrap. No horizontal scroll. ── */}
            <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-hidden">
              <table className="w-full text-sm border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700">
                    {['Store', 'Competitor Categories', 'TPS Categories', 'Scraped Count', 'Recommendation Match', 'SKU Matched',
                      'No SKU', 'No SKU Match', 'In Stock', 'Out of Stock', 'Stock Unknown'].map((h, idx) => (
                      <th key={h}
                        className={`px-2 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight
                          ${idx === 0 ? 'text-left' : 'text-center'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={`border-b border-slate-800 ${row.Status === 'error' ? 'bg-red-950/20' : ''}`}>
                      <td className="px-2 py-3 text-left text-slate-200 font-medium truncate">{row.StoreName}</td>
                      <td className="px-2 py-3 text-center text-slate-400 truncate" title={row.StoreSlug}>{row.StoreSlug}</td>
                      <td className="px-2 py-3 text-center text-slate-400 truncate" title={row.CategoryNames}>
                        {row.CategoryNames || '—'}
                      </td>

                      {row.Status === 'error' ? (
                        <td colSpan={7} className="px-2 py-3 text-center text-red-400 text-xs">
                          ❌ {row.ErrorMessage || 'Failed'}
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-3 text-center text-slate-200 font-semibold">{row.TotalScraped}</td>
                          <td className="px-2 py-3 text-center text-emerald-300">
                            {row.MatchedStrict} <Pct num={row.MatchedStrict} den={row.TotalScraped} />
                          </td>
                          <td className="px-2 py-3 text-center text-sky-300">
                            {row.MatchedSimple} <Pct num={row.MatchedSimple} den={row.TotalScraped} />
                          </td>
                          <td className="px-2 py-3 text-center text-amber-300">{row.NullOrEmptySku}</td>
                          <td className="px-2 py-3 text-center text-amber-300">{row.SkuNoInternalMatch}</td>
                          <td className="px-2 py-3 text-center text-emerald-300">{row.InStockCount}</td>
                          <td className="px-2 py-3 text-center text-red-300">{row.OutOfStockCount}</td>
                          <td className="px-2 py-3 text-center text-red-300">{row.OutOfStockNullCount}</td>
                        </>
                      )}
                    </tr>
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