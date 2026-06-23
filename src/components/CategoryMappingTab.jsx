// src/components/CategoryMappingTab.jsx
// ─────────────────────────────────────────────────────────────
// Category Mapping UI — links store scraper slugs to internal
// product category names so the scheduler knows what to scrape.
//
// Interaction model:
//   1. Left panel  — store categories (source), grouped by store
//   2. Right panel — internal categories (target), from InternalProducts
//   3. Click a store slug pill  → selects it (highlights violet)
//   4. Click an internal category row → saves the mapping immediately
//   5. Click × on a badge under an internal category → deletes the mapping
//
// Admin/Supervisor only — enforced on the backend.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo } from 'react';
import {
  fetchStoreCategories,
  fetchCategoryMappings,
  saveCategoryMapping,
  deleteCategoryMapping,
} from '../services/api';

// ── Store colour accents ──────────────────────────────────────
const STORE_COLORS = {
  primeabgb  : { pill: 'bg-violet-900/50 border-violet-700/60 text-violet-300', dot: 'bg-violet-400' },
  mdcomputers: { pill: 'bg-sky-900/50 border-sky-700/60 text-sky-300',         dot: 'bg-sky-400'    },
  vedant     : { pill: 'bg-emerald-900/50 border-emerald-700/60 text-emerald-300', dot: 'bg-emerald-400' },
  vishal     : { pill: 'bg-amber-900/50 border-amber-700/60 text-amber-300',   dot: 'bg-amber-400'  },
  pcstudio   : { pill: 'bg-rose-900/50 border-rose-700/60 text-rose-300',      dot: 'bg-rose-400'   },
};

const DEFAULT_STORE_COLOR = {
  pill: 'bg-slate-800/60 border-slate-600/60 text-slate-300',
  dot : 'bg-slate-400',
};

function storeColor(storeName) {
  return STORE_COLORS[storeName] ?? DEFAULT_STORE_COLOR;
}

// ── Small store dot badge ─────────────────────────────────────
function StoreDot({ storeName }) {
  const { dot } = storeColor(storeName);
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
  );
}

