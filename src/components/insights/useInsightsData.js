// src/components/insights/useInsightsData.js
// All state + data-fetching for the Insights dashboard lives here, so
// InsightsView itself stays a thin layout component.
//
// Fetching rules
//  • The SERVER decides when alerts are recomputed from the latest scrape (it
//    reuses a recompute younger than ~2 min, and recomputes right after every
//    scrape run). The page just asks; "Refresh" forces one.
//  • Every tab / filter / time-range / page combination is cached in memory for
//    CACHE_TTL_MS, so hopping between tabs is instant but never shows data that
//    is minutes old after a scrape.
//  • The cache lives in plain module memory: nothing is written to
//    localStorage / sessionStorage, so a browser refresh always starts fresh.
//  • It is wiped whenever data changes through this screen (dismiss, push, refresh).
//  • Typing in the search box is debounced.
//  • The time range is applied on the SERVER, so a short range means fewer rows
//    read from SQL and fewer pages — not just hidden rows.
//  • Summary-card counts come from ONE small request (/insights/counts), cached
//    per time range.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchInsights,
  fetchInsightCounts,
  dismissInsight,
  bulkDismissInsights,
} from "../../services/api";

const PAGE_SIZE = 25;
const MAX_CACHED_PAGES = 100; // safety cap — each entry is only ~25 rows
const CACHE_TTL_MS = 60_000;  // a cached page older than this is refetched
const SEARCH_DEBOUNCE_MS = 300;

// 0 = all time. Flip this to 7 / 30 if you'd rather open on a shorter window.
// (the time filter is about WHEN THE COMPETITOR DATA WAS SCRAPED)
export const DEFAULT_DAYS = 0;

export const TIME_RANGES = [
  { value: 0, label: "All time" },
  { value: 1, label: "Last 1 day" },
  { value: 2, label: "Last 2 days" },
  { value: 3, label: "Last 3 days" },
  { value: 4, label: "Last 4 days" },
  { value: 5, label: "Last 5 days" },
  { value: 6, label: "Last 6 days" },
  { value: 7, label: "Last 1 week" },
  { value: 14, label: "Last 2 weeks" },
  { value: 21, label: "Last 3 weeks" },
  { value: 30, label: "Last 1 month" },
];

const EMPTY_COUNTS = { all: 0, price: 0, oos: 0, listing: 0, defaultThreshold: null };

export function tabToAlertType(tab) {
  if (tab === "price") return "PRICE";
  if (tab === "oos") return "OOS";
  if (tab === "listing") return "NO_LISTING";
  return null; // 'all'
}

// ── Session store (module-level → survives tab hops and leaving/returning to
//    the page, dies on refresh / tab close) ─────────────────────────────────
const session = {
  pages: new Map(),        // key → { at, res } for that tab/filter/page
  counts: new Map(),       // days → { all, price, oos, listing, defaultThreshold }
};
const inflight = new Map(); // key → Promise, so duplicate identical calls share one request

function pageKey(p) {
  return JSON.stringify([p.alertType, p.category, p.brand, p.search, p.days, p.sortBy, p.page]);
}

function rememberPage(key, res) {
  session.pages.set(key, { at: Date.now(), res });
  if (session.pages.size > MAX_CACHED_PAGES) {
    session.pages.delete(session.pages.keys().next().value); // drop the oldest
  }
}

function clearSession() {
  session.pages.clear();
  session.counts.clear();
}

