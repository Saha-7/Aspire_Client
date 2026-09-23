// src/components/Header.jsx
// ─────────────────────────────────────────────────────────────
// Persistent nav. On Home it's the full branding bar. On every
// other view it shrinks to just a small floating sticky hamburger
// (top-right), so tools stay reachable without a second full-width
// bar stacking under each view's own Back/title strip.
// ─────────────────────────────────────────────────────────────

import { useRef, useState, useEffect } from "react";
import RecalculateButton from "./RecalculateButton";
import AlertBell from "./Alertbell";

export const VIEW = {
  HOME: "/",
  PP_UPDATE: "/pp-update",
  BULK_PP: "/bulk-pp",
  USER_MGMT: "/user-management",
  SETTINGS: "/settings",
  SCRAPE_STATS: "/scrape-stats",
  INSIGHTS: "/insights",
};

export default function Header({
  view,
  navigate,
  user,
  onLogout,
  onRefresh,
  currentLoading,
  lastRefreshed,
  showInternalView,
  onRecalcDone,
  onAlertTakeAction,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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

  function go(path) {
    navigate(path);
    setMenuOpen(false);
  }

  const isHome = view === VIEW.HOME;

  // ── Shared dropdown content (Tools + Configuration list) ────
  const dropdown = menuOpen && (
    <div
      className="absolute right-0 top-full mt-2 w-60 max-w-[calc(100vw-1.5rem)]
      bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-50"
    >
      <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
        Tools
      </p>

      <NavItem
        active={view === VIEW.HOME}
        onClick={() => go(VIEW.HOME)}
        color="bg-fuchsia-900/60 border-fuchsia-700/60 text-fuchsia-400"
        label="Dashboard"
        sub="Back to recommendations"
        icon={
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        }
      />

      {/* Purchase Price Update — all roles */}
      <NavItem
        active={view === VIEW.PP_UPDATE}
        onClick={() => go(VIEW.PP_UPDATE)}
        color="bg-violet-900/60 border-violet-700/60 text-violet-400"
        label="Purchase Price Update"
        sub="Edit PP one product at a time"
        icon={
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        }
      />

      {/* Bulk PP Update — all roles */}
      <NavItem
        active={view === VIEW.BULK_PP}
        onClick={() => go(VIEW.BULK_PP)}
        color="bg-emerald-900/60 border-emerald-700/60 text-emerald-400"
        label="Bulk PP Update"
        sub="Upload CSV to update many at once"
        icon={
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        }
      />

      {/* User Management — admin only */}
      {user.role === "admin" && (
        <NavItem
          active={view === VIEW.USER_MGMT}
          onClick={() => go(VIEW.USER_MGMT)}
          color="bg-sky-900/60 border-sky-700/60 text-sky-400"
          label="User Management"
          sub="Add or remove user access"
          icon={
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          }
        />
      )}

      <div className="mx-3 my-1.5 border-t border-slate-700/60" />

      {/* Configuration section — admin and supervisor only */}
      {(user.role === "admin" || user.role === "supervisor") && (
        <>
          <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Configuration
          </p>

          <NavItem
            active={view === VIEW.SETTINGS}
            onClick={() => go(VIEW.SETTINGS)}
            color="bg-slate-700/60 border-slate-600/60 text-slate-400"
            label="Settings"
            sub="Business variables & scraping config"
            icon={
              <>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </>
            }
          />

          <NavItem
            active={view === VIEW.INSIGHTS}
            onClick={() => go(VIEW.INSIGHTS)}
            color="bg-red-900/60 border-red-700/60 text-red-400"
            label="Insights"
            sub="Price, stock & listing alerts"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            }
          />

          <NavItem
            active={view === VIEW.SCRAPE_STATS}
            onClick={() => go(VIEW.SCRAPE_STATS)}
            color="bg-amber-900/60 border-amber-700/60 text-amber-400"
            label="Scrape Details"
            sub="Matched / unmatched / stock per run"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            }
          />

          <div className="mx-3 my-1.5 border-t border-slate-700/60" />
        </>
      )}

      <p className="px-3 py-1.5 text-[10px] text-slate-600 italic">
        More tools coming soon
      </p>

      {/* Sign out lives here on non-Home views, since there's no
          full bar to hold it there */}
      {!isHome && (
        <>
          <div className="mx-3 my-1.5 border-t border-slate-700/60" />
          <button
            onClick={onLogout}
            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700/70 transition-colors rounded-b-xl"
          >
            Sign out
          </button>
        </>
      )}
    </div>
  );

  // ── Every non-Home view: just a small floating sticky hamburger,
  // no full-width bar, no branding row ──────────────────────────
  if (!isHome) {
    return (
      <div
        className="fixed top-3 right-3 sm:top-4 sm:right-4 z-40"
        ref={menuRef}
      >
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex items-center justify-center w-9 h-9 rounded-lg shadow-lg border transition-colors
              ${
                menuOpen
                  ? "bg-slate-600 border-slate-500 text-white"
                  : "bg-slate-800/90 backdrop-blur border-slate-700 hover:bg-slate-700 text-slate-300"
              }`}
            aria-label="Menu"
          >
            {menuOpen ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
          {dropdown}
        </div>
      </div>
    );
  }

  // ── Home: full branding bar with user info, refresh, recalculate ──
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 flex-wrap">
        {/* ── Logo / title ── */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"
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
          <div className="min-w-0">
            <h1 className="text-sm sm:text-lg font-bold text-white tracking-tight truncate">
              TPS Price Intelligence
            </h1>
            <p className="hidden sm:block text-xs text-slate-500">
              Price Recommendation Engine — Prototype
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap justify-end">
          {lastRefreshed && (
            <span className="hidden lg:inline text-xs text-slate-500">
              Last updated: {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <span className="hidden sm:inline text-xs text-slate-400">
            {user.name}
          </span>

          {/* Sign out */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg
              bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            Sign out
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={currentLoading}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg
              bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed
              text-white transition-colors"
          >
            <svg
              className={`w-3 h-3 flex-shrink-0 ${currentLoading ? "animate-spin" : ""}`}
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

          {/* Recalculate — only for the main (non-internal) recommendation view */}
          {!showInternalView && <RecalculateButton onDone={onRecalcDone} />}

          {/* Alerts bell */}
          <AlertBell
            onTakeAction={onAlertTakeAction}
            onViewAll={() => go(VIEW.INSIGHTS)}
          />

          {/* ── Hamburger menu ── */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors
                ${menuOpen ? "bg-slate-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300"}`}
              aria-label="Menu"
            >
              {menuOpen ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
            {dropdown}
          </div>
        </div>
      </div>
    </header>
  );
}

// ── One dropdown row, with active-page highlighting ──────────
function NavItem({ active, onClick, color, label, sub, icon }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-left transition-colors
        ${active ? "bg-slate-700/70 text-white" : "text-slate-200 hover:bg-slate-700/70"}`}
    >
      <div
        className={`w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 ${color}`}
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {icon}
        </svg>
      </div>
      <div>
        <p className="font-medium flex items-center gap-1.5">
          {label}
          {active && (
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
          )}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
      </div>
    </button>
  );
}
