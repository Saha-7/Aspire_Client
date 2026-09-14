// src/App.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import PriceTable from "./components/Pricetable";
import InternalRecommendationsTable from "./components/InternalRecommendationsTable";
import SearchBar from "./components/SearchBar";
import CategoryFilter from "./components/CategoryFilter";
import PPUpdateView from "./components/PPUpdateView";
import BulkPPUpdateView from "./components/BulkPPUpdateView";
import {
  fetchRecommendations,
  fetchInternalRecommendations,
  checkAuth,
  logout,
} from "./services/api";
import SettingsView from "./components/SettingsView";
import UserManagementView from "./components/UserManagementView";
import ScrapeStatsView from "./components/ScrapeStatsView";
import { PushLockProvider } from "./context/PushLockContext";
import Header, { VIEW } from "./components/Header";
//import RunScraperButton from "./components/RunScraperButton";

export default function App() {
  return (
    <PushLockProvider>
      <AppInner />
    </PushLockProvider>
  );
}

function AppInner() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  // ── view is derived from the URL, not separate state ──
  const navigate = useNavigate();
  const location = useLocation();
  const view = location.pathname;

  // ── Internal Products RecommendedSP toggle ────────────────
  const [showInternalView, setShowInternalView] = useState(false);
  const [internalData, setInternalData] = useState([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL;

  // ── Auth ──────────────────────────────────────────────────
  useEffect(() => {
    checkAuth().then((res) => {
      if (res.authenticated) setUser(res.user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  // ── Lazy-load internal recommendations the first time the
  // toggle is switched on ───────────────────────────────────
  useEffect(() => {
    if (showInternalView && internalData.length === 0 && !internalLoading) {
      loadInternalData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInternalView]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchRecommendations();
      setData(rows);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(
        "Failed to fetch data. Make sure the API server is running on port 8000.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadInternalData() {
    setInternalLoading(true);
    setInternalError(null);
    try {
      const rows = await fetchInternalRecommendations();
      setInternalData(rows);
      setLastRefreshed(new Date());
    } catch (err) {
      setInternalError(
        "Failed to fetch internal recommendations. Make sure the API server is running.",
      );
    } finally {
      setInternalLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setData([]);
    setInternalData([]);
  }

  // ── Refresh — refreshes whichever view is currently active ─
  function handleRefresh() {
    if (showInternalView) loadInternalData();
    else loadData();
  }

  function handleCategoryChange(category) {
    setSelectedCategory(category);
  }

  const categories = useMemo(() => {
    const source = showInternalView ? internalData : data;
    const cats = [...new Set(source.map((r) => r.Category).filter(Boolean))];
    return cats.sort((a, b) => a.localeCompare(b));
  }, [data, internalData, showInternalView]);

  const filteredData = useMemo(() => {
    let result = showInternalView ? internalData : data;
    if (selectedCategory)
      result = result.filter((r) => r.Category === selectedCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => (r.SKU_ID || "").toLowerCase().includes(q));
    }
    return result;
  }, [data, internalData, showInternalView, searchQuery, selectedCategory]);

  const totalProducts = data.length;
  const optimizedCount = data.filter((r) => r.ExtraProfitPct > 0).length;
  const floorCount = totalProducts - optimizedCount;

  const totalInternalProducts = internalData.length;

  const currentLoading = showInternalView ? internalLoading : loading;
  const currentError = showInternalView ? internalError : error;
  const currentSourceLength = showInternalView
    ? internalData.length
    : data.length;

  // ── Auth guards ───────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f1117] font-sans">
        <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-10 flex flex-col items-center gap-6 w-full max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">
                TPS Price Intelligence
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Sign in with your TPS account to continue
              </p>
            </div>

            <a
              href={`${API_BASE}/auth/login`}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5
                bg-white hover:bg-slate-100 text-slate-800 font-medium text-sm
                rounded-lg transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Main app: Header renders on EVERY view, unconditionally ──
  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">
      <Header
        view={view}
        navigate={navigate}
        user={user}
        onLogout={handleLogout}
        onRefresh={handleRefresh}
        currentLoading={currentLoading}
        lastRefreshed={lastRefreshed}
        showInternalView={showInternalView}
        onRecalcDone={loadData}
        onAlertTakeAction={(alert) => {
  navigate(VIEW.HOME);
  setShowInternalView(false);
  setSearchQuery(alert.SKU_ID);
}}
      />

      {/* ── Tool views ── */}
      {view === VIEW.PP_UPDATE && (
        <PPUpdateView
          onClose={() => {
            navigate(VIEW.HOME);
            loadInternalData();
          }}
        />
      )}

      {view === VIEW.BULK_PP && (
        <BulkPPUpdateView
          onClose={() => {
            navigate(VIEW.HOME);
            loadInternalData();
          }}
          user={user}
        />
      )}

      {view === VIEW.USER_MGMT && (
        <UserManagementView onClose={() => navigate(VIEW.HOME)} user={user} />
      )}

      {view === VIEW.SETTINGS && (
        <SettingsView onClose={() => navigate(VIEW.HOME)} user={user} />
      )}

      {view === VIEW.SCRAPE_STATS && (
        <ScrapeStatsView onClose={() => navigate(VIEW.HOME)} user={user} />
      )}

      {/* ── Dashboard (Home) ── */}
      {view === VIEW.HOME && (
        <main className="max-w-[1600px] mx-auto px-3 sm:px-6 py-5 sm:py-8">
          {/* Stats cards */}
          {!currentLoading &&
            !currentError &&
            (showInternalView ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <StatCard
                  label="Total Eligible Products"
                  value={totalInternalProducts}
                  sub="PP available + Active + In Stock"
                  color="violet"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                <StatCard
                  label="Total Products"
                  value={totalProducts}
                  color="violet"
                />
                <StatCard
                  label="Optimized Prices"
                  value={optimizedCount}
                  sub="99% of competitor"
                  color="emerald"
                />
                <StatCard
                  label="At Floor Price"
                  value={floorCount}
                  sub="PP × 1.30"
                  color="sky"
                />
              </div>
            ))}

          {currentLoading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">
                {showInternalView
                  ? "Calculating internal RecommendedSP..."
                  : "Fetching recommendations from database..."}
              </p>
            </div>
          )}

          {currentError && (
            <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400 text-sm">
              {currentError}
            </div>
          )}

          {!currentLoading && !currentError && currentSourceLength === 0 && (
            <div className="text-center py-24 text-slate-500">
              {showInternalView
                ? "No eligible internal products found (need PP + Active + In Stock)."
                : "No recommendations found. Run the recommendation engine first."}
            </div>
          )}

          {!currentLoading && !currentError && currentSourceLength > 0 && (
            <>
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
                  <SearchBar onSearch={setSearchQuery} value={searchQuery} />
                  <CategoryFilter
                    categories={categories}
                    value={selectedCategory}
                    onChange={handleCategoryChange}
                  />

                  {/* ── Internal Products RecommendedSP toggle ── */}
                  <button
                    onClick={() => setShowInternalView((v) => !v)}
                    aria-pressed={showInternalView}
                    className={`flex items-center gap-2.5 pl-3 pr-3.5 py-1.5 rounded-full border transition-all duration-200
                      ${
                        showInternalView
                          ? "bg-emerald-900/30 border-emerald-600/50 text-emerald-300"
                          : "bg-slate-800/70 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                      }`}
                  >
                    {/* Switch track + knob */}
                    <span
                      className={`relative inline-flex h-4.5 w-8 flex-shrink-0 items-center rounded-full transition-colors duration-200
                        ${showInternalView ? "bg-emerald-500" : "bg-slate-600"}`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200
                          ${showInternalView ? "translate-x-[18px]" : "translate-x-[3px]"}`}
                      />
                    </span>

                    <span className="text-xs font-medium whitespace-nowrap">
                      Basic Recommendations
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {(searchQuery || selectedCategory) && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedCategory("");
                      }}
                      className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                  <span className="text-xs text-slate-500">
                    {filteredData.length === currentSourceLength
                      ? `${currentSourceLength} products`
                      : `${filteredData.length} of ${currentSourceLength} products`}
                  </span>
                </div>
              </div>

              {filteredData.length === 0 ? (
                <div className="text-center py-20 text-slate-500">
                  <p className="text-sm">No products match your search.</p>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedCategory("");
                    }}
                    className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Clear filters
                  </button>
                </div>
              ) : showInternalView ? (
                <InternalRecommendationsTable data={filteredData} />
              ) : (
                <PriceTable data={filteredData} />
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  const colors = {
    violet: "text-violet-400 bg-violet-900/30 border-violet-700/40",
    emerald: "text-emerald-400 bg-emerald-900/30 border-emerald-700/40",
    sky: "text-sky-400 bg-sky-900/30 border-sky-700/40",
    amber: "text-amber-400 bg-amber-900/30 border-amber-700/40",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color].split(" ")[0]}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
