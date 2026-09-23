// src/components/insights/InsightsView.jsx
// The full-page Insights dashboard, reached via the bell's "View all →"
// link or the nav menu. Deliberately its own light theme — see insights.css.

import "./insights.css";
import { useState } from "react";
import useInsightsData from "./useInsightsData";
import InsightsSummaryCards from "./InsightsSummaryCards";
import InsightsTabs from "./InsightsTabs";
import InsightsFilterBar from "./InsightsFilterBar";
import InsightsTable from "./InsightsTable";
import PriceActionModal from "./PriceActionModal";

const PAGE_SIZE = 25;

export default function InsightsView() {
  const {
    tab, setTab,
    search, setSearch,
    category, setCategory,
    sortBy, setSortBy,
    page, setPage,
    rows, counts, categories, total, totalPages, loading, error,
    selectedIds, toggleSelect, toggleSelectAll, dismiss, dismissSelected,
    reload,
  } = useInsightsData();

  // Which alert's modal is open, if any — lives here (not in App.jsx) since
  // this is now fully self-contained: no more navigating away to the
  // Intelligence dashboard, which could come up empty for a SKU that fails
  // one of that dashboard's display conditions.
  const [activeAlert, setActiveAlert] = useState(null);

  const rangeStart = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * PAGE_SIZE + rows.length;

  return (
    <div className="ins-page">
      <div className="ins-header">
        <div className="ins-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Insights
        </div>
        {/* Not wired yet — needs a /api/insights/export CSV route */}
        <button className="ins-export-btn" disabled title="Coming soon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ verticalAlign: "-2px", marginRight: 4 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export CSV
        </button>
      </div>

      <InsightsSummaryCards counts={counts} activeTab={tab} onSelect={setTab} />
      <InsightsTabs active={tab} onChange={setTab} />
      <InsightsFilterBar
        search={search} onSearch={setSearch}
        category={category} onCategory={setCategory}
        categories={categories}
        sortBy={sortBy} onSort={setSortBy}
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
            />
          </div>

          {!loading && rows.length > 0 && (
            <div className="ins-footer">
              <span>
                Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()}
                {selectedIds.length > 0 && (
                  <>
                    {" "}· <a className="ins-link" onClick={dismissSelected}>
                      Dismiss selected ({selectedIds.length})
                    </a>
                  </>
                )}
              </span>
              <div className="ins-pagination">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <span>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
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





























// // src/components/insights/InsightsView.jsx
// // The full-page Insights dashboard, reached via the bell's "View all →"
// // link or the nav menu. Deliberately its own light theme — see insights.css.

// import "./insights.css";
// import useInsightsData from "./useInsightsData";
// import InsightsSummaryCards from "./InsightsSummaryCards";
// import InsightsTabs from "./InsightsTabs";
// import InsightsFilterBar from "./InsightsFilterBar";
// import InsightsTable from "./InsightsTable";

// const PAGE_SIZE = 25;

// export default function InsightsView({ onTakeAction }) {
//   const {
//     tab, setTab,
//     search, setSearch,
//     category, setCategory,
//     sortBy, setSortBy,
//     page, setPage,
//     rows, counts, categories, total, totalPages, loading, error,
//     selectedIds, toggleSelect, toggleSelectAll, dismiss, dismissSelected,
//   } = useInsightsData();

//   const rangeStart = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
//   const rangeEnd = (page - 1) * PAGE_SIZE + rows.length;

//   return (
//     <div className="ins-page">
//       <div className="ins-header">
//         <div className="ins-title">
//           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
//             <path strokeLinecap="round" strokeLinejoin="round"
//               d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
//           </svg>
//           Insights
//         </div>
//         {/* Not wired yet — needs a /api/insights/export CSV route */}
//         <button className="ins-export-btn" disabled title="Coming soon">
//           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
//             style={{ verticalAlign: "-2px", marginRight: 4 }}>
//             <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
//           </svg>
//           Export CSV
//         </button>
//       </div>

//       <InsightsSummaryCards counts={counts} activeTab={tab} onSelect={setTab} />
//       <InsightsTabs active={tab} onChange={setTab} />
//       <InsightsFilterBar
//         search={search} onSearch={setSearch}
//         category={category} onCategory={setCategory}
//         categories={categories}
//         sortBy={sortBy} onSort={setSortBy}
//       />

//       {error ? (
//         <div className="ins-empty">{error}</div>
//       ) : (
//         <>
//           <div className="ins-table-wrap">
//             <InsightsTable
//               rows={rows}
//               loading={loading}
//               selectedIds={selectedIds}
//               onToggleSelect={toggleSelect}
//               onToggleSelectAll={toggleSelectAll}
//               onDismiss={dismiss}
//               onTakeAction={onTakeAction}
//             />
//           </div>

//           {!loading && rows.length > 0 && (
//             <div className="ins-footer">
//               <span>
//                 Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()}
//                 {selectedIds.length > 0 && (
//                   <>
//                     {" "}· <a className="ins-link" onClick={dismissSelected}>
//                       Dismiss selected ({selectedIds.length})
//                     </a>
//                   </>
//                 )}
//               </span>
//               <div className="ins-pagination">
//                 <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
//                 <span>{page} / {totalPages}</span>
//                 <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
//               </div>
//             </div>
//           )}
//         </>
//       )}
//     </div>
//   );
// }