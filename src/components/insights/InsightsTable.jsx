// src/components/insights/InsightsTable.jsx
import InsightsRow from "./InsightsRow";

export default function InsightsTable({
  rows, loading,
  selectedIds, onToggleSelect, onToggleSelectAll,
  onDismiss, onTakeAction,
}) {
  if (loading) return <div className="ins-empty">Loading alerts…</div>;
  if (rows.length === 0) return <div className="ins-empty">Nothing needs attention right now.</div>;

  const allSelected = selectedIds.length === rows.length && rows.length > 0;

  return (
    <table className="ins-table">
      <thead>
        <tr>
          <th><input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} /></th>
          <th>SKU</th>
          <th>Category</th>
          <th>Detail</th>
          <th>Diff</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <InsightsRow
            key={r.Id}
            alert={r}
            selected={selectedIds.includes(r.Id)}
            onToggleSelect={onToggleSelect}
            onDismiss={onDismiss}
            onTakeAction={onTakeAction}
          />
        ))}
      </tbody>
    </table>
  );
}