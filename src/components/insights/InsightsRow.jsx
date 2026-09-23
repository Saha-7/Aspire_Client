// src/components/insights/InsightsRow.jsx
import { describeAlert, getDiffPercent, canTakeAction } from "./alertFormatters";

export default function InsightsRow({ alert, selected, onToggleSelect, onDismiss, onTakeAction }) {
  const diff = getDiffPercent(alert);
  const diffClass = diff == null ? "ins-muted" : diff > 0 ? "ins-diff-up" : "ins-diff-down";
  const diffLabel = diff == null ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`;
  const actionable = canTakeAction(alert);

  return (
    <tr>
      <td>
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(alert.Id)} />
      </td>
      <td>{alert.SKU_ID}</td>
      <td>{alert.Category || "—"}</td>
      <td className="ins-muted">{describeAlert(alert) || "—"}</td>
      <td className={diffClass}>{diffLabel}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {actionable && (
          <a className="ins-link" style={{ marginRight: 12 }} onClick={() => onTakeAction(alert)}>
            Take action
          </a>
        )}
        <a className="ins-link-muted" onClick={() => onDismiss(alert.Id)}>Dismiss</a>
      </td>
    </tr>
  );
}