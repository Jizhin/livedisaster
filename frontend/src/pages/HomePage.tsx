import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

/* ─── Types ─────────────────────────────────────────────────── */

type Severity = "safe" | "warn" | "critical";

type District = {
  code: string;
  name: string;
  slug: string;
  lat: number;
  lon: number;
};

type Report = {
  id: string;
  district: string;
  place: string | null;
  lat: number | null;
  lon: number | null;
  created_at: string;
  message: string;
  severity: Severity;
  category: string | null;
  image_url: string | null;
};

type OfficialAlert = {
  id: string;
  source: string;
  disasterType: string;
  severity: Severity;
  severityLabel: string;
  areaDescription: string;
  message: string;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  district: string | null;
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    district?: string;
  };
};

type Place = {
  name: string;
  context: string;
  lat: number;
  lon: number;
  district: string;
  slug: string;
};

type ApiReport = {
  id: number;
  district_name: string | null;
  district_slug: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  content: string;
  severity: string;
  category: string | null;
  images: Array<{ file_path: string }>;
};

type ApiComment = { id: number; author_name: string; content: string; created_at: string };
type ApiReportDetail = ApiReport & {
  confirmed_count?: number;
  incorrect_count?: number;
  resolved_count?: number;
  comment_count?: number;
  views_count?: number;
  status?: string;
  comments?: ApiComment[];
};

/* ─── District constants ─────────────────────────────────────── */

const DISTRICTS: District[] = [
  { code: "KL-01", name: "Trivandrum",     slug: "trivandrum",     lat: 8.5241,  lon: 76.9366 },
  { code: "KL-02", name: "Kollam",         slug: "kollam",         lat: 8.8932,  lon: 76.6141 },
  { code: "KL-03", name: "Pathanamthitta", slug: "pathanamthitta", lat: 9.2648,  lon: 76.787  },
  { code: "KL-04", name: "Alappuzha",      slug: "alappuzha",      lat: 9.4981,  lon: 76.3388 },
  { code: "KL-05", name: "Kottayam",       slug: "kottayam",       lat: 9.5916,  lon: 76.5222 },
  { code: "KL-06", name: "Idukki",         slug: "idukki",         lat: 9.85,    lon: 76.97   },
  { code: "KL-07", name: "Ernakulam",      slug: "ernakulam",      lat: 9.9816,  lon: 76.2999 },
  { code: "KL-08", name: "Thrissur",       slug: "thrissur",       lat: 10.5276, lon: 76.2144 },
  { code: "KL-09", name: "Palakkad",       slug: "palakkad",       lat: 10.7867, lon: 76.6548 },
  { code: "KL-10", name: "Malappuram",     slug: "malappuram",     lat: 11.041,  lon: 76.0788 },
  { code: "KL-11", name: "Kozhikode",      slug: "kozhikode",      lat: 11.2588, lon: 75.7804 },
  { code: "KL-12", name: "Wayanad",        slug: "wayanad",        lat: 11.6854, lon: 76.132  },
  { code: "KL-13", name: "Kannur",         slug: "kannur",         lat: 11.8745, lon: 75.3704 },
  { code: "KL-14", name: "Kasaragod",      slug: "kasaragod",      lat: 12.4996, lon: 74.9869 },
];

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  "Flood":             { emoji: "🌊", label: "Flood" },
  "Landslide":         { emoji: "⛰️", label: "Landslide" },
  "Road Damage":       { emoji: "🚧", label: "Road Damage" },
  "Power Outage":      { emoji: "⚡", label: "Power Outage" },
  "Medical Emergency": { emoji: "🚨", label: "Medical" },
  "Fire":              { emoji: "🔥", label: "Fire" },
  "Other":             { emoji: "📌", label: "Other" },
};

const KERALA_CENTER = { lat: 10.5, lon: 76.3 };
const SEVERITY_RANK: Record<Severity, number> = { safe: 0, warn: 1, critical: 2 };
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api";
const UPLOADS_ORIGIN = API_BASE.replace(/\/api$/, "");

/* ─── Helpers ───────────────────────────────────────────────── */

