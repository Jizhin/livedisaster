import { ExternalLink } from "lucide-react";
import type { NewsReport } from "../types";
import { timeAgo } from "../utils/time";

function severityDot(s: string | null) {
  if (s === "red")    return { bg: "#e63946", label: "RED" };
  if (s === "orange") return { bg: "#f97316", label: "ORANGE" };
  if (s === "yellow") return { bg: "#eab308", label: "YELLOW" };
  return null;
}

function sourceBadgeColor(name: string): string {
  if (name.includes("IMD") || name.includes("Weather")) return "rgba(59,130,246,.15)";
  if (name.includes("Manorama")) return "rgba(230,57,70,.12)";
  if (name.includes("Mathrubhumi")) return "rgba(249,115,22,.12)";
  return "rgba(255,255,255,.06)";
}

export function NewsFeed({
  news,
  loading,
}: {
  news: NewsReport[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="nf-list">
        {[0, 1, 2, 3].map((i) => <div key={i} className="fi-skeleton" style={{ height: 72 }} />)}
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <div className="fi-empty" style={{ padding: "28px 16px" }}>
        <p style={{ margin: 0, fontSize: 13 }}>No news updates yet — data refreshes every 10 min</p>
      </div>
    );
  }

  return (
    <div className="nf-list">
      {news.map((item) => {
        const sev = severityDot(item.severity);
        return (
          <a
            key={item.id}
            className="nf-item"
            href={item.source_url.startsWith("imd://") ? undefined : item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ cursor: item.source_url.startsWith("imd://") ? "default" : "pointer" }}
          >
            {/* severity strip */}
            {sev && (
              <div className="nf-sev-strip" style={{ background: sev.bg }} />
            )}

            <div className="nf-body">
              <div className="nf-top">
                <span
                  className="nf-source"
                  style={{ background: sourceBadgeColor(item.source_name) }}
                >
                  {item.source_name}
                </span>
                {sev && (
                  <span className="nf-sev-badge" style={{ color: sev.bg }}>
                    {sev.label} ALERT
                  </span>
                )}
              </div>

              <div className="nf-title-row">
                <p className="nf-title">{item.title}</p>
                {item.image_url && (
                  <img className="nf-thumb" src={item.image_url} alt="" loading="lazy" />
                )}
              </div>

              <p className="nf-meta">{timeAgo(item.created_at)}</p>
            </div>

            {!item.source_url.startsWith("imd://") && (
              <ExternalLink size={13} className="nf-ext" />
            )}
          </a>
        );
      })}
    </div>
  );
}
