// src/components/AlertBell.jsx
// ─────────────────────────────────────────────────────────────
// Bell icon + dropdown panel for the 4 take-action Insight alerts
// (LOW_PRICE, HIGH_PRICE, OOS, NO_LISTING). Lives in the Home header.
// Shows the newest ~10 with a "View all" link into the full dashboard
// at /insights — the dropdown is a teaser, not the workspace, once
// there are more than a handful of alerts.
//
// "Take Action" routing:
//   - LOW_PRICE / HIGH_PRICE → jump to the Intelligence Recommendations
//     table and highlight that SKU's row (reuses the existing Modify &
//     Push flow — nothing new to build there).
//   - OOS / NO_LISTING → no in-app action exists yet (restocking/adding
//     a new product both happen outside this app), so these currently
//     only offer Dismiss + a detail line. Revisit once there's something
//     real to click through to.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { fetchInsights, dismissInsight } from "../services/api";
import { timeAgo, describeAlert, canTakeAction } from "./insights/alertFormatters";

const DROPDOWN_LIMIT = 10;

// Dark-theme colors for the dropdown — kept local since the full
// dashboard (InsightsView) uses its own separate light theme.
const BELL_COLORS = {
  LOW_PRICE:  { color: "text-red-400",    dot: "bg-red-500" },
  HIGH_PRICE: { color: "text-amber-400",  dot: "bg-amber-500" },
  OOS:        { color: "text-orange-400", dot: "bg-orange-500" },
  NO_LISTING: { color: "text-sky-400",    dot: "bg-sky-500" },
};

export default function AlertBell({ onTakeAction, onViewAll }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dismissingId, setDismissingId] = useState(null);
  const panelRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetchInsights();
      setAlerts(res.data || []);
    } catch (err) {
      console.error("Failed to load insights:", err.message);
    } finally {
      setLoading(false);
    }
  }

  // Poll lightly so the bell count stays roughly fresh without the user
  // needing to open the panel — every 5 minutes is plenty for scrape-cycle
  // data that only changes once or twice a day.
  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleDismiss(id) {
    setDismissingId(id);
    try {
      await dismissInsight(id);
      setAlerts((prev) => prev.filter((a) => a.Id !== id));
    } catch (err) {
      console.error("Failed to dismiss alert:", err.message);
    } finally {
      setDismissingId(null);
    }
  }

  function handleTakeAction(alert) {
    setOpen(false);
    if (canTakeAction(alert)) onTakeAction?.(alert);
  }

  function handleViewAll() {
    setOpen(false);
    onViewAll?.();
  }

  const count = alerts.length;
  const visible = alerts.slice(0, DROPDOWN_LIMIT);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors
          ${open ? "bg-slate-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300"}`}
        aria-label="Alerts"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1
            rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1.5rem)]
          bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col max-h-[70vh]">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
            <p className="text-sm font-semibold text-white">Alerts</p>
            <p className="text-xs text-slate-500">{count} active</p>
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && alerts.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-500 text-center">Loading…</p>
            ) : count === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-500 text-center">Nothing needs attention right now.</p>
            ) : (
              visible.map((alert) => {
                const meta = BELL_COLORS[alert.AlertType] || {};
                const detail = describeAlert(alert);
                const actionable = canTakeAction(alert);

                return (
                  <div key={alert.Id} className="px-4 py-3 border-b border-slate-800/70 last:border-b-0">
                    <div className="flex items-start gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-medium ${meta.color}`}>
                            {alert.AlertType === "LOW_PRICE" ? "Priced below competitors"
                              : alert.AlertType === "HIGH_PRICE" ? "Priced above competitors"
                              : alert.AlertType === "OOS" ? "Out of stock (we don't have it, competitors do)"
                              : "Not in our catalog"}
                          </span>
                          <span className="text-[10px] text-slate-600 flex-shrink-0">{timeAgo(alert.LastTriggeredAt)}</span>
                        </div>
                        <p className="text-sm text-slate-200 font-mono mt-0.5 truncate" title={alert.Title || alert.SKU_ID}>
                          {alert.SKU_ID}
                        </p>
                        {alert.Title && (
                          <p className="text-xs text-slate-500 truncate">{alert.Title}</p>
                        )}
                        {detail && (
                          <p className="text-xs text-slate-400 mt-1">{detail}</p>
                        )}

                        <div className="flex items-center gap-3 mt-2">
                          {actionable && (
                            <button
                              onClick={() => handleTakeAction(alert)}
                              className="text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
                            >
                              Take Action →
                            </button>
                          )}
                          <button
                            onClick={() => handleDismiss(alert.Id)}
                            disabled={dismissingId === alert.Id}
                            className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors"
                          >
                            {dismissingId === alert.Id ? "Dismissing…" : "Dismiss"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {count > 0 && (
            <button
              onClick={handleViewAll}
              className="flex-shrink-0 text-center py-2.5 text-xs font-medium text-violet-400
                hover:text-violet-300 hover:bg-slate-700/50 border-t border-slate-700 transition-colors"
            >
              View all ({count}) →
            </button>
          )}
        </div>
      )}
    </div>
  );
}








