function maxSeverity(items: Array<{ severity: Severity }>): Severity {
  let best: Severity = "safe";
  for (const it of items) {
    if (SEVERITY_RANK[it.severity] > SEVERITY_RANK[best]) best = it.severity;
  }
  return best;
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function resolveDistrict(f: PhotonFeature): District {
  const p = f.properties;
  const candidates = [p.district, p.county, p.city, p.state].filter(Boolean) as string[];
  for (const c of candidates) {
    const hit = DISTRICTS.find(
      (d) =>
        c.toLowerCase().includes(d.name.toLowerCase()) ||
        d.name.toLowerCase().includes(c.toLowerCase()),
    );
    if (hit) return hit;
  }
  const [lon, lat] = f.geometry.coordinates;
  let best = DISTRICTS[0];
  let bestDist = Infinity;
  for (const d of DISTRICTS) {
    const dist = haversine({ lat, lon }, d);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const district = resolveDistrict(f);
  const ctxParts = [p.city, p.county, p.state].filter(Boolean) as string[];
  const context = Array.from(new Set(ctxParts)).join(" · ");
  return {
    name: p.name ?? "Unknown",
    context: context || "Kerala, India",
    lat,
    lon,
    district: district.name,
    slug: district.slug,
  };
}

function mapApiReport(r: ApiReport): Report {
  const firstImage = r.images?.[0]?.file_path ?? null;
  return {
    id: String(r.id),
    district: r.district_name ?? "",
    place: r.locality ?? null,
    lat: r.latitude ?? null,
    lon: r.longitude ?? null,
    created_at: r.created_at,
    message: r.content,
    severity: (r.severity as Severity) ?? "warn",
    category: r.category ?? null,
    image_url: firstImage ? `${UPLOADS_ORIGIN}/uploads/${firstImage}` : null,
  };
}

function formatReportTime(iso: string) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}

function formatAlertWindow(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}

const catEmoji = (c: string | null) => CATEGORY_META[c ?? ""]?.emoji ?? "📌";

const sevText = (s: Severity) =>
  s === "critical" ? "text-destructive" : s === "warn" ? "text-warn" : "text-success";

const sevBadge = (s: Severity) =>
  s === "critical"
    ? "bg-destructive/10 text-destructive border-destructive/25"
    : s === "warn"
    ? "bg-warn/15 text-warn border-warn/25"
    : "bg-success/10 text-success border-success/25";

const sevBorderL = (s: Severity) =>
  s === "critical" ? "border-l-destructive" : s === "warn" ? "border-l-warn" : "border-l-success";

/* ─── Hooks ─────────────────────────────────────────────────── */

function usePhotonSearch(query: string) {
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${KERALA_CENTER.lat}&lon=${KERALA_CENTER.lon}&limit=8`;
      fetch(url, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data: { features: PhotonFeature[] }) => {
          const features = (data.features ?? []).filter((f) => {
            const s = (f.properties.state ?? "").toLowerCase();
            const c = (f.properties.country ?? "").toLowerCase();
            return s.includes("kerala") || (c.includes("india") && s === "");
          });
          setResults(features.map(toPlace));
        })
        .catch((e) => { if (e.name !== "AbortError") console.error(e); })
        .finally(() => setLoading(false));
    }, 250);
    return () => { ctrl.abort(); clearTimeout(id); };
  }, [query]);

  return { results, loading };
}

async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`);
    const data: { features: PhotonFeature[] } = await res.json();
    const f = data.features?.[0];
    if (!f) return null;
    return toPlace(f);
  } catch { return null; }
}

function useReportDetail(reportId: string | null) {
  const [data, setData] = useState<ApiReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!reportId) { setData(null); return; }
    setLoading(true);
    fetch(`${API_BASE}/reports/${reportId}`)
      .then((r) => r.json())
      .then((d: ApiReportDetail) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reportId]);
  return { data, loading };
}

