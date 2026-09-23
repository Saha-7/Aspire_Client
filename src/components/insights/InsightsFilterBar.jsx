// src/components/insights/InsightsFilterBar.jsx
export default function InsightsFilterBar({
  search, onSearch,
  category, onCategory, categories,
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
      <select value={category} onChange={(e) => onCategory(e.target.value)}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select value={sortBy} onChange={(e) => onSort(e.target.value)}>
        <option value="newest">Newest first</option>
        <option value="diff">Biggest diff</option>
      </select>
    </div>
  );
}