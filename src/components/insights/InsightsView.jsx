// src/components/insights/InsightsView.jsx
// The full-page Insights dashboard, reached via the bell's "View all →"
// link or the nav menu. Deliberately its own theme — see insights.css.

import "./insights.css";
import { useState } from "react";
import useInsightsData from "./useInsightsData";
import InsightsSummaryCards from "./InsightsSummaryCards";
import InsightsTabs from "./InsightsTabs";
import InsightsFilterBar from "./InsightsFilterBar";
import InsightsTable from "./InsightsTable";
import PriceActionModal from "./PriceActionModal";
import { downloadInsightsExportCsv } from "../../services/api";

const PAGE_SIZE = 25;

// CSV is offered for these two tabs only.
const EXPORT_NAMES = { oos: "out_of_stock", listing: "not_in_catalog" };

export default function InsightsView() {
  const {
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
  } = useInsightsData();

  // Which alert's modal is open, if any.
  const [activeAlert, setActiveAlert] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportError, setExportError] = useState(null);

  const rangeStart = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * PAGE_SIZE + rows.length;

  const canExport = tab === "oos" || tab === "listing";

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  }

  async function handleExport() {
    if (!canExport || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await downloadInsightsExportCsv(exportParams);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `insights_${EXPORT_NAMES[tab]}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setExportError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="ins-page">
      <div className="ins-header">
        <div className="ins-title">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          Insights
        </div>

        <div>
          {exportError && <span className="ins-export-error">{exportError}</span>}
          <button
            className="ins-export-btn"
            style={{ marginRight: 8 }}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Recompute alerts from the latest scrape and stock data"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            className="ins-export-btn"
            onClick={handleExport}
            disabled={!canExport || exporting || total === 0}
            title={
              canExport
                ? "Download everything matching the current filters as CSV"
                : "CSV export is available for Out of stock and Not in catalog"
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ verticalAlign: "-2px", marginRight: 4 }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
              />
            </svg>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      <InsightsSummaryCards counts={counts} activeTab={tab} onSelect={setTab} />
      <InsightsTabs active={tab} onChange={setTab} />
      <InsightsFilterBar
        tab={tab}
        search={search}
        onSearch={setSearch}
        category={category}
        onCategory={setCategory}
        categories={categories}
        brand={brand}
        onBrand={setBrand}
        brands={brands}
        days={days}
        onDays={setDays}
        sortBy={sortBy}
        onSort={setSortBy}
      />

      {error ? (
        <div className="ins-empty">{error}</div>
      ) : (
        <>
          <div className="ins-table-wrap">
            <InsightsTable
              rows={rows}
              loading={loading}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onDismiss={dismiss}
              onTakeAction={setActiveAlert}
              tab={tab}
            />
          </div>

          {!loading && rows.length > 0 && (
            <div className="ins-footer">
              <span>
                Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()}
                {selectedIds.length > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <a className="ins-link" onClick={dismissSelected}>
                      Dismiss selected ({selectedIds.length})
                    </a>
                  </>
                )}
              </span>
              <div className="ins-pagination">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeAlert && (
        <PriceActionModal
          skuId={activeAlert.SKU_ID}
          category={activeAlert.Category}
          onClose={() => setActiveAlert(null)}
          onPushed={() => reload()} // full recompute so a resolved alert actually disappears
        />
      )}
    </div>
  );
}