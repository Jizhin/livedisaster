import type { OfficialAlert } from "../types";

const severityColor: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  official: "#3b82f6",
};

export function AlertTicker({ alerts }: { alerts: OfficialAlert[] }) {
  if (alerts.length === 0) return null;
  // Duplicate for seamless infinite scroll
  const items = [...alerts, ...alerts, ...alerts];
  return (
    <div className="ticker-bar">
      <span className="ticker-label">⚡ LIVE ALERTS</span>
      <div className="ticker-track">
        <div className="ticker-items">
          {items.map((alert, i) => (
            <span key={i} className="ticker-item">
              <span
                className="ticker-dot"
                style={{ background: severityColor[alert.severity] ?? "#888" }}
              />
              {alert.district_name ? `${alert.district_name}: ` : ""}
              <strong>{alert.title}</strong>
              {" — "}
              {alert.content.length > 90 ? alert.content.slice(0, 90) + "…" : alert.content}
              <span className="ticker-sep">◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
