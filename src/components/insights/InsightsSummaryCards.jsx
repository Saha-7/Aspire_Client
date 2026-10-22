// src/components/insights/InsightsSummaryCards.jsx
// Hover (or keyboard-focus) a card to see what the number means.

function tooltipFor(key, thresholdPct) {
  const t = thresholdPct != null ? `${thresholdPct}%` : "the alert threshold";
  switch (key) {
    case "all":
      return "Every active alert that needs attention: price alerts, out of stock and not in catalog combined.";
    case "price":
      return `Products in our store priced more than ${t} above or below the lowest in-stock competitor price.`;
    case "oos":
      return "SKUs that are out of stock in our store but in stock at 2 or more competitors.";
    case "listing":
      return "SKUs we don't have in our catalog but that 2 or more competitors list.";
    default:
      return "";
  }
}

const CARDS = [
  { key: "all", label: "All alerts" },
  { key: "price", label: "Price up/down" },
  { key: "oos", label: "Out of stock" },
  { key: "listing", label: "Not in catalog" },
];

export default function InsightsSummaryCards({ counts, activeTab, onSelect }) {
  return (
    <div className="ins-summary-grid">
      {CARDS.map((c) => {
        const tipId = `ins-tip-${c.key}`;
        return (
          <button
            key={c.key}
            className={`ins-summary-card ${activeTab === c.key ? "active" : ""}`}
            onClick={() => onSelect(c.key)}
            aria-describedby={tipId}
          >
            <div className="ins-summary-label">{c.label}</div>
            <div className="ins-summary-value">{(counts[c.key] ?? 0).toLocaleString()}</div>
            <span id={tipId} role="tooltip" className="ins-tip">
              {tooltipFor(c.key, counts.defaultThreshold)}
            </span>
          </button>
        );
      })}
    </div>
  );
}





























// // src/components/insights/InsightsSummaryCards.jsx
// const CARDS = [
//   { key: "all", label: "All alerts" },
//   { key: "price", label: "Price up/down" },
//   { key: "oos", label: "Out of stock" },
//   { key: "listing", label: "Not in catalog" },
// ];

// export default function InsightsSummaryCards({ counts, activeTab, onSelect }) {
//   return (
//     <div className="ins-summary-grid">
//       {CARDS.map((c) => (
//         <button
//           key={c.key}
//           className={`ins-summary-card ${activeTab === c.key ? "active" : ""}`}
//           onClick={() => onSelect(c.key)}
//         >
//           <div className="ins-summary-label">{c.label}</div>
//           <div className="ins-summary-value">{(counts[c.key] ?? 0).toLocaleString()}</div>
//         </button>
//       ))}
//     </div>
//   );
// }