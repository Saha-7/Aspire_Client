// src/components/insights/alertFormatters.js
// ─────────────────────────────────────────────────────────────
// Shared "what does this alert mean" logic — used by both AlertBell
// (header dropdown) and InsightsView (the full dashboard) so the label
// text, time formatting, and value-parsing only live in one place.
// ─────────────────────────────────────────────────────────────

export const ALERT_TYPES = {
  LOW_PRICE:  { label: "Priced below competitors", group: "price" },
  HIGH_PRICE: { label: "Priced above competitors", group: "price" },
  OOS:        { label: "Out of stock (we don't have it, competitors do)", group: "oos" },
  NO_LISTING: { label: "Not in our catalog", group: "listing" },
};

export function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Prefers the server-computed DiffPercent field (added by the updated
// insightsService.js); falls back to parsing CurrentValue for safety.
export function getDiffPercent(alert) {
  if (alert.DiffPercent != null) return alert.DiffPercent;
  const match = /diff:(-?\d+(\.\d+)?)/.exec(alert.CurrentValue || "");
  return match ? parseFloat(match[1]) : null;
}

export function getStoreList(alert) {
  return (alert.CurrentValue || "").replace("stores:", "").split(",").filter(Boolean);
}

export function describeAlert(alert) {
  const { AlertType } = alert;
  if (AlertType === "LOW_PRICE" || AlertType === "HIGH_PRICE") {
    const diff = getDiffPercent(alert);
    if (diff == null) return null;
    return AlertType === "LOW_PRICE"
      ? `${Math.abs(diff).toFixed(1)}% below lowest competitor price`
      : `${diff.toFixed(1)}% above lowest competitor price`;
  }
  if (AlertType === "OOS") {
    const stores = getStoreList(alert);
    return `In stock at ${stores.length} competitor${stores.length !== 1 ? "s" : ""}: ${stores.join(", ")}`;
  }
  if (AlertType === "NO_LISTING") {
    const stores = getStoreList(alert);
    return `Listed by ${stores.length} competitor${stores.length !== 1 ? "s" : ""}: ${stores.join(", ")}`;
  }
  return null;
}

// Only LOW_PRICE/HIGH_PRICE have a real destination today (jump to the
// Intelligence table and search that SKU). OOS/NO_LISTING have no in-app
// action yet — keep in sync with AlertBell's comment on this.
export function canTakeAction(alert) {
  return alert.AlertType === "LOW_PRICE" || alert.AlertType === "HIGH_PRICE";
}



// add to src/components/insights/alertFormatters.js (or a shared utils file)
export function formatINR(value) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}