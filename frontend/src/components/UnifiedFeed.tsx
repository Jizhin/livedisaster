import { MessageCircle, MoreVertical, ThumbsDown, ThumbsUp } from "lucide-react";
import { imageUrl } from "../api/client";
import type { Report } from "../types";

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const BADGE: Record<string, { bg: string; color: string }> = {
  new:      { bg: "rgba(59,130,246,.14)",  color: "#3b82f6" },
  verified: { bg: "rgba(34,197,94,.14)",   color: "#22c55e" },
  disputed: { bg: "rgba(249,115,22,.14)",  color: "#f97316" },
  resolved: { bg: "rgba(100,116,139,.18)", color: "#94a3b8" },
};

function FeedItem({
  report,
  onOpen,
  onChat,
  chatActive,
}: {
  report: Report;
  onOpen: (r: Report) => void;
  onChat: (r: Report) => void;
  chatActive: boolean;
}) {
  const thumb = report.images[0];
  const imgSrc = thumb ? imageUrl(thumb.file_path) : null;
  const badge = BADGE[report.status] ?? { bg: "rgba(100,116,139,.14)", color: "#94a3b8" };

  const metaParts: string[] = [];
  if (report.source_type === "community" && report.reporter_name) {
    metaParts.push(report.reporter_name);
  }
  metaParts.push(relativeTime(report.created_at));
  if (report.district_name) metaParts.push(report.district_name);

  return (
    <div className={`fi${chatActive ? " fi--chat-on" : ""}`} onClick={() => onOpen(report)}>
      <span className="fi__badge" style={{ background: badge.bg, color: badge.color }}>
        {report.status.toUpperCase()}
      </span>

      <div className="fi__mid">
        <div className="fi__title-row">
          <p className="fi__title">{report.content}</p>
          {imgSrc && <img className="fi__thumb" src={imgSrc} alt="" loading="lazy" />}
        </div>
        <p className="fi__meta">{metaParts.join(" · ")}</p>
      </div>

      <div className="fi__right" onClick={(e) => e.stopPropagation()}>
        <div className="fi__votes">
          <span className="fi__v fi__v--up">
            <ThumbsUp size={14} strokeWidth={1.8} />
            {report.confirmed_count}
          </span>
          <span className="fi__v fi__v--dn">
            <ThumbsDown size={14} strokeWidth={1.8} />
            {report.incorrect_count}
          </span>
          <button
            className={`fi__chat-btn${chatActive ? " fi__chat-btn--on" : ""}`}
            onClick={(e) => { e.stopPropagation(); onChat(report); }}
            aria-label="Open chat"
            title="Join discussion"
          >
            <MessageCircle size={14} strokeWidth={1.8} />
            {report.comment_count > 0 && <span className="fi__chat-count">{report.comment_count}</span>}
          </button>
          <button
            className="fi__more"
            aria-label="View details"
            onClick={(e) => { e.stopPropagation(); onOpen(report); }}
          >
            <MoreVertical size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function UnifiedFeed({
  reports,
  loading,
  onOpenReport,
  onOpenChat,
  chatReportId,
  displayCount,
  onLoadMore,
}: {
  reports: Report[];
  loading: boolean;
  onOpenReport: (r: Report) => void;
  onOpenChat: (r: Report) => void;
  chatReportId?: number | null;
  displayCount: number;
  onLoadMore: () => void;
}) {
  if (loading) {
    return (
      <div className="fi-list">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="fi-skeleton" />)}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="fi-empty">
        <p>No updates yet — be the first to report</p>
      </div>
    );
  }

  const visible = reports.slice(0, displayCount);
  const hasMore = displayCount < reports.length;

  return (
    <>
      <div className="fi-list">
        {visible.map((r) => (
          <FeedItem
            key={r.id}
            report={r}
            onOpen={onOpenReport}
            onChat={onOpenChat}
            chatActive={chatReportId === r.id}
          />
        ))}
      </div>
      {hasMore && (
        <button className="fi-load-more" onClick={onLoadMore}>
          Load more updates
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </>
  );
}
