// src/components/CategoryFilter.jsx

export default function CategoryFilter({ categories, value, onChange }) {
  return (
    <div className="relative flex items-center gap-2">
      <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="
          pl-2 pr-7 py-1.5
          text-xs text-slate-200
          bg-slate-800 border border-slate-700
          rounded-lg outline-none appearance-none cursor-pointer
          focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40
          transition-colors
        "
      >
        <option value="">All Categories</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>
      {/* Custom dropdown arrow */}
      <svg className="w-3 h-3 text-slate-500 absolute right-2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}