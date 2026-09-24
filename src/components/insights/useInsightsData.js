// src/components/insights/useInsightsData.js
// All state + data-fetching for the Insights dashboard lives here, so
// InsightsView itself stays a thin layout component.
//
// Fetching rules
//  • First visit of the browser session → one full recompute (fresh scrape data),
//    exactly like before.
//  • After that, every tab / filter / page combination is fetched at most ONCE per
//    session. Hopping Price alerts → Out of stock → Not in catalog → back re-uses
//    what was already loaded, with no API call.
//  • The session store lives in plain module memory: nothing is written to
//    localStorage / sessionStorage, so closing the browser tab OR refreshing the
//    page always starts completely fresh.
//  • It is wiped whenever data changes through this screen (dismiss, push,
//    reload), and the current page is re-read from the server straight away.
//  • Typing in the search box is debounced (SEARCH_DEBOUNCE_MS): the input updates
//    instantly, but the API is only called once you pause typing.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchInsights, dismissInsight, bulkDismissInsights } from "../../services/api";

const PAGE_SIZE = 25;
const MAX_CACHED_PAGES = 100; // safety cap — each entry is only ~25 rows
const SEARCH_DEBOUNCE_MS = 300;

function tabToAlertType(tab) {
  if (tab === "price") return "PRICE";
  if (tab === "oos") return "OOS";
  if (tab === "listing") return "NO_LISTING";
  return null; // 'all'
}

// ── Session store (module-level → survives tab hops and leaving/returning to
//    the page, dies on refresh / tab close) ─────────────────────────────────
const session = {
  pages: new Map(),      // key → server response for that tab/filter/page
  counts: null,          // last known { all, price, oos, listing }
  needsRecompute: true,  // true until the first full recompute has been requested
};
const inflight = new Map(); // key → Promise, so duplicate identical calls share one request

function pageKey(p) {
  return JSON.stringify([p.alertType, p.category, p.search, p.sortBy, p.page]);
}

function rememberPage(key, res) {
  session.pages.set(key, res);
  if (session.pages.size > MAX_CACHED_PAGES) {
    session.pages.delete(session.pages.keys().next().value); // drop the oldest
  }
}

function clearSession() {
  session.pages.clear();
  session.counts = null;
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
  const [debouncedSearch, setDebouncedSearch] = useState("");   // what the API is called with (after a pause)
  const [category, setCategoryState] = useState("");
  const [sortBy, setSortByState] = useState("newest");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState(session.counts ?? { all: 0, price: 0, oos: 0, listing: 0 });
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const latestRequest = useRef(0); // ignore responses from requests that were superseded

  // Changing a filter/sort/tab always goes back to page 1 — done in the SAME
  // state update so it costs one fetch, not one for the old page + one for page 1.
  const setTab = (v) => { setTabState(v); setPage(1); };
  const setSearch = (v) => setSearchState(v); // page 1 is applied when the debounced value lands (below)
  const setCategory = (v) => { setCategoryState(v); setPage(1); };
  const setSortBy = (v) => { setSortByState(v); setPage(1); };

  // Wait for a pause in typing before searching; then jump to page 1 in one go.
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
  }

  // force: skip the session store and read from the server
  // silent: don't flip the table into its "Loading…" state (used to backfill after a single dismiss)
  const load = useCallback(async ({ force = false, silent = false } = {}) => {
    const params = {
      alertType: tabToAlertType(tab),
      category: category || null,
      search: debouncedSearch || null,
      sortBy,
      page,
    };
    const key = pageKey(params);

    if (!force) {
      const hit = session.pages.get(key);
      if (hit) {
        latestRequest.current += 1; // invalidate anything still in flight
        applyResult(hit);
        setError(null);
        setLoading(false);
        return;
      }
    }

    const myId = ++latestRequest.current;
    if (!silent) setLoading(true);
    setError(null);

    const recompute = session.needsRecompute;
    session.needsRecompute = false; // only the very first request of the session recomputes
    let handedOff = false;

    try {
      const res = await shared(key, () =>
        fetchInsights({ ...params, pageSize: PAGE_SIZE, skipRecompute: !recompute })
      );
      if (myId !== latestRequest.current) return; // a newer request owns the screen now

      // We asked for a page that no longer exists (e.g. the whole last page was
      // just dismissed) → step back to the new last page instead of showing "empty".
      if ((res.data || []).length === 0 && page > 1 && (res.totalPages || 1) < page) {
        handedOff = true; // the page change below triggers the next load
        setPage(Math.max(1, res.totalPages || 1));
        return;
      }

      rememberPage(key, res);
      applyResult(res);
    } catch (err) {
      if (recompute) session.needsRecompute = true; // the recompute never landed — try again next time
      if (myId === latestRequest.current) setError("Failed to load alerts.");
    } finally {
      if (myId === latestRequest.current && !handedOff) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, debouncedSearch, sortBy, page]);

  const refreshCounts = useCallback(async ({ force = false } = {}) => {
    if (!force && session.counts) {
      setCounts(session.counts);
      return;
    }
    try {
      const fresh = await shared("counts", async () => {
        const [all, price, oos, listing] = await Promise.all([
          fetchInsights({ pageSize: 1, skipRecompute: true }),
          fetchInsights({ alertType: "PRICE", pageSize: 1, skipRecompute: true }),
          fetchInsights({ alertType: "OOS", pageSize: 1, skipRecompute: true }),
          fetchInsights({ alertType: "NO_LISTING", pageSize: 1, skipRecompute: true }),
        ]);
        return { all: all.total, price: price.total, oos: oos.total, listing: listing.total };
      });
      session.counts = fresh;
      setCounts(fresh);
    } catch {
      // counts are supplementary — a failure here shouldn't block the table
    }
  }, []);

  // Tab counts: fetched once per session, then re-used.
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // Any tab / filter / sort / page change: served from the session store when
  // it has been loaded before, otherwise one request.
  useEffect(() => {
    load();
  }, [load]);

  // A selection only makes sense for the rows on screen — drop it when the view changes.
  useEffect(() => {
    setSelectedIds([]);
  }, [tab, category, debouncedSearch, sortBy, page]);

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

  // Full recompute (used after a push, so a resolved alert actually disappears).
  function reload() {
    clearSession();
    session.needsRecompute = true;
    load({ force: true });
    refreshCounts({ force: true });
  }

  return {
    tab, setTab,
    search, setSearch,
    category, setCategory,
    sortBy, setSortBy,
    page, setPage,
    rows, counts, categories, total, totalPages, loading, error,
    selectedIds, toggleSelect, toggleSelectAll, dismiss, dismissSelected,
    reload,
  };
}




























