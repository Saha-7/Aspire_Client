// src/components/audit/AuditView.jsx
// ─────────────────────────────────────────────────────────────
// Admin-only Audit & Activity page.
//   Tab 1 "Audit Log"       – filterable table (module, time window, user, SKU, ...)
//   Tab 2 "Recent Activity" – Azure-style live feed (auto-refreshes)
// Talks to  GET /api/audit/events | /recent | /filters
// New modules appear in the filters automatically (they come from the DB).
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

const API = `${import.meta.env.VITE_API_BASE_URL}/api/audit`;
const http = axios.create({ withCredentials: true });

// ── Look & feel per module (unknown/new modules fall back to slate) ──────────
const MODULE_META = {
  SELLING_PRICE:  { label: 'Selling Price',  cls: 'bg-fuchsia-900/40 text-fuchsia-300 border-fuchsia-700/50', dot: 'bg-fuchsia-500' },
  PURCHASE_PRICE: { label: 'Purchase Price', cls: 'bg-violet-900/40 text-violet-300 border-violet-700/50',   dot: 'bg-violet-500' },
  STOCK:          { label: 'Stock',          cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50', dot: 'bg-emerald-500' },
  INSIGHTS:       { label: 'Insights',       cls: 'bg-red-900/40 text-red-300 border-red-700/50',             dot: 'bg-red-500' },
  BUSINESS_VARS:  { label: 'Business Vars',  cls: 'bg-amber-900/40 text-amber-300 border-amber-700/50',       dot: 'bg-amber-500' },
  CATEGORY_MAP:   { label: 'Category Map',   cls: 'bg-teal-900/40 text-teal-300 border-teal-700/50',          dot: 'bg-teal-500' },
  USERS:          { label: 'Users',          cls: 'bg-sky-900/40 text-sky-300 border-sky-700/50',             dot: 'bg-sky-500' },
  SCRAPER:        { label: 'Scraper',        cls: 'bg-orange-900/40 text-orange-300 border-orange-700/50',    dot: 'bg-orange-500' },
  AUTH:           { label: 'Login / Logout', cls: 'bg-blue-900/40 text-blue-300 border-blue-700/50',          dot: 'bg-blue-500' },
};
const FALLBACK_META = { cls: 'bg-slate-800 text-slate-300 border-slate-600', dot: 'bg-slate-500' };
const prettify = (s = '') => s.replace(/_/g, ' ').toLowerCase().replace(/^\w|\s\w/g, (m) => m.toUpperCase());
const moduleMeta = (m) => ({ ...FALLBACK_META, label: prettify(m), ...(MODULE_META[m] || {}) });

const STATUS_CLS = {
  SUCCESS: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/50',
  FAILED:  'bg-red-900/40 text-red-400 border-red-700/50',
  DENIED:  'bg-amber-900/40 text-amber-400 border-amber-700/50',
  PARTIAL: 'bg-orange-900/40 text-orange-400 border-orange-700/50',
};

const WINDOWS = [
  ['6h', 'Last 6 hours'], ['1d', 'Last 1 day'], ['7d', 'Last 7 days'], ['15d', 'Last 15 days'],
  ['30d', 'Last 30 days'], ['45d', 'Last 45 days'], ['', 'All time'],
];

const EMPTY_FILTERS = {
  last: '1d', module: '', action: '', status: '', actor: '',
  category: '', brand: '', entityId: '', batchId: '', from: '', to: '',
};

// ── Formatting helpers (everything displayed in IST) ─────────────────────────
const IST = 'Asia/Kolkata';
const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { timeZone: IST, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '—';
const fmtFull = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { timeZone: IST, dateStyle: 'medium', timeStyle: 'medium' }) + ' IST' : '—';
const dayKey = (v) => new Date(v).toLocaleDateString('en-CA', { timeZone: IST }); // YYYY-MM-DD in IST
function dayLabel(v) {
  const k = dayKey(v);
  if (k === dayKey(Date.now())) return 'Today';
  if (k === dayKey(Date.now() - 86400000)) return 'Yesterday';
  return new Date(v).toLocaleDateString('en-IN', { timeZone: IST, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
function ago(v) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)} d ago`;
}
const isNum = (x) => x !== null && x !== undefined && x !== '' && !isNaN(Number(x));
const MONEY_FIELDS = new Set(['PP', 'SP']);
function fmtVal(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (isNum(v)) {
    const n = Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return MONEY_FIELDS.has(field) ? `₹${n}` : n;
  }
  return String(v);
}

function Badge({ cls, children }) {
  return <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}

function ChangeCell({ row }) {
  const { FieldName: f, OldValue: o, NewValue: n } = row;
  // Multi-field edits (e.g. category settings) keep their before/after list in Details.changes
  if (f == null && o == null && n == null && row.Details) {
    let changes = null;
    try { const d = JSON.parse(row.Details); changes = Array.isArray(d.changes) ? d.changes : null; } catch { /* not JSON */ }
    if (changes && changes.length) {
      return (
        <div className="min-w-[150px] space-y-0.5">
          {changes.slice(0, 3).map((c) => (
            <div key={c.field} className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500">{c.field}</span>
              <span className="text-slate-400 line-through decoration-slate-600">{fmtVal(c.field, c.old)}</span>
              <span className="text-slate-600">→</span>
              <span className="text-white font-semibold">{fmtVal(c.field, c.new)}</span>
            </div>
          ))}
          {changes.length > 3 && <div className="text-[11px] text-slate-500">+{changes.length - 3} more · click row</div>}
        </div>
      );
    }
  }
  if (f == null && o == null && n == null) return <span className="text-slate-600">—</span>;
  const delta = isNum(o) && isNum(n) ? Number(n) - Number(o) : null;
  return (
    <div className="min-w-[150px]">
      {f && <div className="text-[11px] text-slate-500 mb-0.5">{f}</div>}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-slate-400 line-through decoration-slate-600">{fmtVal(f, o)}</span>
        <span className="text-slate-600">→</span>
        <span className="text-white font-semibold">{fmtVal(f, n)}</span>
        {delta !== null && delta !== 0 && (
          <span className={`text-[11px] font-medium ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ({delta > 0 ? '+' : '−'}{Math.abs(delta).toLocaleString('en-IN', { maximumFractionDigits: 2 })})
          </span>
        )}
      </div>
    </div>
  );
}

