// SalespersonMappingTab.jsx
//
// Read-only admin view: which salesperson is assigned to which
// Category + Brand combination. No add/edit/delete — the mapping itself
// lives upstream in vw_Shopify_Product_SKUs_With_SalesPerson.
//
// Wire in as a 4th tab alongside your existing Settings tabs
// (Business Variables / Variance Threshold / Bill Lookback), e.g.:
//   <Tab label="Sales Mapping"><SalespersonMappingTab /></Tab>
//
// Assumes Tailwind is already configured (it is, per the rest of the app).

import { useState, useEffect, useMemo } from 'react';

const VISIBLE_CHIPS = 3;

function AssignmentChips({ assignments }) {
  const [expanded, setExpanded] = useState(false);

  if (assignments.length === 0) {
    return (
      <span className="inline-block rounded-full bg-gray-800 text-gray-500 text-xs px-3 py-1 border border-gray-700">
        Unassigned
      </span>
    );
  }

  const visible = expanded ? assignments : assignments.slice(0, VISIBLE_CHIPS);
  const remaining = assignments.length - VISIBLE_CHIPS;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {visible.map((a, i) => (
        <span
          key={`${a.category}-${a.brand}-${i}`}
          className="inline-block rounded-full bg-blue-500/10 text-blue-400 text-xs px-3 py-1 border border-blue-500/30"
        >
          {a.category || '—'} <span className="text-blue-500/60">•</span> {a.brand || '—'}
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          +{remaining} more
        </button>
      )}
      {expanded && assignments.length > VISIBLE_CHIPS && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-gray-500 hover:text-gray-400 underline underline-offset-2"
        >
          Show less
        </button>
      )}
    </div>
  );
}

export default function SalespersonMappingTab() {
  const [salespeople, setSalespeople] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter dropdown options — fetched once
  useEffect(() => {
    fetch('/api/salesperson-mapping/filters')
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories || []);
        setBrands(data.brands || []);
      })
      .catch(() => {
        // non-fatal — dropdowns just stay empty
      });
  }, []);

  // Table data — refetched on filter change, debounced for the search box
  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (brand) params.set('brand', brand);

      fetch(`/api/salesperson-mapping?${params.toString()}`)
        .then((r) => {
          if (!r.ok) throw new Error('Request failed');
          return r.json();
        })
        .then((data) => setSalespeople(data.salespeople || []))
        .catch(() => setError('Could not load salesperson mapping. Try again.'))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(handle);
  }, [search, category, brand]);

  const assignedCount = useMemo(
    () => salespeople.filter((s) => s.assignments.length > 0).length,
    [salespeople]
  );

  return (
    <div className="bg-gray-950 text-gray-200 rounded-lg border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-100">Category &amp; Brand Mapping</h2>
        <span className="text-xs text-gray-500">
          {salespeople.length} salespeople &middot; {assignedCount} assigned
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Read-only view of which salesperson covers which category and brand.
      </p>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/60"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/60"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/60"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="border border-gray-800 rounded-md overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_2fr] bg-gray-900 text-xs uppercase tracking-wide text-gray-500 px-4 py-2">
          <span>Salesperson</span>
          <span>Email</span>
          <span>Assigned</span>
        </div>

        {loading && (
          <div className="px-4 py-6 text-sm text-gray-500">Loading...</div>
        )}

        {!loading && error && (
          <div className="px-4 py-6 text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && salespeople.length === 0 && (
          <div className="px-4 py-6 text-sm text-gray-500">No salespeople match these filters.</div>
        )}

        {!loading && !error && salespeople.map((sp) => (
          <div
            key={sp.email}
            className="grid grid-cols-[1fr_1fr_2fr] items-center px-4 py-3 border-t border-gray-800 hover:bg-gray-900/50"
          >
            <span className="text-sm text-gray-200">{sp.firstName} {sp.lastName}</span>
            <span className="text-sm text-gray-500">{sp.email}</span>
            <AssignmentChips assignments={sp.assignments} />
          </div>
        ))}
      </div>
    </div>
  );
}