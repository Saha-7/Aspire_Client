// src/components/BusinessVariablesTab.jsx
// ─────────────────────────────────────────────────────────────
// Settings → Business Variables tab (category + brand).
//
//   • One row per category (parent). Expand it to see its brands.
//   • A brand with no value of its own inherits the category value
//     (and the category inherits the system default).
//   • Editing a brand changes ONLY that brand. Clearing a field and saving
//     removes the override, so the brand goes back to inheriting.
//   • Columns are generated from the variable list returned by the API, so a
//     new business variable shows up here without any UI change.
//   • The server decides what each user may see/edit (canEdit flags).
//   • Save results, errors and edit conflicts are shown as toasts.
// ─────────────────────────────────────────────────────────────

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBusinessVariables,
  saveBusinessVariables,
  updateCategorySettings,
  BV_INFO_TOAST_KEY,
} from '../services/api';
import { useToast } from '../context/ToastContext';

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Unit helpers: PERCENT variables show "%" with one decimal; DAYS variables
// (e.g. a future PP lookback variable) show whole numbers with " days".
const isDays     = (def) => def.unit === 'DAYS';
const unitSuffix = (def) => (def.unit === 'PERCENT' ? '%' : isDays(def) ? 'days' : (def.unit || ''));
const fmtNum     = (def, v) => (isDays(def) ? String(Math.round(Number(v))) : Number(v).toFixed(1));

function NumberInput({ value, onChange, placeholder, min, max, step = '0.1', suffix, label }) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      <input type="number" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-24 px-2 py-1 text-xs text-slate-100 bg-slate-700 border border-slate-600
          rounded-lg outline-none text-center focus:border-violet-500 placeholder:text-slate-500
          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      <span className="text-slate-500 text-xs">{suffix}</span>
    </div>
  );
}

