import { imageUrl } from "../api/client";
import type { Report } from "../types";

export function RecentPhotosSection({ reports }: { reports: Report[] }) {
  const photos = reports.filter((r) => r.images.length > 0).slice(0, 4);
  return (
    <section className="side-section">
      <h3>Recent Photos</h3>
      <div className="photo-stack">
        {photos.map((report) => (
          <img
            key={report.id}
            src={imageUrl(report.images[0].file_path)}
            alt={report.content}
          />
        ))}
      </div>
    </section>
  );
}
