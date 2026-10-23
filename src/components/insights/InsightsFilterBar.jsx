// src/components/insights/InsightsFilterBar.jsx
import SearchableSelect from "../SearchableSelect";
import { TIME_RANGES } from "./useInsightsData";

// Sort options depend on the tab: a "difference" only exists for price alerts.
export function sortOptionsFor(tab) {
  const byScrape = [
    { value: "scraped_desc", label: "Newest scrape first" },
    { value: "scraped_asc", label: "Oldest scrape first" },
  ];
  if (tab === "price") {
    return [
      ...byScrape,
      { value: "diff_desc", label: "Difference: high to low" },
      { value: "diff_asc", label: "Difference: low to high" },
    ];
  }
  return byScrape;
}

export default function InsightsFilterBar({
  tab,
  search, onSearch,
  category, onCategory, categories,
  brand, onBrand, brands,
  days, onDays,
  sortBy, onSort,
}) {
  const sortOptions = sortOptionsFor(tab);
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
        aria-label="Scraped within"
        title="Only alerts whose competitor data was scraped within this period"
      >
        {TIME_RANGES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <select
        value={sortOptions.some((o) => o.value === sortBy) ? sortBy : "scraped_desc"}
        onChange={(e) => onSort(e.target.value)}
        aria-label="Sort"
        title={tab === "price" ? "Difference is sorted by size, ignoring + / −" : undefined}
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}