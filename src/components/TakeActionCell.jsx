// src/components/TakeActionCell.jsx
import { useState } from 'react';
import { pushToShopify } from '../services/api';
import { usePushLock } from '../context/PushLockContext';
import { useToast } from '../context/ToastContext';

const STATUS = {
  IDLE: 'idle',
  EDITING: 'editing',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
};

// layout: 'column' (default — unchanged, used in table cells) | 'row'
// (buttons side by side, sized to fill their container — used in
// PriceActionModal's 3-column footer grid).
export default function TakeActionCell({ skuId, recommendedSP, onPushed, disabled = false, layout = 'column' }) {
  const { activeSkuId, acquireLock, releaseLock } = usePushLock();
  const { showToast } = useToast();
  const [status, setStatus] = useState(STATUS.IDLE);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [varianceModal, setVarianceModal] = useState(null); // { sp, isManual, systemSP, percent }
  const [confirmLoading, setConfirmLoading] = useState(false); // loading state while modal's own request is in flight

  async function doPush(sp, isManual, confirmVariance = false) {
    if (!skuId || sp == null || isNaN(parseFloat(sp))) {
      setStatus(STATUS.ERROR);
      setError('Missing price data — please refresh the page and try again');
      setTimeout(() => { setStatus(STATUS.IDLE); setError(''); }, 4000);
      return; // never let a bad call reach the network
    }

    // Guard: refuse to start if another row already owns the lock
    if (activeSkuId && activeSkuId !== skuId) return;

    acquireLock(skuId); // claim the lock for this row
    setStatus(STATUS.LOADING);
    setError('');
    if (varianceModal) setConfirmLoading(true);
    try {
      const result = await pushToShopify(skuId, sp, isManual, confirmVariance);
      setStatus(STATUS.SUCCESS);
      setVarianceModal(null);
      setConfirmLoading(false);
      releaseLock(skuId); // done — free the lock
      showToast(`Price updated at Shopify — ₹${sp} for ${skuId}`, 'success');
      if (onPushed) onPushed(skuId, result);
      setTimeout(() => setStatus(STATUS.IDLE), 3000);
    } catch (err) {
      const data = err?.response?.data;

      if (data?.error === 'variance_check_failed') {
        const percent = data.systemSP > 0
          ? (((sp - data.systemSP) / data.systemSP) * 100).toFixed(1)
          : null;
        setVarianceModal({ sp, isManual, systemSP: data.systemSP, percent });
        setConfirmLoading(false);
        setStatus(STATUS.IDLE);
        // NOTE: lock stays held here — the operation isn't finished,
        // it's just waiting on the confirmation modal
        return;
      }

      setConfirmLoading(false);
      setStatus(STATUS.ERROR);
      releaseLock(skuId); // free the lock on real failure
      const message = data?.error || err.message || 'Push failed';
      setError(message);
      showToast(`Failed to update price for ${skuId}`, 'error');
      setTimeout(() => { setStatus(STATUS.IDLE); setError(''); }, 4000);
    }
  }

  const isBusy = status === STATUS.LOADING;
  const isLockedByOther = activeSkuId != null && activeSkuId !== skuId;
  const controlsDisabled = isBusy || isLockedByOther || disabled;
  const isRow = layout === 'row';

  // ── Shared variance confirmation modal — identical in both layouts ──
  const varianceModalEl = varianceModal && (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 w-[380px] shadow-xl">
        <h3 className="text-slate-100 font-semibold text-base mb-2">Confirm Price Change</h3>
        <p className="text-slate-300 text-sm mb-4">
          {varianceModal.systemSP != null ? (
            <>
              New price for <span className="font-mono text-slate-100">{skuId}</span>:{' '}
              <span className="font-semibold text-slate-100">₹{varianceModal.sp}</span>
              <br />
              System recommends:{' '}
              <span className="font-semibold text-slate-100">₹{varianceModal.systemSP}</span>
              <br />
              That's{' '}
              <span className={varianceModal.percent >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                {varianceModal.percent >= 0 ? '+' : ''}{varianceModal.percent}%
              </span>{' '}
              {varianceModal.percent >= 0 ? 'higher' : 'lower'} than recommended. Are you sure?
            </>
          ) : (
            <>
              No system recommendation is saved yet for{' '}
              <span className="font-mono text-slate-100">{skuId}</span>.
              <br />
              You're about to push{' '}
              <span className="font-semibold text-slate-100">₹{varianceModal.sp}</span>. Please confirm this is correct.
            </>
          )}
        </p>
        <p className="text-amber-400 text-xs mb-5">
          Please double check this is intentional before continuing.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              if (!confirmLoading) {
                releaseLock(skuId); // release when user cancels the confirm modal
                setVarianceModal(null);
              }
            }}
            disabled={confirmLoading}
            className="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={() => doPush(varianceModal.sp, varianceModal.isManual, true)}
            disabled={confirmLoading}
            className="px-3 py-1.5 text-sm rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium flex items-center gap-2"
          >
            {confirmLoading && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {confirmLoading ? 'Pushing...' : 'Save & Continue'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── ROW layout: sized to sit next to a Cancel button in a grid ──────
  if (isRow) {
    return (
      <>
        {varianceModalEl}
        <div className="col-span-2 flex flex-col gap-1">
          {status === STATUS.EDITING ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="New SP"
                disabled={controlsDisabled}
                className="flex-1 min-w-0 px-3 py-2 text-sm rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-center disabled:opacity-50 disabled:cursor-not-allowed"
                autoFocus
              />
              <button
                onClick={() => {
                  const val = parseFloat(inputValue);
                  if (isNaN(val) || val <= 0) { setError('Enter a valid number'); return; }
                  doPush(val, true);
                }}
                disabled={controlsDisabled}
                className="px-4 py-2 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-1.5 whitespace-nowrap"
              >
                {isBusy && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {isBusy ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setStatus(STATUS.IDLE); setInputValue(''); setError(''); }}
                disabled={controlsDisabled}
                className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => doPush(recommendedSP, false)}
                disabled={controlsDisabled}
                className="flex-1 px-4 py-2 text-sm rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center gap-1.5"
              >
                {isBusy && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {isBusy ? 'Pushing...' : 'Push'}
              </button>
              <button
                onClick={() => setStatus(STATUS.EDITING)}
                disabled={controlsDisabled}
                className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
              >
                Modify &amp; Push
              </button>
            </div>
          )}
          {error && <span className="text-xs text-red-400 text-center">{error}</span>}
          {status === STATUS.SUCCESS && <span className="text-xs text-emerald-400 text-center">Pushed ✓</span>}
        </div>
      </>
    );
  }

  // ── COLUMN layout (default) — unchanged from before ─────────────────
  return (
    <>
      {varianceModalEl}

      {status === STATUS.EDITING ? (
        <div className="flex flex-col items-center gap-1.5">
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="New SP"
            disabled={controlsDisabled}
            className="w-24 px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-slate-200 text-center disabled:opacity-50 disabled:cursor-not-allowed"
            autoFocus
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                const val = parseFloat(inputValue);
                if (isNaN(val) || val <= 0) { setError('Enter a valid number'); return; }
                doPush(val, true);
              }}
              disabled={controlsDisabled}
              className="px-2 py-0.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-1.5"
            >
              {isBusy && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {isBusy ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setStatus(STATUS.IDLE); setInputValue(''); setError(''); }}
              disabled={controlsDisabled}
              className="px-2 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
            >
              Cancel
            </button>
          </div>
          {error && <span className="text-[10px] text-red-400">{error}</span>}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => doPush(recommendedSP, false)}
              disabled={controlsDisabled}
              className="px-2 py-1 text-xs rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center gap-1.5"
            >
              {isBusy && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {isBusy ? 'Pushing...' : 'Push'}
            </button>
            <button
              onClick={() => setStatus(STATUS.EDITING)}
              disabled={controlsDisabled}
              className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
            >
              Modify &amp; Push
            </button>
          </div>
          {status === STATUS.SUCCESS && <span className="text-[10px] text-emerald-400">Pushed ✓</span>}
          {status === STATUS.ERROR && <span className="text-[10px] text-red-400">{error}</span>}
        </div>
      )}
    </>
  );
}



