// // src/components/AlertBell.jsx
// // ─────────────────────────────────────────────────────────────
// // Bell icon + dropdown panel for the 4 take-action Insight alerts
// // (LOW_PRICE, HIGH_PRICE, OOS, NO_LISTING). Lives in the Home header.
// //
// // "Take Action" routing:
// //   - LOW_PRICE / HIGH_PRICE → jump to the Intelligence Recommendations
// //     table and highlight that SKU's row (reuses the existing Modify &
// //     Push flow — nothing new to build there).
// //   - OOS / NO_LISTING → no in-app action exists yet (restocking/adding
// //     a new product both happen outside this app), so these currently
// //     only offer Dismiss + a detail line. Revisit once there's something
// //     real to click through to.
// // ─────────────────────────────────────────────────────────────

// import { useEffect, useRef, useState } from 'react';
// import { fetchInsights, dismissInsight } from '../services/api';

// const ALERT_META = {
//   LOW_PRICE:  { label: 'Priced below competitors', color: 'text-red-400',    dot: 'bg-red-500' },
//   HIGH_PRICE: { label: 'Priced above competitors', color: 'text-amber-400',  dot: 'bg-amber-500' },
//   OOS:        { label: 'Out of stock (we don\'t have it, competitors do)', color: 'text-orange-400', dot: 'bg-orange-500' },
//   NO_LISTING: { label: 'Not in our catalog',       color: 'text-sky-400',    dot: 'bg-sky-500' },
// };

// function timeAgo(dateStr) {
//   const d = new Date(dateStr);
//   const diffMs = Date.now() - d.getTime();
//   const mins = Math.floor(diffMs / 60000);
//   if (mins < 1)   return 'just now';
//   if (mins < 60)  return `${mins}m ago`;
//   const hrs = Math.floor(mins / 60);
//   if (hrs < 24)   return `${hrs}h ago`;
//   const days = Math.floor(hrs / 24);
//   return `${days}d ago`;
// }

// function describeAlert(alert) {
//   const { AlertType, CurrentValue } = alert;
//   if (AlertType === 'LOW_PRICE' || AlertType === 'HIGH_PRICE') {
//     const match = /diff:(-?\d+(\.\d+)?)/.exec(CurrentValue || '');
//     const diff = match ? parseFloat(match[1]) : null;
//     if (diff == null) return null;
//     return AlertType === 'LOW_PRICE'
//       ? `${Math.abs(diff).toFixed(1)}% below lowest competitor price`
//       : `${diff.toFixed(1)}% above lowest competitor price`;
//   }
//   if (AlertType === 'OOS') {
//     const stores = (CurrentValue || '').replace('stores:', '').split(',').filter(Boolean);
//     return `In stock at ${stores.length} competitor${stores.length !== 1 ? 's' : ''}: ${stores.join(', ')}`;
//   }
//   if (AlertType === 'NO_LISTING') {
//     const stores = (CurrentValue || '').replace('stores:', '').split(',').filter(Boolean);
//     return `Listed by ${stores.length} competitor${stores.length !== 1 ? 's' : ''}: ${stores.join(', ')}`;
//   }
//   return null;
// }

// export default function AlertBell({ navigate, onTakeAction }) {
//   const [open, setOpen]         = useState(false);
//   const [alerts, setAlerts]     = useState([]);
//   const [loading, setLoading]   = useState(false);
//   const [dismissingId, setDismissingId] = useState(null);
//   const panelRef = useRef(null);

