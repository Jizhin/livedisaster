import {
  ArrowLeft, ArrowRight, BadgeCheck, CheckCircle,
  ChevronDown, Clock, Eye, FileText, ImageOff, MapPin,
  MessageSquare, Search, Shield, ShieldCheck,
  TriangleAlert, Users, XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, imageUrl } from "../api/client";
import { ReportDetailModal } from "../components/ReportDetailModal";
import { useLanguage } from "../i18n/LanguageContext";
import type { Report } from "../types";
import { timeAgo } from "../utils/time";

const INITIAL_VISIBLE = 12;
const LOAD_MORE_STEP  = 12;
const AREA_MAX        = 7;

const isSafe     = (r: Report) => r.content.toLowerCase().includes("[safe now]");
const statusKey  = (r: Report) => r.status === "resolved" ? "resolved" : isSafe(r) ? "safe" : "active";
const reportText = (r: Report) => r.content.replace(/^\[.*?\]\s*/, "").trim() || r.content;

/* ── Weather ─────────────────────────────────────────────── */
const DISTRICT_COORDS: Record<string, [number, number]> = {
  "kasaragod":          [12.4996, 74.9869],
  "kannur":             [11.8745, 75.3704],
  "wayanad":            [11.6854, 76.1320],
  "kozhikode":          [11.2588, 75.7804],
  "malappuram":         [11.0510, 76.0711],
  "palakkad":           [10.7867, 76.6548],
  "thrissur":           [10.5276, 76.2144],
  "ernakulam":          [ 9.9312, 76.2673],
  "idukki":             [ 9.9189, 76.9705],
  "kottayam":           [ 9.5916, 76.5222],
  "alappuzha":          [ 9.4981, 76.3388],
  "pathanamthitta":     [ 9.2648, 76.7870],
  "kollam":             [ 8.8932, 76.6141],
  "thiruvananthapuram": [ 8.5241, 76.9366],
};

type WeatherData = { temp: number; code: number; is_day: number } | null;

function weatherLabel(code: number, is_day: number): string {
  if (code === 0) return is_day ? "Clear" : "Clear Night";
  if (code <= 3)  return code === 1 ? "Mainly Clear" : code === 2 ? "Partly Cloudy" : "Overcast";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  return "Thunderstorm";
}