// // src/components/TakeActionCell.jsx
// import { useState } from 'react';
// import { pushToShopify } from '../services/api';
// import { usePushLock } from '../context/PushLockContext';

// const STATUS = {
//   IDLE: 'idle',
//   EDITING: 'editing',
//   LOADING: 'loading',
//   SUCCESS: 'success',
//   ERROR: 'error',
// };

// // layout: 'column' (default — unchanged, used in table cells) | 'row'
// // (buttons side by side, sized to fill their container — used in
// // PriceActionModal's 3-column footer grid).
// export default function TakeActionCell({ skuId, recommendedSP, onPushed, disabled = false, layout = 'column' }) {
//   const { activeSkuId, acquireLock, releaseLock } = usePushLock();
//   const [status, setStatus] = useState(STATUS.IDLE);
//   const [inputValue, setInputValue] = useState('');
//   const [error, setError] = useState('');
//   const [varianceModal, setVarianceModal] = useState(null); // { sp, isManual, systemSP, percent }
//   const [confirmLoading, setConfirmLoading] = useState(false); // loading state while modal's own request is in flight

//   async function doPush(sp, isManual, confirmVariance = false) {
//     if (!skuId || sp == null || isNaN(parseFloat(sp))) {
//       setStatus(STATUS.ERROR);
//       setError('Missing price data — please refresh the page and try again');
//       setTimeout(() => { setStatus(STATUS.IDLE); setError(''); }, 4000);
//       return; // never let a bad call reach the network
//     }

