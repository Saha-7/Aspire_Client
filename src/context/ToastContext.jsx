// src/context/ToastContext.jsx
// ─────────────────────────────────────────────────────────────
// App-wide toast notifications (top-right, no extra dependency).
// Wrap the app once (see App.jsx) and call useToast() from anywhere.
//
//   const { showToast, dismissToast } = useToast();
//   showToast('Saved', 'success');                          // old style still works
//   const id = showToast({ type: 'error', title: 'Save failed',
//                          message: 'Network error', duration: 2000 });
//   showToast({ type: 'info', title: 'Tip', message: '…', duration: 0 }); // 0 = sticky
//   dismissToast(id);
//
// Types: success | error | info | warning.
// Timed toasts show a shrinking progress bar, pause while hovered, and slide
// out when they close. Sticky toasts (duration 0) stay until dismissed.
// ─────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

let idCounter = 0;
const MAX_VISIBLE = 4;
const LEAVE_MS = 180;

const TYPES = {
  success: {
    title: "Success",
    bar: "bg-emerald-500",
    icon: "text-emerald-400 bg-emerald-500/10",
    path: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    duration: 3500,
  },
  error: {
    title: "Error",
    bar: "bg-red-500",
    icon: "text-red-400 bg-red-500/10",
    path: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    duration: 6000,
  },
  info: {
    title: "Info",
    bar: "bg-sky-500",
    icon: "text-sky-400 bg-sky-500/10",
    path: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z",
    duration: 6000,
  },
  warning: {
    title: "Warning",
    bar: "bg-amber-500",
    icon: "text-amber-400 bg-amber-500/10",
    path: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    duration: 7000,
  },
};

function ToastItem({ toast, onDismiss }) {
  const style = TYPES[toast.type];
  const sticky = !toast.duration;
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const remaining = useRef(toast.duration);
  const startedAt = useRef(0);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(toast.id), LEAVE_MS);
  }, [onDismiss, toast.id]);

  const arm = useCallback(() => {
    if (sticky) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(close, Math.max(remaining.current, 0));
  }, [sticky, close]);

  useEffect(() => {
    arm();
    return () => clearTimeout(timer.current);
  }, [arm]);

  function pause() {
    if (sticky || leaving) return;
    clearTimeout(timer.current);
    remaining.current -= Date.now() - startedAt.current;
    setPaused(true);
  }

  function resume() {
    if (sticky || leaving) return;
    setPaused(false);
    arm();
  }

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={`${leaving ? "toast-leave" : "toast-enter"} pointer-events-auto relative flex items-start gap-3 overflow-hidden
        rounded-xl border border-slate-700/70 bg-slate-900 py-3.5 pl-5 pr-3 shadow-2xl shadow-black/40`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} />
      <span className={`toast-icon mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${style.icon}`}>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d={style.path} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400 break-words">{toast.message}</p>
        )}
      </div>
      <button
        onClick={close}
        aria-label="Dismiss notification"
        className="flex-shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {!sticky && (
        <span
          className={`toast-progress absolute inset-x-0 bottom-0 h-0.5 origin-left opacity-70 ${style.bar}`}
          style={{ animationDuration: `${toast.duration}ms`, animationPlayState: paused ? "paused" : "running" }}
        />
      )}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((arg, type = "success", duration) => {
    const opts = arg && typeof arg === "object" ? arg : { message: arg, type, duration };
    const kind = TYPES[opts.type] ? opts.type : "success";
    const id = ++idCounter;
    const toast = {
      id,
      type: kind,
      title: opts.title || TYPES[kind].title,
      message: opts.message || "",
      duration: opts.duration ?? TYPES[kind].duration,   // 0 = sticky
    };
    setToasts((prev) => {
      let next = [...prev, toast];
      if (next.length > MAX_VISIBLE) {
        // drop the oldest timed toast first so a sticky tip is not pushed out
        const idx = next.findIndex((t) => t.duration > 0 && t.id !== id);
        next = next.filter((_, i) => i !== (idx === -1 ? 0 : idx));
      }
      return next;
    });
    return id;
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast: dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-20 z-[100] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-3">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}