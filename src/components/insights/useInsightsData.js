// src/components/insights/useInsightsData.js
// All state + data-fetching for the Insights dashboard lives here, so
// InsightsView itself stays a thin layout component.

import { useCallback, useEffect, useState } from "react";
import { fetchInsights, dismissInsight, bulkDismissInsights } from "../../services/api";

const PAGE_SIZE = 25;

function tabToAlertType(tab) {
  if (tab === "price") return "PRICE";
  if (tab === "oos") return "OOS";
  if (tab === "listing") return "NO_LISTING";
  return null; // 'all'
}

export default function useInsightsData() {
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ all: 0, price: 0, oos: 0, listing: 0 });
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const load = useCallback(async (skipRecompute) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchInsights({
        alertType: tabToAlertType(tab),
        category: category || null,
        search: search || null,
        sortBy,
        page,
        pageSize: PAGE_SIZE,
        skipRecompute,
      });
      setRows(res.data || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
      setCategories(res.categories || []);
    } catch (err) {
      setError("Failed to load alerts.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, search, sortBy, page]);

  const refreshCounts = useCallback(async () => {
    try {
      const [all, price, oos, listing] = await Promise.all([
        fetchInsights({ pageSize: 1, skipRecompute: true }),
        fetchInsights({ alertType: "PRICE", pageSize: 1, skipRecompute: true }),
        fetchInsights({ alertType: "OOS", pageSize: 1, skipRecompute: true }),
        fetchInsights({ alertType: "NO_LISTING", pageSize: 1, skipRecompute: true }),
      ]);
      setCounts({ all: all.total, price: price.total, oos: oos.total, listing: listing.total });
    } catch {
      // counts are supplementary — a failure here shouldn't block the table
    }
  }, []);

  // First load: recompute for real (fresh scrape data), plus tab counts.
  useEffect(() => {
    load(false);
    refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any filter/sort/page change after that: cheap re-read only.
  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, search, sortBy, page]);

  // Changing a filter (not the page itself) should reset back to page 1.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, search, sortBy]);

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === rows.length ? [] : rows.map((r) => r.Id)));
  }

  async function dismiss(id) {
    await dismissInsight(id);
    setRows((prev) => prev.filter((r) => r.Id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    refreshCounts();
  }

  async function dismissSelected() {
    if (selectedIds.length === 0) return;
    await bulkDismissInsights(selectedIds);
    setRows((prev) => prev.filter((r) => !selectedIds.includes(r.Id)));
    setSelectedIds([]);
    refreshCounts();
  }

  return {
    tab, setTab,
    search, setSearch,
    category, setCategory,
    sortBy, setSortBy,
    page, setPage,
    rows, counts, categories, total, totalPages, loading, error,
    selectedIds, toggleSelect, toggleSelectAll, dismiss, dismissSelected,
    reload: () => load(false),
  };
}