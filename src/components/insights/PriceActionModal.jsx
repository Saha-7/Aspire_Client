// src/components/insights/PriceActionModal.jsx
// ─────────────────────────────────────────────────────────────
// Opens from the Price alerts tab's "Take action" link. Fetches the
// SKU's live pricing data directly rather than navigating to the
// Intelligence dashboard (which could come up empty for a SKU that
// fails one of that dashboard's display conditions).
//
// Footer is a 3-column grid: Cancel | Push | Modify & Push, all equal
// width, evenly spaced. TakeActionCell's layout="row" mode fills the
// Push/Modify&Push half of that grid (2 of the 3 columns).
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { fetchTakeActionContext, updatePP } from "../../services/api";
import TakeActionCell from "../TakeActionCell";
import { formatINR } from "./alertFormatters";

// Strips the "- Default Title" suffix Shopify tacks onto single-variant
// products — noise for a modal that already shows SKU + Category up top.
function cleanTitle(title) {
  if (!title) return "";
  return title.replace(/\s*-\s*Default Title\s*$/i, "").trim();
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

export default function PriceActionModal({ skuId, category: fallbackCategory, onClose, onPushed }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [ppEditing, setPpEditing] = useState(false);
  const [ppInput, setPpInput] = useState("");
  const [ppSaving, setPpSaving] = useState(false);
  const [ppError, setPpError] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTakeActionContext(skuId);
      setContext(data);
    } catch (err) {
      setError("Couldn't load this product's pricing data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuId]);

  async function submitPP() {
    const val = parseFloat(ppInput);
    if (isNaN(val) || val <= 0) {
      setPpError("Enter a valid number");
      return;
    }
    setPpSaving(true);
    setPpError("");
    try {
      await updatePP(skuId, val);
      setPpEditing(false);
      setPpInput("");
      await load(); // re-fetch — PP is now set, so recommendedSP appears too
    } catch (err) {
      setPpError(err?.response?.data?.error || "Failed to save purchase price");
    } finally {
      setPpSaving(false);
    }
  }

  function handlePushed(pushedSkuId, result) {
    onPushed?.(pushedSkuId, result);
    load(); // refresh Current SP in the modal to reflect the push
  }

  const canAct = context?.recommendedSP != null;
  const breakdown = context?.pricingBreakdown;
  const breakdownTooltip = breakdown
    ? `${breakdown.gstPct}% GST + ${breakdown.costOfBusinessPct}% COB + ${breakdown.profitMarginPct}% Profit inclusive`
    : undefined;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="relative bg-slate-800/95 border border-slate-700 rounded-2xl p-7 w-[560px] max-w-full shadow-2xl">
        {/* Close button — absolutely positioned so the header text can be centered */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-xl leading-none cursor-pointer"
          aria-label="Close"
        >
          ×
        </button>

        {/* Centered header */}
        <div className="text-center mb-6">
          <h3 className="text-slate-100 font-semibold text-lg font-mono tracking-wide">
            {skuId}
            {(context?.category || fallbackCategory) && (
              <span className="text-slate-400 font-normal"> — {context?.category || fallbackCategory}</span>
            )}
          </h3>
          {context?.title && (
            <p className="text-sm text-slate-400 mt-1 px-4">{cleanTitle(context.title)}</p>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400 py-8 text-center">{error}</p>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {/* Purchase Price — the only editable field */}
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-slate-400">Purchase Price</span>
                {ppEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      autoFocus
                      value={ppInput}
                      onChange={(e) => setPpInput(e.target.value)}
                      placeholder="Enter PP"
                      className="w-28 px-2.5 py-1.5 text-sm rounded-md bg-slate-900 border border-slate-600 text-slate-200 cursor-text"
                    />
                    <button
                      onClick={submitPP}
                      disabled={ppSaving}
                      className="px-3 py-1.5 text-sm rounded-md bg-teal-700/80 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
                    >
                      {ppSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => { setPpEditing(false); setPpInput(""); setPpError(""); }}
                      className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">

                    <span
  className={`text-base ${
    context.pp != null
      ? "text-slate-100 font-medium"
      : "text-red-500 font-extrabold"
  }`}
>
  {context.pp != null ? `₹${context.pp.toLocaleString()}` : "Not set"}
</span>

                    {/* <span className="text-base font-extrabold text-red-500">
                      {context.pp != null ? `₹${context.pp.toLocaleString()}` : "Not set"}
                    </span> */}
                    <button
                      onClick={() => { setPpEditing(true); setPpInput(context.pp ?? ""); }}
                      className="text-slate-400 hover:text-teal-400 transition-colors cursor-pointer"
                      title="Edit purchase price"
                      aria-label="Edit purchase price"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              {ppError && <p className="text-xs text-red-400 text-right -mt-3">{ppError}</p>}

              <div className="border-t border-slate-700/60" />

              {/* Recommended SP — GST/COB/margin breakdown shows on hover, not permanently */}
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-slate-400">Recommended Selling Price</span>

                {/* <span
                  className={`text-lg text-red-500 font-semibold ${breakdownTooltip ? "cursor-help" : ""}`}
                  title={breakdownTooltip}
                >
                  {context.recommendedSP != null ? `₹${context.recommendedSP.toLocaleString()}` : "Set PP first"}
                </span> */}

                <span
  className={`text-lg ${
    context.recommendedSP != null
      ? "text-slate-100 font-semibold"
      : "text-red-500 font-extrabold"
  } ${breakdownTooltip ? "cursor-help" : ""}`}
  title={breakdownTooltip}
>
  {context.recommendedSP != null ? `₹${context.recommendedSP.toLocaleString()}` : "Set PP first"}
</span>

              </div>

              <div className="border-t border-slate-700/60" />

              {/* Current SP */}
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-slate-400">Current Selling Price</span>
                <span className="text-base text-slate-100 font-medium">
                  {context.sp != null ? `₹${context.sp.toLocaleString()}` : "Not Available"}
                </span>
              </div>

              <div className="border-t border-slate-700/60" />

              {/* Lowest competitor price — store name shows once the backend
                  route (TOP 1 ORDER BY CompetitorPrice) is deployed */}
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-slate-400">Lowest Competitor Price</span>
                <div className="text-right">
                  <span className="text-base text-slate-100 font-medium">
                    {context.lowestCompetitorPrice != null
                      ? `₹${context.lowestCompetitorPrice.toLocaleString()}`
                      : "No data"}
                  </span>
                  {context.lowestCompetitorPrice != null && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {context.lowestCompetitorStore && <>{context.lowestCompetitorStore} · </>}
                      Last updated {timeAgo(context.competitorPriceAsOf)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer — Cancel | Push | Modify & Push, all equal width, evenly spaced */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-700 items-start">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <TakeActionCell
                skuId={skuId}
                recommendedSP={context.recommendedSP}
                onPushed={handlePushed}
                disabled={!canAct}
                layout="row"
              />
            </div>
            {!canAct && (
              <p className="text-xs text-slate-500 text-center mt-2">
                Set a purchase price to enable pricing actions
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}






































// // src/components/insights/PriceActionModal.jsx
// // ─────────────────────────────────────────────────────────────
// // Opens from the Price alerts tab's "Take action" link. Fetches the
// // SKU's live pricing data directly rather than navigating to the
// // Intelligence dashboard (which could come up empty for a SKU that
// // fails one of that dashboard's display conditions).
// //
// // Push / Modify & Push are always visible, but disabled until a
// // recommended SP exists (i.e. until Purchase Price is set) — TakeActionCell
// // takes an optional `disabled` prop for exactly this.
// // ─────────────────────────────────────────────────────────────

// import { useEffect, useState } from "react";
// import { fetchTakeActionContext, updatePP } from "../../services/api";
// import TakeActionCell from "../TakeActionCell";

// // Strips the "- Default Title" suffix Shopify tacks onto single-variant
// // products — noise for a modal that already shows SKU + Category up top.
// function cleanTitle(title) {
//   if (!title) return "";
//   return title.replace(/\s*-\s*Default Title\s*$/i, "").trim();
// }

// function timeAgo(dateStr) {
//   const d = new Date(dateStr);
//   const diffMs = Date.now() - d.getTime();
//   const mins = Math.floor(diffMs / 60000);
//   if (mins < 1) return "just now";
//   if (mins < 60) return `${mins}m ago`;
//   const hrs = Math.floor(mins / 60);
//   if (hrs < 24) return `${hrs}h ago`;
//   const days = Math.floor(hrs / 24);
//   return `${days} days ago`;
// }

// export default function PriceActionModal({ skuId, category: fallbackCategory, onClose, onPushed }) {
//   const [context, setContext] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);

//   const [ppEditing, setPpEditing] = useState(false);
//   const [ppInput, setPpInput] = useState("");
//   const [ppSaving, setPpSaving] = useState(false);
//   const [ppError, setPpError] = useState("");

//   async function load() {
//     setLoading(true);
//     setError(null);
//     try {
//       const data = await fetchTakeActionContext(skuId);
//       setContext(data);
//     } catch (err) {
//       setError("Couldn't load this product's pricing data.");
//     } finally {
//       setLoading(false);
//     }
//   }

//   useEffect(() => {
//     load();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [skuId]);

//   async function submitPP() {
//     const val = parseFloat(ppInput);
//     if (isNaN(val) || val <= 0) {
//       setPpError("Enter a valid number");
//       return;
//     }
//     setPpSaving(true);
//     setPpError("");
//     try {
//       await updatePP(skuId, val);
//       setPpEditing(false);
//       setPpInput("");
//       await load(); // re-fetch — PP is now set, so recommendedSP appears too
//     } catch (err) {
//       setPpError(err?.response?.data?.error || "Failed to save purchase price");
//     } finally {
//       setPpSaving(false);
//     }
//   }

//   function handlePushed(pushedSkuId, result) {
//     onPushed?.(pushedSkuId, result);
//     load(); // refresh Current SP in the modal to reflect the push
//   }

//   const canAct = context?.recommendedSP != null;
//   const breakdown = context?.pricingBreakdown;

//   return (
//     <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//       <div className="relative bg-slate-800/95 border border-slate-700 rounded-2xl p-7 w-[560px] max-w-full shadow-2xl">
//         {/* Close button — absolutely positioned so the header text can be centered */}
//         <button
//           onClick={onClose}
//           className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-xl leading-none cursor-pointer"
//           aria-label="Close"
//         >
//           ×
//         </button>

//         {/* Centered header */}
//         <div className="text-center mb-6">
//           <h3 className="text-slate-100 font-semibold text-lg font-mono tracking-wide">
//             {skuId}
//             {(context?.category || fallbackCategory) && (
//               <span className="text-slate-400 font-normal"> || {context?.category || fallbackCategory}</span>
//             )}
//           </h3>
//           {context?.title && (
//             <p className="text-sm text-slate-400 mt-1 px-4">{cleanTitle(context.title)}</p>
//           )}
//         </div>

//         {loading ? (
//           <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
//         ) : error ? (
//           <p className="text-sm text-red-400 py-8 text-center">{error}</p>
//         ) : (
//           <>
//             <div className="space-y-4 mb-6">
//               {/* Purchase Price — the only editable field */}
//               <div className="flex items-center justify-between py-1">
//                 <span className="text-sm text-slate-400">Purchase Price</span>
//                 {ppEditing ? (
//                   <div className="flex items-center gap-2">
//                     <input
//                       type="number"
//                       autoFocus
//                       value={ppInput}
//                       onChange={(e) => setPpInput(e.target.value)}
//                       placeholder="Enter PP"
//                       className="w-28 px-2.5 py-1.5 text-sm rounded-md bg-slate-900 border border-slate-600 text-slate-200 cursor-text"
//                     />
//                     <button
//                       onClick={submitPP}
//                       disabled={ppSaving}
//                       className="px-3 py-1.5 text-sm rounded-md bg-teal-700/80 hover:bg-teal-700 disabled:opacity-50 text-white cursor-pointer"
//                     >
//                       {ppSaving ? "Saving…" : "Save"}
//                     </button>
//                     <button
//                       onClick={() => { setPpEditing(false); setPpInput(""); setPpError(""); }}
//                       className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer"
//                     >
//                       Cancel
//                     </button>
//                   </div>
//                 ) : (
//                   <div className="flex items-center gap-2.5">
//                     <span className="text-base text-slate-100 font-medium">
//                       {context.pp != null ? `₹${context.pp.toLocaleString()}` : "Not set"}
//                     </span>
//                     <button
//                       onClick={() => { setPpEditing(true); setPpInput(context.pp ?? ""); }}
//                       className="text-slate-400 hover:text-teal-400 transition-colors cursor-pointer"
//                       title="Edit purchase price"
//                       aria-label="Edit purchase price"
//                     >
//                       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                         <path strokeLinecap="round" strokeLinejoin="round"
//                           d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
//                       </svg>
//                     </button>
//                   </div>
//                 )}
//               </div>
//               {ppError && <p className="text-xs text-red-400 text-right -mt-3">{ppError}</p>}

//               <div className="border-t border-slate-700/60" />

//               {/* Recommended SP + the GST/COB/margin breakdown that produced it */}
//               <div className="py-1">
//                 <div className="flex items-center justify-between">
//                   <span className="text-sm text-slate-400">Recommended Selling Price</span>
//                   <span className="text-lg text-slate-100 font-semibold">
//                     {context.recommendedSP != null ? `₹${context.recommendedSP.toLocaleString()}` : "Set PP first"}
//                   </span>
//                 </div>
//                 {breakdown && (
//                   <p className="text-xs text-slate-500 text-right mt-0.5">
//                     {breakdown.gstPct}% GST + {breakdown.costOfBusinessPct}% COB + {breakdown.profitMarginPct}% margin
//                   </p>
//                 )}
//               </div>

//               <div className="border-t border-slate-700/60" />

//               {/* Current SP */}
//               <div className="flex items-center justify-between py-1">
//                 <span className="text-sm text-slate-400">Current Selling Price</span>
//                 <span className="text-base text-slate-100 font-medium">
//                   {context.sp != null ? `₹${context.sp.toLocaleString()}` : "Not Available"}
//                 </span>
//               </div>

//               <div className="border-t border-slate-700/60" />

//               {/* Lowest competitor price */}
//               <div className="flex items-center justify-between py-1">
//                 <span className="text-sm text-slate-400">Lowest Competitor Price</span>
//                 <div className="text-right">
//                   <span className="text-base text-slate-100 font-medium">
//                     {context.lowestCompetitorPrice != null
//                       ? `₹${context.lowestCompetitorPrice.toLocaleString()}`
//                       : "No data"}
//                   </span>
//                   {context.lowestCompetitorPrice != null && (
//                     <p className="text-xs text-slate-500 mt-0.5">
//                       {context.lowestCompetitorStore && <>{context.lowestCompetitorStore} · </>}
//                       Last updated {timeAgo(context.competitorPriceAsOf)}
//                     </p>
//                   )}
//                 </div>
//               </div>
//             </div>

//             <div className="flex items-center justify-between pt-4 border-t border-slate-700">
//               <button
//                 onClick={onClose}
//                 className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer"
//               >
//                 Cancel
//               </button>
//               <div className="flex flex-row items-end gap-1">
//                 <TakeActionCell
//                   skuId={skuId}
//                   recommendedSP={context.recommendedSP}
//                   onPushed={handlePushed}
//                   disabled={!canAct}
//                 />
//                 {!canAct && (
//                   <span className="text-xs text-slate-500">Set a purchase price to enable pricing actions</span>
//                 )}
//               </div>
//             </div>
//           </>
//         )}
//       </div>
//     </div>
//   );
// }


































// // src/components/insights/PriceActionModal.jsx
// // ─────────────────────────────────────────────────────────────
// // Opens from the Price alerts tab's "Take action" link. Unlike the old
// // behavior (navigate to Intelligence dashboard + search SKU — which
// // could come up empty if the product failed one of that dashboard's
// // display conditions), this fetches the SKU's data directly and lets
// // the sales person act on it right here, whether or not it would show
// // up on the Intelligence table.
// //
// // Reuses TakeActionCell as-is for the actual Push / Modify & Push /
// // variance-confirm flow — no need to reimplement that here.
// // ─────────────────────────────────────────────────────────────

// import { useEffect, useState } from "react";
// import { fetchTakeActionContext, updatePP } from "../../services/api";
// import TakeActionCell from "../TakeActionCell";
// import { timeAgo } from "./alertFormatters";

// export default function PriceActionModal({ skuId, category: fallbackCategory, onClose, onPushed }) {
//   const [context, setContext] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);

//   const [ppEditing, setPpEditing] = useState(false);
//   const [ppInput, setPpInput] = useState("");
//   const [ppSaving, setPpSaving] = useState(false);
//   const [ppError, setPpError] = useState("");

//   async function load() {
//     setLoading(true);
//     setError(null);
//     try {
//       const data = await fetchTakeActionContext(skuId);
//       setContext(data);
//     } catch (err) {
//       setError("Couldn't load this product's pricing data.");
//     } finally {
//       setLoading(false);
//     }
//   }

//   useEffect(() => {
//     load();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [skuId]);

//   async function submitPP() {
//     const val = parseFloat(ppInput);
//     if (isNaN(val) || val <= 0) {
//       setPpError("Enter a valid number");
//       return;
//     }
//     setPpSaving(true);
//     setPpError("");
//     try {
//       await updatePP(skuId, val);
//       setPpEditing(false);
//       setPpInput("");
//       await load(); // re-fetch — PP is now set, so recommendedSP appears too
//     } catch (err) {
//       setPpError(err?.response?.data?.error || "Failed to save purchase price");
//     } finally {
//       setPpSaving(false);
//     }
//   }

//   function handlePushed(pushedSkuId, result) {
//     onPushed?.(pushedSkuId, result);
//     load(); // refresh Current SP in the modal to reflect the push
//   }

//   return (
//     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
//       <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-[440px] max-w-[calc(100vw-2rem)] shadow-2xl">
//         <div className="flex items-start justify-between mb-4">
//           <div>
//             <h3 className="text-slate-100 font-semibold text-base font-mono">
//               {skuId}
//               {context?.category ? ` — ${context.category}` : fallbackCategory ? ` — ${fallbackCategory}` : ""}
//             </h3>
//             {context?.title && <p className="text-xs text-slate-500 mt-0.5">{context.title}</p>}
//           </div>
//           <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">
//             ×
//           </button>
//         </div>

//         {loading ? (
//           <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>
//         ) : error ? (
//           <p className="text-sm text-red-400 py-6 text-center">{error}</p>
//         ) : (
//           <>
//             <div className="space-y-3 mb-5">
//               {/* Purchase Price — the only editable field */}
//               <div className="flex items-center justify-between">
//                 <span className="text-xs text-slate-400">Purchase Price</span>
//                 {ppEditing ? (
//                   <div className="flex items-center gap-1.5">
//                     <input
//                       type="number"
//                       autoFocus
//                       value={ppInput}
//                       onChange={(e) => setPpInput(e.target.value)}
//                       placeholder="Enter PP"
//                       className="w-24 px-2 py-1 text-xs rounded bg-slate-900 border border-slate-600 text-slate-200"
//                     />
//                     <button
//                       onClick={submitPP}
//                       disabled={ppSaving}
//                       className="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
//                     >
//                       {ppSaving ? "Saving…" : "Save"}
//                     </button>
//                     <button
//                       onClick={() => { setPpEditing(false); setPpInput(""); setPpError(""); }}
//                       className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
//                     >
//                       Cancel
//                     </button>
//                   </div>
//                 ) : (
//                   <div className="flex items-center gap-2">
//                     <span className="text-sm text-slate-100 font-medium">
//                       {context.pp != null ? `₹${context.pp.toLocaleString()}` : "Not set"}
//                     </span>
//                     <button
//                       onClick={() => { setPpEditing(true); setPpInput(context.pp ?? ""); }}
//                       className="text-xs text-violet-400 hover:text-violet-300"
//                     >
//                       Edit
//                     </button>
//                   </div>
//                 )}
//               </div>
//               {ppError && <p className="text-[11px] text-red-400 text-right -mt-2">{ppError}</p>}

//               {/* Recommended SP — only meaningful once PP is known */}
//               <div className="flex items-center justify-between">
//                 <span className="text-xs text-slate-400">Recommended Selling Price</span>
//                 <span className="text-sm text-slate-100 font-medium">
//                   {context.recommendedSP != null ? `₹${context.recommendedSP.toLocaleString()}` : "— set PP first"}
//                 </span>
//               </div>

//               {/* Current SP */}
//               <div className="flex items-center justify-between">
//                 <span className="text-xs text-slate-400">Current Selling Price</span>
//                 <span className="text-sm text-slate-100 font-medium">
//                   {context.sp != null ? `₹${context.sp.toLocaleString()}` : "Not set"}
//                 </span>
//               </div>

//               {/* Lowest competitor price */}
//               <div className="flex items-center justify-between">
//                 <span className="text-xs text-slate-400">Lowest Competitor Price</span>
//                 <span className="text-sm text-slate-100 font-medium text-right">
//                   {context.lowestCompetitorPrice != null ? (
//                     <>
//                       ₹{context.lowestCompetitorPrice.toLocaleString()}
//                       {context.competitorPriceAsOf && (
//                         <span className="block text-[10px] text-slate-500 font-normal">
//                           as of {timeAgo(context.competitorPriceAsOf)}
//                         </span>
//                       )}
//                     </>
//                   ) : (
//                     "No data"
//                   )}
//                 </span>
//               </div>
//             </div>

//             <div className="flex items-center justify-between pt-3 border-t border-slate-700">
//               <button
//                 onClick={onClose}
//                 className="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
//               >
//                 Cancel
//               </button>
//               {context.recommendedSP != null ? (
//                 <TakeActionCell skuId={skuId} recommendedSP={context.recommendedSP} onPushed={handlePushed} />
//               ) : (
//                 <span className="text-xs text-slate-500">Enter a purchase price to enable pricing actions</span>
//               )}
//             </div>
//           </>
//         )}
//       </div>
//     </div>
//   );
// }