function shared(key, run) {
  if (inflight.has(key)) return inflight.get(key);
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export default function useInsightsData() {
  const [tab, setTabState] = useState("price");
  const [search, setSearchState] = useState("");               // what the input shows (instant)
  const [debouncedSearch, setDebouncedSearch] = useState("");  // what the API is called with
  const [category, setCategoryState] = useState("");
  const [brand, setBrandState] = useState("");
  const [days, setDaysState] = useState(DEFAULT_DAYS);
  const [sortBy, setSortByState] = useState("scraped_desc");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState(session.counts.get(DEFAULT_DAYS) ?? EMPTY_COUNTS);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const latestRequest = useRef(0); // ignore responses from requests that were superseded

  // Changing a filter/sort/tab always goes back to page 1 — in the SAME state
  // update, so it costs one fetch, not one for the old page + one for page 1.
  // "Difference" sorts exist only on the price tab — fall back elsewhere.
  const setTab = (v) => {
    setTabState(v);
    setPage(1);
    if (v !== "price") setSortByState((cur) => (cur.startsWith("diff") ? "scraped_desc" : cur));
  };
  const setSearch = (v) => setSearchState(v); // page 1 is applied when the debounced value lands
  const setCategory = (v) => { setCategoryState(v); setPage(1); };
  const setBrand = (v) => { setBrandState(v); setPage(1); };
  const setDays = (v) => { setDaysState(Number(v) || 0); setPage(1); };
  const setSortBy = (v) => { setSortByState(v); setPage(1); };

  const appliedSearch = useRef("");
  useEffect(() => {
    if (search === appliedSearch.current) return;
    const t = setTimeout(() => {
      appliedSearch.current = search;
      setPage(1);
      setDebouncedSearch(search);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  function applyResult(res) {
    setRows(res.data || []);
    setTotal(res.total || 0);
    setTotalPages(res.totalPages || 1);
    setCategories(res.categories || []);
    setBrands(res.brands || []);
  }

  // force: skip the session store and read from the server
  // silent: don't flip the table into its "Loading…" state
  const load = useCallback(async ({ force = false, silent = false, forceRecompute = false } = {}) => {
    const params = {
      alertType: tabToAlertType(tab),
      category: category || null,
      brand: brand || null,
      search: debouncedSearch || null,
      days: days || null,
      sortBy,
      page,
    };
    const key = pageKey(params);

    if (!force) {
      const entry = session.pages.get(key);
      if (entry && Date.now() - entry.at < CACHE_TTL_MS) {
        latestRequest.current += 1; // invalidate anything still in flight
        applyResult(entry.res);
        setError(null);
        setLoading(false);
        return;
      }
    }

    const myId = ++latestRequest.current;
    if (!silent) setLoading(true);
    setError(null);

    let handedOff = false;

    try {
      const res = await shared(key, () =>
        fetchInsights({ ...params, pageSize: PAGE_SIZE, skipRecompute: false, refresh: force && forceRecompute })
      );
      if (myId !== latestRequest.current) return; // a newer request owns the screen now

      // Asked for a page that no longer exists (e.g. the whole last page was just
      // dismissed) → step back to the new last page instead of showing "empty".
      if ((res.data || []).length === 0 && page > 1 && (res.totalPages || 1) < page) {
        handedOff = true;
        setPage(Math.max(1, res.totalPages || 1));
        return;
      }

      rememberPage(key, res);
      applyResult(res);
    } catch (err) {
      if (myId === latestRequest.current) setError("Failed to load alerts.");
    } finally {
      if (myId === latestRequest.current && !handedOff) setLoading(false);
    }
  }, [tab, category, brand, debouncedSearch, days, sortBy, page]);

  const refreshCounts = useCallback(async ({ force = false } = {}) => {
    const cached = session.counts.get(days);
    if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setCounts(cached.value);
      return;
    }
    try {
      const fresh = await shared(`counts:${days}`, async () => {
        const res = await fetchInsightCounts({ days: days || null });
        return {
          all: res.all, price: res.price, oos: res.oos, listing: res.listing,
          defaultThreshold: res.defaultThreshold ?? null,
        };
      });
      session.counts.set(days, { at: Date.now(), value: fresh });
      setCounts(fresh);
    } catch {
      // counts are supplementary — a failure here shouldn't block the table
    }
  }, [days]);

  // Counts: one small request per time range per session.
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // Any tab / filter / sort / page change: served from the session store when
  // loaded before, otherwise one request.
  useEffect(() => {
    load();
  }, [load]);

  // A selection only makes sense for the rows on screen.
  useEffect(() => {
    setSelectedIds([]);
  }, [tab, category, brand, debouncedSearch, days, sortBy, page]);

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === rows.length ? [] : rows.map((r) => r.Id)));
  }

  async function dismiss(id) {
    await dismissInsight(id);
    setRows((prev) => prev.filter((r) => r.Id !== id)); // instant feedback
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    clearSession();                                     // totals / page contents just changed
    load({ force: true, silent: true });                // backfill the page from the server
    refreshCounts({ force: true });
  }

  async function dismissSelected() {
    if (selectedIds.length === 0) return;
    await bulkDismissInsights(selectedIds);
    setSelectedIds([]);
    clearSession();
    await load({ force: true });                        // pulls the NEXT rows into this page
    refreshCounts({ force: true });
  }

  // Forces a recompute from the latest scrape, then reloads this view. Used by
  // the Refresh button and after a push (so a resolved alert disappears).
  async function reload() {
    clearSession();
    await load({ force: true, forceRecompute: true });
    refreshCounts({ force: true });
  }

  // What the CSV export needs: the same filters the table is showing right now.
  const exportParams = {
    alertType: tabToAlertType(tab),
    category: category || null,
    brand: brand || null,
    search: debouncedSearch || null,
    days: days || null,
  };

  return {
    tab, setTab,
    search, setSearch,
    category, setCategory,
    brand, setBrand,
    days, setDays,
    sortBy, setSortBy,
    page, setPage,
    rows, counts, categories, brands, total, totalPages, loading, error,
    selectedIds, toggleSelect, toggleSelectAll, dismiss, dismissSelected,
    reload,
    exportParams,
  };
}