function WeatherIcon({ code, is_day, size = 36 }: { code: number; is_day: number; size?: number }) {
  const s = size;
  /* Clear day */
  if (code === 0 && is_day) return (
    <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="7" fill="#FCD34D" />
      {[0,45,90,135,180,225,270,315].map((deg) => {
        const r = Math.PI * deg / 180;
        return <line key={deg} x1={18+11*Math.cos(r)} y1={18+11*Math.sin(r)} x2={18+15*Math.cos(r)} y2={18+15*Math.sin(r)} stroke="#FCD34D" strokeWidth="2" strokeLinecap="round" />;
      })}
    </svg>
  );
  /* Clear night */
  if (code === 0 && !is_day) return (
    <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
      <path d="M22 6a12 12 0 1 0 8 20A8 8 0 0 1 22 6z" fill="#C4B5FD" />
    </svg>
  );
  /* Partly cloudy day */
  if (code <= 2 && is_day) return (
    <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
      <circle cx="13" cy="15" r="6" fill="#FCD34D" opacity="0.9"/>
      <ellipse cx="22" cy="24" rx="10" ry="6" fill="#9CA3AF"/>
      <ellipse cx="15" cy="26" rx="7" ry="5" fill="#D1D5DB"/>
    </svg>
  );
  /* Overcast / cloudy */
  if (code <= 3) return (
    <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
      <ellipse cx="18" cy="22" rx="11" ry="7" fill="#4B5563"/>
      <ellipse cx="13" cy="20" rx="8" ry="6" fill="#6B7280"/>
      <ellipse cx="23" cy="19" rx="8" ry="6" fill="#6B7280"/>
    </svg>
  );
  /* Fog */
  if (code <= 48) return (
    <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
      {[10,16,22,28].map((y) => <line key={y} x1="4" y1={y} x2="32" y2={y} stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" opacity={y===16||y===22 ? 0.9 : 0.5}/>)}
    </svg>
  );
  /* Thunderstorm */
  if (code >= 95) return (
    <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
      <ellipse cx="18" cy="13" rx="11" ry="7" fill="#374151"/>
      <ellipse cx="13" cy="11" rx="7" ry="5" fill="#4B5563"/>
      <path d="M20 18l-5 8h4l-4 8 10-11h-6z" fill="#FCD34D"/>
    </svg>
  );
  /* Rain / drizzle / showers */
  return (
    <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
      <ellipse cx="18" cy="14" rx="11" ry="7" fill="#4B5563"/>
      <ellipse cx="12" cy="12" rx="7" ry="5" fill="#6B7280"/>
      {[[10,22,13,30],[18,24,21,32],[26,22,29,30]].map(([x1,y1,x2,y2],i)=>(
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
      ))}
    </svg>
  );
}

/* ── Card ────────────────────────────────────────────────── */
function ReportCard({ report, onOpen, lang }: {
  report: Report;
  onOpen: (r: Report) => void;
  lang: "en" | "ml";
}) {
  const { t } = useLanguage();
  const sk   = statusKey(report);
  const text = reportText(report);
  const loc  = report.locality || report.district_name || "Kerala";

  return (
    <div className={`dpc-card dpc-card--${sk}`} onClick={() => onOpen(report)}>

      <div className="dpc-card-top">
        <span className={`dpc-badge dpc-badge--${sk}`}>
          {sk === "active" ? t.alertBtn : sk === "safe" ? t.safeUpdateBadge : t.resolvedFilter}
        </span>
        <span className={`dpc-card-icon dpc-card-icon--${sk}`}>
          {sk === "active"   ? <TriangleAlert size={18} /> :
           sk === "safe"     ? <ShieldCheck   size={18} /> :
                               <BadgeCheck    size={18} />}
        </span>
      </div>

      <div className="dpc-card-body">
        <div className="dpc-card-content">
          <h3 className="dpc-card-title">{text}</h3>
          <p className="dpc-card-loc">
            <MapPin size={12} />
            <span>{loc}</span>
          </p>
        </div>
        {report.images?.length > 0 ? (
          <div className="dpc-card-thumb">
            <img src={imageUrl(report.images[0].file_path)} alt="" />
          </div>
        ) : (
          <div className="dpc-card-thumb dpc-card-thumb--noimg">
            <ImageOff size={18} />
            <span className="dpc-thumb-nolabel">No photo</span>
          </div>
        )}
      </div>

      <div className="dpc-card-metrics">
        <div className="dpc-mnums">
          <span className="dpc-mnum"><Eye size={12} />{report.views_count ?? 0}</span>
          <span className="dpc-mnum"><CheckCircle size={12} />{report.confirmed_count}</span>
          <span className="dpc-mnum"><XCircle size={12} />{report.incorrect_count}</span>
          <span className="dpc-mnum"><BadgeCheck size={12} />{report.resolved_count}</span>
        </div>
        <div className="dpc-mlbls">
          <span>{t.viewsLabel}</span>
          <span>{t.confirmedWord}</span>
          <span>{t.incorrect}</span>
          <span>{t.resolvedMetric}</span>
        </div>
      </div>

      <div className="dpc-card-footer">
        <span className="dpc-card-time">{timeAgo(report.created_at, lang)}</span>
        <span className="dpc-card-comments">
          <MessageSquare size={12} />
          <span>{report.comment_count}</span>
        </span>
        <span className="dpc-card-arrow"><ArrowRight size={14} /></span>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export function DistrictPage() {
  const { lang, toggle, t } = useLanguage();
  const { districtSlug = "kannur" } = useParams();
  const location = useLocation();
  const navState = location.state as {
    statusFilter?: "all" | "active" | "safe" | "resolved";
    localityFilter?: string;
    dateFilter?: "today" | "all";
  } | null;

  const [reports,        setReports]        = useState<Report[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [search,         setSearch]         = useState("");
  const [statusFilt,     setStatusFilt]     = useState<"all"|"active"|"safe"|"resolved">(navState?.statusFilter ?? "all");
  const [locFilt,        setLocFilt]        = useState<string | null>(navState?.localityFilter ?? null);
  const [dateFilt,       setDateFilt]       = useState<"all"|"today">(navState?.dateFilter ?? "all");
  const [visible,        setVisible]        = useState(INITIAL_VISIBLE);
  const [moreAreas,      setMoreAreas]      = useState(false);
  const [weather,        setWeather]        = useState<WeatherData>(null);

  const districtName = districtSlug
    .split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    setLoading(true);
    api.districtReports(districtSlug, "newest", "all")
      .then(setReports)
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtSlug]);

  useEffect(() => { setVisible(INITIAL_VISIBLE); }, [search, statusFilt, locFilt, dateFilt]);

  useEffect(() => {
    const coords = DISTRICT_COORDS[districtSlug];
    if (!coords) return;
    const [lat, lon] = coords;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`)
      .then(r => r.json())
      .then(d => setWeather({
        temp:   Math.round(d.current.temperature_2m),
        code:   d.current.weather_code,
        is_day: d.current.is_day,
      }))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtSlug]);

  const handleOpen = async (r: Report) => {
    try { setSelectedReport(await api.reportDetail(r.id)); }
    catch { setSelectedReport(r); }
  };

  const safeCount    = reports.filter(r => statusKey(r) === "safe").length;
  const contributors = useMemo(
    () => new Set(reports.map(r => r.reporter_name).filter(Boolean)).size,
    [reports]
  );
  const latestReport = reports[0];

  const localities = useMemo(() => {
    const c: Record<string, number> = {};
    reports.forEach(r => { if (r.locality) c[r.locality] = (c[r.locality] ?? 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([l]) => l);
  }, [reports]);

  const todayStr = new Date().toDateString();
  const filteredReports = useMemo(() => {
    let r = [...reports];
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => x.content.toLowerCase().includes(q) || (x.locality ?? "").toLowerCase().includes(q));
    }
    if (statusFilt !== "all") r = r.filter(x => statusKey(x) === statusFilt);
    if (locFilt) r = r.filter(x => x.locality === locFilt);
    if (dateFilt === "today") r = r.filter(x => new Date(x.created_at).toDateString() === todayStr);
    return r;
  }, [reports, search, statusFilt, locFilt, dateFilt]);

  const visibleReports = filteredReports.slice(0, visible);
  const hasMore        = visible < filteredReports.length;
  const shownAreas     = moreAreas ? localities : localities.slice(0, AREA_MAX);
  const hiddenCount    = localities.length - AREA_MAX;

  return (
    <div className="dpc-page">

      {/* Nav */}
      <nav className="dpc-nav">
        <Link to="/" className="dpc-nav-back">
          <ArrowLeft size={14} /> {t.allDistricts}
        </Link>
        <button className="dpc-lang-btn" onClick={toggle}>
          {lang === "en" ? "EN" : "ML"} <ChevronDown size={11} />
        </button>
      </nav>

      {/* Header */}
      <header className="dpc-header">
        <div className="dpc-header-inner">
          <div className="dpc-header-left">
            <h1 className="dpc-district-name">{districtName.toUpperCase()}</h1>
            <div className="dpc-stats-row">
              <span className="dpc-stat">
                <FileText size={20} />
                <span className="dpc-stat-text">
                  <span className="dpc-stat-num">{reports.length}</span>
                  <span className="dpc-stat-lbl">{t.reportsWord}</span>
                </span>
              </span>
              <span className="dpc-stat">
                <Shield size={20} />
                <span className="dpc-stat-text">
                  <span className="dpc-stat-num">{safeCount}</span>
                  <span className="dpc-stat-lbl">{t.safeUpdatePlural}</span>
                </span>
              </span>
              <span className="dpc-stat">
                <Users size={20} />
                <span className="dpc-stat-text">
                  <span className="dpc-stat-num">{contributors}</span>
                  <span className="dpc-stat-lbl">{t.contributorsLabel}</span>
                </span>
              </span>
              <span className="dpc-stat">
                <MapPin size={20} />
                <span className="dpc-stat-text">
                  <span className="dpc-stat-num">{localities.length}</span>
                  <span className="dpc-stat-lbl">{t.areasLabel}</span>
                </span>
              </span>
              {latestReport && (
                <span className="dpc-activity">
                  <Clock size={14} />
                  {t.lastActivity} {timeAgo(latestReport.created_at, lang)}
                </span>
              )}
            </div>
          </div>
          {weather && (
            <div className="dpc-weather">
              <WeatherIcon code={weather.code} is_day={weather.is_day} size={44} />
              <span className="dpc-weather-temp">{weather.temp}°C</span>
              <span className="dpc-weather-lbl">{weatherLabel(weather.code, weather.is_day)}</span>
            </div>
          )}
        </div>
      </header>

      {/* Search */}
      <div className="dpc-search-bar">
        <Search size={16} className="dpc-search-icon" />
        <input
          className="dpc-search-input"
          placeholder={t.searchReports}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="dpc-search-x" onClick={() => setSearch("")}>✕</button>
        )}
      </div>

      {/* Filters */}
      <div className="dpc-filter-block">
        <div className="dpc-filter-row">
          <span className="dpc-flabel">{t.statusLabel}</span>
          <div className="dpc-chips">
            <button
              className={`dpc-chip${statusFilt === "all" ? " dpc-chip--on" : ""}`}
              onClick={() => setStatusFilt("all")}
            >{t.allFilter}</button>
            <button
              className={`dpc-chip${statusFilt === "active" ? " dpc-chip--on" : ""}`}
              onClick={() => setStatusFilt("active")}
            >
              <TriangleAlert size={13} style={{ color: statusFilt === "active" ? "#000" : "#FF4B4B" }} />
              {t.alertsWord}
            </button>
            <button
              className={`dpc-chip${statusFilt === "safe" ? " dpc-chip--on" : ""}`}
              onClick={() => setStatusFilt("safe")}
            >
              <ShieldCheck size={13} style={{ color: statusFilt === "safe" ? "#000" : "#39D353" }} />
              {t.safeFilter}
            </button>
            <button
              className={`dpc-chip${statusFilt === "resolved" ? " dpc-chip--on" : ""}`}
              onClick={() => setStatusFilt("resolved")}
            >
              <BadgeCheck size={13} style={{ color: statusFilt === "resolved" ? "#000" : "#60A5FA" }} />
              {t.resolvedFilter}
            </button>
          </div>
        </div>

        {localities.length > 0 && (
          <div className="dpc-filter-row">
            <span className="dpc-flabel">{t.areasLabel}</span>
            <div className="dpc-chips">
              <button
                className={`dpc-chip${!locFilt ? " dpc-chip--on" : ""}`}
                onClick={() => setLocFilt(null)}
              >{t.allFilter}</button>
              {shownAreas.map(loc => (
                <button
                  key={loc}
                  className={`dpc-chip${locFilt === loc ? " dpc-chip--on" : ""}`}
                  onClick={() => setLocFilt(locFilt === loc ? null : loc)}
                >{loc}</button>
              ))}
              {!moreAreas && hiddenCount > 0 && (
                <button
                  className="dpc-chip dpc-chip--more"
                  onClick={() => setMoreAreas(true)}
                >
                  {t.moreBtnLabel} <ChevronDown size={11} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="dpc-grid">
          {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="dpc-skel" />)}
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="dpc-empty">
          <span className="dpc-empty-icon">📋</span>
          <strong>{t.noReportsFound}</strong>
          <span>{t.tryAdjusting}</span>
        </div>
      ) : (
        <div className="dpc-grid">
          {visibleReports.map(r => (
            <ReportCard key={r.id} report={r} onOpen={handleOpen} lang={lang} />
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="dpc-load-wrap">
          <button className="dpc-load-btn" onClick={() => setVisible(v => v + LOAD_MORE_STEP)}>
            {t.loadMoreReports} <ChevronDown size={14} />
          </button>
        </div>
      )}

      <footer className="dpc-footer">
        <div className="dpc-footer-links">
          <a href="#" className="dpc-flink">{t.emergencyContacts}</a>
          <a href="#" className="dpc-flink">{t.safetyGuidelines}</a>
          <a href="#" className="dpc-flink">{t.disasterPreparedness}</a>
          <a href="#" className="dpc-flink">{t.aboutLink}</a>
        </div>
        <div className="dpc-footer-right">
          <a href="https://github.com/Jizhin/livedisaster" target="_blank" rel="noopener noreferrer" className="dpc-footer-support">⭐ Support</a>
          <a href="https://www.linkedin.com/in/jishinc" target="_blank" rel="noopener noreferrer" className="dpc-footer-dev">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            Developed by Jishin C
          </a>
          <span className="dpc-fcopy">© 2025 LiveDisaster</span>
        </div>
      </footer>

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          related={reports.filter(r => r.id !== selectedReport.id).slice(0, 4)}
          onClose={() => setSelectedReport(null)}
          onUpdated={(updated: Report) => {
            setSelectedReport(updated);
            setReports(prev => prev.map(r => r.id === updated.id ? updated : r));
          }}
        />
      )}
    </div>
  );
}