// Value shown when the row is not being edited.
function CellValue({ def, own, effective, isBrand }) {
  const suffix = unitSuffix(def);
  if (own) {
    return (
      <span className="text-slate-100 text-sm font-semibold inline-flex items-center gap-1"
        title={isBrand ? 'Custom value for this brand' : 'Set for this category'}>
        {isBrand && <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
        {fmtNum(def, own.value)}
        <span className="text-slate-500 text-xs font-normal">{suffix}</span>
      </span>
    );
  }
  const from = effective?.source === 'CATEGORY' ? 'from category' : 'default';
  return (
    <span className="text-slate-500 text-xs italic">
      {fmtNum(def, effective?.value ?? def.default)}{suffix}{' '}
      <span className="text-slate-600">({from})</span>
    </span>
  );
}

function latestUpdate(own) {
  let best = null;
  for (const v of Object.values(own || {})) {
    if (v && (!best || new Date(v.updatedAt) > new Date(best.updatedAt))) best = v;
  }
  return best;
}

// One row: a category (parent) or a brand (child).
function VarRow({
  node, defs, isBrand, categoryName, ppRow, ppDefault,
  expanded, onToggle, brandCount, onCategorySaved, onReload, onPPSaved,
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [fields, setFields]   = useState({});
  const [ppField, setPpField] = useState('');
  const [saving, setSaving]   = useState(false);

  const showPP     = !isBrand;
  const ppEditable = !isBrand && node.canEdit && !!ppRow;
  const scopeLabel = isBrand ? `${categoryName} › ${node.brandName}` : categoryName;

  function fail(title, message) {
    showToast({ type: 'error', title, message });
  }

  function handleEdit() {
    const f = {};
    for (const d of defs) f[d.key] = node.own?.[d.key]?.value ?? '';
    setFields(f);
    setPpField(ppRow?.PPLookbackDays ?? '');
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
  }

  async function handleSave() {
    const changes = [];
    const summary = [];
    for (const d of defs) {
      const raw = fields[d.key];
      const own = node.own?.[d.key] || null;
      if (raw === '' || raw == null) {
        if (own) {
          changes.push({ varKey: d.key, value: null, version: own.version });
          summary.push(`${d.label} now follows the ${isBrand ? 'category' : 'default'}`);
        }
        continue;
      }
      const n = parseFloat(raw);
      if (Number.isNaN(n) || n < d.min || n > d.max) {
        fail('Invalid value', `${d.label} must be between ${d.min} and ${d.max}.`);
        return;
      }
      if (!own || Number(own.value) !== n) {
        changes.push({ varKey: d.key, value: n, version: own ? own.version : null });
        summary.push(`${d.label} → ${fmtNum(d, n)}${unitSuffix(d) === '%' ? '%' : ' ' + unitSuffix(d)}`);
      }
    }

    let ppChanged = false;
    let ppValue = null;
    if (ppEditable) {
      if (ppField !== '' && ppField != null) {
        ppValue = parseInt(ppField, 10);
        if (Number.isNaN(ppValue) || ppValue < 1 || ppValue > 365) {
          fail('Invalid value', 'PP Lookback must be between 1 and 365 days.');
          return;
        }
      }
      ppChanged = (ppRow.PPLookbackDays ?? null) !== ppValue;
      if (ppChanged) summary.push(ppValue == null ? 'PP Lookback now follows the default' : `PP Lookback → ${ppValue} days`);
    }

    if (changes.length === 0 && !ppChanged) { setEditing(false); return; }

    setSaving(true);
    try {
      if (changes.length > 0) {
        const updatedCategory = await saveBusinessVariables({
          categoryName,
          brandName: isBrand ? node.brandName : '',
          changes,
        });
        if (updatedCategory) onCategorySaved(updatedCategory); else onReload();
      }

      if (ppChanged) {
        // PP lookback still lives in CategorySettings. The old GST / cost / margin
        // columns are sent back unchanged so this call does not touch them.
        const updatedPP = await updateCategorySettings(categoryName, {
          GST           : ppRow.GST ?? null,
          CostOfBusiness: ppRow.CostOfBusiness ?? null,
          ProfitMargin  : ppRow.ProfitMargin ?? null,
          PPLookbackDays: ppValue,
          ScrapFreqDays : ppRow.ScrapFreqDays,
          IsScrapEnabled: ppRow.IsScrapEnabled,
        });
        onPPSaved(updatedPP);
      }

      setEditing(false);
      showToast({ type: 'success', title: 'Saved successfully', message: `${scopeLabel}: ${summary.join(', ')}.` });
    } catch (err) {
      if (err?.response?.status === 409) {
        // Someone else saved this row first: tell the user who/what, refresh, leave edit mode.
        showToast({
          type: 'warning',
          title: 'Changed by someone else',
          message: err.response.data?.error || 'This row was changed by someone else. Reload and try again.',
          duration: 9000,
        });
        setEditing(false);
        onReload();
      } else {
        fail('Could not save changes', err?.response?.data?.error || err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  // Multiplier tooltip (same idea as before), from the effective values.
  const eff = (k) => node.effective?.[k]?.value;
  const mult = (eff('GST') != null && eff('COST_OF_BUSINESS') != null && eff('PROFIT_MARGIN') != null)
    ? (1 + eff('GST') / 100 + eff('COST_OF_BUSINESS') / 100 + eff('PROFIT_MARGIN') / 100).toFixed(4)
    : null;

  const last = latestUpdate(node.own);

  return (
    <tr className={`border-b border-slate-800 transition-colors
      ${isBrand ? 'bg-slate-900/40 hover:bg-slate-800/30' : 'hover:bg-slate-800/30'}`}>
      <td className="px-4 py-3 text-left">
        {isBrand ? (
          <div className="pl-9 flex items-center gap-2" title={mult ? `Multiplier: ×${mult}` : undefined}>
            <span className="text-slate-300 text-sm">{node.brandName}</span>
            <span className="text-slate-600 text-[10px]">{node.productCount} products</span>
          </div>
        ) : (
          <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left"
            aria-expanded={expanded} title={mult ? `Multiplier: ×${mult}` : undefined}>
            <svg className={`w-3 h-3 text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium text-slate-200 text-sm">{node.categoryName}</span>
            <span className="text-slate-500 text-[10px]">
              {brandCount} {brandCount === 1 ? 'brand' : 'brands'}
            </span>
          </button>
        )}
      </td>

      {defs.map(d => (
        <td key={d.key} className="px-4 py-3 text-center">
          {editing ? (
            <NumberInput
              label={`${d.label} for ${scopeLabel}`}
              value={fields[d.key] ?? ''}
              onChange={v => setFields(f => ({ ...f, [d.key]: v }))}
              placeholder={`${fmtNum(d, node.effective?.[d.key]?.value ?? d.default)} (${node.effective?.[d.key]?.source === 'CATEGORY' ? 'category' : 'default'})`}
              min={d.min} max={d.max} step={isDays(d) ? '1' : '0.1'} suffix={unitSuffix(d)} />
          ) : (
            <CellValue def={d} own={node.own?.[d.key]} effective={node.effective?.[d.key]} isBrand={isBrand} />
          )}
        </td>
      ))}

      <td className="px-4 py-3 text-center">
        {!showPP ? (
          <span className="text-slate-700 text-xs" title="PP lookback is set per category">—</span>
        ) : editing && ppEditable ? (
          <NumberInput label={`PP lookback for ${scopeLabel}`} value={ppField} onChange={setPpField}
            placeholder={`${ppDefault} (default)`} min="1" max="365" step="1" suffix="days" />
        ) : ppRow?.PPLookbackDays != null ? (
          <span className="text-slate-200 text-sm font-medium">
            {ppRow.PPLookbackDays}<span className="text-slate-500 text-xs ml-0.5">days</span>
          </span>
        ) : (
          <span className="text-slate-500 text-xs italic">{ppDefault} days <span className="text-slate-600">(default)</span></span>
        )}
      </td>

      <td className="px-4 py-3 text-center">
        {last?.updatedBy ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-slate-300 text-[11px]">{last.updatedBy}</span>
            <span className="text-slate-600 text-[10px]">{fmtDate(last.updatedAt)}</span>
          </div>
        ) : (
          <span className="text-slate-600 text-xs">—</span>
        )}
      </td>

      <td className="px-4 py-3 text-center">
        {editing ? (
          <div className="flex items-center justify-center gap-1.5">
            <button onClick={handleSave} disabled={saving}
              className="px-2.5 py-1 text-[10px] font-medium rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={handleCancel} disabled={saving}
              className="px-2.5 py-1 text-[10px] font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
              Cancel
            </button>
          </div>
        ) : node.canEdit ? (
          <button onClick={handleEdit}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        ) : (
          <span className="text-slate-600 text-[10px]">View only</span>
        )}
      </td>
    </tr>
  );
}

// "How it works" hover/focus popover: system defaults + a short explanation.
function InfoPopover({ defs, multiplier, ppDefault, restricted }) {
  return (
    <div className="relative group">
      <button type="button" aria-describedby="bv-info-popover"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-slate-700
          bg-slate-800/60 text-slate-300 hover:text-white hover:border-slate-600 transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60">
        <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        How it works
      </button>

      <div id="bv-info-popover" role="tooltip"
        className="invisible opacity-0 group-hover:visible group-hover:opacity-100
          group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-150
          absolute right-0 top-full z-30 pt-2 w-[22rem] max-w-[calc(100vw-2rem)]">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl shadow-black/50 text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">System defaults</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
            {defs.map(d => (
              <div key={d.key} className="flex items-center justify-between">
                <span className="text-slate-400">{d.label}</span>
                <span className="text-violet-300 font-medium">{fmtNum(d, d.default)}{isDays(d) ? ' days' : unitSuffix(d)}</span>
              </div>
            ))}
            {multiplier && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Multiplier</span>
                <span className="text-violet-300 font-medium">×{multiplier}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">PP Lookback</span>
              <span className="text-violet-300 font-medium">{ppDefault} days</span>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">How it works</p>
            <ul className="space-y-1.5 text-slate-400 leading-relaxed">
              <li>Expand a category to see its brands.</li>
              <li>A brand uses its category&apos;s value until you give it its own (bold, with a <span className="text-violet-400">●</span>).</li>
              <li>Editing a brand changes only that brand.</li>
              <li>To go back to the category value, clear the field and save.</li>
            </ul>
            {restricted && (
              <p className="mt-3 text-slate-300 font-medium">You can edit only the brands assigned to you.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BusinessVariablesTab({
  categorySettings = [],        // rows from /api/category-settings (used for PP lookback)
  onCategorySettingsSaved,      // keeps SettingsView's copy of those rows in sync
  ppLookbackDefault = 15,
}) {
  const { showToast } = useToast();
  const [tree, setTree]       = useState({ defs: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [open, setOpen]       = useState(() => new Set());
  const [search, setSearch]   = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setTree(await fetchBusinessVariables());
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load business variables. Check the API server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // One-time info toast the first time this tab is shown after signing in.
  useEffect(() => {
    if (loading || error) return;
    try {
      if (sessionStorage.getItem(BV_INFO_TOAST_KEY)) return;
      sessionStorage.setItem(BV_INFO_TOAST_KEY, '1');
    } catch {
      return; // storage unavailable: skip the one-time toast
    }
    showToast({
      type: 'info',
      title: 'Brand-wise business variables',
      message: 'Brands use their category\u2019s values until you set their own. Hover \u201CHow it works\u201D for the defaults and details.',
      duration: 9000,
    });
  }, [loading, error, showToast]);

  const ppByCategory = useMemo(() => {
    const m = new Map();
    for (const r of categorySettings) m.set(String(r.CategoryName).trim().toLowerCase(), r);
    return m;
  }, [categorySettings]);

  function handleCategorySaved(updated) {
    setTree(prev => ({
      ...prev,
      categories: prev.categories.map(c =>
        c.categoryName.trim().toLowerCase() === updated.categoryName.trim().toLowerCase() ? updated : c),
    }));
  }

  function toggle(name) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    return tree.categories
      .map(c => {
        const catMatch = !q || c.categoryName.toLowerCase().includes(q);
        const brands = catMatch ? c.brands : c.brands.filter(b => b.brandName.toLowerCase().includes(q));
        return { cat: c, brands, catMatch };
      })
      .filter(x => x.catMatch || x.brands.length > 0);
  }, [tree.categories, q]);

  const defs = tree.defs;
  const anyOpen = open.size > 0;
  const isRestricted = tree.categories.some(c => !c.canEdit && c.brands.some(b => b.canEdit));
  const multiplier = (() => {
    const g = defs.find(d => d.key === 'GST'), c = defs.find(d => d.key === 'COST_OF_BUSINESS'), m = defs.find(d => d.key === 'PROFIT_MARGIN');
    return g && c && m ? (1 + g.default / 100 + c.default / 100 + m.default / 100).toFixed(4) : null;
  })();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading business variables...</p>
      </div>
    );
  }

  if (error) {
    return <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400 text-sm">{error}</div>;
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search category or brand…" aria-label="Search category or brand"
            className="w-72 pl-8 pr-3 py-1.5 text-xs text-slate-100 bg-slate-800 border border-slate-700 rounded-lg outline-none
              focus:border-violet-500 placeholder:text-slate-500" />
        </div>

        <button type="button"
          onClick={() => setOpen(anyOpen ? new Set() : new Set(tree.categories.map(c => c.categoryName)))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-slate-700
            bg-slate-800/60 text-slate-300 hover:text-white hover:border-slate-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d={anyOpen ? 'M8 5l4 4 4-4m0 14l-4-4-4 4' : 'M8 9l4-4 4 4m0 6l-4 4-4-4'} />
          </svg>
          {anyOpen ? 'Collapse all' : 'Expand all'}
        </button>

        {isRestricted && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/20">
            Editing limited to your assigned brands
          </span>
        )}

        <div className="ml-auto">
          <InfoPopover defs={defs} multiplier={multiplier} ppDefault={ppLookbackDefault} restricted={isRestricted} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800/80 border-b border-slate-700">
              {['Category / Brand', ...defs.map(d => `${d.label} (${unitSuffix(d)})`), 'PP Lookback (days)', 'Last Updated By', 'Action'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider first:text-left text-center">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={defs.length + 4} className="px-4 py-10 text-center text-slate-500 text-xs">
                {q ? 'No category or brand matches your search.' : 'No categories available for your account.'}
              </td></tr>
            )}
            {rows.map(({ cat, brands, catMatch }) => {
              const expanded = open.has(cat.categoryName) || (!!q && !catMatch);
              return (
                <Fragment key={cat.categoryName}>
                  <VarRow
                    node={cat} defs={defs} isBrand={false} categoryName={cat.categoryName}
                    ppRow={ppByCategory.get(cat.categoryName.trim().toLowerCase())} ppDefault={ppLookbackDefault}
                    expanded={expanded} onToggle={() => toggle(cat.categoryName)} brandCount={cat.brands.length}
                    onCategorySaved={handleCategorySaved} onReload={() => load(true)}
                    onPPSaved={onCategorySettingsSaved} />
                  {expanded && brands.map(b => (
                    <VarRow key={`${cat.categoryName}::${b.brandName}`}
                      node={b} defs={defs} isBrand categoryName={cat.categoryName}
                      onCategorySaved={handleCategorySaved} onReload={() => load(true)} />
                  ))}
                  {expanded && brands.length === 0 && (
                    <tr className="border-b border-slate-800 bg-slate-900/40">
                      <td colSpan={defs.length + 4} className="px-4 py-2 pl-14 text-slate-600 text-[11px]">No brands found for this category.</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}