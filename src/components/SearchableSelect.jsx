// src/components/SearchableSelect.jsx
// ─────────────────────────────────────────────────────────────
// Drop-in replacement for a native <select> that adds a search box.
// Used by CategoryFilter and BrandFilter (and the Insights filter bar).
//
//  • Click the button → panel opens with a search input (auto-focused)
//  • Type to filter the list (case-insensitive "contains")
//  • ↑ / ↓ to move, Enter to pick, Esc to close, click outside to close
//  • First row is always the "All …" option (value "")
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchableSelect({
  options,                       // string[]
  value,                         // '' means "All"
  onChange,                      // (string) => void
  allLabel = 'All',              // label of the "no filter" row
  searchPlaceholder = 'Search...',
  showFilterIcon = false,
  className = '',
}) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [active, setActive]   = useState(0);   // highlighted row index
  const rootRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  // Keep the selected value in the list even if the current data has no rows
  // for it (e.g. after switching tabs) so the button never shows a stale label.
  const allOptions = useMemo(() => {
    const set = new Set(options);
    if (value && !set.has(value)) set.add(value);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [options, value]);

  // Rows shown in the panel: "All" row + options matching the query.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? allOptions.filter((o) => o.toLowerCase().includes(q)) : allOptions;
    return q ? matches.map((o) => ({ value: o, label: o }))
             : [{ value: '', label: allLabel }, ...matches.map((o) => ({ value: o, label: o }))];
  }, [allOptions, query, allLabel]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // On open: reset query, highlight the current value, focus the search box.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = value ? allOptions.indexOf(value) + 1 : 0; // +1 for the "All" row
    setActive(Math.max(0, idx));
    requestAnimationFrame(() => inputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Typing → highlight the first match.
  useEffect(() => { setActive(0); }, [query]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(v) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[active]) pick(rows[active].value); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 pl-2 pr-2 py-1.5 min-w-[9rem] max-w-[14rem]
          text-xs text-slate-200 bg-slate-800 border rounded-lg outline-none cursor-pointer
          transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40
          ${open ? 'border-violet-500' : 'border-slate-700'}`}
      >
        {showFilterIcon && (
          <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
        )}
        <span className="truncate flex-1 text-left">{value || allLabel}</span>
        <svg className="w-3 h-3 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-slate-700
          bg-slate-900 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-800">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500
                bg-slate-800 border border-slate-700 rounded-md outline-none
                focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {rows.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500">No matches</li>
            ) : rows.map((r, i) => (
              <li
                key={r.value || '__all__'}
                role="option"
                aria-selected={r.value === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(r.value); }}
                className={`px-3 py-1.5 text-xs cursor-pointer truncate
                  ${i === active ? 'bg-violet-600/30 text-white' : 'text-slate-300'}
                  ${r.value === value ? 'font-semibold text-violet-300' : ''}`}
              >
                {r.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}















































// // src/components/SearchableSelect.jsx
// // ─────────────────────────────────────────────────────────────
// // Drop-in replacement for a native <select> that adds a search box.
// // Used by CategoryFilter and BrandFilter (and the Insights filter bar).
// //
// //  • Click the button → panel opens with a search input (auto-focused)
// //  • Type to filter the list (case-insensitive "contains")
// //  • ↑ / ↓ to move, Enter to pick, Esc to close, click outside to close
// //  • First row is always the "All …" option (value "")
// // ─────────────────────────────────────────────────────────────
// import { useEffect, useMemo, useRef, useState } from 'react';

// export default function SearchableSelect({
//   options,                       // string[]
//   value,                         // '' means "All"
//   onChange,                      // (string) => void
//   allLabel = 'All',              // label of the "no filter" row
//   searchPlaceholder = 'Search...',
//   showFilterIcon = false,
//   className = '',
// }) {
//   const [open, setOpen]       = useState(false);
//   const [query, setQuery]     = useState('');
//   const [active, setActive]   = useState(0);   // highlighted row index
//   const rootRef  = useRef(null);
//   const inputRef = useRef(null);
//   const listRef  = useRef(null);

//   // Keep the selected value in the list even if the current data has no rows
//   // for it (e.g. after switching tabs) so the button never shows a stale label.
//   const allOptions = useMemo(() => {
//     const set = new Set(options);
//     if (value && !set.has(value)) set.add(value);
//     return [...set].sort((a, b) => a.localeCompare(b));
//   }, [options, value]);

//   // Rows shown in the panel: "All" row + options matching the query.
//   const rows = useMemo(() => {
//     const q = query.trim().toLowerCase();
//     const matches = q ? allOptions.filter((o) => o.toLowerCase().includes(q)) : allOptions;
//     return q ? matches.map((o) => ({ value: o, label: o }))
//              : [{ value: '', label: allLabel }, ...matches.map((o) => ({ value: o, label: o }))];
//   }, [allOptions, query, allLabel]);

//   // Close on outside click.
//   useEffect(() => {
//     if (!open) return;
//     function onDown(e) {
//       if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
//     }
//     document.addEventListener('mousedown', onDown);
//     return () => document.removeEventListener('mousedown', onDown);
//   }, [open]);

//   // On open: reset query, highlight the current value, focus the search box.
//   useEffect(() => {
//     if (!open) return;
//     setQuery('');
//     const idx = value ? allOptions.indexOf(value) + 1 : 0; // +1 for the "All" row
//     setActive(Math.max(0, idx));
//     requestAnimationFrame(() => inputRef.current?.focus());
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [open]);

//   // Typing → highlight the first match.
//   useEffect(() => { setActive(0); }, [query]);

//   // Keep the highlighted row scrolled into view.
//   useEffect(() => {
//     if (!open) return;
//     listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
//   }, [active, open]);

//   function pick(v) {
//     onChange(v);
//     setOpen(false);
//   }

//   function onKeyDown(e) {
//     if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)); }
//     else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
//     else if (e.key === 'Enter') { e.preventDefault(); if (rows[active]) pick(rows[active].value); }
//     else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
//   }

//   return (
//     <div ref={rootRef} className={`relative ${className}`}>
//       <button
//         type="button"
//         onClick={() => setOpen((o) => !o)}
//         aria-haspopup="listbox"
//         aria-expanded={open}
//         className={`flex items-center gap-2 pl-2 pr-2 py-1.5 min-w-[9rem] max-w-[14rem]
//           text-xs text-slate-200 bg-slate-800 border rounded-lg outline-none cursor-pointer
//           transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40
//           ${open ? 'border-violet-500' : 'border-slate-700'}`}
//       >
//         {showFilterIcon && (
//           <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
//               d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
//           </svg>
//         )}
//         <span className="truncate flex-1 text-left">{value || allLabel}</span>
//         <svg className="w-3 h-3 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
//         </svg>
//       </button>

//       {open && (
//         <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-slate-700
//           bg-slate-900 shadow-2xl overflow-hidden">
//           <div className="p-2 border-b border-slate-800">
//             <input
//               ref={inputRef}
//               type="text"
//               value={query}
//               onChange={(e) => setQuery(e.target.value)}
//               onKeyDown={onKeyDown}
//               placeholder={searchPlaceholder}
//               className="w-full px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500
//                 bg-slate-800 border border-slate-700 rounded-md outline-none
//                 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40"
//             />
//           </div>
//           <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
//             {rows.length === 0 ? (
//               <li className="px-3 py-2 text-xs text-slate-500">No matches</li>
//             ) : rows.map((r, i) => (
//               <li
//                 key={r.value || '__all__'}
//                 role="option"
//                 aria-selected={r.value === value}
//                 onMouseEnter={() => setActive(i)}
//                 onMouseDown={(e) => { e.preventDefault(); pick(r.value); }}
//                 className={`px-3 py-1.5 text-xs cursor-pointer truncate
//                   ${i === active ? 'bg-violet-600/30 text-white' : 'text-slate-300'}
//                   ${r.value === value ? 'font-semibold text-violet-300' : ''}`}
//               >
//                 {r.label}
//               </li>
//             ))}
//           </ul>
//         </div>
//       )}
//     </div>
//   );
// }