function DetailsPanel({ row, onOpenBatch }) {
  let details = null;
  if (row.Details) { try { details = JSON.parse(row.Details); } catch { details = row.Details; } }
  const changes = details && Array.isArray(details.changes) ? details.changes : null;
  const rest = details && typeof details === 'object' && !Array.isArray(details)
    ? Object.fromEntries(Object.entries(details).filter(([k]) => k !== 'changes')) : details;
  const meta = [
    ['Event ID', row.EventId], ['When', fmtFull(row.OccurredAt)], ['Source', prettify(row.Source)],
    ['Entity', row.EntityType ? `${row.EntityType}: ${row.EntityId ?? '—'}` : '—'],
    ['Category / Brand', [row.Category, row.Brand].filter(Boolean).join(' / ') || '—'],
    ['IP address', row.IpAddress || '—'], ['Role', row.ActorRole || '—'],
  ];
  return (
    <div className="px-4 py-4 bg-slate-950/60 border-t border-slate-800 space-y-3">
      <p className="text-sm text-slate-200">{row.Summary}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
        {meta.map(([k, v]) => (
          <div key={k}><div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
            <div className="text-xs text-slate-300 break-all">{String(v)}</div></div>
        ))}
      </div>
      {changes && (
        <table className="text-xs border border-slate-800 rounded-lg overflow-hidden">
          <thead className="bg-slate-800/70 text-slate-400"><tr>
            <th className="text-left px-3 py-1.5">Field</th><th className="text-left px-3 py-1.5">Before</th><th className="text-left px-3 py-1.5">After</th></tr></thead>
          <tbody>{changes.map((c, i) => (
            <tr key={i} className="border-t border-slate-800">
              <td className="px-3 py-1.5 text-slate-300">{c.field}</td>
              <td className="px-3 py-1.5 text-slate-400">{fmtVal(c.field, c.old)}</td>
              <td className="px-3 py-1.5 text-white font-medium">{fmtVal(c.field, c.new)}</td></tr>))}
          </tbody>
        </table>
      )}
      {rest && (typeof rest !== 'object' || Object.keys(rest).length > 0) && (
        <pre className="text-[11px] text-slate-400 bg-slate-900 border border-slate-800 rounded-lg p-3 overflow-x-auto">
          {typeof rest === 'string' ? rest : JSON.stringify(rest, null, 2)}
        </pre>
      )}
      {row.BatchId && (
        <button onClick={() => onOpenBatch(row.BatchId)}
          className="text-xs px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white transition-colors">
          Show every row of this upload
        </button>
      )}
    </div>
  );
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCsv(rows) {
  const head = ['Time (IST)', 'Actor', 'Email', 'Role', 'Module', 'Action', 'Source', 'Status', 'Entity', 'Category', 'Brand', 'Field', 'Old', 'New', 'Summary', 'BatchId', 'IP'];
  const lines = rows.map((r) => [fmtFull(r.OccurredAt), r.ActorName, r.ActorEmail, r.ActorRole, r.Module, r.Action, r.Source, r.Status,
    r.EntityId, r.Category, r.Brand, r.FieldName, r.OldValue, r.NewValue, r.Summary, r.BatchId, r.IpAddress].map(csvEscape).join(','));
  const blob = new Blob(['\uFEFF' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `audit-log-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const selectCls = 'px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-600 rounded-lg outline-none focus:border-violet-500 cursor-pointer';
const inputCls = 'px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-600 rounded-lg outline-none focus:border-violet-500 placeholder:text-slate-500';

// ═════════════════════════════════════════════════════════════
export default function AuditView({ onClose, user }) {
  const [tab, setTab] = useState('log'); // 'log' | 'feed'
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [skuInput, setSkuInput] = useState('');
  const [customRange, setCustomRange] = useState(false);
  const [opts, setOpts] = useState({ modules: [], actions: [], actors: [], categories: [], brands: [], statuses: [] });

  const [rows, setRows] = useState([]);
  const [nextBeforeId, setNextBeforeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(null);
  const [, setTick] = useState(0);
  const reqId = useRef(0);

  const isAdmin = user?.role === 'admin';
  const setF = (patch) => setFilters((f) => ({ ...f, ...patch }));

  // dropdown values
  useEffect(() => {
    if (!isAdmin) return;
    http.get(`${API}/filters`).then((r) => setOpts(r.data.data)).catch(() => {});
  }, [isAdmin]);

  // SKU search box → filter (debounced)
  useEffect(() => {
    const t = setTimeout(() => setF({ entityId: skuInput.trim() }), 400);
    return () => clearTimeout(t);
  }, [skuInput]);

  const buildParams = useCallback((beforeId) => {
    const p = { limit: 50 };
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    if (beforeId) p.beforeId = beforeId;
    return p;
  }, [filters]);

  const loadLog = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true); setError(null); setExpanded(null);
    try {
      const res = await http.get(`${API}/events`, { params: buildParams() });
      if (id !== reqId.current) return;
      setRows(res.data.data.rows); setNextBeforeId(res.data.data.nextBeforeId);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e?.response?.status === 403 ? 'Only admins can view the audit log.' : (e?.response?.data?.error || 'Failed to load audit events.'));
    } finally { if (id === reqId.current) setLoading(false); }
  }, [buildParams]);

  async function loadMore() {
    if (!nextBeforeId) return;
    setLoadingMore(true);
    try {
      const res = await http.get(`${API}/events`, { params: buildParams(nextBeforeId) });
      setRows((r) => [...r, ...res.data.data.rows]); setNextBeforeId(res.data.data.nextBeforeId);
    } catch (e) { setError(e?.response?.data?.error || 'Failed to load more.'); }
    finally { setLoadingMore(false); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on filter change
  useEffect(() => { if (isAdmin && tab === 'log') loadLog(); }, [isAdmin, tab, loadLog]);

  // Recent-activity feed: loads on open, then every 30 s while that tab is visible
  const loadFeed = useCallback(async (silent) => {
    if (!silent) setFeedLoading(true);
    try {
      const res = await http.get(`${API}/recent`, { params: { limit: 60 } });
      setFeed(res.data.data); setFeedError(null);
    } catch (e) { setFeedError(e?.response?.data?.error || 'Failed to load activity.'); }
    finally { setFeedLoading(false); setTick((t) => t + 1); }
  }, []);
  useEffect(() => {
    if (!isAdmin || tab !== 'feed') return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on tab open
    loadFeed(false);
    const t = setInterval(() => loadFeed(true), 30000);
    return () => clearInterval(t);
  }, [isAdmin, tab, loadFeed]);

  function openBatch(batchId) {
    setSkuInput('');
    setCustomRange(false);
    setFilters({ ...EMPTY_FILTERS, last: '', batchId });
    setTab('log');
  }
  function resetFilters() { setSkuInput(''); setCustomRange(false); setFilters(EMPTY_FILTERS); }

  const activeCount = useMemo(
    () => ['module', 'action', 'status', 'actor', 'category', 'brand', 'entityId', 'batchId'].filter((k) => filters[k]).length,
    [filters],
  );

  const feedGroups = useMemo(() => {
    const groups = [];
    feed.forEach((ev) => {
      const k = dayKey(ev.OccurredAt);
      const g = groups[groups.length - 1];
      if (g && g.key === k) g.items.push(ev); else groups.push({ key: k, label: dayLabel(ev.OccurredAt), items: [ev] });
    });
    return groups;
  }, [feed]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-slate-400 text-sm">
        The audit log is available to admins only.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1500px] mx-auto pl-6 pr-16 py-4 flex items-center gap-3">
          <button onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div className="w-px h-5 bg-slate-700" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-600/80 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Audit & Activity</h1>
              <p className="text-xs text-slate-500">Who changed what, from what to what, and when · times shown in IST</p>
            </div>
          </div>
        </div>
        <div className="max-w-[1500px] mx-auto px-6 flex gap-1">
          {[['log', 'Audit Log'], ['feed', 'Recent Activity']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === k ? 'border-violet-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 py-6 space-y-4">
        {tab === 'log' && (
          <>
            {/* ── Module chips ── */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setF({ module: '' })}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${!filters.module ? 'bg-violet-600 border-violet-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                All modules
              </button>
              {[...new Set([...Object.keys(MODULE_META), ...opts.modules])].map((m) => {
                const meta = moduleMeta(m);
                const on = filters.module === m;
                return (
                  <button key={m} onClick={() => setF({ module: on ? '' : m })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${on ? 'bg-violet-600 border-violet-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} />{meta.label}
                  </button>
                );
              })}
            </div>

            {/* ── Detail filters ── */}
            <div className="flex flex-wrap items-center gap-2">
              <input value={skuInput} onChange={(e) => setSkuInput(e.target.value)} placeholder="Search SKU / file name…" className={`${inputCls} w-56`} />
              <select value={filters.actor} onChange={(e) => setF({ actor: e.target.value })} className={selectCls}>
                <option value="">All users</option>{opts.actors.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filters.action} onChange={(e) => setF({ action: e.target.value })} className={selectCls}>
                <option value="">All actions</option>{opts.actions.map((a) => <option key={a} value={a}>{prettify(a)}</option>)}
              </select>
              <select value={filters.status} onChange={(e) => setF({ status: e.target.value })} className={selectCls}>
                <option value="">All statuses</option>{opts.statuses.map((a) => <option key={a} value={a}>{prettify(a)}</option>)}
              </select>
              <select value={filters.category} onChange={(e) => setF({ category: e.target.value })} className={selectCls}>
                <option value="">All categories</option>{opts.categories.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filters.brand} onChange={(e) => setF({ brand: e.target.value })} className={selectCls}>
                <option value="">All brands</option>{opts.brands.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              {(activeCount > 0 || filters.last !== '1d' || customRange) && (
                <button onClick={resetFilters} className="px-3 py-2 text-xs text-slate-400 hover:text-white underline">Reset filters</button>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {customRange && (
                  <>
                    <input type="datetime-local" className={inputCls} aria-label="From"
                      onChange={(e) => setF({ from: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
                    <span className="text-slate-500 text-xs">to</span>
                    <input type="datetime-local" className={inputCls} aria-label="To"
                      onChange={(e) => setF({ to: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
                  </>
                )}
                <select aria-label="Time window" value={customRange ? 'custom' : filters.last} className={selectCls}
                  onChange={(e) => {
                    if (e.target.value === 'custom') { setCustomRange(true); setF({ last: '', from: '', to: '' }); }
                    else { setCustomRange(false); setF({ last: e.target.value, from: '', to: '' }); }
                  }}>
                  {WINDOWS.map(([k, label]) => <option key={label} value={k}>{label}</option>)}
                  <option value="custom">Custom range…</option>
                </select>
                <button onClick={loadLog} className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors">Refresh</button>
                <button onClick={() => exportCsv(rows)} disabled={!rows.length}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 transition-colors">Export CSV</button>
              </div>
            </div>

            {filters.batchId && (
              <div className="flex items-center gap-2 text-xs text-violet-300 bg-violet-900/20 border border-violet-700/40 rounded-lg px-3 py-2 w-fit">
                Showing one upload batch ({filters.batchId.slice(0, 8)}…)
                <button onClick={() => setF({ batchId: '', last: '1d' })} className="text-violet-200 hover:text-white font-bold">✕</button>
              </div>
            )}

            {/* ── Table ── */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/70 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">When (IST)</th>
                    <th className="text-left px-4 py-3 font-semibold">Who</th>
                    <th className="text-left px-4 py-3 font-semibold">Module / Action</th>
                    <th className="text-left px-4 py-3 font-semibold">What</th>
                    <th className="text-left px-4 py-3 font-semibold">Change</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>}
                  {!loading && error && <tr><td colSpan={6} className="px-4 py-10 text-center text-red-400">{error}</td></tr>}
                  {!loading && !error && rows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No activity matches these filters.</td></tr>
                  )}
                  {!loading && !error && rows.map((r) => {
                    const meta = moduleMeta(r.Module);
                    const open = expanded === r.EventId;
                    return (
                      <FragmentRow key={r.EventId} open={open} onToggle={() => setExpanded(open ? null : r.EventId)}
                        cells={[
                          <td key="t" className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                            {fmtDateTime(r.OccurredAt)}<div className="text-[11px] text-slate-600">{ago(r.OccurredAt)}</div></td>,
                          <td key="w" className="px-4 py-3">
                            <div className="text-slate-200 text-sm">{r.ActorName || r.ActorEmail}</div>
                            <div className="text-[11px] text-slate-500">{r.ActorEmail}{r.ActorRole ? ` · ${r.ActorRole}` : ''}</div></td>,
                          <td key="m" className="px-4 py-3">
                            <Badge cls={meta.cls}>{meta.label}</Badge>
                            <div className="text-[11px] text-slate-400 mt-1">{prettify(r.Action)} · {r.Source === 'CSV_UPLOAD' ? 'CSV' : prettify(r.Source)}</div></td>,
                          <td key="e" className="px-4 py-3 max-w-[300px]">
                            {r.EntityId ? <div className="text-slate-200 text-sm break-all">{r.EntityId}</div> : <span className="text-slate-600">—</span>}
                            {(r.Category || r.Brand) && <div className="text-[11px] text-slate-500">{[r.Category, r.Brand].filter(Boolean).join(' · ')}</div>}</td>,
                          <td key="c" className="px-4 py-3"><ChangeCell row={r} /></td>,
                          <td key="s" className="px-4 py-3"><Badge cls={STATUS_CLS[r.Status] || FALLBACK_META.cls}>{prettify(r.Status)}</Badge></td>,
                        ]}
                        panel={open ? <DetailsPanel row={r} onOpenBatch={openBatch} /> : null}
                      />
                    );
                  })}
                </tbody>
              </table>
              {!loading && nextBeforeId && (
                <div className="p-3 text-center border-t border-slate-800">
                  <button onClick={loadMore} disabled={loadingMore}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 transition-colors">
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
            {!loading && !error && <p className="text-xs text-slate-600">{rows.length} event{rows.length === 1 ? '' : 's'} shown{nextBeforeId ? ' (more available)' : ''}. Click a row for full details.</p>}
          </>
        )}

        {tab === 'feed' && (
          <div className="max-w-[860px] mx-auto">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-slate-500">Latest activity across the app · refreshes every 30 seconds · uploads appear as one line</p>
              <button onClick={() => loadFeed(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors">Refresh</button>
            </div>
            {feedLoading && <p className="text-center text-slate-500 text-sm py-10">Loading…</p>}
            {feedError && <p className="text-center text-red-400 text-sm py-10">{feedError}</p>}
            {!feedLoading && !feedError && feed.length === 0 && <p className="text-center text-slate-500 text-sm py-10">No activity yet.</p>}
            {feedGroups.map((g) => (
              <div key={g.key} className="mb-6">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{g.label}</div>
                <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 divide-y divide-slate-800">
                  {g.items.map((ev) => {
                    const meta = moduleMeta(ev.Module);
                    const bad = ev.Status === 'FAILED' || ev.Status === 'DENIED';
                    const clickable = !!ev.BatchId;
                    return (
                      <div key={ev.EventId} onClick={clickable ? () => openBatch(ev.BatchId) : undefined}
                        className={`flex items-start gap-3 px-4 py-3 ${clickable ? 'cursor-pointer hover:bg-slate-800/50' : ''}`}>
                        <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border ${bad ? 'bg-red-900/40 border-red-700/50 text-red-400' : ev.Status === 'PARTIAL' ? 'bg-orange-900/40 border-orange-700/50 text-orange-400' : 'bg-emerald-900/40 border-emerald-700/50 text-emerald-400'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={bad ? 'M6 18L18 6M6 6l12 12' : 'M5 13l4 4L19 7'} /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-100 break-words">{ev.Summary}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-slate-400">{ev.ActorName || ev.ActorEmail}</span>
                            <Badge cls={meta.cls}>{meta.label}</Badge>
                            {ev.Status !== 'SUCCESS' && <Badge cls={STATUS_CLS[ev.Status] || FALLBACK_META.cls}>{prettify(ev.Status)}</Badge>}
                            {clickable && <span className="text-[11px] text-violet-400">View rows →</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0" title={fmtFull(ev.OccurredAt)}>
                          <div className="text-xs text-slate-400">{ago(ev.OccurredAt)}</div>
                          <div className="text-[11px] text-slate-600">{fmtDateTime(ev.OccurredAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// A table row that expands to show a details panel beneath it
function FragmentRow({ cells, panel, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className={`border-t border-slate-800 cursor-pointer transition-colors ${open ? 'bg-slate-800/50' : 'hover:bg-slate-800/30'}`}>{cells}</tr>
      {panel && <tr><td colSpan={6} className="p-0">{panel}</td></tr>}
    </>
  );
}