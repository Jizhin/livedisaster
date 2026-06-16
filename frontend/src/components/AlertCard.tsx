import { AlertTriangle, ChevronRight } from "lucide-react";
import type { OfficialAlert } from "../types";

const severityIconColor: Record<string, string> = {
  red: "#fca5a5",
  orange: "#fdba74",
  yellow: "#fde047",
};

export function AlertCard({ alert }: { alert: OfficialAlert }) {
  const color = alert.severity in severityIconColor ? alert.severity : "orange";
  return (
    <section className={`alert-card ${color}`}>
      <div className="alert-icon" style={{ color: severityIconColor[color] }}>
        <AlertTriangle size={32} />
      </div>
      <div>
        <p className="alert-label" style={{ color: severityIconColor[color] }}>
          {alert.severity?.toUpperCase() ?? "OFFICIAL"} ALERT
        </p>
        <h2>{alert.title}</h2>
        <p>{alert.content}</p>
      </div>
      <div className="alert-source">Source: {alert.source}</div>
      <ChevronRight size={22} style={{ color: "rgba(255,255,255,0.4)" }} />
    </section>
  );
}