//     // Guard: refuse to start if another row already owns the lock
//     if (activeSkuId && activeSkuId !== skuId) return;

//     acquireLock(skuId); // claim the lock for this row
//     setStatus(STATUS.LOADING);
//     setError('');
//     if (varianceModal) setConfirmLoading(true);
//     try {
//       const result = await pushToShopify(skuId, sp, isManual, confirmVariance);
//       setStatus(STATUS.SUCCESS);
//       setVarianceModal(null);
//       setConfirmLoading(false);
//       releaseLock(skuId); // done — free the lock
//       if (onPushed) onPushed(skuId, result);
//       setTimeout(() => setStatus(STATUS.IDLE), 3000);
//     } catch (err) {
//       const data = err?.response?.data;

//       if (data?.error === 'variance_check_failed') {
//         const percent = data.systemSP > 0
//           ? (((sp - data.systemSP) / data.systemSP) * 100).toFixed(1)
//           : null;
//         setVarianceModal({ sp, isManual, systemSP: data.systemSP, percent });
//         setConfirmLoading(false);
//         setStatus(STATUS.IDLE);
//         // NOTE: lock stays held here — the operation isn't finished,
//         // it's just waiting on the confirmation modal
//         return;
//       }

//       setConfirmLoading(false);
//       setStatus(STATUS.ERROR);
//       releaseLock(skuId); // free the lock on real failure
//       setError(data?.error || err.message || 'Push failed');
//       setTimeout(() => { setStatus(STATUS.IDLE); setError(''); }, 4000);
//     }
//   }

//   const isBusy = status === STATUS.LOADING;
//   const isLockedByOther = activeSkuId != null && activeSkuId !== skuId;
//   const controlsDisabled = isBusy || isLockedByOther || disabled;
//   const isRow = layout === 'row';

//   // ── Shared variance confirmation modal — identical in both layouts ──
//   const varianceModalEl = varianceModal && (
//     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
//       <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 w-[380px] shadow-xl">
//         <h3 className="text-slate-100 font-semibold text-base mb-2">Confirm Price Change</h3>
//         <p className="text-slate-300 text-sm mb-4">
//           {varianceModal.systemSP != null ? (
//             <>
//               New price for <span className="font-mono text-slate-100">{skuId}</span>:{' '}
//               <span className="font-semibold text-slate-100">₹{varianceModal.sp}</span>
//               <br />
//               System recommends:{' '}
//               <span className="font-semibold text-slate-100">₹{varianceModal.systemSP}</span>
//               <br />
//               That's{' '}
//               <span className={varianceModal.percent >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
//                 {varianceModal.percent >= 0 ? '+' : ''}{varianceModal.percent}%
//               </span>{' '}
//               {varianceModal.percent >= 0 ? 'higher' : 'lower'} than recommended. Are you sure?
//             </>
//           ) : (
//             <>
//               No system recommendation is saved yet for{' '}
//               <span className="font-mono text-slate-100">{skuId}</span>.
//               <br />
//               You're about to push{' '}
//               <span className="font-semibold text-slate-100">₹{varianceModal.sp}</span>. Please confirm this is correct.
//             </>
//           )}
//         </p>
//         <p className="text-amber-400 text-xs mb-5">
//           Please double check this is intentional before continuing.
//         </p>
//         <div className="flex justify-end gap-2">
//           <button
//             onClick={() => {
//               if (!confirmLoading) {
//                 releaseLock(skuId); // release when user cancels the confirm modal
//                 setVarianceModal(null);
//               }
//             }}
//             disabled={confirmLoading}
//             className="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
//           >
//             Cancel
//           </button>
//           <button
//             onClick={() => doPush(varianceModal.sp, varianceModal.isManual, true)}
//             disabled={confirmLoading}
//             className="px-3 py-1.5 text-sm rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium flex items-center gap-2"
//           >
//             {confirmLoading && (
//               <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
//             )}
//             {confirmLoading ? 'Pushing...' : 'Save & Continue'}
//           </button>
//         </div>
//       </div>
//     </div>
//   );