// // src/components/insights/useInsightsData.js
// // All state + data-fetching for the Insights dashboard lives here, so
// // InsightsView itself stays a thin layout component.

// import { useCallback, useEffect, useState } from "react";
// import { fetchInsights, dismissInsight, bulkDismissInsights } from "../../services/api";

// const PAGE_SIZE = 25;

// function tabToAlertType(tab) {
//   if (tab === "price") return "PRICE";
//   if (tab === "oos") return "OOS";
//   if (tab === "listing") return "NO_LISTING";
//   return null; // 'all'
// }

// export default function useInsightsData() {
//   const [tab, setTab] = useState("price");
//   const [search, setSearch] = useState("");
//   const [category, setCategory] = useState("");
//   const [sortBy, setSortBy] = useState("newest");
//   const [page, setPage] = useState(1);

//   const [rows, setRows] = useState([]);
//   const [counts, setCounts] = useState({ all: 0, price: 0, oos: 0, listing: 0 });
//   const [categories, setCategories] = useState([]);
//   const [total, setTotal] = useState(0);
//   const [totalPages, setTotalPages] = useState(1);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [selectedIds, setSelectedIds] = useState([]);

//   const load = useCallback(async (skipRecompute) => {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await fetchInsights({
//         alertType: tabToAlertType(tab),
//         category: category || null,
//         search: search || null,
//         sortBy,
//         page,
//         pageSize: PAGE_SIZE,
//         skipRecompute,
//       });
//       setRows(res.data || []);
//       setTotal(res.total || 0);
//       setTotalPages(res.totalPages || 1);
//       setCategories(res.categories || []);
//     } catch (err) {
//       setError("Failed to load alerts.");
//     } finally {
//       setLoading(false);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [tab, category, search, sortBy, page]);

//   const refreshCounts = useCallback(async () => {
//     try {
//       const [all, price, oos, listing] = await Promise.all([
//         fetchInsights({ pageSize: 1, skipRecompute: true }),
//         fetchInsights({ alertType: "PRICE", pageSize: 1, skipRecompute: true }),
//         fetchInsights({ alertType: "OOS", pageSize: 1, skipRecompute: true }),
//         fetchInsights({ alertType: "NO_LISTING", pageSize: 1, skipRecompute: true }),
//       ]);
//       setCounts({ all: all.total, price: price.total, oos: oos.total, listing: listing.total });
//     } catch {
//       // counts are supplementary — a failure here shouldn't block the table
//     }
//   }, []);

//   // First load: recompute for real (fresh scrape data), plus tab counts.
//   useEffect(() => {
//     load(false);
//     refreshCounts();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   // Any filter/sort/page change after that: cheap re-read only.
//   useEffect(() => {
//     load(true);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [tab, category, search, sortBy, page]);

//   // Changing a filter (not the page itself) should reset back to page 1.
//   useEffect(() => {
//     setPage(1);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [tab, category, search, sortBy]);

//   function toggleSelect(id) {
//     setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
//   }

//   function toggleSelectAll() {
//     setSelectedIds((prev) => (prev.length === rows.length ? [] : rows.map((r) => r.Id)));
//   }

//   async function dismiss(id) {
//     await dismissInsight(id);
//     setRows((prev) => prev.filter((r) => r.Id !== id));
//     setSelectedIds((prev) => prev.filter((x) => x !== id));
//     refreshCounts();
//   }

//   async function dismissSelected() {
//     if (selectedIds.length === 0) return;
//     await bulkDismissInsights(selectedIds);
//     setRows((prev) => prev.filter((r) => !selectedIds.includes(r.Id)));
//     setSelectedIds([]);
//     refreshCounts();
//   }

//   return {
//     tab, setTab,
//     search, setSearch,
//     category, setCategory,
//     sortBy, setSortBy,
//     page, setPage,
//     rows, counts, categories, total, totalPages, loading, error,
//     selectedIds, toggleSelect, toggleSelectAll, dismiss, dismissSelected,
//     reload: () => load(false),
//   };
// }