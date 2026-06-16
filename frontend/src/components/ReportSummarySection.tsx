import type { Report } from "../types";
import { timeAgo } from "../utils/time";

export function ReportSummarySection({ title, reports }: { title: string; reports: Report[] }) {
  return (
    <section className="summary-section">
      <h3>{title}</h3>
      {reports.map((report) => (
        <article key={report.id}>
          <strong>{report.content}</strong>
          <span>{report.confirmed_count} confirmed · {timeAgo(report.created_at)}</span>
        </article>
      ))}
    </section>
  );
}
