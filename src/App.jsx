// src/App.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import PriceTable from "./components/Pricetable";
import SearchBar from "./components/SearchBar";
import CategoryFilter from "./components/CategoryFilter";
import PPUpdateView from "./components/PPUpdateView";
import BulkPPUpdateView from "./components/BulkPPUpdateView";
import { fetchRecommendations, checkAuth, logout } from "./services/api";
import SettingsView from "./components/SettingsView";
import UserManagementView from "./components/UserManagementView";
import RecalculateButton from "./components/RecalculateButton";
//import RunScraperButton from "./components/RunScraperButton";

// ── Views ────────────────────────────────────────────────────
const VIEW = {
  HOME: "home",
  PP_UPDATE: "pp_update",
  BULK_PP: "bulk_pp",
  USER_MGMT: "user_mgmt",
  SETTINGS: "settings",        // ← was missing
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [view, setView] = useState(VIEW.HOME);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL;

  // ── Close menu on outside click ───────────────────────────
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

  async function handleLogout() {
    await logout();
    setUser(null);
    setData([]);
  }

  const categories = useMemo(() => {
    const cats = [...new Set(data.map((r) => r.Category).filter(Boolean))];
    return cats.sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filteredData = useMemo(() => {
    let result = data;
    if (selectedCategory)
      result = result.filter((r) => r.Category === selectedCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => (r.SKU_ID || "").toLowerCase().includes(q));
    }
    return result;
  }, [data, searchQuery, selectedCategory]);

  const totalProducts = data.length;
  const optimizedCount = data.filter((r) => r.ExtraProfitPct > 0).length;
  const floorCount = totalProducts - optimizedCount;

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
          
          <a  href={`${API_BASE}/auth/login`}
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
    );
  }

  // ── View swaps ────────────────────────────────────────────
  if (view === VIEW.PP_UPDATE) {
    return <PPUpdateView onClose={() => setView(VIEW.HOME)} />;
  }

  if (view === VIEW.BULK_PP) {
    return <BulkPPUpdateView onClose={() => setView(VIEW.HOME)} user={user} />;
  }

  if (view === VIEW.USER_MGMT) {
    return (
      <UserManagementView onClose={() => setView(VIEW.HOME)} user={user} />
    );
  }

  if (view === VIEW.SETTINGS) {
    return <SettingsView onClose={() => setView(VIEW.HOME)} user={user}/>;
  }

  // ── Main app ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">

      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
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
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                TPS Price Intelligence
              </h1>
              <p className="text-xs text-slate-500">
                Price Recommendation Engine — Prototype
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastRefreshed && (
              <span className="text-xs text-slate-500">
                Last updated: {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <span className="text-xs text-slate-400">{user.name}</span>

            {/* Sign out */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            >
              Sign out
            </button>

            {/* Refresh */}
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed
                text-white transition-colors"
            >
              <svg
                className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>


            {/* New: triggers full recalculation */}
<RecalculateButton onDone={loadData} />



{/* Run full competitor price scrape — admin + supervisor only */}
{/* {(user.role === 'admin' || user.role === 'supervisor') && (
  <RunScraperButton onDone={loadData} />
)} */}



            {/* ── Hamburger menu ── */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors
                  ${menuOpen ? "bg-slate-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300"}`}
                aria-label="Menu"
              >
                {menuOpen ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>

              {/* Dropdown panel */}
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-60
                  bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-50">

                  <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Tools
                  </p>

                  {/* Purchase Price Update — all roles */}
                  <button
                    onClick={() => { setView(VIEW.PP_UPDATE); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-200
                      hover:bg-slate-700/70 transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-violet-900/60 border border-violet-700/60
                      flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">Purchase Price Update</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Edit PP one product at a time</p>
                    </div>
                  </button>

                  {/* Bulk PP Update — all roles */}
                  <button
                    onClick={() => { setView(VIEW.BULK_PP); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-200
                      hover:bg-slate-700/70 transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-emerald-900/60 border border-emerald-700/60
                      flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">Bulk PP Update</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Upload CSV to update many at once</p>
                    </div>
                  </button>

                  {/* User Management — admin only */}
                  {user.role === "admin" && (
                    <button
                      onClick={() => { setView(VIEW.USER_MGMT); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-200
                        hover:bg-slate-700/70 transition-colors text-left"
                    >
                      <div className="w-6 h-6 rounded-md bg-sky-900/60 border border-sky-700/60
                        flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">User Management</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Add or remove user access</p>
                      </div>
                    </button>
                  )}

                  <div className="mx-3 my-1.5 border-t border-slate-700/60" />

                  {/* Configuration section — admin and supervisor only */}
                  {(user.role === "admin" || user.role === "supervisor") && (
                    <>
                      <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Configuration
                      </p>

                      <button
                        onClick={() => { setView(VIEW.SETTINGS); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-200
                          hover:bg-slate-700/70 transition-colors text-left"
                      >
                        <div className="w-6 h-6 rounded-md bg-slate-700/60 border border-slate-600/60
                          flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Settings</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">Business variables & scraping config</p>
                        </div>
                      </button>

                      <div className="mx-3 my-1.5 border-t border-slate-700/60" />
                    </>
                  )}

                  <p className="px-3 py-1.5 text-[10px] text-slate-600 italic">
                    More tools coming soon
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">

        {/* Stats cards */}
        {!loading && !error && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <StatCard label="Total Products"   value={totalProducts}  color="violet" />
            <StatCard label="Optimized Prices" value={optimizedCount} sub="99% of competitor" color="emerald" />
            <StatCard label="At Floor Price"   value={floorCount}     sub="PP × 1.30" color="sky" />
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">
              Fetching recommendations from database...
            </p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && data.length === 0 && (
          <div className="text-center py-24 text-slate-500">
            No recommendations found. Run the recommendation engine first.
          </div>
        )}

        {!loading && !error && data.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-3">
                <SearchBar onSearch={setSearchQuery} value={searchQuery} />
                <CategoryFilter
                  categories={categories}
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                />
              </div>
              <div className="flex items-center gap-2">
                {(searchQuery || selectedCategory) && (
                  <button
                    onClick={() => { setSearchQuery(""); setSelectedCategory(""); }}
                    className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
                <span className="text-xs text-slate-500">
                  {filteredData.length === data.length
                    ? `${data.length} products`
                    : `${filteredData.length} of ${data.length} products`}
                </span>
              </div>
            </div>

            {filteredData.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <p className="text-sm">No products match your search.</p>
                <button
                  onClick={() => { setSearchQuery(""); setSelectedCategory(""); }}
                  className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <PriceTable data={filteredData} />
            )}
          </>
        )}
      </main>
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