function useLiveReports(limit = 40) {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [flashId, setFlashId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    async function fetchReports() {
      try {
        const res = await fetch(`${API_BASE}/reports/feed?limit=${limit}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const raw: ApiReport[] = await res.json();
        if (!active) return;
        const mapped = raw.map(mapApiReport);
        const newOnes = mapped.filter((r) => !prevIdsRef.current.has(r.id));
        if (newOnes.length > 0 && prevIdsRef.current.size > 0) {
          setFlashId(newOnes[0].id);
          setTimeout(() => setFlashId((id) => (id === newOnes[0].id ? null : id)), 4000);
        }
        prevIdsRef.current = new Set(mapped.map((r) => r.id));
        setReports(mapped);
        setStatus("live");
      } catch {
        if (active) setStatus("offline");
      }
    }

    fetchReports();
    const interval = setInterval(fetchReports, 20000);
    return () => { active = false; clearInterval(interval); };
  }, [limit]);

  return { reports, status, flashId };
}

function useKeralaAlerts() {
  const [alerts, setAlerts] = useState<OfficialAlert[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch(`${API_BASE}/ndma-alerts`)
        .then((r) => r.json())
        .then((data: OfficialAlert[]) => {
          if (!active) return;
          setAlerts(data);
          setStatus("ready");
        })
        .catch((err) => {
          console.error("[alerts]", err);
          if (active) setStatus("error");
        });
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { active = false; clearInterval(id); };
  }, []);

  return { alerts, status };
}

function useLocalTime() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const ist = new Date(d.getTime() + (5.5 * 60 + d.getTimezoneOffset()) * 60000);
      setTime(`${ist.getHours().toString().padStart(2, "0")}:${ist.getMinutes().toString().padStart(2, "0")} IST`);
    };
    fmt();
    const id = setInterval(fmt, 30000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/* ─── Module-level welcome flag ──────────────────────────────── */

let _welcomeDismissed = false;

/* ─── Site Header ────────────────────────────────────────────── */

function SiteHeader({
  reportsCount,
  status,
  onPost,
  lang,
  toggle,
}: {
  reportsCount: number;
  status: "connecting" | "live" | "offline";
  onPost: () => void;
  lang: string;
  toggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">
            L
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-semibold tracking-tight">
              Live<span className="text-accent">Kerala</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className="live-dot" />
              {status === "live"
                ? `${reportsCount} live reports`
                : status === "connecting"
                ? "Connecting…"
                : "Offline"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            {lang === "en" ? "ML" : "EN"}
          </button>
          <button
            type="button"
            onClick={onPost}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105"
          >
            <span aria-hidden>＋</span>
            <span className="hidden sm:inline">Post update</span>
            <span className="sm:hidden">Post</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */

export function HomePage() {
  const { lang, t, toggle } = useLanguage();
  const time = useLocalTime();
  const { reports, status, flashId } = useLiveReports(40);
  const { alerts, status: alertStatus } = useKeralaAlerts();

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [districtFocus, setDistrictFocus] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !_welcomeDismissed);
  const dataReady = status === "live" && alertStatus !== "loading";

  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(15);

  useEffect(() => { setVisibleCount(15); }, [filterDistrict, filterCategory, searchQuery]);

  function dismissWelcome() {
    _welcomeDismissed = true;
    setWelcomeOpen(false);
  }

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports
      .filter((r) => filterDistrict === "all" || r.district === filterDistrict)
      .filter((r) => filterCategory === "all" || r.category === filterCategory)
      .filter(
        (r) =>
          !q ||
          r.message.toLowerCase().includes(q) ||
          (r.place ?? "").toLowerCase().includes(q),
      );
  }, [reports, filterDistrict, filterCategory, searchQuery]);

  const topDistricts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reports) counts.set(r.district, (counts.get(r.district) ?? 0) + 1);
    return DISTRICTS.map((d) => ({ ...d, count: counts.get(d.name) ?? 0 }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [reports]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader
        reportsCount={reports.length}
        status={status}
        onPost={() => (selectedPlace ? setReportOpen(true) : undefined)}
        lang={lang}
        toggle={toggle}
      />

      <main className="px-4 pb-16 pt-6 sm:px-8">

        {/* ── Hero ── */}
        <section className="mb-5">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="live-dot" />
            Live across 14 districts · {time || "—"}
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-balance text-foreground sm:text-6xl">
            What's happening across{" "}
            <span className="text-accent">Kerala</span>, right now.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            <span className="font-semibold text-foreground">{reports.length} reports</span>{" "}
            in the last 24 hours. Confirm what you've seen or report an incident from your area.
          </p>
        </section>

        {/* ── Composer / Location picker ── */}
        <div className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] sm:p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.step1Location}
          </p>
          <LocationPicker selected={selectedPlace} onSelect={setSelectedPlace} />
          {selectedPlace && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-105"
            >
              <span aria-hidden>＋</span> Post update for {selectedPlace.name}
            </button>
          )}
        </div>

        {/* ── Filter bar ── */}
        <div className="mt-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports or localities…"
              className="min-w-0 flex-1 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <select
              value={filterDistrict}
              onChange={(e) => setFilterDistrict(e.target.value)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              <option value="all">All districts</option>
              {DISTRICTS.map((d) => (
                <option key={d.code} value={d.name}>{d.name}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              <option value="all">All categories</option>
              {Object.entries(CATEGORY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Main 2-col grid ── */}
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">

          {/* Left: chips + feed */}
          <div className="min-w-0">
            {/* District chips */}
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
              <div className="flex w-max gap-2 pb-2">
                <button
                  type="button"
                  onClick={() => setFilterDistrict("all")}
                  className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                    filterDistrict === "all"
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                >
                  All Kerala
                </button>
                {DISTRICTS.map((d) => {
                  const cnt = reports.filter((r) => r.district === d.name).length;
                  const active = filterDistrict === d.name;
                  return (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => setFilterDistrict(active ? "all" : d.name)}
                      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card text-foreground hover:bg-secondary"
                      }`}
                    >
                      <span>{d.name}</span>
                      {cnt > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            active
                              ? "bg-background/15 text-background"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {cnt}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feed header */}
            <div className="mt-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold">Latest updates</h2>
              <span className="text-sm font-medium text-muted-foreground">
                {Math.min(visibleCount, filteredReports.length)} of {filteredReports.length} · newest first
              </span>
            </div>

            {/* Report list */}
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
              {filteredReports.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No reports match these filters.
                </p>
              ) : (
                <>
                  <ul>
                    {filteredReports.slice(0, visibleCount).map((r) => (
                      <ReportRowItem key={r.id} report={r} flash={flashId === r.id} />
                    ))}
                  </ul>
                  {visibleCount < filteredReports.length && (
                    <div className="border-t border-border px-4 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => setVisibleCount((n) => n + 15)}
                        className="rounded-full border border-border bg-background px-6 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary hover:border-foreground/40"
                      >
                        Load more · {filteredReports.length - visibleCount} remaining
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right rail */}
          <div className="hidden lg:block">
            <div className="sticky top-24 space-y-5">

              {/* Official alerts */}
              <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                <h3 className="font-display text-base font-semibold">{t.officialAdvisories}</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">NDMA Sachet · IMD · KSDMA</p>
                {alertStatus === "loading" ? (
                  <p className="mt-3 animate-pulse text-xs text-muted-foreground">{t.fetchingAdvisories}</p>
                ) : alerts.length === 0 ? (
                  <p className="mt-3 text-xs italic text-muted-foreground">{t.noActiveAdvisories}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {alerts.slice(0, 4).map((a) => (
                      <li
                        key={a.id}
                        className={`rounded-lg border-l-2 py-2 pl-3 text-xs ${sevBorderL(a.severity)} ${
                          a.severity === "critical"
                            ? "bg-destructive/5"
                            : a.severity === "warn"
                            ? "bg-warn/5"
                            : "bg-success/5"
                        }`}
                      >
                        <div className={`font-semibold ${sevText(a.severity)}`}>
                          {a.district ?? "Kerala"} · {a.disasterType}
                        </div>
                        <div className="mt-0.5 truncate text-muted-foreground">{a.source}</div>
                      </li>
                    ))}
                    {alerts.length > 4 && (
                      <li className="pt-1 text-center text-xs text-muted-foreground">
                        +{alerts.length - 4} more
                      </li>
                    )}
                  </ul>
                )}
              </section>

              {/* Most active districts */}
              {topDistricts.length > 0 && (
                <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                  <h3 className="font-display text-base font-semibold">Most active districts</h3>
                  <ul className="mt-3 space-y-1">
                    {topDistricts.map((d) => (
                      <li key={d.code}>
                        <button
                          type="button"
                          onClick={() => setDistrictFocus(d.name)}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-secondary"
                        >
                          <span className="font-medium text-foreground">{d.name}</span>
                          <span className="tabular-nums text-xs font-semibold text-accent">
                            {d.count}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Stats */}
              <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                <h3 className="font-display text-base font-semibold">Overview</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-display text-2xl font-semibold tabular-nums text-accent">
                      {alerts.filter((a) => a.severity !== "safe").length}
                    </div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t.officialAlerts}
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-semibold tabular-nums text-primary">
                      {reports.length}
                    </div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t.crowdReports}
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-semibold tabular-nums">
                      {new Set([
                        ...alerts.map((a) => a.district).filter(Boolean),
                        ...reports.map((r) => r.district),
                      ]).size}
                    </div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t.districtsActive}
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-semibold tabular-nums text-destructive">
                      {reports.filter((r) => r.severity === "critical").length}
                    </div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t.criticalZones}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* ── All 14 districts ── */}
        <section className="mt-10 border-t border-border pt-6">
          <h3 className="font-display text-lg font-semibold">{t.allDistricts}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t.tapToInspect}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {DISTRICTS.map((d) => {
              const dReports = reports.filter((r) => r.district === d.name);
              const dAlerts = alerts.filter((a) => a.district === d.name);
              const total = dReports.length + dAlerts.length;
              const sev = maxSeverity([
                ...dReports.map((r) => ({ severity: r.severity })),
                ...dAlerts.map((a) => ({ severity: a.severity })),
              ]);
              return (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => setDistrictFocus(d.name)}
                  className="group flex flex-col items-start rounded-2xl border border-border bg-card p-3 text-left shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {d.code}
                  </div>
                  <div className="mt-1 font-display text-sm font-semibold leading-snug text-foreground">
                    {d.name}
                  </div>
                  {total > 0 && (
                    <div className={`mt-1 text-[10px] font-bold tabular-nums ${sevText(sev)}`}>
                      {total} active
                    </div>
                  )}
                  <div
                    className={`mt-2 h-1 w-full rounded-full ${
                      total > 0
                        ? sev === "critical"
                          ? "bg-destructive"
                          : sev === "warn"
                          ? "bg-warn"
                          : "bg-success"
                        : "bg-secondary"
                    }`}
                    style={{ opacity: total > 0 ? Math.max(0.3, Math.min(1, total / 6)) : 0.2 }}
                  />
                </button>
              );
            })}
          </div>
        </section>

        <footer className="mt-16 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          {t.communityPowered}
        </footer>
      </main>

      {/* ── Modals ── */}
      {welcomeOpen && (
        <WelcomeModal dataReady={dataReady} lang={lang} t={t} onDismiss={dismissWelcome} />
      )}

      {reportOpen && selectedPlace && (
        <ReportAlertModal
          place={selectedPlace}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => setReportOpen(false)}
        />
      )}

      {districtFocus && (
        <DistrictModal
          district={districtFocus}
          reports={reports.filter((r) => r.district === districtFocus)}
          alerts={alerts.filter((a) => a.district === districtFocus)}
          onClose={() => setDistrictFocus(null)}
        />
      )}
    </div>
  );
}

