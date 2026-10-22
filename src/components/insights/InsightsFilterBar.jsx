// src/components/insights/InsightsFilterBar.jsx
import SearchableSelect from "../SearchableSelect";
import { TIME_RANGES } from "./useInsightsData";

export default function InsightsFilterBar({
  search, onSearch,
  category, onCategory, categories,
  brand, onBrand, brands,
  days, onDays,
  sortBy, onSort,
}) {
  return (
    <div className="ins-filterbar">
      <input
        type="text"
        placeholder="Search SKU or title"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      {/* SearchableSelect keeps the selected value in its list even when the
          current tab has no alerts for it, so it never shows a stale label. */}
      <SearchableSelect
        options={categories}
        value={category}
        onChange={onCategory}
        allLabel="All categories"
        searchPlaceholder="Search category..."
      />
      <SearchableSelect
        options={brands || []}
        value={brand}
        onChange={onBrand}
        allLabel="All brands"
        searchPlaceholder="Search brand..."
      />
      <select
        value={days}
        onChange={(e) => onDays(e.target.value)}
        aria-label="Time range"
        title="Show alerts that appeared or changed within this period"
      >
        {TIME_RANGES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      {/* Sort is unchanged for now (paused). */}
      <select value={sortBy} onChange={(e) => onSort(e.target.value)}>
        <option value="newest">Newest first</option>
        <option value="diff">Biggest diff</option>
      </select>
    </div>
  );
}































// // src/components/insights/InsightsFilterBar.jsx
// import SearchableSelect from "../SearchableSelect";

// export default function InsightsFilterBar({
//   search, onSearch,
//   category, onCategory, categories,
//   brand, onBrand, brands,
//   sortBy, onSort,
// }) {
//   return (
//     <div className="ins-filterbar">
//       <input
//         type="text"
//         placeholder="Search SKU or title"
//         value={search}
//         onChange={(e) => onSearch(e.target.value)}
//       />
//       {/* SearchableSelect keeps the selected value in its list even when the
//           current tab has no alerts for it, so it never shows a stale label. */}
//       <SearchableSelect
//         options={categories}
//         value={category}
//         onChange={onCategory}
//         allLabel="All categories"
//         searchPlaceholder="Search category..."
//       />
//       <SearchableSelect
//         options={brands || []}
//         value={brand}
//         onChange={onBrand}
//         allLabel="All brands"
//         searchPlaceholder="Search brand..."
//       />
//       <select value={sortBy} onChange={(e) => onSort(e.target.value)}>
//         <option value="newest">Newest first</option>
//         <option value="diff">Biggest diff</option>
//       </select>
//     </div>
//   );
// }