//   // ── ROW layout: sized to sit next to a Cancel button in a grid ──────
//   if (isRow) {
//     return (
//       <>
//         {varianceModalEl}
//         <div className="col-span-2 flex flex-col gap-1">
//           {status === STATUS.EDITING ? (
//             <div className="flex items-center gap-2">
//               <input
//                 type="number"
//                 value={inputValue}
//                 onChange={(e) => setInputValue(e.target.value)}
//                 placeholder="New SP"
//                 disabled={controlsDisabled}
//                 className="flex-1 min-w-0 px-3 py-2 text-sm rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-center disabled:opacity-50 disabled:cursor-not-allowed"
//                 autoFocus
//               />
//               <button
//                 onClick={() => {
//                   const val = parseFloat(inputValue);
//                   if (isNaN(val) || val <= 0) { setError('Enter a valid number'); return; }
//                   doPush(val, true);
//                 }}
//                 disabled={controlsDisabled}
//                 className="px-4 py-2 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-1.5 whitespace-nowrap"
//               >
//                 {isBusy && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
//                 {isBusy ? 'Saving...' : 'Save'}
//               </button>
//               <button
//                 onClick={() => { setStatus(STATUS.IDLE); setInputValue(''); setError(''); }}
//                 disabled={controlsDisabled}
//                 className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 whitespace-nowrap"
//               >
//                 Cancel
//               </button>
//             </div>
//           ) : (
//             <div className="flex gap-3">
//               <button
//                 onClick={() => doPush(recommendedSP, false)}
//                 disabled={controlsDisabled}
//                 className="flex-1 px-4 py-2 text-sm rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center gap-1.5"
//               >
//                 {isBusy && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
//                 {isBusy ? 'Pushing...' : 'Push'}
//               </button>
//               <button
//                 onClick={() => setStatus(STATUS.EDITING)}
//                 disabled={controlsDisabled}
//                 className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
//               >
//                 Modify &amp; Push
//               </button>
//             </div>
//           )}
//           {error && <span className="text-xs text-red-400 text-center">{error}</span>}
//           {status === STATUS.SUCCESS && <span className="text-xs text-emerald-400 text-center">Pushed ✓</span>}
//         </div>
//       </>
//     );
//   }

//   // ── COLUMN layout (default) — unchanged from before ─────────────────
//   return (
//     <>
//       {varianceModalEl}

//       {status === STATUS.EDITING ? (
//         <div className="flex flex-col items-center gap-1.5">
//           <input
//             type="number"
//             value={inputValue}
//             onChange={(e) => setInputValue(e.target.value)}
//             placeholder="New SP"
//             disabled={controlsDisabled}
//             className="w-24 px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-slate-200 text-center disabled:opacity-50 disabled:cursor-not-allowed"
//             autoFocus
//           />
//           <div className="flex gap-1.5">
//             <button
//               onClick={() => {
//                 const val = parseFloat(inputValue);
//                 if (isNaN(val) || val <= 0) { setError('Enter a valid number'); return; }
//                 doPush(val, true);
//               }}
//               disabled={controlsDisabled}
//               className="px-2 py-0.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-1.5"
//             >
//               {isBusy && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
//               {isBusy ? 'Saving...' : 'Save'}
//             </button>
//             <button
//               onClick={() => { setStatus(STATUS.IDLE); setInputValue(''); setError(''); }}
//               disabled={controlsDisabled}
//               className="px-2 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
//             >
//               Cancel
//             </button>
//           </div>
//           {error && <span className="text-[10px] text-red-400">{error}</span>}
//         </div>
//       ) : (
//         <div className="flex flex-col items-center gap-1">
//           <div className="flex flex-col gap-1.5">
//             <button
//               onClick={() => doPush(recommendedSP, false)}
//               disabled={controlsDisabled}
//               className="px-2 py-1 text-xs rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center gap-1.5"
//             >
//               {isBusy && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
//               {isBusy ? 'Pushing...' : 'Push'}
//             </button>
//             <button
//               onClick={() => setStatus(STATUS.EDITING)}
//               disabled={controlsDisabled}
//               className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
//             >
//               Modify &amp; Push
//             </button>
//           </div>
//           {status === STATUS.SUCCESS && <span className="text-[10px] text-emerald-400">Pushed ✓</span>}
//           {status === STATUS.ERROR && <span className="text-[10px] text-red-400">{error}</span>}
//         </div>
//       )}
//     </>
//   );
// }