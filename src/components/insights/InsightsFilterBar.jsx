// src/components/insights/InsightsFilterBar.jsx
export default function InsightsFilterBar({
  search, onSearch,
  category, onCategory, categories,
  sortBy, onSort,
}) {
  // Keep the selected category in the option list even if the current tab has
  // no alerts for it (e.g. after switching tabs) so the <select> never shows
  // a value that doesn't match its state.
  const options =
    category && !categories.includes(category)
      ? [...categories, category].sort()
      : categories;

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
        {options.map((c) => (
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




























// // src/components/insights/InsightsFilterBar.jsx
// export default function InsightsFilterBar({
//   search, onSearch,
//   category, onCategory, categories,
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
//       <select value={category} onChange={(e) => onCategory(e.target.value)}>
//         <option value="">All categories</option>
//         {categories.map((c) => (
//           <option key={c} value={c}>{c}</option>
//         ))}
//       </select>
//       <select value={sortBy} onChange={(e) => onSort(e.target.value)}>
//         <option value="newest">Newest first</option>
//         <option value="diff">Biggest diff</option>
//       </select>
//     </div>
//   );
// }