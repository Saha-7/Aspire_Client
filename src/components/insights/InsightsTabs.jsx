// src/components/insights/InsightsTabs.jsx
const TABS = [
  { key: "price", label: "Price alerts" },
  { key: "oos", label: "Out of stock" },
  { key: "listing", label: "Not in catalog" },
];

export default function InsightsTabs({ active, onChange }) {
  return (
    <div className="ins-tabs">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`ins-tab ${active === t.key ? "active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}