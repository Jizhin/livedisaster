import { useEffect, useState } from 'react';
import { getDistricts, getReports } from './api';

function App() {
  const [districts, setDistricts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch both districts and reports from the backend simultaneously
        const [districtsData, reportsData] = await Promise.all([
          getDistricts(),
          getReports()
        ]);
        setDistricts(districtsData);
        setReports(reportsData);
      } catch (error) {
        console.error("Error loading data from backend:", error);
        setError("Failed to fetch data from the API. The API returned a 404 error.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) return <div className="page">Loading Kerala Live Data...</div>;

  if (error) {
    return (
      <div className="page">
        <div className="alert-card" style={{ gridTemplateColumns: '1fr', borderColor: 'var(--red)', backgroundColor: '#fff7f7' }}>
          <h2 style={{ color: 'var(--red)' }}>API Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <nav className="nav">
        <div className="brand">
          <span className="brand-dot"></span>
          <strong>Kerala</strong> Live
        </div>
      </nav>

      <section className="home-hero">
        <h1>Live Updates from <span>Kerala</span></h1>
        <p>Community-driven reports and real-time district status.</p>
      </section>

      <div className="strip-heading">
        <h2>Districts</h2>
      </div>
      <div className="district-grid" style={{ marginBottom: '40px', marginTop: '20px' }}>
        {districts.map(d => (
          <div className="district-card" key={d.id}>
            <div>
              <h2>{d.name}</h2>
              <p className="metric"><span></span> Updates: {d.update_count || 0}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="strip-heading">
        <h2>Recent Reports</h2>
      </div>
      <div className="feed-list" style={{ marginTop: '20px' }}>
        {reports.length === 0 ? <div style={{padding: '20px'}}>No reports found.</div> : reports.map(r => (
          <div className="post-card" key={r.id}>
            <div className={`status-badge ${r.status || 'new'}`}>
              {r.status || 'NEW'}
            </div>
            <div className="post-main">
              <h3>{r.reporter_name}</h3>
              <p>{r.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;