import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Navbar } from "../components/Navbar";
import type { Report } from "../types";
import { timeAgo } from "../utils/time";

export function AdminPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.recentReports(20)
      .then(setReports)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page admin-page">
      <Navbar />
      <header className="admin-header">
        <h1>Admin Panel</h1>
        <p>Approve reports, manage comments, official alerts, districts, and spam.</p>
      </header>
      {loading ? (
        <p style={{ padding: "20px", color: "var(--t3)" }}>Loading…</p>
      ) : (
        <section className="admin-list">
          {reports.map((report) => (
            <article key={report.id}>
              <div>
                <strong>{report.content}</strong>
                <p>{report.reporter_name} · {timeAgo(report.created_at)} · {report.district_name}</p>
              </div>
              <button>Approve</button>
              <button>Reject</button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
