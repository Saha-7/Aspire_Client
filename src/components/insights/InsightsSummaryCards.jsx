// src/components/insights/InsightsSummaryCards.jsx
const CARDS = [
  { key: "all", label: "All alerts" },
  { key: "price", label: "Price up/down" },
  { key: "oos", label: "Out of stock" },
  { key: "listing", label: "Not in catalog" },
];

export default function InsightsSummaryCards({ counts, activeTab, onSelect }) {
  return (
    <div className="ins-summary-grid">
      {CARDS.map((c) => (
        <button
          key={c.key}
          className={`ins-summary-card ${activeTab === c.key ? "active" : ""}`}
          onClick={() => onSelect(c.key)}
        >
          <div className="ins-summary-label">{c.label}</div>
          <div className="ins-summary-value">{(counts[c.key] ?? 0).toLocaleString()}</div>
        </button>
      ))}
    </div>
  );
}