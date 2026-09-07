// src/components/PPUpdateView.jsx
// ─────────────────────────────────────────────────────────────
// Full-page view for Purchase Price (PP) updates.
// Rendered when user clicks "Purchase Price Update" in the hamburger menu.
// Reuses SearchBar + CategoryFilter from the main table.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo } from 'react';
import SearchBar      from './SearchBar';
import CategoryFilter from './CategoryFilter';
import PPUpdateRow    from './PPUpdateRow';
import { fetchPPProducts } from '../services/api';

export default function PPUpdateView({ onClose }) {
  const [data, setData]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [activeInStockOnly, setActiveInStockOnly] = useState(false);
  const [ppFilter, setPpFilter] = useState('all'); // 'all' | 'available' | 'unavailable'

  // ── Load all products on mount ────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPPProducts();
      setData(rows);
    } catch (err) {
      setError('Failed to load products. Check the API server.');
    } finally {
      setLoading(false);
    }
  }

  // ── Handle a row saving — update that row in local state ──
  function handleRowSaved(skuId, updatedFields) {
    setData(prev => prev.map(row => {
      if (row.SKU_ID !== skuId) return row;
      return {
        ...row,
        PP                : updatedFields.PP,
        ManualPP_UpdatedAt: updatedFields.ManualPP_UpdatedAt,
        ManualPP_UpdatedBy: updatedFields.ManualPP_UpdatedBy,
        LastBillDate      : updatedFields.LastBillDate,
        // Recalculate PPSource client-side immediately
        PPSource: (() => {
          if (!updatedFields.ManualPP_UpdatedAt) return 'bill';
          if (!updatedFields.LastBillDate)       return 'manual (no bill date)';
          return new Date(updatedFields.ManualPP_UpdatedAt) >= new Date(updatedFields.LastBillDate)
            ? 'manual'
            : 'bill (newer than manual)';
        })(),
      };
    }));
  }

  // ── Unique sorted categories ──────────────────────────────
  const categories = useMemo(() => {
    const cats = [...new Set(data.map(r => r.Category).filter(Boolean))];
    return cats.sort((a, b) => a.localeCompare(b));
  }, [data]);

  // ── Filter data ───────────────────────────────────────────
  const filteredData = useMemo(() => {
    let result = data;
    if (selectedCategory) result = result.filter(r => r.Category === selectedCategory);
    if (activeInStockOnly) result = result.filter(r => r.isActive === 1 || r.isActive === true).filter(r => r.isInStock === 1 || r.isInStock === true);
    if (ppFilter === 'available')   result = result.filter(r => r.PP != null);
    if (ppFilter === 'unavailable') result = result.filter(r => r.PP == null);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        (r.SKU_ID || '').toLowerCase().includes(q) ||
        (r.Title  || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, searchQuery, selectedCategory, activeInStockOnly, ppFilter]);

  const anyFilterActive = searchQuery || selectedCategory || activeInStockOnly || ppFilter !== 'all';

  // ── Download filtered products as a bulk-PP-style CSV ──────
  // Same two-column format as the Bulk PP Update template (SKU,PP), but
  // SKUs are pre-filled from whatever is currently filtered/visible here,
  // and PP is pre-filled when the product already has one — so a sales
  // rep can open the file and only needs to type in the blanks.
  function handleDownloadFiltered() {
    const escapeCell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = 'SKU,PP\n';
    const body = filteredData
      .map(r => `${escapeCell(r.SKU_ID)},${r.PP != null ? r.PP : ''}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url  = window.URL.createObjectURL(blob);

    const parts = ['pp_export'];
    if (selectedCategory)  parts.push(selectedCategory.replace(/\s+/g, '_').toLowerCase());
    if (activeInStockOnly) parts.push('active_instock');
    if (ppFilter !== 'all') parts.push(ppFilter);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${parts.join('_')}.csv`);
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // ── Stats ─────────────────────────────────────────────────
  const manualCount = data.filter(r => r.PPSource === 'manual' || r.PPSource === 'manual (no bill date)').length;
  const billCount   = data.length - manualCount;

  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">

      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 pr-16 sm:pr-20 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back button */}
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
              <div className="w-7 h-7 rounded-lg bg-violet-600/80 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Purchase Price Update</h1>
                <p className="text-xs text-slate-500">Edit PP for internal products · changes apply on next recommendation run</p>
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
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">

        {/* ── Stats cards ── */}
        {!loading && !error && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-violet-700/40 bg-violet-900/20 p-4">
              <p className="text-xs text-slate-500 mb-1">Total Products</p>
              <p className="text-2xl font-bold text-violet-400">{data.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
              <p className="text-xs text-slate-500 mb-1">Manual PP Active</p>
              <p className="text-2xl font-bold text-emerald-400">{manualCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">override in effect</p>
            </div>
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/20 p-4">
              <p className="text-xs text-slate-500 mb-1">Using Bill PP</p>
              <p className="text-2xl font-bold text-slate-400">{billCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">from Zoho bills</p>
            </div>
          </div>
        )}

        {/* ── Info notice ── */}
        {!loading && !error && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/60 mb-5 text-xs text-slate-400">
            <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Saving a manual PP overrides the Zoho bill price for recommendations — until a newer bill arrives.
              Rule: if <span className="text-slate-200 font-medium">Manual PP date ≥ last bill date</span>, manual PP is used.
              Otherwise the bill PP takes over automatically on the next sync.
            </span>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading products...</p>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Table ── */}
        {!loading && !error && (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <SearchBar
                  onSearch={setSearchQuery}
                  value={searchQuery}
                  placeholder="Search by SKU or name..."
                />
                <CategoryFilter
                  categories={categories}
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                />

                {/* Active & In Stock toggle */}
                <button
                  onClick={() => setActiveInStockOnly(v => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                    border transition-colors ${
                      activeInStockOnly
                        ? 'bg-emerald-600/20 border-emerald-600/60 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  title="Show only products that are Active and In Stock"
                >
                  <span className={`w-7 h-4 rounded-full relative transition-colors flex-shrink-0 ${
                    activeInStockOnly ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      activeInStockOnly ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`} />
                  </span>
                  Active &amp; In Stock
                </button>

                {/* PP availability filter */}
                <div className="relative flex items-center gap-2">
                  <select
                    value={ppFilter}
                    onChange={(e) => setPpFilter(e.target.value)}
                    className="pl-2 pr-7 py-1.5 text-xs text-slate-200 bg-slate-800 border border-slate-700
                      rounded-lg outline-none appearance-none cursor-pointer
                      focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition-colors"
                  >
                    <option value="all">All PP</option>
                    <option value="available">PP Available</option>
                    <option value="unavailable">PP Not Available</option>
                  </select>
                  <svg className="w-3 h-3 text-slate-500 absolute right-2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {anyFilterActive && (
                  <button
                    onClick={() => { setSearchQuery(''); setSelectedCategory(''); setActiveInStockOnly(false); setPpFilter('all'); }}
                    className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
                <span className="text-xs text-slate-500">
                  {filteredData.length === data.length
                    ? `${data.length} products`
                    : `${filteredData.length} of ${data.length} products`}
                </span>
                <button
                  onClick={handleDownloadFiltered}
                  disabled={filteredData.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                    bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed
                    text-white transition-colors"
                  title="Download the currently filtered products as a bulk-PP-update CSV"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m-9 7h12a2 2 0 002-2V8a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 0010.586 4H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
                  </svg>
                  Download CSV
                </button>
              </div>
            </div>

            {/* Empty state */}
            {filteredData.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <p className="text-sm">No products match your search.</p>
                <button
                  onClick={() => { setSearchQuery(''); setSelectedCategory(''); setActiveInStockOnly(false); setPpFilter('all'); }}
                  className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-800/80 border-b border-slate-700">
                      {['Product SKU', 'Title', 'Category', 'Current PP', 'Last Bill Date', 'Last Updated By', 'Action'].map(h => (
                        <th key={h} className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider
                          first:text-left [&:nth-child(2)]:text-left text-center">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row, i) => (
                      <PPUpdateRow
                        key={row.SKU_ID}
                        row={row}
                        onSaved={handleRowSaved}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

