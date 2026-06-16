import type { OfficialAlert } from "../types";

const severityStyle: Record<string, { border: string; bg: string; titleColor: string; dot: string }> = {
  red:    { border: "rgba(239,68,68,0.35)",   bg: "rgba(239,68,68,0.08)",   titleColor: "#fca5a5", dot: "#ef4444" },
  orange: { border: "rgba(249,115,22,0.35)",  bg: "rgba(249,115,22,0.08)",  titleColor: "#fdba74", dot: "#f97316" },
  yellow: { border: "rgba(234,179,8,0.35)",   bg: "rgba(234,179,8,0.08)",   titleColor: "#fde047", dot: "#eab308" },
  official:{ border: "rgba(59,130,246,0.35)", bg: "rgba(59,130,246,0.08)",  titleColor: "#93c5fd", dot: "#3b82f6" },
};

export function OfficialAlertsSection({ alerts }: { alerts: OfficialAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section className="summary-section">
      <h3>Official Alerts</h3>
      {alerts.map((alert) => {
        const s = severityStyle[alert.severity] ?? severityStyle.official;
        return (
          <article
            key={alert.id}
            style={{
              borderLeft: `3px solid ${s.dot}`,
              paddingLeft: "12px",
              marginBottom: "10px",
              background: s.bg,
              borderRadius: "6px",
              padding: "10px 12px",
            }}
          >
            <strong style={{ color: s.titleColor, fontSize: "13px", display: "block", marginBottom: "3px" }}>
              {alert.district_name ? `${alert.district_name} — ` : ""}{alert.title}
            </strong>
            <span style={{ display: "block", fontSize: "12px", color: "rgba(220,235,255,0.6)", lineHeight: "1.4" }}>
              {alert.content}
            </span>
            <small style={{ color: "rgba(180,200,235,0.4)", fontSize: "11px" }}>
              {alert.source}
            </small>
          </article>
        );
      })}
    </section>
  );
}
