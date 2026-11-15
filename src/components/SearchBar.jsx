// src/components/SearchBar.jsx
import { useState, useEffect, useRef } from 'react';

// Auto-search fires this long after the user stops typing.
const DEBOUNCE_MS = 800;
// Don't auto-search for 1 character (too broad). Enter / icon still search any length.
const MIN_CHARS = 2;

export default function SearchBar({ onSearch, value }) {
  const [inputVal, setInputVal] = useState(value || '');
  const timerRef = useRef(null);
  const lastSentRef = useRef((value || '').trim());
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Clear any pending timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // If the parent changes the value (e.g. "Clear filters"), mirror it here.
  // Our own submits set lastSentRef first, so they are skipped.
  useEffect(() => {
    const v = (value || '').trim();
    if (v === lastSentRef.current) return;
    clearTimeout(timerRef.current);
    lastSentRef.current = v;
    setInputVal(value || '');
  }, [value]);

  function submit(term) {
    clearTimeout(timerRef.current);
    if (term === lastSentRef.current) return; // nothing new to search
    lastSentRef.current = term;
    onSearchRef.current(term);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') submit(inputVal.trim());
  }

  function handleClick() {
    submit(inputVal.trim());
  }

  function handleChange(e) {
    const val = e.target.value;
    setInputVal(val);
    clearTimeout(timerRef.current);

    const term = val.trim();
    if (term === '') {
      submit(''); // clear instantly when emptied
      return;
    }
    if (term.length >= MIN_CHARS) {
      timerRef.current = setTimeout(() => submit(term), DEBOUNCE_MS);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-1 max-w-sm">
      <div className="relative flex-1">
        <input
          type="text"
          value={inputVal}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search by SKU..."
          className="
            w-full pl-3 pr-10 py-1.5
            text-xs text-slate-200 placeholder-slate-500
            bg-slate-800 border border-slate-700
            rounded-lg outline-none
            focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40
            transition-colors
          "
        />
        {/* Clear button */}
        {inputVal && (
          <button
            onClick={() => { setInputVal(''); submit(''); }}
            className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {/* Search icon / button */}
        <button
          onClick={handleClick}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-violet-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}