import { ChevronDown, RotateCw } from "lucide-react";
import type { Report } from "../types";
import { PostCard } from "./PostCard";

export function PostFeed({ reports, onOpen }: { reports: Report[]; onOpen: (report: Report) => void }) {
  return (
    <section className="feed-section">
      <div className="section-heading">
        <div>
          <h2>Live Updates</h2>
          <p><span className="target-dot" />Real-time updates from your community</p>
        </div>
        <p className="refresh"><span />Updates auto-refreshing <RotateCw size={15} /></p>
      </div>
      <div className="feed-list">
        {reports.length === 0 ? (
          <p style={{ padding: "28px 24px", color: "var(--t3)" }}>No reports yet. Be the first to share an update.</p>
        ) : (
          reports.map((report) => <PostCard key={report.id} report={report} onOpen={onOpen} />)
        )}
      </div>
      {reports.length > 0 && (
        <button className="show-more">
          <ChevronDown size={18} />Show More Updates <small>Showing {reports.length} reports</small>
        </button>
      )}
    </section>
  );
}
