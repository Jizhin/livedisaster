import { MessageSquare } from "lucide-react";
import { imageUrl } from "../api/client";
import type { Report } from "../types";
import { timeAgo } from "../utils/time";
import { VerificationButtons } from "./VerificationButtons";

const labels: Record<string, string> = {
  new: "NEW",
  verified: "VERIFIED",
  disputed: "DISPUTED",
  resolved: "RESOLVED",
};

export function PostCard({ report, onOpen }: { report: Report; onOpen: (report: Report) => void }) {
  const thumb = report.images[0];
  return (
    <button className="post-card" onClick={() => onOpen(report)}>
      <span className={`status-badge ${report.status}`}>{labels[report.status] ?? "NEW"}</span>
      <div className="post-main">
        <h3><span className="blue-dot" />{report.content}</h3>
        <p>{report.reporter_name} <span>•</span> {timeAgo(report.created_at)}</p>
      </div>
      <VerificationButtons report={report} />
      <span className="comment-count"><MessageSquare size={19} />{report.comment_count}</span>
      {thumb && <img src={imageUrl(thumb.file_path)} alt="" className="post-thumb" />}
    </button>
  );
}
