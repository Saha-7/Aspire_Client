// src/components/SalespersonMappingTab.jsx
// ─────────────────────────────────────────────────────────────
// Admin-only, READ-ONLY view: which salesperson covers which
// Category + Brand. The mapping itself lives upstream in
// vw_Shopify_Product_SKUs_With_SalesPerson — nothing is edited here.
//
// Filters: search (name / email) + searchable Category + Brand dropdowns
// (re-uses the same CategoryFilter / BrandFilter as the rest of the app).
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import CategoryFilter from './CategoryFilter';
import BrandFilter from './BrandFilter';
import {
  fetchSalespersonMapping,
  fetchSalespersonMappingFilters,
} from '../services/api';

const VISIBLE_CHIPS = 3;

function AssignmentChips({ assignments }) {
  const [expanded, setExpanded] = useState(false);

  if (assignments.length === 0) {
    return (
      <span className="inline-block px-2.5 py-1 rounded-full text-[11px] bg-slate-800 border border-slate-700 text-slate-500">
        Unassigned
      </span>
    );
  }

  const visible   = expanded ? assignments : assignments.slice(0, VISIBLE_CHIPS);
  const remaining = assignments.length - VISIBLE_CHIPS;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((a, i) => (
        <span key={`${a.category}|${a.brand}|${i}`}
          className="px-2.5 py-1 rounded-full text-[11px] bg-violet-900/40 border border-violet-700/50 text-violet-300">
          {a.category || '—'}
          <span className="mx-1 text-violet-500">•</span>
          {a.brand || '—'}
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button onClick={() => setExpanded(true)}
          className="text-[11px] text-violet-400 hover:text-violet-300 underline underline-offset-2">
          +{remaining} more
        </button>
      )}
      {expanded && assignments.length > VISIBLE_CHIPS && (
        <button onClick={() => setExpanded(false)}
          className="text-[11px] text-slate-500 hover:text-slate-300 underline underline-offset-2">
          Show less
        </button>
      )}
    </div>
  );
}

export default function SalespersonMappingTab() {
  const [rows, setRows]             = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands]         = useState([]);
  const [search, setSearch]         = useState('');
  const [category, setCategory]     = useState('');
  const [brand, setBrand]           = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Dropdown options — once
  useEffect(() => {
    fetchSalespersonMappingFilters()
      .then((d) => { setCategories(d.categories || []); setBrands(d.brands || []); })
      .catch(() => { /* non-fatal: dropdowns stay empty */ });
  }, []);

  // Table — refetch on filter change (search is debounced)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSalespersonMapping({ search, category, brand });
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || 'Could not load salesperson mapping.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, category, brand]);

  const assignedCount = useMemo(
    () => rows.filter((r) => r.assignments.length > 0).length, [rows]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Category &amp; Brand → Salesperson</h2>
          <p className="text-xs text-slate-500 mt-1">
            Read-only. Assignments are maintained upstream; this shows who covers what.
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {rows.length} salespeople · {assignedCount} assigned · {rows.length - assignedCount} unassigned
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email..."
          className="flex-1 min-w-[220px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
        />
        <CategoryFilter categories={categories} value={category} onChange={setCategory} />
        <BrandFilter brands={brands} value={brand} onChange={setBrand} />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
        <div className="grid grid-cols-[1.2fr_1.4fr_3fr] px-4 py-2.5 bg-slate-900 text-[11px] uppercase tracking-wide text-slate-500">
          <span>Salesperson</span><span>Email</span><span>Assigned</span>
        </div>

        {loading && (
          <div className="px-4 py-8 text-sm text-slate-500 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        )}
        {!loading && error && <div className="px-4 py-6 text-sm text-red-400">{error}</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="px-4 py-8 text-sm text-slate-500">No salespeople match these filters.</div>
        )}

        {!loading && !error && rows.map((sp) => (
          <div key={sp.email}
            className="grid grid-cols-[1.2fr_1.4fr_3fr] items-center gap-2 px-4 py-3 border-t border-slate-800 hover:bg-slate-800/40">
            <span className="text-sm text-slate-200">{sp.firstName} {sp.lastName}</span>
            <span className="text-xs text-slate-500 truncate">{sp.email}</span>
            <AssignmentChips assignments={sp.assignments} />
          </div>
        ))}
      </div>
    </div>
  );
}