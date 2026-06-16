import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { District, OfficialAlert } from "../types";
import { timeAgo } from "../utils/time";

function districtAlertSeverity(slug: string, alerts: OfficialAlert[]): string | null {
  const a = alerts.find((al) => al.district_slug === slug);
  return a ? a.severity : null;
}

const severityAccent: Record<string, string> = {
  red:    "rgba(239,68,68,0.7)",
  orange: "rgba(249,115,22,0.7)",
  yellow: "rgba(234,179,8,0.7)",
};

export function DistrictList({ districts, alerts = [] }: { districts: District[]; alerts?: OfficialAlert[] }) {
  return (
    <section className="district-grid" aria-label="District list">
      {districts.map((district) => {
        const severity = districtAlertSeverity(district.slug, alerts);
        const hasActivity = district.active_reports_count > 0;
        return (
          <Link
            className={`district-card${hasActivity ? " district-card--active" : ""}`}
            to={`/district/${district.slug}`}
            key={district.slug}
            style={severity ? { "--alert-color": severityAccent[severity] } as React.CSSProperties : undefined}
          >
            {severity && <div className="dc-alert-strip" style={{ background: severityAccent[severity] }} />}
            <div className="dc-body">
              <div className="dc-top">
                <h2>{district.name}</h2>
                {hasActivity && (
                  <span className="dc-count">{district.active_reports_count}</span>
                )}
              </div>
              <p className="dc-metric">
                <span className={`dc-dot${hasActivity ? " dc-dot--active" : ""}`} />
                {district.active_reports_count} active report{district.active_reports_count !== 1 ? "s" : ""}
              </p>
              {severity && (
                <p className="dc-alert-badge" style={{ color: severityAccent[severity].replace("0.7", "1") }}>
                  ⚠ {severity.charAt(0).toUpperCase() + severity.slice(1)} Alert
                </p>
              )}
              {!severity && (
                <div className="dc-divider" />
              )}
              <p className="dc-snippet">{district.latest_activity ?? "No recent activity"}</p>
              <p className="dc-muted">{district.latest_activity_time ? timeAgo(district.latest_activity_time) : ""}</p>
            </div>
            <span className="dc-arrow"><ArrowRight size={20} /></span>
          </Link>
        );
      })}
    </section>
  );
}