/* ─── Welcome Modal ─────────────────────────────────────────── */

type TShape = typeof import("../i18n/translations").T["en"];

function WelcomeModal({
  dataReady,
  lang,
  t,
  onDismiss,
}: {
  dataReady: boolean;
  lang: string;
  t: TShape;
  onDismiss: () => void;
}) {
  const steps = [
    { icon: "📍", title: t.welcomeStep1Title, desc: t.welcomeStep1Desc },
    { icon: "⚠️", title: t.welcomeStep2Title, desc: t.welcomeStep2Desc },
    { icon: "🗺️", title: t.welcomeStep3Title, desc: t.welcomeStep3Desc },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className={`h-1 w-full transition-all duration-700 ${dataReady ? "bg-success" : "bg-accent animate-pulse"}`} />
        <div className="p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">
              {t.welcomeTag}
            </p>
            <h2 className="font-display text-2xl font-semibold leading-tight">{t.welcomeHeadline}</h2>
            <p className="text-sm text-muted-foreground">{t.welcomeSub}</p>
          </div>

          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-secondary/60 px-4 py-3">
                <span className="mt-0.5 shrink-0 text-xl">{s.icon}</span>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest">{s.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {dataReady ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-success">
                <span className="h-2 w-2 rounded-full bg-success" /> {t.welcomeReady}
              </span>
            ) : (
              <span className="flex animate-pulse items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-warn">
                <span className="h-2 w-2 rounded-full bg-warn" /> {t.welcomeLoading}
              </span>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="ml-auto rounded-full bg-accent px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-105"
            >
              {t.welcomeBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Location Picker ───────────────────────────────────────── */

function LocationPicker({
  selected,
  onSelect,
}: {
  selected: Place | null;
  onSelect: (p: Place | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const { results, loading } = usePhotonSearch(query);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function detectLocation() {
    if (!navigator.geolocation) { setGeoError("Geolocation not supported."); return; }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setGeoLoading(false);
        if (!place) { setGeoError("Couldn't resolve your location."); return; }
        onSelect(place);
        setQuery(place.name);
      },
      (err) => { setGeoLoading(false); setGeoError(err.message || "Location permission denied."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div ref={boxRef} className="relative space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (selected) onSelect(null);
          }}
          placeholder="Search your place (e.g. Payyannur, Kakkanad…)"
          className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 transition-shadow"
        />
        <button
          type="button"
          onClick={detectLocation}
          disabled={geoLoading}
          className="rounded-full border border-border bg-background px-3.5 py-2 text-xs font-semibold text-primary transition hover:bg-secondary disabled:opacity-50"
        >
          {geoLoading ? "…" : "📍 Auto"}
        </button>
      </div>

      {selected && (
        <div className="flex items-center justify-between rounded-full border border-primary/30 bg-primary/5 px-4 py-2">
          <div>
            <span className="text-sm font-semibold text-foreground">{selected.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {selected.district} · {selected.context}
            </span>
          </div>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery(""); }}
            className="ml-3 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {geoError && (
        <p className="text-xs font-semibold text-destructive">{geoError}</p>
      )}

      {open && !selected && (query.trim().length >= 2 || loading) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          {loading && (
            <div className="px-4 py-2 text-xs text-muted-foreground">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-4 py-2 text-xs text-muted-foreground">No places found in Kerala</div>
          )}
          {results.map((p, i) => (
            <button
              key={`${p.lat}-${p.lon}-${i}`}
              type="button"
              onClick={() => { onSelect(p); setQuery(p.name); setOpen(false); }}
              className="w-full border-b border-border/50 px-4 py-2.5 text-left transition last:border-0 hover:bg-secondary"
            >
              <div className="text-sm font-semibold text-foreground">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.district} · {p.context}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Report Alert Modal ────────────────────────────────────── */

function ReportAlertModal({
  place,
  onClose,
  onSubmitted,
}: {
  place: Place;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { t } = useLanguage();
  const [severity, setSeverity] = useState<Severity>("warn");
  const [category, setCategory] = useState("Flood");
  const [message, setMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickImage(f: File | null) {
    setImageFile(f);
    setImagePreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 1 || trimmed.length > 500) { setError("Message must be 1–500 characters."); return; }
    if (imageFile && imageFile.size > 5 * 1024 * 1024) { setError("Image must be under 5 MB."); return; }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/districts/${place.slug}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter_name: "Anonymous",
          content: trimmed,
          severity,
          category,
          location_attached: true,
          latitude: place.lat,
          longitude: place.lon,
          locality: place.name,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as { detail?: string }).detail || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }

      const created = await res.json() as { id: number };

      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        await fetch(`${API_BASE}/reports/${created.id}/images`, { method: "POST", body: formData });
      }

      onSubmitted();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] max-h-[90vh] overflow-y-auto"
      >
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent">{t.newReportTag}</p>
              <h2 className="font-display text-xl font-semibold mt-0.5">{place.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {place.district} District · {place.context}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              {t.close} ✕
            </button>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.categoryLabel}</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              {Object.entries(CATEGORY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
              <option value="Other">📌 Other</option>
            </select>
          </label>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.severityTagLabel}</span>
            <div className="grid grid-cols-3 gap-2">
              {(["safe", "warn", "critical"] as Severity[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={`rounded-full border py-2 text-xs font-bold uppercase tracking-widest transition ${
                    severity === s
                      ? s === "critical"
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : s === "warn"
                        ? "border-warn bg-warn/10 text-warn"
                        : "border-success bg-success/10 text-success"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.whatHappened}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder={t.describePlaceholder}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none resize-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className={error ? "text-destructive font-medium" : ""}>{error ?? t.visiblePublicly}</span>
              <span>{message.length}/500</span>
            </div>
          </label>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.photoOptionalLabel}</span>
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="preview" className="w-full max-h-48 rounded-xl object-cover border border-border" />
                <button
                  type="button"
                  onClick={() => pickImage(null)}
                  className="absolute right-2 top-2 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-destructive"
                >
                  {t.removePhoto}
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border py-6 transition hover:border-primary hover:bg-secondary/40">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
                <span className="text-xs font-semibold text-muted-foreground">{t.attachPhotoBtn}</span>
              </label>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary">
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-accent-foreground transition hover:brightness-105 disabled:opacity-50"
            >
              {submitting ? t.submitting : t.submitReportBtn}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ─── District Modal ────────────────────────────────────────── */

function DistrictModal({
  district,
  reports,
  alerts,
  onClose,
}: {
  district: string;
  reports: Report[];
  alerts: OfficialAlert[];
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const places = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => r.place && set.add(r.place));
    return Array.from(set);
  }, [reports]);
  const [activePlace, setActivePlace] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const visibleReports = activePlace ? reports.filter((r) => r.place === activePlace) : reports;

  const sev = maxSeverity([
    ...reports.map((r) => ({ severity: r.severity })),
    ...alerts.map((a) => ({ severity: a.severity })),
  ]);
  const headline =
    alerts.find((a) => a.severity === "critical")?.disasterType ??
    alerts[0]?.disasterType ??
    (reports.length > 0 ? "Crowd reports active" : "No active incidents");

  const sevStrip = sev === "critical" ? "bg-destructive" : sev === "warn" ? "bg-warn" : "bg-success";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
      >
        {/* Severity strip */}
        <div className={`h-1 w-full shrink-0 ${sevStrip}`} />

        {/* Header */}
        <header className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3 mb-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
              {t.dossierLabel}
            </p>
            <button type="button" onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              {t.close} ✕
            </button>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{district}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{headline}</p>
            </div>
            <div className="flex gap-4">
              <DistrictStat value={alerts.length} label={t.officialLabel} color={sevText(sev)} />
              <DistrictStat value={reports.length} label={t.crowdLabel} color="text-primary" />
              <DistrictStat value={places.length} label={t.placesMetricLabel} color="text-muted-foreground" />
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {/* Official advisories */}
          <section>
            <div className="flex items-center justify-between px-5 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.officialAdvisories}</h3>
              <span className="text-[10px] text-muted-foreground/60">NDMA · IMD · KSDMA</span>
            </div>
            {alerts.length === 0 ? (
              <p className="px-5 pb-4 text-xs italic text-muted-foreground">{t.noOfficialAdvisory} {district}.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 px-5 pb-4 md:grid-cols-2">
                {alerts.map((a) => <ModalAlertCard key={a.id} alert={a} />)}
              </div>
            )}
          </section>

          {/* Crowd reports */}
          <section>
            <div className="px-5 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t.crowdBriefs} ({visibleReports.length})
              </h3>
            </div>
            {places.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setActivePlace(null)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    activePlace === null
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                >
                  {t.allPlaces}
                </button>
                {places.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setActivePlace(p)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      activePlace === p
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground hover:bg-secondary"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-1.5 px-5 pb-5">
              {visibleReports.length === 0 ? (
                <p className="py-6 text-center text-xs italic text-muted-foreground">
                  {t.noCrowdReportsYet}{activePlace ? ` ${t.forLabel} ${activePlace}` : ""}.
                </p>
              ) : (
                visibleReports.map((r) => (
                  <ModalReportCard key={r.id} report={r} onClick={() => setSelectedReport(r)} />
                ))
              )}
            </div>
          </section>
        </div>

        {selectedReport && (
          <ReportDetailPanel report={selectedReport} onBack={() => setSelectedReport(null)} />
        )}
      </div>
    </div>
  );
}

/* ─── Report Detail Panel ───────────────────────────────────── */

function ReportDetailPanel({ report, onBack }: { report: Report; onBack: () => void }) {
  const { t } = useLanguage();
  const { data, loading } = useReportDetail(report.id);
  const [localCounts, setLocalCounts] = useState<{ confirmed: number; incorrect: number; resolved: number } | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const anonName = useRef(`user_${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (data) {
      setLocalCounts({
        confirmed: data.confirmed_count ?? 0,
        incorrect: data.incorrect_count ?? 0,
        resolved: data.resolved_count ?? 0,
      });
      setComments(data.comments ?? []);
    }
  }, [data]);

  async function vote(kind: "confirm" | "incorrect" | "resolved") {
    if (voted) return;
    setVoted(kind);
    if (localCounts) {
      setLocalCounts((c) =>
        c
          ? { ...c, [kind === "confirm" ? "confirmed" : kind]: c[kind === "confirm" ? "confirmed" : (kind as "incorrect" | "resolved")] + 1 }
          : c,
      );
    }
    await fetch(`${API_BASE}/reports/${report.id}/verifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, voter_name: null }),
    }).catch(() => {});
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_BASE}/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_name: anonName.current, content: text }),
      });
      if (res.ok) {
        const newComment: ApiComment = {
          id: Date.now(),
          author_name: anonName.current,
          content: text,
          created_at: new Date().toISOString(),
        };
        setComments((prev) => [...prev, newComment]);
        setCommentText("");
      }
    } finally {
      setPosting(false);
    }
  }

  const imgUrl = data?.images?.[0]?.file_path
    ? `${UPLOADS_ORIGIN}/uploads/${data.images[0].file_path}`
    : report.image_url;

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-2xl bg-card border-t-2 border-primary">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-semibold text-primary hover:text-foreground transition-colors"
        >
          ← {t.backToList}
        </button>
        <span className="text-border">|</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${sevBadge(report.severity)}`}>
          {report.severity}
        </span>
        {report.category && (
          <span className="text-xs text-muted-foreground">
            {catEmoji(report.category)} {report.category}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{formatReportTime(report.created_at)}</span>
      </header>

      {/* Location + message (fixed) */}
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          📍 {report.place ? `${report.place}, ` : ""}{report.district}
        </p>
        <p className="text-sm leading-relaxed text-foreground">{report.message}</p>
        {imgUrl && (
          <img src={imgUrl} alt="" className="w-full max-h-32 rounded-xl object-cover border border-border" />
        )}
      </div>

      {/* Votes (fixed) */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">
          {t.communityVotesLabel}
        </p>
        {loading ? (
          <p className="animate-pulse text-xs text-muted-foreground">{t.loadingDetail}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!!voted}
              onClick={() => vote("confirm")}
              className={`rounded-xl border py-3 text-[10px] font-bold uppercase tracking-widest transition disabled:cursor-default ${
                voted === "confirm"
                  ? "border-success bg-success/15 text-success"
                  : voted
                  ? "border-border text-muted-foreground/40"
                  : "border-success/40 bg-success/5 text-success hover:bg-success/15 hover:border-success"
              }`}
            >
              <span className="block text-lg font-extrabold tabular-nums leading-none mb-0.5">
                {localCounts?.confirmed ?? 0}
              </span>
              {t.confirm}{voted === "confirm" && " ✓"}
            </button>
            <button
              type="button"
              disabled={!!voted}
              onClick={() => vote("incorrect")}
              className={`rounded-xl border py-3 text-[10px] font-bold uppercase tracking-widest transition disabled:cursor-default ${
                voted === "incorrect"
                  ? "border-destructive bg-destructive/15 text-destructive"
                  : voted
                  ? "border-border text-muted-foreground/40"
                  : "border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/15 hover:border-destructive"
              }`}
            >
              <span className="block text-lg font-extrabold tabular-nums leading-none mb-0.5">
                {localCounts?.incorrect ?? 0}
              </span>
              {t.incorrect}{voted === "incorrect" && " ✓"}
            </button>
            <button
              type="button"
              disabled={!!voted}
              onClick={() => vote("resolved")}
              className={`rounded-xl border py-3 text-[10px] font-bold uppercase tracking-widest transition disabled:cursor-default ${
                voted === "resolved"
                  ? "border-foreground/50 bg-foreground/10 text-foreground"
                  : voted
                  ? "border-border text-muted-foreground/40"
                  : "border-border text-muted-foreground hover:bg-secondary hover:border-foreground/40"
              }`}
            >
              <span className="block text-lg font-extrabold tabular-nums leading-none mb-0.5">
                {localCounts?.resolved ?? 0}
              </span>
              {t.resolvedV}{voted === "resolved" && " ✓"}
            </button>
          </div>
        )}
      </div>

      {/* Comments list (scrollable) */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-foreground">{t.discussionHd}</p>
        {comments.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">{t.noCommentsYet}</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-secondary/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {c.author_name} · {formatReportTime(c.created_at)}
              </p>
              <p className="mt-1 text-sm text-foreground leading-snug">{c.content}</p>
            </div>
          ))
        )}
      </div>

      {/* Comment form (pinned) */}
      <div className="shrink-0 border-t border-border bg-secondary/30 px-4 py-3">
        <form onSubmit={submitComment} className="flex gap-2">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={2}
            placeholder={t.commentPlaceholder}
            className="flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 text-foreground"
          />
          <button
            type="submit"
            disabled={posting || !commentText.trim()}
            className="shrink-0 rounded-xl bg-accent px-4 text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {posting ? "…" : t.postComment}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Small components ──────────────────────────────────────── */

function ReportRowItem({ report, flash }: { report: Report; flash: boolean }) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORY_META[report.category ?? ""] ?? { emoji: "📌", label: "Other" };

  return (
    <li className={`group border-b border-border/70 last:border-b-0 ${flash ? "bg-accent/5" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left transition hover:bg-secondary/60 sm:px-5"
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-xl"
          title={cat.label}
        >
          {cat.emoji}
        </span>
        <span className="hidden w-20 shrink-0 text-sm font-medium tabular-nums text-muted-foreground sm:inline">
          {formatReportTime(report.created_at)}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-sm font-bold text-foreground">{report.district}</span>
            {report.place && (
              <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">· {report.place}</span>
            )}
            <span className="truncate text-base text-foreground">{report.message}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
            {formatReportTime(report.created_at)}
            {report.place && <span>· {report.place}</span>}
          </span>
        </span>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${sevBadge(report.severity)}`}>
          {report.severity}
        </span>
      </button>

      {open && (
        <div className="border-t border-border/50 bg-secondary/30 px-3 py-3 sm:px-4">
          <p className="text-sm leading-relaxed text-foreground text-pretty">{report.message}</p>
          {report.image_url && (
            <img src={report.image_url} alt="" className="mt-2 w-full max-h-48 rounded-xl object-cover border border-border" />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            📍 {report.place ? `${report.place}, ` : ""}{report.district} · {cat.emoji} {cat.label} · {formatReportTime(report.created_at)}
          </p>
        </div>
      )}
    </li>
  );
}

function ModalReportCard({ report, onClick }: { report: Report; onClick: () => void }) {
  const cat = CATEGORY_META[report.category ?? ""] ?? { emoji: "📌", label: "Other" };
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-secondary/40"
    >
      <span className="mt-0.5 shrink-0 text-lg">{cat.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className={`font-bold ${sevText(report.severity)}`}>{report.severity.toUpperCase()}</span>
          <span>·</span>
          <span>{report.place ?? report.district}</span>
          <span className="ml-auto">{formatReportTime(report.created_at)}</span>
        </div>
        <p className="mt-0.5 text-sm text-foreground leading-snug line-clamp-2">{report.message}</p>
      </div>
    </button>
  );
}

function ModalAlertCard({ alert }: { alert: OfficialAlert }) {
  return (
    <article className={`rounded-xl border-l-2 py-2 pl-3 pr-3 text-xs ${sevBorderL(alert.severity)} ${
      alert.severity === "critical" ? "bg-destructive/5" : alert.severity === "warn" ? "bg-warn/5" : "bg-success/5"
    }`}>
      <div className={`font-semibold ${sevText(alert.severity)}`}>
        {alert.severityLabel} · {alert.disasterType}
      </div>
      <div className="text-muted-foreground">{alert.source}</div>
      {alert.message && <p className="mt-1 text-foreground/80 leading-snug line-clamp-2">{alert.message}</p>}
    </article>
  );
}

function DistrictStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="text-right">
      <div className={`font-display text-xl font-bold tabular-nums leading-none ${color}`}>{value}</div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}