// ── Mapped badge shown under an internal category row ─────────
function MappingBadge({ mapping, onDelete, deleting }) {
  const { pill } = storeColor(mapping.StoreName);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full
      text-[10px] font-medium border ${pill} group`}>
      <StoreDot storeName={mapping.StoreName} />
      <span>{mapping.StoreName} / {mapping.StoreSlug}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(mapping.ID); }}
        disabled={deleting === mapping.ID}
        className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
        title="Remove mapping"
      >
        {deleting === mapping.ID ? (
          <svg className="w-2.5 h-2.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ) : (
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function CategoryMappingTab({ user, categorySettings = [] }) {
  // ── Data ──────────────────────────────────────────────────
  const [storeCategories,   setStoreCategories]   = useState([]);
 // const [internalCategories, setInternalCategories] = useState([]);
 const internalCategories = useMemo(
  () => [...new Set(categorySettings.map(s => s.CategoryName))].sort((a, b) => a.localeCompare(b)),
  [categorySettings]
);
  const [mappings,          setMappings]           = useState([]);
  const [loading,           setLoading]            = useState(true);
  const [error,             setError]              = useState(null);

  // ── Selection state ───────────────────────────────────────
  // The currently selected store pill: { storeName, storeSlug } | null
  const [selected, setSelected] = useState(null);

  // ── In-flight states ──────────────────────────────────────
  const [saving,   setSaving]   = useState(false);   // internalCategory being saved
  const [deleting, setDeleting] = useState(null);    // mapping ID being deleted
  const [flashId,  setFlashId]  = useState(null);    // internal category that just got a new mapping

  // ── Search ────────────────────────────────────────────────
  const [storeSearch,    setStoreSearch]    = useState('');
  const [internalSearch, setInternalSearch] = useState('');

  // ── Load everything on mount ──────────────────────────────
  useEffect(() => {
    load();
  }, []);

  // Dismiss selection on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') setSelected(null);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  async function load() {
  setLoading(true);
  setError(null);
  try {
    const [storeCats, maps] = await Promise.all([
      fetchStoreCategories(),
      fetchCategoryMappings(),
    ]);
    setStoreCategories(storeCats);
    setMappings(maps);
  } catch (err) {
    setError('Failed to load data. Check the API server.');
  } finally {
    setLoading(false);
  }
}

  // ── Derived: mapping lookup maps ──────────────────────────
  // slugKey → mapping  (for left panel — is this slug already mapped?)
  const slugMappingMap = useMemo(() => {
    const map = new Map();
    for (const m of mappings) {
      map.set(`${m.StoreName}::${m.StoreSlug}`, m);
    }
    return map;
  }, [mappings]);

  // internalCategory → mapping[]  (for right panel — what slugs point here?)
  const internalMappingMap = useMemo(() => {
    const map = new Map();
    for (const m of mappings) {
      if (!map.has(m.InternalCategory)) map.set(m.InternalCategory, []);
      map.get(m.InternalCategory).push(m);
    }
    return map;
  }, [mappings]);

  // ── Grouped store categories for left panel ───────────────
  const groupedStores = useMemo(() => {
    const q = storeSearch.toLowerCase();
    const filtered = storeCategories.filter(sc =>
      sc.storeName.toLowerCase().includes(q) ||
      sc.storeSlug.toLowerCase().includes(q)
    );
    const groups = new Map();
    for (const sc of filtered) {
      if (!groups.has(sc.storeName)) groups.set(sc.storeName, []);
      groups.get(sc.storeName).push(sc);
    }
    return groups;
  }, [storeCategories, storeSearch]);

  // ── Filtered internal categories for right panel ──────────
  const filteredInternal = useMemo(() => {
    const q = internalSearch.toLowerCase();
    return internalCategories.filter(cat => cat.toLowerCase().includes(q));
  }, [internalCategories, internalSearch]);

  // ── Handle: click a store pill ────────────────────────────
  function handlePillClick(storeName, storeSlug) {
    const key = `${storeName}::${storeSlug}`;
    if (selected?.storeName === storeName && selected?.storeSlug === storeSlug) {
      setSelected(null); // deselect if clicking same pill
    } else {
      setSelected({ storeName, storeSlug, key });
    }
  }

  // ── Handle: click an internal category row ────────────────
  async function handleInternalClick(categoryName) {
    if (!selected) return; // nothing selected on left — ignore

    // If this exact triple already exists, do nothing (already mapped here)
    const alreadyMapped = mappings.some(
      m => m.StoreName === selected.storeName &&
           m.StoreSlug === selected.storeSlug &&
           m.InternalCategory === categoryName
    );
    if (alreadyMapped) return;

    setSaving(categoryName);
    try {
      const saved = await saveCategoryMapping(categoryName, selected.storeName, selected.storeSlug);

      // setMappings(prev => {
      //   // Remove old mapping for this slug if it existed (remap case)
      //   const without = prev.filter(
      //     m => !(m.StoreName === selected.storeName && m.StoreSlug === selected.storeSlug)
      //   );
      //   return [...without, saved];
      // });
      // ADD the new mapping (many-to-many — don't remove existing ones)
      setMappings(prev => [...prev, saved]);

      // Flash the row briefly — keep pill selected so user can map more
      setFlashId(categoryName);
      setTimeout(() => setFlashId(null), 1200);
      // NOTE: setSelected(null) intentionally removed — pill stays selected


      
      // Flash the row briefly
      setFlashId(categoryName);
      setTimeout(() => setFlashId(null), 1200);
      setSelected(null);
    } catch (err) {
      console.error('Save mapping failed:', err);
    } finally {
      setSaving(null);
    }
  }

  // ── Handle: delete a mapping ──────────────────────────────
  async function handleDelete(id) {
    setDeleting(id);
    try {
      await deleteCategoryMapping(id);
      setMappings(prev => prev.filter(m => m.ID !== id));
    } catch (err) {
      console.error('Delete mapping failed:', err);
    } finally {
      setDeleting(null);
    }
  }

  // ── Stats ─────────────────────────────────────────────────
  const totalSlugs   = storeCategories.length;
  const mappedSlugs  = mappings.length;
  const unmappedSlugs = totalSlugs - mappedSlugs;

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading category data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div>

      {/* ── Instruction banner ── */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60
        border border-slate-700/60 mb-5 text-xs text-slate-400">
        <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          Click a <span className="text-slate-200 font-medium">store category</span> on the left to select it,
          then click an <span className="text-slate-200 font-medium">internal category</span> on the right to link them.
          The scraper will use these mappings to know which store pages to scrape for each of your products.
          Press <kbd className="px-1 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px]">Esc</kbd> to cancel a selection.
        </span>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3">
          <p className="text-xs text-slate-500 mb-0.5">Total External Category Synonyms</p>
          <p className="text-xl font-bold text-slate-200">{totalSlugs}</p>
        </div>
        <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-4 py-3">
          <p className="text-xs text-slate-500 mb-0.5">Mapped</p>
          <p className="text-xl font-bold text-emerald-400">{mappedSlugs}</p>
        </div>
        <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 px-4 py-3">
          <p className="text-xs text-slate-500 mb-0.5">Unmapped</p>
          <p className="text-xl font-bold text-amber-400">{unmappedSlugs}</p>
        </div>
      </div>

      {/* ── Active selection indicator ── */}
      {selected && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl
          bg-violet-900/30 border border-violet-700/60 mb-4">
          <svg className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3-3 3M5 12h11" />
          </svg>
          <span className="text-xs text-violet-300">
            Selected: <span className="font-semibold">{selected.storeName}</span>
            <span className="text-violet-500 mx-1">/</span>
            <span className="font-semibold">{selected.storeSlug}</span>
            <span className="text-violet-500 ml-2">— now click an internal category →</span>
          </span>
          <button
            onClick={() => setSelected(null)}
            className="ml-auto text-violet-500 hover:text-violet-300 transition-colors text-[10px]"
          >
            Cancel (Esc)
          </button>
        </div>
      )}

      {/* ── Two panel layout ── */}
      <div className="grid grid-cols-2 gap-4">

        {/* ══ LEFT — Store categories ══ */}
        <div className="rounded-xl border border-slate-700/60 overflow-hidden flex flex-col">

          {/* Panel header */}
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">External Store Categories</p>
            </div>
            <input
              value={storeSearch}
              onChange={e => setStoreSearch(e.target.value)}
              placeholder="Search..."
              className="w-36 px-2.5 py-1.5 text-xs text-slate-200 bg-slate-900
                border border-slate-700 rounded-lg outline-none
                focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition-colors"
            />
          </div>

          {/* Store group list */}
          <div className="overflow-y-auto flex-1 max-h-[560px]">
            {[...groupedStores.entries()].map(([storeName, slugs]) => {
              const { dot } = storeColor(storeName);
              return (
                <div key={storeName} className="border-b border-slate-800/80 last:border-0">

                  {/* Store name header */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/40 sticky top-0 z-10">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="text-[11px] font-semibold text-slate-300 capitalize">{storeName}</span>
                    <span className="text-[10px] text-slate-600 ml-auto">{slugs.length} slugs</span>
                  </div>

                  {/* Slug pills */}
                  <div className="px-4 py-3 flex flex-wrap gap-2">
                    {slugs.map(sc => {
                      const key         = `${sc.storeName}::${sc.storeSlug}`;
                      const existingMap = slugMappingMap.get(key);
                      const isSelected  = selected?.key === key;
                      const isMapped    = !!existingMap;

                      return (
                        <button
                          key={key}
                          onClick={() => handlePillClick(sc.storeName, sc.storeSlug)}
                          title={isMapped ? `Mapped to: ${existingMap.InternalCategory}` : 'Not yet mapped — click to select'}
                          className={`
                            inline-flex flex-col items-start px-2.5 py-1.5 rounded-lg border
                            text-[11px] font-medium transition-all cursor-pointer
                            ${isSelected
                              ? 'bg-violet-600 border-violet-500 text-white ring-2 ring-violet-400/40'
                              : isMapped
                              ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300 hover:border-emerald-500'
                              : 'bg-slate-800/60 border-slate-600/60 text-slate-400 hover:border-slate-400 hover:text-slate-200'
                            }
                          `}
                        >
                          <span>{sc.storeSlug}</span>
                          {isMapped && !isSelected && (
                            <span className="text-[9px] text-emerald-500 mt-0.5">
                              → {existingMap.InternalCategory}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {groupedStores.size === 0 && (
              <p className="text-center text-slate-600 text-xs py-12">No results</p>
            )}
          </div>
        </div>

        {/* ══ RIGHT — Internal categories ══ */}
        <div className="rounded-xl border border-slate-700/60 overflow-hidden flex flex-col">

          {/* Panel header */}
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">TPS Store Categories</p>
              
            </div>
            <input
              value={internalSearch}
              onChange={e => setInternalSearch(e.target.value)}
              placeholder="Search..."
              className="w-36 px-2.5 py-1.5 text-xs text-slate-200 bg-slate-900
                border border-slate-700 rounded-lg outline-none
                focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition-colors"
            />
          </div>

          {/* Internal category rows */}
          <div className="overflow-y-auto flex-1 max-h-[560px]">
            {filteredInternal.map(categoryName => {
              const catMappings = internalMappingMap.get(categoryName) ?? [];
              const isSaving    = saving === categoryName;
              const isFlashing  = flashId === categoryName;
              const isClickable = !!selected;

              return (
                <div
                  key={categoryName}
                  onClick={() => handleInternalClick(categoryName)}
                  className={`
                    border-b border-slate-800/60 last:border-0 px-4 py-3
                    transition-colors
                    ${isClickable
                      ? 'cursor-pointer hover:bg-violet-900/20 hover:border-violet-800/40'
                      : 'cursor-default'
                    }
                    ${isFlashing ? 'bg-emerald-900/30' : ''}
                    ${isSaving   ? 'bg-violet-900/20 opacity-75' : ''}
                  `}
                >
                  <div className="flex items-center gap-2 min-h-[20px]">
                    {/* Category name */}
                    <span className={`text-sm font-medium flex-1
                      ${isClickable ? 'text-slate-200' : 'text-slate-400'}
                      ${isFlashing  ? 'text-emerald-300' : ''}
                    `}>
                      {categoryName}
                    </span>

                    {/* Saving spinner */}
                    {isSaving && (
                      <svg className="w-3.5 h-3.5 text-violet-400 animate-spin flex-shrink-0"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}

                    {/* Flash check */}
                    {isFlashing && !isSaving && (
                      <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}

                    {/* Mapping count badge */}
                    {catMappings.length > 0 && !isSaving && !isFlashing && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full
                        bg-slate-700/60 text-slate-400 border border-slate-600/60 flex-shrink-0">
                        {catMappings.length} mapped
                      </span>
                    )}
                  </div>

                  {/* Mapped slugs as badges */}
                  {catMappings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {catMappings.map(m => (
                        <MappingBadge
                          key={m.ID}
                          mapping={m}
                          onDelete={handleDelete}
                          deleting={deleting}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredInternal.length === 0 && (
              <p className="text-center text-slate-600 text-xs py-12">No results</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-6 mt-4 px-1">
        <span className="text-[10px] text-slate-600 font-medium uppercase tracking-wider">Legend</span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-3 h-3 rounded bg-violet-600 inline-block" /> Selected
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-3 h-3 rounded bg-emerald-900/50 border border-emerald-700/50 inline-block" /> Mapped
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-3 h-3 rounded bg-slate-800/60 border border-slate-600/60 inline-block" /> Unmapped
        </span>
        <div className="ml-auto flex items-center gap-3">
          {Object.entries(STORE_COLORS).map(([name, { dot }]) => (
            <span key={name} className="flex items-center gap-1 text-[10px] text-slate-500 capitalize">
              <span className={`w-1.5 h-1.5 rounded-full ${dot} inline-block`} />
              {name}
            </span>
          ))}
        </div>
      </div>

    </div>
  );
}