//   async function load() {
//     setLoading(true);
//     try {
//       const res = await fetchInsights();
//       setAlerts(res.data || []);
//     } catch (err) {
//       console.error('Failed to load insights:', err.message);
//     } finally {
//       setLoading(false);
//     }
//   }

//   // Poll lightly so the bell count stays roughly fresh without the user
//   // needing to open the panel — every 5 minutes is plenty for scrape-cycle
//   // data that only changes once or twice a day.
//   useEffect(() => {
//     load();
//     const interval = setInterval(load, 5 * 60 * 1000);
//     return () => clearInterval(interval);
//   }, []);

//   useEffect(() => {
//     function handleClick(e) {
//       if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
//     }
//     document.addEventListener('mousedown', handleClick);
//     return () => document.removeEventListener('mousedown', handleClick);
//   }, []);

//   async function handleDismiss(id) {
//     setDismissingId(id);
//     try {
//       await dismissInsight(id);
//       setAlerts(prev => prev.filter(a => a.Id !== id));
//     } catch (err) {
//       console.error('Failed to dismiss alert:', err.message);
//     } finally {
//       setDismissingId(null);
//     }
//   }

//   function handleTakeAction(alert) {
//     setOpen(false);
//     if (alert.AlertType === 'LOW_PRICE' || alert.AlertType === 'HIGH_PRICE') {
//       // Hand off to the parent (App.jsx) — it knows how to switch to the
//       // Intelligence view and scroll/highlight a specific SKU row.
//       onTakeAction?.(alert);
//     }
//     // OOS / NO_LISTING: no destination yet — Dismiss is the only action.
//   }

//   const count = alerts.length;

//   return (
//     <div className="relative" ref={panelRef}>
//       <button
//         onClick={() => setOpen(v => !v)}
//         className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors
//           ${open ? 'bg-slate-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
//         aria-label="Alerts"
//       >
//         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
//             d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
//         </svg>
//         {count > 0 && (
//           <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1
//             rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
//             {count > 99 ? '99+' : count}
//           </span>
//         )}
//       </button>

//       {open && (
//         <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1.5rem)]
//           bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col max-h-[70vh]">
//           <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
//             <p className="text-sm font-semibold text-white">Alerts</p>
//             <p className="text-xs text-slate-500">{count} active</p>
//           </div>

//           <div className="overflow-y-auto flex-1">
//             {loading && alerts.length === 0 ? (
//               <p className="px-4 py-6 text-xs text-slate-500 text-center">Loading…</p>
//             ) : count === 0 ? (
//               <p className="px-4 py-6 text-xs text-slate-500 text-center">Nothing needs attention right now.</p>
//             ) : (
//               alerts.map(alert => {
//                 const meta = ALERT_META[alert.AlertType] || {};
//                 const detail = describeAlert(alert);
//                 const canAct = alert.AlertType === 'LOW_PRICE' || alert.AlertType === 'HIGH_PRICE';

//                 return (
//                   <div key={alert.Id} className="px-4 py-3 border-b border-slate-800/70 last:border-b-0">
//                     <div className="flex items-start gap-2">
//                       <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
//                       <div className="min-w-0 flex-1">
//                         <div className="flex items-center justify-between gap-2">
//                           <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
//                           <span className="text-[10px] text-slate-600 flex-shrink-0">{timeAgo(alert.LastTriggeredAt)}</span>
//                         </div>
//                         <p className="text-sm text-slate-200 font-mono mt-0.5 truncate" title={alert.Title || alert.SKU_ID}>
//                           {alert.SKU_ID}
//                         </p>
//                         {alert.Title && (
//                           <p className="text-xs text-slate-500 truncate">{alert.Title}</p>
//                         )}
//                         {detail && (
//                           <p className="text-xs text-slate-400 mt-1">{detail}</p>
//                         )}

//                         <div className="flex items-center gap-3 mt-2">
//                           {canAct && (
//                             <button
//                               onClick={() => handleTakeAction(alert)}
//                               className="text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
//                             >
//                               Take Action →
//                             </button>
//                           )}
//                           <button
//                             onClick={() => handleDismiss(alert.Id)}
//                             disabled={dismissingId === alert.Id}
//                             className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors"
//                           >
//                             {dismissingId === alert.Id ? 'Dismissing…' : 'Dismiss'}
//                           </button>
//                         </div>
//                       </div>
//                     </div>
//                   </div>
//                 );
//               })
//             )}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }